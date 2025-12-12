import React, { useEffect, useRef, useState } from "react"
// import * as mpPose from "@mediapipe/pose";
// import * as mpCamera from "@mediapipe/camera_utils";
import "./DeadliftCoach.css"

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE) || 'http://127.0.0.1:8000';

const mpEdges = [
  [11, 13], [13, 15],       // 左臂
  [12, 14], [14, 16],       // 右臂
  [11, 12],                 // 雙肩
  [23, 24],                 // 雙臀
  [11, 23], [12, 24],       // 上半身
  [23, 25], [25, 27], [27, 31], // 左腿
  [24, 26], [26, 28], [28, 32]  // 右腿
]

export default function DeadliftCoachApp({ onBack }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [angles, setAngles] = useState({ knee: 0, hip: 0, back: 0 })
  const [feedback, setFeedback] = useState({ text: "等待分析中…", level: "ok" })
  
  const sessionId = useRef(`session-${Date.now()}`);
  const lastApiCallTime = useRef(0);
  const isFetching = useRef(false);

  // Mediapipe Pose 初始化與相機設定
  useEffect(() => {
    const pose = new window.Pose({
      locateFile: (file) => {
        return `/mediapipe/pose/${file}`;
      }
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    pose.onResults(onResults);

    if (videoRef.current) {
      const camera = new window.Camera(videoRef.current, {
        onFrame: async () => {
          await pose.send({ image: videoRef.current });
        },
        width: 1280,
        height: 720
      });
      camera.start();
    }
  }, []);

  const onResults = async (results) => {
    if (!results.poseLandmarks) {
        // 若未偵測到人，可選擇清空回饋或顯示提示
        setFeedback({ text: "未偵測到人員", level: "warn" });
        return;
    }

    const landmarks = results.poseLandmarks;

    // 1. 轉換格式給 drawSkeleton
    const kps = landmarks.map((lm, index) => ({
      x: lm.x,
      y: lm.y,
      z: lm.z,
      score: lm.visibility || 1.0,
      id: index
    }));

    // 2. 前端計算角度 (用於即時顯示)
    const getPoint = (idx) => ({ x: landmarks[idx].x, y: landmarks[idx].y });
    const p11 = getPoint(11), p12 = getPoint(12); // Shoulders
    const p23 = getPoint(23), p24 = getPoint(24); // Hips
    const p25 = getPoint(25), p26 = getPoint(26); // Knees
    const p27 = getPoint(27), p28 = getPoint(28); // Ankles
    
    // 使用平均點
    const mid = (p1, p2) => ({ x: (p1.x + p2.x)/2, y: (p1.y + p2.y)/2 });
    const shoulder = mid(p11, p12);
    const hip = mid(p23, p24);
    const knee = mid(p25, p26);
    const ankle = mid(p27, p28);
    
    // 計算角度函式 (2D)
    const calcAngle = (a, b, c) => {
        const ba = { x: a.x - b.x, y: a.y - b.y };
        const bc = { x: c.x - b.x, y: c.y - b.y };
        const dot = ba.x * bc.x + ba.y * bc.y;
        const magBA = Math.sqrt(ba.x ** 2 + ba.y ** 2);
        const magBC = Math.sqrt(bc.x ** 2 + bc.y ** 2);
        if (magBA * magBC === 0) return 0;
        const rad = Math.acos(Math.max(-1, Math.min(1, dot / (magBA * magBC))));
        return (rad * 180) / Math.PI;
    };

    const newAngles = {
        knee: calcAngle(hip, knee, ankle),
        hip: calcAngle(shoulder, hip, knee),
        back: calcAngle({x: hip.x, y: hip.y - 0.5}, hip, shoulder) 
    };
    setAngles(newAngles);
    drawSkeleton(kps, newAngles);

    // 3. 呼叫後端 API (使用非同步不阻塞方式)
    const now = Date.now();
    if (now - lastApiCallTime.current > 100 && !isFetching.current) { // 限制頻率且防止重疊請求
        lastApiCallTime.current = now;
        isFetching.current = true;
        
        fetch(`${API_BASE}/predict`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session_id: sessionId.current,
                landmarks: landmarks.map(lm => ({
                    x: lm.x, y: lm.y, z: lm.z, visibility: lm.visibility
                }))
            })
        })
        .then(response => {
            if (response.ok) return response.json();
            throw new Error("Network response was not ok.");
        })
        .then(data => {
            if (data.E === "InsufficientFrames") {
                setFeedback({ text: "累積數據中...", level: "ok" });
            } else if (data.A && data.A.length > 0) {
                setFeedback({ text: data.A.join(", "), level: "warn" });
            } else if (data.D) {
                setFeedback({ text: "姿勢良好", level: "ok" });
            }
        })
        .catch(err => {
            console.error("API Error", err);
            setFeedback({ text: "連線異常", level: "warn" });
        })
        .finally(() => {
            isFetching.current = false;
        });
    }
  };

