"""Local FAISS retrieval A/B. No main.py, dotenv, DB, credits or generation API.

This benchmark intentionally uses identical raw-input nomic embeddings and exact
cosine retrieval for both strategies (no hierarchy-only filters/reranker).
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import time
import unicodedata

import faiss
import httpx
import numpy as np
from langchain_text_splitters import RecursiveCharacterTextSplitter

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from pdf_hierarchy import chunk_pdf, read_slides
from clo_generation import _build_context_chunks

KS=(1,3,4,5,10)


def normalized(text):
    return ' '.join(unicodedata.normalize('NFC',text).split())


def sha(value):
    return hashlib.sha256(value).hexdigest()


def pack_whole_chunks(rows,budget=4800):
    blocks,selected=[],[]
    for row in rows:
        block=f"[CHUNK chunk-{len(selected)+1}]\n{row['text']}"
        candidate='\n\n'.join(blocks+[block])
        if len(candidate)>budget:break
        blocks.append(block);selected.append(row)
    return '\n\n'.join(blocks),selected


def relevant_targets(row,query):
    return {i for i,g in enumerate(query.get('gold',[]))
            if row['chapter']==g['chapter']
            and any(s['page']==g['page'] for s in row['metadata']['page_spans'])
            and normalized(g['quote']) in normalized(row['text'])}


def query_metrics(ranked,query):
    total=len(query['gold']);recall={}
    for k in KS:
        found=set().union(*(relevant_targets(r,query) for r in ranked[:k]))
        recall[str(k)]=len(found)/total if total else None
    first=next((i for i,r in enumerate(ranked,1) if relevant_targets(r,query)),None)
    return {'recall':recall,'first_relevant_rank':first,
            'reciprocal_rank':1/first if first else 0,
            'reciprocal_rank_at10':1/first if first and first<=10 else 0}


def percentile(values,p):
    return float(np.percentile(values,p)) if values else None


def build_corpora(root):
    corpora={'fixed':[],'hierarchical':[]};pages={};inputs=[]
    for number in range(1,7):
        matches=list(root.glob(f'Chuong{number}_*.pdf'))
        if len(matches)!=1:raise ValueError(f'Expected one PDF for chapter {number}')
        path=matches[0];slides=read_slides(path)
        pages[number]={s.page:s.text for s in slides}
        text='\n'.join(s.text for s in slides)
        fixed=RecursiveCharacterTextSplitter(chunk_size=800,chunk_overlap=150,add_start_index=True).create_documents([text])
        for d in fixed:
            start=d.metadata['start_index'];end=start+len(d.page_content);spans=[];offset=0
            if start<0 or text[start:end]!=d.page_content:raise ValueError('Fixed source offset mismatch')
            for s in slides:
                lo,hi=max(offset,start),min(offset+len(s.text),end)
                if hi>lo:spans.append({'page':s.page,'start':lo-offset,'end':hi-offset})
                offset+=len(s.text)+1
            d.metadata.update(source_file=path.name,page_spans=spans,section=None,fallback=False)
        hierarchical,analysis=chunk_pdf(path)
        for name,docs in [('fixed',fixed),('hierarchical',hierarchical)]:
            for order,d in enumerate(docs):
                if len(d.page_content)>800:raise ValueError('Oversize input chunk')
                corpora[name].append({'id':f'{name}:c{number}:{order}', 'chapter':number,
                    'text':d.page_content,'metadata':d.metadata,'text_sha256':sha(d.page_content.encode())})
        inputs.append({'file':path.name,'chapter':number,'sha256':sha(path.read_bytes()),
                       'fixed_chunks':len(fixed),'hierarchical_chunks':len(hierarchical),
                       'hierarchical_fallback_ratio':analysis['fallback_character_ratio']})
    return corpora,pages,inputs


def aggregate(details):
    scored=[d for d in details if d['scored']]
    return {'queries':len(scored),
            'recall':{str(k):float(np.mean([d['metrics']['recall'][str(k)] for d in scored])) for k in KS},
            'mrr':float(np.mean([d['metrics']['reciprocal_rank'] for d in scored])),
            'mrr_at10':float(np.mean([d['metrics']['reciprocal_rank_at10'] for d in scored])),
            'context_recall':float(np.mean([d['context']['evidence_recall'] for d in scored])),
            'search_ms_p50':percentile([t for d in details for t in d['search_ms_samples']],50),
            'search_ms_p95':percentile([t for d in details for t in d['search_ms_samples']],95),
            'context_max_characters':max(d['context']['characters'] for d in details),
            'runtime_top10_cut_chunk_queries':sum(d['runtime_context_cut_chunks']>0 for d in details),
            'context_average_chunks':float(np.mean([d['context']['chunks'] for d in details]))}


def run(args):
    output=args.output.resolve()
    if output.exists() and any(output.iterdir()):raise ValueError('Choose a new empty output directory; no files overwritten')
    output.mkdir(parents=True,exist_ok=True)
    corpus,pages,inputs=build_corpora(args.pdf_dir)
    dataset=json.loads(args.queries.read_text(encoding='utf-8'));queries=dataset['queries']
    for q in queries:
        for g in q['gold']:
            if normalized(g['quote']) not in normalized(pages[g['chapter']][g['page']]):
                raise ValueError(f"Gold quote not found on actual source page: {q['id']}")
    print('SOURCE_AND_GOLD_VALIDATED',len(queries),{s:len(r) for s,r in corpus.items()},flush=True)
    client=httpx.Client(timeout=httpx.Timeout(180,connect=5))
    tags=client.get(args.ollama+'/api/tags');tags.raise_for_status()
    model=next((m for m in tags.json()['models'] if m['name'] in (args.model,args.model+':latest')),None)
    if model is None:raise ValueError('Requested local model is not installed')
    embedding_calls=[]
    def embed(texts,kind):
        start=time.perf_counter()
        response=client.post(args.ollama+'/api/embed',json={'model':args.model,'input':texts,'truncate':False})
        response.raise_for_status();body=response.json();vectors=np.asarray(body['embeddings'],dtype='float32')
        elapsed=(time.perf_counter()-start)*1000
        if vectors.shape!=(len(texts),768) or not np.isfinite(vectors).all() or (np.linalg.norm(vectors,axis=1)==0).any():
            raise ValueError('Invalid real embedding dimensions/values')
        faiss.normalize_L2(vectors)
        embedding_calls.append({'kind':kind,'texts':len(texts),'elapsed_ms':elapsed,
                                'ollama_prompt_eval_count':body.get('prompt_eval_count')})
        return vectors,elapsed
    # Deduplicate identical input texts only; each strategy has its own FAISS
    # object, vector file and metadata. Identical text receives identical vectors.
    unique=list(dict.fromkeys(row['text'] for rows in corpus.values() for row in rows))
    vectors={};doc_started=time.perf_counter()
    for start in range(0,len(unique),args.embedding_batch_size):
        texts=unique[start:start+args.embedding_batch_size];values,_=embed(texts,'document')
        vectors.update(zip(texts,values))
        print('EMBEDDED_DOCUMENT_TEXTS',min(start+len(texts),len(unique)),'/',len(unique),flush=True)
    embedding_ms=(time.perf_counter()-doc_started)*1000
    indexes={};build_ms={};faiss.omp_set_num_threads(1)
    for strategy,rows in corpus.items():
        values=np.stack([vectors[r['text']] for r in rows]);started=time.perf_counter()
        index=faiss.IndexFlatIP(768);index.add(values);indexes[strategy]=index
        build_ms[strategy]=(time.perf_counter()-started)*1000
        faiss.write_index(index,str(output/f'{strategy}.faiss'))
        (output/f'{strategy}_chunks.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
    details={s:[] for s in corpus};query_timings=[]
    for ordinal,q in enumerate(queries):
        query_vector,query_ms=embed([q['query']],'query');query_timings.append(query_ms)
        # Alternate timing order to avoid giving one index all first searches.
        for strategy in list(corpus)[::1 if ordinal%2==0 else -1]:
            index=indexes[strategy];rows=corpus[strategy]
            distances,ids=index.search(query_vector,len(rows))
            ranked=[rows[int(i)]|{'similarity':float(score)} for i,score in zip(ids[0],distances[0])]
            index.search(query_vector,10)  # unmeasured warm-up
            samples=[]
            for _ in range(args.search_repetitions):
                started=time.perf_counter();index.search(query_vector,10)
                samples.append((time.perf_counter()-started)*1000)
            metrics=query_metrics(ranked,q) if q['gold'] else None
            context,selected=pack_whole_chunks(ranked[:10])
            if len(context)>4800 or any(r['text'] not in context for r in selected):raise ValueError('Whole-chunk context invariant failed')
            gold_hits=set().union(*(relevant_targets(r,q) for r in selected))
            # Inspect the existing source-character packer without calling API
            # or altering it. It can slice a chunk in a larger candidate pool.
            from langchain_core.documents import Document
            legacy=_build_context_chunks([Document(page_content=r['text'],metadata=r['metadata']) for r in ranked[:10]])
            cuts=sum(len(record['text'])<len(row['text']) for record,row in zip(legacy,ranked))
            item={'query_id':q['id'],'scored':bool(q['gold']),'metrics':metrics,
                  'query_embedding_ms':query_ms,'search_ms_samples':samples,
                  'oracle_gold_coverage':len(set().union(*(relevant_targets(r,q) for r in ranked)))/len(q['gold']) if q['gold'] else None,
                  'runtime_context_cut_chunks':cuts,
                  'context':{'characters':len(context),'chunks':len(selected),'chunk_ids':[r['id'] for r in selected],
                    'cut_chunks':0,'evidence_recall':len(gold_hits)/len(q['gold']) if q['gold'] else None},
                  'ranking':[{'id':r['id'],'chapter':r['chapter'],'page_spans':r['metadata']['page_spans'],
                              'section':r['metadata'].get('section'),'fallback':r['metadata'].get('fallback'),
                              'similarity':r['similarity'],'gold_targets':sorted(relevant_targets(r,q)),
                              'text_preview':r['text'][:180]} for r in ranked]}
            details[strategy].append(item)
        print('EVALUATED_QUERY',ordinal+1,'/',len(queries),q['id'],flush=True)
    end_tags=client.get(args.ollama+'/api/tags');end_tags.raise_for_status()
    if not any(m.get('digest')==model['digest'] for m in end_tags.json()['models']):raise ValueError('Embedding model changed during benchmark')
    client.close()
    summary={s:aggregate(rows) for s,rows in details.items()}
    slices={}
    for name,ids in {'chapter3_fallback':{q['id'] for q in queries if q['chapter']==3},
                     'unresolved_text_regions':{q['id'] for q in queries if q.get('slice','').startswith('unresolved')}}.items():
        slices[name]={s:aggregate([d for d in rows if d['query_id'] in ids]) for s,rows in details.items()}
    contrasts={}
    by_id={s:{d['query_id']:d for d in rows} for s,rows in details.items()}
    for k in KS:
        contrasts[str(k)]={winner:[q['id'] for q in queries if q['gold']
            and by_id[winner][q['id']]['metrics']['recall'][str(k)]>0
            and by_id[loser][q['id']]['metrics']['recall'][str(k)]==0]
            for winner,loser in [('fixed','hierarchical'),('hierarchical','fixed')]}
    result={'method':{'embedding_model_requested':args.model,'model_resolved':model['name'],'model_digest':model['digest'],
        'dimensions':768,'document_prefix':'','query_prefix':'','retrieval':'FAISS IndexFlatIP on L2-normalized float32 vectors; exact cosine; global corpus of all six PDFs',
        'ks':KS,'timing_k':10,'faiss_threads':1,'search_repetitions':args.search_repetitions,
        'rerank':False,'filters':None,'context_budget':4800,'context_policy':'Ranked prefix of whole chunks; alias headers and separators count toward budget',
        'relevance':'Exact whitespace/NFC-normalized gold evidence contained in chunk, with matching source chapter and page. Macro evidence Recall@K; MRR full ranking and MRR@10.',
        'scope':'Small manually curated offline retrieval set; controls excluded from Recall/MRR. No generation, credits, DB, runtime change, or inference of duplicate-rate improvement.'},
        'inputs':inputs,'queries_sha256':sha(args.queries.read_bytes()),'dataset':dataset,
        'index_build_ms':build_ms,'unique_document_texts':len(unique),'document_embedding_ms_shared':embedding_ms,
        'embedding_calls':embedding_calls,'query_embedding_ms_p50':percentile(query_timings,50),'query_embedding_ms_p95':percentile(query_timings,95),
        'summary':summary,'slices':slices,'contrasts':contrasts,'details':details}
    (output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    lines=['# Local retrieval benchmark','',f'Model: {model["name"]}; digest: `{model["digest"]}`.',
           '',f'Answerable queries: {sum(bool(q["gold"]) for q in queries)}; controls: {sum(not q["gold"] for q in queries)}.',
           '', '| Strategy | Recall@1 | Recall@4 | Recall@10 | MRR | MRR@10 | Search P50/P95 ms | Context recall |',
           '|---|---:|---:|---:|---:|---:|---|---:|']
    for s,a in summary.items():
        lines.append(f'| {s} | {a["recall"]["1"]:.4f} | {a["recall"]["4"]:.4f} | {a["recall"]["10"]:.4f} | {a["mrr"]:.4f} | {a["mrr_at10"]:.4f} | {a["search_ms_p50"]:.4f} / {a["search_ms_p95"]:.4f} | {a["context_recall"]:.4f} |')
    lines+=['','Query embedding is shared across strategies and excluded from index-search times.',
            f'Query embedding P50/P95: {result["query_embedding_ms_p50"]:.2f}/{result["query_embedding_ms_p95"]:.2f} ms.',
            '', '## Exclusive hits at K=4',json.dumps(contrasts['4'],ensure_ascii=False,indent=2),
            '', '## Chapter 3 / unresolved slices',json.dumps(slices,ensure_ascii=False,indent=2),
            '', 'Whole-chunk context packing is benchmark-only. Existing runtime packer is unchanged.',
            'No reranker/metadata filtering was enabled. Stored rankings and gold evidence allow independent review.',
            'Controls only inspect retrieval; no answer or abstention model is executed. Missing text in images is not recovered.',
            'These results do not establish production readiness or reduced question duplication.']
    (output/'REPORT.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print('FINAL_SUMMARY',json.dumps(summary),flush=True)


if __name__=='__main__':
    root=Path(__file__).resolve().parents[2]
    p=argparse.ArgumentParser()
    p.add_argument('--pdf-dir',type=Path,default=root)
    p.add_argument('--queries',type=Path,default=Path(__file__).with_name('retrieval_queries.json'))
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--ollama',default='http://127.0.0.1:11434')
    p.add_argument('--model',default='nomic-embed-text')
    p.add_argument('--embedding-batch-size',type=int,default=8)
    p.add_argument('--search-repetitions',type=int,default=30)
    args=p.parse_args()
    if args.embedding_batch_size<1 or args.search_repetitions<1:p.error('Batch size/repetitions must be positive')
    run(args)
