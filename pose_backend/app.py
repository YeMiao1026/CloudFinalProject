from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import numpy as np
from io import BytesIO
from PIL import Image
import mediapipe as mp

app = FastAPI(title="Pose Detection API (Back Angle with Spine Offset)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

mp_pose = mp.solutions.pose
pose = mp_pose.Pose(
    static_image_mode=False,
    model_complexity=2,
    enable_segmentation=False,
    smooth_landmarks=True,
    min_detection_confidence=0.6,
    min_tracking_confidence=0.6,
)

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


@app.post("/api/pose")
async def detect_pose(file: UploadFile):
    try:
        img = Image.open(BytesIO(await file.read())).convert("RGB")
        frame = np.array(img)
        h, w, _ = frame.shape

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

    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)})
