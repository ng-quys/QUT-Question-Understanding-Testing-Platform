@echo off
setlocal
title QUT - Khoi dong he thong
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-qut.ps1" %*
set "QUT_EXIT=%ERRORLEVEL%"
echo.
if not "%QUT_EXIT%"=="0" echo Khoi dong chua hoan tat. Vui long doc thong bao phia tren.
pause
exit /b %QUT_EXIT%
