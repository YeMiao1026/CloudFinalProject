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

// ============================================
// 🤖 ML 標籤翻譯對照表（放在頂層方便全局使用）
// ============================================
const ML_LABEL_TRANSLATIONS = {
  // 中文標籤（ML 模型實際返回的）
  '背部彎曲': '🔴 背部彎曲',
  '髖提早上升': '⚠️ 髖部過早上升',
  '啟動姿勢錯誤': '⚠️ 啟動姿勢錯誤',
  '杠鈴離身體太遠': '⚠️ 槓鈴離身體太遠',
  '正確動作': '✅ 姿勢正確',
  '站姿過寬': '⚠️ 站姿過寬',
  '結尾姿勢不完全': '⚠️ 鎖定不完全',
  '鎖膝過早': '⚠️ 鎖膝過早',
  '頭部位置錯誤': '⚠️ 頭部位置錯誤',
  // 備用英文標籤
  'rounded_back': '🔴 圓背',
  'early_hip_drive': '⚠️ 過早伸髖',
  'good_form': '✅ 姿勢良好',
};

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
  
  // ============================================
  // 🔊 語音提示系統
  // ============================================
  const [voiceEnabled, setVoiceEnabled] = useState(true);     // 語音開關
  const [voiceVolume, setVoiceVolume] = useState(1.0);        // 音量 0-1
  const lastVoiceTime = useRef(0);                            // 上次語音時間
  const lastVoiceMessage = useRef('');                        // 上次語音內容
  const speechSynthesis = useRef(window.speechSynthesis);     // 語音合成器
  
  // ============================================
  // 📊 訓練歷史記錄
  // ============================================
  const [trainingHistory, setTrainingHistory] = useState([]);  // 歷史紀錄列表
  const [showHistory, setShowHistory] = useState(false);       // 顯示歷史面板
  const currentSessionStats = useRef({                         // 當前訓練統計
    startTime: null,
    sets: [],
    totalReps: 0,
    warnings: { rounded_back: 0, other: 0 },
    goodFormCount: 0
  });
  
  // ============================================
  // 🏆 即時姿勢評分系統
  // ============================================
  const [currentRepScore, setCurrentRepScore] = useState(100);    // 當前動作分數
  const [lastRepScore, setLastRepScore] = useState(null);         // 上一下的分數
  const [avgRepScore, setAvgRepScore] = useState(0);              // 平均分數
  const [repScores, setRepScores] = useState([]);                 // 所有分數歷史
  const repScoreFactors = useRef({                                // 當前動作的評分因素
    spineDeductions: 0,      // 脊椎彎曲扣分
    depthBonus: 0,           // 深度獎勵
    speedPenalty: 0,         // 速度過快扣分
    stabilityBonus: 0,       // 穩定性獎勵
    warningCount: 0          // 警告次數
  });
  
  // ============================================
  // ⏱️ 組間休息計時器
  // ============================================
  const [restTimer, setRestTimer] = useState({
    isActive: false,           // 計時器是否啟動
    timeLeft: 0,               // 剩餘秒數
    totalTime: 90,             // 總休息時間（預設 90 秒）
    autoStart: true,           // 自動在完成一組後啟動
    showTimer: false           // 顯示計時器面板
  });
  const restTimerInterval = useRef(null);
  const lastSetEndTime = useRef(null);
  
  // ============================================
  // 🎯 目標設定系統
  // ============================================
  const GOALS_STORAGE_KEY = 'deadlift_training_goals';
  const ACHIEVEMENTS_STORAGE_KEY = 'deadlift_achievements';
  
  const [dailyGoals, setDailyGoals] = useState({
    targetSets: 5,              // 目標組數
    targetReps: 25,             // 目標總次數
    currentSets: 0,             // 今日完成組數
    currentReps: 0,             // 今日完成次數
    lastResetDate: null,        // 上次重置日期
    showGoalPanel: false        // 顯示目標面板
  });
  
  // ============================================
  // 🏆 成就徽章系統
  // ============================================
  const [achievements, setAchievements] = useState({
    unlocked: [],               // 已解鎖成就 ID 列表
    newUnlocked: null,          // 新解鎖的成就（用於動畫）
    showPanel: false,           // 顯示成就面板
    stats: {                    // 累計統計
      totalReps: 0,             // 累計總次數
      totalSets: 0,             // 累計總組數
      totalSessions: 0,         // 累計訓練次數
      consecutiveDays: 0,       // 連續訓練天數
      lastTrainingDate: null,   // 上次訓練日期
      bestDailyReps: 0,         // 單日最佳次數
      perfectReps: 0,           // 完美姿勢次數（90分以上）
      avgScore: 0               // 累計平均分數
    }
  });
  
  // 成就定義
  const ACHIEVEMENT_DEFINITIONS = {
    first_rep: {
      id: 'first_rep',
      name: '初試身手',
      description: '完成第一下硬舉',
      icon: '🎉',
      condition: (stats) => stats.totalReps >= 1
    },
    rep_10: {
      id: 'rep_10',
      name: '熱身完畢',
      description: '累計完成 10 下硬舉',
      icon: '💪',
      condition: (stats) => stats.totalReps >= 10
    },
    rep_50: {
      id: 'rep_50',
      name: '漸入佳境',
      description: '累計完成 50 下硬舉',
      icon: '🔥',
      condition: (stats) => stats.totalReps >= 50
    },
    rep_100: {
      id: 'rep_100',
      name: '百發百中',
      description: '累計完成 100 下硬舉',
      icon: '💯',
      condition: (stats) => stats.totalReps >= 100
    },
    rep_500: {
      id: 'rep_500',
      name: '鐵人精神',
      description: '累計完成 500 下硬舉',
      icon: '🏅',
      condition: (stats) => stats.totalReps >= 500
    },
    rep_1000: {
      id: 'rep_1000',
      name: '傳奇硬舉者',
      description: '累計完成 1000 下硬舉',
      icon: '🏆',
      condition: (stats) => stats.totalReps >= 1000
    },
    streak_3: {
      id: 'streak_3',
      name: '三日不懈',
      description: '連續訓練 3 天',
      icon: '📆',
      condition: (stats) => stats.consecutiveDays >= 3
    },
    streak_7: {
      id: 'streak_7',
      name: '一週堅持',
      description: '連續訓練 7 天',
      icon: '🗓️',
      condition: (stats) => stats.consecutiveDays >= 7
    },
    streak_30: {
      id: 'streak_30',
      name: '月度達人',
      description: '連續訓練 30 天',
      icon: '👑',
      condition: (stats) => stats.consecutiveDays >= 30
    },
    perfect_10: {
      id: 'perfect_10',
      name: '完美主義者',
      description: '累計 10 次完美姿勢（90分以上）',
      icon: '⭐',
      condition: (stats) => stats.perfectReps >= 10
    },
    perfect_50: {
      id: 'perfect_50',
      name: '姿勢大師',
      description: '累計 50 次完美姿勢（90分以上）',
      icon: '🌟',
      condition: (stats) => stats.perfectReps >= 50
    },
    daily_goal: {
      id: 'daily_goal',
      name: '目標達成',
      description: '首次完成每日目標',
      icon: '🎯',
      condition: (stats, goals) => goals && goals.currentReps >= goals.targetReps
    },
    set_master: {
      id: 'set_master',
      name: '組數之王',
      description: '單次訓練完成 10 組',
      icon: '👊',
      condition: (stats, goals, sessionStats) => sessionStats && sessionStats.sets >= 10
    },
    endurance: {
      id: 'endurance',
      name: '耐力戰士',
      description: '單次訓練完成 50 下',
      icon: '🦾',
      condition: (stats, goals, sessionStats) => sessionStats && sessionStats.reps >= 50
    }
  };
  
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
  // �️ 語音提示播放函式
  // ============================================
  const speakMessage = useCallback((message, priority = 'normal') => {
    if (!voiceEnabled) return;
    
    const now = Date.now();
    // 根據優先級設定最小間隔
    const minInterval = {
      'critical': 2000,   // 緊急：2秒間隔
      'warning': 3000,    // 警告：3秒間隔
      'normal': 4000,     // 一般：4秒間隔
      'info': 5000        // 資訊：5秒間隔
    }[priority] || 4000;
    
    // 防止重複播放相同訊息
    if (message === lastVoiceMessage.current && now - lastVoiceTime.current < minInterval) {
      return;
    }
    
    // 更新時間和訊息記錄
    lastVoiceTime.current = now;
    lastVoiceMessage.current = message;
    
    try {
      // 取消正在播放的語音（高優先級時）
      if (priority === 'critical') {
        speechSynthesis.current.cancel();
      }
      
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = 'zh-TW';  // 繁體中文
      utterance.rate = 1.1;       // 語速稍快
      utterance.pitch = 1.0;      // 音調
      utterance.volume = voiceVolume;
      
      // 嘗試使用中文語音
      const voices = speechSynthesis.current.getVoices();
      const chineseVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('TW'));
      if (chineseVoice) {
        utterance.voice = chineseVoice;
      }
      
      speechSynthesis.current.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis not supported:', e);
    }
  }, [voiceEnabled, voiceVolume]);

  // ============================================
  // 🔊 姿勢警告語音提示
  // ============================================
  const speakPostureWarning = useCallback((status, confirmedStatus) => {
    if (!voiceEnabled || !isDoingDeadlift) return;
    
    // 根據確認狀態播放對應語音
    if (confirmedStatus === 'critical') {
      speakMessage('注意！背部嚴重彎曲，請立即停止', 'critical');
    } else if (confirmedStatus === 'danger') {
      speakMessage('背部過度彎曲，請挺直背部', 'warning');
    } else if (status === 'warning') {
      speakMessage('注意背部姿勢', 'normal');
    }
  }, [voiceEnabled, isDoingDeadlift, speakMessage]);

  // ============================================
  // 🎉 計數語音提示
  // ============================================
  const speakRepCount = useCallback((count) => {
    if (!voiceEnabled) return;
    speakMessage(`${count}`, 'info');
  }, [voiceEnabled, speakMessage]);

  // ============================================
  // 📊 訓練歷史記錄函式
  // ============================================
  const HISTORY_STORAGE_KEY = 'deadlift_training_history';
  
  // 從 LocalStorage 載入歷史紀錄
  const loadTrainingHistory = useCallback(() => {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (saved) {
        const history = JSON.parse(saved);
        setTrainingHistory(history);
        return history;
      }
    } catch (e) {
      console.warn('Failed to load training history:', e);
    }
    return [];
  }, []);
  
  // 儲存歷史紀錄到 LocalStorage
  const saveTrainingHistory = useCallback((history) => {
    try {
      const trimmedHistory = history.slice(-50);
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmedHistory));
      setTrainingHistory(trimmedHistory);
    } catch (e) {
      console.warn('Failed to save training history:', e);
    }
  }, []);
  
  // 開始新的訓練 session
  const startTrainingSession = useCallback(() => {
    currentSessionStats.current = {
      startTime: Date.now(),
      sets: [],
      totalReps: 0,
      warnings: { rounded_back: 0, other: 0 },
      goodFormCount: 0
    };
  }, []);
  
  // 記錄一組完成
  const recordSetComplete = useCallback((reps, setNumber) => {
    if (currentSessionStats.current.startTime) {
      currentSessionStats.current.sets.push({
        setNumber, reps, timestamp: Date.now()
      });
      currentSessionStats.current.totalReps += reps;
    }
  }, []);
  
  // 記錄姿勢警告
  const recordPostureWarning = useCallback((type) => {
    if (currentSessionStats.current.startTime) {
      if (type === 'rounded_back') {
        currentSessionStats.current.warnings.rounded_back++;
      } else {
        currentSessionStats.current.warnings.other++;
      }
    }
  }, []);
  
  // 計算姿勢評分 (0-100)
  const calculateFormScore = (session) => {
    if (session.totalReps === 0) return 100;
    const deductions = session.warnings.rounded_back * 5 + session.warnings.other * 2;
    return Math.max(0, 100 - deductions);
  };
  
  // 結束訓練並儲存
  const endTrainingSession = useCallback(() => {
    const session = currentSessionStats.current;
    if (!session.startTime || session.totalReps === 0) return null;
    
    const endTime = Date.now();
    const duration = Math.round((endTime - session.startTime) / 1000);
    
    const record = {
      id: `session-${session.startTime}`,
      date: new Date(session.startTime).toISOString(),
      duration,
      totalReps: session.totalReps,
      sets: session.sets.length,
      setsDetail: session.sets,
      avgRepsPerSet: session.sets.length > 0 
        ? Math.round(session.totalReps / session.sets.length * 10) / 10 
        : 0,
      warnings: session.warnings,
      formScore: calculateFormScore(session)
    };
    
    const newHistory = [...trainingHistory, record];
    saveTrainingHistory(newHistory);
    
    currentSessionStats.current = {
      startTime: null, sets: [], totalReps: 0,
      warnings: { rounded_back: 0, other: 0 }, goodFormCount: 0
    };
    
    return record;
  }, [trainingHistory, saveTrainingHistory]);
  
  // 刪除歷史紀錄
  const deleteHistoryRecord = useCallback((recordId) => {
    const newHistory = trainingHistory.filter(r => r.id !== recordId);
    saveTrainingHistory(newHistory);
  }, [trainingHistory, saveTrainingHistory]);
  
  // 清除所有歷史
  const clearAllHistory = useCallback(() => {
    if (window.confirm('確定要清除所有訓練紀錄嗎？')) {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
      setTrainingHistory([]);
    }
  }, []);
  
  // 元件載入時讀取歷史紀錄
  useEffect(() => {
    loadTrainingHistory();
    startTrainingSession();
  }, []);

  // ============================================
  // ⏱️ 休息計時器函式
  // ============================================
  
  // 開始休息計時
  const startRestTimer = useCallback((duration = null) => {
    // 清除現有計時器
    if (restTimerInterval.current) {
      clearInterval(restTimerInterval.current);
    }
    
    const restDuration = duration || restTimer.totalTime;
    
    setRestTimer(prev => ({
      ...prev,
      isActive: true,
      timeLeft: restDuration,
      showTimer: true
    }));
    
    // 開始倒數
    restTimerInterval.current = setInterval(() => {
      setRestTimer(prev => {
        if (prev.timeLeft <= 1) {
          // 時間到
          clearInterval(restTimerInterval.current);
          restTimerInterval.current = null;
          
          // 播放提示音
          playRestEndSound();
          
          // 語音提示
          if (voiceEnabled) {
            speakMessage('休息結束，準備開始下一組', 'info');
          }
          
          return { ...prev, isActive: false, timeLeft: 0 };
        }
        
        // 剩餘 10 秒時語音提示
        if (prev.timeLeft === 11 && voiceEnabled) {
          speakMessage('還有10秒', 'info');
        }
        
        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, 1000);
  }, [restTimer.totalTime, voiceEnabled, speakMessage]);
  
  // 停止休息計時
  const stopRestTimer = useCallback(() => {
    if (restTimerInterval.current) {
      clearInterval(restTimerInterval.current);
      restTimerInterval.current = null;
    }
    setRestTimer(prev => ({ ...prev, isActive: false, timeLeft: 0 }));
  }, []);
  
  // 暫停/繼續休息計時
  const toggleRestTimer = useCallback(() => {
    if (restTimer.isActive) {
      // 暫停
      if (restTimerInterval.current) {
        clearInterval(restTimerInterval.current);
        restTimerInterval.current = null;
      }
      setRestTimer(prev => ({ ...prev, isActive: false }));
    } else if (restTimer.timeLeft > 0) {
      // 繼續
      setRestTimer(prev => ({ ...prev, isActive: true }));
      restTimerInterval.current = setInterval(() => {
        setRestTimer(prev => {
          if (prev.timeLeft <= 1) {
            clearInterval(restTimerInterval.current);
            restTimerInterval.current = null;
            playRestEndSound();
            if (voiceEnabled) {
              speakMessage('休息結束，準備開始下一組', 'info');
            }
            return { ...prev, isActive: false, timeLeft: 0 };
          }
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        });
      }, 1000);
    }
  }, [restTimer.isActive, restTimer.timeLeft, voiceEnabled, speakMessage]);
  
  // 設定休息時間
  const setRestDuration = useCallback((seconds) => {
    setRestTimer(prev => ({ ...prev, totalTime: seconds }));
  }, []);
  
  // 隱藏計時器面板
  const hideRestTimer = useCallback(() => {
    setRestTimer(prev => ({ ...prev, showTimer: false }));
  }, []);
  
  // 播放休息結束音效
  const playRestEndSound = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      
      // 播放三聲提示音
      [0, 0.2, 0.4].forEach((delay) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.frequency.value = 880;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, ctx.currentTime + delay);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.15);
        oscillator.start(ctx.currentTime + delay);
        oscillator.stop(ctx.currentTime + delay + 0.15);
      });
    } catch (e) {
      console.warn('Audio not supported:', e);
    }
  }, []);
  
  // 清理計時器
  useEffect(() => {
    return () => {
      if (restTimerInterval.current) {
        clearInterval(restTimerInterval.current);
      }
    };
  }, []);

  // ============================================
  // 🎯 目標設定系統函式
  // ============================================
  
  // 從 LocalStorage 載入目標設定
  const loadGoals = useCallback(() => {
    try {
      const saved = localStorage.getItem(GOALS_STORAGE_KEY);
      if (saved) {
        const goals = JSON.parse(saved);
        const today = new Date().toDateString();
        
        // 檢查是否為新的一天，需要重置進度
        if (goals.lastResetDate !== today) {
          goals.currentSets = 0;
          goals.currentReps = 0;
          goals.lastResetDate = today;
          localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(goals));
        }
        
        setDailyGoals(prev => ({ ...prev, ...goals }));
        return goals;
      }
    } catch (e) {
      console.warn('Failed to load goals:', e);
    }
    return null;
  }, []);
  
  // 儲存目標設定到 LocalStorage
  const saveGoals = useCallback((goals) => {
    try {
      const today = new Date().toDateString();
      const toSave = { ...goals, lastResetDate: today };
      localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(toSave));
      setDailyGoals(toSave);
    } catch (e) {
      console.warn('Failed to save goals:', e);
    }
  }, []);
  
  // 更新每日目標
  const updateDailyGoal = useCallback((targetSets, targetReps) => {
    saveGoals({ ...dailyGoals, targetSets, targetReps });
  }, [dailyGoals, saveGoals]);
  
  // 記錄完成一下（更新每日進度）
  const recordRepComplete = useCallback((score) => {
    setDailyGoals(prev => {
      const updated = { ...prev, currentReps: prev.currentReps + 1 };
      saveGoals(updated);
      return updated;
    });
    
    // 更新成就統計
    updateAchievementStats('rep', score);
  }, [saveGoals]);
  
  // 記錄完成一組（更新每日進度）
  const recordSetComplete_Goals = useCallback((reps) => {
    setDailyGoals(prev => {
      const updated = { ...prev, currentSets: prev.currentSets + 1 };
      saveGoals(updated);
      return updated;
    });
  }, [saveGoals]);

  // ============================================
  // 🏆 成就系統函式
  // ============================================
  
  // 從 LocalStorage 載入成就
  const loadAchievements = useCallback(() => {
    try {
      const saved = localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        setAchievements(prev => ({ ...prev, ...data }));
        return data;
      }
    } catch (e) {
      console.warn('Failed to load achievements:', e);
    }
    return null;
  }, []);
  
  // 儲存成就到 LocalStorage
  const saveAchievements = useCallback((data) => {
    try {
      localStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save achievements:', e);
    }
  }, []);
  
  // 更新成就統計
  const updateAchievementStats = useCallback((type, value) => {
    setAchievements(prev => {
      const newStats = { ...prev.stats };
      const today = new Date().toDateString();
      
      if (type === 'rep') {
        newStats.totalReps += 1;
        
        // 檢查是否為完美姿勢（90分以上）
        if (value >= 90) {
          newStats.perfectReps += 1;
        }
        
        // 更新平均分數
        if (newStats.totalReps > 0) {
          newStats.avgScore = Math.round(
            (newStats.avgScore * (newStats.totalReps - 1) + value) / newStats.totalReps
          );
        }
      } else if (type === 'set') {
        newStats.totalSets += 1;
      } else if (type === 'session') {
        newStats.totalSessions += 1;
        
        // 更新連續訓練天數
        if (newStats.lastTrainingDate) {
          const lastDate = new Date(newStats.lastTrainingDate);
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          
          if (lastDate.toDateString() === yesterday.toDateString()) {
            // 連續訓練
            newStats.consecutiveDays += 1;
          } else if (lastDate.toDateString() !== today) {
            // 中斷了，重置為 1
            newStats.consecutiveDays = 1;
          }
        } else {
          newStats.consecutiveDays = 1;
        }
        
        newStats.lastTrainingDate = today;
      } else if (type === 'dailyReps' && value > newStats.bestDailyReps) {
        newStats.bestDailyReps = value;
      }
      
      const newData = { ...prev, stats: newStats };
      saveAchievements(newData);
      return newData;
    });
  }, [saveAchievements]);
  
  // 檢查並解鎖成就
  const checkAndUnlockAchievements = useCallback(() => {
    setAchievements(prev => {
      const newUnlocked = [...prev.unlocked];
      let justUnlocked = null;
      
      // 檢查每個成就
      Object.values(ACHIEVEMENT_DEFINITIONS).forEach(achievement => {
        if (!newUnlocked.includes(achievement.id)) {
          // 構造當前 session 統計
          const sessionStats = {
            sets: setCount,
            reps: totalReps
          };
          
          if (achievement.condition(prev.stats, dailyGoals, sessionStats)) {
            newUnlocked.push(achievement.id);
            justUnlocked = achievement;
            
            // 播放成就解鎖音效
            playAchievementSound();
            
            // 語音播報
            if (voiceEnabled) {
              speakMessage(`恭喜解鎖成就：${achievement.name}`, 'info');
            }
          }
        }
      });
      
      if (justUnlocked) {
        const newData = { ...prev, unlocked: newUnlocked, newUnlocked: justUnlocked };
        saveAchievements(newData);
        
        // 3秒後清除新解鎖標記
        setTimeout(() => {
          setAchievements(p => ({ ...p, newUnlocked: null }));
        }, 5000);
        
        return newData;
      }
      
      return prev;
    });
  }, [dailyGoals, setCount, totalReps, voiceEnabled, speakMessage, saveAchievements]);
  
  // 播放成就解鎖音效
  const playAchievementSound = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      
      // 播放勝利音效（上升音階）
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, i) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.frequency.value = freq;
        oscillator.type = 'sine';
        const startTime = ctx.currentTime + i * 0.15;
        gainNode.gain.setValueAtTime(0.3, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);
        oscillator.start(startTime);
        oscillator.stop(startTime + 0.3);
      });
    } catch (e) {
      console.warn('Audio not supported:', e);
    }
  }, []);
  
  // 播放目標達成音效（慶祝音樂）
  const playGoalCompleteSound = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      
      // 播放慶祝音效
      const notes = [392, 523.25, 659.25, 783.99, 1046.50, 783.99, 1046.50];
      notes.forEach((freq, i) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.frequency.value = freq;
        oscillator.type = 'triangle';
        const startTime = ctx.currentTime + i * 0.12;
        gainNode.gain.setValueAtTime(0.25, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.25);
        oscillator.start(startTime);
        oscillator.stop(startTime + 0.25);
      });
    } catch (e) {
      console.warn('Audio not supported:', e);
    }
  }, []);
  
  // 檢查目標達成
  const checkGoalComplete = useCallback(() => {
    if (dailyGoals.currentReps >= dailyGoals.targetReps && 
        dailyGoals.currentSets >= dailyGoals.targetSets) {
      // 目標達成！
      playGoalCompleteSound();
      if (voiceEnabled) {
        speakMessage('恭喜！今日目標已達成！', 'info');
      }
      return true;
    }
    return false;
  }, [dailyGoals, playGoalCompleteSound, voiceEnabled, speakMessage]);
  
  // 元件載入時讀取目標和成就
  useEffect(() => {
    loadGoals();
    loadAchievements();
  }, []);
  
  // 監控目標進度，達成時觸發慶祝
  useEffect(() => {
    if (dailyGoals.currentReps > 0) {
      const wasComplete = dailyGoals.currentReps - 1 < dailyGoals.targetReps;
      const isComplete = dailyGoals.currentReps >= dailyGoals.targetReps;
      
      if (wasComplete && isComplete) {
        checkGoalComplete();
        checkAndUnlockAchievements();
      }
    }
  }, [dailyGoals.currentReps]);

  // ============================================
  // 🏆 即時評分計算函式
  // ============================================
  
  // 更新即時評分（每幀調用）
  const updateRealtimeScore = useCallback((spineStatus, hipAngle, phase) => {
    // 只在做動作時計算分數
    if (phase === 'STANDING') {
      // 重置評分因素
      repScoreFactors.current = {
        spineDeductions: 0,
        depthBonus: 0,
        speedPenalty: 0,
        stabilityBonus: 0,
        warningCount: 0
      };
      setCurrentRepScore(100);
      return;
    }
    
    let factors = repScoreFactors.current;
    
    // 1. 脊椎曲率扣分（即時累積）
    if (spineStatus.status === 'warning') {
      factors.spineDeductions += 0.5;  // 每幀扣 0.5 分
    } else if (spineStatus.status === 'danger' || spineStatus.confirmedStatus === 'danger') {
      factors.spineDeductions += 2;    // 每幀扣 2 分
      factors.warningCount++;
    } else if (spineStatus.confirmedStatus === 'critical') {
      factors.spineDeductions += 5;    // 每幀扣 5 分
      factors.warningCount++;
    }
    
    // 2. 深度獎勵（到達低點時）
    if (phase === 'BOTTOM' && hipAngle < 100) {
      factors.depthBonus = Math.min(10, factors.depthBonus + 0.5);  // 最多 +10 分
    }
    
    // 計算當前分數
    let score = 100;
    score -= Math.min(factors.spineDeductions, 50);  // 脊椎最多扣 50 分
    score += factors.depthBonus;                      // 深度獎勵
    score -= factors.speedPenalty;                    // 速度懲罰
    score += factors.stabilityBonus;                  // 穩定獎勵
    
    score = Math.max(0, Math.min(100, Math.round(score)));
    setCurrentRepScore(score);
    
    repScoreFactors.current = factors;
  }, []);
  
  // 完成一個 rep 時計算最終分數
  const finalizeRepScore = useCallback((duration) => {
    let factors = repScoreFactors.current;
    let finalScore = 100;
    
    // 1. 脊椎扣分（有上限）
    finalScore -= Math.min(factors.spineDeductions, 50);
    
    // 2. 深度獎勵
    finalScore += factors.depthBonus;
    
    // 3. 動作時間評估（太快扣分，適中加分）
    if (duration < 1500) {
      // 太快（< 1.5秒）：扣 5-15 分
      factors.speedPenalty = Math.round((1500 - duration) / 100);
      finalScore -= factors.speedPenalty;
    } else if (duration >= 2000 && duration <= 4000) {
      // 適中（2-4秒）：獎勵 5 分
      factors.stabilityBonus = 5;
      finalScore += 5;
    }
    
    // 4. 無警告獎勵
    if (factors.warningCount === 0) {
      finalScore += 5;  // 完美動作獎勵
    }
    
    finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));
    
    // 更新分數歷史
    setRepScores(prev => {
      const newScores = [...prev, finalScore];
      // 計算平均分
      const avg = Math.round(newScores.reduce((a, b) => a + b, 0) / newScores.length);
      setAvgRepScore(avg);
      return newScores;
    });
    
    setLastRepScore(finalScore);
    
    // 重置因素
    repScoreFactors.current = {
      spineDeductions: 0,
      depthBonus: 0,
      speedPenalty: 0,
      stabilityBonus: 0,
      warningCount: 0
    };
    
    return finalScore;
  }, []);
  
  // 取得分數顏色
  const getScoreColor = (score) => {
    if (score >= 90) return '#22c55e';  // 綠色
    if (score >= 70) return '#f59e0b';  // 黃色
    if (score >= 50) return '#f97316';  // 橙色
    return '#ef4444';                    // 紅色
  };
  
  // 取得分數等級
  const getScoreGrade = (score) => {
    if (score >= 95) return { grade: 'S', label: '完美！', emoji: '🏆' };
    if (score >= 90) return { grade: 'A', label: '優秀', emoji: '⭐' };
    if (score >= 80) return { grade: 'B', label: '良好', emoji: '👍' };
    if (score >= 70) return { grade: 'C', label: '普通', emoji: '💪' };
    if (score >= 60) return { grade: 'D', label: '待改進', emoji: '📈' };
    return { grade: 'F', label: '需注意', emoji: '⚠️' };
  };

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
            // 🏆 計算這一下的最終分數
            const repScore = finalizeRepScore(timeSinceLastRep);
            const scoreGrade = getScoreGrade(repScore);
            
            lastRepTime.current = now;
            
            setRepCount(prev => {
              const newCount = prev + 1;
              // 更新最佳記錄
              setBestReps(best => Math.max(best, newCount));
              
              // 🆕 觸發完成反饋動畫（含分數）
              setLastRepFeedback({ 
                count: newCount, 
                time: now,
                score: repScore,
                grade: scoreGrade
              });
              setTimeout(() => setLastRepFeedback(null), 2000);
              
              // 🗣️ 語音播報計數和分數
              if (repScore >= 90) {
                speakRepCount(`${newCount}，${scoreGrade.label}`);
              } else {
                speakRepCount(`${newCount}`);
              }
              
              return newCount;
            });
            setTotalReps(prev => prev + 1);
            
            // 🎯 更新每日目標進度
            recordRepComplete(repScore);
            
            // 🏆 檢查成就解鎖
            checkAndUnlockAchievements();
            
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
        // 記錄前一組到歷史
        repHistory.current.push(repCount);
        recordSetComplete(repCount, setCount);  // 📊 記錄到訓練歷史
        recordSetComplete_Goals(repCount);       // 🎯 更新目標進度
        
        // ⏱️ 自動啟動休息計時器
        if (restTimer.autoStart) {
          startRestTimer();
          if (voiceEnabled) {
            speakMessage(`第${setCount}組完成，${repCount}下，開始休息`, 'info');
          }
        }
        
        setSetCount(prev => prev + 1);
        setRepCount(0);
        lastActivityTime.current = now;
        lastSetEndTime.current = now;
      }
    }
    
    // ⏱️ 當開始新動作時，自動停止休息計時器
    if (currentPhase.current !== 'STANDING' && restTimer.isActive) {
      stopRestTimer();
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
    
    // 4.6 🏆 更新即時評分
    updateRealtimeScore(spineResult, hipAngle, counterResult.phase);
    
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
        // 🗣️ 播放語音警告
        speakPostureWarning(spineResult.status, spineResult.confirmedStatus);
        // 📊 記錄姿勢警告到歷史
        recordPostureWarning('rounded_back');
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
          
          // 🎯 整合警告邏輯：以即時偵測為主，ML 作為輔助確認
          // 因為 ML 模型可能有類別不平衡問題，優先信任即時偵測結果
          const spineWarning = data.spine?.is_rounded;
          const spineStatus = data.spine?.status;
          const confirmedStatus = data.spine?.confirmed_status;
          
          // 檢查中文或英文標籤
          const mlHasRoundedBack = data.A.includes('背部彎曲') || data.A.includes('rounded_back');
          const mlHasGoodForm = data.A.includes('正確動作') || data.A.includes('good_form');
          
          // 優先級：即時確認狀態 > ML 結果
          if (confirmedStatus === 'critical' || confirmedStatus === 'danger') {
            // 即時偵測已確認危險
            if (mlHasRoundedBack) {
              // 雙重確認
              setCombinedWarning({
                level: 'critical',
                message: '🚨 雙重確認：背部嚴重彎曲！請立即調整',
                source: 'both'
              });
            } else {
              // 只有即時偵測確認
              setCombinedWarning({
                level: 'danger',
                message: `🔴 偵測到背部彎曲 (${data.spine?.spine_curvature?.toFixed(0)}°)`,
                source: 'realtime'
              });
            }
          } else if (spineWarning) {
            // 即時偵測有警告但未確認
            setCombinedWarning({
              level: 'warning',
              message: '⚠️ 注意背部姿勢',
              source: 'realtime'
            });
          } else if (spineStatus === 'safe' && !mlHasRoundedBack) {
            // 即時偵測安全，ML 沒有警告 → 姿勢正確
            setCombinedWarning({
              level: 'good',
              message: '✅ 姿勢良好',
              source: 'combined'
            });
          } else if (spineStatus === 'safe' && mlHasRoundedBack) {
            // 即時偵測安全但 ML 有警告 → 可能是 ML 誤判，顯示提示但不警告
            setCombinedWarning({
              level: 'info',
              message: '👀 AI 建議注意背部（即時偵測正常）',
              source: 'ml'
            });
          } else if (mlHasGoodForm) {
            // ML 確認姿勢正確
            setCombinedWarning({
              level: 'good',
              message: '✅ 姿勢良好',
              source: 'ml'
            });
          } else if (data.A.length > 0 && !mlHasRoundedBack) {
            // ML 偵測到其他問題（非背部彎曲）
            const translatedLabels = data.A.map(label => 
              ML_LABEL_TRANSLATIONS[label] || label
            ).join('、');
            setCombinedWarning({
              level: 'info',
              message: `🤖 AI 建議：${translatedLabels}`,
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
      
      {/* �️ 控制面板：分析模式 + 語音設定 */}
      <div className="control-panel">
        {/* 分析模式選擇器 */}
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
        
        {/* 🗣️ 語音設定控制 */}
        <div className="voice-control">
          <button 
            className={`voice-toggle-btn ${voiceEnabled ? 'active' : ''}`}
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            title={voiceEnabled ? '點擊關閉語音提示' : '點擊開啟語音提示'}
          >
            {voiceEnabled ? '🔊' : '🔇'} 語音
          </button>
          
          {voiceEnabled && (
            <div className="volume-slider">
              <input 
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={voiceVolume}
                onChange={(e) => setVoiceVolume(parseFloat(e.target.value))}
                title={`音量: ${Math.round(voiceVolume * 100)}%`}
              />
              <span className="volume-label">{Math.round(voiceVolume * 100)}%</span>
            </div>
          )}
        </div>
        
        {/* 📊 訓練歷史按鈕 */}
        <button 
          className={`history-toggle-btn ${showHistory ? 'active' : ''}`}
          onClick={() => setShowHistory(!showHistory)}
          title="查看訓練歷史紀錄"
        >
          📊 歷史 ({trainingHistory.length})
        </button>
        
        {/* 結束訓練按鈕 */}
        <button 
          className="end-session-btn"
          onClick={() => {
            const record = endTrainingSession();
            if (record) {
              alert(`訓練已儲存！\n總次數: ${record.totalReps}\n組數: ${record.sets}\n姿勢評分: ${record.formScore}/100`);
              startTrainingSession();
            }
          }}
          title="結束當前訓練並儲存紀錄"
        >
          💾 儲存訓練
        </button>
        
        {/* ⏱️ 休息計時器按鈕 */}
        <button 
          className={`timer-toggle-btn ${restTimer.showTimer ? 'active' : ''}`}
          onClick={() => setRestTimer(prev => ({ ...prev, showTimer: !prev.showTimer }))}
          title="組間休息計時器"
        >
          ⏱️ 休息 {restTimer.isActive && `(${Math.floor(restTimer.timeLeft / 60)}:${(restTimer.timeLeft % 60).toString().padStart(2, '0')})`}
        </button>
        
        {/* 🎯 目標設定按鈕 */}
        <button 
          className={`goal-toggle-btn ${dailyGoals.showGoalPanel ? 'active' : ''} ${
            dailyGoals.currentReps >= dailyGoals.targetReps ? 'complete' : ''
          }`}
          onClick={() => setDailyGoals(prev => ({ ...prev, showGoalPanel: !prev.showGoalPanel }))}
          title="今日目標設定"
        >
          🎯 目標 ({dailyGoals.currentReps}/{dailyGoals.targetReps})
        </button>
        
        {/* 🏆 成就徽章按鈕 */}
        <button 
          className={`achievement-toggle-btn ${achievements.showPanel ? 'active' : ''}`}
          onClick={() => setAchievements(prev => ({ ...prev, showPanel: !prev.showPanel }))}
          title="查看成就徽章"
        >
          🏆 成就 ({achievements.unlocked.length})
        </button>
      </div>
      
      {/* 📊 訓練歷史面板 */}
      {showHistory && (
        <TrainingHistoryPanel 
          history={trainingHistory}
          onDelete={deleteHistoryRecord}
          onClearAll={clearAllHistory}
          onClose={() => setShowHistory(false)}
        />
      )}
      
      {/* ⏱️ 休息計時器面板 */}
      {restTimer.showTimer && (
        <RestTimerPanel 
          timer={restTimer}
          onStart={startRestTimer}
          onStop={stopRestTimer}
          onToggle={toggleRestTimer}
          onSetDuration={setRestDuration}
          onHide={hideRestTimer}
        />
      )}
      
      {/* 🎯 目標設定面板 */}
      {dailyGoals.showGoalPanel && (
        <GoalSettingPanel 
          goals={dailyGoals}
          onUpdateGoal={updateDailyGoal}
          onClose={() => setDailyGoals(prev => ({ ...prev, showGoalPanel: false }))}
          achievementStats={achievements.stats}
        />
      )}
      
      {/* 🏆 成就展示面板 */}
      {achievements.showPanel && (
        <AchievementPanel 
          achievements={achievements}
          achievementDefs={ACHIEVEMENT_DEFINITIONS}
          onClose={() => setAchievements(prev => ({ ...prev, showPanel: false }))}
        />
      )}
      
      {/* 🎊 成就解鎖通知 */}
      {achievements.newUnlocked && (
        <AchievementUnlockNotification 
          achievement={achievements.newUnlocked}
          onClose={() => setAchievements(prev => ({ ...prev, newUnlocked: null }))}
        />
      )}
      
      {/* 動作狀態指示 */}
      <div className="status-bar">
        <div className={`action-status-badge ${isDoingDeadlift ? 'active' : 'standby'}`}>
          {isDoingDeadlift ? '🏋️ 硬舉中' : '🧍 準備中'}
        </div>
      </div>
      
      {/* 🔢 大型計數器顯示（視頻左上角）- 優化版 */}
      <div className={`rep-counter-overlay ${lastRepFeedback ? 'rep-success' : ''}`}>
        {/* 完成動作的慶祝動畫（含分數） */}
        {lastRepFeedback && (
          <div className="rep-celebration">
            <span className="celebration-text">+1</span>
            {lastRepFeedback.score !== undefined && (
              <div className="score-popup" style={{ color: getScoreColor(lastRepFeedback.score) }}>
                <span className="score-grade">{lastRepFeedback.grade.emoji} {lastRepFeedback.grade.grade}</span>
                <span className="score-value">{lastRepFeedback.score}分</span>
              </div>
            )}
          </div>
        )}
        
        <div className="rep-count-big">{repCount}</div>
        <div className="rep-count-label">REPS</div>
        
        {/* 🏆 即時評分顯示 */}
        {isDoingDeadlift && (
          <div className="realtime-score">
            <div 
              className="score-circle"
              style={{ borderColor: getScoreColor(currentRepScore) }}
            >
              <span className="score-number" style={{ color: getScoreColor(currentRepScore) }}>
                {currentRepScore}
              </span>
            </div>
            <span className="score-label">即時評分</span>
          </div>
        )}
        
        {/* 平均分數 */}
        {repScores.length > 0 && (
          <div className="avg-score-display">
            <span className="avg-label">平均</span>
            <span className="avg-value" style={{ color: getScoreColor(avgRepScore) }}>
              {avgRepScore}分
            </span>
          </div>
        )}
        
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
                  (() => {
                    // 檢查是否有正確動作標籤
                    const hasGoodForm = mlLabels.includes('正確動作') || mlLabels.includes('good_form');
                    // 過濾掉「正確動作」後的警告標籤
                    const warningLabels = mlLabels.filter(l => l !== '正確動作' && l !== 'good_form');
                    
                    if (hasGoodForm && warningLabels.length === 0) {
                      return (
                        <div className="ai-only-feedback good">
                          ✅ AI 分析：姿勢正確
                        </div>
                      );
                    } else if (warningLabels.length > 0) {
                      // 翻譯標籤
                      const translatedLabels = warningLabels.map(label => 
                        ML_LABEL_TRANSLATIONS[label] || label
                      ).join('、');
                      return (
                        <div className="ai-only-feedback warning">
                          <span className="warning-icon">⚠️</span>
                          AI 偵測到：{translatedLabels}
                        </div>
                      );
                    } else {
                      return (
                        <div className="ai-only-feedback good">
                          ✅ AI 分析：未偵測到問題
                        </div>
                      );
                    }
                  })()
                ) : (
                  <div className="ai-only-feedback loading">
                    ⏳ AI 正在學習中... ({mlFrameCount}/30 幀)
                  </div>
                )}
              </div>
            ) : analysisMode === 'realtime' ? (
              // 即時模式：只顯示即時偵測結果
              <div className={`feedback-box ${
                isDoingDeadlift && spineStatus.confirmedStatus === 'critical' ? 'feedback-critical' :
                isDoingDeadlift && spineStatus.confirmedStatus === 'danger' ? 'feedback-error' :
                isDoingDeadlift && spineStatus.status === 'warning' ? 'feedback-warning' :
                isDoingDeadlift && spineStatus.status === 'monitoring' ? 'feedback-monitoring' :
                'feedback-good'
              }`}>
                <span className="mode-indicator">⚡ 即時分析模式</span>
                {isDoingDeadlift && (spineStatus.confirmedStatus === 'critical' || spineStatus.confirmedStatus === 'danger') && <span className="warning-icon">⚠️</span>}
                {isDoingDeadlift ? spineStatus.message : '準備就緒，請開始動作'}
              </div>
            ) : (
              // 組合模式：顯示整合後的結果
              <div className={`feedback-box ${
                combinedWarning?.level === 'critical' ? 'feedback-critical' :
                combinedWarning?.level === 'danger' ? 'feedback-error' :
                combinedWarning?.level === 'warning' ? 'feedback-warning' :
                combinedWarning?.level === 'good' ? 'feedback-good' :
                combinedWarning?.level === 'info' ? 'feedback-info' :
                'feedback-good'
              }`}>
                <span className="mode-indicator">🔗 組合分析模式</span>
                {combinedWarning ? (
                  <div className="combined-feedback">
                    {combinedWarning.message}
                    {combinedWarning.source === 'both' && (
                      <span className="source-badge both">雙重確認</span>
                    )}
                  </div>
                ) : (
                  isDoingDeadlift ? '分析中...' : '準備就緒，請開始動作'
                )}
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
// ⏱️ 休息計時器組件
// ============================================
const RestTimerPanel = ({ 
  timer, 
  onStart, 
  onStop, 
  onToggle, 
  onSetDuration, 
  onHide 
}) => {
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const progress = timer.totalTime > 0 
    ? ((timer.totalTime - timer.timeLeft) / timer.totalTime) * 100 
    : 0;
  
  const presetTimes = [60, 90, 120, 180];
  
  return (
    <div className="rest-timer-panel">
      <div className="timer-header">
        <span className="timer-title">⏱️ 組間休息</span>
        <button className="timer-close-btn" onClick={onHide}>✕</button>
      </div>
      
      {/* 計時器顯示 */}
      <div className={`timer-display ${timer.isActive ? 'active' : ''}`}>
        <svg className="timer-circle" viewBox="0 0 100 100">
          <circle 
            className="timer-circle-bg"
            cx="50" cy="50" r="45"
          />
          <circle 
            className="timer-circle-progress"
            cx="50" cy="50" r="45"
            style={{
              strokeDasharray: `${2 * Math.PI * 45}`,
              strokeDashoffset: `${2 * Math.PI * 45 * (1 - progress / 100)}`
            }}
          />
        </svg>
        <div className="timer-time">
          {timer.timeLeft > 0 ? formatTime(timer.timeLeft) : formatTime(timer.totalTime)}
        </div>
        <div className="timer-status">
          {timer.isActive ? '休息中...' : timer.timeLeft > 0 ? '已暫停' : '準備就緒'}
        </div>
      </div>
      
      {/* 控制按鈕 */}
      <div className="timer-controls">
        {!timer.isActive && timer.timeLeft === 0 && (
          <button className="timer-btn start" onClick={() => onStart()}>
            ▶️ 開始休息
          </button>
        )}
        {(timer.isActive || timer.timeLeft > 0) && (
          <>
            <button className="timer-btn toggle" onClick={onToggle}>
              {timer.isActive ? '⏸️ 暫停' : '▶️ 繼續'}
            </button>
            <button className="timer-btn stop" onClick={onStop}>
              ⏹️ 停止
            </button>
          </>
        )}
      </div>
      
      {/* 預設時間選擇 */}
      <div className="timer-presets">
        <span className="preset-label">快速設定：</span>
        <div className="preset-buttons">
          {presetTimes.map(time => (
            <button 
              key={time}
              className={`preset-btn ${timer.totalTime === time ? 'active' : ''}`}
              onClick={() => onSetDuration(time)}
            >
              {time >= 60 ? `${time / 60}分` : `${time}秒`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================================
// 🎯 目標設定面板組件
// ============================================
const GoalSettingPanel = ({ 
  goals, 
  onUpdateGoal, 
  onClose,
  achievementStats 
}) => {
  const [editMode, setEditMode] = useState(false);
  const [tempTargetSets, setTempTargetSets] = useState(goals.targetSets);
  const [tempTargetReps, setTempTargetReps] = useState(goals.targetReps);
  
  const setsProgress = goals.targetSets > 0 
    ? Math.min(100, (goals.currentSets / goals.targetSets) * 100)
    : 0;
  const repsProgress = goals.targetReps > 0 
    ? Math.min(100, (goals.currentReps / goals.targetReps) * 100)
    : 0;
  
  const isGoalComplete = goals.currentSets >= goals.targetSets && 
                         goals.currentReps >= goals.targetReps;

  const handleSave = () => {
    onUpdateGoal(tempTargetSets, tempTargetReps);
    setEditMode(false);
  };

  return (
    <div className="goal-panel-overlay">
      <div className="goal-panel">
        <div className="goal-header">
          <h3>🎯 今日目標</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        
        {/* 目標完成慶祝 */}
        {isGoalComplete && (
          <div className="goal-complete-banner">
            <span className="complete-icon">🎉</span>
            <span className="complete-text">今日目標已達成！</span>
          </div>
        )}
        
        {/* 目標進度顯示 */}
        <div className="goal-progress-section">
          {/* 組數進度 */}
          <div className="goal-item">
            <div className="goal-item-header">
              <span className="goal-label">📦 組數目標</span>
              <span className="goal-values">
                {goals.currentSets} / {goals.targetSets}
              </span>
            </div>
            <div className="goal-progress-track">
              <div 
                className={`goal-progress-fill ${setsProgress >= 100 ? 'complete' : ''}`}
                style={{ width: `${setsProgress}%` }}
              />
            </div>
            <span className="goal-percent">{Math.round(setsProgress)}%</span>
          </div>
          
          {/* 次數進度 */}
          <div className="goal-item">
            <div className="goal-item-header">
              <span className="goal-label">🏋️ 次數目標</span>
              <span className="goal-values">
                {goals.currentReps} / {goals.targetReps}
              </span>
            </div>
            <div className="goal-progress-track">
              <div 
                className={`goal-progress-fill ${repsProgress >= 100 ? 'complete' : ''}`}
                style={{ width: `${repsProgress}%` }}
              />
            </div>
            <span className="goal-percent">{Math.round(repsProgress)}%</span>
          </div>
        </div>
        
        {/* 編輯目標 */}
        {editMode ? (
          <div className="goal-edit-section">
            <div className="goal-edit-row">
              <label>目標組數：</label>
              <input 
                type="number" 
                min="1" 
                max="20"
                value={tempTargetSets}
                onChange={(e) => setTempTargetSets(parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="goal-edit-row">
              <label>目標次數：</label>
              <input 
                type="number" 
                min="1" 
                max="200"
                value={tempTargetReps}
                onChange={(e) => setTempTargetReps(parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="goal-edit-buttons">
              <button className="save-btn" onClick={handleSave}>💾 儲存</button>
              <button className="cancel-btn" onClick={() => setEditMode(false)}>取消</button>
            </div>
          </div>
        ) : (
          <button className="edit-goal-btn" onClick={() => setEditMode(true)}>
            ✏️ 修改目標
          </button>
        )}
        
        {/* 統計摘要 */}
        {achievementStats && (
          <div className="goal-stats-summary">
            <h4>📊 累計統計</h4>
            <div className="stats-grid">
              <div className="stat-box">
                <span className="stat-value">{achievementStats.totalReps}</span>
                <span className="stat-label">總次數</span>
              </div>
              <div className="stat-box">
                <span className="stat-value">{achievementStats.consecutiveDays}</span>
                <span className="stat-label">連續天數</span>
              </div>
              <div className="stat-box">
                <span className="stat-value">{achievementStats.perfectReps}</span>
                <span className="stat-label">完美次數</span>
              </div>
              <div className="stat-box">
                <span className="stat-value">{achievementStats.avgScore || 0}</span>
                <span className="stat-label">平均分數</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// 🏆 成就展示面板組件
// ============================================
const AchievementPanel = ({ 
  achievements, 
  achievementDefs,
  onClose 
}) => {
  const unlockedSet = new Set(achievements.unlocked);
  const allAchievements = Object.values(achievementDefs);
  const unlockedCount = achievements.unlocked.length;
  const totalCount = allAchievements.length;
  
  return (
    <div className="achievement-panel-overlay">
      <div className="achievement-panel">
        <div className="achievement-header">
          <h3>🏆 成就徽章</h3>
          <span className="achievement-count">{unlockedCount}/{totalCount}</span>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        
        {/* 成就進度 */}
        <div className="achievement-progress">
          <div className="achievement-progress-bar">
            <div 
              className="achievement-progress-fill"
              style={{ width: `${(unlockedCount / totalCount) * 100}%` }}
            />
          </div>
          <span className="achievement-progress-text">
            已解鎖 {Math.round((unlockedCount / totalCount) * 100)}%
          </span>
        </div>
        
        {/* 成就列表 */}
        <div className="achievement-list">
          {allAchievements.map(achievement => {
            const isUnlocked = unlockedSet.has(achievement.id);
            return (
              <div 
                key={achievement.id}
                className={`achievement-item ${isUnlocked ? 'unlocked' : 'locked'}`}
              >
                <span className="achievement-icon">
                  {isUnlocked ? achievement.icon : '🔒'}
                </span>
                <div className="achievement-info">
                  <span className="achievement-name">
                    {isUnlocked ? achievement.name : '???'}
                  </span>
                  <span className="achievement-desc">
                    {achievement.description}
                  </span>
                </div>
                {isUnlocked && <span className="unlocked-badge">✓</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ============================================
// 🎊 成就解鎖通知組件
// ============================================
const AchievementUnlockNotification = ({ achievement, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);
  
  if (!achievement) return null;
  
  return (
    <div className="achievement-notification">
      <div className="notification-content">
        <span className="notification-icon">{achievement.icon}</span>
        <div className="notification-text">
          <span className="notification-title">🎉 成就解鎖！</span>
          <span className="notification-name">{achievement.name}</span>
          <span className="notification-desc">{achievement.description}</span>
        </div>
      </div>
      <button className="notification-close" onClick={onClose}>✕</button>
    </div>
  );
};

// ============================================
// 📊 訓練歷史面板組件
// ============================================
const TrainingHistoryPanel = ({ history, onDelete, onClearAll, onClose }) => {
  const formatDate = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('zh-TW', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };
  
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`;
  };
  
  const getScoreColor = (score) => {
    if (score >= 90) return '#22c55e';
    if (score >= 70) return '#f59e0b';
    return '#ef4444';
  };
  
  // 計算統計摘要
  const stats = {
    totalSessions: history.length,
    totalReps: history.reduce((sum, r) => sum + r.totalReps, 0),
    avgScore: history.length > 0 
      ? Math.round(history.reduce((sum, r) => sum + r.formScore, 0) / history.length)
      : 0,
    bestScore: history.length > 0 
      ? Math.max(...history.map(r => r.formScore))
      : 0
  };

  return (
    <div className="history-panel-overlay">
      <div className="history-panel">
        <div className="history-header">
          <h3>📊 訓練歷史紀錄</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        
        {/* 統計摘要 */}
        <div className="history-stats">
          <div className="stat-item">
            <span className="stat-value">{stats.totalSessions}</span>
            <span className="stat-label">總訓練次數</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats.totalReps}</span>
            <span className="stat-label">累計 Reps</span>
          </div>
          <div className="stat-item">
            <span className="stat-value" style={{ color: getScoreColor(stats.avgScore) }}>
              {stats.avgScore}
            </span>
            <span className="stat-label">平均評分</span>
          </div>
          <div className="stat-item">
            <span className="stat-value" style={{ color: getScoreColor(stats.bestScore) }}>
              {stats.bestScore}
            </span>
            <span className="stat-label">最佳評分</span>
          </div>
        </div>
        
        {/* 歷史列表 */}
        <div className="history-list">
          {history.length === 0 ? (
            <div className="no-history">
              <span>📭</span>
              <p>尚無訓練紀錄</p>
              <p className="hint">完成訓練後點擊「儲存訓練」</p>
            </div>
          ) : (
            [...history].reverse().map((record) => (
              <div key={record.id} className="history-item">
                <div className="history-item-header">
                  <span className="history-date">{formatDate(record.date)}</span>
                  <span 
                    className="history-score"
                    style={{ backgroundColor: getScoreColor(record.formScore) }}
                  >
                    {record.formScore}分
                  </span>
                </div>
                <div className="history-item-body">
                  <div className="history-detail">
                    <span>🏋️ {record.totalReps} reps</span>
                    <span>📦 {record.sets} 組</span>
                    <span>⏱️ {formatDuration(record.duration)}</span>
                  </div>
                  {record.warnings.rounded_back > 0 && (
                    <div className="history-warnings">
                      ⚠️ 圓背警告 ×{record.warnings.rounded_back}
                    </div>
                  )}
                </div>
                <button 
                  className="delete-btn"
                  onClick={() => onDelete(record.id)}
                  title="刪除此紀錄"
                >
                  🗑️
                </button>
              </div>
            ))
          )}
        </div>
        
        {history.length > 0 && (
          <button className="clear-all-btn" onClick={onClearAll}>
            🗑️ 清除所有紀錄
          </button>
        )}
      </div>
    </div>
  );
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

