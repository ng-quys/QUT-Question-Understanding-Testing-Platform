"""Locate supplied models; never download models or change model weights."""
from pathlib import Path
import shutil

REQUIRED_MODELS = (
    'identity/buffalo_l/det_10g.onnx',
    'identity/buffalo_l/1k3d68.onnx',
    'identity/buffalo_l/w600k_r50.onnx',
    'liveness/MiniFASNetV2.onnx',
    'person/yolo11s.pt',
    'objects/best.pt',
    'head_pose/head_behavior_all_balanced.joblib',
)


def prepare_models(model_root, normalize=True):
    root = Path(model_root).resolve()
    problems = []
    for name in REQUIRED_MODELS:
        target = root / name
        if target.is_file() and target.stat().st_size > 0:
            continue
        candidates = [p for p in root.rglob(target.name)
                      if p.is_file() and p.stat().st_size > 0] if root.is_dir() else []
        if len(candidates) == 1 and normalize:
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                if not target.is_file():
                    problems.append(f'Model destination is not a file: {name}')
                    continue
                target.unlink()  # Only an empty model placeholder is replaced.
            try:
                target.hardlink_to(candidates[0])
            except OSError:
                shutil.copy2(candidates[0], target)
        elif len(candidates) > 1:
            problems.append(f'Ambiguous model {target.name}; place it at models/{name}')
        else:
            problems.append(f'Missing/empty: models/{name}')
    if problems:
        raise FileNotFoundError('\n'.join(problems))
    return [root / name for name in REQUIRED_MODELS]
