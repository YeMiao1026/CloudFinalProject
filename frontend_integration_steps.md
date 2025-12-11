# 前端整合 Video Analysis API 步驟指南

本指南說明如何將前端應用程式從傳送影像改為在前端執行 Mediapipe Pose，並將骨架資訊傳送至後端 `/predict` API。

## 1. 安裝必要套件

前端需要在瀏覽器中執行 Mediapipe，請安裝以下套件：

```bash
npm install @mediapipe/pose @mediapipe/camera_utils @mediapipe/drawing_utils
```

## 2. 了解後端 API 規格

新的後端 API 不再接收影像檔案，而是接收骨架座標點。

- **Endpoint**: `POST /predict`
- **Content-Type**: `application/json`
- **Request Body**:
  ```json
  {
    "session_id": "unique-session-string",
    "landmarks": [
      { "x": 0.1, "y": 0.2, "z": 0.3, "visibility": 0.9 },
      ... (共 33 個點)
    ]
  }
  ```
- **Response**:
  ```json
  {
    "A": ["Label1", "Label2"],  // 分析結果標籤 (例如錯誤動作提示)
    "D": true,                  // 是否成功處理
    "E": null                   // 錯誤訊息 (若有)
  }
  ```

## 3. 修改前端程式碼架構

### A. 引入 Mediapipe Pose

在 `DeadliftCoachApp.jsx` 或相關邏輯檔案中引入：

```javascript
import { Pose } from "@mediapipe/pose";
import { Camera } from "@mediapipe/camera_utils";
// 若需要繪圖
// import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils";
```

### B. 初始化 Pose 模型

在組件掛載時 (useEffect) 初始化 Pose 模型：

```javascript
const pose = new Pose({
  locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
  }
});

pose.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  enableSegmentation: false,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

pose.onResults(onResults); // 設定回呼函式處理結果
```

### C. 處理影像串流

使用 `Camera` 工具或 `requestAnimationFrame` 將 Video 影像送入 Pose 模型：

```javascript
if (videoRef.current) {
  const camera = new Camera(videoRef.current, {
    onFrame: async () => {
      await pose.send({ image: videoRef.current });
    },
    width: 1280,
    height: 720
  });
  camera.start();
}
```

### D. 實作 `onResults` 與 API 呼叫

在 `onResults` 中取得 landmarks 並發送至後端：

```javascript
// 產生或維持一個 session_id
const sessionId = "user-session-" + Date.now(); 

const onResults = async (results) => {
  if (!results.poseLandmarks) return;

  // 1. 繪製骨架 (可選，若要在前端即時顯示)
  // drawSkeleton(results.poseLandmarks);

  // 2. 轉換格式符合後端需求
  const landmarks = results.poseLandmarks.map(lm => ({
    x: lm.x,
    y: lm.y,
    z: lm.z,
    visibility: lm.visibility || 1.0
  }));

  // 3. 呼叫後端 API
  try {
    const response = await fetch("http://localhost:8000/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        landmarks: landmarks
      })
    });
    
    const data = await response.json();
    
    // 4. 處理回傳結果
    if (data.E) {
      console.warn("API Error:", data.E);
    } else if (data.A) {
      console.log("Analysis Labels:", data.A);
      // 更新 UI 顯示建議
      // setFeedback(...)
    }
  } catch (error) {
    console.error("API Call Failed:", error);
  }
};
```

## 4. 注意事項

1.  **頻率控制**: `onResults` 會非常頻繁地觸發（每幀一次）。建議使用 `throttle` 或計時器來限制 API 呼叫頻率（例如每 100ms 或 200ms 呼叫一次），避免塞爆後端。但後端目前設計是累積 30 幀才推論，所以若要即時性，可能需要持續傳送，或者在前端累積一定量再送（視後端實作而定，目前後端是 `user_windows[session].append`，所以需要連續傳送）。
    *   *修正*: 後端邏輯是 `user_windows[session].append(feats)`，且 `maxlen=30`。每次呼叫都會 append。如果前端送太慢，累積 30 幀會很久。如果送太快，網路負擔大。建議依據實際網路狀況調整，通常 15-30 FPS 是理想的。

2.  **Session ID**: 確保同一位使用者的 `session_id` 在同一次運動過程中保持一致，否則後端的 window 會被重置。

3.  **座標系統**: Mediapipe 的 x, y 是正規化座標 (0.0 ~ 1.0)，後端看起來也是直接使用這些數值計算角度，請確認是否需要調整（通常不需要）。

4.  **CORS**: 確保後端 FastAPI 有設定 CORS 允許前端網域存取。
