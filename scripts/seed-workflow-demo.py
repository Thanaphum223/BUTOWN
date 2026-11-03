#!/usr/bin/env python3
"""Add one coherent test complaint for each of the 18 standard statuses.
Requires seed-community-demo.py to have been applied to the same municipality.
Generates SQL/files only. Scan and copy files, back up DB, then apply SQL with
psql -v ON_ERROR_STOP=1. Existing cases and account permissions are untouched.
"""
import argparse,hashlib,json,math,shutil,uuid
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--municipality',type=uuid.UUID,required=True)
p.add_argument('--actor',type=uuid.UUID,required=True,help='Existing test administrator assigned to each staff step')
p.add_argument('--output',type=Path,required=True)
a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True)
files=a.output/'files';files.mkdir(exist_ok=True)
root=Path(__file__).resolve().parent.parent/'testdata/community-demo/media'
ns=f'mock-community-v1:workflow-demo-20261103:{a.municipality}'
def uid(s):return str(uuid.uuid5(uuid.NAMESPACE_URL,ns+':'+s))
def q(s):return 'NULL' if s is None else "'"+str(s).replace("'","''")+"'"
def js(x):return q(json.dumps(x,ensure_ascii=False))+'::jsonb'
mid=q(a.municipality);actor=q(a.actor)
reporter=str(uuid.uuid5(uuid.NAMESPACE_URL,f'mock-community-v1:cloud-demo-20261103:{a.municipality}:user:1'))
base=['TRIAGE','ASSIGN','ACCEPT']
resource=base+['REQUEST_RESOURCE','PROPOSE','SEND_APPROVAL','APPROVE']
working=resource+['START'];reported=working+['REPORT'];forward=reported+['FORWARD_REPORT']
paths={
 'NEW':[], 'TRIAGED':['TRIAGE'],'ASSIGNED':base[:2],'ACCEPTED':base,
 'RESOURCE_DRAFT':base+['REQUEST_RESOURCE'], 'RESOURCE_CHECK':base+['REQUEST_RESOURCE','PROPOSE'],
 'RESOURCE_REVISION':base+['REQUEST_RESOURCE','PROPOSE','RETURN_RESOURCE'],
 'RESOURCE_APPROVAL':resource[:-1], 'READY':resource, 'IN_PROGRESS':working,
 'LEADER_REVIEW':reported,'FIELD_REVISION':reported+['RETURN_FIELD'],
 'OFFICER_REVIEW':forward,'LEADER_REVISION':forward+['RETURN_LEADER'],
 'RESOLVED':forward+['VERIFY'],'CLOSED':forward+['VERIFY','CLOSE'],
 'TERMINATED':resource[:-1]+['DENY'],'REJECTED':['REJECT']}
transitions={
 'TRIAGE':'TRIAGED','ASSIGN':'ASSIGNED','ACCEPT':'ACCEPTED','REQUEST_RESOURCE':'RESOURCE_DRAFT',
 'PROPOSE':'RESOURCE_CHECK','RETURN_RESOURCE':'RESOURCE_REVISION','SEND_APPROVAL':'RESOURCE_APPROVAL',
 'APPROVE':'READY','START':'IN_PROGRESS','REPORT':'LEADER_REVIEW','RETURN_FIELD':'FIELD_REVISION',
 'FORWARD_REPORT':'OFFICER_REVIEW','RETURN_LEADER':'LEADER_REVISION','VERIFY':'RESOLVED','CLOSE':'CLOSED',
 'DENY':'TERMINATED','REJECT':'REJECTED'}
