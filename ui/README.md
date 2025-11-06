# Squat Coach — UI (React + Vite)

此資料夾包含本專案的前端 React 應用（使用 Vite 作為開發/建置工具）。此 README 針對在 `ui` 資料夾內的開發者或部署流程提供快速上手與說明。

## 主要功能

- 基於 React 建立的使用者介面
- 使用 Vite 做為開發與建置工具（快速熱重載、輕量建置）

## 前置需求

- Node.js v16 或更新版本（建議使用 LTS）
- npm（隨 Node.js 安裝）

## 快速開始（在 `ui` 資料夾）

在 PowerShell 中執行：

```powershell
# 進入 ui 資料夾（若你已在該資料夾可跳過）
cd ui

# 安裝相依套件
npm install

# 開發模式（啟動 Vite 開發伺服器）
npm run dev
```

開發伺服器啟動後，Vite 通常會顯示本機開發網址（例如 <http://localhost:5173）>，在瀏覽器開啟即可看到應用程式。

## 可用 NPM scripts

此專案的 `package.json` 已定義下列腳本：

- `npm run dev` — 啟動 Vite 開發伺服器（熱重載）
- `npm run build` — 建置生產版本（輸出至 dist）
- `npm run lint` — 使用 ESLint 檢查程式碼
- `npm run preview` — 本機預覽已建置的產物（執行 Vite preview）

```powershell
# 開發
npm run dev

# 建置
npm run build

# 檢查程式碼品質
npm run lint

# 預覽已建置版本
npm run preview
```

## 專案結構（`ui` 資料夾重點）

- `index.html` — 應用入口 HTML
- `src/` — React 原始碼
- `main.jsx` / `App.jsx` — 應用啟動與主要組件
- `assets/` — 靜態資產
- `public/` — 公用靜態檔（直接原封不動被帶入建置）
- `vite.config.js` — Vite 設定
- `package.json` — 套件與 scripts

（實際檔案請參考資料夾內容；此為快速導覽。）

## 常見工作流程

- 開發新功能：`npm run dev` → 編輯 `src/` → 在瀏覽器觀察即時變更
- 準備佈署：`npm run build` → 將 `dist/` 上傳至靜態主機（Netlify、Vercel、GitHub Pages、或任何靜態資源伺服器）

### 佈署小提示

- 若使用 Vercel 或 Netlify，選擇 `ui` 為 deploy root（或在 CI 中先切換目錄並執行 `npm run build`）。
- 若部署到自架伺服器，請將 `dist/` 內容放在你的靜態檔案伺服器（例如 nginx）可讀取的目錄。

## 程式碼品質與 Lint

- 本專案使用 ESLint（套件與相關 plugin 已於 `devDependencies` 定義）。
- 建議在提交前執行 `npm run lint` 並修正警告/錯誤。

## 假設與注意事項

- 假設使用者會在 `ui` 資料夾中執行所有與前端相關的命令。
- 假設 Node.js 與 npm 已正確安裝。

## 貢獻

若要為前端做出修改，請建立分支、實作變更，並提出 Pull Request。簡單的流程：

- 1.Fork / branch
- 2.`npm install`
- 3.`npm run dev` 並確認功能正常
- 4.執行 lint、修正問題
- 5.提交與發 PR

## 聯絡 / 參考

- 若需要整體後端或資料處理相關資訊，請參考專案根目錄的 README 或與專案管理者聯絡。

## Docker 化（建置與執行）

已提供 Docker 設定以便快速在容器中建置與部署前端。

在專案根目錄執行（或在 `ui` 目錄執行並調整路徑）：

```powershell
# 從專案根目錄
docker build -t squatcoach-ui -f ui/Dockerfile ./ui

# 以映像建立並啟動容器（將 8080 對外對應到容器 80）
docker run --rm -p 8080:80 --name squatcoach_ui squatcoach-ui

# 使用 docker-compose（將在根目錄有 docker-compose.yml）
docker-compose up --build
```

啟動後，可在瀏覽器開啟 <http://localhost:8080> 檢視應用程式。

備註：Dockerfile 為多階段建置（node -> build -> nginx），並使用 `nginx.conf` 提供 SPA 的 fallback（所有路由導回 index.html）。
