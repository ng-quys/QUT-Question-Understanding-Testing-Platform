from pathlib import Path
import sys
from app.model_config import prepare_models


def main():
    root = Path(__file__).resolve().parent
    try:
        for path in prepare_models(root / 'models'):
            print('OK: ' + str(path.relative_to(root)))
    except (OSError, ValueError) as exc:
        print(str(exc))
        return 1
    print('Model files found. Actual loading and camera checks occur when entering an exam.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
