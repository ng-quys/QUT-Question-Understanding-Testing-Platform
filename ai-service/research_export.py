"""Runtime extension of the existing openpyxl exporter; keeps AI Jobs untouched.

Raw measurements also live in .research.jsonl. No inference/DB/network operations.
"""
import json
import os
from openpyxl import load_workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.styles import Font, PatternFill

EXTRA=['Inference batch size','Checkpoint batch size','Model name','Model digest','Run ID',
       'Document/CLO case ID','Temperature','Seed','num_ctx','Cold/warm start',
       'Qwen calls','Retry calls','Returned questions','JSON object candidates','Rejected questions',
       'Duplicate questions','Regeneration requests','Valid ratio','Seconds/valid question',
       'Valid questions/minute','RAG retrieval seconds','Duplicate checking seconds','Inference seconds',
       'GPU mean (%)','GPU peak (%)','VRAM peak (MB)','Available RAM min (MB)','Sample interval (s)',
       'Malformed responses','Accepted before resume']
INFERENCE=['Run ID','Call ID','Wall seconds','Load seconds','Prompt eval seconds','Generation seconds',
           'Prompt tokens','Output tokens','Output tokens/second','Done reason','Error','Raw response','Requested questions']
RESOURCE=['Run ID','Elapsed seconds','AI CPU (%)','AI RAM (MB)','Ollama CPU (%)','Ollama RAM (MB)',
          'System RAM (%)','Available RAM (MB)','GPU (%)','VRAM (MB)']
QUALITY=['Run ID','Call ID','Decision','Content','Options','Correct answer','CLO','Bloom','Evidence',
         'Evidence match type','Evidence failure reason','Evidence chunk alias','Evidence chunk ID','Context fingerprint',
         'Knowledge correct','CLO suitable','Bloom suitable','Document grounded','Wording quality',
         'Expert verdict','Raw candidate']


def value(v):
    # Treat model/user strings as literal Excel data, never formulas.
    if v is None:return 'N/A'
    if isinstance(v,str) and v.startswith(('=','+','-','@')):return "'"+v[:32765]
    return v[:32766] if isinstance(v,str) else v


def ensure_sheet(book,name,headers):
    if name not in book:
        s=book.create_sheet(name);s.append(headers);s.freeze_panes='A2'
        s.auto_filter.ref=f'A1:{s.cell(1,len(headers)).column_letter}1'
        for c in s[1]:c.font=Font(bold=True,color='FFFFFF');c.fill=PatternFill('solid',fgColor='24354B')
        for col in s.columns:s.column_dimensions[col[0].column_letter].width=22
    return book[name]


