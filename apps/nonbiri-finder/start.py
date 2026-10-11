"""ダブルクリック（または python start.py）で画面を起動するための入口。

- 通常: python start.py            → インターネットの地図データで検索
- 見本: python start.py --demo     → ネットなしで見本データを表示
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from nonbiri_finder.cli import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main(["web", *sys.argv[1:]]))
