from fastapi import FastAPI
from fastapi.requests import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional
import numpy as np
from io import BytesIO
from PIL import Image
import mediapipe as mp
import os
from collections import deque

app = FastAPI(title="Pose Detection API (Back Angle with Spine Offset + ML Prediction)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

mp_pose = mp.solutions.pose
# lazy initialize MediaPipe Pose to avoid loading binary resources at import time
pose = None

# =====================================
# 🤖 ML 模型載入（延遲載入）
# =====================================
clf = None
mlb = None
ML_MODEL_LOADED = False

def init_ml_model():
    """延遲載入 ML 模型"""
    global clf, mlb, ML_MODEL_LOADED
    if ML_MODEL_LOADED:
        return True
    
    try:
        import joblib
        # 嘗試多個可能的路徑
        possible_paths = [
            "deadlift_rf_model.pkl",  # 同目錄
            "../video_analysis/deadlift_rf_model.pkl",  # 相對路徑
            "/app/video_analysis/deadlift_rf_model.pkl",  # Docker 路徑
            os.path.join(os.path.dirname(__file__), "deadlift_rf_model.pkl"),
        ]
        
        model_path = None
        for path in possible_paths:
            if os.path.exists(path):
                model_path = path
                break
        
        if model_path is None:
            print("⚠️ ML model not found, /predict will be unavailable")
            return False
        
        clf = joblib.load(model_path)
        mlb = joblib.load(model_path.replace("deadlift_rf_model.pkl", "label_binarizer.pkl"))
        ML_MODEL_LOADED = True
        print(f"✅ ML model loaded from {model_path}")
        return True
    except Exception as e:
        print(f"⚠️ Failed to load ML model: {e}")
        return False

# 每位使用者的 frame window
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
    session_id: str
    landmarks: List[Landmark]

# =====================================
# ML 特徵萃取器
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


def init_pose():
    global pose
    if pose is None:
        try:
            pose = mp_pose.Pose(
                static_image_mode=False,
                model_complexity=2,
                enable_segmentation=False,
                smooth_landmarks=True,
                min_detection_confidence=0.6,
                min_tracking_confidence=0.6,
            )
        except Exception as e:
            # raise a clearer error for the caller to handle
            raise RuntimeError(f"Failed to initialize MediaPipe Pose: {e}")

# ======== 平滑處理 ========
ema_state = {"knee": None, "hip": None, "back": None}
ALPHA = 0.4

def ema(key, value):
    if value is None:
        return None
    prev = ema_state.get(key)
    ema_state[key] = value if prev is None else (ALPHA * value + (1 - ALPHA) * prev)
    return ema_state[key]


# ======== 幾何工具 ========
def calc_angle(a, b, c):
    """計算三點夾角 (b為中心)"""
    a, b, c = np.array(a), np.array(b), np.array(c)
    ba, bc = a - b, c - b
    cosine = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-6)
    return float(np.degrees(np.arccos(np.clip(cosine, -1.0, 1.0))))


def feedback_rule(knee, hip, back):
    """根據角度給回饋"""
    if back < 140:
        return "⚠️ 背部彎曲過大，請挺直背部", "warn"
    if hip + 15 < knee:
        return "⚠️ 注意：過早伸髖（臀部抬起太快）", "warn"
    if knee < 80:
        return "⚠️ 伸膝過多，請再降低身體", "warn"
    return "✅ 動作良好，保持穩定節奏", "ok"


@app.get("/api/ping")
def ping():
    return {"ok": True}


try:
    import multipart  # type: ignore
    HAVE_MULTIPART = True
except Exception:
    HAVE_MULTIPART = False


def _build_error_response(msg: str):
    return JSONResponse({"success": False, "error": msg})


