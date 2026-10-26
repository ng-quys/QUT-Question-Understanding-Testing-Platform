"""Read-only process and PostgreSQL polling observation. No service changes."""
import importlib.util,json,time
from pathlib import Path
from datetime import datetime,timezone
from contextlib import closing
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('deploy',ROOT/'tmp/approved-ai-deploy.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
p=m.backend();env=p.environ();inventory=[]
for proc in m.psutil.process_iter(['pid','name','create_time']):
 try:
  name=(proc.info['name'] or '').lower()
  if 'java' not in name:continue
  cmd=proc.cmdline()
  is_be=any('com.examflow.backend' in a or ('backend' in a.lower() and a.endswith('.jar')) for a in cmd)
  inventory.append(dict(pid=proc.pid,name=name,started=datetime.fromtimestamp(proc.create_time(),timezone.utc).isoformat(),backend=is_be,main_class=next((a for a in cmd if a.startswith('com.examflow.backend')),None)))
 except m.psutil.AccessDenied:inventory.append(dict(pid=proc.pid,access_denied=True))
report=dict(started_utc=datetime.now(timezone.utc).isoformat(),local_java=inventory,primary_pid=p.pid,flags={k:env.get(k,'<unset>') for k in ['AI_CREDITS_WORKER_ENABLED','AI_CREDITS_WORKER_CLUSTER_READY']},samples=[])
m.emit('inventory',**{k:v for k,v in report.items() if k!='samples'})
with closing(m.connection(m.settings(env,'spring.datasource'),transaction=True)) as conn:
 with conn.cursor() as q:
  for n in range(18):
   q.execute("""SELECT pid,application_name,state,backend_start,query_start,client_addr::text,
    CASE WHEN query ILIKE %s AND query ILIKE %s THEN 'global_ai_poll'
    WHEN query ILIKE %s AND query ILIKE %s THEN 'coordination_readiness'
    ELSE 'other' END AS query_kind
    FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend'
    AND pid<>pg_backend_pid() ORDER BY pid""",('SELECT * FROM public.ai_generation_requests WHERE credit_state IN%','%ORDER BY id LIMIT 100%','%SELECT EXISTS(SELECT 1 FROM pg_stat_activity%','%ai-worker-v1%'))
   rows=[dict(zip([d[0] for d in q.description],r)) for r in q.fetchall()]
   sample=dict(number=n+1,utc=datetime.now(timezone.utc).isoformat(),connections=rows)
   report['samples'].append(sample)
   if n in (0,8,17):m.emit('sample',number=n+1,utc=sample['utc'],polling=[r for r in rows if r['query_kind']!='other'],total_connections=len(rows))
   if n<17:time.sleep(3)
  q.execute("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database())")
  report['advisory_locks_at_end']=q.fetchone()[0]
groups={}
for sample in report['samples']:
 for r in sample['connections']:
  if r['query_kind']=='other':continue
  key=(r['application_name'],r['query_kind'])
  g=groups.setdefault(key,dict(application=r['application_name'],kind=r['query_kind'],pids=set(),query_starts=set(),first_seen=sample['utc'],last_seen=sample['utc']))
  g['pids'].add(r['pid']);g['query_starts'].add(r['query_start']);g['last_seen']=sample['utc']
report['groups']=[dict(g,pids=sorted(g['pids']),query_starts=sorted(g['query_starts'])) for g in groups.values()]
report['finished_utc']=datetime.now(timezone.utc).isoformat()
(ROOT/'tmp/current-pollers-readonly-audit.json').write_text(json.dumps(report,indent=2,default=str),encoding='utf-8')
m.emit('finished',groups=report['groups'],advisory_locks=report['advisory_locks_at_end'],finished_utc=report['finished_utc'])
