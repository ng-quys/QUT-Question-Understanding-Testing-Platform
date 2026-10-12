from pathlib import Path
import re
import secrets

root = Path(__file__).resolve().parent
backend = root.parent / "backend/src/main/resources/application.properties"
if not backend.is_file():
    raise SystemExit("Run this from the anticheating folder placed next to backend.")
values = {}
env_path = root / ".env"
if env_path.exists():
    for line in env_path.read_text(encoding="utf-8-sig").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
secret = values.get("ANTICHEAT_INTERNAL_SECRET", "")
if len(secret) < 24 or secret == "change-me":
    secret = secrets.token_urlsafe(32)
values.update({
    "ANTICHEAT_SERVICE_HOST": "127.0.0.1",
    "ANTICHEAT_SERVICE_PORT": "8000",
    "ANTICHEAT_INTERNAL_SECRET": secret,
    "ANTICHEAT_PROFILE_DIR": str(root / "student-profiles").replace("\\", "/"),
    "ANTICHEAT_BACKEND_CALLBACK_URL": "http://127.0.0.1:8080/api/internal/anticheating/events",
    "ANTICHEAT_DEVICE": "cpu",
})
env_path.write_text("\n".join(key + "=" + value for key, value in values.items()) + "\n", encoding="utf-8")
text = backend.read_text(encoding="utf-8-sig")
updates = {
    "app.anticheat.url": "http://127.0.0.1:8000",
    "app.anticheat.secret": secret,
    "app.student-profile-dir": values["ANTICHEAT_PROFILE_DIR"],
}
for key, value in updates.items():
    pattern = r"(?m)^" + re.escape(key) + r"\s*=.*$"
    if re.search(pattern, text):
        text = re.sub(pattern, lambda _: key + "=" + value, text)
    else:
        text += "\n" + key + "=" + value + "\n"
backend.write_text(text, encoding="utf-8")
(root / "student-profiles").mkdir(exist_ok=True)
print("Configured Python .env and backend application.properties with the same secret and photo directory.")
print("Restart backend. Existing photos stored elsewhere must be copied into student-profiles.")
print("Keep .env and real secrets out of Git.")
