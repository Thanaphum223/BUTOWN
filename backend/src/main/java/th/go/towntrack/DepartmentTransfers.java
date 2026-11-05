package th.go.towntrack;

import java.util.*;
import org.springframework.stereotype.Component;

@Component
public class DepartmentTransfers {
  final Db db;
  final Access access;

  DepartmentTransfers(Db db, Access access) {
    this.db = db;
    this.access = access;
  }

  Map<String, Object> pending(UUID id) {
    return db.one("SELECT * FROM department_transfer WHERE complaint_id=? AND state='PENDING'", id);
  }

  void request(
      Map<String, Object> c,
      Map<String, Object> b,
      Map<String, Object> user,
      String reason,
      Object reportId) {
    UUID target = Db.id(b.get("targetDepartmentId"));
    department(target, user);
    if (target.equals(c.get("department_id")))
      throw new IllegalArgumentException("กรุณาเลือกกองอื่นที่จะรับช่วงต่อ");
    db.run(
        "INSERT INTO department_transfer(id,complaint_id,municipality_id,source_department_id,target_department_id,requested_by,report_id,reason,state) VALUES(?,?,?,?,?,?,?,?,'PENDING')",
        UUID.randomUUID(),
        c.get("id"),
        user.get("municipality_id"),
        c.get("department_id"),
        target,
        user.get("id"),
        reportId,
        reason);
  }

  void department(Object id, Map<String, Object> user) {
    db.one(
        "SELECT id FROM department WHERE id=? AND municipality_id=?",
        id,
        user.get("municipality_id"));
  }

  Map<String, Object> dispatch(
      Map<String, Object> c, Map<String, Object> b, Map<String, Object> user, String reason) {
    UUID id = (UUID) c.get("id");
    var request = "TRANSFER_PENDING".equals(c.get("status")) ? pending(id) : null;
    Object target =
        request == null ? Db.id(b.get("targetDepartmentId")) : request.get("target_department_id");
    department(target, user);
    if (target.equals(c.get("department_id")))
      throw new IllegalArgumentException("กรุณาเลือกกองอื่นที่จะรับช่วงต่อ");
    if (b.containsKey("targetDepartmentId") && !target.equals(Db.id(b.get("targetDepartmentId"))))
      throw new IllegalArgumentException("หน่วยงานไม่ตรงกับคำขอส่งต่อ");
    var leader = access.target(b.get("leaderId"), user, "LEADER", target);
    db.run(
        "UPDATE work_order SET status=CASE WHEN status IN ('DECLINED','CANCELLED') THEN status ELSE 'COMPLETE' END,handed_off=true WHERE complaint_id=? AND NOT handed_off",
        id);
    db.run("UPDATE resource_request SET handed_off=true WHERE complaint_id=?", id);
    db.run(
        "UPDATE complaint SET leader_id=?,department_id=?,officer_id=?,assignment_details='{}'::jsonb WHERE id=?",
        leader.get("id"),
        target,
        user.get("id"),
        id);
    if (request != null)
      db.run(
          "UPDATE department_transfer SET state='ACCEPTED',reviewed_by=?,review_reason=?,reviewed_at=clock_timestamp() WHERE id=?",
          user.get("id"),
          reason,
          request.get("id"));
    return leader;
  }

  void returnRequest(UUID id, Map<String, Object> user, String reason) {
    var request = pending(id);
    db.run(
        "UPDATE department_transfer SET state='RETURNED',reviewed_by=?,review_reason=?,reviewed_at=clock_timestamp() WHERE id=?",
        user.get("id"),
        reason,
        request.get("id"));
  }

  void publicProgress(Map<String, Object> c) {
    var rows =
        db.list(
            "SELECT d.name FROM department_transfer t JOIN department d ON d.id=t.target_department_id WHERE t.complaint_id=? AND t.state IN ('PENDING','ACCEPTED') AND d.id=CASE WHEN t.state='PENDING' THEN t.target_department_id ELSE (SELECT department_id FROM complaint WHERE id=t.complaint_id) END ORDER BY t.created_at DESC LIMIT 1",
            c.get("id"));
    if (!rows.isEmpty() && !List.of("CLOSED", "REJECTED", "TERMINATED").contains(c.get("status")))
      c.put("transfer_department_name", rows.getFirst().get("name"));
  }
}
