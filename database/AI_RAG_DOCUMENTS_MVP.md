# AI Generator saved documents — MVP rollout plan

> Latest operator decision (2026-10-25): a limited direct test on the current
> Question Bank/private Storage is now authorized. Saved Documents flags are enabled
> for the current Backend/AI/frontend processes; this supersedes historical flag-off
> notes below but is not official Production readiness acceptance. See
> AI_SAVED_DOCUMENTS_CONTROLLED_TEST.md. Exactly one operator-uploaded PDF is pending;
> no generation job or automated upload is authorized.

Status (2026-10-24): MVP code implemented; migration `001_ai_rag_documents.sql` has been applied successfully to the Production Question Bank, as confirmed by the operator. Saved Documents remains disabled in Production. Do not rerun migration or enable the feature as part of configuration verification.

## Current activation status (2026-10-24, latest audit)

**Not ready for Production activation.** Production migration is complete. Writer DSN now connects successfully with client TLS, matches Reader project/database configuration, and has SELECT/INSERT/UPDATE on all three RAG tables (no RLS enabled); tables were empty at verification. Earlier DNS/encoding notes below are historical and superseded.

Backend Storage configuration has been verified using a minimal real Spring context and real HTTPS metadata GET, without component scanning, datasource creation, web server startup or upload. Effective URL/key match canonical root `.env.storage`; default bucket is `ai-source-documents`; metadata HTTP 200, private=true, 20 MiB. A circular self-placeholder for `SUPABASE_AI_DOCUMENTS_BUCKET` in application.properties was removed; service-level @Value already provides its default. This verifies a fresh configuration context, not an existing Production process. No live Backend/AI Service endpoints were available during this audit.

Feature-state audit: Backend property defaults off and resolved false in Spring. Frontend uses exact `VITE_AI_SAVED_DOCUMENTS_ENABLED==='true'`; no local frontend env file enabling it was found. AI Service now reads `AI_SAVED_DOCUMENTS_ENABLED` at process startup, default false; only a case-insensitive trimmed `true` enables it. Disabled index/reindex, /generate documentRefs and new credit-job documentRefs return HTTP 503 before cache/embedding/registry admission. Direct generation is guarded too. Startup resume skips paused saved-document payloads while disabled, preserving their checkpoints and resume counts; legacy resumes are unchanged. No Production flags were enabled. Running process flag values remain unverified because the endpoints are unavailable.

Executed regression checks:

- Python `test_saved_documents_guard`, `test_document_cache`, `test_clo_generation`, `test_credits_runtime`: 36 passed (8 guard tests plus 28 existing tests). Guard tests use actual AST-extracted routes with an isolated real registry; they intentionally mock downstream work and do not claim live integration. They verify enabled/disabled behavior, 503 before registry admission, unchanged registry bytes when blocked, internal authentication, preserved legacy/health/status/cancel paths, and paused saved-checkpoint preservation with legacy resume. Cache/duplicate-checker code was not changed. Cache-hit test injects an embedder that fails if called; it passes, confirming zero chunk embeddings in that unit-test path. These are mocked database/embedding checks, not a live Ollama/PostgreSQL benchmark.
- Backend `AiDocumentServiceTest`, `AiExtractionContractTest`, `AiJobTransportTest`, `AiGeneratorMatrixCompatibilityTest`: 32 cases, 31 passed, 1 skipped, zero failures/errors. Includes disabled flag, course authorization before Question Bank access, invalid refs, legacy extraction/transport and matrix compatibility. Does not establish full teacher/owner cross-account API integration or real Ollama sourceText generation. Synthetic test job objects do not create Production jobs or ledger rows.
- Docker Desktop Linux Engine unavailable (named pipe missing). Ollama port 11434, AI Service 8002 and Backend 8080 did not respond; no matching app processes were found. Ollama executable is installed but was not started. Bundled PostgreSQL lacks a discovered pgvector extension. No separate staging DSN/bucket was supplied or used. Therefore live upload → extract → indexing → ready → cache hit, cross-user API authorization, and real sourceText integration were **not executed**, and live zero-new-chunk-embedding acceptance is **not yet established**.

