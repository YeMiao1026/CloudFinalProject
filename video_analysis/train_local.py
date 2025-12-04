import os
import cv2
import re
import numpy as np
import pandas as pd
import mediapipe as mp
import joblib
from urllib.parse import urlparse, parse_qs
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import MultiLabelBinarizer

# ==========================================
# 設定
# ==========================================
CSV_PATH = 'new30.csv'
VIDEO_FOLDER = 'dead lift data'
URL_COL = 'video_url'
LABEL_COL = 'labels'

MIN_SUCCESS_RATIO = 0.20     # 至少 20% 幀成功才算有效影片


# ==========================================
# 解析 YouTube URL → 取得影片 ID
# ==========================================
def parse_youtube_id(url):
    try:
        parsed = urlparse(url)

        if "shorts" in parsed.path:
            return parsed.path.strip("/").split("/")[-1]

        if "watch" in parsed.path:
            query = parse_qs(parsed.query)
            if 'v' in query:
                return query['v'][0]

        print(f"[警告] 無法解析 ID: {url}")
        return None
    except:
        print(f"[錯誤] 無法解析 URL: {url}")
        return None


# ==========================================
# 在資料夾中尋找對應影片
# ==========================================
def find_video_by_id(video_id, folder):
    for fname in os.listdir(folder):
        if not fname.lower().endswith(".mp4"):
            continue
        match = re.search(r"\[(.*?)\]", fname)
        if match and match.group(1) == video_id:
            return os.path.join(folder, fname)
    return None


# ==========================================
# 特徵萃取器（全影片）
# ==========================================
class DeadliftFeatureExtractor:
    def __init__(self):
        self.pose = mp.solutions.pose.Pose(
            static_image_mode=False,
            model_complexity=2,
            min_detection_confidence=0.3,
            min_tracking_confidence=0.3
        )

    def dist(self, a, b):
        return np.sqrt((a[0] - b[0])**2 + (a[1] - b[1])**2)

    def calculate_angle(self, a, b, c):
        a, b, c = np.array(a), np.array(b), np.array(c)
        ba, bc = a - b, c - b
        cos_angle = np.dot(ba, bc) / ((np.linalg.norm(ba) * np.linalg.norm(bc)) + 1e-7)
        return np.degrees(np.arccos(np.clip(cos_angle, -1.0, 1.0)))

    def get_landmarks(self, results):
        if not results.pose_landmarks:
            return None

        lm = results.pose_landmarks.landmark
        return {
            'left_ear': [lm[7].x, lm[7].y],
            'left_shoulder': [lm[11].x, lm[11].y],
            'right_shoulder': [lm[12].x, lm[12].y],
            'left_hip': [lm[23].x, lm[23].y],
            'right_hip': [lm[24].x, lm[24].y],
            'left_knee': [lm[25].x, lm[25].y],
            'right_knee': [lm[26].x, lm[26].y],
            'left_ankle': [lm[27].x, lm[27].y],
            'right_ankle': [lm[28].x, lm[28].y],
            'left_wrist': [lm[15].x, lm[15].y],
            'right_wrist': [lm[16].x, lm[16].y]
        }

    # ======================================
    # 讀取整部影片，不再使用時間區間
    # ======================================
    def extract_features(self, video_path):
        if not os.path.exists(video_path):
            return None, "VideoNotFound"

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return None, "VideoOpenFailed"

        valid_frames = []
        total_frames = 0
        missing_kp = 0
        valid_count = 0

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            total_frames += 1

            try:
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            except:
                return None, "FrameDecodeError"

            results = self.pose.process(rgb)

            if not results.pose_landmarks:
                continue

            lm = self.get_landmarks(results)
            if lm is None:
                missing_kp += 1
                continue

            valid_count += 1

            shoulder_c = np.mean([lm['left_shoulder'], lm['right_shoulder']], axis=0)
            hip_c = np.mean([lm['left_hip'], lm['right_hip']], axis=0)
            knee_c = np.mean([lm['left_knee'], lm['right_knee']], axis=0)
            ankle_c = np.mean([lm['left_ankle'], lm['right_ankle']], axis=0)
            wrist_c = np.mean([lm['left_wrist'], lm['right_wrist']], axis=0)

            spine_angle = self.calculate_angle(lm['left_ear'], shoulder_c, hip_c)
            hip_angle = self.calculate_angle(shoulder_c, hip_c, knee_c)
            knee_angle = self.calculate_angle(hip_c, knee_c, ankle_c)
            torso_angle = self.calculate_angle([hip_c[0], hip_c[1] - 0.5], hip_c, shoulder_c)

            head_shoulder_dist = self.dist(lm['left_ear'], shoulder_c)
            shoulder_hip_dist = self.dist(shoulder_c, hip_c)

            vec_sh_hip = shoulder_c - hip_c
            vec_hip_knee = hip_c - knee_c
            vec_ear_sh = lm['left_ear'] - shoulder_c
            vec_wrist_ankle = wrist_c - ankle_c

            features = [
                spine_angle, hip_angle, knee_angle, torso_angle,
                head_shoulder_dist, shoulder_hip_dist,
                vec_sh_hip[0], vec_sh_hip[1],
                vec_hip_knee[0], vec_hip_knee[1],
                vec_ear_sh[0], vec_ear_sh[1],
                vec_wrist_ankle[0], vec_wrist_ankle[1]
            ]

            valid_frames.append(features)

        cap.release()

        if total_frames == 0:
            return None, "NoFrames"

        if valid_count == 0:
            return None, "NoPoseDetected"

        success_ratio = valid_count / total_frames
        if success_ratio < MIN_SUCCESS_RATIO:
            return None, f"LowSuccessRatio({success_ratio:.2f})"

        data = np.array(valid_frames)
        return np.concatenate([
            np.mean(data, axis=0),
            np.max(data, axis=0),
            np.min(data, axis=0),
            np.std(data, axis=0)
        ]), "Success"


# ==========================================
# 訓練主程式
# ==========================================
if __name__ == "__main__":
    df = pd.read_csv(CSV_PATH)
    extractor = DeadliftFeatureExtractor()

    X, y_raw = [], []

    for idx, row in df.iterrows():
        vid = parse_youtube_id(row[URL_COL])
        print(f"\n[{idx+1}/{len(df)}] ID = {vid}")

        if not vid:
            continue

        video_path = find_video_by_id(vid, VIDEO_FOLDER)
        if not video_path:
            print(f" ✖ 找不到影片：{vid}")
            continue

        print(f" ➤ 使用影片：{video_path}")

        feats, reason = extractor.extract_features(video_path)
        if feats is None:
            print(f" ✖ 特徵提取失敗，原因 = {reason}")
            continue

        X.append(feats)
        y_raw.append(row[LABEL_COL])

    if len(X) == 0:
        print("\n❌ 無資料可訓練模型")
        exit()

    X = np.array(X)
    labels_split = [str(l).split(';') for l in y_raw]

    mlb = MultiLabelBinarizer()
    y = mlb.fit_transform(labels_split)

    clf = RandomForestClassifier(
        n_estimators=300,
        max_depth=15,
        class_weight='balanced_subsample',
        random_state=42
    )

    clf.fit(X, y)

    joblib.dump(clf, "deadlift_rf_model.pkl")
    joblib.dump(mlb, "label_binarizer.pkl")
    print("\n成功提取資料筆數：", len(X))
    print("\n🎉 模型成功訓練完成！")