// ===== 畫骨架與輔助線 =====
const drawSkeleton = (kps, angles) => {
  if (!canvasRef.current || !videoRef.current || !kps) return
  const canvas = canvasRef.current
  const ctx = canvas.getContext("2d")
  const { videoWidth: w, videoHeight: h } = videoRef.current
  if (!w || !h) return

  canvas.width = w
  canvas.height = h
  ctx.clearRect(0, 0, w, h)
  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  // 🔴 點（全身關節）
  ctx.fillStyle = "red"
  kps.forEach(p => {
    if (p.score < 0.3) return
    const x = p.x * w, y = p.y * h
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.fill()
  })

  // 🟢 線（一般骨架）
  ctx.strokeStyle = "rgba(0,255,0,0.7)"
  ctx.lineWidth = 3
  mpEdges.forEach(([a, b]) => {
    const p1 = kps[a], p2 = kps[b]
    if (!p1 || !p2 || p1.score < 0.3 || p2.score < 0.3) return
    ctx.beginPath()
    ctx.moveTo(p1.x * w, p1.y * h)
    ctx.lineTo(p2.x * w, p2.y * h)
    ctx.stroke()
  })

// 🔵 背部中心線（肩中心 → 脊椎控制點 → 臀中心）
const LShoulder = kps[11], RShoulder = kps[12]
const LHip = kps[23], RHip = kps[24]

// 計算虛擬的脊椎中心點 (肩與臀的中點的中點，或是直接連線)
// 這裡簡化為肩中心與臀中心的連線
if ([LShoulder, RShoulder, LHip, RHip].every(p => p && p.score > 0.5)) {
  const shoulderCenter = {
    x: ((LShoulder.x + RShoulder.x) / 2) * w,
    y: ((LShoulder.y + RShoulder.y) / 2) * h
  }
  const hipCenter = {
    x: ((LHip.x + RHip.x) / 2) * w,
    y: ((LHip.y + RHip.y) / 2) * h
  }
  // 取肩與臀的中點作為背部中心示意
  const midCenter = { 
    x: (shoulderCenter.x + hipCenter.x) / 2, 
    y: (shoulderCenter.y + hipCenter.y) / 2 
  }

  // 線條顏色：背部角度過小變紅
  ctx.strokeStyle = angles.back < 140 ? "rgba(255,0,0,0.85)" : "rgba(30,144,255,0.9)"
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(shoulderCenter.x, shoulderCenter.y)
  ctx.lineTo(hipCenter.x, hipCenter.y)
  ctx.stroke()

  // 三個中心點顏色：青(肩)、橘(胸口)、綠(臀)
  const centers = [
    { ...shoulderCenter, color: "#00FFFF" },
    { ...midCenter, color: "#FFA500" },
    { ...hipCenter, color: "#00FF00" }
  ]
  centers.forEach(p => {
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2)
    ctx.fill()
  })

  // 顯示背部角度
  ctx.fillStyle = "white"
  ctx.font = "16px Arial"
  ctx.fillText(`${Math.round(angles.back)}°`, midCenter.x + 12, midCenter.y - 8)
}
}


  return (
    <div className="squat-coach-app">
      <button className="back-button" onClick={onBack}>
        ← 返回首頁
      </button>
      <h1 className="app-title">AI 硬舉姿勢分析系統</h1>
      <div className="main-content">
        <div className="video-wrapper">
          <video ref={videoRef} className="live-video" autoPlay muted playsInline />
          <canvas ref={canvasRef} className="overlay-canvas" />
        </div>
        <div className="right-panel">
          <div className="analysis-dashboard">
            <h3>量化分析儀表板</h3>
            <div className="card-grid">
              <Card title="膝蓋角度" value={angles.knee} unit="°" />
              <Card title="髖部角度" value={angles.hip} unit="°" />
              <Card title="背部角度" value={angles.back} unit="°" />
            </div>
          </div>
          <div className="feedback-system">
            <h3>智慧回饋系統</h3>
            <div className={`feedback-box ${feedback.level === "warn" ? "feedback-error" : "feedback-good"}`}>
              {feedback.text}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const Card = ({ title, value, unit }) => (
  <div className="dashboard-card">
    <div className="card-title">{title}</div>
    <div className="card-value">{Math.round(value)} {unit}</div>
  </div>
)
