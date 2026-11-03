#!/usr/bin/env python3
"""Generate additive, repeatable demo SQL and attachment files for a test municipality.
Run: python3 scripts/seed-community-demo.py --municipality UUID --output work/community-demo
Review SQL, scan/copy files into FILE_ROOT, then apply SQL using psql -v ON_ERROR_STOP=1.
Never run this fixture on a production database.
"""
import argparse, hashlib, json, math, shutil, uuid
from pathlib import Path

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--municipality',type=uuid.UUID,required=True)
p.add_argument('--latitude',type=float,default=14.017)
p.add_argument('--longitude',type=float,default=100.416)
p.add_argument('--output',type=Path,required=True)
a=p.parse_args()
if not (-90<=a.latitude<=90 and -180<=a.longitude<=180): p.error('Invalid coordinates')
a.output.mkdir(parents=True,exist_ok=True)
files=a.output/'files';files.mkdir(exist_ok=True)
namespace=f'mock-community-v1:cloud-demo-20261103:{a.municipality}'
def ident(s):return str(uuid.uuid5(uuid.NAMESPACE_URL,namespace+':'+s))
def q(s):return "'"+str(s).replace("'","''")+"'"
mid=q(a.municipality)
sql=['BEGIN;',f"DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM municipality WHERE id={mid}) THEN RAISE EXCEPTION 'Unknown test municipality'; END IF; END $$;"]
first=['กมล','พิมพ์','ธนา','วารี','นภา','สุเมธ','กานต์','มาลี']
for n in range(1,41):
 sql.append(f"INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role,enabled) VALUES({q(ident('user:'+str(n)))},{mid},{q('mock_demo_'+a.municipality.hex[:8]+'_'+str(n).zfill(2))},'LOGIN_DISABLED',{q(first[(n-1)%8]+' จำลอง '+str(n)+' (MOCK)')},'CITIZEN',false) ON CONFLICT DO NOTHING;")
categories={'road':'ถนนและทางเท้า','drain':'ท่อระบายน้ำ / น้ำท่วมขัง','trash':'ขยะตกค้าง / ลักลอบทิ้งขยะ'}
titles={'road':'ผิวถนนเป็นหลุมและมีน้ำขังบริเวณทางเข้าชุมชน','drain':'น้ำระบายช้าและมีเศษใบไม้อุดตันหน้าตะแกรง','trash':'ขยะตกค้างข้างถังสาธารณะ ส่งกลิ่นรบกวน'}
descriptions={'road':'พบผิวถนนแตกร้าวเป็นหลุม รถจักรยานยนต์ต้องชะลอและหลบจุดน้ำขัง ขอให้ตรวจสภาพถนนและซ่อมผิวทาง','drain':'หลังฝนตกน้ำขังริมถนนหลายชั่วโมง พบใบไม้และเศษพลาสติกติดตะแกรง ขอให้เปิดทางระบายน้ำและเก็บสิ่งอุดตัน','trash':'มีถุงขยะและขวดพลาสติกตกค้างข้างถังต่อเนื่องหลายวัน ขอให้จัดเก็บและตรวจรอบรถเก็บขยะ'}
votes=[38,31,27,23,19,16,14,11,9,7,5,3]
manifest=[]
for i in range(12):
 n=i+1;kind=['road','drain','trash'][i%3];cid=ident('case:'+str(n));uid=ident('user:'+str(n));external=namespace+':'+str(n)
 lat=a.latitude+math.sin(i*2.4)*(0.004+i*0.0012);lon=a.longitude+math.cos(i*2.4)*(0.004+i*0.0012)
 sql.append(f"DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM category WHERE municipality_id={mid} AND name={q(categories[kind])} AND active) THEN RAISE EXCEPTION 'Missing demo category'; END IF; END $$;")
 sql.append(f"INSERT INTO complaint(id,municipality_id,category_id,reporter_id,department_id,workflow_id,title,description,address,location,status,due_at,created_at,updated_at,external_id) SELECT {q(cid)},{mid},k.id,{q(uid)},k.department_id,k.workflow_id,{q('[MOCK] '+titles[kind]+' จุดที่ '+str((i//3)+1))},{q(descriptions[kind]+' — ข้อมูลจำลองสำหรับทดสอบ ไม่ใช่เหตุการณ์จริง ภาพสร้างขึ้นและคลิปเป็นภาพนิ่งเคลื่อนไหวตามเวลา')},{q('ซอยชุมชนจำลอง '+str(n)+' พื้นที่ทดสอบปทุมธานี (ไม่ใช่ที่อยู่จริง)')},ST_SetSRID(ST_MakePoint({lon},{lat}),4326)::geography,'NEW',now()+interval '3 days',now()-interval '{n*3} hours',now()-interval '{n*3} hours',{q(external)} FROM category k WHERE municipality_id={mid} AND name={q(categories[kind])} AND active ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;")
 sql.append(f"INSERT INTO audit_event(id,complaint_id,municipality_id,actor_id,action,to_status,reason,details,created_at) VALUES({q(ident('audit:'+str(n)))},{q(cid)},{mid},{q(uid)},'CREATE','NEW','สร้างคำร้องจำลองสำหรับทดสอบ ไม่ใช่เหตุการณ์จริง','{{\"mock\":true}}',now()-interval '{n*3} hours') ON CONFLICT DO NOTHING;")
 for v in range(1,votes[i]+1):
  sql.append(f"INSERT INTO complaint_vote(complaint_id,user_id) VALUES({q(cid)},{q(ident('user:'+str(v)))}) ON CONFLICT DO NOTHING;")
 for v in range(1,min(6,n)+1):
  sql.append(f"INSERT INTO follower(complaint_id,user_id) VALUES({q(cid)},{q(ident('user:'+str(v)))}) ON CONFLICT DO NOTHING;")
 for ext,mime in [('jpg','image/jpeg'),('mp4','video/mp4')]:
  source=Path(__file__).resolve().parent.parent/'testdata/community-demo/media'/f'{kind}.{ext}'
  aid=ident(f'attachment:{n}:{ext}');key=aid+'.'+ext;shutil.copyfile(source,files/key)
  raw=source.read_bytes();name=f'MOCK-{kind}-{n:02d}.'+ext
  sql.append(f"INSERT INTO attachment(id,complaint_id,uploaded_by,original_name,content_type,size_bytes,sha256,storage_key,evidence_stage,public_approved,created_at) VALUES({q(aid)},{q(cid)},{q(uid)},{q(name)},{q(mime)},{len(raw)},{q(hashlib.sha256(raw).hexdigest())},{q(key)},'BEFORE',true,now()-interval '{n*3} hours'+interval '{0 if ext=='jpg' else 1} seconds') ON CONFLICT DO NOTHING;")
  if ext=='jpg':
   thumb=source.with_stem(source.stem+'-thumb');thumbkey=aid+'-thumb.jpg';shutil.copyfile(thumb,files/thumbkey)
   sql.append(f"UPDATE attachment SET thumbnail_key={q(thumbkey)},thumbnail_size={thumb.stat().st_size} WHERE id={q(aid)} AND complaint_id={q(cid)} AND sha256={q(hashlib.sha256(raw).hexdigest())};")
 manifest.append({'id':cid,'category':kind,'votes':votes[i],'latitude':lat,'longitude':lon})
sql.append('COMMIT;')
(a.output/'seed.sql').write_text('\n'.join(sql)+'\n')
(a.output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print(f'Prepared 12 complaints, 40 login-disabled citizens, {sum(votes)} votes, 24 attachments in {a.output}')
