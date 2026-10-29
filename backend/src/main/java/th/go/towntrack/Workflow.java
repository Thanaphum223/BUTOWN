package th.go.towntrack;

import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class Workflow {
  final Db db;
  final Access access;

  public Workflow(Db d, Access a) {
    db = d;
    access = a;
  }

  public static final String[][] DEFAULT = {
    {"NEW", "TRIAGE", "TRIAGED", "OFFICER"},
    {"NEW", "REJECT", "REJECTED", "OFFICER"},
    {"TRIAGED", "ASSIGN", "ASSIGNED", "LEADER"},
    {"ASSIGNED", "ACCEPT", "ACCEPTED", "FIELD"},
    {"ASSIGNED", "DECLINE", "TRIAGED", "FIELD"},
    {"ACCEPTED", "REQUEST_RESOURCE", "RESOURCE_DRAFT", "FIELD"},
    {"ACCEPTED", "START", "IN_PROGRESS", "FIELD"},
    {"RESOURCE_DRAFT", "PROPOSE", "RESOURCE_CHECK", "LEADER"},
    {"RESOURCE_REVISION", "PROPOSE", "RESOURCE_CHECK", "LEADER"},
    {"RESOURCE_CHECK", "RETURN_RESOURCE", "RESOURCE_REVISION", "OFFICER"},
    {"RESOURCE_CHECK", "SEND_APPROVAL", "RESOURCE_APPROVAL", "OFFICER"},
    {"RESOURCE_APPROVAL", "APPROVE", "READY", "APPROVER"},
    {"RESOURCE_APPROVAL", "DENY", "TERMINATED", "APPROVER"},
    {"READY", "START", "IN_PROGRESS", "FIELD"},
    {"IN_PROGRESS", "REPORT", "LEADER_REVIEW", "FIELD"},
    {"FIELD_REVISION", "REPORT", "LEADER_REVIEW", "FIELD"},
    {"LEADER_REVIEW", "RETURN_FIELD", "FIELD_REVISION", "LEADER"},
    {"LEADER_REVIEW", "FORWARD_REPORT", "OFFICER_REVIEW", "LEADER"},
    {"OFFICER_REVIEW", "RETURN_LEADER", "LEADER_REVISION", "OFFICER"},
    {"LEADER_REVISION", "RETURN_FIELD", "FIELD_REVISION", "LEADER"},
    {"LEADER_REVISION", "FORWARD_REPORT", "OFFICER_REVIEW", "LEADER"},
    {"OFFICER_REVIEW", "VERIFY", "RESOLVED", "OFFICER"},
    {"RESOLVED", "CLOSE", "CLOSED", "OFFICER"}
  };

  public UUID createDefault(UUID municipality, int version) {
    UUID id = UUID.randomUUID();
    db.run(
        "INSERT INTO workflow_version(id,municipality_id,version,name,published)"
            + " VALUES(?,?,?,'กระบวนการมาตรฐาน',true)",
        id,
        municipality,
        version);
    for (var t : DEFAULT)
      db.run("INSERT INTO workflow_transition VALUES(?,?,?,?,?)", id, t[0], t[1], t[2], t[3]);
    return id;
  }

  public static String text(Map<String, Object> b, String key, int max) {
    Object x = b.get(key);
    if (!(x instanceof String s) || s.isBlank() || s.length() > max)
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "กรุณาระบุ " + key + " ให้ถูกต้อง");
    return s.trim();
  }

  public Map<String, Object> active(UUID id) {
    return db.one(
        "SELECT * FROM work_order WHERE complaint_id=? AND status NOT IN"
            + " ('DECLINED','COMPLETE','CANCELLED') ORDER BY created_at DESC LIMIT 1",
        id);
  }

  public void audit(
      Map<String, Object> u, UUID id, String action, String from, String to, String reason) {
    db.run(
        "INSERT INTO"
            + " audit_event(id,complaint_id,municipality_id,actor_id,action,from_status,to_status,reason)"
            + " VALUES(?,?,?,?,?,?,?,?)",
        UUID.randomUUID(),
        id,
        u.get("municipality_id"),
        u.get("id"),
        action,
        from,
        to,
        reason);
  }

  public void notifyUser(Object user, UUID id, String message) {
    if (user != null) {
      UUID notification = UUID.randomUUID();
      db.run(
          "INSERT INTO notification(id,user_id,complaint_id,message) VALUES(?,?,?,?)",
          notification,
          user,
          id,
          message);
      db.run(
          "INSERT INTO notification_delivery(notification_id,idempotency_key) SELECT ?,? WHERE"
              + " EXISTS(SELECT 1 FROM app_user WHERE id=? AND external_id LIKE 'line:%')",
          notification, UUID.randomUUID(), user);
    }
  }

  @Transactional
  public Map<String, Object> act(UUID id, Map<String, Object> b, Map<String, Object> u) {
    var c = access.complaint(id, u, true);
    if (!(b.get("version") instanceof Number inputVersion)
        || inputVersion.longValue() < 0
        || inputVersion.doubleValue() != inputVersion.longValue())
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "version ไม่ถูกต้อง");
    long expected = inputVersion.longValue();
    if (expected != ((Number) c.get("version")).longValue())
      throw new ResponseStatusException(HttpStatus.CONFLICT, "ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่");
    String action = text(b, "action", 40),
        reason = text(b, "reason", 4000),
        from = (String) c.get("status");
    var tr =
        db.one(
            "SELECT * FROM workflow_transition WHERE workflow_id=? AND from_status=? AND action=?",
            c.get("workflow_id"),
            from,
            action);
    access.role(u, (String) tr.get("role"));
    String to = (String) tr.get("to_status");
    switch (action) {
      case "TRIAGE" -> {
        var leader = access.target(b.get("leaderId"), u, "LEADER", u.get("department_id"));
        if (u.get("department_id") == null) Access.deny();
        db.run(
            "UPDATE complaint SET officer_id=?,leader_id=?,department_id=? WHERE id=?",
            u.get("id"),
            leader.get("id"),
            leader.get("department_id"),
            id);
        notifyUser(leader.get("id"), id, "มีคำร้องรอจัดทีม");
      }
      case "ASSIGN" -> {
        UUID teamId = b.get("teamId") == null ? null : Db.id(b.get("teamId"));
        Object assignee = b.get("assigneeId");
        if (teamId != null) {
          var team =
              db.one(
                  "SELECT * FROM field_team WHERE id=? AND municipality_id=? AND leader_id=? AND"
                      + " department_id=? AND active=true",
                  teamId,
                  u.get("municipality_id"),
                  u.get("id"),
                  c.get("department_id"));
          assignee = team.get("representative_id");
        }
        var target = access.target(assignee, u, "FIELD", c.get("department_id"));
        UUID workId = UUID.randomUUID();
        db.run(
            "INSERT INTO work_order(id,complaint_id,assignee_id,assigned_by,due_at,team_id)"
                + " VALUES(?,?,?,?,?,?)",
            workId,
            id,
            target.get("id"),
            u.get("id"),
            c.get("due_at"),
            teamId);
        if (teamId != null)
          db.run(
              "INSERT INTO work_member(work_order_id,user_id) SELECT ?,user_id FROM team_member"
                  + " WHERE team_id=?",
              workId,
              teamId);
        notifyUser(target.get("id"), id, "มีงานลงพื้นที่รอรับงาน");
      }
      case "ACCEPT", "DECLINE", "START", "REQUEST_RESOURCE", "REPORT" -> {
        var w = active(id);
        if (!u.get("id").equals(w.get("assignee_id"))) Access.deny();
        switch (action) {
          case "ACCEPT" ->
              db.run("UPDATE work_order SET status='ACCEPTED' WHERE id=?", w.get("id"));
          case "DECLINE" -> {
            db.run(
                "UPDATE work_order SET status='DECLINED',reason=? WHERE id=?", reason, w.get("id"));
            notifyUser(c.get("leader_id"), id, "ทีมปฏิเสธงาน กรุณามอบหมายใหม่");
          }
          case "START" ->
              db.run("UPDATE work_order SET status='IN_PROGRESS' WHERE id=?", w.get("id"));
          case "REQUEST_RESOURCE" -> {
            db.run(
                "INSERT INTO resource_request(id,complaint_id,work_order_id,requested_by)"
                    + " VALUES(?,?,?,?)",
                UUID.randomUUID(),
                id,
                w.get("id"),
                u.get("id"));
            notifyUser(c.get("leader_id"), id, "ทีมขอใช้ทรัพยากร กรุณาจัดทำข้อเสนอ");
          }
          case "REPORT" -> {
            String content = text(b, "content", 20000);
            UUID report = UUID.randomUUID();
            int n =
                ((Number)
                        db.one(
                                "SELECT COALESCE(MAX(revision),0)+1 n FROM field_report WHERE"
                                    + " work_order_id=?",
                                w.get("id"))
                            .get("n"))
                    .intValue();
            if (db.list(
                    "SELECT id FROM attachment WHERE complaint_id=? AND uploaded_by=? AND report_id"
                        + " IS NULL AND resource_id IS NULL",
                    id,
                    u.get("id"))
                .isEmpty())
              throw new ResponseStatusException(
                  HttpStatus.BAD_REQUEST, "กรุณาแนบหลักฐานก่อนส่งรายงาน");
            db.run(
                "INSERT INTO"
                    + " field_report(id,complaint_id,work_order_id,revision,content,submitted_by)"
                    + " VALUES(?,?,?,?,?,?)",
                report,
                id,
                w.get("id"),
                n,
                content,
                u.get("id"));
            db.run(
                "UPDATE attachment SET report_id=? WHERE complaint_id=? AND uploaded_by=? AND"
                    + " report_id IS NULL AND resource_id IS NULL",
                report,
                id,
                u.get("id"));
            notifyUser(c.get("leader_id"), id, "มีรายงานรอตรวจ");
          }
        }
      }
      case "PROPOSE" -> {
        var r = resource(id);
        String proposal = text(b, "proposal", 20000);
        java.math.BigDecimal amount;
        int days;
        try {
          amount = new java.math.BigDecimal(String.valueOf(b.get("amount")));
          days = Integer.parseInt(String.valueOf(b.get("durationDays")));
        } catch (Exception e) {
          throw new IllegalArgumentException();
        }
        if (amount.signum() < 0
            || amount.compareTo(new java.math.BigDecimal("999999999999.99")) > 0
            || amount.scale() > 2
            || days < 1
            || days > 3650) throw new IllegalArgumentException();
        if (db.list(
                "SELECT id FROM attachment WHERE complaint_id=? AND uploaded_by=? AND report_id IS"
                    + " NULL",
                id,
                u.get("id"))
            .isEmpty())
          throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "กรุณาแนบหลักฐานประกอบข้อเสนอ");
        int n =
            ((Number)
                    db.one(
                            "SELECT COALESCE(MAX(revision),0)+1 n FROM resource_revision WHERE"
                                + " resource_id=?",
                            r.get("id"))
                        .get("n"))
                .intValue();
        db.run(
            "INSERT INTO"
                + " resource_revision(id,resource_id,revision,proposal,amount,duration_days,submitted_by)"
                + " VALUES(?,?,?,?,?,?,?)",
            UUID.randomUUID(),
            r.get("id"),
            n,
            proposal,
            amount,
            days,
            u.get("id"));
        db.run(
            "UPDATE attachment SET resource_id=? WHERE complaint_id=? AND uploaded_by=? AND"
                + " report_id IS NULL AND resource_id IS NULL",
            r.get("id"),
            id,
            u.get("id"));
        db.run(
            "UPDATE resource_request SET status='CHECK',version=version+1 WHERE id=?", r.get("id"));
      }
      case "RETURN_RESOURCE", "SEND_APPROVAL", "APPROVE", "DENY" -> {
        var r = resource(id);
        if (action.equals("SEND_APPROVAL")) {
          int count =
              ((Number)
                      db.one(
                              "SELECT approval_stages FROM workflow_version WHERE id=?",
                              c.get("workflow_id"))
                          .get("approval_stages"))
                  .intValue();
          var ids =
              b.get("approverIds") instanceof List<?> list ? list : List.of(b.get("approverId"));
          if (ids.size() != count || new HashSet<>(ids).size() != count)
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "กรุณาเลือกผู้อนุมัติให้ครบตามลำดับและไม่ซ้ำคน");
          for (int i = 0; i < ids.size(); i++) {
            var target = access.target(ids.get(i), u, "APPROVER", c.get("department_id"));
            db.run(
                "INSERT INTO approval_assignment(resource_id,step,approver_id) VALUES(?,?,?)",
                r.get("id"),
                i + 1,
                target.get("id"));
          }
          db.run(
              "UPDATE resource_request SET approver_id=? WHERE id=?",
              Db.id(ids.getFirst()),
              r.get("id"));
          notifyUser(Db.id(ids.getFirst()), id, "มีคำขอทรัพยากรรออนุมัติ");
        }
        if (action.equals("APPROVE") || action.equals("DENY")) {
          if (!u.get("id").equals(r.get("approver_id"))) Access.deny();
          var step =
              db.one(
                  "SELECT * FROM approval_assignment WHERE resource_id=? AND decision IS NULL ORDER"
                      + " BY step LIMIT 1",
                  r.get("id"));
          if (!u.get("id").equals(step.get("approver_id"))) Access.deny();
          db.run(
              "UPDATE approval_assignment SET decision=?,reason=?,decided_at=now() WHERE"
                  + " resource_id=? AND step=? AND decision IS NULL",
              action,
              reason,
              r.get("id"),
              step.get("step"));
          if (action.equals("APPROVE")) {
            var next =
                db.list(
                    "SELECT approver_id FROM approval_assignment WHERE resource_id=? AND decision"
                        + " IS NULL ORDER BY step LIMIT 1",
                    r.get("id"));
            if (!next.isEmpty()) {
              to = "RESOURCE_APPROVAL";
              db.run(
                  "UPDATE resource_request SET approver_id=? WHERE id=?",
                  next.getFirst().get("approver_id"),
                  r.get("id"));
              notifyUser(
                  next.getFirst().get("approver_id"), id, "มีคำขอทรัพยากรรออนุมัติลำดับถัดไป");
            }
          }
        }
        String state =
            switch (action) {
              case "RETURN_RESOURCE" -> "REVISION";
              case "SEND_APPROVAL" -> "PENDING";
              case "APPROVE" -> to.equals("READY") ? "APPROVED" : "PENDING";
              default -> "DENIED";
            };
        db.run(
            "UPDATE resource_request SET status=?,version=version+1 WHERE id=?",
            state,
            r.get("id"));
        db.run(
            "INSERT INTO review(id,complaint_id,resource_id,actor_id,stage,decision,reason)"
                + " VALUES(?,?,?,?,?,?,?)",
            UUID.randomUUID(),
            id,
            r.get("id"),
            u.get("id"),
            from,
            action,
            reason);
        if (action.equals("DENY"))
          db.run(
              "UPDATE work_order SET status='CANCELLED' WHERE complaint_id=? AND status NOT IN"
                  + " ('DECLINED','COMPLETE')",
              id);
      }
      case "RETURN_FIELD", "FORWARD_REPORT", "RETURN_LEADER", "VERIFY" -> {
        var report =
            db.one(
                "SELECT id FROM field_report WHERE complaint_id=? ORDER BY created_at DESC LIMIT 1",
                id);
        db.run(
            "INSERT INTO review(id,complaint_id,report_id,actor_id,stage,decision,reason)"
                + " VALUES(?,?,?,?,?,?,?)",
            UUID.randomUUID(),
            id,
            report.get("id"),
            u.get("id"),
            from,
            action,
            reason);
      }
      case "CLOSE" ->
          db.run(
              "UPDATE work_order SET status='COMPLETE' WHERE complaint_id=? AND status NOT IN"
                  + " ('DECLINED','CANCELLED')",
              id);
      case "REJECT" -> {}
      default ->
          throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ไม่รองรับการดำเนินการนี้");
    }
    db.run("UPDATE complaint SET status=?,version=version+1,updated_at=now() WHERE id=?", to, id);
    audit(u, id, action, from, to, reason);
    notifyUser(c.get("reporter_id"), id, "สถานะคำร้องเปลี่ยนเป็น " + to);
    for (var f :
        db.list(
            "SELECT user_id FROM follower WHERE complaint_id=? AND user_id<>?",
            id,
            c.get("reporter_id")))
      notifyUser(f.get("user_id"), id, "คำร้องที่ติดตามมีความคืบหน้า: " + to);
    notifyUser(c.get("officer_id"), id, "คำร้องมีการดำเนินการ: " + action);
    notifyUser(c.get("leader_id"), id, "คำร้องมีการดำเนินการ: " + action);
    return Map.of("id", id, "status", to, "version", expected + 1);
  }

  public Map<String, Object> resource(UUID id) {
    return db.one(
        "SELECT * FROM resource_request WHERE complaint_id=? ORDER BY created_at DESC LIMIT 1", id);
  }
}
