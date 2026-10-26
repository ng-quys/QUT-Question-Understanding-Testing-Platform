# Saved Documents — controlled direct test, 2026-10-25

This is an explicitly authorized limited test on the current Question Bank and
private ai-source-documents bucket, not a general Production rollout acceptance.
The operator will upload exactly one non-sensitive PDF; the agent must not upload
or create a generation job. On error, stop and report; do not replay writes.

## Preflight and startup evidence

- No Backend/AI/frontend listener existed before startup; only Ollama was running.
  No pre-existing process was killed or restarted.
- Main database: zero reserved/running/cancel_requested/unknown jobs; zero pending
  monthly allocations before starting the unchanged Worker behavior.
- Question Bank: zero extracting/indexing indexes; all three RAG tables empty.
- Existing on-disk AI registry: two succeeded jobs, no queued/paused/running jobs.
- Writer TLS and SELECT/INSERT/UPDATE verified; bucket metadata HTTP 200, private,
  20 MiB. No Storage write was made by the agent.
- Actual Ollama model tags: qwen2.5:7b and nomic-embed-text:latest. The embedding
  config uses the exact installed tag so digest lookup can resolve it.
- 37 Python tests passed, including guard, legacy behavior and internal-key-protected
  metrics. No database mutation test was used against the current environment.

## Enabled configuration

- Root .env.storage: AI_SAVED_DOCUMENTS_ENABLED=true (existing secrets retained).
- ai-service/.env: AI_SAVED_DOCUMENTS_ENABLED=true and exact embedding tag.
- frontend/.env.local: VITE_AI_SAVED_DOCUMENTS_ENABLED=true.
- Ignored .env.saved-documents-controlled-test contains the private runtime config,
  hidden process wrappers, PID records, logs and read-only monitoring snapshots.
  No previously configured active internal key was found; a new shared local key
  was generated privately for Backend/AI, never printed or passed in command lines.
- Backend listener 8080: flag true; Worker enabled=true and clusterReady=true,
  preserving the prior local launcher settings. No Worker/coordination code change.
- AI listener 8002: health savedDocumentsEnabled=true, zero active/waiting queue;
  Backend internal-key handshake HTTP 204.
- Frontend listener 5173: actual served Vite module contains the true feature flag.
- Browser opened at http://127.0.0.1:5173/ and showed login. Authenticated library
  UI visibility remains pending operator login; it has not yet been visually proven.

## Monitoring

GET /documents/metrics requires the existing internal key and only returns process
counters. No credential or document text is returned. Counters distinguish cache
hits and chunk-embedding batch starts/completions/texts requested. They reset on
process restart. Query embeddings are not counted as chunk embeddings.

scripts/monitor-saved-documents-controlled.py performs SELECTs inside read-only
transactions and GETs metrics. Baseline has zero document/chunk embedding counts
and no documents. It also fingerprints credit accounts/months/transactions and
records job-state counts, to compare during upload/reselection. This baseline was
taken after startup; it does not independently prove pre-start ledger equality.

Pending operator action: log in as teacher, select a course, upload one PDF without
clicking generate. Observe status/expected vs actual chunks, vector dimensions and
ready_at. Stop on any failure; no automatic retry. After ready, record metrics,
ask operator to choose the saved document again, and compare deltas: zero new chunk
embedding batches/texts and unchanged stored chunks. Selecting the library entry
alone may not call reindex, so cacheHits need not increment for UI selection reuse.
No live upload/ready/cache-hit outcome is claimed until observed.

## Boundaries and next steps

No migration/schema change, deletion, credit/ledger adjustment or generation job
was executed. No commit/push. Existing historical data is retained. Do not call
start-examflow.ps1 blindly: this test has dedicated wrappers and existing Worker
settings must be preserved. Disable/revert flags only at an explicitly coordinated
idle boundary, preserving registry and any uploaded indexes. Staging infrastructure
is left unchanged. Production-wide readiness and performance acceptance remain open.

## Operator PDF upload observed — 2026-10-25

Read-only snapshot after the operator reported upload: exactly one active document,
one ready index, ready_at set, expected chunks=33, actual chunks=33, no invalid/null
768-dimensional vectors, no error code. Process counters show one chunk embedding
batch started/completed and 33 texts requested. Credit/ledger fingerprints and
job-state counts match the post-start monitoring baseline. No generation job was
created by this test. Snapshot preserved privately as before-reselection.json.
Saved-library reselection and its zero-new-embedding delta remain pending.

## Operator saved-library reselection verified — 2026-10-25

Compared the read-only after-selection snapshot to before-reselection.json. The
same document/index remains ready with 33 expected/actual chunks; vector checks
remain valid. Chunk embedding batch-start delta=0, completed-batch delta=0, and
embedded-text-request delta=0. Cumulative counters remain one batch and 33 texts.
Credit/ledger fingerprints and job-state counts remain unchanged from baseline.
The operator's saved-library reuse case passes without re-embedding stored chunks.

The cacheHits counter remains 0 because choosing an existing ready library entry
does not call the indexing cache lookup. This proves zero additional chunk-embedding
attempts for saved selection, not the separate repeated-upload SHA cache-hit path.
No repeat upload, reindex, generation, stale/delete or broader benchmark was run.
Flags remain enabled for the authorized controlled test; official rollout acceptance
is still not established. Private evidence: reselection-result.json.
