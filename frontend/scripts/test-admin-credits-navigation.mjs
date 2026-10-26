// Browser regression against Vite (default localhost:5173), with every API mocked.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.EXAMFLOW_PLAYWRIGHT_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const unexpected=[],errors=[],grants=[];let reads=0,granted=false;
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
   sessionStorage.setItem('examflow_auth',JSON.stringify({username:'mock-admin',fullName:'Test Admin',email:'admin@example.invalid',role:'admin'}));
   sessionStorage.setItem('access_token','mock-only-access');sessionStorage.setItem('refresh_token','mock-only-refresh');
   sessionStorage.setItem('access_expires_at',String(Date.now()+3600000));
 });
 await page.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname;let body,status=200;
   if(path==='/api/admin/dashboard')body={totalUsers:1,activeUsers:1,teachers:1,students:0,admins:1,courses:0,exams:0,sessions:0,attempts:0,inProgressAttempts:0,completedAttempts:0,averageScore:0,recentCompletedAttempts:0,highRiskAttempts:0};
   else if(path==='/api/admin/workspace/report')body={completed:0,averagePercent:0,atLeastHalf:0,latestSubmission:null,distribution:[],courses:[]};
   else if(path==='/api/admin/ai-runtime')body={ok:true,ready:true,running:false,status:'idle',message:'Mock only'};
   else if(path==='/api/admin/ai-credits'){
     reads++;body={items:[{id:3,full_name:'Giảng viên kiểm thử',email:'teacher@example.invalid',quota:{month:'2026-10-01',monthlyLimit:200,used:20,reserved:0,extraBalance:granted?60:50,extraReserved:0,remaining:granted?240:230,nextReset:'2026-11-01T00:00:00Z',maxPerRequest:45,activeJob:null}}]};
   }else if(path==='/api/admin/ai-credits/3/history')body=[{id:1,event_type:granted?'admin_grant':'monthly_allocation',monthly_limit_delta:granted?0:200,monthly_used_delta:0,monthly_reserved_delta:0,extra_balance_delta:granted?10:0,extra_reserved_delta:0,job_id:null,reason:granted?'Mock grant only':null,actor_name:granted?'Test Admin':null,created_at:'2026-10-21T01:00:00Z'}];
   else if(path==='/api/admin/ai-credits/3/grants'&&req.method()==='POST'){
     grants.push(req.postDataJSON());status=grants.length===1?503:200;
     if(status===200)granted=true;body=status===200?{ok:true}:{message:'Mock lost response; retry'};
   }else{unexpected.push(path);status=500;body={message:'Unexpected mock API'};}
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto((process.env.EXAMFLOW_TEST_URL||'http://localhost:5173')+'/admin');
 await page.getByRole('button',{name:'AI Credits',exact:true}).click();
 await page.getByRole('heading',{name:'Quản lý AI Credits',exact:true}).waitFor();
 await page.getByText('teacher@example.invalid',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Xuất CSV',exact:true}).count(),0);
 await page.getByRole('button',{name:'Chi tiết',exact:true}).click();
 await page.getByLabel('Số credits cấp thêm').fill('10');
 assert.equal(await page.getByRole('button',{name:'Cấp thêm',exact:true}).isDisabled(),true);
 await page.getByLabel('Lý do cấp thêm hoặc đối soát').fill('Mock grant only');
 await page.getByRole('button',{name:'Cấp thêm',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Mock lost response'}).waitFor();
 await page.getByRole('button',{name:'Cấp thêm',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Đã cấp thêm credits.'}).waitFor();
 assert.equal(grants.length,2);assert.equal(grants[0].operationKey,grants[1].operationKey);
 assert.equal(grants[1].amount,10);assert.equal(grants[1].reason,'Mock grant only');
 await page.getByText('240',{exact:true}).waitFor();
 const before=reads;await page.getByRole('button',{name:'Làm mới',exact:true}).first().click();
 await page.waitForTimeout(400);assert.ok(reads>before,'Header refresh must reload credits, not generic workspace lists');
 assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
 console.log('PASS: admin sidebar opens restored credits screen, quota/history render, CSV hidden, header refresh works, grant requires reason, retry retains operationKey. All APIs mocked; no real credits changed.');
}finally{await browser.close();}
