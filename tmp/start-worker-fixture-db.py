"""Portable PostgreSQL fixture on loopback only. Never reads production configuration."""
import subprocess,time,json,socket
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
runtime=ROOT/'.env.examflow.runtime/tests-postgres';data=runtime/'data';bin=runtime/'pgsql/bin'
with socket.socket() as sock:
 if sock.connect_ex(('127.0.0.1',55439))==0:raise RuntimeError('Fixture port already occupied; no process replaced')
if not data.exists():
 result=subprocess.run([str(bin/'initdb.exe'),'-D',str(data),'-U','examflow_test_owner','-A','trust','--encoding=UTF8','--locale=C'],capture_output=True,text=True,creationflags=subprocess.CREATE_NO_WINDOW)
 (runtime/'init.log').write_text(result.stdout+result.stderr,encoding='utf-8')
 if result.returncode:raise RuntimeError('Fixture init failed; inspect runtime init.log')
with (runtime/'control.log').open('ab') as output:
 result=subprocess.run([str(bin/'pg_ctl.exe'),'-D',str(data),'-l',str(runtime/'server.log'),'-o','-h 127.0.0.1 -p 55439 -c max_connections=20','-w','start'],stdout=output,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW,timeout=35)
if result.returncode:raise RuntimeError('Fixture startup failed')
print('Fixture only: jdbc:postgresql://127.0.0.1:55439/postgres; no Production configuration used')
