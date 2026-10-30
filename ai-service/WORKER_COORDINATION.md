# AI Generator worker coordination — 22 October 2026

Implemented, tested and loaded locally. Latest update at 01:57 on 22 October:
legacy polling is no longer observed, primary is enabled, and the system is
ready for the user's one-question UI test. The earlier blocked state below is
retained as deployment history; the final activation section supersedes it.

## Current deployed state

- Backend PID 28304, port 8080, health 200; internal-key verification 204.
- FastAPI PID 9348, port 8002, health 200, one worker, no reload.
  Registry ID ac285c5e-ca18-4650-8bcd-29ed3ea9a9a0.
- Both real database endpoints connect. Main JDBC identifies itself as
  `ExamFlow-Main/ai-worker-v1`; no credentials were printed or changed.
- Ollama GET /api/tags 200: qwen2.5:7b and nomic-embed-text:latest present.
  This deployment check did not issue another Qwen inference or Production job.
- Question Bank: 149 questions, missing embeddings 0. No question was inserted.
- Job #8 remains succeeded, accepted 1, charged 1, one retained job result.
  Ledger #21 reserve and #22 settle remain the only entries. Account used 2,
  reserved 0, remaining 198. No repeat reconciliation was needed or performed.
- Local worker enabled=false and cluster-ready=false. New generation requests
  are rejected BEFORE calling the existing reservation transaction. Login,
  quota/result reads and explicit authorized Admin reconciliation remain usable.

Evidence: tmp/ai-coordination-deployment.json and logs under
.env.examflow.runtime/logs/{Backend,AI}-coordinated-20261022-013949.log.
All deployment safety checks found no active AI execution, live exam session,
live exam attempt or busy JDBC transaction before stopping either local service.
FastAPI was restarted only AFTER #8's result was stored/settled in Backend.
It therefore no longer retains #8 in its new in-memory registry; the accepted
Backend result remains available. No service with active generation was stopped.

## Coordination and fencing

AiWorkerCoordinator acquires a per-job PostgreSQL session advisory lock on the
MAIN datasource. Different JVMs contend for the same lock. A physical JDBC
connection remains bound to that operation; ordinary credit transactions use
that same connection. No JVM static or synchronized flag implements the lock.
ThreadLocal only tracks the capability scope; requireAuthority also checks
pg_locks for the current physical backend PID inside the mutation transaction.

Claim commits BEFORE upstream POST start, while the session lock remains held.
A later exception/disconnect cannot roll that committed claim back to reserved
and cause another automatic POST. The replacement Backend polls the same token.
Unlock happens in finally; a session with uncertain unlock is aborted rather
than returned to Hikari with a lock still held. Session-mode PostgreSQL is
required; the known Supabase transaction-pool port 6543 is rejected. Production
uses its existing session endpoint; no datasource credential/URL was changed.

At the first reserved claim, a trusted server-only _executionRegistry field is
stored in the existing JSON credit_payload. No column/table/migration is added.
It is stripped before decoding the generation DTO and never sent to the model
or trusted from a client request. An already dispatched unbound legacy job is
not silently adopted. No active legacy jobs existed at this deployment.

FastAPI exposes its random per-process registry ID in /health. Start/status/
cancel carry X-AI-Registry-Id; a wrong identity returns 409 before token lookup.
A Backend whose registry does not match the job binding skips it. A registry
change during transport does not authorize unknown/checkpoint/settlement.
Backend restart with the SAME upstream registry resumes GET polling. FastAPI
restart with lost registry does not recreate the execution; the job is held for
explicit investigation/recovery, never automatically replayed or refunded.

Claim, checkpoint and unknown check worker authority; finishOwned does likewise.
Accounting formulas, balance split, final ledger key, transactional settlement,
Admin authorization and existing idempotency remain unchanged. OpenAI futures
retain completed results until an authorized poller can persist them; completion
does not race a callback against the coordinator lock or discard its result.

## Legacy Backend limitation and maintenance guard

Advisory locks are cooperative. An older binary that still writes directly
cannot be fenced by a lock it does not acquire. Main schema/DB permissions were
not changed, and no unowned process/session was terminated.