Audit harness: `tmp/SavedDocumentsStorageAudit.java`, with a locally generated dependency classpath in `tmp/saved-documents-classpath.txt`. It only reports booleans/statuses and GETs bucket metadata. No secrets or DSNs are written by the harness. Existing Production services were not restarted. No Production document, job, schema, credit or ledger writes occurred.

### Remaining release gates

1. Completed in source: default-off AI guard and disabled-path tests. Still deploy/verify this code only at an authorized idle restart; do not infer that an existing process has the guard.
2. Supply/start an isolated staging stack: real pgvector PostgreSQL with its own migrated schema, staging main database and private Storage bucket, plus real Ollama with a manifest-resolvable 768-dimensional model. Never reuse Production Writer DSN for the staging upload test. Starting/preparing that stack must not alter Production schema or data. Current running prerequisites are absent; no substitutes were used to claim success.
3. Run the staging execution plan below, including owner/course denial, stale/reindex scenarios, legacy sourceText and real cache-hit counters; meet latency/embedding gates and retain redacted evidence.
4. Resolve launcher JSON/allowlist mismatch described below before relying on the one-click launcher. Confirm effective flags independently in each actual running process/build.

### Safe activation and restart procedure (proposal only)

1. Only after all staging gates pass and explicit Production activation authorization, schedule a maintenance window and stop acceptance of new AI submissions at the application entry point. Coordinate all Backend/AI workers, not only the local process. Do not modify credits or terminate tasks to manufacture an idle state.
2. Use read-only main-database queries to verify zero active/uncertain requests in `reserved`, `running`, `cancel_requested`, or `unknown`, and inspect worker leases/AI registry for active executions and in-flight document index/reindex requests. Any unknown/unreconciled execution blocks restart. No responding health endpoint or empty local registry alone proves global idleness. The latest read-only configured main-database query found zero rows in these four credit states, and the configured Question Bank returned no document index rows. This is a point-in-time database observation, not proof of global quiescence or restart authorization; worker leases, registry and incoming requests still require checks at the actual restart window.
3. With flags still off, deploy the tested configuration and guarded AI code. Preserve registry/checkpoint files, internal keys and database credentials; never launch an extra AI worker alongside an old one. Stop/restart only the identified service processes after idleness is established. Keep the worker coordination behavior unchanged.
4. Validate Backend config import and private bucket GET, Reader/Writer TLS and target, Ollama model digest/dimensions, internal-key handshake and registry identity. Disabled endpoint smoke checks must not write data.
5. Enable the coordinated server flag in Backend and guarded AI Service, and frontend Vite flag in its environment/build. Perform required controlled restarts/rebuild with submissions still closed, verify actual values, then reopen access. Do not put unsupported fields into launcher JSON; validate the chosen flag delivery path first. A Production document/job smoke test needs explicit authorization because it writes data.
6. For feature rollback, close new submissions first, allow in-flight work to settle, and disable coordinated flags at a safe boundary. Preserve pinned indexes, storage objects, registry and ledger. Do not execute migration rollback, purge or credit adjustments as a toggle rollback.

## Pre-production verification (2026-10-24)

The migration test `database/questionbank/test_ai_rag_documents_migration.py` ran against a disposable `pgvector/pgvector:pg17` container with a synthetic password and no project DSN. The container was removed after the run.

- Migration applied twice on an empty schema and again with a populated ready index without changing rows.
- Target guards rejected both a database without the Question Bank baseline and a baseline using a non-768 vector column.
- All three tables, constraints, internal foreign keys, btree indexes, and `extensions.vector(768)` were verified; no ANN index exists.
- A fingerprint covering `question_embeddings` and `question_embedding_queue` schema/sentinel data was unchanged after migration and both rollback paths.
- Empty rollback passed. Populated rollback refused without its explicit flag, then passed with the flag in the disposable database.
- Document identity/revision, ready-index configuration/text/count, and completed chunks rejected mutation.
- A pinned ready index remained exactly searchable after document soft delete. Explicit purge required the purge session flag.
- Existing Backend `sourceText`/transport tests passed 28/28. No job, credit, or ledger write was performed.

## Boundaries

- The three new tables belong to the Question Bank database, not the main database.
- `question_embeddings` and `question_embedding_queue` remain unchanged.
- MVP uses exact pgvector distance search restricted to one to five pinned document indexes. No ANN index is created.
- AI Credits reservation/settlement, duplicate checking, checkpoint/resume, and worker coordination retain their existing behavior.
- Existing jobs with `sourceText` remain valid. New jobs prefer immutable `documentRefs`.

