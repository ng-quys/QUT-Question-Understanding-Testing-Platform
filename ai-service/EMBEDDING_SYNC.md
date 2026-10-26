# Pool and embedding readiness — 2026-10-21

## Read-only findings

- Main database session endpoint rejects new clients with `EMAXCONNSESSION`,
  limit 15. A diagnostic-only connection to its transaction endpoint succeeded;
  the Backend JDBC URL was not changed.
- PostgreSQL `max_connections` is 60. The session pool, rather than that physical
  limit, is the observed bottleneck: 15 JDBC backends were idle, with no idle-in-
  transaction sessions. One older idle session was also observed; idle alone
  does not prove a leak or justify terminating a session.
- Only one ExamFlow Backend JVM was found locally. It held 5 main-DB sockets at
  the first snapshot and 6 at a later snapshot, plus 2 Question Bank sockets.
  The remaining JDBC sessions cannot be attributed to this host from the
  available evidence. No other client's sessions were terminated.
- Main datasource had no explicit pool bounds in code/config, environment,
  command-line arguments or `SPRING_APPLICATION_JSON`. Hikari defaults can retain
  idle slots. Defaults now limit main to 5 and Question Bank to 3, minimum idle
  0, idle timeout 60 seconds, lifetime 10 minutes, acquisition timeout 10 seconds.
  JDBC application names distinguish the pools. Existing property overrides
  still bind. **A controlled Backend restart is needed to apply these defaults.**
- Question Bank was available. Its table is `public.question_embeddings` with
  `extensions.vector(768)`. Of 149 questions, 117 have `nomic-embed-text` vectors,
  all 768-dimensional; 32 are missing and all 32 are queued and due, with zero
  previous failures, blank contents, orphaned queue rows or missing queue entries.
- Job #7 remains `failed`, accepted/charged 0, reservation 0, remaining credits
  199. Its ledger contains exactly one release. No credit/ledger write was made
  during this readiness inspection.

