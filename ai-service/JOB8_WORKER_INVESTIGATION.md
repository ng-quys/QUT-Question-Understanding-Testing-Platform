# Job #8 investigation — 22 October 2026

Latest status: the user approved acceptance for one credit and manually invoked
Admin reconciliation on 22 October at 01:06. Read-only verification confirms
job #8 succeeded, accepted/charged 1, quota reservation 0, and exactly one settle.
The earlier investigation/proposals below are retained chronologically; the final
section supersedes their pending-approval status. The observer performed no
production writes. The historical writer of unknown is still unidentified.

## Live evidence and process inventory

All human-readable times below use Asia/Ho_Chi_Minh (UTC+7).

| Role | Windows PID | Port | Started | Evidence |
| --- | --- | --- | --- | --- |
| Backend | 32116 | 8080 | 21 Oct 23:57:48 | BackendApplication, current repository/backend; one ai-credit-poller thread in JVM thread dump |
| FastAPI serving process | 30512 | 127.0.0.1:8002 | 21 Oct 22:58:33 | uvicorn main:app --workers 1, no --reload |
| Python launcher | 34352 | none | 21 Oct 22:58:33 | parent of 30512; not a second serving worker/registry |
| VS Code Java language server | 12052 | no Backend listener | 21 Oct 19:31:51 | editor tooling; not BackendApplication |

Backend command: Java 25, `-XX:TieredStopAtLevel=1 -cp @<temporary argfile>`
and `com.examflow.backend.BackendApplication`. The temporary argfile no longer
exists. The running JVM's actual `java.class.path` was read with jcmd: 94
entries, starting with this checkout's backend/target/classes. The full classpath
is in `tmp/job8-backend-classpath.txt`; sanitized process arguments, start times,
parent PIDs, ports and log paths are in `tmp/job8-worker-inventory.json`.

Docker CLI could not connect to a daemon; no running WSL distro was listed.
These checks do not inventory another person's computer or remote deployment.
The operator confirmed another Backend may exist but does not know its location.

Five read-only pg_stat_activity snapshots showed two recurring global worker
polling groups: ExamFlow-Main and PostgreSQL JDBC Driver. Server session 2277994
was polling for ExamFlow-Main; the unnamed group used sessions including 2271598
and 2271670. Session numbers are PostgreSQL PIDs, NOT Windows process IDs.
Pool connections can rotate: do not equate session count with worker count.
One local worker is positively identified; at least one additional polling actor
is evidenced, but the exact number/host/PID of remote workers is unknown.
The client address visible in these DB sessions belongs to the Supabase pooler;
it cannot identify the originating developer's machine.

## Job timeline and limits of attribution

Token: `cf06a610-c92c-4774-8c1a-c5ce08d16389`.

- Created 22 Oct 00:21:04.821; dispatched and last BE heartbeat 00:21:08.037.
- FastAPI log records POST on that token, HTTP/1.1 202.
- Its terminal heartbeat is 00:22:09.579, state succeeded, one question.
- BE lease timestamp is 00:23:08.037. This is not proof that a timeout caused
  unknown; the actual transition timestamp is not present in the inspected row.
- Read-only checks still return BE unknown, accepted 0, charged 0, saved results
  0; upstream GET 200/succeeded/one question. The result SHA-256 matches the
  earlier inspection: `5c3b1e2e39e70adce1fa078b42fc0803cab75dfb78a517cc4d71c9b429a088b5`.
- Both live services' internal keys match (values were not output).
- Current FastAPI access log has no 404 for this token. Existing access lines
  lack timestamps, so they cannot establish the exact time of every request.
  The local Backend log has no matching transport/unknown warning for job #8.
- Another Backend's log and historical database statement audit are unavailable.
  Consequently no particular instance or 404 response can be blamed for #8 yet.

Current logs: `.env.examflow.runtime/logs/Backend-approved-20261021-235748.log`
and `tmp/ai-questionbank-service.log`. The FastAPI process predates the job;
there is no evidence that this particular registry was restarted during #8.

## Confirmed implementation defect

AiCreditsService.claim locks the account/month/job inside a transaction and
only changes reserved to running once. This prevents duplicate initial claim.
It does not establish a worker owner after that transaction commits.
AiCreditsService.active selects all running jobs globally; every enabled worker
may subsequently poll, checkpoint, cancel or request unknown on the same token.
lease_expires_at is a deadline, not an ownership/fencing mechanism.

FastAPI GenerationRegistry is an in-memory object in each serving process.
An instance that never accepted a token returns 404, even while another has a
valid result. The worker treats 404 as permanent and quarantines the DB job.
Thus the design is unsafe across Backends using different registries. Live
polling evidence establishes the exposure; fixture tests establish the failure
path. Neither substitutes for the missing historical log of #8's state writer.

Settlement is separately protected by account/month/job row locks, a terminal
state/token check and the existing deterministic final ledger operation key.
No settlement/accounting code was changed in this investigation.

