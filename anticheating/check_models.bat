@echo off
setlocal
cd /d "%~dp0"
if exist .venv\Scripts\python.exe (
  .venv\Scripts\python.exe check_models.py
) else (
  py -3 check_models.py
)
exit /b %errorlevel%
