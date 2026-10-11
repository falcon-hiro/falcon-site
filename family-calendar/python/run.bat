@echo off
rem あいてる？（Python 版）を起動します。初回は部品のインストールに少し時間がかかります。
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  py -3 -m venv .venv 2>nul || python -m venv .venv
)
".venv\Scripts\python.exe" -m pip install -q -r requirements.txt
".venv\Scripts\python.exe" app.py
pause
