# Saved Documents staging — schema READY


## Current result — schema READY (2026-10-24)

Read-only verification completed successfully on PostgreSQL **17.11**, pgvector
**0.8.7**, in the same isolated staging container/database at 127.0.0.1:55441.
No migration was rerun and no database schema/data writes occurred during this
verification. The historical incomplete result below is superseded.

- Root cause reproduced: SQLSTATE **42725**, `operator is not unique: text || "char"`.
  `pg_constraint.contype` and `pg_trigger.tgenabled` use PostgreSQL internal `"char"`;
  concatenation needs explicit `::text`. This is a verifier query error, not a
  migration/schema defect or missing PostgreSQL catalog. The apply harness now
  casts these fields; a separate read-only verifier uses JSON catalog records.
- Index ordering is verified from `pg_index.indoption`. PostgreSQL's single-column
  `pg_get_indexdef(index_oid,column_no,true)` output omits DESC; expecting DESC in
  that output was an additional harness assumption, corrected without changing
  indexes. The library index has DESC/NULLS FIRST options as specified by SQL.
- `pg_constraint`, `pg_trigger`, `pg_index`, `pg_class`, `pg_namespace`, `pg_proc`,
  `pg_attribute`, `pg_extension`, `pg_language` and `pg_am` were inspected read-only.
- **36 validated constraints:** 28 CHECK definitions reviewed against migration
  (hash/length/range/status/ready/deleted/offset/vector checks), 3 primary keys,
  3 unique constraints and 2 foreign keys. No user/course cross-database FK.
- Index-to-document FK uses `(document_id, document_revision)` and DELETE RESTRICT;
  chunk-to-index FK uses `index_id` and DELETE CASCADE. Key column order matches.
- **9 valid/ready B-tree indexes**, including uniqueness, key order, DESC options
  and partial `deleted_at IS NULL` predicates. No HNSW/IVFFlat index exists.
- **3 enabled BEFORE ROW triggers**, with correct INSERT/UPDATE/DELETE event masks
  and function links. **3 plpgsql trigger functions**, with normalized bodies
  matching unchanged migration 001, SECURITY INVOKER and trigger return types.
- Both question and chunk embedding columns are **extensions.vector(768) NOT NULL**.
- Three RAG tables remain **0 rows**; all three baseline tables also remain empty.
- Current baseline pg_dump schema/data fingerprint equals both historical hashes:
  `7589f87bde7f2c1947e4f743978cfdd796f079022d34cccc17267ffbad0aa613`.
- Migration SHA-256 remains
  `788693c9744fe22a84a4a26ca91f170917a286229c1bfdb516dccaafc7e126ad`.
  Comparison uses the unchanged migration file identified as deployed to Production
  and the intended design; this run does not claim a live Production catalog diff.

Evidence: `schema-result.json`, `verification.status=READY`.
Command: `ai-service/.venv/Scripts/python.exe database/questionbank/staging/verify_schema_readonly.py`.
The verifier uses only the labeled staging container and explicit read-only SQL
transactions; pg_dump only reads baseline schema/data. It does not load any env/DSN.
The apply runner must not be rerun on this populated schema.

### Remaining integration prerequisites

Schema readiness alone does not certify application readiness. Separate operator
approval is still needed to configure Backend/AI/Storage staging. Provide a staging
main-database fixture and independent private Storage; explicitly isolate all
server datasource URLs, keys, app ports, registry/checkpoints and telemetry paths.
Default app configuration still points to Production and must not be reused.
Recheck real Ollama models at test time, then run upload/extraction/index/ready,
zero-chunk-embed cache hits, owner/course, stale/reindex/soft-delete and sourceText
integration with measured P50/P95. These integration tests have not run yet.
No Production flags or services were changed and no commit/push was performed.

Initial read-only check, 2026-10-24 (historical; current execution result below):

- Docker Engine responds. Exactly one container has the expected Compose project
  `examflow-saved-documents-staging` and service `questionbank` labels.
- Image `pgvector/pgvector:pg17`; port mapping `127.0.0.1:55441` to container 5432;
  dedicated project volume, no Production data mount. TCP reachable.
- Connected inside that container to `examflow_rag_staging`. The vector extension
  is not installed in this database; all three RAG tables and the Question Bank
  baseline tables are absent. The image includes pgvector but does not enable it.
- Ollama `/api/tags` responds; `qwen2.5:7b` and `nomic-embed-text` are present.
- Default Backend main/Question Bank datasource URLs and AI Service reader/writer
  DSNs still point to Supabase, not this staging endpoint. No separate staging env
  files were found. Do not launch the integration test with default app configs.

## Approved database procedure (historical plan; do not rerun)

1. Reinspect the container labels, loopback port binding, volume and database
   identity immediately before applying anything. Take a staging-only backup or
   record that the database remains empty. Use `docker exec` with the verified
   container ID; never derive this connection from Production env files.
