import React, { useEffect, useRef, useState, useCallback } from "react"
import "./DeadliftCoach.css"

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE) || 'http://127.0.0.1:8000';

// ============================================
// 🏥 運動醫學級脊椎曲率閾值設定
// ============================================
// 脊椎曲率角度：上段向量（肩→頭）與下段向量（髖→肩）的夾角
// 0° = 向量共線（脊椎完全直線）
// 角度越大 = 脊椎屈曲越嚴重（圓背）
// 
// 醫學依據：
// - 正常硬舉時，即使 hip hinge 前傾很大，脊椎仍應保持中立
// - 只有「上下段脊椎向量夾角」變大才是真正的圓背
// - 此方法不會把正確的 hip hinge 前傾誤判為圓背
const SPINE_THRESHOLDS = {
  safe: 10,       // ≤ 10° 中立（安全）
  warning: 20,    // 10°-20° 輕微彎曲（警告）
  danger: 30,     // 20°-30° 圓背（高風險）
  critical: 40    // > 30° 嚴重圓背（立即停止）
};

// 時間穩定機制：連續超過閾值 N 幀才觸發警告
const STABILITY_CONFIG = {
  frameThreshold: 10,  // 需連續 10 幀超過閾值才觸發
  smoothingFactor: 0.3 // 角度平滑係數 (0-1, 越小越平滑)
};

