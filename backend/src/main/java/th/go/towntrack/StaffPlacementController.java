package th.go.towntrack;

import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Staff whose Gov role needs a department wait for one after their first sign-in. A department head
 * accepts field staff into their own department; the mayor or municipal clerk places heads. Only
 * the department changes here, never the role, and only while the account has none.
 */
@RestController
@RequestMapping("/api/staff-placement")
public class StaffPlacementController {
  static final Set<String> HEAD_PLACERS = Set.of("MAYOR", "MUNICIPAL_CLERK");
  final Db db;
  final Access access;
  final Workflow workflow;

  public StaffPlacementController(Db db, Access access, Workflow workflow) {
    this.db = db;
    this.access = access;
    this.workflow = workflow;
  }

  /** The role this user may place. */
  String placeable(Map<String, Object> u) {
    access.role(u, "LEADER", "APPROVER");
    if ("LEADER".equals(u.get("role")) && u.get("department_id") != null) return "FIELD";
    if ("APPROVER".equals(u.get("role"))
        && u.get("gov_role") != null
        && HEAD_PLACERS.contains(u.get("gov_role"))) return "LEADER";
    throw new ResponseStatusException(HttpStatus.FORBIDDEN, "ไม่มีสิทธิ์ดำเนินการ");
  }

  @GetMapping
  public Object list(Authentication a) {
    var u = access.user(a);
    String role = placeable(u);
    Object own = role.equals("FIELD") ? u.get("department_id") : null;
    return Map.of(
        "role",
        role,
        "people",
        db.list(
            "SELECT id,display_name,role,gov_role,created_at FROM app_user WHERE municipality_id=?"
                + " AND role=? AND department_id IS NULL AND enabled=true AND deleted_at IS NULL"
                + " ORDER BY created_at,id",
            u.get("municipality_id"),
            role),
        "departments",
        db.list(
            "SELECT id,name FROM department WHERE municipality_id=? AND deleted_at IS NULL AND"
                + " (?::uuid IS NULL OR id=?) ORDER BY name",
            u.get("municipality_id"),
            own,
            own));
  }

  @PostMapping("/{id}")
  @Transactional
  public void place(@PathVariable UUID id, @RequestBody Map<String, Object> b, Authentication a) {
    // Same lock order as the administrator's account and department changes.
    db.one(
        "SELECT id FROM municipality WHERE id=? FOR KEY SHARE",
        access.user(a).get("municipality_id"));
    // The actor may have been moved, disabled or demoted while waiting.
    var u = access.user(a);
    String role = placeable(u);
    if (id.equals(u.get("id"))) Access.deny();
    UUID department = Db.id(b.get("departmentId"));
    if (role.equals("FIELD") && !department.equals(u.get("department_id"))) Access.deny();
    var chosen =
        db.one(
            "SELECT name FROM department WHERE id=? AND municipality_id=? AND deleted_at IS NULL"
                + " FOR SHARE",
            department,
            u.get("municipality_id"));
    var target =
        db.one(
            "SELECT username,role,department_id FROM app_user WHERE id=? AND municipality_id=? AND"
                + " enabled=true AND deleted_at IS NULL FOR UPDATE",
            id,
            u.get("municipality_id"));
    if (!role.equals(target.get("role"))) Access.deny();
    if (target.get("department_id") != null)
      throw new ResponseStatusException(HttpStatus.CONFLICT, "บัญชีนี้มีกองแล้ว กรุณาโหลดใหม่");
    db.run("UPDATE app_user SET department_id=? WHERE id=?", department, id);
    workflow.audit(
        u,
        null,
        "USER_DEPARTMENT",
        null,
        null,
        "บัญชี " + target.get("username") + " role=" + role + " department=null->" + department);
    workflow.notifyUser(id, null, "คุณได้รับการกำหนดกองแล้ว: " + chosen.get("name"));
  }

  /** Tells whoever can place a newly arrived account, or the administrators when nobody can. */
  public void notifyWaiting(UUID town, Object account, String role, String name) {
    var recipients =
        role.equals("FIELD")
            ? db.list(
                "SELECT id FROM app_user WHERE municipality_id=? AND role='LEADER' AND"
                    + " department_id IS NOT NULL AND enabled=true AND deleted_at IS NULL",
                town)
            : db.list(
                "SELECT id FROM app_user WHERE municipality_id=? AND role='APPROVER' AND gov_role IN ('"
                    + String.join("','", HEAD_PLACERS)
                    + "') AND enabled=true AND deleted_at IS NULL",
                town);
    if (recipients.isEmpty())
      recipients =
          db.list(
              "SELECT id FROM app_user WHERE municipality_id=? AND role='ADMIN' AND enabled=true AND"
                  + " deleted_at IS NULL",
              town);
    // A name has at most 200 characters, so the notice stays within its 300.
    String message =
        (role.equals("FIELD") ? "มีผู้ลงพื้นที่รอกำหนดกอง: " : "มีหัวหน้าผู้ลงพื้นที่รอกำหนดกอง: ")
            + name;
    for (var recipient : recipients)
      if (!recipient.get("id").equals(account))
        workflow.notifyUser(recipient.get("id"), null, message);
  }
}