## Safe changes prepared, not deployed

AiCreditsWorker now supports `ai.credits.worker.enabled` (default true), settable
as `AI_CREDITS_WORKER_ENABLED=false` on secondary Backend processes. Disabled
workers do not schedule/execute background polling or monthly allocation.
Teacher/Admin API authorization and explicit reconciliation remain unchanged.
This is an operational switch, NOT a distributed lock.

Startup/claim/terminal-response/error logs now include a per-worker instance ID
(PID plus UUID) and job/token for correlation. They contain no source text,
password, internal key or raw upstream error body. The UUID is for logging,
not synchronization. Existing retry, unknown, ledger and Qwen logic are intact.

No restart was performed: the current JVM has not loaded this change. Restarting
only the local Backend cannot remove the unidentified actor. Preserve the
current FastAPI process because it still holds #8's recoverable result.

Demo deployment plan:

1. Identify the other Backend host/operator and collect its logs for token #8.
   Review all its active jobs and upstream statuses before any stop/restart.
2. Deploy the switch to every participating Backend; select exactly one worker
   with true, explicitly set all secondary workers false. An older binary that
   lacks this setting will NOT be disabled by setting the variable alone.
3. Confirm startup identities and false flags, one JVM polling thread on the
   designated primary, and only its recurring global polling group in DB.
4. Use one stable AI Service endpoint/registry, --workers 1 and no reload.
   Do not generate a replacement Production job as part of these checks.

For legitimate multi-instance deployment, propose a PostgreSQL session-level
advisory singleton lock on a dedicated physical session connection to the main
DB. Acquire before all background scan/start/poll operations; nonleaders do no
background work. Fail closed if the lock connection is lost. All instances must
adopt it before it protects anything. Do not use transaction-pooling port 6543
for a session lock or a JVM static/synchronized flag. Leadership failover also
needs stable registry routing or durable execution storage: a singleton lock
alone cannot recover an in-memory registry after an AI process crash. This is
a proposal only; no live advisory lock, schema change or new pool was created.

## Job #8 recovery proposal — separate approval required

The stored candidate still passes the AI normalizer, selected CLO 30, Bloom
understand and exact-source evidence checks. The previous real duplicate check
returned 200/false. A fresh read-only Question Bank query found zero normalized
content matches across all courses; total questions remains 149. No job result
has been stored in BE and no bank write was performed. These machine checks
do not guarantee educational quality: the candidate repeats the CLO3.2*
attitude statement rather than a well-formed question stem. Review that content
before authorizing a one-credit acceptance.

Existing API can recover the result without re-generation:

`POST /api/admin/ai-credits/jobs/8/reconcile`

Proposed body (DO NOT SEND without approval):

```json
{
  "confirmedStopped": true,
  "reason": "Recover retained succeeded execution cf06a610-c92c-4774-8c1a-c5ce08d16389; verify one accepted result for job 8."
}
```

Before sending, recheck the same token still returns succeeded/one unchanged
result, the DB row is still unknown and no competing execution is running.
Use the Backend whose provider reaches this existing registry. If status becomes
404/unreachable, STOP: the current reconciliation method has a fallback that
could release rather than recover an uncheckpointed upstream result.

On approval, worker.reconcile reads the terminal upstream result and calls the
existing finish/validate transaction. Expected if one candidate is accepted:
job succeeded, accepted 1, charged_monthly 1, charged_extra 0; account used goes
from 1 to 2 and reserved from 1 to 0; available balance stays 198. Ledger should
have the original reserve plus exactly one settle (used +1, reserved -1), no
release. Repeated terminal reconciliation must not charge again. This saves
the job result for review; it does not insert a Question Bank question.

If the result is no longer recoverable, independently establish that every old
execution is stopped before proposing reservation release. Do not manually
settle, release, edit SQL balances or replay/start the execution token.

## Verification

- AI Service: 38 passed across runtime, CLO generation, embedding sync and
  extraction contract tests. External model/DB operations are mocked.
- Backend: 47 discovered, 46 passed, 1 skipped; no failures/errors. Suites:
  transport 16, settlement 18, credit rules 11, existing matrix compatibility 2.
  The optional OR-Tools native test skipped for unavailable/incompatible native
  library. No exam-module code was modified.
- Covers two enabled workers with different registries, disabled secondary,
  missing token 404, bounded 503, temporary network failure then recovery,
  retained upstream result after Backend replacement, fresh registry after
  reload, cancelled-task checkpoint preservation, claim guard, repeated finish,
  stale-token guard, terminal reconciliation replay and ledger rollback.
- Database locking assertions use mocked JDBC/TransactionTemplate. They are
  not a live multi-host PostgreSQL integration/stress test. No Production job
  was created by the tests.
- Backend compile succeeded; git diff --check passed for the changed files.

