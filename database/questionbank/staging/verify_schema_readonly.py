"""Verify existing staging schema only. No env/DSN imports or schema/data writes."""
import datetime
import hashlib
import json
import re
import socket
from pathlib import Path
from apply_approved_staging import docker, DB, PROJECT, HERE, ROOT, REPORT, BASELINE, RAG


def main():
    prior = json.loads(REPORT.read_text(encoding='utf-8'))
    result = {'time_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'mode': 'read-only', 'checks': {}}
    try:
        ids = docker('ps', '-q', '--filter', 'label=com.docker.compose.project='+PROJECT,
                     '--filter', 'label=com.docker.compose.service=questionbank').splitlines()
        assert len(ids)==1
        cid = ids[0]
        x = json.loads(docker('inspect', cid))[0]
        assert x['State']['Running'] and x['Config']['Image']=='pgvector/pgvector:pg17'
        assert x['Config']['Labels']['com.docker.compose.project']==PROJECT
        assert x['Config']['Labels']['com.docker.compose.service']=='questionbank'
        assert x['HostConfig']['PortBindings']=={'5432/tcp':[{'HostIp':'127.0.0.1','HostPort':'55441'}]}
        assert len(x['Mounts'])==1 and all(m['Type']=='volume' and m['Name'].startswith(PROJECT+'_') for m in x['Mounts'])
        assert cid==prior['container_id']
        with socket.create_connection(('127.0.0.1',55441),timeout=5): pass
        result['checks']['isolation']=True
        def read(query):
            # Every SQL invocation is explicitly read-only, regardless of role defaults.
            assert query.lstrip().upper().startswith('SELECT ')
            output = docker('exec','-i',cid,'psql','-X','-q','-U',DB,'-d',DB,
                '-At','-v','ON_ERROR_STOP=1',stdin='BEGIN READ ONLY;\n'+query+'\nROLLBACK;')
            return output
        def rows(query):
            return json.loads(read('SELECT coalesce(json_agg(row_to_json(r)),\'[]\'::json) FROM ('+query+') r;'))
        identity=rows("SELECT current_database() AS database,current_setting('server_version') AS version,current_setting('server_version_num') AS version_num,current_setting('transaction_read_only') AS readonly")
        assert identity[0]['database']==DB and identity[0]['readonly']=='on'
        result['postgresql']=identity[0]
        result['root_cause']={'sqlstate':'42725','message':'operator is not unique: text || "char"',
            'columns':['pg_constraint.contype','pg_trigger.tgenabled'],
            'fix':'Explicit ::text casts in old harness; JSON records in read-only verifier',
            'schema_change_required':False}
        migration_path=ROOT/'database/questionbank/migrations/001_ai_rag_documents.sql'
        migration=migration_path.read_bytes()
        assert hashlib.sha256(migration).hexdigest()==prior['migration_sha256']
        result['checks']['exact_applied_migration_hash']=True
        tables=rows("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname")
        assert [t['relname'] for t in tables]==sorted(BASELINE+RAG)
        result['checks']['expected_tables_only']=True
        result['extension']=rows("SELECT e.extversion,n.nspname AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='vector'")
        assert len(result['extension'])==1 and result['extension'][0]['schema']=='extensions'
        columns=rows("SELECT c.relname,a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) AS default_expression FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relname IN ('ai_source_documents','ai_document_indexes','ai_document_chunks','question_embeddings') AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum")
        result['columns']=columns
        vectors=[a for a in columns if a['attname']=='embedding']
        assert len(vectors)==2 and all(a['type']=='extensions.vector(768)' and a['attnotnull'] for a in vectors)
        result['checks']['vector_768_not_null']=True
        table_filter="c.relname IN ('ai_source_documents','ai_document_indexes','ai_document_chunks') AND n.nspname='public'"
        constraints=rows("SELECT c.relname,k.conname,k.contype::text AS kind,k.convalidated,pg_get_constraintdef(k.oid) AS definition,k.confrelid::regclass::text AS target,k.confdeltype::text AS delete_action,ARRAY(SELECT a.attname FROM unnest(k.conkey) WITH ORDINALITY z(num,ord) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=z.num ORDER BY z.ord) AS columns FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE "+table_filter+" ORDER BY c.relname,k.conname")
        result['constraints']=constraints
        assert all(c['convalidated'] for c in constraints)
        by_name={c['conname']:c for c in constraints}
        named=set(re.findall(r'CONSTRAINT\s+(ai_\w+)',migration.decode()))
        assert named <= by_name.keys()
        expected_keys={
            'ai_source_documents_pkey':('p',['id']),
            'ai_source_documents_revision_key':('u',['id','revision']),
            'ai_source_documents_storage_key':('u',['storage_object_key']),
            'ai_document_indexes_pkey':('p',['id']),
            'ai_document_indexes_cache_key':('u',['document_id','document_revision','config_hash']),
            'ai_document_chunks_pkey':('p',['index_id','chunk_order'])}
        assert {c['conname'] for c in constraints if c['kind'] in ['p','u']}==set(expected_keys)
        for name,(kind,cols) in expected_keys.items():assert by_name[name]['kind']==kind and by_name[name]['columns']==cols
        fks=[c for c in constraints if c['kind']=='f']
        assert len(fks)==2
        fk=by_name['ai_document_indexes_document_fk']
        assert fk['target']=='ai_source_documents' and fk['columns']==['document_id','document_revision'] and fk['delete_action']=='r'
        fk=next(c for c in fks if c['relname']=='ai_document_chunks')
        assert fk['target']=='ai_document_indexes' and fk['columns']==['index_id'] and fk['delete_action']=='c'
        assert not any(c['kind']=='f' for c in constraints if c['relname']=='ai_source_documents')
        checks=[c for c in constraints if c['kind']=='c']
        # Every CHECK occurrence in the unchanged migration must exist and be validated.
        assert len(checks)==len(re.findall(r'\bCHECK\s*\(',migration.decode(),re.I))
        expected_check_columns={
          'ai_source_documents':{'revision','original_name','mime_type','byte_size','file_sha256','storage_object_key','status','deleted_at'},
          'ai_document_indexes':{'extracted_text','extracted_text_sha256','extractor_version','embedding_model','embedding_model_digest','embedding_dimensions','chunker_version','chunk_size','chunk_overlap','config_hash','chunk_count','status','ready_at'},
          'ai_document_chunks':{'chunk_order','content','content_sha256','page_number','start_offset','end_offset','embedding'}}
        for table,cols in expected_check_columns.items():
            assert cols==set(col for c in checks if c['relname']==table for col in c['columns'])
        result['checks']['validated_constraints_keys_fk_check_coverage']=True
        indexes=rows("SELECT c.relname,ic.relname AS name,am.amname,i.indisunique,i.indisprimary,i.indisvalid,i.indisready,ARRAY(SELECT z.option::int FROM unnest(i.indoption) WITH ORDINALITY z(option,ord) ORDER BY z.ord) AS options,pg_get_indexdef(i.indexrelid) AS definition,pg_get_expr(i.indpred,i.indrelid) AS predicate,ARRAY(SELECT pg_get_indexdef(i.indexrelid,k,true) FROM generate_series(1,i.indnkeyatts) k) AS keys FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_am am ON am.oid=ic.relam WHERE "+table_filter+" ORDER BY ic.relname")
        result['indexes']=indexes
        expected_indexes={name:(cols,True,None) for name,(_,cols) in expected_keys.items()}
        expected_indexes.update({
          'ai_source_documents_active_sha_uq':(['owner_user_id','course_id','file_sha256'],True,'(deleted_at IS NULL)'),
          'ai_source_documents_library_idx':(['owner_user_id','course_id','created_at'],False,'(deleted_at IS NULL)'),
          'ai_document_indexes_lookup_idx':(['document_id','document_revision','status','config_hash'],False,None)})
        assert {i['name'] for i in indexes}==set(expected_indexes)
        for i in indexes:
            keys,unique,predicate=expected_indexes[i['name']]
            assert i['keys']==keys and i['indisunique']==unique and i['predicate']==predicate
            assert i['amname']=='btree' and i['indisvalid'] and i['indisready']
            assert i['options']==([0,0,3] if i['name']=='ai_source_documents_library_idx' else [0]*len(keys))
        result['checks']['indexes_unique_predicate_no_ann']=True
        triggers=rows("SELECT c.relname,t.tgname,t.tgenabled::text AS enabled,t.tgtype,p.proname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid WHERE "+table_filter+" AND NOT t.tgisinternal ORDER BY t.tgname")
        result['triggers']=triggers
        expected_triggers={
          'ai_source_documents_identity_guard':('ai_source_documents',19,'examflow_guard_ai_document_identity'),
          'ai_document_indexes_immutable_guard':('ai_document_indexes',27,'examflow_guard_ai_document_index'),
          'ai_document_chunks_immutable_guard':('ai_document_chunks',31,'examflow_guard_ai_document_chunk')}
        assert {t['tgname'] for t in triggers}==set(expected_triggers)
        for t in triggers:
            assert (t['relname'],t['tgtype'],t['proname'])==expected_triggers[t['tgname']] and t['enabled']=='O'
        result['checks']['enabled_trigger_events_and_function_links']=True
        functions=rows("SELECT p.proname,p.prosrc,p.prosecdef,p.prorettype::regtype::text AS returns,l.lanname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='public' ORDER BY p.proname")
        result['functions']=functions
        expected_functions=dict(re.findall(r'CREATE OR REPLACE FUNCTION public\.(\w+)\(\)\s+RETURNS trigger LANGUAGE plpgsql AS \$\$(.*?)\$\$;',migration.decode(),re.S))
        assert {f['proname'] for f in functions}==set(expected_functions)
        norm=lambda text:re.sub(r'\s+',' ',text).strip()
        for f in functions:
            assert norm(f['prosrc'])==norm(expected_functions[f['proname']])
            assert f['returns']=='trigger' and f['lanname']=='plpgsql' and not f['prosecdef']
        result['checks']['function_bodies_match_exact_migration']=True
        result['row_counts']={t:int(read('SELECT count(*) FROM public.'+t+';')) for t in BASELINE+RAG}
        assert all(n==0 for n in result['row_counts'].values())
        args=['exec',cid,'pg_dump','-U',DB,'-d',DB,'--no-owner','--no-privileges']
        for table in BASELINE:args+=['--table=public.'+table]
        dump=docker(*args)
        normalized='\n'.join(line for line in dump.splitlines() if not line.startswith(('\\restrict ','\\unrestrict ')))
        fingerprint=hashlib.sha256(normalized.encode()).hexdigest()
        result['baseline_fingerprint_current']=fingerprint
        assert fingerprint==prior['baseline_fingerprint_before']==prior['baseline_fingerprint_after']
        result['checks']['baseline_fingerprint_unchanged']=True
        result['status']='READY'
        prior['status']='READY'
        prior['verification']=result
        REPORT.write_text(json.dumps(prior,indent=2),encoding='utf-8')
        print(json.dumps({'status':'READY','postgresql':result['postgresql'],'constraints':len(constraints),'checks':len(checks),'foreign_keys':len(fks),'indexes':len(indexes),'triggers':len(triggers),'functions':len(functions),'row_counts':result['row_counts'],'baseline_unchanged':True}))
    except Exception as exc:
        result['status']='verification failed'
        result['error_type']=type(exc).__name__
        prior['verification']=result
        REPORT.write_text(json.dumps(prior,indent=2),encoding='utf-8')
        print('Read-only verification failed; see schema-result.json. No schema repair attempted.')
        raise SystemExit(1)


if __name__=='__main__':main()
