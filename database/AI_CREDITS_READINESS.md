# AI Credits readiness — 2026-10-17

Decision: NOT ready for activation. `AI_CREDITS_ENABLED=false` remains unchanged.
No migration, seed, schema change or Production-writing test was performed in
this readiness step. No Question Bank connection was made. No commit/push.

## Database and backend

Read-only connection was pinned to the main Supabase project
`kbplrzkjnyphsbdmscgq`, host
`aws-0-ap-northeast-1.pooler.supabase.com:5432`, database `postgres`, schema
`public`. Metadata queries ran inside BEGIN READ ONLY and ended with ROLLBACK.

The three credit tables and 20 request columns match the service SQL types
(bigint IDs, integer request counts, UUID keys/tokens, JSONB payload/results,
DATE month and timestamptz credit timestamps). Referenced users/course/CLO/
chapter membership columns also exist. All 24 inspected credit constraints are
validated. Credit tables still have zero rows; the three legacy requests remain
completed with credit_state=legacy and zero charge.

AiCreditsService explicitly uses the primary `dataSource` and a transaction
manager for that same datasource. Reservation, settlement and grant balance
updates share a transaction with job and ledger writes. Account locking
serializes a teacher's requests; month and job locks follow account locking.
Unique database indexes additionally enforce active-teacher, request-key,
operation-key and reserve/finalization uniqueness. Settlement uses the job's
original month and returns unused monthly/extra reservation. Unknown jobs retain
reservation pending provider status or explicit Admin reconciliation. The schema
does not alone guarantee ledger-to-balance equality.

## Endpoint review (code/unit tests, not live JWT HTTP integration)

| Endpoint under /api | Review |
| --- | --- |
| GET /teacher/ai-credits | JWT teacher/Admin route plus local role check; can initialize account/month/ledger when enabled |
| POST /teacher/ai-credits/jobs | UUID request key, payload hash, document proof, owned course and matrix checks; limit 45 |
| GET /teacher/ai-credits/jobs/{id} | Owner checked; questions exposed after terminal settlement |
| POST /teacher/ai-credits/jobs/{id}/cancel | Owner checked; reserved job releases, running job waits for upstream |
| POST /teacher/ai-credits/extract | Authenticated upload; signed source proof; requires configured internal secret |
| GET /admin/ai-credits | Existing realm ADMIN security plus AdminIdentityService; can initialize quota |
| POST /admin/ai-credits/{user}/grants | Admin only; amount/reason/key checks; replay compares actor/target/amount/reason |
| GET /admin/ai-credits/{user}/history | Admin only, paginated ledger |
| POST /admin/ai-credits/jobs/{id}/reconcile | Admin only, unknown state and stopped-job attestation; refuses a known running provider |

No live authenticated API calls were made: identity synchronization and quota
GETs may write. Full JWT filter-chain behavior and actual PostgreSQL contention,
constraint failure rollback and restart recovery still require integration tests.

## AI runtime blockers

- Inspected BE and AI Service configuration/environment do not provide a valid
  shared AI_INTERNAL_KEY (minimum 32 characters). Secret values were not logged.
- GET configured FastAPI /health (default 127.0.0.1:8002) was refused, WinError
  10061. GET configured Ollama /api/tags (default 127.0.0.1:11434) was also refused.
  Neither Qwen availability nor installed embedding model could be verified.
- Model selection remains qwen2.5:7b and nomic-embed-text by default; unchanged.
- The provider job registry is process-local. Deployment must explicitly use
  one FastAPI worker, one replica, without reload/load balancing across workers.
  WEB_CONCURRENCY/UVICORN_WORKERS were unset; no running worker configuration was
  established. A restart loses registry state and requires controlled unknown
  job reconciliation; never automatically release and replay a possibly live call.
- No model generation or embedding request was sent. Algorithm/prompt/RAG code
  was not changed in this step.

## Frontend and tests

Sidebar/Generator use the quota API (no fake balance). Limit comes from
maxPerRequest=45, and availability/active-job checks block launching. Job polling
uses the same key on retry; final charge comes from BE. Refresh resumes active
jobs through quota. These are source review and mock tests, not browser E2E.

- Fixed exactly six import paths in frontend/src/features/app/App.tsx, including
  ThemeProvider's actual location; no route/component behavior changed.
- `npm run build`: PASS (TypeScript and Vite); existing >500 kB chunk warning.
- BE compile and test-compile: PASS using cached Maven 3.9.16 offline.
- BE AI Credits unit tests: 19 PASS (9 rules/role/proof + 10 transaction/retry/job).
  Real TransactionTemplate, mocked DataSource/Connection/JdbcTemplate: partial
  7/10 charges 5 monthly + 2 extra, full failure release, ledger error rollback,
  terminal/stale-token no charge, monotonic checkpoints, same-key replay,
  mismatched-key payload 409, grant replay, job ownership and single claim.
- AI Service unittest: 7 PASS; external I/O mocked, generation sizes 1/10/30/45,
  rejection of 46, partial generation, cancel, duplicate token and internal guard.
- FE Node mock test: PASS (same request key, partial charge, cancel, resume).
- Maven Wrapper still fails with PowerShell NullArray. Used already cached Maven
  explicitly with local repository and Surefire 3.5.5; did not change pom/wrapper.
- SpringBootTest intentionally excluded; it can connect to real datasources.

## Before final activation approval

Provision the same secret securely for BE/AI Service; establish one worker and
verify FastAPI health plus Ollama Qwen/embedding tags. Validate authenticated HTTP
behavior and real PostgreSQL concurrency/recovery separately. Keep the flag false
until those checks and final user confirmation.

If a controlled Production transaction test is chosen, obtain separate approval
for named existing teacher/Admin/course IDs and exact requests first. It would
create a credit account if missing, a monthly row and allocation ledger; each
generation creates one ai_generation_requests job plus reserve/finalization
ledger entries and changes balances by accepted questions. A grant creates an
admin_grant ledger entry and persistent extra balance. Question content remains
in the job result unless explicitly saved; no question-bank save is proposed.
No automatic cleanup/delete or artificial clock/month reset is proposed.
Enabling the normal worker also allocates accounts/months/allocation ledgers for
ALL active teachers, not only the selected test user; approval must account for
that effect. This plan has not been executed.

Files changed this step: frontend/src/features/app/App.tsx;
backend/src/test/java/com/examflow/backend/AiCreditsSettlementTest.java;
database/check_ai_credits_readiness.py; database/AI_CREDITS_READINESS.md.
