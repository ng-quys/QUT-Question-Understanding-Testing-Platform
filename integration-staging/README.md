# Saved Documents integration staging — preparation, not deployed

2026-10-25: existing Question Bank staging and Ollama are reachable; both required
models are installed. No main fixture, AI staging or Backend staging listener was
found on 55442/18002/18080. No new schema or bucket was created in this pass.

## Configuration isolation

- `backend.properties` replaces the default Spring configuration; use an explicit
  absolute `spring.config.location`, not an additional profile/location layered on
  Production. No imported root storage/Question Bank config, no migrations or DDL.
  Main database is exclusively loopback 55442/examflow_main_staging; Question Bank
  exclusively loopback 55441/examflow_rag_staging. AI URL is loopback 18002.
- Saved Documents is true only in this staging configuration. AI Credits and its
  worker are false; no Production credit endpoints should be exposed by the fixture.
- Use a document/auth-only Spring Boot fixture importing the real document/auth
  controllers, services, security, UserEntity and UserRepository. Do not start the
  full Production application with a partial schema: JPA validation and unrelated
  beans require tables outside this minimal fixture. This fixture app is still to
  be implemented after schema/Storage approval; no fake authentication is planned.
- `ai.staging.env.example` is a template, not a configured secret file. Generate a
  separate new internal key and use staging-only DSNs. Explicitly construct the
  child environment; do not inherit Production DB/storage/internal-key variables.
  Installed python-dotenv supports `PYTHON_DOTENV_DISABLED=1`, verified by inspecting
  the installed loader. Set it before importing main.py to prevent reading the
  Production ai-service/.env. Preserve the normal Production launch path unchanged.
- Run the AI process with ai-service as working directory and a new registry/metrics
  directory `.env.examflow.integration-staging` (ignored). Never import main.py in
  a test until this isolation is established; importing initializes registry and
  telemetry. Bind AI only to 127.0.0.1:18002. Do not create/resume credit jobs.
- Runtime preflight must validate both database hosts/ports/names, Storage project
  identity, key provenance, flag values and file paths, rejecting missing/template
  values or any Production endpoint. No launch script is supplied that bypasses
  these pending prerequisites.

## Required approval: main fixture

Approve launching `main.compose.proposed.yml`, creating the new main database schema
with `000_main_fixture.proposed.sql`, and synthetic seeding. Scope is four tables:
users, auth_sessions, courses and course_faculties. No credit/ledger tables, no
Production data, no alteration of the already-ready staging Question Bank schema.
Seed two teachers, one student, two courses and one shared course assignment. Use
fresh locally generated passwords/hashes and example.invalid emails; never print
passwords/tokens. Auth tests will exercise real login/session storage, teacher role,
course assignment and owner checks. Student and anonymous access must be denied.

## Required approval and target: private Storage

`storage-bucket.proposed.json` is the exact proposed metadata for a new private
`ai-source-documents-staging` bucket, 20 MiB and PDF/DOCX/TXT. It must be in a separate
Supabase staging project (not the Production project or its ai-source-documents
bucket). A staging project URL/server key is not available in this workspace.
Before creating anything, the operator must identify/provide that staging project
through an ignored local server-only config and approve bucket creation there.
Do not paste credentials into chat or use the current root .env.storage secret.

After approval, verify project identity and bucket privacy, then use a synthetic
test object to check upload, authenticated read and delete. No client public URL or
frontend key is needed. A mock Storage response is not evidence of real Storage
integration. No project/bucket creation or Storage object write has run yet.

## Integration execution once prerequisites exist

1. Verify isolated runtime configs and idle staging registry; ensure Production
   config files/flags/registry are untouched. Start only new staging processes.
2. Authenticate synthetic teacher through the real login path; upload a generated
   non-sensitive PDF to real private staging Storage via the document controller.
3. Record extract/chunk/embed/insert/ready times and actual Ollama embed HTTP/text
   counts. Use real pgvector exact retrieval; no mocked PostgreSQL or Ollama.
4. Repeat the same upload/selection; require zero additional chunk-embedding texts
   and calls, same compatible ready index, and measure cache-hit preparation.
5. Exercise other owner on shared course, unassigned teacher, wrong course, student,
   anonymous access, reindex, stale index and soft delete. Preserve pinned indexes.
6. Exercise legacy sourceText directly through staging /generate and real duplicate
   checker, not the credit-job route. No credits/ledger tables or writes are needed.
7. At least five runs for 1/3/5 PDFs; collect P50/P95, embed-call/text deltas, chunk
   counts and exact-search timings. Report failure honestly; no unit-test substitute.

Current result: only configuration/source inspection and service readiness checks
have run. No upload, indexing, fixture seed, credit job, benchmark or Production
database/Storage write was performed. Await schema and Storage approval/target.