After local polling was disabled, six read-only DB snapshots still observed
PostgreSQL JDBC Driver session 2255756 updating its global queue query about
every three seconds. This is a PostgreSQL SESSION PID, not a Windows PID.
Supabase exposes the pooler address, not the originating machine. Earlier
session numbers rotated as its pool reused connections. It is not possible to
identify or stop that external host from this process inventory alone.

The new cluster-ready flag defaults to false. The create endpoint calls
requireReady BEFORE credits.create, so maintenance does not reserve credits.
Authenticated GET /api/teacher/ai-credits/readiness explains the blocked state.
Even after operator confirmation sets cluster-ready=true, observed global queue
polls with an old application label block readiness. That observation is an
additional check, not proof that every old binary has been upgraded: idle or
temporarily disconnected old clients may reconnect. Operator confirmation is
still required. No Production generation was used to test this guard.

## Practical rollout to the other Backend

1. Identify the operator running the shared DB configuration (another developer
   machine, terminal, service or deployment). Collect the actual JVM/PID, port,
   start time and logs. Do not kill PostgreSQL PID 2255756 or unrelated processes.
2. Drain its API traffic and let its in-flight requests/background jobs finish.
   Check each running/unknown execution via its original upstream before any
   shutdown. This local deployment's idle snapshot is not permission to stop
   another host's unrelated tasks.
3. Upgrade that Backend to this coordinated version and restart only its BE
   with AI_CREDITS_WORKER_ENABLED=false. Existing old binaries ignore this new
   variable, so merely changing their environment without upgrading/restarting
   does NOT disable their poller. Do not restart their FastAPI during generation.
4. If upgrade is temporarily impossible, its operator can stop that BE after
   draining it, or use its existing AI_CREDITS_ENABLED=false setting with a
   controlled restart. The latter leaves unrelated APIs available but disables
   that host's AI Credits APIs, so it is an explicit temporary outage for those
   endpoints, not a transparent hot-toggle. Neither action was taken remotely.
5. Verify startup settings and that old polling has ceased. Check ALL other
   participating operators, not just one observed pool session.
6. For the demo, set cluster-ready=true on the participating upgraded API
   instances; enable the worker only on the designated primary. Secondary BE:
   worker enabled=false, cluster-ready=true. Primary BE: both true. Use the same
   stable FastAPI endpoint with one registry; do not route executions randomly
   across independent in-memory registries.
7. Controlled-restart the local BE with those flags after another idle check;
   keep FastAPI running so its current execution registry is preserved. Read
   readiness=true and confirm no legacy queue scans before enabling the UI test.

The settings are AI_CREDITS_WORKER_ENABLED and
AI_CREDITS_WORKER_CLUSTER_READY (or ai.credits.worker.enabled and
ai.credits.worker.cluster-ready). The example environment documents both.
No password rotation, privilege changes, SQL balance edits or forced connection
termination is a substitute for this controlled rollout.

## Tests completed

- Backend: 65 discovered, 64 passed, one opt-in live upload test skipped.
  Includes six real PostgreSQL integration tests, 17 transport tests, 18
  settlement tests, 11 credit-rule tests, three coordination guard tests,
  and 10 extraction tests (one skipped).
- AI Service: 39 passed across runtime/registry, CLO generation, embedding sync
  and extraction contracts. Model calls are mocked in these tests.
- The PostgreSQL suite ran separate worker JVMs, actual JDBC transactions,
  advisory locks, result validation, final ledger and quota updates against a
  dedicated loopback fixture DB. It checked one POST/one settlement under two
  workers, replacement after killing ONLY an owned fixture JVM, wrong registry
  with zero job mutation, lost DB-session fencing, old-client readiness blocking,
  and Hikari retaining its session across commits/returning it unlocked.
- Lost-session tests intentionally emit a PostgreSQL FATAL/rollback stacktrace
  for the terminated TEST session; the suite passes and no Production session
  was killed.
- These are worker-stack JVM tests, not two full web-server deployments or a
  real model generation through the ExamFlow UI. That final user-operated test
  remains pending the legacy rollout.
- Compile and targeted git diff --check passed. No commit/push.

