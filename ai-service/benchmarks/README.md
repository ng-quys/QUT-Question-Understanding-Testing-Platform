# AI Generator: inference size 1 versus 3

## Current status, 2026-10-25

Implementation and fixture tests complete. Full selected regression suite: **52
passed**. Final affected metrics/export tests: **13 passed**. Syntax and whitespace
checks passed. These are unit/real-FastAPI-route tests with isolated fixtures, not
real Qwen performance or expert-quality evidence.

The real benchmark did **not run**. Preflight found no single running isolated
Question Bank container. A separate read-only model inventory found qwen2.5:7b,
but not nomic-embed-text. Production AI health responded with zero active/waiting
registry entries. The complete main-database job check is deliberately required
again by the harness once all staging prerequisites exist. No measured pilot/main
records, timing distributions, hardware comparisons or expert labels are invented.

The delivered workbook has six sheets, original summary columns, formulas and
three charts. It states NOT RUN; analytical results are N/A, and expert labels are
blank. It was recalculated and all six views rendered/inspected. A disposable
formula check was restored before export; saved worksheets contain no QA records.
Native Excel itself was not launched for recalculation verification.

## Architecture and unchanged boundaries

- `main.ollama_generate` uses the existing local `/api/generate` request. The new
  wrapper records raw Ollama metrics without modifying Production's request options:
  num_ctx=2048, num_predict=850, JSON format, non-streaming.
- `_generate` retains the existing sourceText FAISS branch and pinned documentRefs
  exact-search branch. CLO generation still retrieves four chunks, keeps the same
  4800-character context cap, support threshold 0.35 and existing CLO allocation.
  No document/chunk shortening, model or retrieval settings changed for speed.
- `generate_clo_questions` groups at most 1 or 3 requests for the same CLO/context.
  Each candidate uses the existing normalizer, four distinct options, strict answer
  index, selected CLO, allowed Bloom and a verbatim evidence quote of at least 20
  characters. Semantic evidence support and Question Bank/in-run duplicates remain
  mandatory. Duplicate lookup failures still fail closed.
- Each group has the existing maximum attempt count. Accepted candidates are kept;
  subsequent attempts request only missing candidates. A malformed whole response
  consumes an attempt and is retained for audit. Over-limit candidates are retained
  as rejected; no accepted count can exceed the requested count. Within-response
  candidates are duplicate-checked sequentially against earlier accepted ones.
- `inference_batch_size` is the number requested per Qwen call. The existing
  `batchSize` is `checkpoint_batch_size` (5 or historical 10). They are independent.
  Checkpoints remain at every fifth/tenth accepted question and the final partial
  batch. No Backend credit settlement or worker coordination change was made.
- The current CLO/sourceText pipeline supports both inference modes. Historical
  unit/matrix payloads remain on the original one-question path; admission records
  effective mode 1 for those old payloads rather than claiming they ran in mode 3.

## Configuration and resume

`AI_INFERENCE_BATCH_SIZE=1` is the default. Only exact 1 or 3 are valid; invalid
startup configuration fails before initializing the registry. No teacher dropdown.

New credit-job admission pins the process configuration in payload
`inferenceBatchSize` and the durable registry record. This is internal metadata,
excluded from the legacy payload fingerprint. A repost/resume uses the existing
mode even if the environment changed; direct attempts to change the same registry
job's mode are rejected. Old records without a mode default to 1. An invalid stored
mode fails without overwriting the registry. Terminal payload cleanup retains the
top-level mode. No database migration/schema change is needed. Registry snapshots
now expose both inferenceBatchSize and checkpointBatchSize.

Production default/config files were not switched to mode 3. Existing FastAPI and
Ollama processes were not restarted, so source changes are not claimed as deployed
into a previously running process. A future controlled restart must recheck all
active/unknown jobs, registry entries and indexing first.

## Telemetry and workbook

The runtime now writes automatically to the fixed local workbook
`ai-service/benchmarks/ai_generator_results.xlsx`. It has exactly six sheets:
Job Summary, Inference Metrics, Resource Metrics, Question Quality, Comparison and
Configuration. A job is upserted by Backend job ID plus execution token, so a late
unknown snapshot, reconciliation or resume does not create another summary row.
Every measured execution segment still has a unique Run ID for its detail rows.

The AI Service first spools each factual event under `.telemetry-pending`, then a
cross-process lock admits one Excel writer. The workbook is saved to a same-folder
temporary file and atomically replaced. If Excel has the workbook open, or writing
otherwise fails, the event remains in the spool and the background writer retries.
Telemetry exceptions are logged but never change generation, job state or credit
settlement. Model text is written as literal data to prevent formula injection.
Metrics that were not observed are recorded as N/A; no historical value is guessed.

Job #22 was recovered from the durable AI registry and the measurements already
captured during its real run. Its summary records succeeded, requested 3, valid 2,
inference size 1, 7 Qwen calls and 4 retries. Token totals and duration were derived
only from its retained inference/detail rows. No new generation job was submitted.

Definitions:

- Qwen calls include attempted HTTP calls and retain their errors. Retry calls
  count requests after the first attempt of a group. Regeneration requests sum
  missing-question slots requested on those retries, not distinct final questions.
- All parsed candidates are retained, including invalid, duplicate, excess and
  not-yet-evaluated candidates. The expert columns remain empty. Validation reasons
  distinguish options, answer index, CLO, Bloom, evidence length/source and support.
