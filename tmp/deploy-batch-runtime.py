"""Safely reload the local AI/Backend processes after batch queue changes."""
import importlib.util
import json
import subprocess
import time
from contextlib import closing
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("approved", ROOT / "tmp/approved-ai-deploy.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def rows(env, sql, args=()):
    with closing(m.connection(m.settings(env, "spring.datasource"), transaction=True)) as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql, args)
            columns = [column[0] for column in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]


def listener(port):
    processes = {connection.pid for connection in m.psutil.net_connections(kind="tcp")
                 if connection.status == m.psutil.CONN_LISTEN and connection.laddr.port == port and connection.pid}
    if len(processes) != 1:
        raise RuntimeError(f"Expected exactly one listener on {port}")
    return m.psutil.Process(processes.pop())


def preflight(backend, backend_env):
    m.preflight(backend_env)
    active = rows(backend_env, """
        SELECT id, credit_state FROM ai_generation_requests
        WHERE credit_state IN ('reserved','running','cancel_requested','unknown')
    """)
    reservations = rows(backend_env, """
        SELECT coalesce(sum(reserved_monthly + reserved_extra), 0) AS reserved
        FROM ai_generation_requests
        WHERE credit_state IN ('reserved','running','cancel_requested','unknown')
    """)[0]["reserved"]
    if active or reservations:
        raise RuntimeError("Active jobs or reservations changed after preflight")
    for _ in range(5):
        legacy = rows(backend_env, """
            SELECT pid FROM pg_stat_activity
            WHERE datname=current_database()
              AND application_name NOT LIKE 'ExamFlow-Main/ai-worker-v1%%'
              AND query ILIKE 'SELECT %%ai_generation_requests%%'
              AND query ILIKE '%%credit_state%%'
        """)
        if legacy:
            raise RuntimeError("Legacy AI Credits poller detected")
        time.sleep(1)
    ai = listener(8002)
    if Path(ai.cwd()).resolve() != (ROOT / "ai-service").resolve() or "uvicorn" not in " ".join(ai.cmdline()):
        raise RuntimeError("FastAPI identity mismatch")
    with m.httpx.Client(timeout=8, trust_env=False) as client:
        ai_health = client.get("http://127.0.0.1:8002/health")
        ollama = client.get("http://127.0.0.1:11434/api/tags")
        if ai_health.status_code != 200 or ollama.status_code != 200:
            raise RuntimeError("AI Service or Ollama is not healthy")
    m.emit("batch_deploy_preflight", active_jobs=0, reservations=0,
           legacy_samples=5, ai_pid=ai.pid, backend_pid=backend.pid)
    return ai


def terminate_ai_tree(ai):
    root = ai.parent()
    if not root or "uvicorn" not in " ".join(root.cmdline()) or Path(root.cwd()).resolve() != (ROOT / "ai-service").resolve():
        root = ai
    command, environment, cwd = root.cmdline(), root.environ(), root.cwd()
    targets = root.children(recursive=True) + [root]
    for process in targets:
        try:
            process.terminate()
        except m.psutil.NoSuchProcess:
            pass
    _, alive = m.psutil.wait_procs(targets, timeout=15)
    if alive:
        raise RuntimeError("FastAPI did not stop cleanly; deployment stopped")
    return command, environment, cwd


def start(command, environment, cwd, label):
    log_dir = ROOT / ".env.examflow.runtime/logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f"{label}-batch-{time.strftime('%Y%m%d-%H%M%S')}.log"
    log = log_path.open("ab", buffering=0)
    process = subprocess.Popen(command, cwd=cwd, env=environment, stdin=subprocess.DEVNULL,
                               stdout=log, stderr=log,
                               creationflags=subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP)
    log.close()
    return process, log_path


def wait_http(process, url, seconds=120):
    with m.httpx.Client(timeout=5, trust_env=False) as client:
        for _ in range(seconds):
            if process.poll() is not None:
                raise RuntimeError(f"Process exited before {url} became healthy")
            try:
                response = client.get(url)
                if response.status_code == 200:
                    return response
            except m.httpx.HTTPError:
                pass
            time.sleep(1)
    raise RuntimeError(f"Health timeout for {url}")


def main():
    backend = m.backend()
    backend_env, backend_cmd, backend_cwd = backend.environ(), backend.cmdline(), backend.cwd()
    ai = preflight(backend, backend_env)
    # Stop the API gateway first so no new job can enter between the safety check
    # and the FastAPI reload.
    backend.terminate()
    backend.wait(timeout=20)
    ai_cmd, ai_env, ai_cwd = terminate_ai_tree(ai)
    ai_process, ai_log = start(ai_cmd, ai_env, ai_cwd, "AI")
    ai_health = wait_http(ai_process, "http://127.0.0.1:8002/health").json()
    if ai_health.get("queue") != {"active": 0, "waiting": 0, "maxConcurrent": 1}:
        raise RuntimeError("FastAPI did not load the durable single-worker queue")
    state_path = ROOT / "ai-service/.runtime/credits-registry.json"
    if not state_path.exists():
        raise RuntimeError("Durable registry was not created")

    # The compiled target/classes is already part of the captured classpath.
    backend_process, backend_log = start(backend_cmd, backend_env, backend_cwd, "Backend")
    wait_http(backend_process, "http://127.0.0.1:8080/api/health")
    with m.httpx.Client(timeout=8, trust_env=False) as client:
        verify = client.get("http://127.0.0.1:8080/api/internal/ai-credits/verify-key",
                            headers={"X-AI-Internal-Key": backend_env["AI_INTERNAL_KEY"]})
        if verify.status_code != 204:
            raise RuntimeError("Backend/FastAPI internal key handshake failed")
        if client.get("http://127.0.0.1:11434/api/tags").status_code != 200:
            raise RuntimeError("Ollama stopped unexpectedly")

    time.sleep(3)
    active = rows(backend_env, "SELECT id FROM ai_generation_requests WHERE credit_state IN ('reserved','running','cancel_requested','unknown')")
    reservations = rows(backend_env, "SELECT coalesce(sum(reserved_monthly + reserved_extra),0) AS reserved FROM ai_generation_requests WHERE credit_state IN ('reserved','running','cancel_requested','unknown')")[0]["reserved"]
    latest = rows(backend_env, "SELECT id,credit_state,accepted_count,charged_monthly+charged_extra AS charged FROM ai_generation_requests ORDER BY id DESC LIMIT 1")
    if active or reservations:
        raise RuntimeError("Job or credit state changed during deployment")
    m.emit("batch_deploy_verified", backend_pid=listener(8080).pid, ai_pid=listener(8002).pid,
           queue=ai_health["queue"], registry_persisted=True, active_jobs=0,
           reservations=0, latest_job=latest[0] if latest else None,
           backend_log=str(backend_log), ai_log=str(ai_log))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        m.emit("batch_deploy_stopped", error=type(exc).__name__, detail=str(exc)[:200])
        raise
