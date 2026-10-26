import os
import re
from pathlib import Path


def load_env_file(path):
    path = Path(path)
    if not path.exists():
        return
    for number, line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise ValueError(f"Invalid .env line {number}")
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if not key or not key.replace("_", "").isalnum():
            raise ValueError(f"Invalid .env key at line {number}")
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        os.environ.setdefault(key, value)


def resolve_internal_secret(root):
    """Use explicit deployment settings, then the sibling local backend config.

    Call after load_env_file. Never print the secret or silently use change-me.
    This fallback is for the project's local application.properties layout.
    """
    for key in ("ANTICHEAT_INTERNAL_SECRET", "APP_ANTICHEAT_SECRET"):
        if key in os.environ:
            value = os.environ[key]
            if not value.strip():
                raise ValueError(f"{key} is empty; configure the same secret as the backend")
            return value, key

    config = Path(root).parent / "backend" / "src" / "main" / "resources" / "application.properties"
    value = None
    if config.is_file():
        for line in config.read_text(encoding="utf-8-sig").splitlines():
            match = re.match(r"^\s*app\.anticheat\.secret\s*[=:]\s*(.*)$", line)
            if match:
                value = match.group(1)
    if value is None:
        raise ValueError("Missing anti-cheat secret. Set ANTICHEAT_INTERNAL_SECRET to the backend secret")
    placeholder = re.fullmatch(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?::([^{}]*))?\}", value)
    if placeholder:
        key, default = placeholder.groups()
        value = os.environ.get(key, default)
    elif "${" in value or "\\" in value:
        raise ValueError("Complex backend secret syntax; set ANTICHEAT_INTERNAL_SECRET explicitly")
    if value is None or not value.strip():
        raise ValueError("Backend anti-cheat secret is empty or unresolved; set ANTICHEAT_INTERNAL_SECRET")
    return value, "backend/src/main/resources/application.properties"
