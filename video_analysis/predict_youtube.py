import os
import cv2
import numpy as np
import mediapipe as mp
import joblib
import warnings
import yt_dlp
import threading
import time
import tkinter as tk
from tkinter import ttk, messagebox
from collections import deque
from datetime import timedelta

# ==========================================
# 0. 基礎設定
# ==========================================
warnings.filterwarnings("ignore", category=UserWarning, module='google.protobuf')
MODEL_PATH = 'deadlift_rf_model.pkl'
LABEL_BINARIZER_PATH = 'label_binarizer.pkl'
TEMP_VIDEO_PATH = 'temp_video_analysis.mp4'

# ==========================================
# 1. 特徵萃取邏輯 (保持不變)
# ==========================================
class DeadliftFeatureExtractor:
    def __init__(self): 
        self.pose = mp.solutions.pose.Pose(
            static_image_mode=False, model_complexity=1,
            min_detection_confidence=0.5, min_tracking_confidence=0.5
        )

    def dist(self, a, b):
        return np.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2)

    def calculate_angle(self, a, b, c):
        a, b, c = np.array(a), np.array(b), np.array(c)
        ba, bc = a - b, c - b
        cos_angle = np.dot(ba, bc) / ((np.linalg.norm(ba) * np.linalg.norm(bc)) + 1e-7)
        return np.degrees(np.arccos(np.clip(cos_angle, -1.0, 1.0)))

    def get_landmarks(self, results):
        if not results.pose_landmarks: return None
        lm = results.pose_landmarks.landmark
        return {
            'left_ear': [lm[7].x, lm[7].y], 'right_ear': [lm[8].x, lm[8].y],
            'left_shoulder': [lm[11].x, lm[11].y], 'right_shoulder': [lm[12].x, lm[12].y],
            'left_hip': [lm[23].x, lm[23].y], 'right_hip': [lm[24].x, lm[24].y],
            'left_knee': [lm[25].x, lm[25].y], 'right_knee': [lm[26].x, lm[26].y],
            'left_ankle': [lm[27].x, lm[27].y], 'right_ankle': [lm[28].x, lm[28].y],
            'left_wrist': [lm[15].x, lm[15].y], 'right_wrist': [lm[16].x, lm[16].y]
        }

    def extract_frame_features(self, lm):
        # 計算單一幀的特徵 (不進行聚合)
        shoulder_c = np.mean([lm['left_shoulder'], lm['right_shoulder']], axis=0)
        hip_c = np.mean([lm['left_hip'], lm['right_hip']], axis=0)
        knee_c = np.mean([lm['left_knee'], lm['right_knee']], axis=0)
        ankle_c = np.mean([lm['left_ankle'], lm['right_ankle']], axis=0)
        wrist_c = np.mean([lm['left_wrist'], lm['right_wrist']], axis=0)

        spine_angle = self.calculate_angle(lm['left_ear'], shoulder_c, hip_c)
        hip_angle = self.calculate_angle(shoulder_c, hip_c, knee_c)
        knee_angle = self.calculate_angle(hip_c, knee_c, ankle_c)
        torso_angle = self.calculate_angle([hip_c[0], hip_c[1]-0.5], hip_c, shoulder_c)
        
        head_shoulder_dist = self.dist(lm['left_ear'], shoulder_c)
        shoulder_hip_dist = self.dist(shoulder_c, hip_c)
        
        vec_sh_hip = shoulder_c - hip_c
        vec_hip_knee = hip_c - knee_c
        vec_ear_sh = lm['left_ear'] - shoulder_c
        vec_wrist_ankle = wrist_c - ankle_c

        return [
            spine_angle, hip_angle, knee_angle, torso_angle,
            head_shoulder_dist, shoulder_hip_dist,
            vec_sh_hip[0], vec_sh_hip[1],
            vec_hip_knee[0], vec_hip_knee[1],
            vec_ear_sh[0], vec_ear_sh[1],
            vec_wrist_ankle[0], vec_wrist_ankle[1]
        ]

