"""Compare fixed and hierarchical chunking without writing ExamFlow data.

This is intentionally a chunking/retrieval preparation benchmark. It does not
claim that duplicates are reduced; question-quality comparison requires an
explicit controlled generation experiment after reviewing this dry-run.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import statistics
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from hierarchical_chunker import chunk_text  # noqa: E402


def evaluate(text: str, source_file: str, repetitions: int) -> dict:
    results = {}
    for strategy in ("fixed", "hierarchical"):
        timings = []
        chunks = []
        stats = None
        for _ in range(repetitions):
            started = time.perf_counter()
            chunks, stats = chunk_text(text, source_file=source_file, strategy=strategy)
            timings.append((time.perf_counter() - started) * 1000)
        results[strategy] = {
            "chunkCount": len(chunks),
            "chapterCount": stats.chapter_count,
            "sectionCount": stats.section_count,
            "subsectionCount": stats.subsection_count,
            "fallback": stats.fallback,
            "fallbackRatio": stats.fallback_ratio,
            "processingMsMedian": round(statistics.median(timings), 3),
            "processingMsMin": round(min(timings), 3),
            "processingMsMax": round(max(timings), 3),
            "sample": [{"content": item.page_content[:180], "metadata": item.metadata}
                       for item in chunks[:3]],
        }
    return results


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="UTF-8 extracted text file")
    parser.add_argument("--output", help="Optional JSON result path")
    parser.add_argument("--repetitions", type=int, default=5)
    parser.add_argument("--question-count", type=int, default=9,
                        help="Recorded as the common future generation configuration")
    parser.add_argument("--inference-batch-size", type=int, choices=(1, 3), default=1)
    args = parser.parse_args()
    if args.repetitions < 1:
        parser.error("--repetitions must be positive")
    path = Path(args.input).resolve()
    payload = {
        "input": str(path),
        "generationConfig": {"questionCount": args.question_count,
                             "inferenceBatchSize": args.inference_batch_size},
        "results": evaluate(path.read_text(encoding="utf-8"), path.name, args.repetitions),
        "claim": "Chunking statistics only; duplicate reduction is not established.",
    }
    rendered = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(rendered + "\n", encoding="utf-8")
    print(rendered)


if __name__ == "__main__":
    main()
