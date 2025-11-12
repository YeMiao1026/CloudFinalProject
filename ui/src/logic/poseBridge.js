// src/logic/poseBridge.js
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
    const resp = await fetch("http://127.0.0.1:8000/api/pose", {
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
