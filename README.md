# 🏋️ AI Deadlift Coach - 智慧硬舉姿勢分析系統

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-19.1-61dafb.svg?logo=react)
![FastAPI](https://img.shields.io/badge/FastAPI-0.124-009688.svg?logo=fastapi)
![MediaPipe](https://img.shields.io/badge/MediaPipe-0.10.14-4285F4.svg?logo=google)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg?logo=docker)
![Python](https://img.shields.io/badge/Python-3.10+-3776AB.svg?logo=python)

**即時 AI 姿勢分析 | 運動醫學級圓背偵測 | 語音提示 | 訓練追蹤 | 成就系統**

[English](#english) | [繁體中文](#繁體中文)

</div>

---

## 繁體中文

### 📖 專案簡介

本專案是一個**全方位即時硬舉姿勢分析與訓練系統**，結合電腦視覺、機器學習與遊戲化設計，透過網頁攝影機即時偵測使用者的硬舉動作，提供專業級的姿勢分析與訓練追蹤功能。

### ✨ 完整功能列表

#### 🎯 核心分析功能
| 功能 | 說明 |
|------|------|
| **即時骨架追蹤** | MediaPipe Pose 33 個人體關鍵點偵測 |
| **運動醫學級圓背偵測** | 基於脊椎曲率角度的專業警告系統 |
| **量化分析儀表板** | 即時膝蓋角度、髖部角度、脊椎曲率顯示 |
| **多層級警告系統** | 視覺警告 + 音效 + 語音提醒 |
| **ML 姿勢分類** | Random Forest 模型分析 30 幀動作序列 |

#### 🎛️ 三種分析模式
| 模式 | 圖示 | 說明 |
|------|------|------|
| **即時模式** | ⚡ | 純前端計算，無 API 延遲，適合低延遲需求 |
| **AI 模式** | 🤖 | 純後端 ML 分類，9 種姿勢標籤識別 |
| **混合模式** | 🔗 | 即時 + AI 互補，即時優先、ML 輔助確認 |

#### 📊 ML 模型可識別的 9 種姿勢標籤
```
✅ 正確動作        🔴 背部彎曲        ⚠️ 髖提早上升
⚠️ 啟動姿勢錯誤    ⚠️ 杠鈴離身體太遠   ⚠️ 站姿過寬
⚠️ 結尾姿勢不完全  ⚠️ 鎖膝過早        ⚠️ 頭部位置錯誤
```

#### 🔢 訓練追蹤功能
| 功能 | 說明 |
|------|------|
| **自動計數器** | 智慧偵測硬舉動作循環，自動計算 Reps |
| **組數追蹤** | 自動識別組間休息，分組記錄 |
| **訓練歷史** | 完整訓練紀錄保存與回顧 |
| **即時姿勢評分** | 每次動作 0-100 分評分 |

#### 🔊 語音提示系統
- 中文語音即時播報姿勢問題
- 可調整音量 (0-100%)
- 智慧防重複播報機制
- 支援開關切換

#### ⏱️ 組間休息計時器
- 自動啟動：完成一組後自動倒數
- 預設 90 秒，可自訂 30-300 秒
- 視覺倒數 + 音效提醒

#### 🎯 目標設定系統
- 每日目標：設定目標組數與總次數
- 進度追蹤：即時顯示完成進度
- 自動重置：每日自動重置進度

#### 🏆 成就徽章系統
| 成就 | 條件 |
|------|------|
| 🌟 初學者 | 完成首次訓練 |
| 💪 持之以恆 | 累計 100 次硬舉 |
| 🔥 訓練狂人 | 單日完成 50 次 |
| 🎯 完美主義者 | 獲得 10 次 90+ 分 |
| 📅 週冠軍 | 連續 7 天訓練 |
| 更多... | 持續解鎖中 |

### 🏗️ 系統架構

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          Frontend (React 19 + Vite)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────────────────┐│
│  │   Webcam     │→ │  MediaPipe   │→ │      Real-time Analysis Engine     ││
│  │   Capture    │  │  Pose WASM   │  │  • Spine Curvature Detection       ││
│  │              │  │  (33 points) │  │  • Angle Calculation               ││
│  └──────────────┘  └──────────────┘  │  • Rep Counter & Scoring           ││
│         │                            └────────────────────────────────────┘│
│         │                                           │                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     Interactive Dashboard                             │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌─────────────────────┐│  │
│  │  │  Skeleton  │ │   Angle    │ │   Score    │ │   Voice + Sound     ││  │
│  │  │  Canvas    │ │   Cards    │ │   Display  │ │   Alerts System     ││  │
│  │  └────────────┘ └────────────┘ └────────────┘ └─────────────────────┘│  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌─────────────────────┐│  │
│  │  │    Rep     │ │   Rest     │ │   Goal     │ │    Achievement      ││  │
│  │  │  Counter   │ │   Timer    │ │   Tracker  │ │      Badges         ││  │
│  │  └────────────┘ └────────────┘ └────────────┘ └─────────────────────┘│  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬───────────────────────────────────────┘
                                     │ HTTP POST (landmarks JSON)
                                     │ Throttled API Calls
                                     ↓
┌────────────────────────────────────────────────────────────────────────────┐
│                        Backend (FastAPI + Python)                           │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                         pose_backend/app.py                         │    │
│  │  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────┐ │    │
│  │  │   /api/ping     │  │   /predict       │  │  Spine State Mgmt  │ │    │
│  │  │   Health Check  │  │   ML Inference   │  │  Per-session Track │ │    │
│  │  └─────────────────┘  └──────────────────┘  └────────────────────┘ │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                     │                                       │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                    ML Model (Random Forest)                         │    │
│  │  • 30-frame Sliding Window                                          │    │
│  │  • Feature Extraction: Angles, Vectors, Statistics                  │    │
│  │  • Multi-label Classification (9 Labels)                            │    │
│  │  • Model Files: deadlift_rf_model.pkl, label_binarizer.pkl          │    │
│  └────────────────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────────────┘
```

### 📁 專案結構

```
CloudFinalProject/
├── 📄 README.md                 # 專案說明文件
├── 📄 docker-compose.yml        # Docker 開發環境配置
├── 📄 render.yaml               # Render 雲端部署配置
├── 📄 requirements.txt          # Python 依賴（根目錄備份）
├── 📄 frontend_integration_steps.md  # 前端整合說明
│
├── 📁 ui/                       # 前端應用程式 (React + Vite)
│   ├── 📁 src/
│   │   ├── main.jsx             # React 入口點
│   │   ├── LandingPage.jsx      # 首頁（打字動畫效果）
│   │   ├── LandingPage.css      # 首頁樣式
│   │   ├── DeadliftCoachApp.jsx # 🎯 主應用程式（3000+ 行核心邏輯）
│   │   ├── DeadliftCoach.css    # 主應用樣式（2500+ 行）
│   │   ├── index.css            # 全域樣式
│   │   └── 📁 logic/            # 姿勢邏輯模組
│   │       ├── poseBridge.js    # MediaPipe 橋接
│   │       └── mockPoseLogic.js # 測試用 Mock
│   ├── 📁 public/
│   │   └── 📁 mediapipe/        # MediaPipe WASM 資源（本地化）
│   │       ├── 📁 camera_utils/ # 攝影機工具
│   │       └── 📁 pose/         # Pose 模型檔案 (*.tflite, *.wasm)
│   ├── 📁 tests/                # 前端測試
│   │   ├── test_no_video_inputs.js
│   │   └── no_video_inputs.json
│   ├── Dockerfile               # Production 建置（nginx）
│   ├── Dockerfile.dev           # Development 建置（Vite HMR）
│   ├── nginx.conf               # Nginx 配置
│   ├── vite.config.js           # Vite 配置
│   ├── eslint.config.js         # ESLint 配置
│   ├── package.json             # Node.js 依賴
│   └── index.html               # HTML 入口
│
├── 📁 pose_backend/             # 後端 API 服務 (FastAPI)
│   ├── app.py                   # FastAPI 主程式（含 ML 整合）
│   ├── Dockerfile               # 後端容器配置
│   ├── pyproject.toml           # Poetry 配置
│   └── README.md                # 後端說明
│
├── 📁 video_analysis/           # 機器學習模組
│   ├── train_local.py           # 本地訓練腳本
│   ├── predict_youtube.py       # YouTube 影片預測
│   ├── api_server.py            # 獨立 ML API（可選）
│   ├── deadlift_rf_model.pkl    # 🤖 訓練好的 Random Forest 模型
│   ├── label_binarizer.pkl      # 標籤編碼器
│   └── README.MD                # ML 模組說明
│
├── 📁 data/                     # 訓練資料
│   ├── 📁 raw_videos/           # 原始影片
│   ├── 📁 cleaned_videos/       # 處理後影片
│   ├── 📁 labels/               # 標註檔案 (CSV)
│   └── README.md                # 資料說明
│
├── 📁 presentation/             # 簡報資料
│   ├── 📁 MVP-demo/             # MVP 階段簡報
│   └── 📁 Final-demo/           # 期末簡報
│
└── 📁 tools/                    # 開發工具
    └── update_readme.py         # README 自動更新腳本
```

### 🚀 快速開始

#### 前置需求
- **Python** >= 3.10
- **Node.js** >= 20.x
- **Docker** (建議，用於容器化部署)

#### 方法一：Docker Compose（推薦 ⭐）

```bash
# 1. 克隆專案
git clone https://github.com/YeMiao1026/CloudFinalProject.git
cd CloudFinalProject

# 2. 啟動服務（首次會自動建置）
docker-compose up --build

# 3. 訪問應用
# 🖥️ Frontend: http://localhost:5173
# 🔧 Backend:  http://localhost:8000
```

**Docker 服務說明：**
| 服務 | Port | 說明 |
|------|------|------|
| `ui` | 5173 | Vite Dev Server with HMR |
| `backend` | 8000 | FastAPI + ML Model |

#### 方法二：本地開發

**後端啟動：**
```powershell
# Windows PowerShell
cd pose_backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install fastapi uvicorn mediapipe numpy Pillow scikit-learn joblib
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

**前端啟動：**
```powershell
cd ui
npm ci               # 或 npm install
npm run dev -- --host 0.0.0.0
# 🌐 訪問 http://localhost:5173
```

### 🔧 API 端點

| 端點 | 方法 | 說明 | 請求格式 |
|------|------|------|---------|
| `/api/ping` | GET | 健康檢查 | - |
| `/predict` | POST | ML 姿勢分類 | `{ session_id, landmarks[], timestamp }` |

**`/predict` 回應格式：**
```json
{
  "A": ["背部彎曲"],           // ML 預測標籤
  "spine": {                   // 即時脊椎分析
    "status": "danger",
    "curvature": 25.3,
    "message": "⚠️ 圓背風險"
  },
  "ml_ready": true,            // ML 是否準備好
  "ml_frame_count": 30         // 已收集幀數
}
```

### 🖥️ 技術棧

| 層級 | 技術 | 版本 |
|------|------|------|
| **Frontend** | React | 19.1 |
| | Vite (rolldown) | 7.1 |
| | MediaPipe Pose | 0.5 |
| | Web Speech API | - |
| | LocalStorage | - |
| **Backend** | FastAPI | 0.124 |
| | MediaPipe | 0.10.14 |
| | NumPy | - |
| | Pillow | - |
| **ML** | scikit-learn | - |
| | joblib | - |
| **DevOps** | Docker | - |
| | Docker Compose | - |
| | nginx | - |
| **Cloud** | Render (PaaS) | - |

### 📊 核心演算法說明

#### 1. 脊椎曲率計算

```python
# 上段脊椎向量：mid_shoulder → nose
upper_spine = normalize(nose - mid_shoulder)

# 下段脊椎向量：mid_hip → mid_shoulder
lower_spine = normalize(mid_shoulder - mid_hip)

# 脊椎曲率角度（兩向量夾角）
curvature = arccos(dot(upper_spine, lower_spine))
# 0° = 直線 | 角度越大 = 圓背越嚴重
```

**閾值設定：**
| 角度範圍 | 狀態 | 說明 |
|----------|------|------|
| ≤ 10° | ✅ 安全 | 脊椎中立 |
| 10°-20° | ⚠️ 警告 | 輕微彎曲 |
| 20°-30° | 🔴 危險 | 圓背風險 |
| > 30° | 🚨 嚴重 | 立即停止 |

#### 2. 為什麼這個方法有效？

傳統方法常把「正確的髖鉸鏈前傾」誤判為圓背。本演算法只計算**脊椎本身的彎曲程度**，不受身體前傾影響：

| 情境 | 髖部前傾角度 | 脊椎曲率 | 判定 |
|------|-------------|---------|------|
| 正確硬舉（髖鉸鏈） | 60° | 5° | ✅ 安全 |
| 錯誤硬舉（圓背） | 60° | 35° | 🔴 危險 |

#### 3. 時間穩定機制
- 避免單幀誤判導致警告閃爍
- 需連續 **10 幀**超過閾值才觸發警告
- 角度低通濾波平滑處理 (smoothing factor: 0.3)

#### 4. 硬舉計數演算法
```
動作階段循環：
STANDING (站立, >160°) → DESCENDING (下降) → BOTTOM (最低點, <120°) 
                                                      ↓
                         ← ASCENDING (上升) ←─────────┘
                                                      
完成一次循環 = 1 Rep
```

#### 5. 即時姿勢評分公式
```
基礎分：100 分
扣分項：
  - 脊椎彎曲：-5 ~ -30 分（依嚴重程度）
  - 速度過快：-10 分
  - 警告次數：-5 分/次
加分項：
  - 動作深度達標：+5 分
  - 動作穩定：+5 分
```

### ☁️ 雲端部署

#### 🌐 線上 Demo

| 服務 | 網址 |
|------|------|
| **Frontend** | https://cloudfinal-ui.onrender.com |
| **Backend API** | https://cloudfinal-backend.onrender.com |

> ⚠️ 免費方案會在 15 分鐘無流量後休眠，首次訪問需等待 ~30 秒喚醒

#### Render 部署

專案已配置 `render.yaml`，支援一鍵部署：

1. Fork 本專案到你的 GitHub
2. 在 [Render Dashboard](https://dashboard.render.com) 建立服務
3. 選擇「Blueprint」連結 GitHub repository
4. 系統會自動讀取 `render.yaml` 配置
5. 手動建立 Static Site（前端）

#### 環境變數

```env
# Frontend (ui service)
VITE_API_BASE=https://cloudfinal-backend.onrender.com

# Backend (pose_backend service)
PORT=8000
PYTHONUNBUFFERED=1
```

### 🎮 使用指南

#### 開始訓練
1. 打開應用程式，點擊「Start Camera」
2. 允許瀏覽器存取攝影機
3. 站在攝影機前，確保全身可見
4. 選擇分析模式（建議使用「混合模式」）
5. 開始硬舉動作，系統會自動分析

#### 設定目標
1. 點擊「🎯 目標」按鈕
2. 設定每日目標組數與次數
3. 系統會追蹤並顯示完成進度

#### 查看成就
1. 點擊「🏆 成就」按鈕
2. 查看已解鎖與待解鎖成就
3. 達成條件後自動解鎖並播放動畫

#### 訓練歷史
1. 點擊「📊 歷史」按鈕
2. 查看過往訓練紀錄
3. 分析姿勢評分趨勢

### 📝 注意事項

- **MediaPipe 資源**：首次載入會下載約 5MB 的 WASM 模組（已本地化）
- **瀏覽器相容性**：需支援 WebGL 2.0（Chrome, Firefox, Edge 皆支援）
- **攝影機權限**：需允許網頁存取攝影機
- **網路需求**：AI 模式需連線後端，即時模式可離線使用
- **容器記憶體**：後端建議至少 512MB RAM
- **螢幕建議**：建議使用 1280x720 以上解析度

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

This project is a **comprehensive real-time deadlift posture analysis and training system** that combines computer vision, machine learning, and gamification design to provide professional-grade posture analysis and training tracking through a webcam.

### ✨ Key Features

#### Core Analysis
- 🎯 **Real-time Skeleton Tracking**: MediaPipe Pose with 33 body landmarks
- 🏥 **Medical-grade Rounded Back Detection**: Spine curvature angle-based warning system
- 📊 **Quantitative Dashboard**: Real-time knee angle, hip angle, spine curvature display
- 🤖 **ML Posture Classification**: Random Forest model (9 labels) analyzing 30-frame sequences

#### Three Analysis Modes
| Mode | Icon | Description |
|------|------|-------------|
| Realtime | ⚡ | Frontend-only, no API latency |
| AI | 🤖 | Backend ML classification |
| Combined | 🔗 | Best of both, realtime priority |

#### Training Features
- 🔢 **Auto Rep Counter**: Smart detection of deadlift cycles
- 🔊 **Voice Alerts**: Chinese voice prompts for posture issues
- ⏱️ **Rest Timer**: Automatic countdown between sets
- 🎯 **Goal Setting**: Daily targets for sets and reps
- 🏆 **Achievement System**: Gamified badges and milestones
- 📊 **Training History**: Complete session records

### 🚀 Quick Start

```bash
# Using Docker Compose (Recommended)
git clone https://github.com/YeMiao1026/CloudFinalProject.git
cd CloudFinalProject
docker-compose up --build

# Access the app
# 🖥️ Frontend: http://localhost:5173
# 🔧 Backend:  http://localhost:8000
```

### 🖥️ Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, Vite, MediaPipe Pose, Web Speech API |
| **Backend** | FastAPI, MediaPipe, NumPy, scikit-learn |
| **DevOps** | Docker, Docker Compose, nginx |
| **Cloud** | Render (PaaS) |

### 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (React + Vite)                       │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────────┐ │
│  │  Webcam    │→ │ MediaPipe  │→ │  Real-time Analysis        │ │
│  │  Capture   │  │ Pose WASM  │  │  • Spine Curvature         │ │
│  │            │  │            │  │  • Rep Counter & Scoring    │ │
│  └────────────┘  └────────────┘  └────────────────────────────┘ │
│                                              │                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Dashboard: Skeleton | Angles | Score | Voice | Goals      │ │
│  └────────────────────────────────────────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP POST (landmarks)
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                Backend (FastAPI + ML Model)                      │
│  • /predict: 30-frame sliding window → RF classifier            │
│  • 9 posture labels (Chinese)                                    │
│  • Session-based spine state tracking                            │
└─────────────────────────────────────────────────────────────────┘
```

### 📊 ML Model Labels

The model can classify 9 different posture issues:
```
✅ 正確動作 (Good Form)          🔴 背部彎曲 (Rounded Back)
⚠️ 髖提早上升 (Early Hip Rise)   ⚠️ 啟動姿勢錯誤 (Bad Start)
⚠️ 杠鈴離身體太遠 (Bar Too Far)  ⚠️ 站姿過寬 (Stance Too Wide)
⚠️ 結尾姿勢不完全 (Incomplete)   ⚠️ 鎖膝過早 (Early Knee Lock)
⚠️ 頭部位置錯誤 (Head Position)
```

---

<div align="center">

**Made with ❤️ at National Taiwan University of Science and Technology**

Cloud Computing Final Project - 2024/2025

![NTUST](https://img.shields.io/badge/NTUST-Cloud%20Computing-blue)

</div>

<!-- AUTO_COMMIT_TRACK_START -->

## 自動提交紀錄（由 workflow 更新）

| 日期 | 提交 | 作者 | 訊息 |
|------|------|------|------|
| 2025-12-18T00:28:00+08:00 | [ab04051](https://github.com/YeMiao1026/CloudFinalProject/commit/ab04051071eb697e3c669a10f65ce1a127ccefa0) | yemiao1026 | Refactor code structure for improved readability and maintainability |
| 2025-12-18T00:05:39+08:00 | [e56ad25](https://github.com/YeMiao1026/CloudFinalProject/commit/e56ad250dd687d97bdbef20ddfe8e2514629e389) | yemiao1026 | docs: 新增線上 Demo URL (Render 部署) |
| 2025-12-17T23:44:12+08:00 | [237a44a](https://github.com/YeMiao1026/CloudFinalProject/commit/237a44ad1b0fb02d243756f6f2a39c6951e3ed97) | yemiao1026 | chore: 使用免費方案 (plan: free) |
| 2025-12-17T23:43:07+08:00 | [601e756](https://github.com/YeMiao1026/CloudFinalProject/commit/601e7567a3395d8f75b4608a4afdf486e6affe22) | yemiao1026 | fix: 移除 staticSites (Blueprint 不支援) |
| 2025-12-17T23:41:43+08:00 | [ff24311](https://github.com/YeMiao1026/CloudFinalProject/commit/ff2431124829a8535d7815622f60ef691331014e) | yemiao1026 | fix: 修正 render.yaml 語法 (camelCase) |
| 2025-12-17T23:38:48+08:00 | [40be2f3](https://github.com/YeMiao1026/CloudFinalProject/commit/40be2f30c4969f0a21e75206984c924523678a5f) | yemiao1026 | chore: 更新 render.yaml 分支為 main |
| 2025-12-17T23:33:12+08:00 | [90e0a7e](https://github.com/YeMiao1026/CloudFinalProject/commit/90e0a7e90f3975bcf0777895397dfaaaff77b057) | yemiao1026 | Merge final_dev: 完整功能版本 (ML整合、語音提示、成就系統) |
| 2025-12-11T20:58:53+08:00 | [68aa78a](https://github.com/YeMiao1026/CloudFinalProject/commit/68aa78a58a84145044b14b3e7672e4ca91046611) | C0ding_fArmer | Merge pull request #2 from YeMiao1026/standerduser-patch-1 |
| 2025-12-11T20:49:54+08:00 | [257e526](https://github.com/YeMiao1026/CloudFinalProject/commit/257e5269c6ab37e86ae28150b91205982ad6dd96) | C0ding_fArmer | Add files via upload |
| 2025-11-13T10:01:08+08:00 | [e856d9f](https://github.com/YeMiao1026/CloudFinalProject/commit/e856d9fb8c45ee5350c293729405214ff24d632c) | YeMiao1026 | Merge pull request #1 from YeMiao1026/Classroom-demonstration |
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->

<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->

<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->

<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->

<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->

<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->

<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->

<!-- AUTO_COMMIT_TRACK_END -->
<!-- AUTO_COMMIT_TRACK_END -->

<!-- AUTO_COMMIT_TRACK_END -->

<!-- AUTO_COMMIT_TRACK_END -->
