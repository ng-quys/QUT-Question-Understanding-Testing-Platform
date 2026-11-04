import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
const base=path.join(path.dirname(fileURLToPath(import.meta.url)),'semantic-evaluation-20261026');
const d=JSON.parse(await fs.readFile(path.join(base,'results.json'),'utf8'));
const wb=Workbook.create();
const sheets=Object.fromEntries(['Summary','Pair results','Errors','Threshold analysis','Method'].map(n=>[n,wb.worksheets.add(n)]));
function table(name,headers,rows,widths){
 const s=sheets[name];s.showGridLines=false;
 s.getRangeByIndexes(0,0,rows.length+1,headers.length).values=[headers,...rows];
 const all=s.getRangeByIndexes(0,0,rows.length+1,headers.length);all.format.font={name:'Arial',size:10};all.format.verticalAlignment='center';
 const h=s.getRangeByIndexes(0,0,1,headers.length);h.format.fill='#243B53';h.format.font={bold:true,color:'#FFFFFF'};h.format.rowHeight=30;h.format.wrapText=true;
 widths.forEach((v,i)=>s.getRangeByIndexes(0,i,rows.length+1,1).format.columnWidth=v);
 s.freezePanes.freezeRows(1);return s;
}
const notes={
 PAIR0010:'Tình huống gần như giống nhau nhưng phiên bản Windows 2003 và 2008 khác nhau. Giữ label=0 theo tham chiếu.',
 PAIR0046:'Cùng mẫu câu nhưng số người dùng 13 và 20 khác nhau; embedding ít phân biệt ràng buộc định lượng.',
 PAIR0049:'Đổi hướng so sánh: failover thay vì NLB và NLB thay vì failover; cosine cao dù yêu cầu khác.',
 PAIR0059:'Đối tượng cần hỏi khác nhau: /etc/passwd và /etc/shadow.',
 PAIR0063:'Cùng mẫu hỏi viết tắt nhưng thuật ngữ NIS và SSH khác nhau.',
 PAIR0065:'Khác mục tiêu: liệt kê thông tin đầy đủ và liệt kê file ẩn.',
 PAIR0066:'Khác mục tiêu: liệt kê thông tin đầy đủ và liệt kê file ẩn.',
 PAIR0080:'PPID và PPIUD khác ký tự. Theo label=0 đây là FP; không tự sửa thuật ngữ hoặc nhãn.',
 PAIR0087:'Cùng mẫu hỏi port nhưng dịch vụ SMTP và WWW/HTTP khác nhau.',
 PAIR0130:'Cùng thao tác reset mật khẩu cho username sapa; thêm bối cảnh tên người, diễn đạt dài và lỗi lặp từ khiến cosine dưới 0.85. Đây là nhận xét nội dung, không chứng minh nguyên nhân bên trong model.',
 PAIR0134:'Cùng vấn đề tạo partition thứ 5 sau 4 partition; câu thứ hai bổ sung bối cảnh cài Linux và dài hơn. Cosine dưới 0.85 dù label=1.'
};
const tokens=t=>new Set(t.toLowerCase().match(/[\p{L}\p{N}_./:-]+/gu)||[]);
function delta(a,b){const x=tokens(a),y=tokens(b);return [...x].filter(t=>!y.has(t)).join(', ');}
const rows=d.rows.map(r=>[r.source_row,r.pair_id,r.question_id_1,r.question_id_2,r.question_1,r.question_2,r.label,r.cosine,null,null,r.duplicate_pair_rows.join(', '),r.issues.join(', ')]);
const ps=table('Pair results',['Source row','Pair ID','Question ID 1','Question ID 2','Question 1','Question 2','Reference label','Cosine','Prediction >= 0.85','Outcome','Repeated pair rows','Data issues'],rows,[12,15,16,16,85,85,17,16,20,12,20,20]);
for(let i=2;i<=501;i++){ps.getRange(`I${i}:J${i}`).formulas=[[`=IF(H${i}>=Summary!$B$5,1,0)`,`=IF(G${i}=1,IF(I${i}=1,"TP","FN"),IF(I${i}=1,"FP","TN"))`]];}
ps.getRange('H2:H501').setNumberFormat('0.000000');ps.getRange('E2:F501').format.wrapText=true;
d.rows.forEach((r,i)=>ps.getRange(`A${i+2}:L${i+2}`).format.rowHeight=Math.min(409,Math.max(42,Math.ceil(Math.max(r.question_1.length,r.question_2.length)/90)*13)));
const err=d.rows.filter(r=>['FP','FN'].includes(r.outcome));
const es=table('Errors',['Pair ID','Source row','Type','Label','Prediction','Cosine','Question 1','Question 2','Content analysis','Tokens only in Q1','Tokens only in Q2'],err.map(r=>[r.pair_id,r.source_row,r.outcome,r.label,r.prediction,r.cosine,r.question_1,r.question_2,notes[r.pair_id]||(r.outcome==='FP'?'Label=0 nhưng cosine >= 0.85. Các từ khác biệt bên cạnh giúp đối chiếu nội dung; chưa kết luận nguyên nhân riêng cho cặp này.':'Label=1 nhưng cosine < 0.85.'),delta(r.question_1,r.question_2),delta(r.question_2,r.question_1)]),[15,12,10,10,12,16,85,85,65,45,45]);
es.getRange(`F2:F${err.length+1}`).setNumberFormat('0.000000');es.getRange(`G2:K${err.length+1}`).format.wrapText=true;
err.forEach((r,i)=>es.getRange(`A${i+2}:K${i+2}`).format.rowHeight=Math.min(409,Math.max(65,Math.ceil(Math.max(r.question_1.length,r.question_2.length)/90)*13)));
const ss=sheets.Summary;ss.showGridLines=false;ss.tabColor='#243B53';
ss.getRange('A2').values=[['ExamFlow — Semantic duplicate evaluation']];ss.getRange('A2').format.font={name:'Arial',size:15,bold:true};
ss.getRange('A4:B15').values=[['Metric','Result'],['Threshold',.85],['Valid pairs',500],['TP',null],['TN',null],['FP',null],['FN',null],['Accuracy',null],['Precision',null],['Recall',null],['F1-score',null],['Reference positives',89]];
for(const [cell,type] of [['B7','TP'],['B8','TN'],['B9','FP'],['B10','FN']])ss.getRange(cell).formulas=[[`=COUNTIFS('Pair results'!$J$2:$J$501,"${type}")`]];
ss.getRange('B11:B14').formulas=[['=(B7+B8)/B6'],['=IF(B7+B9=0,"n.a.",B7/(B7+B9))'],['=IF(B7+B10=0,"n.a.",B7/(B7+B10))'],['=IF(2*B7+B9+B10=0,"n.a.",2*B7/(2*B7+B9+B10))']];
ss.getRange('B11:B14').setNumberFormat('0.00%');ss.getRange('B5').setNumberFormat('0.00');
ss.getRange('D4:F6').values=[['Actual / Predicted','0: not duplicate','1: duplicate'],['0: not duplicate',null,null],['1: duplicate',null,null]];
ss.getRange('E5:F6').formulas=[['=B8','=B9'],['=B10','=B7']];
ss.getRange('D9:F14').values=[['Finding','Value','Interpretation'],['False positives',164,'Many negatives exceed 0.85'],['False negatives',2,'PAIR0130 and PAIR0134'],['Label 0 / Label 1','411 / 89','User labels only'],['Missing / repeated pairs','0 / 0','500 valid pairs; 487 unique texts'],['Majority-class accuracy',.822,'Always predicting 0; recall for duplicates = 0']];
ss.getRange('E14').setNumberFormat('0.00%');
ss.getRange('A18:F20').values=[['Scope','Fixed threshold 0.85; threshold sweep is descriptive only',null,null,null,null],['Input',d.metadata.source+' — first worksheet, label column only',null,null,null,null],['Limitation','Shared questions across pairs; pair observations are not fully independent',null,null,null,null]];
ss.getRange('A4:A20').format.columnWidth=28;ss.getRange('B4:B20').format.columnWidth=22;ss.getRange('C4:C20').format.columnWidth=3;ss.getRange('D4:D20').format.columnWidth=32;ss.getRange('E4:E20').format.columnWidth=24;ss.getRange('F4:F20').format.columnWidth=50;
ss.getRange('A4:B4').format.fill='#243B53';ss.getRange('A4:B4').format.font={color:'#FFFFFF',bold:true};ss.getRange('D4:F4').format.fill='#243B53';ss.getRange('D4:F4').format.font={color:'#FFFFFF',bold:true};ss.getRange('D9:F9').format.fill='#E4EAF0';ss.getRange('A4:F20').format.rowHeight=24;
const ts=table('Threshold analysis',['Threshold','N','TP','TN','FP','FN','Accuracy','Precision','Recall','F1-score','Use'],d.sweep.map(r=>[r.threshold,500,null,null,null,null,null,null,null,null,'Descriptive on evaluation set only']),[14,10,10,10,10,10,16,16,16,16,48]);
for(let i=2;i<=22;i++){
 const label="'Pair results'!$G$2:$G$501",score="'Pair results'!$H$2:$H$501";
 ts.getRange(`C${i}:J${i}`).formulas=[[`=COUNTIFS(${label},1,${score},">="&A${i})`,`=COUNTIFS(${label},0,${score},"<"&A${i})`,`=COUNTIFS(${label},0,${score},">="&A${i})`,`=COUNTIFS(${label},1,${score},"<"&A${i})`,`=(C${i}+D${i})/B${i}`,`=IF(C${i}+E${i}=0,"n.a.",C${i}/(C${i}+E${i}))`,`=IF(C${i}+F${i}=0,"n.a.",C${i}/(C${i}+F${i}))`,`=IF(2*C${i}+E${i}+F${i}=0,"n.a.",2*C${i}/(2*C${i}+E${i}+F${i}))`]];
}ts.getRange('G2:J22').setNumberFormat('0.00%');ts.getRange('A2:A22').setNumberFormat('0.00');
const method=[...Object.entries(d.metadata).map(([k,v])=>[k,v]),['reference_label_definition','1 = duplicate, 0 = not duplicate'],['label_policy','Only label from first worksheet; no AI suggested labels, review sheets or label corrections'],['duplicate_policy','Exact unordered question-text pair groups checked; all valid records retained'],['scope_of_claim','Cosine semantic component only, not complete Production deduplication including exact match and bank retrieval'],['threshold_selection','No selected optimal threshold, no independent performance claim. Future tuning requires separate validation and question-disjoint test data.'],['error_analysis','Specific notes are qualitative content observations; token differences are lexical aids, not causal explanations. Full 166 misclassifications included.'],['blank_rows','499 fully empty formatted rows ignored'],['production_verification','Source code main.py _embed_question / _cosine and sync worker vector_for verified. Local Ollama digest checked before/after. Live Production deployment digest not independently verified.'],['formula_definitions','Accuracy=(TP+TN)/N; Precision=TP/(TP+FP); Recall=TP/(TP+FN); F1=2TP/(2TP+FP+FN)']];
const ms=table('Method',['Field','Recorded value'],method,[34,135]);ms.getRange(`B2:B${method.length+1}`).format.wrapText=true;ms.getRange(`A2:B${method.length+1}`).format.rowHeight=42;
wb.recalculate();
console.log((await wb.inspect({kind:'region',sheetId:'Summary',range:'A4:B15',maxChars:3000,tableMaxRows:15})).ndjson);
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!',options:{useRegex:true,maxResults:10},maxChars:1000})).ndjson);
for(const [name,range] of [['Summary','A2:F15'],['Pair results','A1:L3'],['Errors','A1:K3'],['Threshold analysis','A1:K22'],['Method','A1:B9']]){
 const png=await wb.render({sheetName:name,range,scale:1,format:'png'});await fs.writeFile(path.join(base,name.replaceAll(' ','-')+'.png'),new Uint8Array(await png.arrayBuffer()));
}
await (await SpreadsheetFile.exportXlsx(wb)).save(path.join(base,'ExamFlow_semantic_evaluation.xlsx'));
console.log('EXPORTED');
