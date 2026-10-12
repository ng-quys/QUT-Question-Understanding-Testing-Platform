from pathlib import Path
import sys
root = Path(__file__).resolve().parent
models = ["identity/buffalo_l/det_10g.onnx", "identity/buffalo_l/1k3d68.onnx", "identity/buffalo_l/w600k_r50.onnx", "liveness/MiniFASNetV2.onnx", "person/yolo11s.pt", "hands/hand_landmarker.task", "objects/best.pt"]
missing = []
for name in models:
    path = root / "models" / name
    ok = path.is_file() and path.stat().st_size > 0
    print(("OK: " if ok else "MISSING/EMPTY: ") + name)
    if not ok: missing.append(name)
print("File presence check only; actual models are loaded when an exam starts.")
sys.exit(1 if missing else 0)
