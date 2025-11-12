import React, { useEffect, useRef, useState } from "react"
import { fetchPoseFromPython } from "./logic/poseBridge.js"
import "./Deadliftcoach.css"

const mpEdges = [
  [11, 13], [13, 15],       // 左臂
  [12, 14], [14, 16],       // 右臂
  [11, 12],                 // 雙肩
  [23, 24],                 // 雙臀
  [11, 23], [12, 24],       // 上半身
  [23, 25], [25, 27], [27, 31], // 左腿
  [24, 26], [26, 28], [28, 32]  // 右腿
]

export default function DeadliftCoachApp() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [angles, setAngles] = useState({ knee: 0, hip: 0, back: 0 })
  const [feedback, setFeedback] = useState({ text: "等待分析中…", level: "ok" })

  // 啟動攝影機
  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } })
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      } catch (err) {
        console.error("🚫 無法開啟相機：", err)
        setFeedback({ text: "請允許攝影機權限", level: "warn" })
      }
    })()
    return () => {
      const v = videoRef.current
      if (v && v.srcObject) v.srcObject.getTracks().forEach(t => t.stop())
    }
  }, [])

  // 定期傳影格到後端
  useEffect(() => {
    const tick = async () => {
      try {
        const res = await fetchPoseFromPython(videoRef.current)
        if (res?.success) {
          setAngles(res.angles)
          setFeedback(res.feedback)
          drawSkeleton(res.keypoints, res.angles)
        }
      } catch (err) {
        console.error("Pose API error:", err)
      }
    }
    const timer = setInterval(tick, 400)
    return () => clearInterval(timer)
  }, [])

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
const spineCenter = kps.find(p => p.id === 102)

if ([LShoulder, RShoulder, LHip, RHip, spineCenter].every(p => p && p.score > 0.5)) {
  const shoulderCenter = {
    x: ((LShoulder.x + RShoulder.x) / 2) * w,
    y: ((LShoulder.y + RShoulder.y) / 2) * h
  }
  const hipCenter = {
    x: ((LHip.x + RHip.x) / 2) * w,
    y: ((LHip.y + RHip.y) / 2) * h
  }
  const midCenter = { x: spineCenter.x * w, y: spineCenter.y * h }

  // 線條顏色：背部角度過小變紅
  ctx.strokeStyle = angles.back < 140 ? "rgba(255,0,0,0.85)" : "rgba(30,144,255,0.9)"
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(shoulderCenter.x, shoulderCenter.y)
  ctx.lineTo(midCenter.x, midCenter.y)
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
