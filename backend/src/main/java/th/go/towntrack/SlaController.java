package th.go.towntrack;

import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Two clocks, both in calendar days from when the system received the report: the reporter must
 * hear about progress within 15 days of the last update, and each category sets its own time to
 * resolve. Extensions keep the old deadline on record.
 */
@RestController
@RequestMapping("/api/complaints/{id}")
public class SlaController {
  static final int PROGRESS_DAYS = 15;
  static final int MAX_DAYS = 15;
  static final int MAX_EXTENSIONS = 2;
  static final List<String> CLOSED = List.of("CLOSED", "REJECTED", "TERMINATED");
  final Db db;
  final Access access;
  final Workflow workflow;

  public SlaController(Db db, Access access, Workflow workflow) {
    this.db = db;
    this.access = access;
    this.workflow = workflow;
  }

  @GetMapping("/sla")
  public Object sla(@PathVariable UUID id, Authentication a) {
    var u = access.user(a);
    access.complaint(id, u, false);
    var clocks =
        db.one(
            "SELECT c.created_at,c.due_at,c.status,(SELECT max(e.created_at) FROM audit_event e"
                + " WHERE e.complaint_id=c.id)+make_interval(days=>?) progress_due_at FROM"
                + " complaint c WHERE c.id=?",
            PROGRESS_DAYS,
            id);
    var result = new LinkedHashMap<String, Object>(clocks);
    result.put("progress_days", PROGRESS_DAYS);
    result.put("open", !CLOSED.contains(clocks.get("status")));
    result.put(
        "extensions",
        db.list(
            "SELECT x.id,x.reason,x.days,x.previous_due_at,x.requested_due_at,x.status,"
                + "x.decision_reason,x.decided_at,x.created_at,r.display_name requested_by_name,r.gov_role requested_by_gov_role,"
                + "d.display_name decided_by_name,d.gov_role decided_by_gov_role FROM sla_extension x JOIN app_user r ON"
                + " r.id=x.requested_by LEFT JOIN app_user d ON d.id=x.decided_by WHERE"
                + " x.complaint_id=? ORDER BY x.created_at DESC",
            id));
    result.put("maxExtensions", MAX_EXTENSIONS);
    result.put("remainingExtensions", Math.max(0, MAX_EXTENSIONS - used(id)));
    String role = (String) u.get("role");
    result.put(
        "canRequest",
        "LEADER".equals(role)
            && u.get("id")
                .equals(db.one("SELECT leader_id FROM complaint WHERE id=?", id).get("leader_id"))
            && !CLOSED.contains(clocks.get("status")));
    result.put("canDecide", List.of("APPROVER", "ADMIN").contains(role));
    return result;
  }

  int used(UUID id) {
    return ((Number)
            db.one(
                    "SELECT count(*) n FROM sla_extension WHERE complaint_id=? AND status IN"
                        + " ('PENDING','APPROVED')",
                    id)
                .get("n"))
        .intValue();
  }

