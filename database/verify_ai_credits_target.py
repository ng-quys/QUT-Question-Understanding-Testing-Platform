"""Read-only verification of the MAIN datasource. Never connects to Question Bank."""
from pathlib import Path
import json
import os
import re
from urllib.parse import urlparse, parse_qs
import psycopg2

root = Path(__file__).resolve().parents[1]
properties = {}
for line in (root / "backend/src/main/resources/application.properties").read_text(encoding="utf-8").splitlines():
    if line.strip() and not line.lstrip().startswith("#") and "=" in line:
        key, value = line.split("=", 1)
        properties[key.strip()] = value.strip()
values = {}
for name in (".env", "backend/.env"):
    path = root / name
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip('"').strip("'")
values.update(os.environ)

def prop(key):
    value = os.environ.get(key.upper().replace(".", "_").replace("-", "_"), properties.get(key, ""))
    return re.sub(r"\$\{([^}:]+)(?::([^}]*))?\}", lambda m: values.get(m[1], m[2] or ""), value)

for prefix in ("spring.datasource", "questionbank.datasource"):
    endpoint = urlparse(prop(prefix + ".url").removeprefix("jdbc:"))
    print(json.dumps(dict(datasource=prefix, host=endpoint.hostname, port=endpoint.port or 5432,
                         database=endpoint.path.lstrip("/"), connection_user=prop(prefix + ".username"))))

url = urlparse(prop("spring.datasource.url").removeprefix("jdbc:"))
connection = psycopg2.connect(host=url.hostname, port=url.port or 5432, dbname=url.path.lstrip("/"),
    user=prop("spring.datasource.username"), password=prop("spring.datasource.password"),
    sslmode=parse_qs(url.query).get("sslmode", ["prefer"])[0], connect_timeout=10)
connection.autocommit = True
try:
    with connection.cursor() as cursor:
        cursor.execute("BEGIN READ ONLY")
        cursor.execute("SET LOCAL statement_timeout = 10000")
        queries = {
            "identity": "SELECT current_database(), current_schema(), current_user, current_setting('transaction_read_only')",
            "columns": """SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns
                WHERE table_schema='public' AND ((table_name='users' AND column_name='id')
                OR table_name='ai_generation_requests') ORDER BY table_name,ordinal_position""",
            "constraints": """SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint
                WHERE conrelid=to_regclass('public.ai_generation_requests') ORDER BY conname""",
            "legacy": """SELECT status,count(*),min(requested_question_count),max(requested_question_count),
                count(*) FILTER(WHERE requested_by IS NULL) FROM public.ai_generation_requests GROUP BY status""",
            "credits_tables": """SELECT table_name FROM information_schema.tables WHERE table_schema='public'
                AND table_name IN ('ai_credit_accounts','ai_credit_months','ai_credit_transactions')""",
        }
        for label, sql in queries.items():
            cursor.execute(sql)
            print(label, json.dumps(cursor.fetchall(), default=str))
        cursor.execute("ROLLBACK")
finally:
    connection.close()
