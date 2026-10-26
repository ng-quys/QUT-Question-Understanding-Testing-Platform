"""Test additive migration + actual Java upsert SQL on disposable PostgreSQL.

Requires local Docker and the existing postgres:17-alpine image. Never connects
to application/Supabase databases. Container has no network and no host volume.
"""
import re
import subprocess
import time
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
name = 'qut-evidence-test-' + uuid4().hex[:10]


def docker(*args, text=None):
    return subprocess.run(['docker', *args], input=text, text=True, encoding='utf-8',
                          capture_output=True, check=True, timeout=45).stdout


def sql(text):
    return docker('exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', text=text)


try:
    docker('run', '--detach', '--rm', '--network', 'none', '--name', name,
           '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine')
    for _ in range(40):
        try:
            docker('exec', name, 'pg_isready', '-U', 'postgres')
            break
        except subprocess.CalledProcessError:
            time.sleep(.25)
    sql('CREATE TABLE exam_attempts(id BIGINT PRIMARY KEY); INSERT INTO exam_attempts VALUES(125),(126);')
    sql((ROOT / 'database/migrations/004_anticheat_runtime.sql').read_text(encoding='utf-8'))
    sql("INSERT INTO anti_cheat_events(attempt_id,event,evidence_path) VALUES(125,'NO_FACE','old-local.jpg');")
    migration = (ROOT / 'database/migrations/007_supabase_evidence.sql').read_text(encoding='utf-8')
    sql(migration)
    sql(migration)
    assert sql("SELECT evidence_provider||':'||evidence_path FROM anti_cheat_events WHERE event_uuid IS NULL;").strip() == 'local:old-local.jpg'
    source = (ROOT / 'backend/src/main/java/com/examflow/backend/service/AiEvidenceIngest.java').read_text(encoding='utf-8')
    statement = re.search(r'createNativeQuery\("""(.*?)"""\)', source, re.S).group(1)
    identifier = str(uuid4())
    base = dict(attempt='125', event="'NO_FACE'", active='TRUE', time="'2026-10-16 10:00:00'",
                duration='2.5', risk='20', level="'LOW'", local="'synthetic-local.jpg'", uuid=f"'{identifier}'",
                bucket='NULL', key='NULL', status="'pending'", failure='NULL')

    def ingest(**changes):
        values = {**base, **changes}
        sql(re.sub(r':([a-zA-Z]+)', lambda m: values[m[1]], statement) + ';')

    ingest()
    ingest()  # Repeated announcement is the same event.
    object_key = f'attempt-125/{identifier}.jpg'
    ingest(status="'uploaded'", bucket="'exam-evidence'", key=f"'{object_key}'")
    ingest()  # Stale pending callback cannot erase the uploaded image.
    ingest(status="'failed'", failure="'NETWORK_ERROR'")
    assert sql(f"SELECT count(*) FROM anti_cheat_events WHERE event_uuid='{identifier}';").strip() == '1'
    assert sql(f"SELECT evidence_status||':'||evidence_key FROM anti_cheat_events WHERE event_uuid='{identifier}';").strip() == 'uploaded:' + object_key
    assert sql(f"SELECT count(*) FROM anti_cheat_events WHERE attempt_id=126 AND event_uuid='{identifier}';").strip() == '0'
    print('PASS: additive/repeated migration, legacy preservation, duplicate event, stale callback, attempt isolation')
finally:
    subprocess.run(['docker', 'stop', name], capture_output=True, timeout=30)
