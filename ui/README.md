# 🏋️ AI Deadlift Coach — Frontend (React + Vite)

前端應用程式，提供即時硬舉姿勢分析介面。

> 📖 完整功能說明請參考 [專案根目錄 README](../README.md)

---

## 🚀 快速開始

```powershell
cd ui
npm install
npm run dev
# 🌐 http://localhost:5173
```

## 📦 NPM Scripts

| 指令 | 說明 |
|------|------|
| `npm run dev` | 開發伺服器（HMR 熱重載） |
| `npm run build` | 建置生產版本 → `dist/` |
| `npm run preview` | 預覽建置產物 |
| `npm run lint` | ESLint 程式碼檢查 |

## 📁 目錄結構

```
ui/
├── src/
│   ├── main.jsx              # React 入口
│   ├── LandingPage.jsx       # 首頁
│   ├── DeadliftCoachApp.jsx  # 主應用（核心邏輯）
│   └── logic/                # 姿勢分析邏輯
│       └── poseBridge.js     # MediaPipe 橋接
├── public/
│   └── mediapipe/            # MediaPipe WASM（本地化）
├── Dockerfile                # Production（nginx）
├── Dockerfile.dev            # Development（Vite HMR）
└── vite.config.js
```

## 🔧 環境變數

```env
VITE_API_BASE=http://localhost:8000  # 後端 API 位址
```

## 🐳 Docker

```powershell
# Development
docker build -f Dockerfile.dev -t deadlift-ui-dev .
docker run -p 5173:5173 deadlift-ui-dev

# Production
docker build -t deadlift-ui .
docker run -p 80:80 deadlift-ui
```

---

*詳細功能與架構請參考 [專案 README](../README.md)*

## Docker 化（建置與執行）

已提供 Docker 設定以便快速在容器中建置與部署前端。

在專案根目錄執行（或在 `ui` 目錄執行並調整路徑）：

```powershell
# 從專案根目錄
docker build -t squatcoach-ui -f ui/Dockerfile ./ui

# 以映像建立並啟動容器（將 8080 對外對應到容器 80）
docker run --rm -p 8080:80 --name squatcoach_ui squatcoach-ui

# 使用 docker-compose（將在根目錄有 docker-compose.yml）
docker-compose up --build
```

啟動後，可在瀏覽器開啟 <http://localhost:8080> 檢視應用程式。

備註：Dockerfile 為多階段建置（node -> build -> nginx），並使用 `nginx.conf` 提供 SPA 的 fallback（所有路由導回 index.html）。