  @PostMapping("/sla-extensions")
  @Transactional
  public Object request(
      @PathVariable UUID id, @RequestBody Map<String, Object> b, Authentication a) {
    var u = access.user(a);
    access.role(u, "LEADER");
    var c = access.complaint(id, u, true);
    if (CLOSED.contains(c.get("status")))
      throw new ResponseStatusException(HttpStatus.CONFLICT, "คำร้องนี้ปิดแล้ว ขยายเวลาไม่ได้");
    String reason = Workflow.text(b, "reason", 4000);
    if (!(b.get("days") instanceof Number n)
        || n.doubleValue() != n.intValue()
        || n.intValue() < 1
        || n.intValue() > MAX_DAYS)
      throw new IllegalArgumentException("ขยายเวลาได้ครั้งละ 1–15 วัน");
    if (!db.list("SELECT id FROM sla_extension WHERE complaint_id=? AND status='PENDING'", id)
        .isEmpty())
      throw new ResponseStatusException(HttpStatus.CONFLICT, "มีคำขอขยายเวลารอพิจารณาอยู่แล้ว");
    if (used(id) >= MAX_EXTENSIONS)
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "ขอขยายเวลาครบจำนวนสูงสุด 2 ครั้งต่อคำร้องแล้ว");
    UUID extension = UUID.randomUUID();
    db.run(
        "INSERT INTO sla_extension(id,complaint_id,requested_by,reason,days,previous_due_at,"
            + "requested_due_at) VALUES(?,?,?,?,?,?,GREATEST(?::timestamptz,now())+make_interval(days=>?))",
        extension,
        id,
        u.get("id"),
        reason,
        n.intValue(),
        c.get("due_at"),
        c.get("due_at"),
        n.intValue());
    workflow.audit(
        u,
        id,
        "REQUEST_EXTENSION",
        (String) c.get("status"),
        (String) c.get("status"),
        reason,
        Map.of("days", n.intValue()));
    var recipients = new LinkedHashSet<Object>();
    for (var approver :
        db.list(
            "SELECT id FROM app_user WHERE municipality_id=? AND role='APPROVER' AND enabled=true",
            u.get("municipality_id"))) recipients.add(approver.get("id"));
    recipients.add(c.get("officer_id"));
    for (Object recipient : recipients)
      workflow.notifyUser(recipient, id, "หัวหน้าขอขยายระยะเวลาดำเนินการ รอพิจารณา");
    return Map.of("id", extension);
  }

  @PostMapping("/sla-extensions/{extensionId}/decision")
  @Transactional
  public Object decide(
      @PathVariable UUID id,
      @PathVariable UUID extensionId,
      @RequestBody Map<String, Object> b,
      Authentication a) {
    var u = access.user(a);
    access.role(u, "APPROVER", "ADMIN");
    var c = access.complaint(id, u, true);
    if (CLOSED.contains(c.get("status")))
      throw new ResponseStatusException(HttpStatus.CONFLICT, "คำร้องนี้ปิดแล้ว ขยายเวลาไม่ได้");
    if (!(b.get("approve") instanceof Boolean approve)) throw new IllegalArgumentException();
    String reason = Workflow.text(b, "reason", 4000);
    var x =
        db.one(
            "SELECT * FROM sla_extension WHERE id=? AND complaint_id=? AND status='PENDING' FOR"
                + " UPDATE",
            extensionId,
            id);
    db.run(
        "UPDATE sla_extension SET status=?,decided_by=?,decision_reason=?,decided_at=now() WHERE"
            + " id=?",
        approve ? "APPROVED" : "REJECTED",
        u.get("id"),
        reason,
        extensionId);
    if (approve) {
      db.run(
          "UPDATE complaint SET due_at=?,version=version+1,updated_at=now() WHERE id=?",
          x.get("requested_due_at"),
          id);
      db.run(
          "UPDATE work_order SET due_at=? WHERE complaint_id=? AND NOT handed_off AND status NOT IN"
              + " ('DECLINED','COMPLETE','CANCELLED')",
          x.get("requested_due_at"),
          id);
      // The overdue reminder may fire again for the new deadline.
      db.run("DELETE FROM sla_reminder WHERE complaint_id=? AND reminder_type='RESOLUTION'", id);
      workflow.notifyUser(
          c.get("reporter_id"),
          id,
          "เทศบาลขยายระยะเวลาดำเนินการ กรุณาดูกำหนดใหม่ในรายละเอียดคำร้อง");
    }
    workflow.audit(
        u,
        id,
        approve ? "APPROVE_EXTENSION" : "REJECT_EXTENSION",
        (String) c.get("status"),
        (String) c.get("status"),
        reason,
        Map.of(
            "previousDueAt",
            String.valueOf(x.get("previous_due_at")),
            "requestedDueAt",
            String.valueOf(x.get("requested_due_at"))));
    workflow.notifyUser(
        x.get("requested_by"),
        id,
        approve ? "คำขอขยายระยะเวลาได้รับอนุมัติ" : "คำขอขยายระยะเวลาไม่ได้รับอนุมัติ");
    return Map.of("id", extensionId, "status", approve ? "APPROVED" : "REJECTED");
  }
}