- Returned-question totals are unknown (N/A) when any response is malformed or
  unavailable. JSON object-candidate counts are syntactic counts, not proof of
  educational validity. Valid ratio uses newly accepted/returned candidates only
  when the denominator is known. Resume segments subtract accepted-at-start counts.
- Seconds/valid and valid/minute use actual new accepted count. Zero-valid runs
  have N/A seconds/valid and are explicitly counted in Comparison, never presumed
  to have generated the requested nine questions.
- Retrieval time covers CLO retrieval/support/context construction. SourceText
  FAISS preparation is included in total processing but not that retrieval subtotal.
  Duplicate time includes question embedding and PostgreSQL/in-run duplicate checks.
- Ollama load/prompt-eval/generation durations are converted from ns to seconds;
  prompt/output tokens are raw counts. Tokens/s uses eval_count/eval_duration.
- CPU percentages are raw process CPU values and can exceed 100 on multicore hosts.
  Ollama samples include serve and its available descendants. GPU/VRAM are observed
  device-level NVIDIA counters, not exclusive attribution to Qwen; other hardware
  or unavailable counters are N/A. Available RAM is sampled machine-wide.
- Resource rows preserve elapsed sample timestamps. Config records the requested
  sample interval; actual gaps include sampler overhead and are derivable from rows.
- Cold/warm is observed immediately before first inference via Ollama /api/ps.
  The harness never forcibly unloads/restarts a shared model. Unknown is not cold.
- Comparison excludes pilot and uncontrolled Production records. It computes mean,
  sample standard deviation, median/P50, interpolated P95 and throughput speed gain
  (`baseline seconds/valid / mode seconds/valid - 1`). Runtime grouped percentiles
  require modern Excel FILTER support. The standalone artifact uses transparent
  helper ranges for broader formula compatibility.

## Safe real execution (not executed yet)

1. Start the existing Docker staging service without running migrations. The
   expected container must have project/service labels, pgvector:pg17 image,
   dedicated volume and exclusive loopback mapping 127.0.0.1:55441. Its database
   examflow_rag_staging must already have the approved schema. Never substitute a
   Production DSN or create schema automatically.
2. Make both real model manifests available in local Ollama. Do not restart it
   while Production work is active. Confirm the embedding dimension remains 768.
3. From repository root, run preflight only:

   `ai-service/.venv/Scripts/python.exe ai-service/benchmarks/run_isolated.py`

4. When preflight passes, use `--run --output <new-empty-directory>`. The harness
   rechecks Production health/queue and main DB active/unknown state before every
   run, and watches for Production activity during execution. If activity appears,
   it cancels at the next pipeline boundary; an already dispatched inference may
   finish. Keep new Production submissions idle throughout the experiment.
5. Harness schedule: pilot mode1=3 questions, mode3=3; then five main pairs with
   9 requested per mode/run, ordered AB, BA, AB, BA, AB. Total requested: 96 including
   pilots. Same synthetic network_case.txt and CLO, same seed=42/temperature=0.8,
   num_ctx=2048/num_predict=850 in both experimental modes. Explicit seed/temperature
   are experiment-only constants; Production sampling options remain unchanged.
6. It imports the real pipeline in its own process with dotenv disabled, a new
   local registry/metrics directory and staging-only reader DSN. Writer DSN is
   cleared. The staging reader enforces read-only transactions and extensions
   search_path. Real FAISS/Ollama and the actual PostgreSQL duplicate checker are
   used, including in-run comparisons; no fake duplicate or model result.
7. It calls `_generate` directly and never starts/resumes a credit job or inserts a
   generated question. Main Production access is SELECT-only for idle checks.
   Source code preflight does not copy Production data. On errors stop without
   automatic replay or cleanup writes. Retain partial raw observations honestly.

The fixed runtime workbook is updated at terminal job completion without a manual
download/export step. To produce a separate standalone research artifact from an
isolated benchmark JSONL, run export_artifact.mjs with
`--input <runtime-metrics.research.jsonl> --output <report.xlsx>` using the bundled
Node/artifact-tool dependency runtime. With no --input it creates a header/formula
template explicitly marked NOT RUN, not a benchmark result. Never hand-fill results.

## Recommendation and outstanding evidence

Keep inference mode 1 until a completed real pilot and alternating five-pair main
benchmark establish speed, resource use and valid yield. There is currently no
measured basis to claim mode 3 faster, less memory-intensive or equal in quality.
Do not infer knowledge correctness from structural/semantic validation. A teacher
must label all candidates before judging expert quality; no such labels exist yet.

## Files changed in this task

Modified source: main.py, clo_generation.py, credits_runtime.py,
generation_telemetry.py and Backend AI job transport/worker. Modified tests include
the Python telemetry/registry suites and Backend transport suite. New runtime
modules/tests: inference_metrics.py, durable_telemetry.py, benchmark_workbook.py,
test_durable_telemetry.py, research_export.py and test_inference_batching.py. New benchmark assets:
benchmarks/run_isolated.py, network_case.txt, export_artifact.mjs,
export-schema.json and this README. Delivery: the standalone XLSX in
outputs/inference-benchmark-20261025 and the fixed ignored runtime workbook under
ai-service/benchmarks. No UI, credit/ledger, coordination or database schema source
was changed for automatic export. No commit/push was made.
