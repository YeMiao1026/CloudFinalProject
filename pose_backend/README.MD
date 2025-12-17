# 🔧 AI Deadlift Coach — Backend (FastAPI + ML)

後端 API 服務，提供 ML 姿勢分類與即時脊椎分析。

> 📖 完整功能說明請參考 [專案根目錄 README](../README.md)

---

## 🚀 快速開始

### 方法一：使用 uv（推薦）

```powershell
cd pose_backend
uv sync
uv run uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

### 方法二：傳統 venv

```powershell
cd pose_backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

🌐 API 位址：`http://localhost:8000`

---

## 📡 API 端點

| 端點 | 方法 | 說明 |
|------|------|------|
| `/api/ping` | GET | 健康檢查 |
| `/predict` | POST | ML 姿勢分類 |

### `/predict` 請求格式

```json
{
  "session_id": "user-123",
  "landmarks": [
    { "x": 0.5, "y": 0.3, "z": -0.1, "visibility": 0.9 },
    ... // 共 33 個 MediaPipe landmarks
  ]
}
```

### 回應格式

```json
{
  "A": ["背部彎曲"],
  "spine": {
    "status": "warning",
    "curvature": 15.2,
    "message": "輕微彎曲"
  },
  "ml_ready": true,
  "ml_frame_count": 30
}
```

---

## 📁 檔案說明

| 檔案 | 說明 |
|------|------|
| `app.py` | FastAPI 主程式（含 ML 整合） |
| `deadlift_rf_model.pkl` | 訓練好的 Random Forest 模型 |
| `label_binarizer.pkl` | 標籤編碼器 |
| `Dockerfile` | 容器建置配置 |
| `pyproject.toml` | uv/Python 依賴配置 |

---

## 🐳 Docker

```powershell
docker build -t deadlift-backend .
docker run -p 8000:8000 deadlift-backend
```

---

*詳細架構與演算法請參考 [專案 README](../README.md)*