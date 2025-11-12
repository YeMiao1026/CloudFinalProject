🚀 啟動方式(須事先啟動虛擬環境)
1️⃣ 啟動後端伺服器

在 pose_backend/ 目錄中執行：

uvicorn app:app --reload


成功後，終端機會顯示：

INFO:     Uvicorn running on http://127.0.0.1:8000



2️⃣ 啟動前端應用

在 src/ 所在的 React 專案根目錄執行：

npm run dev


（若是使用 Vite，預設會在 http://localhost:5173
）

然後允許攝影機權限。

🎥 系統運作流程
階段	說明
1. 攝影機啟動	前端呼叫 navigator.mediaDevices.getUserMedia() 開啟攝影機。
2. 影格擷取	每隔 400ms 擷取一張畫面，轉成 JPEG blob。
3. 傳送到 Python	使用 fetchPoseFromPython() 將影像上傳至 FastAPI /api/pose。
4. MediaPipe 分析	app.py 使用 MediaPipe Pose 偵測骨架33點並計算角度。
5. 背部角度演算法	背部由肩中心→胸口偏移點→臀中心三點求夾角（Spine Offset法）。
6. 回傳分析結果	Python 傳回 keypoints + 三個角度 + 回饋文字。
7. 前端繪製骨架	React 以 Canvas 繪出骨架、角度數值與顏色變化。
🧠 核心檔案說明
🟢 app.py

使用 FastAPI 建立後端 API。

用 MediaPipe 偵測人體33個關鍵點。

計算膝蓋角度、髖部角度與「背部彎曲角度」。

背部角度採用「脊椎控制點偏移法 (Spine Offset)」，
模擬胸口位置來反映上半身傾斜程度。

根據角度給出動作提示（例如背部過彎或伸髖太快）。

🔵 DeadliftCoachApp.jsx

主 React 元件。

開啟攝影機、顯示影像、呼叫後端 API。

透過 Canvas 即時繪製骨架線與角度。

顯示三個中心點（肩中心、胸口、臀中心）。

若背部角度 < 140° → 線條變紅並顯示警示訊息。

🟣 poseBridge.js

將攝影機畫面截圖轉為 JPEG blob。

使用 fetch() 將影像傳到 FastAPI。

接收後端回傳的 JSON（角度與骨架點）。

是前後端溝通的橋樑。

🧩 智慧回饋範例
狀況	偵測角度	顯示文字
站直	背部 ≈ 180°	✅ 動作良好
前傾	背部 ≈ 150°	⚠️ 保持核心穩定
彎腰	背部 < 140°	⚠️ 背部彎曲過大，請挺直背部
臀部先上	髖角 +15 < 膝角	⚠️ 注意：過早伸髖

🧩 故障排除（Troubleshooting）
問題	解決方式
Form data requires "python-multipart"	執行：pip install python-multipart
相機畫面黑屏	檢查是否允許瀏覽器使用攝影機
API 500 錯誤	確認 FastAPI 已啟動於 port 8000
骨架角度一直 180°	確保使用最新版 app.py（包含 spine offset 修正）