Supabase distinguishes session pool size from PostgreSQL max connections:
[session pool limits](https://supabase.com/docs/guides/database/prisma/prisma-troubleshooting),
[connection management](https://supabase.com/docs/guides/database/connection-management).

## Dry-run (safe default)

From the repository root:

```powershell
.\ai-service\.venv\Scripts\python.exe .\ai-service\tools\sync_question_embeddings.py --dry-run --batch-size 5
```

Omitting `--dry-run` still previews only. The connection is explicitly read-only;
the preview uses SELECTs without queue locks, model requests, retries or DML.
It reports totals, incompatible vectors, missing queue entries and the next IDs.
The inspected first batch was IDs 121–125. Re-run preview to see current data.

## Apply only after separate approval

The AI reader's `EXAMFLOW_QUESTIONBANK_DSN` remains read-only. Do not remove its
read-only option or give the running AI reader a writer connection.

Configure `EXAMFLOW_EMBEDDING_SYNC_DSN` only in the approved sync terminal. It must
identify the same Question Bank host/port/database/user as the reader and permit
the existing embedding/queue operations. Never log or commit the DSN/password.
The script rejects a read-only writer and never changes a connection's
read-only mode to force a write.

After approval, this command processes **at most five** queued items:

```powershell
.\ai-service\.venv\Scripts\python.exe .\ai-service\tools\sync_question_embeddings.py --apply --once --batch-size 5
```

Each item locks only its queue row (`FOR UPDATE ... SKIP LOCKED`), generates a
finite nonzero 768-dimensional vector, upserts by the existing unique question
ID, and removes the queue item in the same transaction. No questions or old
embedding rows are deleted. An orphaned queue item may be removed without
touching an embedding. On failure, a savepoint preserves the queue lock while
recording bounded retry backoff. On interruption, uncommitted work rolls back;
committed items are no longer queued. Connections close after every batch,
including failures and interruption. Reports count created/updated/skipped/errors.

Default batch size is 5; allowed range 1–20. One batch is the default even with
`--apply`; `--watch --apply` explicitly opts into continuous processing with
`--interval`. Do not use watch mode for a count-limited approval.

After each approved batch, run dry-run again. Stop on errors or if the queue
scope differs from the approved work. No enqueue, backfill or schema migration
is performed automatically.

## Before a real UI generation test

1. Approve a controlled Backend restart; first check for active work, then
   verify the new named pools release idle sessions. Investigate ownership of
   remaining sessions if capacity is still exhausted; do not kill them blindly.
2. Separately approve embedding writes. Process the queued items in small
   batches and verify coverage, dimensions, model and the real duplicate checker.
3. Separately approve **one new ExamFlow question-generation job**. Use the
   logged-in lecturer's real document and CLO, count 1, and the normal UI flow.
   Verify start/status, exactly one reservation, terminal result, validation,
   settlement/release and quota through normal APIs. Do not save the generated
   question to the Question Bank unless that additional write is approved.
4. If the new job becomes unknown, stop testing and inspect its original token;
   never create a replacement job or manually edit credits/ledger.

No Backend restart, embedding application or real UI generation job was run
as part of this preparation. No schema, migration, exam or Anti-Cheating change
is included.

## Validation performed

- Live dry-run: 32 missing/due, 0 incompatible/unqueued/blank/orphaned; no writes.
- Real Ollama `nomic-embed-text` sample: HTTP 200, 768 finite nonzero values;
  nothing persisted to the database.
- Python: 34 tests passed (11 sync tests plus 23 existing AI tests). Includes
  read-only default/no model calls, batch bounds, lock/upsert/dequeue atomicity,
  retry savepoint, interruption/resume safety, wrong writer target, refusal to
  override read-only connections, and invalid vector rejection.
- Backend: 48 passed, 2 skipped across the existing AI rules, settlement,
  transport/HTTP contract, extraction and matrix compatibility suites. Pool
  changes compile, but live pool behavior still requires the controlled restart.

Files changed in this preparation: `MainDataSourceConfig.java`,
`QuestionBankDataSourceConfig.java`, `tools/sync_question_embeddings.py`,
`test_embedding_sync.py`, and this document. The prior AI Generator fixes and
local reader configuration were preserved.

## Approved deployment update — 2026-10-22

The execution below supersedes the earlier preparation-only status.

- Restart preflight found no running AI jobs, active exam attempts/sessions or
  busy JDBC transaction. One initial guard deferred stopping while a short JDBC
  query was active; the Backend was stopped only after an idle check passed.
- Backend PID 25112 was replaced by PID 32116 using its existing JVM command,
  classpath, working directory and environment. Health/login/current principal
  returned 200; the internal-key handshake returned 204. Both original session
  database endpoints accepted connections. `ExamFlow-Main` identifies the new
  pool. Other clients' JDBC sessions were not terminated.
- Exactly the 32 approved missing IDs (121–152) were processed in batches
  5/5/5/5/5/5/2: created 32, updated 0, skipped 0, errors 0. The invocation used
  `--missing-only` and a fixed `--question-ids` allowlist. In this mode conflicts
  do nothing, preserving existing embeddings and queue work. The batch stops
  immediately on its first error. No reader credentials/settings were changed.
- All 149 questions now have `nomic-embed-text` embeddings, dimensions 768;
  missing 0, queue 0. Existing question rows and the prior embeddings passed
  snapshot gates. No question/answer/CLO content was edited.
- The first diagnostic probe selected legacy question 121, whose content has
  one character. The checker correctly rejected this probe with HTTP 422
  (`content` minimum 3). This was a diagnostic sample-selection error, not an
  embedding batch failure. A read-only probe of newly embedded question 122
  returned 200 and detected the existing question as a duplicate. The short
  legacy source was preserved.
- Lecturer `8000000004` was verified active with 199 credits and no unresolved
  job. A local OS-concepts DOCX fixture is ready for course 0101101973/CLO1.1*.
- Browser automation remained disabled. The user chose manual UI submission
  while the observer used read-only checks. Exactly one job, #8, was submitted
  by lecturer 8000000004 for one question. No replacement job was created.
- Stage C did not pass: Backend job #8 is `unknown`, accepted 0, charged 0,
  with one monthly credit reserved. Its ledger contains only the reservation;
  no settlement/release was performed. Account used 1 includes an earlier job;
  reserved 1, remaining 198.
- FastAPI GET for the original token returned HTTP 200, `succeeded`, one
  question. CLO/Bloom/structure/source evidence validation passed; the real
  duplicate checker returned 200 with suspectedDuplicate=false. This verifies
  machine validation, not pedagogical quality: the candidate repeats a CLO
  attitude statement. Backend has not accepted or charged this candidate.
- Database activity confirms two distinct clients repeatedly polling the
  global credit-worker queue, one identified as ExamFlow-Main and another as
  PostgreSQL JDBC Driver. Only the first could be attributed to a local Java
  process. Workers share job rows but use process-local upstream execution
  registries. A worker receiving a missing-registry response can mark another
  worker's running job unknown. The second worker's logs are unavailable, so
  the actual writer of job #8's unknown state is not established.
- Testing stopped. No job #8 reconciliation, credit edits, session termination,
  migration or schema change was performed. Identify the other worker and
  obtain its logs before attributing the incident; any reconciliation of #8
  requires separate approval and must handle its existing upstream result.

Execution evidence: `tmp/approved-ai-stage-a.json`,
`tmp/approved-ai-stage-b.json`, `tmp/approved-ai-job8-evidence.json`, and
`tmp/approved-ai-shared-worker-evidence.json`. The missing-only/fail-fast safeguards passed
13 mocked sync tests before any approved embedding write was performed.

Backend `AiJobTransportTest`: 12 passed, 0 failures/errors/skips, including a
pure-mock reproduction of a second worker marking an owner's running job
unknown after a missing-registry response. The initial compiler invocation
failed while accessing an AssertJ JAR; the diagnostic rerun completed with
BUILD SUCCESS. No production request was issued by these tests.
