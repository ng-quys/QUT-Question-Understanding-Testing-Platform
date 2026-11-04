"""Offline workbook evaluation; only Ollama inference HTTP calls, no database access."""
import ast, collections, datetime, hashlib, json, math, pathlib, struct, sys, time, urllib.request
from openpyxl import load_workbook

ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'QTHTM_500.xlsx'
OUT = pathlib.Path(__file__).resolve().parent / 'semantic-evaluation-20261026'
OUT.mkdir(exist_ok=True)
BASE = 'http://127.0.0.1:11434'
MODEL = 'nomic-embed-text'
def now(): return datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).isoformat()
def api(path, data=None):
    req = urllib.request.Request(BASE+path, data=json.dumps(data).encode() if data else None, headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=180) as r: return json.load(r)
def digest():
    return next(m['digest'] for m in api('/api/tags')['models'] if m['name']=='nomic-embed-text:latest')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def cosine(a,b):
    return sum(x*y for x,y in zip(a,b))/(math.sqrt(sum(x*x for x in a))*math.sqrt(sum(y*y for y in b)))
def metrics(rows,t):
    c=collections.Counter(('TP' if r['label']==1 else 'FP') if r['cosine']>=t else ('FN' if r['label']==1 else 'TN') for r in rows)
    tp,tn,fp,fn=(c[k] for k in ['TP','TN','FP','FN']); n=len(rows)
    return dict(threshold=t,n=n,TP=tp,TN=tn,FP=fp,FN=fn,accuracy=(tp+tn)/n if n else None,precision=tp/(tp+fp) if tp+fp else None,recall=tp/(tp+fn) if tp+fn else None,f1=2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else None)
def main():
    start=now(); original=sha(SOURCE); dg=digest()
    w=load_workbook(SOURCE,read_only=True,data_only=False); s=w.worksheets[0]
    header=[c.value for c in s[1]]; rows=[]; blank=[]
    for i,values in enumerate(s.iter_rows(min_row=2,values_only=True),2):
        if not any(v is not None for v in values): blank.append(i);continue
        raw=dict(zip(header,values)); issues=[]
        for name in ['question_1','question_2']:
            if not isinstance(raw.get(name),str) or not raw[name].strip(): issues.append('missing_or_invalid_'+name)
        label=raw.get('label')
        if isinstance(label,bool) or str(label).strip() not in ('0','1','0.0','1.0'): issues.append('missing_or_invalid_label')
        item=dict(source_row=i,pair_id=raw.get('pair_id'),question_id_1=raw.get('question_id_1'),question_id_2=raw.get('question_id_2'),question_1=raw.get('question_1'),question_2=raw.get('question_2'),label_raw=label,label=int(float(label)) if not any('label' in x for x in issues) else None,issues=issues)
        rows.append(item)
    groups=collections.defaultdict(list)
    for r in rows:
        if not any('question' in x for x in r['issues']): groups[tuple(sorted([r['question_1'],r['question_2']]))].append(r)
    for group in groups.values():
        for r in group:
            r['duplicate_pair_rows']=[x['source_row'] for x in group if x is not r]
            r['conflicting_labels']=len({x['label'] for x in group if x['label'] is not None})>1
    valid=[r for r in rows if not r['issues']]
    print(json.dumps({'records':len(rows),'valid':len(valid),'blank_rows':len(blank),'labels':dict(collections.Counter(r['label'] for r in valid)),'duplicate_groups':sum(len(g)>1 for g in groups.values())}),flush=True)
    cachepath=OUT/'embedding-cache.json'
    cache=json.loads(cachepath.read_text(encoding='utf-8')) if cachepath.exists() else {'digest':dg,'vectors':{}}
    if cache['digest']!=dg: raise RuntimeError('Cache digest mismatch')
    texts=list(dict.fromkeys(r[k] for r in valid for k in ['question_1','question_2']))
    for i,text in enumerate(texts):
        key=hashlib.sha256(text.encode()).hexdigest()
        if key not in cache['vectors']:
            v=api('/api/embed',{'model':MODEL,'input':text})['embeddings'][0]
            if len(v)!=768 or not all(math.isfinite(x) for x in v) or not any(v): raise ValueError('Invalid vector')
            cache['vectors'][key]=v
            if i%10==0: cachepath.write_text(json.dumps(cache),encoding='utf-8')
        if (i+1)%25==0: print(f'Embedded {i+1}/{len(texts)}',flush=True)
    cachepath.write_text(json.dumps(cache),encoding='utf-8')
    def vector(t):return cache['vectors'][hashlib.sha256(t.encode()).hexdigest()]
    delta=0
    # Extract Production cosine AST without importing main.py (which initializes telemetry/jobs).
    tree=ast.parse((ROOT/'ai-service/main.py').read_text(encoding='utf-8'))
    fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='_cosine')
    ns={'math':math};exec(compile(ast.Module(body=[fn],type_ignores=[]),'production_cosine','exec'),ns)
    for r in valid:
        a,b=vector(r['question_1']),vector(r['question_2']);score=ns['_cosine'](a,b)
        assert abs(score-cosine(a,b))<1e-12
        stored=lambda v:[struct.unpack('f',struct.pack('f',float(format(x,'.9g'))))[0] for x in v]
        delta=max(delta,abs(score-cosine(stored(a),stored(b))))
        r.update(cosine=score,prediction=int(score>=.85),outcome=('TP' if r['label'] else 'FP') if score>=.85 else ('FN' if r['label'] else 'TN'))
    if digest()!=dg or sha(SOURCE)!=original: raise RuntimeError('Model/source changed during run')
    norms=[math.sqrt(sum(x*x for x in vector(t))) for t in texts]
    meta=dict(source=SOURCE.name,source_sha256=original,sheet=s.title,label_column='label',ignored_sheet='Cặp cần duyệt',model=MODEL,resolved_model='nomic-embed-text:latest',digest=dg,dimensions=768,threshold=.85,started=start,finished=now(),records=len(rows),valid=len(valid),excluded=len(rows)-len(valid),blank_formatted_rows=len(blank),unique_texts=len(texts),norm_min=min(norms),norm_max=max(norms),storage_cosine_max_delta=delta,duplicate_groups=sum(len(g)>1 for g in groups.values()),duplicate_extra_rows=sum(len(g)-1 for g in groups.values()),conflicting_groups=sum(len({x['label'] for x in g if x['label'] is not None})>1 for g in groups.values()),protocol='Raw question text, no prefix/strip/case normalization; /api/embed single string; Production _cosine; all valid annotated rows retained, duplicate flags only. Cosine >= threshold, no exact-match override. Threshold sweep descriptive only; no independent threshold selection claim.',production_scope='Local installed model digest verified; deployed Production digest/DB not queried. Production source behavior verified; no DB/credits/schema writes.')
    result=dict(metadata=meta,metrics=metrics(valid,.85),sweep=[metrics(valid,i/100) for i in range(75,96)],rows=rows,unique_pair_metrics=metrics([g[0] for g in groups.values() if not g[0]['issues']],.85))
    (OUT/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'metadata':meta,'metrics':result['metrics'],'errors':[{k:r[k] for k in ['pair_id','source_row','label','cosine','outcome','question_1','question_2']} for r in valid if r['outcome'] in ('FP','FN')]},ensure_ascii=False),flush=True)
if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8');main()
