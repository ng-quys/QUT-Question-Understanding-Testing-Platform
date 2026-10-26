// Run with Vite running and Playwright installed (or PLAYWRIGHT_MODULE pointing to its module).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.QUT_BROWSER_CHANNEL ? { channel: process.env.QUT_BROWSER_CHANNEL } : {}) });
const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
const errors = [], requests = [];
page.on('pageerror', error => errors.push(error.message));
const choices = [
  {dimension:'difficulty',value:'1',code:'medium',label:'Trung bình'}, {dimension:'difficulty',value:'2',code:'good',label:'Khá'},
  {dimension:'chapter',value:'2',code:'C1',label:'C1 · Quan hệ'}, {dimension:'topic',value:'3',code:'T1',label:'T1 · SQL'},
  {dimension:'clo',value:'4',code:'CLO1',label:'CLO1 · Truy vấn'},
];
const rows = Array.from({length:45}, (_,index) => ({id:index+1,courseId:1,chapterId:2,topicId:3,cloId:4,
  difficulty:index%2?'good':'medium',status:index%2?'approved':'pending',bloom:'understand',source:'manual',
  content:`CSDL câu hỏi ${index+1}: ${'Nội dung câu hỏi dài để kiểm tra xuống dòng. '.repeat(index===0?25:1)}`,
  explanation:'Giải thích mẫu',defaultScore:1,createdAt:null,updatedAt:null,
  answers:['A','B','C','D'].map((label,i)=>({id:(index+1)*10+i,label,content:`Phương án ${label}`,position:i+1,correct:i===1}))}));
