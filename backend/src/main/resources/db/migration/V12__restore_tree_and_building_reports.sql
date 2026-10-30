-- Restore the requested categories without changing historical complaint references.
UPDATE category SET active=true WHERE name IN ('ต้นไม้ล้ม / กิ่งไม้เสี่ยงอันตราย','อาคารเสี่ยงอันตราย / ก่อสร้างผิดข้อบัญญัติ');
INSERT INTO category(id,municipality_id,department_id,workflow_id,name,sla_hours)
SELECT gen_random_uuid(),c.municipality_id,c.department_id,c.workflow_id,n.name,c.sla_hours
FROM (SELECT DISTINCT ON (municipality_id) * FROM category WHERE active=true ORDER BY municipality_id,name) c
CROSS JOIN (VALUES ('ต้นไม้ล้ม / กิ่งไม้เสี่ยงอันตราย'),('อาคารเสี่ยงอันตราย / ก่อสร้างผิดข้อบัญญัติ')) n(name)
WHERE NOT EXISTS (SELECT 1 FROM category existing WHERE existing.municipality_id=c.municipality_id AND existing.name=n.name);