Changed in this follow-up: AiCreditsWorker.java, AiJobTransportTest.java,
AiCreditsSettlementTest.java, test_credits_runtime.py and this report. Existing
uncommitted work was preserved. Auxiliary read-only scripts/evidence are in
tmp/diagnose-job8-workers.py, tmp/inspect-job8-recovery-readonly.py,
tmp/job8-worker-inventory.json and tmp/job8-recovery-readonly.json. No commit/push.

## Quality review follow-up — 22 October, 00:56

Fresh authenticated GET still returned 200/succeeded, exactly the same candidate
as before. Its content is the CLO3.2* description with the CLO prefix: it has
no actual question/request for the learner to answer. Three distractors are
obviously undesirable attitudes; the explanation repeats the desired attitude.
It is not a complete, useful subject-matter MCQ despite passing field/evidence
validation. The upstream Bloom label is metadata, not proof of cognitive level.
Full question, options, explanation, evidence and selected CLO descriptions are
preserved in `tmp/job8-quality-review.json`, with no authentication secrets.

The existing Reconcile request has only confirmedStopped and reason. There is
no decision/reject/quality-rejection field or endpoint. Reconciliation of a
reachable terminal execution calls finish with its actual questions; a reason
saying reject does not exclude them. Cancel on unknown only sets a cancellation
request; finish still charges for accepted candidates, even on cancelled jobs.
Neither operation is a supported way to reject this candidate without charge.
Do not destroy/restart the registry to force the unreachable-result fallback.

Two proposed choices, neither executed:

- Accept: explicitly approve existing Admin reconciliation and one-credit
  charge after reviewing the weak content. Recheck unknown/unchanged token,
  stopped upstream/one retained candidate, zero existing charge/final ledger,
  and correct Backend-to-registry routing. Verify one terminal settlement,
  retained review result, no automatic Question Bank insertion, and idempotent
  repeats. Available credits would stay 198 as held credit becomes used.
- Reject: first approve implementation/testing of an explicit Admin quality
  rejection action; current API cannot do this safely as a product decision.
  Require an authenticated Admin, reason and retained result evidence/hash,
  stopped execution, expected token, unknown state, accepted_count=0 and no
  existing charge/final settlement. Recheck under the existing transaction and
  account/month/job locks, use the existing final-operation idempotency guard
  and release transaction, and leave an auditable terminal rejection reason.
  A concurrent settlement/state change must abort the rejection, not refund an
  already accepted job. With current zero charge and one monthly reservation,
  expected release is exactly 1, no settle, used unchanged and available 199.
  That change and its live execution each need approval; none was implemented.

Current worker samples again show the ExamFlow-Main and generic JDBC groups;
generic sessions rotated between PostgreSQL PIDs 2271670 and 2255752. This is
not proof of two additional Backends. Only local Backend PID 32116 is identified.
No action was taken against the unowned session/process.

To disable the secondary without interrupting work, identify its operator and
deployment, drain API traffic to a verified healthy instance and wait for its
in-flight requests/background jobs to finish. Then deploy the switch and restart
only that Backend with AI_CREDITS_WORKER_ENABLED=false, verify startup false and
no further polling, and restore traffic. The current JVM cannot hot-load this
environment change, and zero API interruption cannot be promised without traffic
draining/failover. Do not restart FastAPI or stop a worker with active generation.
No service was restarted and no production mutation was performed in this review.

## Approved acceptance completed — 22 October, 01:06

The user explicitly approved charging one credit, then chose to log in as Admin
and reconcile job #8 through the normal UI. Browser automation remained disabled;
the observer used SELECT only and did not obtain/store Admin credentials or call
the mutation endpoint itself.

Verified at 01:06:34 Asia/Ho_Chi_Minh:

- Job #8: succeeded, accepted_count 1, charged_monthly 1, charged_extra 0.
- Completed at 01:06:00.692. The original execution token is unchanged.
- One result is persisted in the job, semantically identical to the retained
  upstream question. Jackson omits null fields such as chapterId; an initial
  byte-level comparison flagged that serialization difference. A normalized
  read-only comparison confirmed all non-null question fields are unchanged.
- Ledger #21 remains the original reserve. Ledger #22 is the sole settle,
  actor Admin 52, monthly_used_delta +1 and monthly_reserved_delta -1; extra
  deltas 0. No release or duplicate settlement exists for this job.
- Account used 2 (one prior credit plus this job), reserved 0, remaining 198.
  The job's reserved_monthly=1 field retains its historical reservation amount;
  the live quota and settlement ledger confirm it is no longer held.
- The reason records the user's acceptance and one-credit approval. No new job,
  schema/migration, service restart, direct SQL mutation or commit/push occurred.

Evidence: `tmp/job8-reconciliation-verified.json`; observer:
`tmp/watch-job8-reconciliation-readonly.py`. The unidentified secondary polling
actor remains a separate unresolved operational issue; reconciliation of #8
does not establish that future generation is safe across multiple workers.
