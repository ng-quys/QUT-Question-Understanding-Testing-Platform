// Mock-only browser regression. Requires Playwright and an installed Edge browser.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.EXAMFLOW_PLAYWRIGHT_PATH||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const base='http://127.0.0.1:5187';
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5187','--strictPort'],{cwd:root,stdio:'pipe'});
let serverError='';vite.stderr.on('data',chunk=>{serverError+=chunk;});
let browser;
try{
 for(let i=0;i<80;i++){if(vite.exitCode!==null)throw Error(serverError);try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:1000}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const clos=[1,2].map(id=>({id,courseId:1,code:`CLO${id}`,description:`Chuẩn đầu ra kiểm thử ${id}`,defaultBloom:'remember',status:'active'}));
 const text='DNS chuyển đổi tên miền thành địa chỉ IP trong hệ thống mạng. '.repeat(5);
 let creates=0,terminal=false,submitted,saved=[],activeJob=null;
 await page.route('**/api/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname;
   let body;
   if(path.endsWith('/auth/me'))body={id:99,role:'teacher'};
   else if(path.endsWith('/clos'))body=clos;
   else if(path.endsWith('/ai-credits/extract'))body={documents:[{extractedText:text,wordCount:50}],sourceProof:'mock-source-proof'};
   else if(path.endsWith('/ai-credits'))body={remaining:200,monthlyLimit:200,extraBalance:0,activeJob};
   else if(path.endsWith('/ai-credits/jobs')&&request.method()==='POST'){
     creates++;submitted=request.postDataJSON();
     body={id:7,courseId:1,status:'running',requested:10,accepted:0,charged:0,questions:[]};
   }else if(path.endsWith('/ai-credits/jobs/7'))body={id:7,courseId:1,status:terminal?'partial':'running',requested:10,accepted:terminal?2:0,charged:terminal?2:0,selectedClos:clos,
     questions:terminal?[1,2].map(i=>({content:`Câu hỏi kiểm thử ${i}`,options:['a','b','c','d'],correctIndex:0,explanation:'Giải thích kiểm thử',cloId:1,bloom:'understand',evidenceQuote:text.slice(0,60)})):[]};
   else if(path.endsWith('/teacher/questions')&&request.method()==='POST'){saved.push(request.postDataJSON());body={id:saved.length};}
   else throw Error(`Unexpected API: ${request.method()} ${path}`);
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto(base+'/scripts/ai-generator-smoke.html');
 await page.locator('input[type=file]').setInputFiles({name:'lecture.txt',mimeType:'text/plain',buffer:Buffer.from(text)});
 await page.getByRole('button',{name:'Tiếp tục',exact:true}).click();
 await page.getByRole('combobox').selectOption('1');
 await page.getByRole('checkbox').first().waitFor();
 assert.equal(await page.getByRole('button',{name:'Tiếp tục',exact:true}).isDisabled(),true);
 await page.getByRole('checkbox').nth(0).check();await page.getByRole('checkbox').nth(1).check();
 await page.getByRole('button',{name:'Tiếp tục',exact:true}).click();
 await page.getByRole('spinbutton').fill('46');
 assert.equal(await page.getByRole('button',{name:'Sinh câu hỏi',exact:true}).isDisabled(),true);
 await page.getByRole('spinbutton').fill('45');
 assert.equal(await page.getByRole('button',{name:'Sinh câu hỏi',exact:true}).isEnabled(),true);
 await page.getByRole('spinbutton').fill('10');
 await page.getByRole('button',{name:'Sinh câu hỏi',exact:true}).click();
 await page.waitForFunction(()=>sessionStorage.getItem('examflow-ai-review-99')==='7');
 assert.equal(creates,1);assert.deepEqual(submitted.cloIds,[1,2]);assert.equal(submitted.questionCount,10);assert.equal(submitted.units,undefined);
 terminal=true;
 await page.reload();
 await page.getByRole('heading',{name:'Xem xét và hiệu chỉnh câu hỏi'}).waitFor();
 assert.equal(creates,1,'Reload must poll the existing job, never POST a replacement');
 await page.getByLabel('CLO câu 1',{exact:true}).selectOption('2');
 await page.getByLabel('Bloom câu 1',{exact:true}).selectOption('apply');
 assert.equal((await page.locator('body').innerText()).toLowerCase().includes('ma trận'),false);
 await mkdir(new URL('../../tmp/ai-generator-smoke/',import.meta.url),{recursive:true});
 await page.screenshot({path:fileURLToPath(new URL('../../tmp/ai-generator-smoke/review.png',import.meta.url)),fullPage:true});
 await page.getByRole('button',{name:'Duyệt và lưu ngân hàng',exact:true}).click();
 await page.waitForFunction(()=>document.body.dataset.saved==='true');
 assert.equal(saved.length,2);assert.equal(saved[0].cloId,2);assert.equal(saved[0].bloom,'apply');assert.equal(saved[0].status,'approved');
 // An active server job takes precedence over a stale review ID in this tab.
 activeJob={id:7,status:'running',requested:10};terminal=false;
 await page.evaluate(()=>sessionStorage.setItem('examflow-ai-review-99','999'));
 await page.reload();
 await page.getByRole('progressbar').waitFor();
 await page.waitForFunction(()=>sessionStorage.getItem('examflow-ai-review-99')==='7');
 assert.equal(creates,1);
 assert.deepEqual(errors,[]);
 console.log('PASS: upload, require CLO, select multiple CLOs, 45 allowed/46 blocked, request has no matrix, reload polls same job, partial results, edit CLO/Bloom, save existing question API. All APIs mocked.');
}finally{await browser?.close();vite.kill();}
