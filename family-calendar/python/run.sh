#!/bin/sh
# あいてる？（Python 版）を起動します。初回は部品のインストールに少し時間がかかります。
cd "$(dirname "$0")" || exit 1
if [ ! -x ".venv/bin/python" ]; then
  python3 -m venv .venv || exit 1
fi
.venv/bin/python -m pip install -q -r requirements.txt
.venv/bin/python app.py