2. Apply `000_baseline.proposed.sql` in that container. It refuses a database with
   another name or pre-existing public tables, enables `extensions.vector`, and
   creates only the minimal synthetic baseline required by migration 001. It
   inserts no rows and is not the complete ExamFlow application schema.
3. Apply the unchanged, previously tested
   `../migrations/001_ai_rag_documents.sql` to the same container/database using
   `psql -X -v ON_ERROR_STOP=1`. Do not use `apply_ai_rag_documents_once.py` with
   its default connection sources; those currently resolve Production configs.
4. Run read-only checks for all three RAG tables, constraints/triggers/indexes,
   `extensions.vector(768)`, zero row counts and unchanged baseline tables.
   Migration execution and bootstrap each have their own transaction; stop and
   inspect on any error rather than trying cleanup or rollback automatically.

Operator approval received covered only the staging Question Bank baseline bootstrap and
the existing migration 001. It does not cover Production migration/flags, credit
jobs, ledger changes, application main-database schema or a Production upload.

## App isolation before integration

Use separate staging-only process configuration. Explicitly override both Backend
datasources (main and Question Bank), AI reader/writer DSNs, private Storage URL/key
and bucket, internal key, registry/checkpoint/metrics paths, and HTTP ports. Do not
edit or reuse the Production `.env` files. Validate every effective endpoint and
fail closed on any Supabase Production project reference. A separate main database
fixture and Storage bucket/adapter are still needed for Backend upload and real
owner/course checks; the proposed Question Bank bootstrap does not supply them.

After that isolation is verified, enable Saved Documents only for staging and run
the upload/index/cache/reindex/auth/soft-delete/sourceText plan in the rollout doc.
No integration writes or embedding/generation requests were performed in this
readiness check. No P50/P95 or cache-hit embedding count has yet been measured live.

## Historical apply result — 2026-10-24 (verification subsequently completed)

The operator explicitly approved staging-only bootstrap and migration 001. The
runner revalidated the single running Compose container, image, project/service
labels, exclusive loopback port mapping, dedicated volume, database identity and
empty public schema before any writes. It never loads dotenv or any DSN and uses
only docker exec against the verified staging container.

- Reviewed baseline: only extensions schema/vector extension and three minimal
  empty baseline tables; no INSERT, no Production copy and no full main schema.
- Baseline transaction committed successfully.
- Exact migration 001 transaction committed successfully, unchanged SHA-256:
  `788693c9744fe22a84a4a26ca91f170917a286229c1bfdb516dccaafc7e126ad`.
- Extension: `extensions.vector`, version `0.8.7`.
- Chunk embedding type: `extensions.vector(768)`.
- Six expected public tables exist; every baseline/RAG table has zero rows.
- pg_dump schema/data fingerprint of questions, question_embeddings and
  question_embedding_queue is identical before and after migration 001:
  `7589f87bde7f2c1947e4f743978cfdd796f079022d34cccc17267ffbad0aa613`.
- **Verification incomplete:** the next catalog query collecting constraints
  returned a nonzero SQL command status. The runner suppresses raw stderr and
  recorded RuntimeError; no SQLSTATE was retained, so the exact query error has
  not yet been diagnosed. Trigger/index verification did not run afterward.
- Stopped immediately without retry, repair, rollback or further schema writes.
  Do not rerun the bootstrap/apply runner: its empty-schema guard will now refuse.

Evidence: `schema-result.json`. Runner: `apply_approved_staging.py`. No Production
DSN or connection was used, no application was restarted and no flags were enabled.

Next step requires operator direction: diagnose the verification query and finish
constraints/triggers/indexes checks read-only. Do not claim schema acceptance until
those checks pass. Backend/AI/Storage staging configuration remains unapproved and
unchanged; default application settings still target Production.

## Integration configuration prepared — 2026-10-25

`integration-staging/` now contains separate Backend properties, an AI environment
template, a proposed dedicated main PostgreSQL Compose service, proposed four-table
main fixture SQL, private bucket metadata and an execution/approval plan. Static
checks passed for loopback datasource isolation, disabled credits/worker, no implicit
schema initialization, disabled implicit dotenv loading and private bucket metadata.
These are templates/proposals, not verified running apps.

Read-only local preflight found only the existing staging Question Bank container;
main port 55442, AI 18002 and Backend 18080 are not listening. Both Ollama models are
present. No new schema or bucket has been created. A dedicated Supabase staging
project URL/key is still absent; the Production Storage configuration must not be
reused. Await approval for the proposed main schema/synthetic seed and private bucket
creation in an identified separate staging project before dependent integration.
No real upload/index/cache/auth/reindex/sourceText benchmark ran in this pass.
