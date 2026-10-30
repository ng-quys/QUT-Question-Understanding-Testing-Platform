"""Read-only verification for the local batch deployment."""
import importlib.util
import json
from contextlib import closing
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("approved", ROOT / "tmp/approved-ai-deploy.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

backend = m.backend()
environment = backend.environ()
config = m.settings(environment, "spring.datasource")
with closing(m.connection(config, transaction=True)) as connection:
    with connection.cursor() as cursor:
        cursor.execute("SELECT id,credit_state,accepted_count,charged_monthly+charged_extra FROM ai_generation_requests ORDER BY id DESC LIMIT 1")
        latest = cursor.fetchone()
        cursor.execute("SELECT count(*),coalesce(sum(reserved_monthly+reserved_extra),0) FROM ai_generation_requests WHERE credit_state IN ('reserved','running','cancel_requested','unknown')")
        active, reserved = cursor.fetchone()

with m.httpx.Client(timeout=8, trust_env=False) as client:
    ai = client.get("http://127.0.0.1:8002/health")
    backend_health = client.get("http://127.0.0.1:8080/api/health")
    ollama = client.get("http://127.0.0.1:11434/api/tags")
    handshake = client.get("http://127.0.0.1:8080/api/internal/ai-credits/verify-key",
                           headers={"X-AI-Internal-Key": environment["AI_INTERNAL_KEY"]})

payload = ai.json() if ai.status_code == 200 else {}
models = {model.get("name") for model in ollama.json().get("models", [])} if ollama.status_code == 200 else set()
state_path = ROOT / "ai-service/.runtime/credits-registry.json"
m.emit("batch_runtime_readonly", backend_pid=backend.pid,
       backend_http=backend_health.status_code, ai_http=ai.status_code,
       ollama_http=ollama.status_code, handshake_http=handshake.status_code,
       queue=payload.get("queue"), registry_persisted=state_path.exists(),
       qwen_present=any(name and name.startswith("qwen2.5:7b") for name in models),
       embedding_present=any(name and name.startswith("nomic-embed-text") for name in models),
       worker_enabled=environment.get("AI_CREDITS_WORKER_ENABLED"),
       cluster_ready=environment.get("AI_CREDITS_WORKER_CLUSTER_READY"),
       active_jobs=active, reserved_credits=reserved,
       latest_job={"id": latest[0], "state": latest[1], "accepted": latest[2], "charged": latest[3]} if latest else None)