def append_research_workbook(path,event):
    from generation_telemetry import HEADERS
    book=load_workbook(path)
    summary=ensure_sheet(book,'Job Summary',HEADERS+EXTRA)
    inf=ensure_sheet(book,'Inference Metrics',INFERENCE)
    resources=ensure_sheet(book,'Resource Metrics',RESOURCE)
    quality=ensure_sheet(book,'Question Quality',QUALITY)
    cfg=ensure_sheet(book,'Configuration',['Run ID','Setting','Value'])
    conf=event['configuration'];run=conf['runId'];questions=event['questions'];calls=event['inferences'];samples=event['resources']
    candidates=[q for q in questions if q['candidate'] is not None]
    rejected=sum(q['decision']!='accepted' and not q['decision'].startswith('duplicate_') for q in candidates)
    duplicates=sum(q['decision'].startswith('duplicate') for q in candidates)
    def agg(key,fn):
        vals=[s[key] for s in samples if isinstance(s.get(key),(int,float))]
        return fn(vals) if vals else None
    summary.append([value(v) for v in event['legacy']+[
        conf.get('inferenceBatchSize'),conf.get('checkpointBatchSize'),conf.get('modelName'),conf.get('modelDigest'),
        run,conf.get('caseId'),conf.get('temperature'),conf.get('seed'),conf.get('num_ctx'),conf.get('startCondition'),
        len(calls),event['retries'],None if event['malformedResponses'] or any(c.get('error') for c in calls) else len(candidates),sum(isinstance(q['candidate'],dict) for q in candidates),
        rejected,duplicates,event.get('regenerationRequests'),None,None,None,event['retrievalSeconds'],event['duplicateSeconds'],
        sum(c['wallSeconds'] for c in calls),agg('gpuPercent',lambda x:sum(x)/len(x)),agg('gpuPercent',max),
        agg('vramMB',max),agg('availableRamMB',min),conf.get('sampleSeconds'),event['malformedResponses'],conf.get('acceptedAtStart',0)]])
    row=summary.max_row
    summary.cell(row,38,f'=IF(AND(ISNUMBER(AG{row}),AG{row}>0),(F{row}-AX{row})/AG{row},"N/A")')
    summary.cell(row,39,f'=IF(F{row}=AX{row},"N/A",I{row}/(F{row}-AX{row}))')
    summary.cell(row,40,f'=IF(I{row}=0,"N/A",60*(F{row}-AX{row})/I{row})')
    for call in calls:
        duration=lambda k:call[k]/1e9 if isinstance(call.get(k),(int,float)) else None
        inf.append([value(x) for x in [run,call['callId'],call['wallSeconds'],duration('load_duration'),
            duration('prompt_eval_duration'),duration('eval_duration'),call.get('prompt_eval_count'),call.get('eval_count'),
            None,call.get('done_reason'),call.get('error'),call.get('rawResponse'),call.get('requestedQuestions')]])
        r=inf.max_row;inf.cell(r,9,f'=IF(AND(ISNUMBER(F{r}),F{r}>0,ISNUMBER(H{r})),H{r}/F{r},"N/A")')
    for sample in samples:
        resources.append([value(x) for x in [run]+[sample.get(k) for k in ['elapsedSeconds','aiCpu','aiRamMB',
            'ollamaCpu','ollamaRamMB','systemRamPercent','availableRamMB','gpuPercent','vramMB']]])
    for candidate in questions:
        q=candidate.get('normalized') or candidate.get('candidate') or {}
        if not isinstance(q,dict):q={}
        options=q.get('options',[]);answer=q.get('correctIndex')
        answer=options[answer] if isinstance(options,list) and type(answer)is int and 0<=answer<len(options) else None
        quality.append([value(x) for x in [run,candidate.get('callId'),candidate['decision'],q.get('content'),
            json.dumps(options,ensure_ascii=False),answer,q.get('cloId'),q.get('bloom'),q.get('evidenceQuote'),
            candidate.get('evidenceMatchType'),candidate.get('evidenceFailureReason'),candidate.get('evidenceChunkAlias'),
            candidate.get('evidenceChunkId'),candidate.get('contextFingerprint')]]+
            [None]*6+[value(json.dumps(candidate.get('candidate'),ensure_ascii=False))])
    for k,v in conf.items():cfg.append([value(run),value(k),value(json.dumps(v,ensure_ascii=False) if isinstance(v,(list,dict)) else v)])
    for manifest in event.get('retrievalManifests') or []:
        cfg.append([value(run),value(f"retrievalManifest.call-{manifest.get('callId')}.clo-{manifest.get('cloId')}"),
                    value(json.dumps(manifest,ensure_ascii=False))])
    comparison=ensure_sheet(book,'Comparison',['Inference batch','Main runs','Mean seconds/valid',
        'Std dev','P50','P95','Speed improvement vs 1','Mean valid ratio','Peak AI RAM (MB)','Peak VRAM (MB)','Zero-valid runs'])
    # Exclude pilots/uncontrolled Production jobs: only explicitly identified main runs.
    # FILTER is intentional: modern Excel required for grouped percentiles.
    for r,mode in [(2,1),(3,3)]:
        comparison.cell(r,1,mode)
        filt=f"('Job Summary'!$U$2:$U$10000=A{r})*(LEFT('Job Summary'!$Y$2:$Y$10000,5)=\"main-\")"
        data=f"_xlfn._xlws.FILTER('Job Summary'!$AM$2:$AM$10000,{filt})"
        comparison.cell(r,11,f'=COUNTIFS(\'Job Summary\'!$U$2:$U$10000,A{r},\'Job Summary\'!$Y$2:$Y$10000,"main-*",\'Job Summary\'!$F$2:$F$10000,0)')
        comparison.cell(r,2,f'=COUNTIFS(\'Job Summary\'!$U$2:$U$10000,A{r},\'Job Summary\'!$Y$2:$Y$10000,"main-*")')
        for c,fn in [(3,'AVERAGE'),(4,'STDEV.S'),(5,'MEDIAN')]:comparison.cell(r,c,f'=IF(B{r}=0,"N/A",IFERROR({fn}({data}),"N/A"))')
        comparison.cell(r,6,f'=IF(B{r}=0,"N/A",IFERROR(PERCENTILE.INC({data},0.95),"N/A"))')
        comparison.cell(r,7,f'=IF(AND(ISNUMBER(C2),ISNUMBER(C{r}),C{r}>0),C2/C{r}-1,"N/A")')
        for c,source,fn in [(8,'AL','AVERAGE'),(9,'N','MAX'),(10,'AT','MAX')]:
            comparison.cell(r,c,f'=IF(B{r}=0,"N/A",IFERROR({fn}(_xlfn._xlws.FILTER(\'Job Summary\'!${source}$2:${source}$10000,{filt})),"N/A"))')
    for c,label in enumerate(['Condition','Mode','Main runs','Mean sec/valid','P50 sec/valid','P95 sec/valid'],1):comparison.cell(42,c,label)
    for r,condition,mode in [(43,'warm',1),(44,'warm',3),(45,'cold',1),(46,'cold',3)]:
        comparison.cell(r,1,condition);comparison.cell(r,2,mode)
        selection=f"('Job Summary'!$U$2:$U$10000=B{r})*(LEFT('Job Summary'!$Y$2:$Y$10000,5)=\"main-\")*('Job Summary'!$AD$2:$AD$10000=A{r})"
        comparison.cell(r,3,f'=COUNTIFS(\'Job Summary\'!$U$2:$U$10000,B{r},\'Job Summary\'!$Y$2:$Y$10000,"main-*",\'Job Summary\'!$AD$2:$AD$10000,A{r})')
        data=f"_xlfn._xlws.FILTER('Job Summary'!$AM$2:$AM$10000,{selection})"
        for c,fn in [(4,'AVERAGE'),(5,'MEDIAN')]:comparison.cell(r,c,f'=IF(C{r}=0,"N/A",IFERROR({fn}({data}),"N/A"))')
        comparison.cell(r,6,f'=IF(C{r}=0,"N/A",IFERROR(PERCENTILE.INC({data},0.95),"N/A"))')
    if not comparison._charts:
        for title,start,end,anchor in [('Seconds per valid question',3,3,'A7'),('Peak RAM and VRAM (MB)',9,10,'L7'),('Valid question ratio',8,8,'A23')]:
            chart=BarChart();chart.title=title;chart.add_data(Reference(comparison,min_col=start,max_col=end,min_row=1,max_row=3),titles_from_data=True)
            chart.set_categories(Reference(comparison,min_col=1,min_row=2,max_row=3));comparison.add_chart(chart,anchor)
    temporary=path.with_name(path.stem+'.research.tmp.xlsx');book.save(temporary);book.close();os.replace(temporary,path)
