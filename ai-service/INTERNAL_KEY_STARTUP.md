# Mandatory AI Credits startup key verification

Set the SAME existing AI_INTERNAL_KEY in the BE and AI Service terminals before
starting each process. The launcher never creates, changes, prints or persists
the secret. Do not put it in a URL or commit it to Git.

From the repository root, after the updated BE has started:

```powershell
.\ai-service\start-ai-credits.ps1
```

Default handshake: GET
`http://127.0.0.1:8080/api/internal/ai-credits/verify-key`, header
`X-AI-Internal-Key`. A different local BE port can be selected with
`-BackendBaseUri http://127.0.0.1:9090`. Only literal loopback HTTP(S) URLs are
accepted; certificates are validated normally for HTTPS. Redirects and proxies
are disabled. Verification timeout is five seconds. Health endpoints and HTTP
200 cannot substitute for the handshake.

The dedicated BE security chain matches only the exact verification path and
requires a direct loopback GET, rejecting forwarding headers and remote peers
with 403. It does not install the JWT resource-server filter on that path;
the controller authenticates the supplied internal key against `ai.internal.key`
(the same property as AiCreditsProvider). Fixed-size SHA-256 digests are compared
using MessageDigest.isEqual. Responses never contain a key or digest:

| Condition | Response | Launcher |
| --- | --- | --- |
| Matching configured key | 204, empty body | May start Uvicorn |
| Missing or wrong supplied key | 401, empty body | Stops |
| BE key missing, blank or shorter than 32 characters | 503, empty body | Stops |
| Non-loopback, forwarded request or wrong HTTP method | 403 | Stops |
| Unavailable BE, timeout, redirect or any other status | No successful handshake | Stops |

Other API routes retain their existing JWT/role security chain. No quota/job/
ledger/DB operations take place in this handshake. BE/FastAPI authentication for
generation is unchanged.

## Deployment boundary

Keep this path out of public reverse-proxy routing and load balancers. A proxy
that strips every forwarding header and connects over loopback is indistinguishable
from a local caller at the application layer. Therefore a reverse proxy must
explicitly deny this exact path; do not forward it to BE. For example, an operator
can use an exact nginx location returning 404. No proxy configuration was changed
by this implementation. Do not enable forwarded-header rewriting for this local
endpoint. Direct Internet peers are rejected by the application's loopback check.

The launcher still refuses an occupied FastAPI port or missing virtualenv,
starts one worker bound to 127.0.0.1 and never uses --reload. It has no bypass flag
and never stops/restarts another process.

## Validation

BE compile and 45 selected tests pass, including six real-security-chain MVC
tests and ten launcher tests. Launcher tests run actual Windows PowerShell HTTP
requests against local stub servers and replace only the Uvicorn launch function;
they never start the real service. They cover 204, 401, 503, incorrect 200,
redirect rejection, missing/short/blank key, occupied port, missing Python,
connection refusal, local-only target and the five-second HTTP timeout.
Script syntax also parses successfully. Fixtures contain synthetic test keys,
not deployment secrets. No application restart, Production DB connection or
real question generation was performed.
