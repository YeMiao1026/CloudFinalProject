# CloudFinalProject

## 專案簡介

本專案為一個「硬舉/下蹲姿勢分析」的示範系統，由前端即時擷取影片並呼叫後端的 MediaPipe-based 姿勢偵測 API，回傳關鍵點、角度與即時回饋。

主要用途：教學示範與實作練習（包含本地開發與透過 Docker 開發/部署）。

## 目前專案結構（實際）

```
README.md
data/
	README.md
	cleaned_videos/
	labels/
	raw_videos/
pose_backend/
	app.py                # FastAPI app (後端入口)
	requirements.txt
	pyproject.toml
	Dockerfile
ui/
	package.json
	Dockerfile
	Dockerfile.dev
	src/                  # React + Vite 前端程式
	tests/
	README.md
docker-compose.yml
render.yaml
tools/
	update_readme.py
tests/
	(repo-level tests)
```

## 快速開始（開發環境）

推薦環境：Python >= 3.10、Node 20.x。以下命令示範在 Windows PowerShell 下的本地啟動步驟。

後端（本地）：

```powershell
cd pose_backend
python -m venv .venv
. .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# 從 pose_backend 執行 uvicorn
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

前端（本地開發，Vite dev server）：

```powershell
cd ui
npm ci
npm run dev -- --host 0.0.0.0
```

若想快速以 docker-compose 啟動（預設為開發模式，UI 使用 Vite dev server）：

```powershell
docker-compose up --build
```

備註：docker-compose.yml 預設會使用 `ui/Dockerfile.dev`（啟動 Vite），適合開發但不適合 production。

## 建議的 production 流程

- 前端：使用 `ui/Dockerfile` 進行 multi-stage build（在 build 階段產生 `dist`，production stage 用 nginx 提供靜態檔案）。
- 後端：使用 `pose_backend/Dockerfile` 建構映像並以非 root user 執行。

## 重要注意事項

- 依賴管理：後端的 `requirements.txt` 與 `pyproject.toml` 都存在，請以單一來源維護依賴（建議在 CI 或部署中使用 `requirements.txt` 或直接使用 `pyproject.toml` + poetry/pep517 流程）。
- OpenCV：若在無 GUI 的容器中執行，建議使用 `opencv-python-headless`（requirements.txt 已列為 headless）。
- MediaPipe：啟動時會載入較大的二進位資源，可能耗時且佔用記憶體，建議在部署時注意容器規格（CPU / memory）。
- 前端發送影格頻率：前端預設每 400ms 發一張影格，若後端回應較慢可能造成請求堆積，建議改為在收到回應後再發下一張（或使用節流機制）。

## 測試

- 前端有一個簡單的測試腳本：

```powershell
node ui\tests\test_no_video_inputs.js
```

該腳本會檢查 `ui/tests/no_video_inputs.json` 的 schema 與資料長度（repository 範例會輸出 TEST PASS）。

## 變更紀錄（Changelog）

- 2025-11-13：更新 README，修正專案結構與本地 / docker 開發與執行指引。

---

如果你要我同時把 `README` 翻成英文或加入更完整的部署範例（像是 production docker-compose 或 CI），我可以接著新增。 
