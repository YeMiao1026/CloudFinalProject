import React, { useRef, useEffect, useState } from 'react';
import './SquatCoach.css'; 

// ========================= IMPORTANT: MOCK DATA (給後端組員) =========================
// 這是前端暫時使用的模擬即時分析資料 (mock data)。
// 後端 / 模型整合說明：
// - 目前前端期望接收到的資料結構如下：
//   {
//     action: string,        // 動作名稱，例如 '深蹲中'
//     kneeAngle: number,     // 膝蓋角度 (度)
//     hipAngle: number,      // 髖部角度 (度)
//     stability: string,     // 穩定度描述或百分比字串
//     feedback: string,      // 文字回饋
//     isError: boolean,      // 是否為錯誤/警示狀態
//   }
// - 建議整合方式：WebSocket / Server-Sent Events / REST 長輪詢（優先 WebSocket）
// - 當後端開始提供即時資料流時，請將資料直接送到 SquatCoachApp 的 state (liveData)
//   或由後端推送至 LiveVisionModule 的 props (poseData / analysis data)
// - TODO (給後端)：確認 endpoint/WS topic 名稱、資料頻率與欄位型別
// ======================================================================================
const mockLiveAnalysisData = {
  action: '深蹲中',
  kneeAngle: 85,
  hipAngle: 95,
  stability: '良好 (92%)',
  feedback: '注意，你的背部沒有打直！',
  isError: true,
};