sql=['BEGIN;',f"DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM app_user WHERE id={actor} AND municipality_id={mid} AND role='ADMIN' AND enabled AND department_id IS NOT NULL) THEN RAISE EXCEPTION 'Select an enabled test administrator with a department'; END IF; IF NOT EXISTS(SELECT 1 FROM app_user WHERE id={q(reporter)} AND municipality_id={mid}) THEN RAISE EXCEPTION 'Apply community demo first'; END IF; END $$;"]
sql.append(f"DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM category k JOIN workflow_version w ON w.id=k.workflow_id JOIN app_user u ON u.id={actor} WHERE k.municipality_id={mid} AND k.name='ถนนและทางเท้า' AND k.active AND k.department_id=u.department_id AND w.published AND w.approval_stages=1) THEN RAISE EXCEPTION 'Fixture requires the road category in the test actor department and standard one-stage approval'; END IF; END $$;")
# Reuse current administrator membership without editing their account or roles.
dep=f'(SELECT department_id FROM app_user WHERE id={actor})'
team=uid('team')
sql.append(f"INSERT INTO field_team(id,municipality_id,department_id,leader_id,representative_id,name) VALUES({q(team)},{mid},{dep},{actor},{actor},'MOCK ทีมทดสอบกระบวนการ') ON CONFLICT DO NOTHING;")
sql.append(f"INSERT INTO team_member(team_id,user_id) VALUES({q(team)},{actor}) ON CONFLICT DO NOTHING;")
manifest=[]
for i,(state,path) in enumerate(paths.items()):
 cid=uid('case:'+state);wid=uid('work:'+state);rid=uid('resource:'+state);rev=uid('resource-revision:'+state);report=uid('report:'+state)
 def tm(step):return f"now()-interval '5 days'+interval '{i+step*2} hours'"
 category=f"(SELECT id FROM category WHERE municipality_id={mid} AND name='ถนนและทางเท้า' AND active ORDER BY id LIMIT 1)"
 workflow=f'(SELECT workflow_id FROM category WHERE id={category})'
 details={'urgency':'NORMAL','workScope':'ทดสอบซ่อมผิวทาง 2 ตารางเมตร บริเวณซอยจำลอง','appointment':'2026-11-04','coordinator':'ผู้ประสานงานจำลอง ไม่ใช่ข้อมูลติดต่อจริง','precautions':'สวมเสื้อสะท้อนแสงและจัดแนวกั้นพื้นที่','operationMethod':'ตรวจสอบ กั้นพื้นที่ ซ่อมผิวทาง และบันทึกภาพก่อน–หลัง (MOCK)'}
 sql.append(f"INSERT INTO complaint(id,municipality_id,category_id,reporter_id,officer_id,department_id,leader_id,workflow_id,title,description,address,location,status,assignment_details,due_at,created_at,updated_at,external_id,version) VALUES({q(cid)},{mid},{category},{q(reporter)},{actor if path else 'NULL'},{dep},{actor if 'TRIAGE' in path else 'NULL'},{workflow},{q('[MOCK] ซ่อมผิวทาง — '+state)},'คำร้องจำลองสำหรับทดสอบกระบวนการครบทุกสถานะ ไม่ใช่เหตุการณ์จริง','ซอยทดสอบกระบวนการ ปทุมธานี (ที่อยู่สมมติ)',ST_SetSRID(ST_MakePoint({100.416+math.cos(i)*.018},{14.017+math.sin(i)*.018}),4326)::geography,{q(state)},{js(details if 'TRIAGE' in path else {})},now()+interval '2 days',{tm(0)},{tm(len(path))},{q(ns+':'+state)},{len(path)}) ON CONFLICT DO NOTHING;")
 # Ensure fixture respects the selected workflow's actual published transitions.
 current='NEW'
 events=[('CREATE',None,'NEW')]
 for action in path:
  target=transitions[action]
  sql.append(f"DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM workflow_transition WHERE workflow_id={workflow} AND from_status={q(current)} AND action={q(action)} AND to_status={q(target)}) THEN RAISE EXCEPTION 'Missing standard workflow transition'; END IF; END $$;")
  events.append((action,current,target));current=target
 assert current==state
 for step,(action,old,new) in enumerate(events):
  sql.append(f"INSERT INTO audit_event(id,complaint_id,municipality_id,actor_id,action,from_status,to_status,reason,details,created_at) VALUES({q(uid('audit:'+state+':'+str(step)))},{q(cid)},{mid},{q(reporter) if step==0 else actor},{q(action)},{q(old)},{q(new)},'MOCK จำลองขั้นตอนเพื่อทดสอบ UI และสิทธิ์การทำงาน','{{\"mock\":true}}',{tm(step)}) ON CONFLICT DO NOTHING;")
 if 'ASSIGN' in path:
  workstate='COMPLETE' if state=='CLOSED' else 'CANCELLED' if state=='TERMINATED' else 'IN_PROGRESS' if 'START' in path else 'ACCEPTED' if 'ACCEPT' in path else 'ASSIGNED'
  sql.append(f"INSERT INTO work_order(id,complaint_id,assignee_id,assigned_by,status,due_at,team_id,created_at) VALUES({q(wid)},{q(cid)},{actor},{actor},{q(workstate)},now()+interval '2 days',{q(team)},{tm(2)}) ON CONFLICT DO NOTHING;")
  sql.append(f"INSERT INTO work_member(work_order_id,user_id) VALUES({q(wid)},{actor}) ON CONFLICT DO NOTHING;")
 if 'REQUEST_RESOURCE' in path:
  rs='DENIED' if 'DENY' in path else 'APPROVED' if 'APPROVE' in path else 'PENDING' if 'SEND_APPROVAL' in path else 'REVISION' if 'RETURN_RESOURCE' in path else 'CHECK' if 'PROPOSE' in path else 'DRAFT'
  sql.append(f"INSERT INTO resource_request(id,complaint_id,work_order_id,requested_by,approver_id,status,created_at) VALUES({q(rid)},{q(cid)},{q(wid)},{actor},{actor if 'SEND_APPROVAL' in path else 'NULL'},{q(rs)},{tm(4)}) ON CONFLICT DO NOTHING;")
  if 'PROPOSE' in path:
   sql.append(f"INSERT INTO resource_revision(id,resource_id,revision,proposal,amount,duration_days,submitted_by,line_items,created_at) VALUES({q(rev)},{q(rid)},1,'MOCK ขอวัสดุซ่อมผิวทางและอุปกรณ์กั้นพื้นที่',3500,2,{actor},{js([{'name':'ยางมะตอยสำเร็จรูป 10 ถุง (MOCK)','amount':2500},{'name':'อุปกรณ์กั้นพื้นที่ (MOCK)','amount':1000}])},{tm(5)}) ON CONFLICT DO NOTHING;")
  if 'SEND_APPROVAL' in path:
   decision='APPROVE' if 'APPROVE' in path else 'DENY' if 'DENY' in path else None
   sql.append(f"INSERT INTO approval_assignment(resource_id,step,approver_id,decision,reason,decided_at) SELECT {q(rid)},n,{actor},{q(decision)},{q('MOCK ผลพิจารณาทดสอบ') if decision else 'NULL'},{tm(7) if decision else 'NULL'} FROM generate_series(1,1) n ON CONFLICT DO NOTHING;")
 if 'REPORT' in path:
  sql.append(f"INSERT INTO field_report(id,complaint_id,work_order_id,revision,content,submitted_by,created_at) VALUES({q(report)},{q(cid)},{q(wid)},1,'MOCK ซ่อมผิวทาง 2 ตารางเมตร พร้อมภาพก่อนและหลัง ตรวจความเรียบร้อยและเปิดทางสัญจร ไม่ใช่รายงานเหตุการณ์จริง',{actor},{tm(path.index('REPORT')+1)}) ON CONFLICT DO NOTHING;")
 # Related reviews mirror audit actions and refer to the same resource/report revision.
 for step,(action,old,new) in enumerate(events):
  if action in ['RETURN_RESOURCE','SEND_APPROVAL','APPROVE','DENY','RETURN_FIELD','FORWARD_REPORT','RETURN_LEADER','VERIFY']:
   res=action in ['RETURN_RESOURCE','SEND_APPROVAL','APPROVE','DENY']
   sql.append(f"INSERT INTO review(id,complaint_id,resource_id,report_id,actor_id,stage,decision,reason,created_at) VALUES({q(uid('review:'+state+':'+action))},{q(cid)},{q(rid) if res else 'NULL'},{'NULL' if res else q(report)},{actor},{q(old)},{q(action)},'MOCK บันทึกผลตรวจเพื่อทดสอบกระบวนการ',{tm(step)}) ON CONFLICT DO NOTHING;")
 def attach(source,tag,mime,stage='GENERAL',report_id=None,resource_id=None,revision_id=None,public=False,step=0):
  aid=uid('file:'+state+':'+tag);key=aid+source.suffix;shutil.copyfile(source,files/key);raw=source.read_bytes()
  thumb=None
  if mime=='image/jpeg':
   thumb=source.with_stem(source.stem+'-thumb');thumbkey=aid+'-thumb.jpg';shutil.copyfile(thumb,files/thumbkey)
  sql.append(f"INSERT INTO attachment(id,complaint_id,uploaded_by,original_name,content_type,size_bytes,sha256,storage_key,evidence_stage,public_approved,thumbnail_key,thumbnail_size,report_id,resource_id,resource_revision_id,created_at) VALUES({q(aid)},{q(cid)},{actor if report_id or resource_id else q(reporter)},{q('MOCK-'+state+'-'+tag+source.suffix)},{q(mime)},{len(raw)},{q(hashlib.sha256(raw).hexdigest())},{q(key)},{q(stage)},{'true' if public else 'false'},{q(thumbkey) if thumb else 'NULL'},{thumb.stat().st_size if thumb else 'NULL'},{q(report_id)},{q(resource_id)},{q(revision_id)},{tm(step)}) ON CONFLICT DO NOTHING;")
 attach(root/'road.jpg','citizen-photo','image/jpeg','BEFORE',public=True)
 attach(root/'road.mp4','citizen-video','video/mp4','BEFORE',public=True)
 if 'PROPOSE' in path:attach(root/'workflow-proposal.pdf','resource-proposal','application/pdf',resource_id=rid,revision_id=rev,step=5)
 if 'REPORT' in path:
  attach(root/'road.jpg','field-before','image/jpeg','BEFORE',report_id=report,public=True,step=path.index('REPORT')+1)
  attach(root/'road-after.jpg','field-after','image/jpeg','AFTER',report_id=report,public=True,step=path.index('REPORT')+1)
 for v in range(1,(i%9)+3):
  voter=str(uuid.uuid5(uuid.NAMESPACE_URL,f'mock-community-v1:cloud-demo-20261103:{a.municipality}:user:{v}'))
  sql.append(f"INSERT INTO complaint_vote(complaint_id,user_id) VALUES({q(cid)},{q(voter)}) ON CONFLICT DO NOTHING;")
 manifest.append({'id':cid,'status':state,'actions':path})
sql.append('COMMIT;')
(a.output/'seed.sql').write_text('\n'.join(sql)+'\n')
(a.output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print('Prepared all 18 complaint statuses with work orders, resource requests, revisions, PDFs, approvals, reports and audit history.')
