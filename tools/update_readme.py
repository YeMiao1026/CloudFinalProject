#!/usr/bin/env python3
"""
tools/update_readme.py

Update the repository README.md by appending the latest commit info into
an auto-managed section. The script reads environment variables set by
the GitHub Actions workflow (or you can set them locally for testing):

- COMMIT_FULL: full commit SHA
- COMMIT_SHA: short commit SHA
- COMMIT_MSG: commit message (subject)
- COMMIT_AUTHOR: commit author name
- COMMIT_DATE: commit date (ISO)
- GITHUB_REPOSITORY: owner/repo
- GITHUB_SERVER_URL: https://github.com

The script will create (or update) a section delimited by markers:
<!-- AUTO_COMMIT_TRACK_START --> and <!-- AUTO_COMMIT_TRACK_END -->

It stores a markdown table with columns: 日期 | 提交 | 作者 | 訊息
"""
from __future__ import annotations

import os
from pathlib import Path
from datetime import datetime
import html


def get_env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def sanitize_cell(text: str) -> str:
    """Escape pipes and trim whitespace."""
    if text is None:
        return ""
    return text.replace("|", "\u2016").strip()


def build_row(date: str, short: str, full: str, author: str, msg: str, repo: str, server: str) -> str:
    url = f"{server}/{repo}/commit/{full}"
    short_link = f"[{short}]({url})"
    return f"| {sanitize_cell(date)} | {short_link} | {sanitize_cell(author)} | {sanitize_cell(msg)} |"


def update_readme(readme_path: Path, new_row: str, max_rows: int = 100) -> None:
    content = readme_path.read_text(encoding="utf-8") if readme_path.exists() else ""

    start_marker = "<!-- AUTO_COMMIT_TRACK_START -->"
    end_marker = "<!-- AUTO_COMMIT_TRACK_END -->"

    header = (
        start_marker
        + "\n\n"
        + "## 自動提交紀錄（由 workflow 更新）\n\n"
        + "| 日期 | 提交 | 作者 | 訊息 |\n"
        + "|------|------|------|------|\n"
    )

    if start_marker in content and end_marker in content:
        before, rest = content.split(start_marker, 1)
        _, after = rest.split(end_marker, 1)

        # extract existing rows between header and end_marker
        # find table start (first '|' header line)
        section = rest
        # Remove everything up to the table header, keep rows
        lines = section.splitlines()
        # Find the table header index (the line that starts with '| 日期')
        try:
            table_start = next(i for i, ln in enumerate(lines) if ln.strip().startswith("| 日期"))
            # rows are lines after the separator line
            rows = lines[table_start + 2 :]
        except StopIteration:
            rows = []

        # prepend new row
        rows = [new_row] + [r for r in rows if r.strip()]
        rows = rows[:max_rows]

        new_section = header + "\n".join(rows) + "\n\n" + end_marker
        new_content = before + new_section + after
    else:
        # append the whole section at the end
        if content and not content.endswith("\n"):
            content += "\n"
        new_content = content + header + new_row + "\n" + "\n" + end_marker + "\n"

    readme_path.write_text(new_content, encoding="utf-8")


def main() -> int:
    repo = get_env("GITHUB_REPOSITORY", "")
    server = get_env("GITHUB_SERVER_URL", "https://github.com")

    full = get_env("COMMIT_FULL") or get_env("GITHUB_SHA")
    short = get_env("COMMIT_SHA") or (full[:7] if full else "")
    msg = get_env("COMMIT_MSG", "(no message)")
    author = get_env("COMMIT_AUTHOR", get_env("GITHUB_ACTOR", ""))
    date = get_env("COMMIT_DATE") or datetime.utcnow().isoformat()

    repo_root = Path(__file__).resolve().parent.parent
    readme = repo_root / "README.md"

    if not full:
        # try to get full sha via git if available
        try:
            import subprocess

            full = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo_root).decode().strip()
            short = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=repo_root).decode().strip()
        except Exception:
            pass

    new_row = build_row(date, short, full, author, msg, repo, server)

    update_readme(readme, new_row)

    print(f"Updated {readme} with commit {short} by {author}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
