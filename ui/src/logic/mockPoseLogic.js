// src/logic/mockPoseLogic.js
export function mockPoseJudge() {
  const kneeAngle = Math.floor(70 + Math.random() * 40)
  const hipAngle = Math.floor(60 + Math.random() * 40)
  const stabilityScore = (0.7 + Math.random() * 0.3).toFixed(2)
  const stabilityText = `${Math.round(stabilityScore * 100)}%`
  const isError = kneeAngle < 80 || hipAngle < 70 || stabilityScore < 0.85
  const feedback = isError
    ? '注意！保持背部平直並穩定核心。'
    : '動作良好，請保持穩定節奏。'

  return {
    action: '硬舉中',
    kneeAngle,
    hipAngle,
    stability: stabilityText,
    feedback,
    isError
  }
}
