// src/logic/poseBridge.js
// Determine API base URL in this order:
// 1. Vite build-time env: import.meta.env.VITE_API_BASE (recommended)
// 2. CRA-style env at build time: process.env.REACT_APP_API_BASE
// 3. Fallback to localhost:8000 for local development
const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE) ||
  (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_BASE) ||
  'http://127.0.0.1:8000'

export async function fetchPoseFromPython(videoEl) {
  if (!videoEl || !videoEl.videoWidth) {
    console.warn("Video not ready")
    return { success: false, message: "video not ready" }
  }

  // 將 video 畫面抓成一張暫存圖片
  const canvas = document.createElement("canvas")
  canvas.width = videoEl.videoWidth
  canvas.height = videoEl.videoHeight
  const ctx = canvas.getContext("2d")
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height)

  // 轉成 JPEG blob
  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.8))
  const form = new FormData()
  form.append("file", blob, "frame.jpg")

  // 傳送到後端 FastAPI
  try {
    const url = `${API_BASE.replace(/\/$/, '')}/api/pose`
    const resp = await fetch(url, {
      method: "POST",
      body: form,
      mode: "cors",
    })
    return await resp.json()
  } catch (err) {
    console.error("Pose fetch error:", err)
    return { success: false, message: "fetch error" }
  }
}
