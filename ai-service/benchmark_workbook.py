"""Idempotent six-sheet Excel writer for real AI Generator telemetry."""
import json
import os
from pathlib import Path
from openpyxl import Workbook, load_workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

SUMMARY=['Execution token','Bắt đầu','Kết thúc','Trạng thái','Số câu yêu cầu','Số câu hợp lệ','Checkpoint batch size','Thời gian chờ (giây)','Thời gian xử lý (giây)','Trung bình giây/câu','Tốc độ câu/phút','AI CPU trung bình (%)','AI CPU cao nhất (%)','AI RAM cao nhất (MB)','Ollama CPU trung bình (%)','Ollama CPU cao nhất (%)','Ollama RAM cao nhất (MB)','RAM toàn máy cao nhất (%)','Số lần tiếp tục','Lỗi','Job ID','Inference batch size','Model name','Model digest','Run ID','Document/CLO case ID','Temperature','Seed','num_ctx','Cold/warm start','Qwen calls','Retry calls','Số câu sinh ra','JSON object candidates','Số câu bị loại','Duplicate questions','Regeneration requests','Valid ratio','Seconds/valid question','Valid questions/minute','RAG retrieval seconds','Duplicate checking seconds','Inference seconds','Prompt tokens','Output tokens','GPU mean (%)','GPU peak (%)','VRAM peak (MB)','Available RAM min (MB)','Sample interval (s)','Malformed responses','Accepted before resume','Tổng thời gian (giây)']
INFERENCE=['Run ID','Call ID','Wall seconds','Load seconds','Prompt eval seconds','Generation seconds','Prompt tokens','Output tokens','Output tokens/second','Done reason','Error','Raw response','Requested questions']
RESOURCE=['Run ID','Elapsed seconds','AI CPU (%)','AI RAM (MB)','Ollama CPU (%)','Ollama RAM (MB)','System RAM (%)','Available RAM (MB)','GPU (%)','VRAM (MB)']
QUALITY=['Run ID','Call ID','Decision','Rejection reason code','Rejection reason','Content','Options','Correct answer','CLO','Bloom','Evidence','Evidence match type','Evidence failure reason','Evidence chunk alias','Evidence chunk ID','Context fingerprint','Knowledge correct','CLO suitable','Bloom suitable','Document grounded','Wording quality','Expert verdict','Raw candidate']
CONFIG=['Run ID','Setting','Value']
COMPARISON=['Inference batch','Runs','Mean seconds/valid','Mean valid ratio','Peak AI RAM (MB)','Peak VRAM (MB)','Zero-valid runs']
SHEET_HEADERS={'Job Summary':SUMMARY,'Inference Metrics':INFERENCE,'Resource Metrics':RESOURCE,'Question Quality':QUALITY,'Comparison':COMPARISON,'Configuration':CONFIG}
HEADER_ALIASES={'Execution token':'Job token','Checkpoint batch size':'Batch size',
                'Số câu sinh ra':'Returned questions','Số câu bị loại':'Rejected questions'}
REJECTION_REASONS={
    'response_ValueError':'Phản hồi Qwen không phải JSON hợp lệ hoặc thiếu mảng questions hợp lệ.',
    'response_HTTPError':'Lỗi HTTP khi gọi Qwen nên phản hồi không thể đánh giá.',
    'response_count':'Số câu trong phản hồi không đúng số lượng yêu cầu của inference batch.',
    'over_limit':'Câu vượt quá số lượng còn cần hoặc tổng số câu được yêu cầu.',
    'validation:object':'Ứng viên không phải một JSON object câu hỏi.',
    'validation:options':'Thiếu đúng 4 phương án hoặc có phương án rỗng/sai kiểu dữ liệu.',
    'validation:distinct_options':'Bốn phương án không khác nhau.',
    'validation:correctIndex':'Chỉ số đáp án đúng thiếu, sai kiểu hoặc ngoài phạm vi 0–3.',
    'validation:CLO':'Mã CLO của câu không khớp CLO đang được yêu cầu.',
    'validation:Bloom':'Mức Bloom thiếu hoặc không thuộc remember/understand/apply.',
    'validation:content':'Nội dung câu hỏi bị thiếu hoặc rỗng.',
    'validation:explanation':'Phần giải thích đáp án bị thiếu hoặc rỗng.',
    'validation:evidenceQuote':'Trích dẫn nguồn bị thiếu hoặc rỗng.',
    'validation:evidence_length':'Trích dẫn nguồn ngắn hơn 20 ký tự.',
    'validation:evidence_source':'Trích dẫn không xuất hiện nguyên văn trong ngữ cảnh tài liệu.',
    'validation:unknown':'Câu không đạt validation nhưng không xác định được quy tắc cụ thể.',
    'support':'Đáp án/giải thích không đạt ngưỡng tương đồng với bằng chứng nguồn.',
    'duplicate_exact':'Nội dung câu hỏi trùng chính xác với câu đã chấp nhận trong job.',
    'duplicate_semantic':'Nội dung câu hỏi bị kiểm tra trùng ngữ nghĩa đánh dấu là nghi trùng.',
    'not_evaluated':'Ứng viên chưa được đánh giá vì pipeline kết thúc trước bước validation.'}

