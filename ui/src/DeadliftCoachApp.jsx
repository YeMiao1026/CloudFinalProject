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

// ============================================
// 🔢 硬舉計數器配置
// ============================================
// 動作階段：STANDING(站立) → DESCENDING(下降) → BOTTOM(最低點) → ASCENDING(上升) → STANDING
// 完成一次循環 = 1 rep
const REP_COUNTER_CONFIG = {
  // 髖部角度閾值（根據實際硬舉動作調整）
  // 髖部角度 = 肩-髖-膝 的夾角
  // 站立時約 170-180°，彎腰拿槓時約 90-120°
  standingAngle: 160,      // 高於此角度認為站立
  bottomAngle: 120,        // 低於此角度認為到達最低點
  
  // 防抖動配置
  minRepDuration: 800,     // 最短單次動作時間（毫秒）
  stableFrames: 4,         // 需連續 N 幀確認狀態改變
  
  // 平滑係數（0-1，越低越平滑但延遲越高）
  smoothingFactor: 0.4,
  
  // 自動組數配置
  restTimeThreshold: 10000, // 休息超過此時間（毫秒）自動開始新組
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
  
  // ============================================
  // 🎛️ 分析模式選擇
  // ============================================
  // 'realtime' = 只用即時計算（前端）
  // 'ai' = 只用 AI 分析（後端 ML）
  // 'combined' = 兩者互補（預設）
  const [analysisMode, setAnalysisMode] = useState('combined');
  
  // ============================================
  // 🤖 ML 模型狀態
  // ============================================
  const [mlLabels, setMlLabels] = useState([]);           // ML 偵測到的問題標籤
  const [mlReady, setMlReady] = useState(false);          // ML 是否準備好（30幀收集完成）
  const [mlFrameCount, setMlFrameCount] = useState(0);    // 已收集的幀數
  const [combinedWarning, setCombinedWarning] = useState(null); // 整合警告（即時+ML）
  
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
// 🔢 硬舉計數器狀態
// ============================================
  const [repCount, setRepCount] = useState(0);           // 當前組次數
  const [setCount, setSetCount] = useState(1);           // 組數
  const [totalReps, setTotalReps] = useState(0);         // 總次數
  const [repPhase, setRepPhase] = useState('STANDING');  // 動作階段
  const [bestReps, setBestReps] = useState(0);           // 最佳組次數
  const [repProgress, setRepProgress] = useState(0);     // 🆕 動作進度 0-100%
  const [lastRepFeedback, setLastRepFeedback] = useState(null); // 🆕 上次完成反饋
  
  // ============================================
  // 📏 距離/位置檢測狀態
  // ============================================
  const [positionStatus, setPositionStatus] = useState({
    isReady: false,
    message: '請站到攝影機前方',
    details: [],
    suggestion: null
  });
  
  // 計數器內部 refs
  const lastRepTime = useRef(Date.now());                // 上次完成 rep 的時間
  const lastActivityTime = useRef(Date.now());           // 上次偵測到動作的時間
  const phaseStableFrames = useRef(0);                   // 階段穩定幀數
  const currentPhase = useRef('STANDING');               // 當前階段（ref 版本）
  const repHistory = useRef([]);                         // 每組次數歷史
  const smoothedHipAngle = useRef(180);                  // 平滑後的髖部角度

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
  // 📏 距離/位置檢測函式
  // ============================================
  const checkPositionAndDistance = useCallback((landmarks) => {
    // 硬舉需要的關鍵點
    const keyPoints = {
      nose: landmarks[0],
      leftShoulder: landmarks[11],
      rightShoulder: landmarks[12],
      leftHip: landmarks[23],
      rightHip: landmarks[24],
      leftKnee: landmarks[25],
      rightKnee: landmarks[26],
      leftAnkle: landmarks[27],
      rightAnkle: landmarks[28],
    };
    
    const issues = [];
    const MIN_VISIBILITY = 0.5;
    const MARGIN = 0.05; // 邊界容差
    
    // 1. 檢查關鍵點可見度
    const visibilityCheck = {
      '頭部': keyPoints.nose.visibility > MIN_VISIBILITY,
      '左肩': keyPoints.leftShoulder.visibility > MIN_VISIBILITY,
      '右肩': keyPoints.rightShoulder.visibility > MIN_VISIBILITY,
      '左髖': keyPoints.leftHip.visibility > MIN_VISIBILITY,
      '右髖': keyPoints.rightHip.visibility > MIN_VISIBILITY,
      '左膝': keyPoints.leftKnee.visibility > MIN_VISIBILITY,
      '右膝': keyPoints.rightKnee.visibility > MIN_VISIBILITY,
      '左踝': keyPoints.leftAnkle.visibility > MIN_VISIBILITY,
      '右踝': keyPoints.rightAnkle.visibility > MIN_VISIBILITY,
    };
    
    const invisibleParts = Object.entries(visibilityCheck)
      .filter(([_, visible]) => !visible)
      .map(([part]) => part);
    
    // 2. 檢查是否在畫面範圍內
    const inFrameCheck = (point, name) => {
      if (point.x < MARGIN) return { part: name, issue: 'left' };
      if (point.x > 1 - MARGIN) return { part: name, issue: 'right' };
      if (point.y < MARGIN) return { part: name, issue: 'top' };
      if (point.y > 1 - MARGIN) return { part: name, issue: 'bottom' };
      return null;
    };
    
    const outOfFrame = [
      inFrameCheck(keyPoints.nose, '頭部'),
      inFrameCheck(keyPoints.leftShoulder, '左肩'),
      inFrameCheck(keyPoints.rightShoulder, '右肩'),
      inFrameCheck(keyPoints.leftAnkle, '左腳'),
      inFrameCheck(keyPoints.rightAnkle, '右腳'),
    ].filter(x => x !== null);
    
    // 3. 檢查身體大小（距離判斷）
    const shoulderY = (keyPoints.leftShoulder.y + keyPoints.rightShoulder.y) / 2;
    const ankleY = (keyPoints.leftAnkle.y + keyPoints.rightAnkle.y) / 2;
    const bodyHeight = Math.abs(ankleY - shoulderY); // 身體在畫面中的相對高度
    
    const shoulderWidth = Math.abs(keyPoints.leftShoulder.x - keyPoints.rightShoulder.x);
    
    // 判斷距離
    let distanceSuggestion = null;
    let isDistanceOk = true;
    
    if (bodyHeight < 0.35) {
      // 身體太小 = 太遠
      distanceSuggestion = 'closer';
      isDistanceOk = false;
      issues.push('身體太小，請靠近攝影機');
    } else if (bodyHeight > 0.85) {
      // 身體太大 = 太近
      distanceSuggestion = 'farther';
      isDistanceOk = false;
      issues.push('身體太大，請遠離攝影機');
    }
    
    // 檢查是否有部位超出畫面
    if (outOfFrame.length > 0) {
      const topIssues = outOfFrame.filter(x => x.issue === 'top');
      const bottomIssues = outOfFrame.filter(x => x.issue === 'bottom');
      const leftIssues = outOfFrame.filter(x => x.issue === 'left');
      const rightIssues = outOfFrame.filter(x => x.issue === 'right');
      
      if (topIssues.length > 0) {
        issues.push(`${topIssues.map(x => x.part).join('、')} 超出畫面上方`);
        if (!distanceSuggestion) distanceSuggestion = 'farther';
      }
      if (bottomIssues.length > 0) {
        issues.push(`${bottomIssues.map(x => x.part).join('、')} 超出畫面下方`);
        if (!distanceSuggestion) distanceSuggestion = 'farther';
      }
      if (leftIssues.length > 0 || rightIssues.length > 0) {
        issues.push('請站到畫面中央');
      }
    }
    
    // 檢查不可見的部位
    if (invisibleParts.length > 0) {
      issues.push(`無法偵測到：${invisibleParts.join('、')}`);
      // 如果下半身看不到，可能太近
      if (invisibleParts.some(p => p.includes('膝') || p.includes('踝'))) {
        if (!distanceSuggestion) distanceSuggestion = 'farther';
      }
      // 如果上半身看不到，可能位置不對
      if (invisibleParts.some(p => p.includes('肩') || p.includes('頭'))) {
        if (!distanceSuggestion) distanceSuggestion = 'adjust';
      }
    }
    
    // 綜合判斷
    const isReady = issues.length === 0 && isDistanceOk;
    
    let message = '✅ 位置完美！可以開始';
    let suggestion = null;
    
    if (!isReady) {
      if (distanceSuggestion === 'closer') {
        message = '📏 請靠近攝影機一點';
        suggestion = '👉 往前走一步';
      } else if (distanceSuggestion === 'farther') {
        message = '📏 請遠離攝影機一點';
        suggestion = '👈 往後退一步';
      } else if (distanceSuggestion === 'adjust') {
        message = '📏 請調整站位';
        suggestion = '確保全身都在畫面中';
      } else {
        message = '⚠️ 請調整位置';
        suggestion = issues[0];
      }
    }
    
    return {
      isReady,
      message,
      details: issues,
      suggestion,
      bodyHeight: (bodyHeight * 100).toFixed(0),
      shoulderWidth: (shoulderWidth * 100).toFixed(0)
    };
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

  // ============================================
  // 🔢 硬舉計數器邏輯（優化版）
  // ============================================
  const updateRepCounter = useCallback((hipAngle) => {
    const now = Date.now();
    
    // 髖部角度平滑處理（使用配置中的係數）
    const α = REP_COUNTER_CONFIG.smoothingFactor;
    smoothedHipAngle.current = α * hipAngle + (1 - α) * smoothedHipAngle.current;
    const smoothHip = smoothedHipAngle.current;
    
    // 📊 計算動作進度（用於即時回饋）
    const standAngle = REP_COUNTER_CONFIG.standingAngle;
    const bottomAngle = REP_COUNTER_CONFIG.bottomAngle;
    const angleRange = standAngle - bottomAngle;
    
    // 進度 0% = 站立，100% = 最低點
    let progress = 0;
    if (smoothHip < standAngle) {
      progress = Math.min(100, Math.max(0, (standAngle - smoothHip) / angleRange * 100));
    }
    
    // 判斷目標階段
    let targetPhase = currentPhase.current;
    
    if (smoothHip >= REP_COUNTER_CONFIG.standingAngle) {
      targetPhase = 'STANDING';
    } else if (smoothHip <= REP_COUNTER_CONFIG.bottomAngle) {
      targetPhase = 'BOTTOM';
    } else if (currentPhase.current === 'STANDING' && smoothHip < REP_COUNTER_CONFIG.standingAngle) {
      targetPhase = 'DESCENDING';
    } else if (currentPhase.current === 'BOTTOM' && smoothHip > REP_COUNTER_CONFIG.bottomAngle) {
      targetPhase = 'ASCENDING';
    }
    
    // 穩定幀數確認
    if (targetPhase !== currentPhase.current) {
      phaseStableFrames.current++;
      
      if (phaseStableFrames.current >= REP_COUNTER_CONFIG.stableFrames) {
        const prevPhase = currentPhase.current;
        currentPhase.current = targetPhase;
        phaseStableFrames.current = 0;
        
        // 🎯 計數邏輯：從 ASCENDING 回到 STANDING = 完成一次
        if (prevPhase === 'ASCENDING' && targetPhase === 'STANDING') {
          const timeSinceLastRep = now - lastRepTime.current;
          
          // 防抖動：檢查最短動作時間
          if (timeSinceLastRep >= REP_COUNTER_CONFIG.minRepDuration) {
            lastRepTime.current = now;
            
            setRepCount(prev => {
              const newCount = prev + 1;
              // 更新最佳記錄
              setBestReps(best => Math.max(best, newCount));
              
              // 🆕 觸發完成反饋動畫
              setLastRepFeedback({ count: newCount, time: now });
              setTimeout(() => setLastRepFeedback(null), 1500);
              
              return newCount;
            });
            setTotalReps(prev => prev + 1);
            
            // 播放成功音效
            playSuccessSound();
          }
        }
        
        // 🆕 到達最低點時播放提示音
        if (targetPhase === 'BOTTOM') {
          playPhaseSound('bottom');
        }
        
        setRepPhase(targetPhase);
        lastActivityTime.current = now;
      }
    } else {
      phaseStableFrames.current = 0;
    }
    
    // 🆕 即時更新進度
    setRepProgress(progress);
    
    // 自動檢測組間休息（長時間站立 = 新組）
    if (currentPhase.current === 'STANDING' && repCount > 0) {
      const restTime = now - lastActivityTime.current;
      if (restTime > REP_COUNTER_CONFIG.restTimeThreshold) {
        // 記錄前一組
        repHistory.current.push(repCount);
        setSetCount(prev => prev + 1);
        setRepCount(0);
        lastActivityTime.current = now;
      }
    }
    
    return {
      phase: currentPhase.current,
      smoothedAngle: smoothHip,
      isActive: currentPhase.current !== 'STANDING',
      progress: progress,  // 新增：動作進度 0-100%
      rawAngle: hipAngle   // 新增：原始角度
    };
  }, [repCount]);

  // ============================================
  // 🔊 播放成功音效（完成一次動作）
  // ============================================
  const playSuccessSound = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      
      // 播放兩個音符的和弦（更明顯的成功感）
      [523.25, 659.25].forEach((freq, i) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.frequency.value = freq;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.25, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        
        oscillator.start(ctx.currentTime + i * 0.05);
        oscillator.stop(ctx.currentTime + 0.25);
      });
    } catch (e) {
      console.warn('Audio not supported:', e);
    }
  }, []);

  // ============================================
  // 🔊 播放階段提示音
  // ============================================
  const playPhaseSound = useCallback((phase) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      // 不同階段不同音調
      if (phase === 'bottom') {
        oscillator.frequency.value = 392; // G4 - 到達底部
      } else {
        oscillator.frequency.value = 440; // A4 - 其他
      }
      oscillator.type = 'triangle';
      
      gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.1);
    } catch (e) {
      console.warn('Audio not supported:', e);
    }
  }, []);

  // ============================================
  // 🔄 重置計數器
  // ============================================
  const resetCounter = useCallback(() => {
    setRepCount(0);
    setSetCount(1);
    setTotalReps(0);
    setBestReps(0);
    setRepPhase('STANDING');
    setRepProgress(0);
    repHistory.current = [];
    lastRepTime.current = Date.now();
    lastActivityTime.current = Date.now();
    currentPhase.current = 'STANDING';
  }, []);

  // ============================================
  // ➕ 手動開始新組
  // ============================================
  const startNewSet = useCallback(() => {
    if (repCount > 0) {
      repHistory.current.push(repCount);
    }
    setSetCount(prev => prev + 1);
    setRepCount(0);
    lastActivityTime.current = Date.now();
  }, [repCount]);

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
    
    // 📏 檢測位置和距離是否適當
    const posResult = checkPositionAndDistance(landmarks);
    setPositionStatus(posResult);
    
    // 3. 偵測是否正在做硬舉（先判斷，再傳給圓背偵測）
    const isLifting = hipAngle < DEADLIFT_DETECTION.hipAngleThreshold;
    setIsDoingDeadlift(isLifting);
    
    // 4. 🏥 運動醫學級圓背偵測（含時間穩定機制）
    const spineResult = detectRoundedBack(landmarks, isLifting);
    
    // 4.5 🔢 更新硬舉計數器
    const counterResult = updateRepCounter(hipAngle);
    
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

    // 8. 呼叫後端 API 進行圓背偵測和 ML 分析
    // 'realtime' 模式下跳過後端 API 呼叫
    if (analysisMode === 'realtime') return;
    
    const now = Date.now();
    // 🔧 優化：提高 API 呼叫頻率到 100ms，因為圓背偵測需要即時反饋
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
        // 🏥 使用後端的圓背偵測結果
        if (data.spine) {
          const backendSpine = data.spine;
          setSpineStatus({
            status: backendSpine.status,
            confirmedStatus: backendSpine.confirmed_status,
            message: backendSpine.message,
            isRounded: backendSpine.is_rounded,
            spineCurvature: backendSpine.spine_curvature,
            warningFrames: backendSpine.warning_frames,
            dangerFrames: backendSpine.danger_frames
          });
          
          // 更新角度（使用後端計算的值）
          setAngles(prev => ({
            ...prev,
            spineCurvature: backendSpine.spine_curvature,
            hip: backendSpine.hip_angle
          }));
          
          // 更新是否正在做硬舉
          setIsDoingDeadlift(backendSpine.is_lifting);
          
          // 播放警告音效（只在確認狀態為危險時播放）
          if (backendSpine.is_lifting && 
              (backendSpine.confirmed_status === 'critical' || backendSpine.confirmed_status === 'danger')) {
            playWarningSound(backendSpine.confirmed_status);
          }
        }
        
        // ============================================
        // 🤖 ML 模型結果處理
        // ============================================
        setMlReady(data.ml_ready || false);
        
        // 🔧 使用後端回傳的實際幀數
        if (data.ml_frame_count !== undefined) {
          setMlFrameCount(data.ml_frame_count);
        } else if (!data.ml_ready) {
          // 後備：如果後端沒回傳，才用前端估算
          setMlFrameCount(prev => Math.min(prev + 1, 29));
        } else {
          setMlFrameCount(30);
        }
        
        if (data.ml_ready && data.A) {
          setMlLabels(data.A);
          
          // 🎯 整合警告邏輯：即時偵測 + ML 確認
          const spineWarning = data.spine?.is_rounded;
          const mlHasRoundedBack = data.A.includes('rounded_back');
          
          if (spineWarning && mlHasRoundedBack) {
            // 雙重確認：即時 + ML 都偵測到 → 強烈警告
            setCombinedWarning({
              level: 'critical',
              message: '🚨 AI 確認：圓背姿勢！請立即調整',
              source: 'both'
            });
          } else if (mlHasRoundedBack) {
            // 只有 ML 偵測到 → 中度警告
            setCombinedWarning({
              level: 'ml-warning',
              message: '🤖 AI 分析：偵測到圓背傾向',
              source: 'ml'
            });
          } else if (spineWarning) {
            // 只有即時偵測 → 輕度警告（可能誤報）
            setCombinedWarning({
              level: 'realtime-warning',
              message: '⚠️ 注意背部姿勢（待 AI 確認）',
              source: 'realtime'
            });
          } else if (data.A.length > 0) {
            // ML 偵測到其他問題
            setCombinedWarning({
              level: 'info',
              message: `🤖 AI 建議：${data.A.join('、')}`,
              source: 'ml'
            });
          } else {
            // 一切正常
            setCombinedWarning(null);
          }
        } else if (!data.ml_ready) {
          // ML 尚未準備好
          setCombinedWarning(null);
        }
      })
      .catch(err => {
        // API 失敗時回退到前端計算（已在上面完成）
        console.warn("API Error, using frontend fallback:", err.message);
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
      
      {/* 📏 位置/距離檢測提示 - 最上方顯示 */}
      <PositionIndicator positionStatus={positionStatus} />
      
      {/* 🆕 分析模式選擇器 */}
      <div className="analysis-mode-selector">
        <div className="mode-label">分析模式：</div>
        <div className="mode-buttons">
          <button 
            className={`mode-btn ${analysisMode === 'realtime' ? 'active' : ''}`}
            onClick={() => setAnalysisMode('realtime')}
            title="只使用前端即時計算，不需網路連線"
          >
            ⚡ 即時
          </button>
          <button 
            className={`mode-btn ${analysisMode === 'ai' ? 'active' : ''}`}
            onClick={() => setAnalysisMode('ai')}
            title="只使用後端 AI 機器學習模型分析"
          >
            🤖 AI
          </button>
          <button 
            className={`mode-btn ${analysisMode === 'combined' ? 'active' : ''}`}
            onClick={() => setAnalysisMode('combined')}
            title="結合即時計算 + AI 模型，提供最完整的分析"
          >
            🔗 組合
          </button>
        </div>
      </div>
      
      {/* 動作狀態指示 */}
      <div className="status-bar">
        <div className={`action-status-badge ${isDoingDeadlift ? 'active' : 'standby'}`}>
          {isDoingDeadlift ? '🏋️ 硬舉中' : '🧍 準備中'}
        </div>
      </div>
      
      {/* 🔢 大型計數器顯示（視頻左上角）- 優化版 */}
      <div className={`rep-counter-overlay ${lastRepFeedback ? 'rep-success' : ''}`}>
        {/* 完成動作的慶祝動畫 */}
        {lastRepFeedback && (
          <div className="rep-celebration">
            <span className="celebration-text">+1</span>
          </div>
        )}
        
        <div className="rep-count-big">{repCount}</div>
        <div className="rep-count-label">REPS</div>
        
        {/* 動作進度條 */}
        <div className="rep-progress-container">
          <div className="rep-progress-bar">
            <div 
              className={`rep-progress-fill ${repPhase.toLowerCase()}`}
              style={{ width: `${repProgress}%` }}
            />
          </div>
          <div className="rep-progress-text">
            {repProgress > 0 ? `${Math.round(repProgress)}%` : '準備'}
          </div>
        </div>
        
        <div className="phase-indicator">
          <span className={`phase-dot ${repPhase.toLowerCase()}`}></span>
          {repPhase === 'STANDING' && '站立'}
          {repPhase === 'DESCENDING' && '⬇️ 下降中'}
          {repPhase === 'BOTTOM' && '⏬ 最低點'}
          {repPhase === 'ASCENDING' && '⬆️ 上升中'}
        </div>
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
              <Card 
                title="髖部角度" 
                value={angles.hip} 
                unit="°"
                highlight={angles.hip <= REP_COUNTER_CONFIG.bottomAngle}
                subtext={`站:>${REP_COUNTER_CONFIG.standingAngle}° 底:<${REP_COUNTER_CONFIG.bottomAngle}°`}
              />
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
          
          {/* 🔢 詳細計數器面板 */}
          <RepCounter 
            repCount={repCount}
            setCount={setCount}
            totalReps={totalReps}
            bestReps={bestReps}
            repPhase={repPhase}
            repProgress={repProgress}
            onReset={resetCounter}
            onNewSet={startNewSet}
          />
          
          <div className="feedback-system">
            <h3>智慧回饋系統</h3>
            
            {/* 根據分析模式顯示不同的回饋內容 */}
            {analysisMode === 'ai' ? (
              // AI 模式：只顯示 ML 分析結果
              <div className="feedback-box feedback-ai-mode">
                <span className="mode-indicator">🤖 AI 分析模式</span>
                {mlReady ? (
                  mlLabels.length > 0 ? (
                    <div className="ai-only-feedback">
                      <span className="warning-icon">⚠️</span>
                      AI 偵測到：{mlLabels.join('、')}
                    </div>
                  ) : (
                    <div className="ai-only-feedback good">
                      ✅ AI 分析：姿勢正確
                    </div>
                  )
                ) : (
                  <div className="ai-only-feedback loading">
                    ⏳ AI 正在學習中... ({mlFrameCount}/30 幀)
                  </div>
                )}
              </div>
            ) : (
              // 即時模式或組合模式：顯示即時回饋
              <div className={`feedback-box ${
                isDoingDeadlift && spineStatus.confirmedStatus === 'critical' ? 'feedback-critical' :
                isDoingDeadlift && spineStatus.confirmedStatus === 'danger' ? 'feedback-error' :
                isDoingDeadlift && spineStatus.status === 'warning' ? 'feedback-warning' :
                isDoingDeadlift && spineStatus.status === 'monitoring' ? 'feedback-monitoring' :
                'feedback-good'
              }`}>
                {analysisMode === 'realtime' && (
                  <span className="mode-indicator">⚡ 即時分析模式</span>
                )}
                {isDoingDeadlift && (spineStatus.confirmedStatus === 'critical' || spineStatus.confirmedStatus === 'danger') && <span className="warning-icon">⚠️</span>}
                {isDoingDeadlift ? spineStatus.message : '準備就緒，請開始動作'}
              </div>
            )}
          </div>
          
          {/* 🆕 🤖 ML 分析結果面板 - 只在 AI 或組合模式下顯示 */}
          {analysisMode !== 'realtime' && (
            <MlResultPanel 
              mlReady={mlReady}
              mlLabels={mlLabels}
              mlFrameCount={mlFrameCount}
              combinedWarning={combinedWarning}
              showCombinedWarning={analysisMode === 'combined'}
            />
          )}
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

// ============================================
// 🔢 組件：硬舉計數器（優化版）
// ============================================
const RepCounter = ({ repCount, setCount, totalReps, bestReps, repPhase, repProgress, onReset, onNewSet }) => {
  const getPhaseInfo = () => {
    switch (repPhase) {
      case 'STANDING': return { icon: '🧍', text: '站立準備', color: '#4CAF50' };
      case 'DESCENDING': return { icon: '⬇️', text: '下降中...', color: '#FF9800' };
      case 'BOTTOM': return { icon: '⏬', text: '到達底部！', color: '#2196F3' };
      case 'ASCENDING': return { icon: '⬆️', text: '上升中...', color: '#9C27B0' };
      default: return { icon: '🔄', text: '偵測中', color: '#757575' };
    }
  };
  
  const phaseInfo = getPhaseInfo();

  return (
    <div className="rep-counter-container">
      <div className="rep-counter-header">
        <span className="rep-counter-title">🔢 硬舉計數器</span>
        <div className="rep-counter-actions">
          <button className="counter-btn new-set-btn" onClick={onNewSet} title="開始新組">
            ➕ 新組
          </button>
          <button className="counter-btn reset-btn" onClick={onReset} title="重置所有">
            🔄
          </button>
        </div>
      </div>
      
      <div className="rep-counter-main">
        <div className="current-rep">
          <div className="rep-number">{repCount}</div>
          <div className="rep-label">當前組次數</div>
        </div>
        
        <div className="rep-stats">
          <div className="stat-item">
            <span className="stat-value">{setCount}</span>
            <span className="stat-label">組數</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{totalReps}</span>
            <span className="stat-label">總次數</span>
          </div>
          <div className="stat-item best">
            <span className="stat-value">{bestReps}</span>
            <span className="stat-label">最佳</span>
          </div>
        </div>
      </div>
      
      {/* 🆕 即時進度條 */}
      <div className="rep-progress-section">
        <div className="progress-header">
          <span>動作進度</span>
          <span className="progress-percent">{Math.round(repProgress || 0)}%</span>
        </div>
        <div className="progress-track">
          <div 
            className={`progress-fill ${repPhase.toLowerCase()}`}
            style={{ width: `${repProgress || 0}%` }}
          />
        </div>
      </div>
      
      <div className="phase-status" style={{ borderColor: phaseInfo.color, backgroundColor: `${phaseInfo.color}15` }}>
        <span className="phase-icon">{phaseInfo.icon}</span>
        <span className="phase-text" style={{ color: phaseInfo.color }}>{phaseInfo.text}</span>
      </div>
    </div>
  );
};

// ============================================
// 🤖 組件：ML 分析結果面板
// ============================================
const ML_LABEL_TRANSLATIONS = {
  'rounded_back': '🔴 圓背',
  'early_hip_drive': '⚠️ 過早伸髖',
  'knee_cave': '⚠️ 膝蓋內夾',
  'good_form': '✅ 姿勢良好',
  'lockout_incomplete': '⚠️ 鎖定不完全',
  'bar_drift': '⚠️ 槓鈴偏移',
  'hyperextension': '⚠️ 過度後仰',
  // 添加更多標籤翻譯...
};

const MlResultPanel = ({ mlReady, mlLabels, mlFrameCount, combinedWarning, showCombinedWarning = true }) => {
  const translateLabel = (label) => {
    return ML_LABEL_TRANSLATIONS[label] || label;
  };
  
  const getWarningClass = () => {
    if (!combinedWarning) return '';
    switch (combinedWarning.level) {
      case 'critical': return 'ml-warning-critical';
      case 'ml-warning': return 'ml-warning-medium';
      case 'realtime-warning': return 'ml-warning-light';
      case 'info': return 'ml-warning-info';
      default: return '';
    }
  };

  return (
    <div className="ml-result-panel">
      <div className="ml-panel-header">
        <span className="ml-panel-title">🤖 AI 分析</span>
        <span className={`ml-status-badge ${mlReady ? 'ready' : 'loading'}`}>
          {mlReady ? '✅ 就緒' : `⏳ ${mlFrameCount}/30`}
        </span>
      </div>
      
      {/* ML 進度條 */}
      {!mlReady && (
        <div className="ml-progress-container">
          <div className="ml-progress-bar">
            <div 
              className="ml-progress-fill"
              style={{ width: `${(mlFrameCount / 30) * 100}%` }}
            />
          </div>
          <span className="ml-progress-text">收集數據中...</span>
        </div>
      )}
      
      {/* 整合警告 - 只在組合模式下顯示 */}
      {showCombinedWarning && combinedWarning && (
        <div className={`ml-combined-warning ${getWarningClass()}`}>
          <span className="warning-message">{combinedWarning.message}</span>
          {combinedWarning.source === 'both' && (
            <span className="warning-badge double-confirm">雙重確認</span>
          )}
        </div>
      )}
      
      {/* ML 標籤列表 */}
      {mlReady && mlLabels.length > 0 && (
        <div className="ml-labels-container">
          <div className="ml-labels-title">偵測到的問題：</div>
          <div className="ml-labels-list">
            {mlLabels.map((label, idx) => (
              <span 
                key={idx} 
                className={`ml-label-tag ${label === 'good_form' ? 'good' : 'warning'}`}
              >
                {translateLabel(label)}
              </span>
            ))}
          </div>
        </div>
      )}
      
      {/* 無問題顯示 */}
      {mlReady && mlLabels.length === 0 && (
        <div className="ml-no-issues">
          <span className="no-issues-icon">✅</span>
          <span className="no-issues-text">AI 分析：姿勢良好</span>
        </div>
      )}
    </div>
  );
};

// ============================================
// 📏 組件：位置/距離檢測指示器
// ============================================
const PositionIndicator = ({ positionStatus }) => {
  if (!positionStatus) return null;
  
  const { isReady, message, suggestion, details, bodyHeight, shoulderWidth } = positionStatus;
  
  return (
    <div className={`position-indicator ${isReady ? 'ready' : 'not-ready'}`}>
      <div className="position-main">
        <span className={`position-icon ${isReady ? 'ready' : 'warning'}`}>
          {isReady ? '✅' : '📏'}
        </span>
        <span className="position-message">{message}</span>
      </div>
      
      {!isReady && suggestion && (
        <div className="position-suggestion">
          <span className="suggestion-arrow">
            {suggestion.includes('前') ? '👉' : suggestion.includes('後') ? '👈' : '📍'}
          </span>
          <span className="suggestion-text">{suggestion}</span>
        </div>
      )}
      
      {/* 調試資訊 - 可選顯示 */}
      {bodyHeight && (
        <div className="position-debug">
          <span>身高佔比: {bodyHeight}%</span>
          <span className="debug-hint">(理想: 35-85%)</span>
        </div>
      )}
    </div>
  );
};