## Cache identity

The application computes lowercase SHA-256 values over raw file bytes and extracted UTF-8 text. The canonical index configuration is serialized as JSON with sorted keys and no insignificant whitespace:

```json
{
  "chunkOverlap": 150,
  "chunkSize": 800,
  "chunkerVersion": "recursive-character-v1",
  "embeddingDimensions": 768,
  "embeddingModel": "nomic-embed-text",
  "embeddingModelDigest": "<ollama manifest digest>",
  "extractedTextSha256": "<sha256>",
  "extractorVersion": "examflow-pdf-docx-txt-v1"
}
```

`configHash = SHA-256(canonical JSON UTF-8)`. A cache hit requires the same owner, course, file SHA-256, ready index, config hash, expected chunk count, and 768-dimensional non-null vectors. A model tag match without the Ollama digest is not a cache hit.

## API contracts

All public endpoints authenticate the current teacher in Backend and verify course access in the main DB before accessing Question Bank. Question Bank user/course IDs are external IDs and deliberately have no cross-database foreign keys.

- `POST /api/teacher/courses/{courseId}/ai-documents` — multipart field `files`, 1–5 files, 20 MiB each. Streams to a temporary file while hashing; does not buffer five full files in heap.
- `GET /api/teacher/courses/{courseId}/ai-documents` — owner-only active library by default.
- `GET /api/teacher/ai-documents/{documentId}` — metadata and index state; no extracted text by default.
- `POST /api/teacher/ai-documents/{documentId}/reindex` — idempotently creates or returns the index for the current config hash.
- `DELETE /api/teacher/ai-documents/{documentId}` — soft delete only.
- Internal AI endpoint indexes a document and returns status; protected by `AI_INTERNAL_KEY` and registry identity where applicable.

New generation payload:

```json
{
  "courseId": 12,
  "documentRefs": [
    {
      "documentId": "uuid",
      "revision": 1,
      "indexId": "uuid",
      "configHash": "64-lowercase-hex"
    }
  ],
  "cloIds": [3, 4],
  "questionCount": 10,
  "batchSize": 5
}
```

Backend resolves and pins refs before reserving credits. The idempotency payload hash includes the ordered refs. The legacy `sourceText + sourceProof` branch remains supported. Exactly one source mode is accepted for a new request.

## Processing flows

### New upload

1. Authenticate teacher and verify `created_by`/`course_faculties` access in the main DB.
2. Validate extension/MIME/size, stream to a local temporary file, and calculate SHA-256.
3. Query an active document with the same owner, course, and SHA-256.
4. On a valid cache hit, discard the temporary upload and return the existing ready index.
5. Otherwise upload the original to private storage and insert document metadata.
6. Extract text, calculate text SHA-256, calculate config hash, split chunks, and embed sequentially through the single AI resource queue.
7. Insert chunks and mark the immutable index `ready` in one Question Bank transaction only after counts and dimensions validate.
8. On failure mark the index `failed`; never expose partial chunks as ready.

### Saved document

1. Revalidate current teacher, owner, course, document state, index state, config hash, model digest, dimensions, and chunk count.
2. Pass pinned refs to the job. AI Service performs exact search without depending on `search_path`:
   `WHERE index_id = ANY(?) ORDER BY embedding OPERATOR(extensions.<=>) query_vector LIMIT 4`.
3. Only the CLO/query text is embedded. Stored document chunks are not embedded again.

### Reindex

- Never mutate a ready index used by a job. Create a new index ID for a new config hash and atomically mark it ready after all chunks exist.
- Database triggers make document identity/revision immutable and lock extracted text, index configuration, and chunks after `ready_at` is set. Purge requires a soft-deleted document plus the explicit `examflow.allow_ai_index_purge` session flag.
- Keep old indexes through the maximum job timeout and while any active/unknown job payload references them.
- Failed reindex leaves the previous ready index usable only when it remains compatible with the runtime config.

### Delete and purge

