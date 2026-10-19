# AI Credits job 503 — 2026-10-18

## Follow-up: bounded polling and warning investigation

The worker previously selected unknown jobs every three seconds and sent cancel
before GET status whenever cancel_requested_at existed. A token missing from
the process-local registry therefore caused repeated cancel 404. Unknown jobs
are now excluded from the worker SELECT (still visible in quota/Admin and still
blocking replacement jobs), with a defensive skip before timeout handling.

Running jobs GET status before cancel. A successful cancellation is sent once
per worker/token; terminal or absent upstream jobs are not cancelled. Transient
failures back off 5/10/20/40 seconds, stopping after at most five consecutive
failures or an earlier expired lease. 404, rejected/missing internal key and an
ambiguous failed start stop automatic retries immediately. All stopped jobs
retain reservations pending explicit reconciliation. Successful polling resets
backoff; retries never resend start for a claimed job. Retry state is in memory;
persisted unknown remains quarantined across BE restart. Admin reconciliation
remains an explicit separate operation.

Local HTTP-server tests verify start/status/cancel use HTTP/1.1 with neither
Upgrade nor HTTP2-Settings. Both AI clients' current source selects HTTP/1.1;
reviewed configuration uses http://127.0.0.1:8002. No HTTPS-to-8002 setting was
found in the reviewed source or process arguments. This does not rule out an
external client or an override in another process environment.

Runtime metadata: BE PID 8468 started at 16:32:19; provider class was last built
at 16:34:59 before this follow-up. Thus the running process predates the compiled
provider fix. FastAPI listens on port 8002 in PID 6344, started at 16:48:26.
This supports an outdated BE client as a warning source, but no raw live request
or first-warning trace was available to establish that attribution conclusively.
No process was restarted and no live idle-warning disappearance is claimed.

Tests added for 100 idle unknown ticks with no upstream calls, bounded 503,
404 without cancel/retry, single cancel, and HTTP/1.1 on all three operations.
No Production database or ledger operation was performed in this follow-up.

## Confirmed evidence

GET on the running FastAPI `/credits/jobs/{token}` returned:

```json
{"detail":"AI_INTERNAL_KEY must be configured before generation"}
```

Status: 503. The actual `require_internal` guard returns this before looking up
the registry or invoking Ollama. Wrong keys instead return 403. No job token is
needed to reproduce the missing-server-key condition. Root/backend/AI dotenv
files and the diagnostic process did not contain a configured key; the operator
confirmed BE receives its key from its own terminal. Separate terminals do not
inherit environment changes made in one another.

The old BE provider discarded the response body and raised only
IllegalStateException("AI Service HTTP 503"). Worker logged the exception class,
so the authentication configuration error was hidden. Historical first-failure
BE logs were not accessible; the running endpoint's response directly confirms
the current failure.

## Changes

- BE AiCreditsProvider: HTTP/1.1 for job transport, safe typed status/error codes
  for missing/rejected key, absent token and unavailable/full registry. No raw
  body or secret in diagnostics. No automatic POST replay.
- BE AiCreditsWorker: log upstream status/code while retaining existing unknown
  and reservation handling. No settlement/accounting rule change.
- AI main.py: startup warning when internal key is absent/short; authentication
  remains enforced. No model, prompt, RAG or duplicate-check changes.
- start-ai-credits.ps1: optional manual launcher, requires inherited BE-matching
  secret, one worker/no reload, refuses an occupied port and never kills workers.
- AiJobTransportTest.java and test_credits_runtime.py: regression tests.

## Main DB snapshot — SELECT only

Supabase main kbplrzkjnyphsbdmscgq / postgres / public, read-only transaction:

| Job | State | Requested | Accepted | Monthly reserved | Extra reserved | Charged |
| --- | --- | --- | --- | --- | --- | --- |
| 4 | unknown | 1 | 0 | 1 | 0 | 0 |

Exactly one reserve ledger record for job 4; no settle or release. Its October
month has limit 200, used 0, reserved 1: 199 monthly credits are available, but
the active unknown job still blocks another generation. No job/balance mutation
or Production generation was performed by this investigation.

Job dispatched at 16:27:21 Asia/Ho_Chi_Minh. Observed Python launcher/child
processes started at 16:08:33, before dispatch, without --reload/--workers args.
This does not establish all historical process activity, but provides no
evidence of a restart after this job. Registry is process-local; a lost token
returns 404 AFTER successful authentication, not this 503.

## Manual configuration and recovery boundary

Do not generate a replacement secret or paste secrets in chat/logs. Supply the
same existing BE terminal key to the AI Service terminal. Environment variables
must be set BEFORE starting that process; changing a parent terminal later does
not modify an already running worker. If entering it interactively in PowerShell:

```powershell
$taskSecret = Read-Host 'Existing BE AI_INTERNAL_KEY' -AsSecureString
$taskSecretPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecret)
try { $env:AI_INTERNAL_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskSecretPtr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskSecretPtr) }
```

Replacing a service may destroy its in-memory registry. Review the existing
worker and its jobs before stopping anything. No process was restarted here.
Once safe to replace it, run from the repository root in that configured terminal:

```powershell
.\ai-service\start-ai-credits.ps1
```

BE must also load the compiled transport/logging changes in a controlled
deployment. No backend restart was performed here.

After key alignment, use ONLY authenticated GET for job 4's execution_token
(not numeric DB id 4) to inspect the existing upstream job. If 404, first confirm
old upstream workers are stopped and inspect persisted checkpoints; obtain
separate approval before Admin reconciliation. Do not resend POST to recreate
that token or release/regrant credits automatically. An authorized reconciliation
can change job state, reservation, balances and ledger, so it was not executed.

## Tests and readiness

- BE compile/test-compile PASS, cached Maven 3.9.16/Surefire 3.5.5.
- 34 BE tests discovered: 33 passed, one opt-in live PDF upload test skipped.
  Includes 503-safe diagnostics/retry, no POST replay, lost registry/404 handling,
  checkpoint→settlement, idempotency, terminal settlement guard, full release,
  partial charge and ledger-error rollback using mock JDBC only.
- AI Service: 8 tests PASS. Actual route/guard functions tested with TestClient;
  actual generation loop uses mocked external I/O. Restart is simulated by a
  fresh registry; it does not recreate missing jobs.
- Launcher syntax parses; launcher not executed.
- GET Ollama /api/tags lists qwen2.5:7b and nomic-embed-text:latest. This verifies
  model inventory, not end-to-end generation/RAG performance.

Not ready to generate again for the affected teacher: configure and verify the
shared key, inspect/reconcile the old job with separate approval, then obtain
approval for real Production generation. No DB/schema change or commit/push.
