# 🚀 Python uv 套件管理指南

> **uv** 是由 Astral 開發的超快速 Python 套件管理工具，可取代 pip、pip-tools、virtualenv、poetry 等工具。

---

## 📦 安裝 uv

### Windows (PowerShell)
```powershell
# 方法一：使用官方安裝腳本
irm https://astral.sh/uv/install.ps1 | iex

# 方法二：使用 winget
winget install astral-sh.uv

# 方法三：使用 pip（不推薦）
pip install uv
```

### macOS / Linux
```bash
# 使用 curl
curl -LsSf https://astral.sh/uv/install.sh | sh

# 使用 Homebrew (macOS)
brew install uv
```

### 驗證安裝
```powershell
uv --version
# 輸出: uv 0.5.x
```

---

## 🏗️ 專案初始化

### 建立新專案
```powershell
# 建立新專案（會產生 pyproject.toml）
uv init my-project
cd my-project

# 在現有目錄初始化
uv init
```

### 專案結構
```
my-project/
├── pyproject.toml    # 專案配置與依賴
├── uv.lock           # 鎖定版本（自動產生）
├── .python-version   # Python 版本
├── .venv/            # 虛擬環境
└── src/
    └── my_project/
        └── __init__.py
```

---

## 🐍 Python 版本管理

### 安裝 Python 版本
```powershell
# 安裝特定版本
uv python install 3.10
uv python install 3.11
uv python install 3.12

# 安裝多個版本
uv python install 3.10 3.11 3.12
```

### 列出可用版本
```powershell
# 列出已安裝的 Python
uv python list

# 列出所有可安裝版本
uv python list --all-versions
```

### 設定專案 Python 版本
```powershell
# 固定專案 Python 版本（會建立 .python-version）
uv python pin 3.10
```

---

## 📥 依賴管理

### 新增套件
```powershell
# 新增套件（自動更新 pyproject.toml）
uv add numpy
uv add pandas scikit-learn

# 新增特定版本
uv add "numpy>=1.26.0,<2.0"
uv add "mediapipe==0.10.14"

# 新增開發依賴
uv add --dev pytest black ruff
```

### 移除套件
```powershell
uv remove numpy
uv remove --dev pytest
```

### 同步依賴（安裝所有套件）
```powershell
# 根據 pyproject.toml 和 uv.lock 安裝所有依賴
uv sync

# 包含開發依賴
uv sync --dev
```

### 更新套件
```powershell
# 更新特定套件
uv lock --upgrade-package numpy

# 更新所有套件
uv lock --upgrade
uv sync
```

---

## ▶️ 執行程式

### 使用 uv run
```powershell
# 執行 Python 腳本（自動使用虛擬環境）
uv run python script.py

# 執行模組
uv run python -m pytest

# 執行套件提供的命令
uv run uvicorn app:app --reload
```

### 互動式 Python
```powershell
uv run python
```

---

## 🔧 虛擬環境管理

### 建立虛擬環境
```powershell
# 自動建立（執行 sync 時）
uv sync

# 手動建立
uv venv

# 指定 Python 版本
uv venv --python 3.10
```

### 啟動虛擬環境（傳統方式）
```powershell
# Windows PowerShell
.\.venv\Scripts\Activate.ps1

# Windows CMD
.\.venv\Scripts\activate.bat

# macOS / Linux
source .venv/bin/activate
```

> 💡 **提示**：使用 `uv run` 時不需要手動啟動虛擬環境！

---

## 📋 pyproject.toml 範例

```toml
[project]
name = "my-project"
version = "0.1.0"
description = "專案描述"
readme = "README.md"
requires-python = ">=3.10,<3.13"
dependencies = [
    "numpy>=1.26.0,<2.0",
    "pandas>=2.2.0",
    "scikit-learn>=1.4.0",
    "fastapi>=0.124.0",
    "uvicorn[standard]>=0.34.0",
    "mediapipe==0.10.14",
]

[tool.uv]
dev-dependencies = [
    "pytest>=8.0.0",
    "black>=24.0.0",
    "ruff>=0.8.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

---

## ⚠️ 常見問題與解決方案

### 問題 1：OneDrive 路徑無法使用 hardlink
```powershell
# 錯誤訊息：failed to hardlink ... (os error 396)

# 解決方案：設定環境變數使用 copy 模式
$env:UV_LINK_MODE="copy"
uv sync
```

### 問題 2：MediaPipe 版本問題
```powershell
# MediaPipe 0.10.30 有 API 變更，使用 0.10.14
uv add "mediapipe==0.10.14"
```

### 問題 3：清除快取
```powershell
uv cache clean
```

### 問題 4：重新建立虛擬環境
```powershell
# 刪除現有環境
Remove-Item -Recurse -Force .venv

# 重新建立
uv sync
```

---

## 🆚 uv vs 其他工具比較

| 功能 | uv | pip | poetry | conda |
|------|:--:|:---:|:------:|:-----:|
| 安裝速度 | ⚡⚡⚡ | ⚡ | ⚡⚡ | ⚡ |
| 依賴解析 | ✅ | ❌ | ✅ | ✅ |
| Lock 檔案 | ✅ | ❌ | ✅ | ❌ |
| Python 版本管理 | ✅ | ❌ | ❌ | ✅ |
| 虛擬環境 | ✅ | ❌ | ✅ | ✅ |
| 單一執行檔 | ✅ | ❌ | ❌ | ❌ |

---

## 📚 常用指令速查表

| 指令 | 說明 |
|------|------|
| `uv init` | 初始化專案 |
| `uv add <pkg>` | 新增套件 |
| `uv remove <pkg>` | 移除套件 |
| `uv sync` | 同步/安裝所有依賴 |
| `uv lock` | 更新 lock 檔案 |
| `uv run <cmd>` | 在虛擬環境中執行命令 |
| `uv python install <ver>` | 安裝 Python 版本 |
| `uv python pin <ver>` | 固定 Python 版本 |
| `uv venv` | 建立虛擬環境 |
| `uv cache clean` | 清除快取 |
| `uv tree` | 顯示依賴樹 |
| `uv pip list` | 列出已安裝套件 |

---

## 🔗 參考資源

- [uv 官方文件](https://docs.astral.sh/uv/)
- [uv GitHub](https://github.com/astral-sh/uv)
- [Astral 官網](https://astral.sh/)

---

*最後更新：2025-12-17*