- DELETE marks the document `deleted` immediately, hiding it from new selections. It does not delete storage, indexes, or chunks.
- Physical purge runs separately after a grace period greater than the configured 120-minute job timeout and checks the main DB again for refs in `reserved`, `running`, `cancel_requested`, or `unknown` jobs.
- Any referenced index blocks purge. `unknown` blocks purge until reconciliation.
- Purge order: storage object; chunk rows; index rows; document row. Storage failure keeps metadata for retry.
- The document-to-index `ON DELETE RESTRICT` constraint prevents accidental document deletion before explicit index cleanup.

## Private storage

Create a dedicated private Supabase bucket such as `ai-source-documents`; do not reuse `exam-evidence` or `student-photos`. Configure server-only `SUPABASE_AI_DOCUMENTS_BUCKET`. Reuse the existing Backend Java `HttpClient`/server-secret pattern in a separate `SupabaseAiDocumentStorage` service.

Object key pattern:

`{ownerId}/{courseId}/{documentId}/{revision}/{fileSha256}.{extension}`

Never put secrets or original filenames in URLs. Do not expose public URLs. Downloads, if added, require a fresh Backend authorization check and a short-lived signed URL. Local filesystem storage may be a test/dev adapter only; it is not the Production source of truth.

## UI

Move course selection before the document step, then show two tabs:

1. **Tải tài liệu mới** — existing drag/drop and validation, plus indexing state.
2. **Tài liệu đã lưu** — owner library filtered by course, with checkbox, name, date, size, and cache status.

Allow a mixed selection but enforce a combined maximum of five documents. Disable generation while any selection is extracting/indexing/stale/failed. Reindex is explicit and shows its reason; the UI never silently falls back to legacy re-embedding.

## Benchmark and rollout gates

Feature flag: `AI_SAVED_DOCUMENTS_ENABLED=false` until staging migration and tests pass.

Test the same corpus with 1, 3, and 5 documents, both cold and warm Ollama, at least five runs each. Record P50/P95 and counters:

- upload, extraction, chunking, chunk embedding, DB insert, cache lookup, first retrieval, and total RAG preparation milliseconds;
- number of `/api/embed` calls and number of embedded chunk texts;
- bytes stored, chunk count, exact-search time, and peak AI/Ollama RAM from telemetry.

Acceptance gates:

- cache hit performs zero chunk-embedding calls;
- cache-hit preparation is at least 80% faster than a new upload on the same corpus;
- exact-search P95 remains acceptable for five selected documents (initial target under 500 ms locally);
- generated-question validation, duplicate checking, credits, and checkpoint tests remain unchanged;
- only benchmark evidence may justify a later ANN index migration.

## Migration record and historical procedure

The procedure below is historical deployment guidance, not a pending instruction. Production migration is complete. The read-only inspection on 2026-10-24 found all three document-cache tables present and empty; this inspection does not independently prove pre/post-migration checksums or every constraint. Any future schema change or rollback requires separate authorization.

1. Confirm the target has `public.questions`, `public.question_embeddings`, and `extensions.vector(768)`.
2. Back up the Question Bank schema and record row counts/checksums for question embedding tables.
3. Apply `database/questionbank/migrations/001_ai_rag_documents.sql` in staging.
4. Run the migration's read-only checks and confirm all three new tables are empty.
5. Verify `question_embeddings` and its queue are byte/row-count unchanged.
6. Deploy code with the feature flag off, run tests, then enable only in staging.
7. Rollback with the prepared script only while tables are empty. Populated rollback requires an explicit session flag, backups, and storage cleanup approval.

## MVP implementation scope

Backend:

- New document controller/service/repository DTOs under `backend/src/main/java/com/examflow/backend/`.
- New `SupabaseAiDocumentStorage` patterned after existing private storage services.
- Extend `AiGenerateRequest`, `AiCreditsService`, and `AiCreditsProvider` with the dual legacy/ref payload contract only; reservation and settlement logic stay intact.
- Add `SUPABASE_AI_DOCUMENTS_BUCKET` to `.env.storage.example` and feature/config samples.

AI Service:

- Add a PostgreSQL document store/indexing module and internal index endpoints.
- Extend `GenerationRequest` and `_generate` to choose legacy in-memory FAISS or pinned exact-search document refs.
- Keep question duplicate search on `question_embeddings` unchanged.

Frontend/shared:

- Add saved-document API service and document-ref types.
- Update `DocumentUploadStep`/`AIGeneratorPage` with course-first selection and the two tabs.
- Keep CLO, question count, progress, review, and credits UI behavior unchanged.

Tests:

- Migration guard/rollback tests; owner/course authorization; five-document limit; SHA/config cache hit; model/chunk incompatibility; reindex immutability; delete/purge protection; legacy payload compatibility; zero chunk embeddings on cache hit; benchmark fixture.


## Configuration readiness audit (2026-10-24)

- Live Storage metadata: `ai-source-documents` is private; maximum file size is 20 MiB; allowed MIME types are PDF, DOCX, and plain text. No upload was performed.
- Reader connection succeeds and the three document-cache tables each contain zero rows. Audit SELECTs explicitly used read-only transactions. The reader role also has INSERT/UPDATE privileges, so do not mistake connection read-only options for role-level write isolation.
- Writer URI percent-encoding was corrected by the operator and now parses successfully. Its Supabase project reference matches the Reader, while host differs and port/database match. Live Writer verification is blocked by hostname resolution failure; no Writer privileges have been verified. After the operator host/SSL correction, the configured URI explicitly requires SSL. A fresh Writer connection attempt still fails at hostname resolution; connection and permissions remain pending. The operator must encode the password from the original credential; never guess or replace it. A literal percent sign becomes `%25`, `@` becomes `%40`, and `#` becomes `%23`. Encode only the original password, exactly once, using URI component encoding (for example `urllib.parse.quote(raw_password, safe="")` locally); do not print the result or encode the whole URI. Do not blindly replace every `%` in an already encoded password.
- Backend launcher (`scripts/examflow-service.ps1`) runs Maven with working directory `backend`. Spring imports root `.env.storage` via `../.env.storage`; the legacy filename `env.storage` is not imported. The canonical `.env.storage` was created as an exact byte copy without overwriting an existing file or changing secrets. Keep future configuration in `.env.storage`; retain the legacy file until the operator decides its cleanup. No service was restarted, so effective configuration of an existing process remains unverified. Process environment/command-line overrides can take precedence.
- AI launcher runs in `ai-service`; `load_dotenv()` loads its `.env` without overriding inherited environment. Keep Writer DSN server-only there. Current one-click launcher Environment allowlist does not accept Writer DSN or Saved Documents flags; do not add those fields to launcher JSON without updating and testing the launcher. The current local JSON also contains worker fields outside this allowlist; resolve that launcher mismatch before relying on a fresh one-click startup, without changing worker behavior blindly.
- Production Saved Documents flags have not been enabled. Backend defaults off; frontend requires `VITE_AI_SAVED_DOCUMENTS_ENABLED=true` at Vite startup/build time. File inspection alone does not establish the environment of an already running process.
- Historical finding, now resolved in source: AI index/reindex initially lacked a feature guard. The latest implementation enforces a default-off flag for index/reindex, saved-ref generation/admission and paused-job resume. See current activation status for passing tests; Production runtime deployment remains pending.

### Writer verification after operator correction (no data writes)

1. Parse the DSN locally with the same parser as `DocumentCache._connection`; never print DSN, exception text containing credential fragments, or connection parameters.
2. Compare writer and reader host/port/database privately; compare against Backend Question Bank configuration too. Host aliases or pooler endpoints require project/database identity checks rather than string equality alone. Never use the main database DSN.
3. Connect with a short timeout and immediately use a read-only transaction. Read database identity, schema/table presence, vector schema/dimensions, role default read-only state, and `has_schema_privilege`/`has_table_privilege` for required USAGE, SELECT, INSERT and UPDATE rights. Inspect row-security policies if enabled. Do not use INSERT/ROLLBACK as a supposedly read-only probe.
4. SELECT privileges do not prove a write can succeed through every trigger/RLS rule. Record this limitation; an actual write test belongs only in separately authorized staging. No migration, indexing, embedding sync, credit reservation or ledger mutation is part of verification.

### Staging execution plan (prepared, not executed)

Use an isolated staging PostgreSQL Question Bank with the same migration, a separate private Storage bucket/project, staging Backend/main database, and real Ollama. Do not point a staging writer at Production. Record model tag plus actual manifest digest from `/api/tags`, confirm the tag lookup works for configured model names, and verify 768 dimensions using real embeddings only during the authorized staging run. Verify no active tasks before any restart.

