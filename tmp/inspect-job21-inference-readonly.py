"""Read-only, redacted inspection for AI job 21."""
import importlib.util
from pathlib import Path
from contextlib import closing

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("examflow_runtime", root / "tmp/approved-ai-deploy.py")
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)
backend = runtime.backend()
config = runtime.settings(backend.environ(), "spring.datasource")
with closing(runtime.connection(config, transaction=True)) as connection:
    with connection.cursor() as cursor:
        cursor.execute("""
        SELECT id, credit_state, accepted_count,
               charged_monthly + charged_extra AS charged,
               credit_error_code,
               credit_payload::jsonb->>'inferenceBatchSize' AS inference_batch_size,
               credit_payload::jsonb->>'batchSize' AS checkpoint_batch_size
        FROM ai_generation_requests WHERE id=21
        """)
        rows = [dict(zip([column[0] for column in cursor.description], row)) for row in cursor.fetchall()]
print(rows)
