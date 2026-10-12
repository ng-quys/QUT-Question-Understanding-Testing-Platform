@echo off
cd /d "%~dp0"
set missing=0
for %%f in (models\identity\buffalo_l\det_10g.onnx models\identity\buffalo_l\1k3d68.onnx models\identity\buffalo_l\w600k_r50.onnx models\liveness\MiniFASNetV2.onnx models\person\yolo11s.pt models\hands\hand_landmarker.task models\objects\best.pt) do (
  if not exist "%%f" (
    echo MISSING: %%f
    set missing=1
  )
)
if "%missing%"=="1" exit /b 1
echo All required model files exist. Actual model loading is verified when entering an exam.