1. Writer verification, isolated Backend configuration checks and default-off AI guard tests are complete in source. Verify their deployed staging runtime equivalents. Confirm matching internal keys without printing them; test unauthenticated calls are rejected and disabled calls perform no DB or embedding work. Resolve the launcher allowlist mismatch before launch; do not change Production flags.
2. After separate staging execution authorization, enable Saved Documents only in staging Backend, AI Service and frontend. Upload a non-sensitive fixture corpus (PDF/DOCX/TXT), verify owner/course isolation, MIME/size limits, private object keys, ready counts and 768-dimensional stored vectors. This step creates staging documents, not Production documents.
3. Repeat the same corpus with 1, 3 and 5 selected documents, cold and warm Ollama, at least five runs each. Record per-stage timings, P50/P95, embedding HTTP calls/text counts, chunk counts, storage bytes, RAM and exact-search time. A repeat upload/selection must not embed stored chunks again. Require at least 80% faster preparation on cache hits and initial exact-search P95 below 500 ms for five documents.
4. Exercise failed extraction/embedding, concurrent identical uploads, failed reindex/retry, model-digest changes, stale/incomplete indexes, immutable pinned refs and soft delete. Review implementation against the single AI resource queue and upload-memory requirements before declaring readiness; planned behavior in earlier sections is not proof of implementation.
5. Run legacy sourceText, validation, duplicate checking and checkpoint regressions with real PostgreSQL/Ollama where applicable. No generation job or credit/ledger write is authorized by this plan. Any staging job/credit lifecycle test needs separate authorization and isolated staging accounts/database; retain existing unit-test evidence separately from live integration evidence.
6. Save redacted evidence and remaining failures. Production activation requires passing the gates, confirming effective runtime configuration, and explicit operator authorization. Roll back activation by disabling coordinated flags and preserving pinned indexes; do not run schema rollback or purge as a feature-toggle rollback.

### Post-correction read-only verification (2026-10-24)

Writer parsing passed after the operator correction. Two connection attempts failed before authentication with hostname resolution errors. Compare the Writer host against the exact connection endpoint from the same Supabase project dashboard; do not guess a hostname or change a password to resolve DNS. Project reference equality is a configuration comparison, not a successful live Writer identity check. Preserve server-only credentials and ensure TLS is required explicitly.

Reader SELECT audit confirmed USAGE on `public` and `extensions`, SELECT/INSERT/UPDATE ACL privileges on all three new tables, no enabled/forced RLS on these tables, `extensions.vector(768)` for chunk embeddings, and zero rows in each table. These ACL results apply to Reader only, not Writer. The audit transaction was read-only. `pg_stat_ssl` reported false for the database-side session despite client `sslmode=require`; with a pooler this can describe the pooler-to-database leg and does not by itself establish client TLS status. No data-writing probe was performed. Writer connection, actual database identity, role defaults, table privileges and trigger behavior remain pending.

### Verification after operator host update (2026-10-24)

The updated Writer DSN parses successfully, explicitly requires SSL, and contains no read-only connection option. Reader/Writer Supabase project references still match; host differs while port/database match. A fresh TLS-required Writer connection still fails at DNS resolution before authentication. No Writer permissions or live target have therefore been verified. Reader client-side TLS was positively verified using `connection.info.ssl_in_use=True`; its read-only SELECT audit again found all three cache tables empty and the expected Question Bank baseline. No service restart or database write occurred. The operator should recheck the exact Supabase endpoint and its DNS availability from this machine before further Writer verification.

## Guard implementation and latest preflight (2026-10-24)

Source changes: `main.py` adds the default-off flag and admission checks. `credits_runtime.py` adds an optional `can_resume` predicate to `resume_all`; default callers retain previous behavior, and the AI startup hook skips saved-document resumes while disabled. Existing in-flight work is not cancelled by a flag change. The flag is read at process startup; changing an env file does not hot-reload it. No Production registry was imported by the guard tests, no Production app startup hook was executed, and no credits/ledger writes were made. AI admission cannot undo a reservation already made upstream by a differently configured Backend: coordinated flags and idle deployment remain required.

