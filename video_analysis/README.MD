本專案提供 硬舉姿勢即時判斷 API，可讓前端（JS / Browser / Mobile）透過鏡頭或影片輸入 Mediapipe Pose 的 33 個骨架點，並由模型分析是否存在錯誤動作。

模型訓練使用 聚合特徵（mean/max/min/std），並採用 RandomForestClassifier。

API 支援：

即時逐幀分析

滑動視窗（30 frames）

回傳姿勢錯誤標籤

多使用者 Session 處理

可部署於任何雲端服務（Render、Railway、GCP、AWS 等）

📁 專案架構
project/
│── api_server.py          # FastAPI 主程式
│── deadlift_rf_model.pkl  # 訓練後的模型
│── label_binarizer.pkl    # MultiLabelBinarizer
│── requirements.txt
│── README.md

📦 安裝環境
1️⃣ 建立虛擬環境（建議）
python3.10 -m venv .venv
.venv\Scripts\activate           # Windows

2️⃣ 安裝套件
pip install -r requirements.txt


🚀 啟動 API Server
uvicorn api_server:app --reload --host 0.0.0.0 --port 8000


API 將在：

http://localhost:8000

🧠 API 架構概念

模型在訓練階段使用：

每幀 13 維特徵

聚合成 36 維特徵（mean/max/min/std）

因此 API 必須：

收到前端的 33 個 Mediapipe Landmarks

取出訓練所需的關鍵點（耳、肩、髖、膝、踝…）

計算單幀特徵（13 維）

保存到 session 的滑動視窗（30 幀）

滿 30 幀後 → 產生 36 維聚合特徵 → 丟給模型推論

📡 API 規格
POST /predict

前端每幀傳送骨架點：

Request Body
{
  "session_id": "user_123",
  "landmarks": [
    {"x":0.1,"y":0.2,"z":-0.3},
    ...
  ]
}

Response 格式（A / D / E）
{
  "A": ["背部彎曲", "啟動姿勢錯誤"],
  "D": true,
  "E": null
}


說明：

欄位	意義
A	模型偵測到的錯誤動作（空陣列 = 正確動作）
D	API 有成功運行
E	錯誤訊息（如：InsufficientFrames, LandmarkMissing）
🎥 前端 JS 使用示例（Mediapipe + API）

以下為最簡示例：

async function sendFrame(landmarks) {
  const body = {
    session_id: "user1",
    landmarks: landmarks
  };

  const res = await fetch("https://your-api.com/predict", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(body)
  });

  const data = await res.json();
  console.log("Result:", data);
}

☁️ 雲端部署指南
適用平台：

Render

Railway

Google Cloud Run

AWS EC2 / ECS

Azure Container Apps

若使用 Docker：

Dockerfile

FROM python:3.10

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "8080"]


執行：

docker build -t deadlift-api .
docker run -p 8080:8080 deadlift-api

🧪 測試方式
本地測試
curl -X POST "http://localhost:8000/predict" \
     -H "Content-Type: application/json" \
     -d "{\"session_id\":\"test\", \"landmarks\":[{\"x\":0,\"y\":0,\"z\":0}]}"


（注意：需要完整 33 個 landmark 才能運作）