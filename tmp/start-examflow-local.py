import json
import os
import secrets
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlsplit

from dotenv import dotenv_values
from psycopg2.extensions import parse_dsn

root = Path(__file__).resolve().parents[1]
properties = {}
for raw in (root / "backend/src/main/resources/application.properties").read_text(encoding="utf-8").splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    properties[key.strip()] = value.strip()

ai_env = dotenv_values(root / "ai-service/.env")
dsn = ai_env.get("EXAMFLOW_QUESTIONBANK_DSN") or ""
parsed = urlsplit(dsn)
dsn_password = parsed.password or parse_dsn(dsn).get("password")
if not dsn_password:
    raise SystemExit("Question Bank DSN has no password")

os.environ["AI_INTERNAL_KEY"] = os.environ.get("AI_INTERNAL_KEY") or secrets.token_urlsafe(36)
os.environ["ANTICHEAT_INTERNAL_SECRET"] = properties.get("app.anticheat.secret", "")
os.environ["QUESTION_BANK_DB_PASSWORD"] = unquote(dsn_password)
os.environ["EXAMFLOW_QUESTIONBANK_DSN"] = dsn
ollama_dir = Path(r"C:\Users\Quys\AppData\Local\Programs\Ollama")
os.environ["PATH"] = str(ollama_dir) + os.pathsep + os.environ.get("PATH", "")

local_config = root / ".env.examflow.local.json"
if local_config.exists():
    for key, value in (json.loads(local_config.read_text(encoding="utf-8")).get("Environment") or {}).items():
        if key in {"AI_CREDITS_WORKER_ENABLED", "AI_CREDITS_WORKER_CLUSTER_READY"}:
            os.environ[key] = str(value)

command = [
    "powershell.exe", "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass",
    "-File", str(root / "start-examflow.ps1"),
    "-ConfigPath", str(root / "tmp/.launcher-runtime-empty.json"),
    "-StartupTimeoutSeconds", "180",
]
raise SystemExit(subprocess.run(command, cwd=root, env=os.environ).returncode)