Latest preflight: Docker Engine unavailable; Ollama `/api/tags`, FastAPI `/health`, Backend `/api/health`, and frontend local port 5173 unavailable. Thus qwen2.5:7b and nomic-embed-text presence could not be confirmed this run. No Ollama requests for embeddings/generation were issued. Production read-only audit found zero active/unknown credit-state rows and no RAG index rows. Backend flag resolved false in isolated Spring; neither `.env.storage` nor `ai-service/.env` contains an enabling saved-documents flag. Actual runtime Backend/Frontend/FastAPI flag values cannot be certified without running processes.

### Isolated staging preparation, not started

`docker-compose.saved-documents.staging.yml` defines a separate pgvector PostgreSQL 17 instance, loopback port 55441, database `examflow_rag_staging`, staging-only credentials and a dedicated volume. It has no init SQL, Production mount, application services or automatic migration. A dedicated staging password must be provided via `EXAMFLOW_RAG_STAGING_PASSWORD` outside source control. The compose file has not been launched or engine-validated because Docker Engine is unavailable.

Required prerequisites: start Docker Desktop Linux Engine and real Ollama, then verify qwen2.5:7b and nomic-embed-text manifests. Supply a separately prepared staging main database and Question Bank schema with migration 001 already present, plus a separate private Storage bucket/project and staging Backend/AI/frontend config. Under the current explicit no-migration/no-schema-change instruction, this run cannot provision the missing RAG schema in a fresh staging database. Do not point the staging writer or upload endpoints at Production to work around this limitation.

Once those prerequisites exist, execute the staging plan above and collect the real PDF upload/extraction result, ready row/chunk counts, embed-call and embedded-text deltas, cache-hit timing, owner/course denials, stale/reindex/soft-delete cases and legacy sourceText results. None of those live integration cases were run in this pass. No live preparation latency, retrieval P95 or real chunk-embedding count is reported; the only zero-embed evidence remains a passing unit test.

## Approved staging schema execution (2026-10-24)

Staging-only bootstrap and unchanged migration 001 were explicitly approved and
committed in the verified isolated container at 127.0.0.1:55441, database
examflow_rag_staging. pgvector 0.8.7, extensions.vector(768), six empty tables and
unchanged baseline schema/data fingerprint were verified. A subsequent constraints
catalog query failed; execution stopped without retry or schema repair. Constraints,
triggers and indexes acceptance remains incomplete. See staging/READINESS.md and
staging/schema-result.json. No app configuration, Production write, feature toggle,
job, credit/ledger change, restart or rollback occurred. Stop here pending operator
direction; application staging configuration remains a separately approved step.

## Staging schema verification completed — 2026-10-24

Staging schema is READY. PostgreSQL 17.11 catalog error 42725 was reproduced and
fixed only in the harness (explicit casts for internal char columns). Read-only
verification passed for 36 constraints (28 CHECK, 2 FK, 3 PK, 3 unique), 9 B-tree
indexes with correct predicates/order, 3 enabled triggers and 3 matching function
bodies. Both embeddings are extensions.vector(768) NOT NULL. All RAG and baseline
tables remain empty; baseline fingerprint is unchanged. No migration rerun or
schema/data write occurred. Earlier incomplete verification notes are historical.
See staging/READINESS.md and schema-result.json. Application staging configuration,
independent main DB/Storage and live integration remain pending separate approval.

## Integration environment preparation — 2026-10-25

Separate staging-only configuration/proposals are in `integration-staging/README.md`.
Question Bank schema remains READY and Ollama has both models, but main fixture and
private staging Storage remain missing. Static configuration validation passed;
actual Backend/AI runtime, upload and benchmarks are not yet tested. Operator approval
is required before new main schema creation/seed or private bucket creation. No
Production configuration, schema, data, flags, registry or services changed.

## Controlled direct reuse result — 2026-10-25

Operator uploaded one PDF: ready, 33/33 chunks and valid 768-dimensional vectors.
Operator selected that saved document again: unchanged index/chunks and zero new
chunk-embedding batches/texts. Jobs and credit/ledger fingerprints stayed unchanged
from the monitoring baseline. This limited saved-library reuse check passed; it is
not a repeated-upload cache-hit benchmark or official Production readiness approval.
See AI_SAVED_DOCUMENTS_CONTROLLED_TEST.md for scope and evidence.
