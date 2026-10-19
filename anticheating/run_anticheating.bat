@echo off
setlocal
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  py -3.11 -m venv .venv
  if errorlevel 1 exit /b 1
)
.venv\Scripts\python.exe -c "import sys; sys.exit(0 if sys.version_info[:2] == (3,11) else 1)"
if errorlevel 1 (
  echo Use Python 3.11. Rename .venv to .venv-old and run again.
  exit /b 1
)
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 exit /b 1
.venv\Scripts\python.exe configure_local.py
if errorlevel 1 exit /b 1
.venv\Scripts\python.exe check_models.py
if errorlevel 1 exit /b 1
rem Local .env has just been synchronized; ignore stale troubleshooting overrides.
set ANTICHEAT_INTERNAL_SECRET=
set APP_ANTICHEAT_SECRET=
set ANTICHEAT_PROFILE_DIR=
set ANTICHEAT_SERVICE_HOST=
set ANTICHEAT_SERVICE_PORT=
set ANTICHEAT_BACKEND_CALLBACK_URL=
.venv\Scripts\python.exe -m src.head_direction_model
if errorlevel 1 exit /b 1
.venv\Scripts\python.exe app\run_service.py
exit /b %errorlevel%
