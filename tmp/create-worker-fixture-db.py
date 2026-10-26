"""Create only the dedicated loopback fixture database; no production settings."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'ai-service/.venv/Lib/site-packages'))
import psycopg2
from contextlib import closing
with closing(psycopg2.connect(host='127.0.0.1',port=55439,user='examflow_test_owner',dbname='postgres')) as c:
 c.autocommit=True
 with c.cursor() as q:
  q.execute("SELECT 1 FROM pg_database WHERE datname='examflow_worker_test'")
  if not q.fetchone():q.execute('CREATE DATABASE examflow_worker_test')
print('Dedicated fixture database ready on loopback port 55439')