def rejection(decision):
    if decision=='accepted':return 'N/A','Được chấp nhận.'
    code=decision or 'unknown'
    return code,REJECTION_REASONS.get(code,'Bị loại theo mã quyết định của pipeline; chưa có diễn giải chuyên biệt.')

def safe(item):
    if item is None:return 'N/A'
    if isinstance(item,str) and item.startswith(('=','+','-','@')):return "'"+item[:32765]
    return item[:32766] if isinstance(item,str) else item

def _style(sheet,headers):
    sheet.append(headers);sheet.freeze_panes='A2';sheet.auto_filter.ref=f'A1:{get_column_letter(len(headers))}1'
    for cell in sheet[1]:cell.font=Font(bold=True,color='FFFFFF');cell.fill=PatternFill('solid',fgColor='24354B')
    for index,header in enumerate(headers,1):sheet.column_dimensions[get_column_letter(index)].width=min(34,max(12,len(header)+2))

def new_book():
    book=Workbook();book.remove(book.active)
    for name,headers in SHEET_HEADERS.items():_style(book.create_sheet(name),headers)
    _comparison(book);return book

def _migrate_sheet(book,name,headers):
    old=book[name];old_headers=[c.value for c in old[1]]
    rows=[dict(zip(old_headers,row)) for row in old.iter_rows(min_row=2,values_only=True)]
    position=book.sheetnames.index(name);del book[name];sheet=book.create_sheet(name,position);_style(sheet,headers)
    for row in rows:
        reason_code,reason_text=rejection(row.get('Decision'))
        derived={'Rejection reason code':reason_code,'Rejection reason':reason_text}
        sheet.append([derived.get(header,row.get(header,row.get(HEADER_ALIASES.get(header),'N/A'))) for header in headers])

def open_book(path):
    if not path.exists():return new_book()
    book=load_workbook(path)
    for name in list(book.sheetnames):
        if name not in SHEET_HEADERS:del book[name]
    for name,headers in SHEET_HEADERS.items():
        if name not in book:_style(book.create_sheet(name),headers)
        elif [c.value for c in book[name][1]]!=headers:
            if name=='Comparison':
                position=book.sheetnames.index(name);del book[name];_style(book.create_sheet(name,position),headers)
            else:_migrate_sheet(book,name,headers)
    book._sheets=[book[name] for name in SHEET_HEADERS]
    return book

def _remove_run(sheet,run_id):
    for row in range(sheet.max_row,1,-1):
        if sheet.cell(row,1).value==run_id:sheet.delete_rows(row)

def _summary(event):
    legacy=(list(event.get('legacy') or [])+['N/A']*20)[:20];conf=event.get('configuration') or {}
    calls=event.get('inferences') or [];samples=event.get('resources') or [];questions=event.get('questions') or []
    candidates=[q for q in questions if q.get('candidate') is not None]
    def agg(key,fn):
        values=[sample[key] for sample in samples if isinstance(sample.get(key),(int,float))]
        return fn(values) if values else None
    accepted=legacy[5] if isinstance(legacy[5],(int,float)) else None;processing=legacy[8] if isinstance(legacy[8],(int,float)) else None
    started,ended=event.get('startedEpoch'),event.get('endedEpoch')
    total=ended-started+legacy[7] if all(isinstance(x,(int,float)) for x in (started,ended,legacy[7])) else None
    prompt=sum(call.get('prompt_eval_count') for call in calls if isinstance(call.get('prompt_eval_count'),(int,float)))
    output=sum(call.get('eval_count') for call in calls if isinstance(call.get('eval_count'),(int,float)))
    measured=bool(event.get('metricsAvailable'))
    extras=[event.get('jobId'),conf.get('inferenceBatchSize'),conf.get('modelName'),conf.get('modelDigest'),conf.get('runId'),conf.get('caseId'),conf.get('temperature'),conf.get('seed'),conf.get('num_ctx'),conf.get('startCondition'),len(calls) if measured else None,event.get('retries'),len(candidates) if measured else None,sum(isinstance(q.get('candidate'),dict) for q in candidates) if measured else None,sum(q.get('decision')!='accepted' for q in questions) if measured else None,sum(str(q.get('decision','')).startswith('duplicate') for q in questions) if measured else None,event.get('regenerationRequests'),accepted/len(candidates) if measured and accepted is not None and candidates else None,processing/accepted if processing is not None and accepted else None,accepted*60/processing if processing and accepted is not None else None,event.get('retrievalSeconds'),event.get('duplicateSeconds'),sum(call.get('wallSeconds',0) for call in calls) if calls else None,prompt if calls else None,output if calls else None,agg('gpuPercent',lambda x:sum(x)/len(x)),agg('gpuPercent',max),agg('vramMB',max),agg('availableRamMB',min),conf.get('sampleSeconds'),event.get('malformedResponses'),conf.get('acceptedAtStart'),total]
    return [safe(value) for value in legacy+extras]

