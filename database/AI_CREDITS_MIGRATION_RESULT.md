# AI Credits migration — 2026-10-17

User explicitly approved main migration without backup. Applied only the approved
`006_ai_credits_main_guard.patch`, then executed `migrations/006_ai_credits.sql`
exactly once. Execution returned success after COMMIT. No retry.

## Verified target

- Supabase project: `kbplrzkjnyphsbdmscgq`
- Host: `aws-0-ap-northeast-1.pooler.supabase.com:5432`
- Connection user: `postgres.kbplrzkjnyphsbdmscgq`
- Database/schema: `postgres` / `public`
- Server current_user through pooler: `postgres`
- Question Bank datasource was not connected.

Executed SQL file SHA-256:
`d06f5a0b0255ad79047e27654370badf49818340bc37cd6043e9b5d8e1e65422`

## SELECT verification after COMMIT

- Created `ai_credit_accounts`, `ai_credit_months`, `ai_credit_transactions`;
  each has zero rows. No seed or account allocation was performed.
- All 20 approved columns exist on `ai_generation_requests`, with the expected
  types, nullability and defaults.
- All 24 inspected constraints on the credit tables and new request constraints
  report `convalidated=true`.
- Unique indexes exist for operation_key, monthly allocation, job reservation,
  job finalization, request idempotency and one active request per teacher.
- Three original requests remain. Client-side comparison of every original
  column before/after was equal. They remain completed, 20 requested questions
  each, with neutral credit metadata (`credit_state=legacy`, zero charge).
- No UPDATE/INSERT/DELETE/seed was executed. After migration, only SELECT was used.

## Activation and limitations

`AI_CREDITS_ENABLED` resolves to `false` in inspected configuration/environment.
No application process was started or restarted; no deployment environment was
changed. Quota has not been activated. No Production-writing tests, commit or push.

The schema alone does not enforce balance/ledger reconciliation or role checks;
those require the application transactions and authorization. Runtime quota,
concurrency, recovery and provider integration were not exercised on Production.
New RESTRICT foreign keys prevent hard deletion of referenced users, administrator
actors or requests, and may block a course deletion cascading through requests
once managed credit history exists. No backup was made, as explicitly requested.

Local files changed in this step: approved SQL guard patch applied to migration;
added `apply_ai_credits_main_once.py` execution helper and this result record.
The helper refuses execution when credit tables/columns already exist; do not rerun.