Reproduce the integration test only with the disposable PostgreSQL fixture at
jdbc:postgresql://127.0.0.1:55439/examflow_worker_test and role
examflow_test_owner. The fixture harness rejects any other URL. Its DDL never
targets Production. Set AI_COORDINATION_FIXTURE=true, then run Maven with
-Dtest=AiWorkerPostgresTest test. Without this opt-in it skips the live fixture.
The portable runtime came from the official
[EDB binary distribution](https://www.enterprisedb.com/download-postgresql-binaries),
extracted only under the ignored .env.examflow.runtime/tests-postgres directory;
no system installation/service was added. The fixture server is stopped after
testing; its data and logs are retained for reproduction.

## Pending one-question UI test

Once the rollout conditions above pass, verify lecturer 8000000004 still has
credits and no unresolved job/reservation. Record the maximum current job ID as
the baseline; do not reuse the old observer's job #8 anchor. Ask the user to
upload the prepared short OS document, choose course 0101101973 and knowledge
CLO1.1*, count 1. The user presses Generate once; the observer never POSTs a job.
Monitor only that new job, its pinned registry, BE/FastAPI logs and ledger.
Require succeeded/one accepted result visible for review, exactly one reserve
and one one-credit settle, no held reservation and no automatic Question Bank
insertion. If the job fails/turns unknown, stop; no replacement or Admin write
without the applicable approval.

## Files in this change

Production: AiWorkerCoordinator.java (new), AiCreditsWorker.java,
AiCreditsProvider.java, AiCreditsService.java, AiCreditsController.java,
MainDataSourceConfig.java, ai-service/credits_runtime.py, ai-service/main.py,
examflow.local.example.json. Existing unrelated changes in these files were
preserved; no accounting formula/prompt/RAG/exam/Anti-Cheating code was changed.

Tests: AiWorkerFixtureProcess.java, AiWorkerPostgresTest.java,
AiWorkerCoordinationGuardTest.java (new), transport/settlement/rule/extraction
tests updated for injection and guards, test_credits_runtime.py updated for
registry identity. Operational report: this file. Temporary deployment,
verification and fixture helpers/evidence are in tmp and ignored runtime paths.

## Primary activation after legacy shutdown — 22 October, 01:57

The operator asked the Anti-Cheating teammate to stop the old Backend. Sixteen
read-only samples over approximately 48 seconds (01:51:34–01:52:22) showed no
legacy polling rows. Immediate checks before restart and twelve samples after
restart also found none. No unowned process or DB session was terminated.

- Controlled restart of local BE only: PID 28304 -> 9104. Startup log confirms
  enabled=true and clusterReady=true. Both non-secret flags were persisted in
  the ignored local launcher config .env.examflow.local.json. No key changed.
- Preflight: no active AI execution, live exam attempt/session, or busy JDBC
  transaction. FastAPI PID 9348 and registry ID are unchanged; no AI restart.
- The new protocol-labeled primary's global polling query advanced repeatedly.
  No old-label worker polling appeared before or after enabling.
- A two-session advisory-lock smoke on the existing main session endpoint
  passed: first acquired, second denied, first released, second acquired.
  Connections were read-only; a separate negative lock key was used, never a
  job ID. Both locks/connections were released. No DML, schema change or
  Production generation was used to verify the locking primitive.
- Backend/FastAPI/Ollama health 200; internal-key handshake 204. Both required
  model tags exist. Question Bank 149 questions, missing embeddings 0.
- Job #8 still succeeded, accepted/charged 1, one persisted result; exactly
  reserve #21 plus settle #22. Account used 2, reserved 0, remaining 198.
- Final verification at 01:57:43 found no active job and six further empty
  legacy-polling samples. production_test_ready=true. Existing coordination
  guards still reject observed legacy polling if it returns.

Evidence: tmp/legacy-worker-stop-check.json, tmp/primary-worker-activation.json,
tmp/ai-coordination-deployment.json; current BE log:
.env.examflow.runtime/logs/Backend-primary-20261022-015433.log.

User test: lecturer 8000000004, course 0101101973, CLO1.1*, count 1, short sample
document tmp/approved-ui-test/ai-generator-one-question-sample.docx. The observer
tmp/watch-next-primary-ui-job.py records a fresh maximum-job-ID baseline and
uses SELECT/GET plus log reads only. It never starts/reconciles a job. The user
must operate the Generate button. Normal end-to-end success is not claimed
until that user-created job has completed and its result/ledger are verified.