def upsert(book,event):
    summary=book['Job Summary'];token=str((event.get('legacy') or ['N/A'])[0]);job_id=safe(event.get('jobId'));target=None
    for row in range(2,summary.max_row+1):
        if str(summary.cell(row,1).value)==token and str(summary.cell(row,21).value)==str(job_id):target=row;break
    if target is None:
        for row in range(2,summary.max_row+1):
            if str(summary.cell(row,1).value)==token and summary.cell(row,21).value in (None,'N/A'):
                target=row;break
    values=_summary(event)
    if target is None:summary.append(values)
    elif not event.get('metricsAvailable'):
        # A DB/registry snapshot enriches identity and lifecycle only. Never erase
        # measurements that were already captured by the live sampler.
        columns=(1,2,3,4,5,6,7,19,20,21)
        if summary.cell(target,4).value in ('succeeded','failed','cancelled') and values[3]=='unknown':
            columns=(1,21)
        for column in columns:summary.cell(target,column,values[column-1])
    else:
        for column,item in enumerate(values,1):summary.cell(target,column,item)
    conf=event.get('configuration') or {};run=conf.get('runId')
    if not run:return
    for name in ('Inference Metrics','Resource Metrics','Question Quality','Configuration'):_remove_run(book[name],run)
    for call in event.get('inferences') or []:
        duration=lambda key:call[key]/1e9 if isinstance(call.get(key),(int,float)) else None
        evaluation=duration('eval_duration');output=call.get('eval_count')
        book['Inference Metrics'].append([safe(x) for x in [run,call.get('callId'),call.get('wallSeconds'),duration('load_duration'),duration('prompt_eval_duration'),evaluation,call.get('prompt_eval_count'),output,output/evaluation if output is not None and evaluation else None,call.get('done_reason'),call.get('error'),call.get('rawResponse'),call.get('requestedQuestions')]])
    for sample in event.get('resources') or []:book['Resource Metrics'].append([safe(x) for x in [run]+[sample.get(key) for key in ['elapsedSeconds','aiCpu','aiRamMB','ollamaCpu','ollamaRamMB','systemRamPercent','availableRamMB','gpuPercent','vramMB']]])
    for candidate in event.get('questions') or []:
        question=candidate.get('normalized') or candidate.get('candidate') or {};question=question if isinstance(question,dict) else {};options=question.get('options',[]);answer=question.get('correctIndex');answer=options[answer] if isinstance(options,list) and type(answer)is int and 0<=answer<len(options) else None
        reason_code,reason_text=rejection(candidate.get('decision'))
        book['Question Quality'].append([safe(x) for x in [run,candidate.get('callId'),candidate.get('decision'),reason_code,reason_text,question.get('content'),json.dumps(options,ensure_ascii=False),answer,question.get('cloId'),question.get('bloom'),question.get('evidenceQuote'),candidate.get('evidenceMatchType'),candidate.get('evidenceFailureReason'),candidate.get('evidenceChunkAlias'),candidate.get('evidenceChunkId'),candidate.get('contextFingerprint')]]+[None]*6+[safe(json.dumps(candidate.get('candidate'),ensure_ascii=False))])
    for key,item in conf.items():book['Configuration'].append([safe(run),safe(key),safe(json.dumps(item,ensure_ascii=False) if isinstance(item,(list,dict)) else item)])
    for manifest in event.get('retrievalManifests') or []:
        book['Configuration'].append([safe(run),safe(f"retrievalManifest.call-{manifest.get('callId')}.clo-{manifest.get('cloId')}"),
                                      safe(json.dumps(manifest,ensure_ascii=False))])

