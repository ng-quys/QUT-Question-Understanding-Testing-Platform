"""Test migration 008 on disposable PostgreSQL only, never the app/Supabase DB."""
import subprocess
import time
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
name = "qut-photo-test-" + uuid4().hex[:10]


def docker(*args, text=None):
    return subprocess.run(["docker", *args], input=text, text=True, encoding="utf-8", capture_output=True, check=True, timeout=45).stdout


def sql(text):
    return docker("exec", "-i", name, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At", text=text)


try:
    docker("run", "--rm", "-d", "--network", "none", "--name", name,
           "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17-alpine")
    for _ in range(30):
        try:
            sql("SELECT 1;")
            break
        except subprocess.CalledProcessError:
            time.sleep(.5)
    sql("CREATE TABLE users(id BIGINT PRIMARY KEY, username TEXT); INSERT INTO users VALUES (26,'synthetic');")
    migration = (ROOT / "database/migrations/008_student_photos_storage.sql").read_text(encoding="utf-8")
    sql(migration)
    assert sql("SELECT count(*) FROM users WHERE id=26 AND photo_key IS NULL AND photo_bucket IS NULL;").strip() == "1"
    sql("UPDATE users SET photo_bucket='student-photos', photo_key='student-26/synthetic.jpg' WHERE id=26;")
    sql(migration)
    assert sql("SELECT photo_bucket||':'||photo_key FROM users WHERE id=26;").strip() == "student-photos:student-26/synthetic.jpg"
    print("PASS: migration 008 applies twice, preserves existing users and photo metadata.")
finally:
    subprocess.run(["docker", "stop", name], capture_output=True, timeout=30)
