package th.go.towntrack;

import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Private questions and answers between the reporter and the staff handling the report. */
@RestController
@RequestMapping("/api/complaints/{id}/messages")
public class ComplaintMessageController {
  final Db db;
  final Access access;
  final Workflow workflow;

  public ComplaintMessageController(Db db, Access access, Workflow workflow) {
    this.db = db;
    this.access = access;
    this.workflow = workflow;
  }

  static final Map<String, String> ROLE_NAMES =
      Map.of(
          "OFFICER", "เจ้าหน้าที่รับเรื่อง",
          "LEADER", "หัวหน้าผู้ลงพื้นที่",
          "FIELD", "ผู้ลงพื้นที่",
          "APPROVER", "ผู้อนุมัติ",
          "ADMIN", "ผู้ดูแลระบบ");

  @GetMapping
  public Object list(@PathVariable UUID id, Authentication a) {
    var u = access.user(a);
    access.complaint(id, u, false);
    boolean citizen = "CITIZEN".equals(u.get("role"));
    var result = new ArrayList<Map<String, Object>>();
    for (var row :
        db.list(
            "SELECT m.id,m.sender_id,m.sender_role,p.display_name sender_name,m.body,m.created_at"
                + " FROM complaint_message m JOIN app_user p ON p.id=m.sender_id WHERE"
                + " m.complaint_id=? ORDER BY m.created_at,m.id",
            id)) {
      var message = new LinkedHashMap<String, Object>(row);
      // Reporters see which role is asking, not the staff member's account.
      if (citizen && !"CITIZEN".equals(row.get("sender_role")))
        message.put("sender_name", ROLE_NAMES.get((String) row.get("sender_role")));
      message.put("mine", u.get("id").equals(row.get("sender_id")));
      result.add(message);
    }
    return result;
  }

  @PostMapping
  @Transactional
  public Object send(@PathVariable UUID id, @RequestBody Map<String, Object> b, Authentication a) {
    var u = access.user(a);
    access.role(u, "CITIZEN", "OFFICER", "LEADER", "FIELD", "ADMIN");
    var c = access.complaint(id, u, true);
    if (SlaController.CLOSED.contains(c.get("status")))
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "คำร้องนี้ปิดแล้ว ไม่สามารถส่งข้อความเพิ่มเติมได้");
    var open =
        db.list(
            "SELECT id,assignee_id FROM work_order WHERE complaint_id=? AND NOT handed_off AND"
                + " status NOT IN ('DECLINED','COMPLETE','CANCELLED')",
            id);
    if ("FIELD".equals(u.get("role"))
        && open.stream()
            .noneMatch(
                w ->
                    u.get("id").equals(w.get("assignee_id"))
                        || !db.list(
                                "SELECT user_id FROM work_member WHERE work_order_id=? AND"
                                    + " user_id=?",
                                w.get("id"),
                                u.get("id"))
                            .isEmpty())) Access.deny();
    if (!(b.get("body") instanceof String raw)) throw new IllegalArgumentException();
    String body = raw.strip();
    if (body.isEmpty() || body.length() > 2000)
      throw new IllegalArgumentException("ข้อความต้องมี 1–2000 ตัวอักษร");
    UUID message = UUID.randomUUID();
    // clock_timestamp keeps the order of messages sent within one transaction.
    db.run(
        "INSERT INTO complaint_message(id,complaint_id,municipality_id,sender_id,sender_role,body,"
            + "created_at) VALUES(?,?,?,?,?,?,clock_timestamp())",
        message,
        id,
        u.get("municipality_id"),
        u.get("id"),
        u.get("role"),
        body);
    var recipients = new LinkedHashSet<Object>();
    boolean citizen = "CITIZEN".equals(u.get("role"));
    if (citizen) {
      recipients.add(c.get("officer_id"));
      recipients.add(c.get("leader_id"));
      for (var w : open) recipients.add(w.get("assignee_id"));
    } else recipients.add(c.get("reporter_id"));
    recipients.remove(u.get("id"));
    for (Object recipient : recipients)
      workflow.notifyUser(
          recipient,
          id,
          citizen
              ? "ผู้แจ้งตอบกลับข้อความเพิ่มเติมในคำร้อง"
              : "เจ้าหน้าที่มีคำถามเพิ่มเติมเกี่ยวกับคำร้องของคุณ");
    return Map.of("id", message);
  }
}
