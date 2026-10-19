"""Idempotent local setup. Change only anti-cheat settings, preserve other settings."""
from pathlib import Path
import os
import re
import secrets


def update_settings(path, updates):
    path = Path(path)
    raw = path.read_bytes() if path.exists() else b''
    bom = raw.startswith(b'\xef\xbb\xbf')
    text = raw.decode('utf-8-sig')
    newline = '\r\n' if '\r\n' in text else '\n'
    for key, value in updates.items():
        if '\n' in value or '\r' in value:
            raise ValueError('Configuration values must be single-line')
        pattern = r'(?m)^[ \t]*' + re.escape(key) + r'[ \t]*=[^\r\n]*'
        if re.search(pattern, text):
            text = re.sub(pattern, lambda _: key + '=' + value, text)
        else:
            if text and not text.endswith(('\n', '\r')):
                text += newline
            text += key + '=' + value + newline
    path.parent.mkdir(parents=True, exist_ok=True)
    data = text.encode('utf-8')
    path.write_bytes((b'\xef\xbb\xbf' if bom else b'') + data)


def configure(root=None):
    root = Path(root or Path(__file__).resolve().parent).resolve()
    backend = root.parent / 'backend/src/main/resources/application.properties'
    if not backend.is_file():
        raise RuntimeError('Place anticheating next to backend in the QUT project')
    text = backend.read_text(encoding='utf-8-sig')
    properties = dict(re.findall(r'(?m)^([\w.\-]+)[ \t]*=[ \t]*([^\r\n]*)', text))
    secret = properties.get('app.anticheat.secret', os.environ.get('APP_ANTICHEAT_SECRET', ''))
    if secret.startswith('${'):
        placeholder = re.fullmatch(r'\$\{([A-Za-z_][A-Za-z0-9_]*)(?::([^{}]*))?\}', secret)
        if not placeholder:
            raise RuntimeError('Unsupported secret placeholder; set APP_ANTICHEAT_SECRET explicitly')
        name, default = placeholder.groups()
        secret = os.environ.get(name, default or '')
    if not secret or secret == 'change-me':
        secret = secrets.token_urlsafe(32)
    if '\n' in secret or '\r' in secret:
        raise RuntimeError('Invalid multi-line anti-cheat secret')
    port = int(os.environ.get('SERVER_PORT', properties.get('server.port', '8080')))
    if not 1 <= port <= 65535:
        raise RuntimeError('Invalid backend port')
    updates = {
        'app.anticheat.url': 'http://127.0.0.1:8000',
        'app.anticheat.secret': secret,
        'app.student-profile-dir': 'auto',
    }
    old_dir = properties.get('app.student-profile-dir', '')
    update_settings(backend, updates)
    update_settings(root / '.env', {
        'ANTICHEAT_SERVICE_HOST': '127.0.0.1',
        'ANTICHEAT_SERVICE_PORT': '8000',
        'ANTICHEAT_INTERNAL_SECRET': secret,
        'ANTICHEAT_PROFILE_DIR': 'student-profiles',
        'ANTICHEAT_BACKEND_CALLBACK_URL': f'http://127.0.0.1:{port}/api/internal/anticheating/events',
    })
    directory = root / 'student-profiles'
    directory.mkdir(exist_ok=True)
    # Preserve existing student portraits on this computer, without overwriting newer photos.
    if old_dir and Path(old_dir).is_absolute() and Path(old_dir).is_dir():
        import shutil
        for old_photo in Path(old_dir).glob('*.jpg'):
            if old_photo.stem.isdecimal() and not (directory / old_photo.name).exists():
                shutil.copy2(old_photo, directory / old_photo.name)
    return {'secret': secret, 'backend_port': port, 'profile_dir': str(directory)}


if __name__ == '__main__':
    configure()
    print('Anti-cheat settings synchronized. Other backend settings are unchanged.')
    print('Restart backend and AI after setup. Student photos use the project directory.')