// 硬舉動作偵測閾值
const DEADLIFT_DETECTION = {
  hipAngleThreshold: 160,  // 髖部角度低於此值時認為開始硬舉
};

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
  const [angles, setAngles] = useState({ knee: 0, hip: 0, spineCurvature: 0 })
  const [feedback, setFeedback] = useState({ text: "等待分析中…", level: "ok" })
  const [spineStatus, setSpineStatus] = useState({ status: 'safe', message: '準備就緒', isRounded: false })
  const [isDoingDeadlift, setIsDoingDeadlift] = useState(false)
  
  const sessionId = useRef(`session-${Date.now()}`);
  const lastApiCallTime = useRef(0);
  const isFetching = useRef(false);
  const audioContextRef = useRef(null);
  const lastAlertTime = useRef(0);
  
  // 時間穩定機制：追蹤連續超標幀數
  const warningFrameCount = useRef(0);
  const dangerFrameCount = useRef(0);
  const smoothedAngle = useRef(0);  // 平滑後的角度

  // ============================================
  // 🔊 播放警告音效
  // ============================================
  const playWarningSound = useCallback((severity) => {
    const now = Date.now();
    const minInterval = severity === 'critical' ? 1000 : 2000;
    if (now - lastAlertTime.current < minInterval) return;
    lastAlertTime.current = now;

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.value = severity === 'critical' ? 880 : 660;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch (e) {
      console.warn('Audio not supported:', e);
    }
  }, []);

  // ============================================
  // 🏥 運動醫學級圓背偵測函式（含時間穩定機制）
  // ============================================
  const detectRoundedBack = useCallback((landmarks, isLifting) => {
    // 建立脊椎中線關鍵點
    const nose = { x: landmarks[0].x, y: landmarks[0].y };
    const midShoulder = {
      x: (landmarks[11].x + landmarks[12].x) / 2,
      y: (landmarks[11].y + landmarks[12].y) / 2
    };
    const midHip = {
      x: (landmarks[23].x + landmarks[24].x) / 2,
      y: (landmarks[23].y + landmarks[24].y) / 2
    };
    
    // ============================================
    // 向量計算
    // ============================================
    // 上段脊椎向量：mid_shoulder → nose（頸椎/上背方向）
    const upperSpine = {
      x: nose.x - midShoulder.x,
      y: nose.y - midShoulder.y
    };
    
    // 下段脊椎向量：mid_hip → mid_shoulder（腰椎/下背方向）
    const lowerSpine = {
      x: midShoulder.x - midHip.x,
      y: midShoulder.y - midHip.y
    };
    
    // ============================================
    // 計算脊椎曲率角度（兩向量夾角）
    // ============================================
    // 使用 cosine angle: θ = arccos(v1·v2 / |v1||v2|)
    // 0° = 向量共線（脊椎完全直線）
    // 角度越大 = 脊椎彎曲越嚴重
    const dot = upperSpine.x * lowerSpine.x + upperSpine.y * lowerSpine.y;
    const mag1 = Math.sqrt(upperSpine.x ** 2 + upperSpine.y ** 2);
    const mag2 = Math.sqrt(lowerSpine.x ** 2 + lowerSpine.y ** 2);
    
    let rawCurvatureAngle = 0;
    if (mag1 * mag2 > 0) {
      const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
      rawCurvatureAngle = Math.acos(cosAngle) * 180 / Math.PI;
    }
    
    // ============================================
    // 角度平滑處理（低通濾波）
    // ============================================
    // smoothed = α * new + (1-α) * old
    const α = STABILITY_CONFIG.smoothingFactor;
    smoothedAngle.current = α * rawCurvatureAngle + (1 - α) * smoothedAngle.current;
    const spineCurvature = smoothedAngle.current;
    
    // ============================================
    // 時間穩定機制：連續幀數判斷
    // ============================================
    let status = 'safe';
    let message = '✅ 脊椎中立，姿勢良好';
    let isRounded = false;
    let confirmedStatus = 'safe';
    
    if (isLifting) {
      // 更新連續超標幀數
      if (spineCurvature > SPINE_THRESHOLDS.danger) {
        dangerFrameCount.current++;
        warningFrameCount.current++;
      } else if (spineCurvature > SPINE_THRESHOLDS.warning) {
        dangerFrameCount.current = 0;
        warningFrameCount.current++;
      } else if (spineCurvature > SPINE_THRESHOLDS.safe) {
        dangerFrameCount.current = 0;
        warningFrameCount.current++;
      } else {
        dangerFrameCount.current = 0;
        warningFrameCount.current = 0;
      }
      
      // 根據連續幀數判斷確認狀態
      const frameThreshold = STABILITY_CONFIG.frameThreshold;
      
      if (spineCurvature > SPINE_THRESHOLDS.critical) {
        // 嚴重圓背：立即警告（不需等待）
        confirmedStatus = 'critical';
        status = 'critical';
        message = `🚨 嚴重圓背 ${spineCurvature.toFixed(0)}°！立即停止！`;
        isRounded = true;
      } else if (dangerFrameCount.current >= frameThreshold && spineCurvature > SPINE_THRESHOLDS.danger) {
        // 高風險：連續 N 幀超過危險閾值
        confirmedStatus = 'danger';
        status = 'danger';
        message = `🔴 圓背警告！曲率 ${spineCurvature.toFixed(0)}°，請挺直背部`;
        isRounded = true;
      } else if (warningFrameCount.current >= frameThreshold && spineCurvature > SPINE_THRESHOLDS.warning) {
        // 警告：連續 N 幀超過警告閾值
        confirmedStatus = 'warning';
        status = 'warning';
        message = `⚠️ 注意：脊椎輕微彎曲 ${spineCurvature.toFixed(0)}°`;
        isRounded = false;
      } else if (spineCurvature > SPINE_THRESHOLDS.safe) {
        // 輕微超標但未達連續幀數，顯示提示但不確認警告
        status = 'monitoring';
        message = `👀 監測中... ${spineCurvature.toFixed(0)}°`;
        isRounded = false;
      }
    } else {
      // 未做硬舉時重置計數器
      warningFrameCount.current = 0;
      dangerFrameCount.current = 0;
    }
    
    return { 
      spineCurvature,           // 脊椎曲率角度（0° = 直線）
      rawAngle: rawCurvatureAngle,  // 原始角度（未平滑）
      status, 
      confirmedStatus,          // 經時間穩定確認的狀態
      message, 
      isRounded,
      warningFrames: warningFrameCount.current,
      dangerFrames: dangerFrameCount.current
    };
  }, []);

  // Mediapipe Pose 初始化與相機設定
  useEffect(() => {
    const pose = new window.Pose({
      locateFile: (file) => `/mediapipe/pose/${file}`
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

    // 2. 計算基本角度
    const getPoint = (idx) => ({ x: landmarks[idx].x, y: landmarks[idx].y });
    const mid = (p1, p2) => ({ x: (p1.x + p2.x)/2, y: (p1.y + p2.y)/2 });
    
    const shoulder = mid(getPoint(11), getPoint(12));
    const hip = mid(getPoint(23), getPoint(24));
    const knee = mid(getPoint(25), getPoint(26));
    const ankle = mid(getPoint(27), getPoint(28));
    
    // 計算三點夾角
    const calcAngle = (a, b, c) => {
      const ba = { x: a.x - b.x, y: a.y - b.y };
      const bc = { x: c.x - b.x, y: c.y - b.y };
      const dot = ba.x * bc.x + ba.y * bc.y;
      const magBA = Math.sqrt(ba.x ** 2 + ba.y ** 2);
      const magBC = Math.sqrt(bc.x ** 2 + bc.y ** 2);
      if (magBA * magBC === 0) return 0;
      return Math.acos(Math.max(-1, Math.min(1, dot / (magBA * magBC)))) * 180 / Math.PI;
    };

    const kneeAngle = calcAngle(hip, knee, ankle);
    const hipAngle = calcAngle(shoulder, hip, knee);
    
    // 3. 偵測是否正在做硬舉（先判斷，再傳給圓背偵測）
    const isLifting = hipAngle < DEADLIFT_DETECTION.hipAngleThreshold;
    setIsDoingDeadlift(isLifting);
    
    // 4. 🏥 運動醫學級圓背偵測（含時間穩定機制）
    const spineResult = detectRoundedBack(landmarks, isLifting);
    
    // 5. 更新角度狀態
    const newAngles = {
      knee: kneeAngle,
      hip: hipAngle,
      spineCurvature: spineResult.spineCurvature
    };
    setAngles(newAngles);
    
    // 6. 更新脊椎狀態（只在做硬舉時判斷危險）
    if (isLifting) {
      setSpineStatus(spineResult);
      
      // 播放警告音效（只在確認狀態為危險時播放）
      if (spineResult.confirmedStatus === 'critical' || spineResult.confirmedStatus === 'danger') {
        playWarningSound(spineResult.confirmedStatus);
      }
    } else {
      setSpineStatus({ 
        status: 'safe', 
        confirmedStatus: 'safe',
        message: '準備就緒，請開始動作', 
        isRounded: false,
        spineCurvature: spineResult.spineCurvature,
        warningFrames: 0,
        dangerFrames: 0
      });
    }
    
    // 7. 繪製骨架
    drawSkeleton(kps, newAngles, spineResult, isLifting);

    // 8. 呼叫後端 API
    const now = Date.now();
    if (now - lastApiCallTime.current > 100 && !isFetching.current) {
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

  // ============================================
  // 🎨 繪製骨架與脊椎視覺化
  // ============================================
  const drawSkeleton = (kps, angles, spineResult, isLifting) => {
    if (!canvasRef.current || !videoRef.current || !kps) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { videoWidth: w, videoHeight: h } = videoRef.current;
    if (!w || !h) return;

    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // 🔴 關節點
    ctx.fillStyle = "red";
    kps.forEach(p => {
      if (p.score < 0.3) return;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // 🟢 骨架線
    ctx.strokeStyle = "rgba(0,255,0,0.7)";
    ctx.lineWidth = 3;
    mpEdges.forEach(([a, b]) => {
      const p1 = kps[a], p2 = kps[b];
      if (!p1 || !p2 || p1.score < 0.3 || p2.score < 0.3) return;
      ctx.beginPath();
      ctx.moveTo(p1.x * w, p1.y * h);
      ctx.lineTo(p2.x * w, p2.y * h);
      ctx.stroke();
    });

    // 🏥 脊椎向量視覺化
    const nose = kps[0];
    const LShoulder = kps[11], RShoulder = kps[12];
    const LHip = kps[23], RHip = kps[24];

    if (nose && [LShoulder, RShoulder, LHip, RHip].every(p => p && p.score > 0.4)) {
      const nosePoint = { x: nose.x * w, y: nose.y * h };
      const shoulderCenter = {
        x: ((LShoulder.x + RShoulder.x) / 2) * w,
        y: ((LShoulder.y + RShoulder.y) / 2) * h
      };
      const hipCenter = {
        x: ((LHip.x + RHip.x) / 2) * w,
        y: ((LHip.y + RHip.y) / 2) * h
      };

      const isRounded = isLifting && spineResult.isRounded;

      // 下段脊椎（髖→肩）
      ctx.strokeStyle = isRounded ? "rgba(255,50,50,0.9)" : "rgba(30,144,255,0.9)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(hipCenter.x, hipCenter.y);
      ctx.lineTo(shoulderCenter.x, shoulderCenter.y);
      ctx.stroke();

      // 上段脊椎（肩→頭）
      ctx.strokeStyle = isRounded ? "rgba(255,100,100,0.8)" : "rgba(50,205,50,0.8)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(shoulderCenter.x, shoulderCenter.y);
      ctx.lineTo(nosePoint.x, nosePoint.y);
      ctx.stroke();

      // 理想脊椎線（白色虛線延長）
      const lowerVec = {
        x: shoulderCenter.x - hipCenter.x,
        y: shoulderCenter.y - hipCenter.y
      };
      const vecLen = Math.sqrt(lowerVec.x ** 2 + lowerVec.y ** 2);
      if (vecLen > 0) {
        const idealNose = {
          x: shoulderCenter.x + (lowerVec.x / vecLen) * 60,
          y: shoulderCenter.y + (lowerVec.y / vecLen) * 60
        };
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(shoulderCenter.x, shoulderCenter.y);
        ctx.lineTo(idealNose.x, idealNose.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 關鍵點標記
      const spinePoints = [
        { ...nosePoint, color: "#FFD700", label: "頭" },
        { ...shoulderCenter, color: "#00FFFF", label: "肩" },
        { ...hipCenter, color: "#00FF00", label: "髖" }
      ];
      spinePoints.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "white";
        ctx.font = "bold 12px Arial";
        ctx.fillText(p.label, p.x + 12, p.y + 4);
      });

      // 脊椎資訊顯示
      const infoX = shoulderCenter.x + 20;
      const infoY = shoulderCenter.y - 30;
      
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(infoX - 5, infoY - 18, 145, 78);
      
      ctx.fillStyle = isRounded ? "#FF6B6B" : "#90EE90";
      ctx.font = "bold 14px Arial";
      ctx.fillText(`脊椎曲率: ${spineResult.spineCurvature.toFixed(1)}°`, infoX, infoY);
      
      // 顯示穩定機制狀態
      if (isLifting) {
        const frameThreshold = STABILITY_CONFIG.frameThreshold;
        const progressW = warningFrameCount.current;
        const progressD = dangerFrameCount.current;
        
        ctx.fillStyle = "#AAAAAA";
        ctx.font = "12px Arial";
        ctx.fillText(`警告幀: ${progressW}/${frameThreshold}`, infoX, infoY + 18);
        ctx.fillText(`危險幀: ${progressD}/${frameThreshold}`, infoX, infoY + 34);
        
        ctx.fillStyle = isRounded ? "#FF4444" : "#44FF44";
        ctx.font = "bold 14px Arial";
        ctx.fillText(isRounded ? "⚠️ 確認圓背!" : "✅ 脊椎中立", infoX, infoY + 54);
      } else {
        ctx.fillStyle = "#AAAAAA";
        ctx.font = "12px Arial";
        ctx.fillText("🧍 準備中", infoX, infoY + 18);
      }
    }
  };

  // 判斷是否顯示全螢幕警告（使用確認狀態，避免閃爍）
  const showDangerAlert = isDoingDeadlift && (spineStatus.confirmedStatus === 'critical' || spineStatus.confirmedStatus === 'danger');

  return (
    <div className={`squat-coach-app ${showDangerAlert ? 'danger-alert' : ''}`}>
      <button className="back-button" onClick={onBack}>
        ← 返回首頁
      </button>
      <h1 className="app-title">AI 硬舉姿勢分析系統</h1>
      
      {/* 動作狀態指示 */}
      <div className={`action-status-badge ${isDoingDeadlift ? 'active' : 'standby'}`}>
        {isDoingDeadlift ? '🏋️ 硬舉中' : '🧍 準備中'}
      </div>
      
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
              <Card 
                title="脊椎曲率" 
                value={angles.spineCurvature} 
                unit="°" 
                highlight={isDoingDeadlift && angles.spineCurvature > SPINE_THRESHOLDS.warning}
                subtext="0° = 直線"
              />
            </div>
          </div>
          
          {/* 脊椎狀態指示器 */}
          <SpineStatusIndicator status={spineStatus} isActive={isDoingDeadlift} />
          
          <div className="feedback-system">
            <h3>智慧回饋系統</h3>
            <div className={`feedback-box ${
              isDoingDeadlift && spineStatus.confirmedStatus === 'critical' ? 'feedback-critical' :
              isDoingDeadlift && spineStatus.confirmedStatus === 'danger' ? 'feedback-error' :
              isDoingDeadlift && spineStatus.status === 'warning' ? 'feedback-warning' :
              isDoingDeadlift && spineStatus.status === 'monitoring' ? 'feedback-monitoring' :
              'feedback-good'
            }`}>
              {isDoingDeadlift && (spineStatus.confirmedStatus === 'critical' || spineStatus.confirmedStatus === 'danger') && <span className="warning-icon">⚠️</span>}
              {isDoingDeadlift ? spineStatus.message : '準備就緒，請開始動作'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================
// 📊 組件：數據卡片
// ============================================
const Card = ({ title, value, unit, highlight, subtext }) => (
  <div className={`dashboard-card ${highlight ? 'card-highlight' : ''}`}>
    <div className="card-title">{title}</div>
    <div className="card-value">{(value || 0).toFixed(1)} {unit}</div>
    {subtext && <div className="card-subtext">{subtext}</div>}
  </div>
)

// ============================================
// 🏥 組件：脊椎狀態指示器
// ============================================
const SpineStatusIndicator = ({ status, isActive }) => {
  const getStatusClass = () => {
    if (!isActive) return 'status-standby';
    switch (status.confirmedStatus || status.status) {
      case 'critical': return 'status-critical';
      case 'danger': return 'status-danger';
      case 'warning': return 'status-warning';
      case 'monitoring': return 'status-monitoring';
      default: return 'status-safe';
    }
  };

  const getProgressWidth = () => {
    if (!isActive) return 0;
    const confirmed = status.confirmedStatus || status.status;
    switch (confirmed) {
      case 'critical': return 100;
      case 'danger': return 75;
      case 'warning': return 50;
      case 'monitoring': return 30;
      case 'safe': return 15;
      default: return 0;
    }
  };

  const getStatusLabel = () => {
    if (!isActive) return '待機';
    const confirmed = status.confirmedStatus || status.status;
    switch (confirmed) {
      case 'critical': return '🚨 嚴重';
      case 'danger': return '🔴 危險';
      case 'warning': return '⚠️ 注意';
      case 'monitoring': return '👀 監測';
      default: return '✅ 安全';
    }
  };

  return (
    <div className={`spine-status-container ${!isActive ? 'standby' : ''}`}>
      <div className="spine-status-header">
        <span className="spine-status-title">🏥 脊椎狀態 {!isActive && '(等待動作)'}</span>
        <span className={`spine-status-label ${getStatusClass()}`}>
          {getStatusLabel()}
        </span>
      </div>
      <div className="spine-status-bar">
        <div 
          className={`spine-status-progress ${getStatusClass()}`}
          style={{ width: `${getProgressWidth()}%` }}
        />
      </div>
      {isActive && status.warningFrames !== undefined && (
        <div className="spine-stability-info">
          <span>穩定計數: {status.warningFrames || 0}/{STABILITY_CONFIG.frameThreshold}</span>
        </div>
      )}
    </div>
  );
};
