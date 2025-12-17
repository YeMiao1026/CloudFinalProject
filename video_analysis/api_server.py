from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import numpy as np
import joblib
from collections import deque

# =====================================
# 讀取模型
# =====================================
clf = joblib.load("deadlift_rf_model.pkl")
mlb = joblib.load("label_binarizer.pkl")
# =====================================
# 定義 FastAPI
# =====================================
app = FastAPI(title="Deadlift Posture Analysis API")

# 設定 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 每位使用者（以 session_id 區隔）擁有自己的 frame window
# 每位使用者（以 session_id 區隔）擁有自己的 frame window
user_windows = {}

# =====================================
# 輸入格式（前端 Mediapipe 33 個 landmarks）
# =====================================
class Landmark(BaseModel):
    x: float
    y: float
    z: float
    visibility: Optional[float] = 1.0

class FrameData(BaseModel):
    session_id: str         # 前端提供，避免多使用者混淆
    landmarks: List[Landmark]


# =====================================
# 特徵萃取器（完全照你訓練程式）
# =====================================
class DeadliftFeatureExtractor:
    def dist(self, a, b):
        return np.sqrt((a[0] - b[0])**2 + (a[1] - b[1])**2)

    def calculate_angle(self, a, b, c):
        a, b, c = np.array(a), np.array(b), np.array(c)
        ba, bc = a - b, c - b
        cos_angle = np.dot(ba, bc) / ((np.linalg.norm(ba)*np.linalg.norm(bc)) + 1e-7)
        return np.degrees(np.arccos(np.clip(cos_angle, -1.0, 1.0)))

    def extract_frame_features(self, lm):
        # landmark dict: {11, 12, 23, 24, ...}
        shoulder_c = np.mean([lm['left_shoulder'], lm['right_shoulder']], axis=0)
        hip_c = np.mean([lm['left_hip'], lm['right_hip']], axis=0)
        knee_c = np.mean([lm['left_knee'], lm['right_knee']], axis=0)
        ankle_c = np.mean([lm['left_ankle'], lm['right_ankle']], axis=0)
        wrist_c = np.mean([lm['left_wrist'], lm['right_wrist']], axis=0)

        torso_len = self.dist(shoulder_c, hip_c)
        if torso_len == 0: torso_len = 1.0

        spine_angle = self.calculate_angle(lm['left_ear'], shoulder_c, hip_c)
        hip_angle = self.calculate_angle(shoulder_c, hip_c, knee_c)
        knee_angle = self.calculate_angle(hip_c, knee_c, ankle_c)
        # 修正：確保輸入維度一致 (2D)，與訓練時保持一致
        torso_angle = self.calculate_angle([hip_c[0], hip_c[1]-0.5], hip_c, shoulder_c)

        head_shoulder_ratio = self.dist(lm['left_ear'], shoulder_c) / torso_len

        vec_sh_hip = (shoulder_c - hip_c) / torso_len
        vec_hip_knee = (hip_c - knee_c) / torso_len
        vec_ear_sh = (lm['left_ear'] - shoulder_c) / torso_len
        vec_wrist_ankle = (wrist_c - ankle_c) / torso_len

        return [
            spine_angle, hip_angle, knee_angle, torso_angle,
            head_shoulder_ratio,
            0.0,
            vec_sh_hip[0], vec_sh_hip[1],
            vec_hip_knee[0], vec_hip_knee[1],
            vec_ear_sh[0], vec_ear_sh[1],
            vec_wrist_ankle[0], vec_wrist_ankle[1]
        ]


extractor = DeadliftFeatureExtractor()


# ================================================================
# API：單幀推論端點（自動累積到 30 幀才進行推論）
# ================================================================
@app.post("/predict")
def predict(data: FrameData):
    session = data.session_id

    # 初始化 window
    if session not in user_windows:
        user_windows[session] = deque(maxlen=30)

    # Mediapipe 33 landmark → 取出所需 index
    required_idx = {
        "left_ear": 7,
        "left_shoulder": 11, "right_shoulder": 12,
        "left_hip": 23, "right_hip": 24,
        "left_knee": 25, "right_knee": 26,
        "left_ankle": 27, "right_ankle": 28,
        "left_wrist": 15, "right_wrist": 16
    }

    try:
        lm = {
            key: np.array([
                data.landmarks[idx].x,
                data.landmarks[idx].y,
                # data.landmarks[idx].z, # 移除 Z 軸，因為訓練時只用了 2D
            ])
            for key, idx in required_idx.items()
        }
    except:
        return {"A": [], "D": False, "E": "LandmarkMissing"}

    # 抽取單一 frame 特徵
    feats = extractor.extract_frame_features(lm)
    user_windows[session].append(feats)

    # 如果未滿 30 幀 → 無法預測
    if len(user_windows[session]) < 30:
        return {"A": [], "D": True, "E": "InsufficientFrames"}

    # ========================
    # 聚合特徵（與訓練一致）
    # ========================
    window = np.array(user_windows[session])
    input_vec = np.concatenate([
        np.mean(window, axis=0),
        np.max(window, axis=0),
        np.min(window, axis=0),
        np.std(window, axis=0)
    ]).reshape(1, -1)

    # 模型推論
    pred = clf.predict(input_vec)
    labels = mlb.inverse_transform(pred)[0]

    # ------------------------
    # 回傳 A / D / E
    # ------------------------
    return {
        "A": list(labels),
        "D": True,
        "E": None
    }
