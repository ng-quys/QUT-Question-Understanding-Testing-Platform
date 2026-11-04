# ExamFlow hierarchical chunking

## Runtime switch

`AI_CHUNKING_STRATEGY` accepts exactly `fixed` or `hierarchical`. The default is
`fixed`, so an existing deployment behaves as before when the variable is absent.
The value is read when FastAPI starts and is exposed read-only as
`chunkingStrategy` by `/health`.

Windows PowerShell, for the current AI Service process only:

```powershell
cd ai-service
$env:AI_CHUNKING_STRATEGY = "hierarchical"
& .\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Return to the baseline without editing `.env`:

```powershell
$env:AI_CHUNKING_STRATEGY = "fixed"
```

Saved-document indexes include the chunker version in their configuration hash.
Enabling hierarchical mode therefore creates/requires a distinct index; it never
silently treats an old fixed index as a hierarchical one. Do not reindex a shared
environment without the normal rollout approval.

## Recognition and fallback

The parser recognizes Vietnamese chapter headings such as `CHƯƠNG 1` and
`Chương IV`, section headings such as `1.1`, and subsection headings such as
`1.1.1`. Numbered questions, answer options, lines containing `?`, and numbered
prose ending in sentence punctuation are rejected as headings.

Each LangChain document carries `source_file`, `chapter`, `section`,
`subsection`, and a deterministic `chunk_id`. Short structural units stay intact.
Only a structural unit longer than 800 characters is recursively split with 150
characters overlap, so a split cannot consume the next subsection.

If no credible hierarchy is found, the service logs
`HIERARCHICAL_CHUNKING_FALLBACK` and uses the original 800/150 splitter. Logs
also include chunk count, recognized chapter/section/subsection counts, fallback,
and processing time. The sourceText API currently concatenates up to five files
before calling AI Service, so its metadata uses `source-text`; saved-document
indexes use the document UUID as the non-secret source identifier. Preserving the
original filename for every concatenated legacy file would require an API contract
change and is intentionally out of scope.

## Retrieval and question allocation

In hierarchical mode, vector similarity remains the retrieval basis. Among the
retrieved candidates, matches in chapter/section/subsection labels mentioned by
the query are prioritized. CLO generation rotates unused knowledge chunks to the
front, records the used evidence chunk, asks for distinct knowledge units where
possible, and balances requested Bloom targets in the order
`remember → understand → apply`. Evidence validation, semantic support,
Question Bank duplicate checks, retry limits, Qwen2.5:7b, nomic-embed-text, and
the 0.85 duplicate threshold are unchanged.

This mechanism is intended to reduce repeated coverage, but no reduction claim is
valid until a controlled generation benchmark has been run.

## Dry-run comparison

First extract a PDF to a UTF-8 text file using the existing `/extract` endpoint,
then run both strategies on exactly the same text and generation configuration:

```powershell
cd ai-service
& .\.venv\Scripts\python.exe .\benchmarks\evaluate_chunking_strategies.py `
  --input C:\temp\chapter-4.txt `
  --question-count 9 `
  --inference-batch-size 3 `
  --output C:\temp\chunking-comparison.json
```

The report contains chunk/hierarchy/fallback/timing statistics and sample metadata.
It deliberately does not call Qwen and does not claim a duplicate-rate improvement.
A subsequent controlled generation A/B run must use the same PDF, CLOs, question
count, inference batch size, models, and duplicate threshold.

## Tests

```powershell
cd ai-service
& .\.venv\Scripts\python.exe -m unittest discover -p "test_*.py"
```
