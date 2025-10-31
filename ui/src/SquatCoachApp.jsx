import React, { useRef, useEffect, useState } from 'react';
import './SquatCoach.css'; 

// 模擬從組員的模型中獲得的即時數據
const mockLiveAnalysisData = {
  action: '深蹲中',
  kneeAngle: 85,
  hipAngle: 95,
  stability: '良好 (92%)',
  feedback: '注意，你的背部沒有打直！',
  isError: true,
};

// --- 1. 動作辨識與即時視覺模組 ---
const LiveVisionModule = ({ action, feedback, isError }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    // 取得鏡頭串流
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        })
        .catch(err => {
          console.error("無法取得鏡頭權限:", err);
        });
    }

    // 這裡可以加入繪製骨架的邏輯（例如使用 TensorFlow.js 的結果）
    // 目前僅為佈局，骨架繪製功能將在後續整合
  }, []);

  return (
    <div className="vision-container">
      <h3>即時動作辨識模組</h3>
      <div className="video-wrapper">
        <video ref={videoRef} className="live-video" muted playsInline />
        {/* Canvas 用於疊加骨架，確保其位置與視訊重疊 */}
        <canvas ref={canvasRef} className="overlay-canvas" width="640" height="480" />
      </div>
      <div className="action-status">
        目前動作：**{action}**
      </div>
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
      <p className="note-text">
        **這個區域將來可以替換為語音回饋提示**
      </p>
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
      <h1>AI 賦能深蹲矯正教練 (MVP)</h1>
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