# ==========================================
# 2. GUI 應用程式
# ==========================================
class DeadliftApp:
    def __init__(self, root):
        self.root = root
        self.root.title("🏋️ AI 硬舉即時分析系統")
        self.root.geometry("800x600")
        
        # 載入模型
        self.model = None
        self.mlb = None
        self.load_model()

        # 介面佈局
        self.create_widgets()

    def create_widgets(self):
        # 標題
        tk.Label(self.root, text="YouTube 硬舉逐步診斷", font=("微軟正黑體", 16, "bold")).pack(pady=10)

        # 輸入區
        input_frame = tk.Frame(self.root)
        input_frame.pack(pady=5, padx=20, fill="x")
        
        tk.Label(input_frame, text="影片網址:", font=("微軟正黑體", 10)).pack(anchor="w")
        self.url_entry = tk.Entry(input_frame, font=("Arial", 10))
        self.url_entry.pack(fill="x", pady=5)
        
        self.show_video_var = tk.BooleanVar(value=True)
        tk.Checkbutton(input_frame, text="同步顯示骨架分析畫面", variable=self.show_video_var, font=("微軟正黑體", 9)).pack(anchor="w")

        # 按鈕
        self.btn_analyze = tk.Button(self.root, text="🚀 開始即時分析", font=("微軟正黑體", 12), bg="#4CAF50", fg="white", command=self.start_thread)
        self.btn_analyze.pack(pady=10, ipadx=20)

        # 狀態列
        self.status_label = tk.Label(self.root, text="準備就緒", fg="gray", font=("微軟正黑體", 10))
        self.status_label.pack()

        # --- 結果顯示區 (Treeview 表格) ---
        result_frame = tk.LabelFrame(self.root, text="📊 逐步診斷日誌", font=("微軟正黑體", 11), padx=10, pady=10)
        result_frame.pack(padx=20, pady=10, fill="both", expand=True)

        columns = ("time", "error")
        self.tree = ttk.Treeview(result_frame, columns=columns, show="headings")
        self.tree.heading("time", text="時間點")
        self.tree.heading("error", text="偵測到的問題")
        self.tree.column("time", width=100, anchor="center")
        self.tree.column("error", width=500, anchor="w")
        
        # 滾動條
        scrollbar = ttk.Scrollbar(result_frame, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)
        
        self.tree.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

    def load_model(self):
        try:
            if os.path.exists(MODEL_PATH) and os.path.exists(LABEL_BINARIZER_PATH):
                self.model = joblib.load(MODEL_PATH)
                self.mlb = joblib.load(LABEL_BINARIZER_PATH)
            else:
                messagebox.showerror("錯誤", "找不到模型檔案！請確認 .pkl 檔案是否存在。")
        except Exception as e:
            messagebox.showerror("錯誤", f"載入模型失敗: {e}")

    def start_thread(self):
        url = self.url_entry.get().strip()
        if not url: return
        if not self.model: return

        self.btn_analyze.config(state="disabled", text="分析進行中...")
        # 清空表格
        for item in self.tree.get_children():
            self.tree.delete(item)
            
        thread = threading.Thread(target=self.run_analysis, args=(url,))
        thread.daemon = True
        thread.start()

    def add_log(self, timestamp_sec, error_msg):
        # 將秒數轉為 00:00 格式
        time_str = str(timedelta(seconds=int(timestamp_sec)))
        if time_str.startswith("0:"): time_str = time_str[2:] # 去掉前面的 0:
        
        # 插入表格最上方
        self.tree.insert("", 0, values=(time_str, error_msg))

    def run_analysis(self, url):
        try:
            # 1. 下載
            self.update_status("📥 正在下載影片...", "blue")
            if os.path.exists(TEMP_VIDEO_PATH): os.remove(TEMP_VIDEO_PATH)
            ydl_opts = {'format': 'best[ext=mp4]/best', 'outtmpl': TEMP_VIDEO_PATH, 'quiet': True}
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])

            # 2. 準備分析
            self.update_status("👀 正在分析中...", "green")
            cap = cv2.VideoCapture(TEMP_VIDEO_PATH)
            fps = cap.get(cv2.CAP_PROP_FPS)
            extractor = DeadliftFeatureExtractor()
            mp_drawing = mp.solutions.drawing_utils

            # 滑動視窗 (30 frames)
            window = deque(maxlen=30)
            
            # 冷卻機制 (避免同一秒內重複刷同樣的錯誤)
            last_error_time = {} # { "錯誤名稱": 上次出現的秒數 }
            COOLDOWN_SECONDS = 1.5 # 相同錯誤至少間隔 1.5 秒才顯示一次

            while cap.isOpened():
                ret, frame = cap.read()
                if not ret: break

                current_sec = cap.get(cv2.CAP_PROP_POS_FRAMES) / fps
                
                # 影像處理
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = extractor.pose.process(rgb)
                
                # 繪製骨架
                if self.show_video_var.get():
                    if results.pose_landmarks:
                        mp_drawing.draw_landmarks(frame, results.pose_landmarks, mp.solutions.pose.POSE_CONNECTIONS)
                    
                    # 在畫面上顯示時間
                    cv2.putText(frame, f"Time: {current_sec:.1f}s", (10, 30), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                    
                    cv2.imshow('Analysis Preview', cv2.resize(frame, (0, 0), fx=0.6, fy=0.6))
                    if cv2.waitKey(1) & 0xFF == ord('q'): break

                # 特徵計算與預測
                if results.pose_landmarks:
                    lm = extractor.get_landmarks(results)
                    if lm:
                        feats = extractor.extract_frame_features(lm)
                        window.append(feats)

                        # 每當累積滿 30 幀 (約1秒)，進行一次診斷
                        if len(window) == 30:
                            data = np.array(window)
                            # 聚合特徵
                            input_vec = np.concatenate([
                                np.mean(data, axis=0), np.max(data, axis=0),
                                np.min(data, axis=0), np.std(data, axis=0)
                            ]).reshape(1, -1)
                            
                            # 預測
                            pred = self.model.predict(input_vec)
                            labels = self.mlb.inverse_transform(pred)[0]

                            # 處理偵測結果
                            for label in labels:
                                if label != "正確動作":
                                    # 檢查冷卻時間
                                    last_time = last_error_time.get(label, -999)
                                    if current_sec - last_time > COOLDOWN_SECONDS:
                                        # 顯示在 GUI
                                        self.root.after(0, self.add_log, current_sec, f"⚠️ {label}")
                                        last_error_time[label] = current_sec

            cap.release()
            cv2.destroyAllWindows()
            self.update_status("✅ 分析完成", "black")

        except Exception as e:
            self.update_status(f"❌ 錯誤: {e}", "red")
        finally:
            self.root.after(0, lambda: self.btn_analyze.config(state="normal", text="🚀 開始即時分析"))

    def update_status(self, text, color):
        self.status_label.config(text=text, fg=color)

if __name__ == "__main__":
    root = tk.Tk()
    app = DeadliftApp(root)
    root.mainloop()