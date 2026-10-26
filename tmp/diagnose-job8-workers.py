"""Read-only inventory. Never prints environment values or secret arguments."""
import importlib.util,json,re,time
from pathlib import Path
from datetime import datetime,timezone
from contextlib import closing
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('deploy',ROOT/'tmp/approved-ai-deploy.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def safe_args(args):
 out=[];hide=False
 for arg in args:
  if hide:out.append('<redacted>');hide=False;continue
  if re.search(r'password|secret|token|internal.?key|dsn',arg,re.I):
   if '=' in arg:out.append(arg.split('=',1)[0]+'=<redacted>')
   else:out.append('<sensitive-option>');hide=True
  else:out.append(arg)
 return out

processes=[];connections=m.psutil.net_connections(kind='tcp')
for p in m.psutil.process_iter(['pid','ppid','name','create_time']):
 try:
  args=p.cmdline();cmd=' '.join(args)
  if not (p.name().lower().startswith(('java','python','uvicorn')) or 'uvicorn' in cmd):continue
  record=dict(p.info,cwd=p.cwd(),command_line=safe_args(args),
   started_utc=datetime.fromtimestamp(p.create_time(),timezone.utc).isoformat(),
   listeners=[dict(host=c.laddr.ip,port=c.laddr.port) for c in connections if c.pid==p.pid and c.status=='LISTEN'],
   established=[dict(local_port=c.laddr.port,remote_host=c.raddr.ip,remote_port=c.raddr.port) for c in connections if c.pid==p.pid and c.raddr and c.status=='ESTABLISHED'],
   logs=[f.path for f in p.open_files() if f.path.endswith('.log')])
  processes.append(record)
 except (m.psutil.AccessDenied,m.psutil.NoSuchProcess):pass
report=dict(inspected_utc=datetime.now(timezone.utc).isoformat(),processes=processes,samples=[])
for p in processes:
 m.emit('process_inventory',**{k:v for k,v in p.items() if k not in ('command_line','established')},
  executable=p['command_line'][0] if p['command_line'] else '',
  classpath_entries=sum(len(p['command_line'][i+1].split(';')) for i,a in enumerate(p['command_line'][:-1]) if a in ('-cp','-classpath','--class-path')),
  application=[a for a in p['command_line'] if a.startswith('com.examflow.') or a in ('uvicorn','main:app','--workers','--reload')])
with closing(m.connection(m.settings(m.backend().environ(),'spring.datasource'),transaction=True)) as conn:
 with conn.cursor() as q:
  for n in range(5):
   q.execute("""SELECT pid,application_name,state,backend_start,query_start,state_change,
    client_addr::text,client_port,usename,
    CASE WHEN query ILIKE '%SELECT * FROM public.ai_generation_requests WHERE credit_state IN%'
      AND query ILIKE '%ORDER BY id LIMIT 100%' AND query NOT ILIKE '%requested_by%'
      THEN 'global_credit_worker_poll' ELSE 'other' END AS query_class
    FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid() ORDER BY pid""")
   rows=[dict(zip([c[0] for c in q.description],r)) for r in q.fetchall()]
   report['samples'].append(rows)
   m.emit('db_inventory',sample=n+1,rows=rows)
   time.sleep(1)
with m.httpx.Client(timeout=10,trust_env=False) as client:
 report['health']={}
 for name,url in [('backend','http://127.0.0.1:8080/api/health'),('ai','http://127.0.0.1:8002/health')]:
  r=client.get(url);report['health'][name]=r.status_code
m.emit('health',**report['health'])
(ROOT/'tmp/job8-worker-inventory.json').write_text(json.dumps(report,indent=2,default=str),encoding='utf-8')
