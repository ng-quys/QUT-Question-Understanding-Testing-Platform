@echo off
setlocal
title QUT - Dung cac dich vu da khoi dong
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-qut.ps1" -Stop
set "QUT_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %QUT_EXIT%
