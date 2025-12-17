# 🤖 AI Deadlift Coach — ML Training Module

機器學習模組，用於訓練硬舉姿勢分類模型。

> 📖 完整功能說明請參考 [專案根目錄 README](../README.md)  
> 📦 uv 詳細教學請參考 [docs/uv_guide.md](../docs/uv_guide.md)

---

## 🚀 快速開始

```powershell
# 在專案根目錄執行
cd CloudFinalProject
uv sync
uv run python video_analysis/train_local.py
```

---

## 📁 檔案說明

| 檔案 | 說明 |
|------|------|
| `train_local.py` | 本地訓練腳本（讀取影片 → 提取特徵 → 訓練模型） |
| `predict_youtube.py` | YouTube 影片預測工具 |
| `api_server.py` | 獨立 ML API Server（可選） |
| `deadlift_rf_model.pkl` | 訓練好的 Random Forest 模型 |
| `label_binarizer.pkl` | MultiLabelBinarizer 標籤編碼器 |

---

## 🧠 模型架構

### 訓練流程

```
影片 → MediaPipe Pose (33 landmarks) → 特徵提取 (13 維/幀)
    → 滑動視窗 (30 幀) → 聚合特徵 (mean/max/min/std = 36 維)
    → Random Forest Classifier → 9 種姿勢標籤
```

### 可識別的姿勢標籤

```
✅ 正確動作        🔴 背部彎曲        ⚠️ 髖提早上升
⚠️ 啟動姿勢錯誤    ⚠️ 杠鈴離身體太遠   ⚠️ 站姿過寬
⚠️ 結尾姿勢不完全  ⚠️ 鎖膝過早        ⚠️ 頭部位置錯誤
```

---

## 📊 訓練資料格式

訓練資料位於 `data/labels/video_markdown_data.csv`：

```csv
video_id,video_url,platform,start_seconds,end_seconds,label,timestamp
BV1z7411z7FK,https://bilibili.com/...,bilibili,10,15,背部彎曲,2025-01-01
```

影片檔案放在 `data/cleaned_videos/`，檔名需包含 video_id。

---

## 🔄 更新後端模型

訓練完成後，需將模型複製到後端：

```powershell
Copy-Item "video_analysis/deadlift_rf_model.pkl" -Destination "pose_backend/"
Copy-Item "video_analysis/label_binarizer.pkl" -Destination "pose_backend/"
```

---

*詳細演算法說明請參考 [專案 README](../README.md)*