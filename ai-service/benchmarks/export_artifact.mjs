import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';

const here=path.dirname(fileURLToPath(import.meta.url));
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1]};
const output=path.resolve(arg('--output','outputs/inference-benchmark-20261025/AI_Inference_Benchmark.xlsx'));
const input=arg('--input',null);
const schema=JSON.parse(await fs.readFile(path.join(here,'export-schema.json'),'utf8'));
const events=input?(await fs.readFile(input,'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse):[];
const wb=Workbook.create();
const names=['Job Summary','Inference Metrics','Resource Metrics','Question Quality','Comparison','Configuration'];
const sheets=Object.fromEntries(names.map(name=>[name,wb.worksheets.add(name)]));
const literal=v=>v==null?'N/A':typeof v==='string'?(v.match(/^[=+@-]/)?"'"+v.slice(0,32765):v.slice(0,32766)):v;
const aggregate=(samples,k,fn)=>{const a=samples.map(x=>x[k]).filter(x=>typeof x==='number');return a.length?fn(a):null};
const summary=[],inferences=[],resources=[],questions=[],config=[];
for(const e of events){
  const c=e.configuration,run=c.runId,rows=e.questions.filter(q=>q.candidate!==null),samples=e.resources;
  const legacy=e.legacy.map((v,i)=>(i===1||i===2)&&v?new Date(v):literal(v));
  summary.push([...legacy,...[
    c.inferenceBatchSize,c.checkpointBatchSize,c.modelName,c.modelDigest,run,c.caseId,c.temperature,c.seed,c.num_ctx,c.startCondition,
    e.inferences.length,e.retries,e.malformedResponses||e.inferences.some(c=>c.error)?null:rows.length,rows.filter(q=>typeof q.candidate==='object'&&!Array.isArray(q.candidate)).length,
    rows.filter(q=>q.decision!=='accepted').length,rows.filter(q=>q.decision.startsWith('duplicate')).length,
    e.regenerationRequests,null,null,null,e.retrievalSeconds,e.duplicateSeconds,e.inferences.reduce((n,x)=>n+x.wallSeconds,0),
    aggregate(samples,'gpuPercent',a=>a.reduce((n,x)=>n+x,0)/a.length),aggregate(samples,'gpuPercent',a=>Math.max(...a)),
    aggregate(samples,'vramMB',a=>Math.max(...a)),aggregate(samples,'availableRamMB',a=>Math.min(...a)),c.sampleSeconds,e.malformedResponses,c.acceptedAtStart??0].map(literal)]);
  for(const i of e.inferences){
    const sec=k=>typeof i[k]==='number'?i[k]/1e9:null;
    inferences.push([run,i.callId,i.wallSeconds,sec('load_duration'),sec('prompt_eval_duration'),sec('eval_duration'),i.prompt_eval_count,i.eval_count,null,i.done_reason,i.error,i.rawResponse,i.requestedQuestions].map(literal));
  }
  for(const s of samples)resources.push([run,...['elapsedSeconds','aiCpu','aiRamMB','ollamaCpu','ollamaRamMB','systemRamPercent','availableRamMB','gpuPercent','vramMB'].map(k=>s[k])].map(literal));
  for(const entry of e.questions){
    const q=entry.normalized??entry.candidate??{},options=q.options??[],answer=Number.isInteger(q.correctIndex)&&Array.isArray(options)?options[q.correctIndex]:null;
    questions.push([...[run,entry.callId,entry.decision,q.content,JSON.stringify(options),answer,q.cloId,q.bloom,q.evidenceQuote].map(literal),...Array(6).fill(null),literal(JSON.stringify(entry.candidate))]);
  }
  for(const [key,value] of Object.entries(c))config.push([run,key,literal(typeof value==='object'?JSON.stringify(value):value)]);
}
config.push(['Protocol','Status',events.length?'Measured records imported':'NOT RUN — prerequisites missing'],
 ['Protocol','Pilot requested', '3 questions in mode 1 and 3 questions in mode 3'],
 ['Protocol','Main requested','5 runs per mode; 9 questions/run; alternating AB / BA'],
 ['Protocol','Production default inference size',1],['Protocol','Checkpoint size',5],
 ['Protocol','Sampling comparison','Same temperature, seed, num_ctx and num_predict in both modes'],
 ['Protocol','Missing values','N/A; expert labels intentionally blank'],
 ['Protocol','Expert assessment','No expert labels supplied; no quality superiority conclusion'],
 ['Protocol','Data sources','Isolated harness research JSONL; raw records retained'],
 ['Protocol','Current prerequisites','Staging PostgreSQL and nomic-embed-text must be available before --run']);

function table(sheet,headers,rows){
  sheet.showGridLines=false;
  sheet.getRangeByIndexes(0,0,1,headers.length).values=[headers];
  if(rows.length)sheet.getRangeByIndexes(1,0,rows.length,headers.length).values=rows;
  const used=sheet.getRangeByIndexes(0,0,Math.max(2,rows.length+1),headers.length);
  used.format.font={name:'Arial',size:10};used.format.columnWidth=22;used.format.rowHeight=22;
  const head=sheet.getRangeByIndexes(0,0,1,headers.length);
  head.format={fill:'#24354B',font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},wrapText:true,rowHeight:52,verticalAlignment:'center',horizontalAlignment:'center'};
  sheet.freezePanes.freezeRows(1);sheet.freezePanes.freezeColumns(1);
  if(rows.length)sheet.tables.add(sheet.getRangeByIndexes(0,0,rows.length+1,headers.length),true,sheet.name.replaceAll(' ','')+'Data');
}
table(sheets['Job Summary'],schema.summary,summary);
table(sheets['Inference Metrics'],schema.inference,inferences);
table(sheets['Resource Metrics'],schema.resource,resources);
table(sheets['Question Quality'],schema.quality,questions);
table(sheets.Configuration,['Run ID','Setting','Value'],config);
sheets.Configuration.getRange('C1:C40').format.columnWidth=85;
sheets.Configuration.getRange('B1:B40').format.columnWidth=32;
sheets['Question Quality'].getRange('D:D').format.columnWidth=65;
sheets['Question Quality'].getRange('E:E').format.columnWidth=60;
sheets['Question Quality'].getRange('I:I').format.columnWidth=65;
if(questions.length)sheets['Question Quality'].getRange(`J2:O${questions.length+1}`).format.fill='#FFF3CE';
for(let i=0;i<summary.length;i++){
  const r=i+2,s=sheets['Job Summary'];
  s.getRange(`AL${r}:AN${r}`).formulas=[[
    `=IF(AND(ISNUMBER(AG${r}),AG${r}>0),(F${r}-AX${r})/AG${r},"N/A")`,
    `=IF(F${r}=AX${r},"N/A",I${r}/(F${r}-AX${r}))`,
    `=IF(I${r}=0,"N/A",60*(F${r}-AX${r})/I${r})`]];
}
if(summary.length){sheets['Job Summary'].getRange(`B2:C${summary.length+1}`).setNumberFormat('yyyy-mm-dd hh:mm:ss');sheets['Job Summary'].getRange(`AL2:AL${summary.length+1}`).setNumberFormat('0.0%')}
for(let i=0;i<inferences.length;i++){
  const r=i+2;sheets['Inference Metrics'].getRange(`I${r}`).formulas=[[`=IF(AND(ISNUMBER(F${r}),F${r}>0,ISNUMBER(H${r})),H${r}/F${r},"N/A")`]];
}
const comparison=sheets.Comparison;comparison.showGridLines=false;
comparison.getRange('A2').values=[['AI inference batching']];comparison.getRange('A2').format.font={name:'Arial',size:14,bold:true};
comparison.getRange('A3').values=[[events.length?'Main runs only; pilots excluded':'Chưa có phép đo thật. Không có số liệu giả.']];
comparison.getRange('A5:J5').values=[['Inference size','Main runs','Mean sec/valid','Sample std dev','P50 sec/valid','P95 sec/valid','Speed gain vs 1','Valid ratio','Peak AI RAM MB','Peak VRAM MB']];
comparison.getRange('A5:J5').format={fill:'#24354B',font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},rowHeight:48,wrapText:true,verticalAlignment:'center',horizontalAlignment:'center'};
comparison.getRange('A5:T30').format.columnWidth=18;
comparison.getRange('K5').values=[['Zero-valid runs']];comparison.getRange('K5').format={fill:'#24354B',font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},wrapText:true,verticalAlignment:'center',horizontalAlignment:'center'};
// Transparent helper ranges: each cell links to a main-run observation only.
const groups=[['M',1,'AM'],['N',3,'AM'],['O',1,'AL'],['P',3,'AL'],['Q',1,'N'],['R',3,'N'],['S',1,'AT'],['T',3,'AT'],['W',1,'AM','warm'],['X',3,'AM','warm'],['Y',1,'AM','cold'],['Z',3,'AM','cold']];
const last=Math.max(20,summary.length+2);
for(const [col,mode,source,condition] of groups){
  comparison.getRange(`${col}1`).values=[[`Mode ${mode}: ${source} ${condition??'all'}`]];
  const formulas=[];
  for(let row=2;row<=last;row++)formulas.push([`=IF(AND('Job Summary'!U${row}=${mode},LEFT('Job Summary'!Y${row},5)="main-"${condition?`,'Job Summary'!AD${row}="${condition}"`:''},ISNUMBER('Job Summary'!${source}${row})),'Job Summary'!${source}${row},"")`]);
  comparison.getRange(`${col}2:${col}${last}`).formulas=formulas;
}
for(const [row,mode,timeCol,ratioCol,ramCol,vramCol] of [[6,1,'M','O','Q','S'],[7,3,'N','P','R','T']]){
  comparison.getRange(`A${row}`).values=[[mode]];
  comparison.getRange(`K${row}`).formulas=[[`=COUNTIFS('Job Summary'!$U$2:$U$${last},A${row},'Job Summary'!$Y$2:$Y$${last},"main-*",'Job Summary'!$F$2:$F$${last},0)`]];
  comparison.getRange(`B${row}:J${row}`).formulas=[[
    `=COUNTIFS('Job Summary'!$U$2:$U$${last},A${row},'Job Summary'!$Y$2:$Y$${last},"main-*")`,
    `=IF(COUNT(${timeCol}2:${timeCol}${last})=0,"N/A",AVERAGE(${timeCol}2:${timeCol}${last}))`,
    `=IF(COUNT(${timeCol}2:${timeCol}${last})<2,"N/A",STDEV(${timeCol}2:${timeCol}${last}))`,
    `=IF(COUNT(${timeCol}2:${timeCol}${last})=0,"N/A",MEDIAN(${timeCol}2:${timeCol}${last}))`,
    `=IF(COUNT(${timeCol}2:${timeCol}${last})=0,"N/A",PERCENTILE(${timeCol}2:${timeCol}${last},0.95))`,
    `=IF(AND(ISNUMBER(C6),ISNUMBER(C${row}),C${row}>0),C6/C${row}-1,"N/A")`,
    `=IF(COUNT(${ratioCol}2:${ratioCol}${last})=0,"N/A",AVERAGE(${ratioCol}2:${ratioCol}${last}))`,
    `=IF(COUNT(${ramCol}2:${ramCol}${last})=0,"N/A",MAX(${ramCol}2:${ramCol}${last}))`,
    `=IF(COUNT(${vramCol}2:${vramCol}${last})=0,"N/A",MAX(${vramCol}2:${vramCol}${last}))`]];
}
comparison.getRange('A41').values=[['Cold / warm observations']];
comparison.getRange('A42:F42').values=[['Condition','Mode','Main runs','Mean sec/valid','P50 sec/valid','P95 sec/valid']];
comparison.getRange('A42:F42').format={fill:'#24354B',font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},wrapText:true,rowHeight:40,verticalAlignment:'center',horizontalAlignment:'center'};
for(const [r,condition,mode,col] of [[43,'warm',1,'W'],[44,'warm',3,'X'],[45,'cold',1,'Y'],[46,'cold',3,'Z']]){
  comparison.getRange(`A${r}:B${r}`).values=[[condition,mode]];
  comparison.getRange(`C${r}:F${r}`).formulas=[[
    `=COUNTIFS('Job Summary'!$U$2:$U$${last},B${r},'Job Summary'!$Y$2:$Y$${last},"main-*",'Job Summary'!$AD$2:$AD$${last},A${r})`,
    `=IF(COUNT(${col}2:${col}${last})=0,"N/A",AVERAGE(${col}2:${col}${last}))`,
    `=IF(COUNT(${col}2:${col}${last})=0,"N/A",MEDIAN(${col}2:${col}${last}))`,
    `=IF(COUNT(${col}2:${col}${last})=0,"N/A",PERCENTILE(${col}2:${col}${last},0.95))`]];
}
comparison.getRange('D43:F46').format.horizontalAlignment='right';
comparison.getRange('C6:F7').setNumberFormat('0.000');comparison.getRange('G6:H7').setNumberFormat('0.0%');
comparison.getRange('C6:K7').format.horizontalAlignment='right';
comparison.getRange('V5:V7').values=[['Mode'],['1 question'],['3 questions']];
for(const [title,range,from,to] of [['Seconds per valid question','C5:C7','A10','F23'],['Peak RAM / VRAM (MB)','I5:J7','G10','L23'],['Valid question ratio','H5:H7','A25','F38']]){
  const valueRanges=range==='I5:J7'?[comparison.getRange('I5:I7'),comparison.getRange('J5:J7')]:[comparison.getRange(range)];
  const chart=comparison.charts.add('bar',[comparison.getRange('V5:V7'),...valueRanges]);chart.title=title+(events.length?'':' — chưa đo');
  chart.titleTextStyle.typeface='Arial';chart.setPosition(from,to);
}
// Disposable calculation check only; restore all touched cells before export.
if(events.length===0){
  const s=sheets['Job Summary'];
  s.getRange('F2').values=[[3]];s.getRange('I2').values=[[30]];
  s.getRange('U2').values=[[1]];s.getRange('Y2').values=[['main-formula-check']];
  s.getRange('AG2').values=[[5]];s.getRange('AX2').values=[[0]];
  s.getRange('AL2:AM2').formulas=[['=F2/AG2','=I2/F2']];
  wb.recalculate();
  if(comparison.getRange('C6').values[0][0]!==10 || comparison.getRange('H6').values[0][0]!==0.6)throw new Error('Formula QA failed');
  s.getRange('A2:AX2').clear({applyTo:'contents'});
}
wb.recalculate();
await fs.mkdir(path.dirname(output),{recursive:true});
console.log((await wb.inspect({kind:'table',range:'Comparison!A5:J7',include:'values,formulas',tableMaxRows:3,tableMaxCols:10,maxChars:2000})).ndjson);
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#NULL!',options:{useRegex:true,maxResults:20},maxChars:1500})).ndjson);
for(const name of names){
  const range=name==='Comparison'?'A2:L47':name==='Configuration'?'A1:C11':'A1:H6';
  const blob=await wb.render({sheetName:name,range,scale:1,format:'png'});
  await fs.writeFile(path.join(path.dirname(output),name.replaceAll(' ','_')+'.png'),new Uint8Array(await blob.arrayBuffer()));
}
await (await SpreadsheetFile.exportXlsx(wb)).save(output);
console.log('Exported '+output);