def _comparison(book):
    sheet=book['Comparison']
    if sheet.max_row>3:sheet.delete_rows(4,sheet.max_row-3)
    for row,mode in [(2,1),(3,3)]:
        sheet.cell(row,1,mode);sheet.cell(row,2,f'=COUNTIF(\'Job Summary\'!$V$2:$V$10000,A{row})');sheet.cell(row,3,f'=IFERROR(AVERAGEIF(\'Job Summary\'!$V$2:$V$10000,A{row},\'Job Summary\'!$AM$2:$AM$10000),"N/A")');sheet.cell(row,4,f'=IFERROR(AVERAGEIF(\'Job Summary\'!$V$2:$V$10000,A{row},\'Job Summary\'!$AL$2:$AL$10000),"N/A")');sheet.cell(row,5,f'=IFERROR(MAXIFS(\'Job Summary\'!$N$2:$N$10000,\'Job Summary\'!$V$2:$V$10000,A{row}),"N/A")');sheet.cell(row,6,f'=IFERROR(MAXIFS(\'Job Summary\'!$AV$2:$AV$10000,\'Job Summary\'!$V$2:$V$10000,A{row}),"N/A")');sheet.cell(row,7,f'=COUNTIFS(\'Job Summary\'!$V$2:$V$10000,A{row},\'Job Summary\'!$F$2:$F$10000,0)')
    if len(sheet._charts)!=3:
        sheet._charts=[]
        for title,start,end,anchor in [('Seconds per valid question',3,3,'A6'),
                                       ('Peak RAM and VRAM (MB)',5,6,'J6'),
                                       ('Valid question ratio',4,4,'A22')]:
            chart=BarChart();chart.title=title
            chart.add_data(Reference(sheet,min_col=start,max_col=end,min_row=1,max_row=3),titles_from_data=True)
            chart.set_categories(Reference(sheet,min_col=1,min_row=2,max_row=3));sheet.add_chart(chart,anchor)

def _repair_factual_summaries(book):
    """Fill recoverable facts from workbook details; never synthesize measurements."""
    summary=book['Job Summary'];inference=book['Inference Metrics']
    calls={}
    for row in inference.iter_rows(min_row=2,values_only=True):
        run=row[0]
        if run in (None,'N/A'):continue
        item=calls.setdefault(run,{'prompt':0,'output':0,'promptMeasured':False,'outputMeasured':False})
        if isinstance(row[6],(int,float)):item['prompt']+=row[6];item['promptMeasured']=True
        if isinstance(row[7],(int,float)):item['output']+=row[7];item['outputMeasured']=True
    for row in range(2,summary.max_row+1):
        run=summary.cell(row,25).value;item=calls.get(run)
        if item and summary.cell(row,44).value in (None,'N/A') and item['promptMeasured']:
            summary.cell(row,44,item['prompt'])
        if item and summary.cell(row,45).value in (None,'N/A') and item['outputMeasured']:
            summary.cell(row,45,item['output'])
        waiting,processing=summary.cell(row,8).value,summary.cell(row,9).value
        accepted,generated=summary.cell(row,6).value,summary.cell(row,33).value
        if isinstance(accepted,(int,float)) and isinstance(generated,(int,float)) and generated>0 and isinstance(summary.cell(row,38).value,str) and summary.cell(row,38).value.startswith('='):
            summary.cell(row,38,accepted/generated)
        if isinstance(accepted,(int,float)) and accepted>0 and isinstance(processing,(int,float)):
            if isinstance(summary.cell(row,39).value,str) and summary.cell(row,39).value.startswith('='):summary.cell(row,39,processing/accepted)
            if isinstance(summary.cell(row,40).value,str) and summary.cell(row,40).value.startswith('='):summary.cell(row,40,accepted*60/processing if processing else None)
        if summary.cell(row,53).value in (None,'N/A') and all(isinstance(x,(int,float)) for x in (waiting,processing)):
            summary.cell(row,53,waiting+processing)

def write(path,events):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True);book=open_book(path)
    for event in events:upsert(book,event)
    _repair_factual_summaries(book);_comparison(book);temporary=path.with_name(f'{path.stem}.{os.getpid()}.tmp.xlsx')
    try:book.save(temporary);book.close();os.replace(temporary,path)
    finally:
        if temporary.exists():temporary.unlink(missing_ok=True)
