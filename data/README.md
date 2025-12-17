# 📊 AI Deadlift Coach — Training Data

機器學習訓練資料存放目錄。

> ⚠️ 影片檔案不會上傳到 Git（太大），僅保留標註資料。

---

## 📁 目錄結構

```
data/
├── raw_videos/           # 原始下載影片（未處理）
├── cleaned_videos/       # 處理後的訓練影片
│   └── *.mp4, *.webm     # 影片檔案（.gitignore 忽略）
├── labels/               # 標註資料
│   └── video_markdown_data.csv  # 主要標註檔
└── README.md
```

---

## 📋 標註格式 (video_markdown_data.csv)

| 欄位 | 說明 | 範例 |
|------|------|------|
| `video_id` | 影片 ID（YouTube/Bilibili） | `BV1z7411z7FK` |
| `video_url` | 原始影片網址 | `https://bilibili.com/...` |
| `platform` | 來源平台 | `youtube` / `bilibili` |
| `start_seconds` | 片段起始秒數 | `10` |
| `end_seconds` | 片段結束秒數 | `15` |
| `label` | 姿勢標籤 | `背部彎曲` |
| `timestamp` | 標註時間 | `2025-01-01` |

---

## 🏷️ 可用標籤

| 標籤 | 說明 |
|------|------|
| `正確動作` | 標準硬舉姿勢 |
| `背部彎曲` | 脊椎過度彎曲（圓背） |
| `髖提早上升` | 臀部比肩膀先上升 |
| `啟動姿勢錯誤` | 起始姿勢不正確 |
| `杠鈴離身體太遠` | 槓鈴路徑偏離 |
| `站姿過寬` | 雙腳站距過寬 |
| `結尾姿勢不完全` | 鎖定不完整 |
| `鎖膝過早` | 膝蓋過早伸直 |
| `頭部位置錯誤` | 頸椎位置不當 |

---

## 📥 新增訓練資料

1. 下載影片到 `cleaned_videos/`（檔名包含 video_id）
2. 在 `labels/video_markdown_data.csv` 新增標註
3. 執行訓練：`uv run python video_analysis/train_local.py`

---

## ⚠️ Git 控管

- ✅ `labels/*.csv` — 會上傳（標註資料）
- ❌ `*.mp4`, `*.webm` — 不上傳（影片太大）
- ❌ `cleaned_videos/*.csv` — 不上傳（中間產物）