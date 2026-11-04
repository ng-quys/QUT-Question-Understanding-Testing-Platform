"""Local semantic-only evaluation. Never imports the application or connects to DBs."""
import argparse
import ast
import collections
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import platform
import time
import unicodedata
import urllib.request


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def metrics(rows, threshold):
    counts = collections.Counter(
        ('TP' if r['label'] else 'FP') if r['cosine'] >= threshold
        else ('FN' if r['label'] else 'TN') for r in rows)
    tp, fp, fn, tn = (counts[k] for k in ('TP', 'FP', 'FN', 'TN'))
    return dict(threshold=threshold, n=len(rows), TP=tp, FP=fp, FN=fn, TN=tn,
                precision=tp/(tp+fp) if tp+fp else None,
                recall=tp/(tp+fn) if tp+fn else None,
                f1=2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else None,
                accuracy=(tp+tn)/len(rows) if rows else None)


def main():
    from openpyxl import load_workbook
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    source, out = args.input.resolve(), args.out.resolve()
    started = dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).isoformat()
    clock = time.perf_counter()
    fingerprint = sha(source)
    book = load_workbook(source, read_only=True, data_only=False)
    sheet = book.worksheets[0]
    iterator = iter(sheet.values)
    headers = next(iterator)
    rows, blank = [], 0
    for row_number, values in enumerate(iterator, 2):
        if not any(v is not None for v in values):
            blank += 1
            continue
        raw = dict(zip(headers, values))
        assert all(isinstance(raw.get(k), str) and raw[k].strip()
                   for k in ('question_1', 'question_2')), f'Invalid question row {row_number}'
        label = raw.get('label')
        assert not isinstance(label, bool) and str(label) in ('0', '1', '0.0', '1.0'), f'Invalid label row {row_number}'
        rows.append(dict(source_row=row_number, pair_id=raw.get('pair_id'),
                         question_id_1=raw.get('question_id_1'), question_id_2=raw.get('question_id_2'),
                         question_1=raw['question_1'], question_2=raw['question_2'],
                         label_raw=label, label=int(float(label))))
    assert len(rows) == 500, f'Expected 500 pairs, found {len(rows)}'
    assert len({r['pair_id'] for r in rows}) == len(rows), 'Repeated pair IDs'
    book.close()
    texts = list(dict.fromkeys(r[k] for r in rows for k in ('question_1', 'question_2')))
    model, base = 'nomic-embed-text', 'http://127.0.0.1:11434'

    def api(endpoint, payload=None):
        request = urllib.request.Request(base+endpoint,
            data=json.dumps(payload).encode('utf-8') if payload is not None else None,
            headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=180) as response:
            return json.load(response)

    tags = api('/api/tags')  # Fail closed: no synthetic scores or offline fallback.
    resolved = next(m for m in tags['models'] if m['name'] in (model, model+':latest'))
    digest = resolved['digest']
    version = api('/api/version').get('version')
    out.mkdir(parents=True, exist_ok=True)
    cache_path = out/'final-embedding-cache.json'
    cache = json.loads(cache_path.read_text(encoding='utf-8')) if cache_path.exists() else {'digest': digest, 'vectors': {}}
    assert cache['digest'] == digest, 'Embedding cache model mismatch'
    def key(text): return hashlib.sha256(text.encode('utf-8')).hexdigest()
    def validate(vector):
        assert len(vector) == 768 and all(math.isfinite(x) for x in vector)
        assert sum(x*x for x in vector) > 0
    for vector in cache['vectors'].values(): validate(vector)
    missing = [t for t in texts if key(t) not in cache['vectors']]
    initial_cached = len(texts)-len(missing)
    calls, embedding_seconds, call_times = 0, 0.0, []
    print(json.dumps(dict(stage='validated', pairs=len(rows), labels=dict(collections.Counter(r['label'] for r in rows)),
                         unique_texts=len(texts), source_sha256=fingerprint, cached=initial_cached)), flush=True)
    for offset in range(0, len(missing), 16):
        batch = missing[offset:offset+16]
        before = time.perf_counter()
        response = api('/api/embed', {'model': model, 'input': batch, 'truncate': False})
        elapsed = time.perf_counter()-before
        vectors = response['embeddings']
        assert len(vectors) == len(batch)
        for text, vector in zip(batch, vectors):
            validate(vector)
            cache['vectors'][key(text)] = vector
        embedding_seconds += elapsed
        call_times.append(elapsed)
        calls += 1
        print(json.dumps(dict(stage='embedding', completed=min(offset+16, len(missing)), total=len(missing), seconds=round(elapsed, 3))), flush=True)
    # Write once: avoid replacing a cache repeatedly while Windows scanners hold it.
    if not cache_path.exists():
        cache_path.write_text(json.dumps(cache, allow_nan=False), encoding='utf-8')
    # Extract only the production cosine function, without application startup side effects.
    production = Path(__file__).resolve().parents[1]/'main.py'
    tree = ast.parse(production.read_text(encoding='utf-8'))
    function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == '_cosine')
    namespace = {'math': math}
    exec(compile(ast.Module(body=[function], type_ignores=[]), 'production_cosine', 'exec'), namespace)
    cosine = namespace['_cosine']
    scoring_started = time.perf_counter()
    for row in rows:
        a, b = (cache['vectors'][key(row[k])] for k in ('question_1', 'question_2'))
        score = cosine(a, b)
        assert math.isfinite(score) and -1.0000001 <= score <= 1.0000001
        row.update(cosine=score, prediction=int(score >= .85),
                   outcome=('TP' if row['label'] else 'FP') if score >= .85 else ('FN' if row['label'] else 'TN'))
    scoring_seconds = time.perf_counter()-scoring_started
    # A real repeated model call checks reproducibility, including batch vs single input.
    probe = api('/api/embed', {'model': model, 'input': texts[0], 'truncate': False})['embeddings'][0]
    validate(probe)
    original = cache['vectors'][key(texts[0])]
    probe_cosine = cosine(probe, original)
    max_probe_delta = max(abs(a-b) for a, b in zip(probe, original))
    assert probe_cosine >= .99999, 'Re-embedding reproducibility check failed'
    assert next(m['digest'] for m in api('/api/tags')['models'] if m['name'] == resolved['name']) == digest
    assert sha(source) == fingerprint, 'Input file changed during evaluation'
    # Connected components group shared IDs and near-identical formatting for leakage diagnostics only.
    parent = {}
    def find(x):
        parent.setdefault(x, x)
        if parent[x] != x: parent[x] = find(parent[x])
        return parent[x]
    def union(a, b): parent[find(a)] = find(b)
    def canonical(t): return ' '.join(unicodedata.normalize('NFC', t).casefold().split())
    for row in rows:
        nodes = ['text:'+canonical(row[k]) for k in ('question_1', 'question_2')]
        for k, node in zip(('question_id_1', 'question_id_2'), nodes):
            if row[k] is not None: union(node, 'id:'+str(row[k]))
        union(*nodes)
    components = collections.Counter(find('text:'+canonical(r['question_1'])) for r in rows)
    pair_groups = collections.defaultdict(list)
    for row in rows: pair_groups[tuple(sorted((row['question_1'], row['question_2'])))].append(row)
    metadata = dict(source_name=source.name, source_sha256=fingerprint, source_size_bytes=source.stat().st_size,
        source_mtime=dt.datetime.fromtimestamp(source.stat().st_mtime, dt.timezone.utc).isoformat(),
        source_sheet=sheet.title, source_label_column='label', label_policy='Existing label values unchanged; manual reference as confirmed by user. No AI relabeling.',
        labels=dict(collections.Counter(r['label'] for r in rows)), pairs=len(rows), empty_formatted_rows_ignored=blank,
        unique_questions=len(texts), text_occurrences=2*len(rows), reused_occurrences=2*len(rows)-len(texts),
        model=model, resolved_model=resolved['name'], model_digest=digest, dimensions=768, ollama_version=version,
        embedding_input='Raw question text only; no prefix, trim, answers, or normalization',
        embedding_api='/api/embed', embedding_batch_size=16, truncate=False, cached_at_start=initial_cached,
        embedding_calls=calls, repeat_probe_calls=1, embedding_wall_seconds=embedding_seconds,
        cosine_seconds=scoring_seconds, repeat_probe_cosine=probe_cosine, repeat_probe_max_abs_delta=max_probe_delta,
        threshold=.85, comparison='cosine >= threshold', production_cosine_source_sha256=sha(production),
        evaluator_sha256=sha(Path(__file__)), python_version=platform.python_version(),
        question_connected_components=len(components), largest_component_pairs=max(components.values()),
        duplicate_pair_groups=sum(len(v)>1 for v in pair_groups.values()),
        conflicting_pair_groups=sum(len({r['label'] for r in v})>1 for v in pair_groups.values()),
        threshold_policy='0.70–0.95 step 0.01, descriptive on all 500 pairs only. No optimal threshold selected, no holdout claim. Any future tuning must split question-connected components and check topical paraphrase leakage.',
        evaluation_scope='Semantic cosine component only; no exact-match override, bank retrieval, course filtering or generation jobs.',
        started=started, finished=dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).isoformat(),
        total_wall_seconds=time.perf_counter()-clock)
    result = dict(metadata=metadata, metrics=metrics(rows, .85),
                  sweep=[metrics(rows, i/100) for i in range(70, 96)], rows=rows)
    (out/'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
    print(json.dumps(dict(stage='complete', metrics=result['metrics'], metadata=metadata), ensure_ascii=True), flush=True)


if __name__ == '__main__':
    main()