// --- 1. 動作辨識與即時視覺模組 ---
const LiveVisionModule = ({ action, feedback, isError, poseData }) => { // 🌟 接收 poseData 🌟
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [uploadedVideoURL, setUploadedVideoURL] = useState(null);

  // 骨架繪製函式
  const drawPose = (ctx, data) => {
    if (!data || data.length === 0) return;

    // ======= IMPORTANT: poseData 格式說明（給後端 / 模型組員） =======
    // 前端預期 drawPose 所接收的 `data` (poseData) 形狀範例：
    // [
    //   { name: 'left_knee', x: 123, y: 456, score: 0.98 },
    //   { name: 'right_knee', x: 200, y: 460, score: 0.96 },
    //   ...
    // ]
    // 或者也可以是更高階的物件：
    // {
    //   keypoints: [...],    // 關鍵點陣列
    //   skeleton: [...],     // 骨架連線陣列
    // }
    // 前端繪製預期：提供每個關節的 x, y 座標與信心分數 (score)
    // 若後端/模型輸出不同結構，請在整合時一併約定一個 adapter（在前端將後端格式轉為上面所述格式）
    // ==================================================================

    // 簡單範例：畫一個點
    // ctx.fillStyle = 'red';
    // ctx.beginPath();
    // ctx.arc(data[0].x, data[0].y, 5, 0, 2 * Math.PI);
    // ctx.fill();

    // 實際整合時，你會在這裡遍歷所有關節點並繪製線段
  };

  useEffect(() => {
    // 取得鏡頭串流的邏輯...
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          videoRef.current.srcObject = stream;
          videoRef.current.play();

          // 監聽視訊 metadata 載入完成事件 
          videoRef.current.onloadedmetadata = () => {
              const video = videoRef.current;
              const canvas = canvasRef.current;

              // 將 canvas 的內部解析度設定為與視訊串流相同
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              
              // 確保 canvas 的 CSS 尺寸與 video 的 CSS 尺寸保持一致 (透過 CSS 處理響應式)
              // 讓骨架繪製與實際影像同步
          };
        })
        .catch(err => {
          console.error("無法取得鏡頭權限:", err);
          // 若使用者拒絕權限，顯示 fallback UI
          if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
            setPermissionDenied(true);
          }
        });
    }

    // cleanup: stop any active tracks and revoke uploaded URL on unmount
    return () => {
      try {
        const video = videoRef.current;
        if (video && video.srcObject) {
          const stream = video.srcObject;
          if (stream.getTracks) {
            stream.getTracks().forEach(t => t.stop());
          }
          video.srcObject = null;
        }
        if (uploadedVideoURL) {
          URL.revokeObjectURL(uploadedVideoURL);
        }
      } catch (e) {
        // ignore cleanup errors
      }
    };
  }, []);

  // 處理使用者上傳影片作為 fallback
  const handleUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    // 若之前有 stream，先關閉
    try {
      const video = videoRef.current;
      if (video && video.srcObject) {
        const stream = video.srcObject;
        if (stream.getTracks) stream.getTracks().forEach(t => t.stop());
        video.srcObject = null;
      }
    } catch (err) {
      // ignore
    }

    const url = URL.createObjectURL(file);
    setUploadedVideoURL(url);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = url;
      videoRef.current.play().catch(()=>{});
      // metadata handler will still set canvas size
      videoRef.current.onloadedmetadata = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      };
    }
    // hide permission denied message once user provides a file
    setPermissionDenied(false);
  };

  return (
    <div className="vision-container">
      <h3>即時動作辨識模組</h3>

      {permissionDenied ? (
        <div className="camera-denied">
          <h4>我們無法存取你的攝影機。請允許攝影機權限，或上傳影片作為替代來源。</h4>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label className="upload-button" style={{ cursor: 'pointer' }}>
              上傳影片
              <input type="file" accept="video/*" onChange={handleUpload} style={{ display: 'none' }} />
            </label>
            <button onClick={() => setShowInstructions(s => !s)} className="text-button">說明</button>
          </div>
          {showInstructions && (
            <div className="camera-instructions">
              <h4>如何開啟攝影機權限（Windows / 瀏覽器）</h4>
              <ol>
                <li>確認瀏覽器頁籤左上方或網址列上的攝影機圖示，允許使用攝影機。</li>
                <li>若使用 Chrome，點擊鎖頭圖示 → 網站設定 → 攝影機 → 選擇允許。</li>
                <li>也可上傳一段錄好的影片作為替代來源。</li>
              </ol>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="video-wrapper">
            <video ref={videoRef} className="live-video" muted playsInline controls={!uploadedVideoURL} />
            {/* Canvas 用於疊加骨架，確保其位置與視訊重疊 */}
            <canvas ref={canvasRef} className="overlay-canvas" width="640" height="480" />
          </div>
          <div className="action-status">
            目前動作：**{action}**
          </div>
        </>
      )}
    </div>
  );
};

// --- 2. 量化分析儀表板元件 ---
const DashboardCard = ({ title, value, unit }) => (
  <div className="dashboard-card">
    <div className="card-title">{title}</div>
    <div className="card-value">{value} {unit}</div>
  </div>
);

const AnalysisDashboard = ({ data }) => (
  <div className="analysis-dashboard">
    <h3>量化分析儀表板</h3>
    <div className="card-grid">
      <DashboardCard title="膝蓋角度" value={data.kneeAngle} unit="度" />
      <DashboardCard title="髖部角度" value={data.hipAngle} unit="度" />
      <DashboardCard title="身體重心穩定度" value={data.stability} unit="" />
    </div>
    {/* 這裡可以放置圖表元件，例如使用 Chart.js 或 Recharts */}
    {/* <div className="chart-area">
      <h4>角度變化趨勢圖 (待實作)</h4>
    </div> */}
  </div>
);

// --- 3. 智慧回饋系統元件 ---
const FeedbackSystem = ({ feedback, isError }) => {
  // 根據是否有錯誤來調整樣式
  const feedbackClass = isError ? 'feedback-error' : 'feedback-good';

  return (
    <div className="feedback-system">
      <h3>智慧回饋系統</h3>
      <div className={`feedback-box ${feedbackClass}`}>
        <p>{isError ? '⚠️ 姿勢警告' : '✅ 動作提示'}</p>
        <p className="feedback-text">{feedback}</p>
      </div>
    </div>
  );
};


// --- 主應用程式元件 ---
const SquatCoachApp = () => {
  // 使用 state 模擬即時數據更新
  const [liveData, setLiveData] = useState(mockLiveAnalysisData);

  // 實務上，這裡會使用 useEffect 和 setInterval/Web Worker
  // 來模擬數據從後端或模型不斷推送更新
  useEffect(() => {
    // ======= IMPORTANT: 這是一段「模擬」即時更新的程式碼 =======
    // 目前使用 setInterval 來定期 (2s) 更改 mock 資料，僅用於本地開發 / Demo。
    // 後端整合建議：
    // - 移除此模擬 interval，改由 WebSocket / SSE 訂閱後端即時分析推播（推薦 WebSocket）
    // - 或在此處發出 API 請求取得分析結果並 setLiveData
    // - 當後端準備好時，請提供：
    //     * WebSocket URL 或 REST endpoint
    //     * 資料發送頻率 (Hz)
    //     * 欄位對應 (參考檔案上方的 mock data schema)
    // ==================================================================
    const interval = setInterval(() => {
      // 模擬數據變化
      setLiveData(prevData => ({
        ...prevData,
        kneeAngle: Math.floor(80 + Math.random() * 20), // 80~100 度
        feedback: prevData.isError ? '很好，請保持！' : '注意，你的背部沒有打直！',
        isError: !prevData.isError, // 模擬錯誤與正確的交替
      }));
    }, 2000); // 每 2 秒更新一次

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="squat-coach-app">
  <h1 className="app-title">AI 賦能深蹲矯正教練 (MVP)</h1>
      <div className="main-content">
        {/* 左側：即時視訊與動作辨識 */}
        <LiveVisionModule 
          action={liveData.action} 
          feedback={liveData.feedback} 
          isError={liveData.isError}
        />
        
        {/* 右側：儀表板與回饋系統 */}
        <div className="right-panel">
          <AnalysisDashboard data={liveData} />
          <FeedbackSystem feedback={liveData.feedback} isError={liveData.isError} />
        </div>
      </div>
    </div>
  );
};

export default SquatCoachApp;