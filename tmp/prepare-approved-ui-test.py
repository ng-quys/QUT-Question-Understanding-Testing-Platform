import importlib.util,json
from pathlib import Path
from contextlib import closing
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('deploy',ROOT/'tmp/approved-ai-deploy.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with closing(m.connection(m.settings(m.backend().environ(),'spring.datasource'))) as conn:
 with conn.cursor() as q:
  q.execute('SELECT id,username,role,status FROM public.users WHERE username=%s',('8000000004',))
  user=q.fetchone()
  if not user or user[2] not in ('teacher','faculty') or user[3]!='active':raise RuntimeError('Valid active lecturer required')
  q.execute("SELECT id,credit_state FROM ai_generation_requests WHERE requested_by=%s AND credit_state IN ('reserved','running','cancel_requested','unknown')",(user[0],))
  unresolved=q.fetchall()
  m.emit('lecturer_precheck',username=user[1],role=user[2],active=True,unresolved_jobs=unresolved)
  if unresolved:raise RuntimeError('Unresolved lecturer job: do not create another')
  q.execute("SELECT m.monthly_limit,m.used,m.reserved,a.extra_balance,a.extra_reserved FROM ai_credit_months m JOIN ai_credit_accounts a ON a.user_id=m.user_id WHERE m.user_id=%s AND m.month_start=date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date",(user[0],))
  quota=q.fetchone();m.emit('lecturer_quota',limit_used_reserved_extra_extrareserved=quota)
  if not quota or quota[0]-quota[1]-quota[2]+quota[3]-quota[4]<1:raise RuntimeError('Insufficient credits')
  q.execute("SELECT c.id,c.code,c.name,cl.id,cl.code,cl.description FROM courses c JOIN clos cl ON cl.course_id=c.id WHERE (c.created_by=%s OR EXISTS(SELECT 1 FROM course_faculties cf WHERE cf.course_id=c.id AND cf.faculty_id=%s)) AND coalesce(cl.status,'active')='active' ORDER BY c.id,cl.id",(user[0],user[0]))
  m.emit('available_courses_clos',rows=q.fetchall())
