# AI Generator: Question Bank connection

AI Service reads `EXAMFLOW_QUESTIONBANK_DSN`. Backend uses its separate
`questionbank.datasource.*` configuration; it does not export those properties
to a separately launched Python process. Do not use `spring.datasource.*`:
that is the main database for users, AI jobs and credit accounting.

## Configure locally

Set `EXAMFLOW_QUESTIONBANK_DSN` in the same terminal used to start AI Service,
or in `ai-service/.env`. The existing one-click launcher also accepts it under
`Environment` in the ignored `.env.examflow.local.json` file; the example
`examflow.local.example.json` lists this field. Never commit real credentials.

Use the host, port, database and username from the effective Backend
`questionbank.datasource.url` / `questionbank.datasource.username`, and the
matching `QUESTION_BANK_DB_PASSWORD`. A psycopg2 keyword DSN has this shape:

```text
host=<QUESTION_BANK_HOST> port=<PORT> dbname=<DATABASE> user=<QUESTION_BANK_USER> password='<PASSWORD>' sslmode=require
```

Generate the value with `psycopg2.extensions.make_dsn(...)` to quote passwords
correctly. Do not print the resulting DSN. For the AI Service reader, the
connection option `options='-c default_transaction_read_only=on'` prevents
database writes. An embedding-sync worker needs its own separately approved
configuration and is not started as part of this connection check.

Saved-document indexing uses a separate server-only
`EXAMFLOW_QUESTIONBANK_WRITER_DSN`. It must point to the same Question Bank
project and must not contain `default_transaction_read_only=on`. URI passwords must be percent-encoded from the original password exactly once (a literal `%` becomes `%25`); encode only the password component, never the entire URI. Never print a DSN or raw parser errors containing URI fragments. Keep the
reader DSN read-only; never expose either DSN to the frontend.

Production migration 001 is complete (operator-confirmed, 2026-10-24); do not rerun it during connection verification. The saved-document feature remains off until readiness gates pass and activation is explicitly authorized. The following is future activation configuration, not an instruction to enable Production:

```text
AI_SAVED_DOCUMENTS_ENABLED=true
VITE_AI_SAVED_DOCUMENTS_ENABLED=true
SUPABASE_AI_DOCUMENTS_BUCKET=ai-source-documents
```

AI Service now enforces `AI_SAVED_DOCUMENTS_ENABLED` (default false) on index/reindex and documentRefs generation/admission. Disabled requests return HTTP 503 before cache/embedding/registry writes. Paused saved-document jobs are not resumed while disabled; sourceText and status/cancel paths remain available. The flag is captured at process startup, so effective runtime values require an idle controlled deployment/restart, which has not occurred.

The one-click launcher runs Backend from `backend`, whose Spring config imports root `.env.storage` (with a leading dot), not `env.storage`. The canonical file was copied byte-for-byte from the legacy file without overwriting secrets. Existing processes have not been restarted. The launcher JSON allowlist does not currently accept Writer DSN or Saved Documents flags; keep Writer DSN in `ai-service/.env` and resolve launcher configuration mismatches before a restart.

Create that Storage bucket as private before enabling the feature. Backend
uses the server secret for upload; AI Service never receives the Storage key.

Restart AI Service only after confirming no task is executing. Preserve the
existing matching `AI_INTERNAL_KEY`; it is unrelated to the database password.
Run the existing `start-ai-credits.ps1` from the configured terminal. A successful
`/health` alone does not verify the Question Bank connection.

## Expected database structure (inspect read-only)

- `public.questions`: `id`, `course_id`, `content`.
- `public.question_embeddings`: `question_id`, `embedding` (768-dimensional
  `extensions.vector`), `model_name`, `updated_at`; unique `question_id`.
- `public.question_embedding_queue`: consumed by the separate sync tool.
- `public.ai_source_documents`, `public.ai_document_indexes`, and
  `public.ai_document_chunks`: migration 001 saved-document cache.
- pgvector installed in the `extensions` schema; cosine distance `<=>` is used.
- Embedding model: effective `OLLAMA_EMBED_MODEL`, default `nomic-embed-text`.
  Query vectors and stored vectors must use the same model and dimensions.

The inspected Question Bank already contains these objects. The main database
does not need copies of them. No migration is required to resolve a missing
environment variable. No migration creating these objects was found in the
repository's `database/migrations`; the live schema is not proof of its original
deployment method. Do not create tables, run migrations or start embedding
backfill without separate approval.

After configuring, check the database using a read-only connection and exercise
the real duplicate checker. A standalone `/generate` call can test synthetic
document + CLO data without creating an ExamFlow job or reserving credits.
Do not replace the duplicate checker with a mock when reporting end-to-end
success. Creating a new ExamFlow job remains a separate approval step.

## Latest readiness evidence (2026-10-24)

Writer DSN connectivity was successfully verified after the operator corrected URI/host configuration: client TLS enabled, project/database matches Reader configuration, SELECT/INSERT/UPDATE rights on all three RAG tables, no enabled RLS, zero rows. Historical connection errors in rollout notes are superseded. No write probe was performed.

A minimal Spring context verified root `.env.storage` and a successful private bucket metadata GET after removal of the self-referencing bucket placeholder. The existing service-level default remains `ai-source-documents`. This is not proof of a running Production process configuration. The default-off AI feature guard and tests are now implemented in source; no Production deployment/restart or activation is authorized. Real staging integration is pending because local Docker Engine/Ollama and the app endpoints were unavailable; see the rollout document for exact test results and safe restart gates.

Latest guard suite: 36 Python tests passed, including 8 guard-specific tests. Read-only main-database preflight found zero active/unknown credit-state rows and no Question Bank RAG index rows. This is not a restart approval or global-idleness guarantee. Docker/Ollama and app endpoints remain unavailable; real integration, runtime flag verification and model availability remain pending. The dedicated staging compose file does not create the RAG schema or run migrations.
