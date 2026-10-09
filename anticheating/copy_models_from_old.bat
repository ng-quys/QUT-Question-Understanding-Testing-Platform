@echo off
setlocal
set "OLD=D:\AntiCheating2"
set "NEW=%~dp0models"
if not exist "%OLD%\models" (
  echo Cannot find %OLD%\models
  echo Edit OLD in this file if your original AntiCheating folder is elsewhere.
  exit /b 1
)
robocopy "%OLD%\models" "%NEW%" /E /NFL /NDL /NJH /NJS /NP
if exist "%OLD%\runs\objects\module3_yolo11s_v2_phonefix\weights\best.pt" (
  if not exist "%NEW%\objects" mkdir "%NEW%\objects"
  copy /Y "%OLD%\runs\objects\module3_yolo11s_v2_phonefix\weights\best.pt" "%NEW%\objects\best.pt" >nul
) else (
  echo WARNING: custom M3 best.pt was not found at the expected old path.
)
echo Model copy finished.
endlocal