let mode = 'normal';
await page.route('**/api/**', async route => {
  const url = new URL(route.request().url()), path = url.pathname;
  let body;
  if(path.endsWith('/automatic/courses')) body=[{id:1,code:'CSDL',name:'Cơ sở dữ liệu'},{id:2,code:'JAVA',name:'Lập trình Java'}];
  else if(path.endsWith('/automatic/bank')) body={available:45,choices:[{dimension:'difficulty',value:'1',label:'Trung bình',available:23},{dimension:'difficulty',value:'2',label:'Khá',available:22}]};
  else if(path.endsWith('/questions/preview')) {
    requests.push(Object.fromEntries(url.searchParams));
    if(mode==='error')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Lỗi ngân hàng thử nghiệm'})});
    if(mode==='slow')await new Promise(resolve=>setTimeout(resolve,500));
    let items=Number(url.searchParams.get('courseId'))===1?rows:[];
    const search=url.searchParams.get('search')?.trim().toLowerCase();
    if(search)items=items.filter(q=>String(q.id)===search.replace(/^#/,'')||q.content.toLowerCase().includes(search));
    for(const [key,field] of [['difficulty','difficulty'],['chapter','chapterId'],['topic','topicId'],['clo','cloId'],['status','status']]) {
      const value=url.searchParams.get(key);if(value)items=items.filter(q=>key==='difficulty'?q[field]===(value==='1'?'medium':'good'):String(q[field])===value);
    }
    const page=Number(url.searchParams.get('page'));
    body={items:items.slice(page*20,page*20+20),total:items.length,bankTotal:Number(url.searchParams.get('courseId'))===1?45:0,page,size:20,choices};
  } else if(path.endsWith('/automatic/check'))body={valid:true,available:45,maximumOverlap:0,groups:[],errors:[],warnings:[]};
  else if(path.endsWith('/automatic/preview'))body={previewId:'fixture',variants:['CSDL_CK-003','CSDL_CK-004'].map(code=>({code,questions:[{...rows[0],difficulty:'1',chapter:'2',topic:'3',clo:'4'}]})),pairs:[{first:'CSDL_CK-003',second:'CSDL_CK-004',count:1,percent:100}],totalOverlap:1,maximumOverlapPercent:100,elapsedMillis:12,status:'OPTIMAL',provenOptimal:true,groups:[],warnings:[]};
  else if(path.endsWith('/automatic/save'))body={examIds:[101,102],examCodes:['CSDL_CK-005','CSDL_CK-004']};
  else throw new Error(`Unexpected fixture API ${path}`);
  await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
});
try {
  await page.goto(`${process.env.QUT_UI_URL || 'http://127.0.0.1:5173'}/tests/automatic-exam-preview.html`);
  await page.getByLabel('Tên đề thi', {exact:true}).fill('Đề thi giữ nguyên khi xem ngân hàng');
  await page.getByLabel('Tiền tố mã đề').fill('CSDL_CK');
  await page.getByLabel('Số mã đề (M)').fill('2');await page.getByLabel('Số câu mỗi đề (Q)').fill('1');
  const open=page.getByRole('button',{name:'Xem ngân hàng câu hỏi',exact:true});
  await open.click();const dialog=page.getByRole('dialog');await dialog.getByText('45 câu hỏi phù hợp',{exact:true}).waitFor();
  assert.equal(await dialog.locator('details').count(),20);
  await dialog.getByRole('button',{name:'Sau',exact:true}).click();await dialog.getByText('Trang 2/3 · 20 câu/trang',{exact:true}).waitFor();
  await dialog.locator('details').first().locator('summary').click();await dialog.locator('details').first().getByText('✓ Đáp án đúng',{exact:true}).waitFor();
  await dialog.getByLabel('Mức độ khó',{exact:true}).selectOption('1');
  await dialog.getByLabel('Chương',{exact:true}).selectOption('2');await dialog.getByLabel('Chủ đề',{exact:true}).selectOption('3');
  await dialog.getByLabel('CLO',{exact:true}).selectOption('4');await dialog.getByLabel('Trạng thái',{exact:true}).selectOption('pending');
  await dialog.getByText('23 câu hỏi phù hợp',{exact:true}).waitFor();
  assert.equal(requests.at(-1).page,'0');
  assert.deepEqual(['difficulty','chapter','topic','clo','status'].map(k=>requests.at(-1)[k]),['1','2','3','4','pending']);
  await dialog.getByLabel('Tìm mã / nội dung').fill('#3');await dialog.getByText('1 câu hỏi phù hợp',{exact:true}).waitFor();
  await dialog.getByLabel('Tìm mã / nội dung').fill('không tồn tại');await dialog.getByText('Không có câu hỏi phù hợp với các bộ lọc đã chọn.').waitFor();
  await dialog.getByRole('button',{name:'Xóa bộ lọc'}).click();await dialog.getByText('45 câu hỏi phù hợp',{exact:true}).waitFor();
  assert.equal(await dialog.getByLabel('Mức độ khó',{exact:true}).inputValue(),'');
  await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
  assert.equal(await page.getByLabel('Tên đề thi',{exact:true}).inputValue(),'Đề thi giữ nguyên khi xem ngân hàng');
  assert.equal(await page.getByLabel('Tiền tố mã đề').inputValue(),'CSDL_CK');
  mode='slow';await open.click();await dialog.getByText('Đang tải câu hỏi…',{exact:true}).waitFor();await dialog.getByText('45 câu hỏi phù hợp',{exact:true}).waitFor();
  if(process.env.QUT_UI_SCREENSHOT)await page.screenshot({path:`${process.env.QUT_UI_SCREENSHOT}-desktop.png`});
  await dialog.locator('details').first().locator('summary').click();
  await page.setViewportSize({width:390,height:844});
  assert.equal(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),true);
  if(process.env.QUT_UI_SCREENSHOT)await page.screenshot({path:`${process.env.QUT_UI_SCREENSHOT}-mobile.png`});
  await dialog.getByRole('button',{name:'Đóng',exact:true}).click();
  await page.getByLabel('Ngân hàng câu hỏi theo học phần').selectOption('2');await open.click();
  await dialog.getByRole('heading',{name:'Ngân hàng JAVA',exact:true}).waitFor();await dialog.getByText('Không có câu hỏi phù hợp với các bộ lọc đã chọn.').waitFor();
  assert.equal(requests.at(-1).courseId,'2');await page.keyboard.press('Escape');
  mode='error';await open.click();await dialog.getByRole('alert').waitFor();mode='normal';await dialog.getByRole('button',{name:'Thử lại'}).click();
  await dialog.getByText('Không có câu hỏi phù hợp với các bộ lọc đã chọn.').waitFor();await page.keyboard.press('Escape');
  await page.setViewportSize({width:1365,height:900});await page.getByLabel('Ngân hàng câu hỏi theo học phần').selectOption('1');
  await page.getByRole('button',{name:'Tiếp tục: Kiểm tra cấu hình →'}).click();await page.getByRole('button',{name:'Bắt đầu tạo đề'}).click();
  await page.getByRole('tab',{name:'CSDL_CK-003',exact:true}).waitFor();
  await page.getByLabel('Tôi đã kiểm tra các mã đề').check();await page.getByRole('button',{name:'Xác nhận lưu đề',exact:true}).click();
  await page.getByRole('tab',{name:'CSDL_CK-005',exact:true}).waitFor();assert.equal(await page.getByRole('tab',{name:'CSDL_CK-003',exact:true}).count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: bank scope, loading, answers, combined filters, search, pagination, empty/error states, retry, close/reopen, form preservation, mobile width, preview and saved-code reconciliation.');
} finally { await browser.close(); }
