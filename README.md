# 🏋️ AI Deadlift Coach - 智慧硬舉姿勢分析系統

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-19.1-61dafb.svg?logo=react)
![FastAPI](https://img.shields.io/badge/FastAPI-0.124-009688.svg?logo=fastapi)
![MediaPipe](https://img.shields.io/badge/MediaPipe-0.10.14-4285F4.svg?logo=google)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg?logo=docker)

**即時 AI 姿勢分析 | 運動醫學級圓背偵測 | 雲端部署就緒**

[English](#english) | [繁體中文](#繁體中文)

</div>

---

## 繁體中文

### 📖 專案簡介

本專案是一個**即時硬舉姿勢分析系統**，結合電腦視覺與機器學習技術，透過網頁攝影機即時偵測使用者的硬舉動作，並提供：

- 🎯 **即時骨架追蹤**：使用 MediaPipe Pose 進行 33 個人體關鍵點偵測
- 🏥 **運動醫學級圓背偵測**：基於脊椎曲率角度的專業圓背警告系統
- 📊 **量化分析儀表板**：即時顯示膝蓋角度、髖部角度、脊椎曲率
- 🔊 **多層級警告系統**：視覺警告 + 音效提醒，避免運動傷害
- 🤖 **機器學習姿勢分類**：Random Forest 模型分析 30 幀動作序列

### ✨ 核心功能

#### 1. 即時姿勢追蹤
```
攝影機影像 → MediaPipe Pose → 33 關鍵點 → 骨架可視化
```

#### 2. 運動醫學級圓背偵測演算法
```javascript
// 脊椎曲率 = 上段向量(肩→頭) 與 下段向量(髖→肩) 的夾角
// 0° = 脊椎直線（安全）| 角度越大 = 圓背越嚴重

閾值設定：
  ≤ 10°  → ✅ 安全（脊椎中立）
  10-20° → ⚠️ 警告（輕微彎曲）
  20-30° → 🔴 危險（圓背風險）
  > 30°  → 🚨 嚴重（立即停止）
```

#### 3. 時間穩定機制
- 避免單幀誤判導致警告閃爍
- 需連續 10 幀超過閾值才觸發警告
- 角度低通濾波平滑處理

#### 4. 機器學習姿勢分類
- 訓練資料：YouTube 硬舉影片標註
- 特徵：關節角度、向量比例、時序統計
- 模型：Random Forest 多標籤分類器

### 🏗️ 系統架構

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React + Vite)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Webcam     │→ │  MediaPipe  │→ │  Spine Curvature        │  │
│  │  Capture    │  │  Pose       │  │  Detection (Client-side)│  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│         ↓                                      ↓                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Real-time UI Dashboard                          ││
│  │  • Skeleton Visualization  • Angle Cards  • Danger Alerts   ││
│  └─────────────────────────────────────────────────────────────┘│
└───────────────────────────────┬─────────────────────────────────┘
                                │ API (landmarks JSON)
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                     Backend (FastAPI + ML)                       │
│  ┌─────────────────┐    ┌─────────────────────────────────────┐ │
│  │  /api/pose      │    │  /predict (video_analysis)          │ │
│  │  Single frame   │    │  30-frame window → RF Model         │ │
│  │  angle feedback │    │  Multi-label classification         │ │
│  └─────────────────┘    └─────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 📁 專案結構

```
CloudFinalProject/
├── 📄 README.md                 # 專案說明文件
├── 📄 docker-compose.yml        # Docker 開發環境配置
├── 📄 render.yaml               # Render 雲端部署配置
├── 📄 requirements.txt          # Python 依賴（根目錄備份）
│
├── 📁 ui/                       # 前端應用程式
│   ├── src/
│   │   ├── main.jsx             # React 入口
│   │   ├── LandingPage.jsx      # 首頁（打字動畫）
│   │   ├── DeadliftCoachApp.jsx # 主應用（核心邏輯）
│   │   ├── DeadliftCoach.css    # 樣式表
│   │   └── logic/               # 姿勢邏輯模組
│   ├── public/mediapipe/        # MediaPipe WASM 資源
│   ├── Dockerfile               # Production 建置（nginx）
│   ├── Dockerfile.dev           # Development 建置（Vite）
│   └── package.json             # Node.js 依賴
│
├── 📁 pose_backend/             # 後端 API 服務
│   ├── app.py                   # FastAPI 主程式
│   ├── Dockerfile               # 後端容器配置
│   ├── requirements.txt         # Python 依賴
│   └── pyproject.toml           # Poetry 配置
│
├── 📁 video_analysis/           # 機器學習模組
│   ├── train_local.py           # 訓練腳本
│   ├── api_server.py            # ML 推論 API
│   ├── deadlift_rf_model.pkl    # 訓練好的 RF 模型
│   └── label_binarizer.pkl      # 標籤編碼器
│
├── 📁 data/                     # 訓練資料
│   ├── raw_videos/              # 原始影片
│   ├── cleaned_videos/          # 處理後影片
│   └── labels/                  # 標註檔案
│
└── 📁 presentation/             # 簡報資料
    ├── MVP-demo/
    └── Final-demo/
```

### 🚀 快速開始

#### 前置需求
- **Python** >= 3.10
- **Node.js** >= 20.x
- **Docker** (可選，用於容器化部署)

#### 方法一：Docker Compose（推薦）

```bash
# 克隆專案
git clone https://github.com/YeMiao1026/CloudFinalProject.git
cd CloudFinalProject

# 啟動服務
docker-compose up --build

# 訪問應用
# Frontend: http://localhost:5173
# Backend:  http://localhost:8000
```

#### 方法二：本地開發

**後端啟動：**
```powershell
cd pose_backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

**前端啟動：**
```powershell
cd ui
npm ci
npm run dev -- --host 0.0.0.0
# 訪問 http://localhost:5173
```

**ML API 啟動（可選）：**
```powershell
cd video_analysis
uvicorn api_server:app --port 8001
```

### 🔧 API 端點

| 端點 | 方法 | 說明 |
|------|------|------|
| `/api/ping` | GET | 健康檢查 |
| `/api/pose` | POST | 單幀姿勢分析（圖片上傳） |
| `/predict` | POST | 30 幀序列 ML 分類（video_analysis） |

### 🖥️ 技術棧

| 層級 | 技術 |
|------|------|
| **Frontend** | React 19, Vite, MediaPipe Pose, Web Audio API |
| **Backend** | FastAPI, MediaPipe, NumPy, OpenCV |
| **ML** | scikit-learn (Random Forest), joblib |
| **DevOps** | Docker, Docker Compose, nginx |
| **Cloud** | Render (PaaS) |

### 📊 演算法說明

#### 脊椎曲率計算

```python
# 上段脊椎向量：mid_shoulder → nose
upper_spine = normalize(nose - mid_shoulder)

# 下段脊椎向量：mid_hip → mid_shoulder
lower_spine = normalize(mid_shoulder - mid_hip)

# 脊椎曲率角度（兩向量夾角）
curvature = arccos(dot(upper_spine, lower_spine))
# 0° = 直線 | 角度越大 = 圓背越嚴重
```

#### 為什麼這個方法有效？

傳統方法常把「正確的髖鉸鏈前傾」誤判為圓背。本演算法只計算**脊椎本身的彎曲程度**，不受身體前傾影響：

| 情境 | 髖部前傾角度 | 脊椎曲率 | 判定 |
|------|-------------|---------|------|
| 正確硬舉（髖鉸鏈） | 60° | 5° | ✅ 安全 |
| 錯誤硬舉（圓背） | 60° | 35° | 🔴 危險 |

### ☁️ 雲端部署

#### Render 部署

1. Fork 本專案到你的 GitHub
2. 在 Render Dashboard 建立服務
3. 連結 GitHub repository
4. 使用 `render.yaml` 自動配置

#### 環境變數

```env
# Frontend
VITE_API_BASE=https://your-backend-url.onrender.com

# Backend
PORT=8000
PYTHONUNBUFFERED=1
```

### 📝 注意事項

- **MediaPipe 資源**：首次載入會下載約 5MB 的 WASM 模組
- **瀏覽器相容性**：需支援 WebGL 2.0（現代瀏覽器皆支援）
- **攝影機權限**：需允許網頁存取攝影機
- **容器記憶體**：後端建議至少 512MB RAM

### 🤝 貢獻指南

1. Fork 本專案
2. 建立功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交變更 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 開啟 Pull Request

### 📄 授權

本專案採用 MIT 授權條款 - 詳見 [LICENSE](LICENSE) 檔案

---

## English

### 📖 Project Overview

This project is a **Real-time Deadlift Posture Analysis System** that combines computer vision and machine learning to provide instant feedback on deadlift form through a webcam.

### Key Features

- 🎯 **Real-time Skeleton Tracking**: MediaPipe Pose with 33 body landmarks
- 🏥 **Medical-grade Rounded Back Detection**: Spine curvature angle-based warning system
- 📊 **Quantitative Dashboard**: Real-time knee angle, hip angle, spine curvature display
- 🔊 **Multi-level Alert System**: Visual warnings + audio alerts to prevent injuries
- 🤖 **ML Posture Classification**: Random Forest model analyzing 30-frame action sequences

### Quick Start

```bash
# Using Docker Compose
docker-compose up --build

# Access the app
# Frontend: http://localhost:5173
# Backend:  http://localhost:8000
```

### Tech Stack

- **Frontend**: React 19, Vite, MediaPipe Pose
- **Backend**: FastAPI, MediaPipe, NumPy
- **ML**: scikit-learn (Random Forest)
- **DevOps**: Docker, nginx, Render

---

<div align="center">

**Made with ❤️ at National Taiwan University of Science and Technology**

Cloud Computing Final Project - 2024

</div>

<!-- AUTO_COMMIT_TRACK_START -->

## 自動提交紀錄（由 workflow 更新）

| 日期 | 提交 | 作者 | 訊息 |
|------|------|------|------|
| 2025-11-13T10:01:08+08:00 | [e856d9f](https://github.com/YeMiao1026/CloudFinalProject/commit/e856d9fb8c45ee5350c293729405214ff24d632c) | YeMiao1026 | Merge pull request #1 from YeMiao1026/Classroom-demonstration |

<!-- AUTO_COMMIT_TRACK_END -->

---

## 2025-12-11 專案更新說明 (Project Update)

### 1. 前後端 API 互動機制
目前系統採用 **Client-Side Computing + Server-Side Analysis** 架構：
- **前端 (Frontend)**：
  - 使用 React + Vite 建構。
  - 整合 **Mediapipe Pose** (Local WASM) 進行即時人體關鍵點偵測 (33 Keypoints)。
  - 計算即時角度（膝蓋、髖部、背部）並繪製骨架於 Canvas。
  - 將關鍵點座標封裝為 JSON，透過 HTTP POST 發送至後端。
- **後端 (Backend - `video_analysis`)**：
  - 使用 FastAPI 接收數據。
  - 採用 **Sliding Window (30 frames)** 機制累積數據。
  - 使用 Random Forest 模型進行動作分類。
  - 回傳分析結果（如：「背部彎曲」、「正確動作」）。

### 2. 本地啟動方式 (Updated Local Startup)

**後端 (Backend)**
請使用 `video_analysis` 目錄下的 API Server（注意：非 `pose_backend`）：
```bash
cd video_analysis
# 確保已安裝依賴 (pip install -r ../requirements.txt 或手動安裝 fastapi uvicorn scikit-learn joblib numpy)
uvicorn api_server:app --reload --host 0.0.0.0 --port 8000
```

**前端 (Frontend)**
```bash
cd ui
npm install
npm run dev
```

### 3. 前端達成功能 (Frontend Achievements)
本階段前端已成功完成以下核心功能：
1.  **Mediapipe 本地化整合**：解決 CDN 版本衝突與 WASM 載入錯誤，成功在 React 環境中運行 Pose 模型。
2.  **即時骨架視覺化**：實作 Canvas 繪圖邏輯，包含關鍵點、骨架連線及特定部位（如背部）的輔助線與角度數值顯示。
3.  **API 串接與並發控制**：
    - 實作 `fetch` 機制傳送座標至後端。
    - 加入 `isFetching` 鎖與頻率限制 (Throttle)，防止請求堆積導致的 UI 延遲或卡頓。
4.  **錯誤處理與回饋顯示**：
    - 處理後端回傳的狀態碼與錯誤訊息（如：資料不足、模型冷啟動）。
    - 根據分析結果動態改變 UI 狀態（如：警告文字顏色變化）。
5.  **數據一致性修正**：協助除錯並確認前後端座標維度（2D/3D）差異，確保模型輸入數據的正確性。