def _process_frame_and_respond(frame: np.ndarray, w: int, h: int):
    results = pose.process(frame)
    if not results.pose_landmarks:
        return JSONResponse({"success": False, "message": "No person detected"})

    lm = results.pose_landmarks.landmark

    def xy(i):
        return [lm[i].x * w, lm[i].y * h]

    def xy01(i):
        return {"id": i, "x": float(lm[i].x), "y": float(lm[i].y), "score": float(lm[i].visibility)}

    # --- 抓取主要關節 ---
    L_SH, R_SH = xy(mp_pose.PoseLandmark.LEFT_SHOULDER.value), xy(mp_pose.PoseLandmark.RIGHT_SHOULDER.value)
    L_HIP, R_HIP = xy(mp_pose.PoseLandmark.LEFT_HIP.value), xy(mp_pose.PoseLandmark.RIGHT_HIP.value)
    L_KNEE, R_KNEE = xy(mp_pose.PoseLandmark.LEFT_KNEE.value), xy(mp_pose.PoseLandmark.RIGHT_KNEE.value)
    L_ANK, R_ANK = xy(mp_pose.PoseLandmark.LEFT_ANKLE.value), xy(mp_pose.PoseLandmark.RIGHT_ANKLE.value)

    # === 角度計算 ===
    knee = (calc_angle(L_HIP, L_KNEE, L_ANK) + calc_angle(R_HIP, R_KNEE, R_ANK)) / 2
    hip = (calc_angle(L_SH, L_HIP, L_KNEE) + calc_angle(R_SH, R_HIP, R_KNEE)) / 2

    # === 背部角度（肩中心 → 脊椎控制點 → 臀中心）===
    shoulder_center = [(L_SH[0] + R_SH[0]) / 2, (L_SH[1] + R_SH[1]) / 2]
    hip_center = [(L_HIP[0] + R_HIP[0]) / 2, (L_HIP[1] + R_HIP[1]) / 2]

    # 模擬胸口（spine_center） - 偏移肩臀軸方向
    dx = hip_center[0] - shoulder_center[0]
    dy = hip_center[1] - shoulder_center[1]
    spine_center = [
        shoulder_center[0] + dx * 0.4,  # 接近腰部
        shoulder_center[1] + dy * 0.4 - (abs(dx) * 0.15),  # 稍微向前（根據x差）
    ]

    back = calc_angle(shoulder_center, spine_center, hip_center)

    # === 平滑化 ===
    knee_s = int(round(ema("knee", knee)))
    hip_s = int(round(ema("hip", hip)))
    back_s = int(round(ema("back", back)))

    fb_text, fb_level = feedback_rule(knee_s, hip_s, back_s)
    keypoints = [xy01(i) for i in range(len(lm))]

    # === 新增控制點 ===
    keypoints.extend([
        {"id": 101, "x": shoulder_center[0] / w, "y": shoulder_center[1] / h, "score": 1.0},
        {"id": 102, "x": spine_center[0] / w, "y": spine_center[1] / h, "score": 1.0},
        {"id": 103, "x": hip_center[0] / w, "y": hip_center[1] / h, "score": 1.0},
    ])

    return {
        "success": True,
        "angles": {"knee": knee_s, "hip": hip_s, "back": back_s},
        "keypoints": keypoints,
        "feedback": {"text": fb_text, "level": fb_level}
    }


if HAVE_MULTIPART:
    from fastapi import UploadFile

    @app.post("/api/pose")
    async def detect_pose(file: UploadFile):
        try:
            img = Image.open(BytesIO(await file.read())).convert("RGB")
            frame = np.array(img)
            h, w, _ = frame.shape

            try:
                init_pose()
            except RuntimeError as e:
                return JSONResponse({"success": False, "error": str(e)})

            return _process_frame_and_respond(frame, w, h)
        except Exception as e:
            return JSONResponse({"success": False, "error": str(e)})
else:
    @app.post("/api/pose")
    async def detect_pose_unavailable(request: Request):
        return _build_error_response("python-multipart is not installed. Install with: pip install python-multipart")


# ================================================================
# 🤖 ML 預測端點：30 幀滑動窗口 + Random Forest 分類
# ================================================================
@app.post("/predict")
def predict(data: FrameData):
    """
    接收前端 MediaPipe 33 landmarks，累積 30 幀後進行 ML 推論
    回傳格式：
    - A: 偵測到的姿勢問題標籤列表
    - D: 是否成功
    - E: 錯誤訊息（如有）
    """
    # 嘗試載入 ML 模型
    if not init_ml_model():
        return {"A": [], "D": False, "E": "MLModelNotLoaded"}
    
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
            ])
            for key, idx in required_idx.items()
        }
    except Exception:
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
