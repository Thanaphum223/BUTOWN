package th.go.towntrack;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/admin")
public class AdminController {
  final Db db;
  final Access access;
  final Workflow workflow;
  final PasswordEncoder encoder;
  final ObjectMapper json;
  final ExternalLoginSessions sessions;

  public AdminController(
      Db d,
      Access a,
      Workflow w,
      PasswordEncoder e,
      ObjectMapper j,
      ExternalLoginSessions sessions) {
    db = d;
    access = a;
    workflow = w;
    encoder = e;
    json = j;
    this.sessions = sessions;
  }

  Map<String, Object> admin(Authentication a) {
    var u = access.user(a);
    access.role(u, "ADMIN");
    return u;
  }

  Map<String, Object> lockedAdmin(Authentication a) {
    var u = admin(a);
    db.one("SELECT id FROM municipality WHERE id=? FOR UPDATE", u.get("municipality_id"));
    // The actor may have been removed, disabled or demoted while waiting.
    return admin(a);
  }

  @GetMapping
  public Object config(Authentication a) {
    var u = admin(a);
    return Map.of(
        "currentUserId",
        u.get("id"),
        "municipality",
        db.one("SELECT id,name FROM municipality WHERE id=?", u.get("municipality_id")),
        "users",
        db.list(
            "SELECT id,username,display_name,role,gov_role,department_id,enabled FROM app_user WHERE"
                + " municipality_id=? AND deleted_at IS NULL ORDER BY created_at",
            u.get("municipality_id")),
        "departments",
        db.list(
            "SELECT id,name FROM department WHERE municipality_id=? AND deleted_at IS NULL",
            u.get("municipality_id")),
        "categories",
        db.list(
            "SELECT *,fields::text field_schema FROM category WHERE municipality_id=? ORDER BY"
                + " name",
            u.get("municipality_id")),
        "workflows",
        db.list(
            "SELECT * FROM workflow_version WHERE municipality_id=? ORDER BY version DESC",
            u.get("municipality_id")));
  }

  @PostMapping("/municipality")
  public void rename(@RequestBody Map<String, Object> b, Authentication a) {
    var u = admin(a);
    db.run(
        "UPDATE municipality SET name=? WHERE id=?",
        Workflow.text(b, "name", 200),
        u.get("municipality_id"));
  }

  @PostMapping("/departments")
  public Object department(@RequestBody Map<String, Object> b, Authentication a) {
    var u = admin(a);
    UUID id = UUID.randomUUID();
    db.run(
        "INSERT INTO department(id,municipality_id,name) VALUES(?,?,?)",
        id,
        u.get("municipality_id"),
        Workflow.text(b, "name", 200));
    return Map.of("id", id);
  }

  @PostMapping("/departments/{id}")
  @Transactional
  public void renameDepartment(
      @PathVariable UUID id, @RequestBody Map<String, Object> b, Authentication a) {
    var u = lockedAdmin(a);
    var department =
        db.one(
            "SELECT id,name FROM department WHERE id=? AND municipality_id=? AND deleted_at IS NULL FOR UPDATE",
            id,
            u.get("municipality_id"));
    String name = Workflow.text(b, "name", 200);
    db.run(
        "UPDATE department SET name=? WHERE id=? AND municipality_id=?",
        name,
        id,
        u.get("municipality_id"));
    workflow.audit(
        u,
        null,
        "DEPARTMENT_RENAME",
        null,
        null,
        "กอง " + id + " " + department.get("name") + " -> " + name);
  }

  @DeleteMapping("/departments/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @Transactional
  public void deleteDepartment(@PathVariable UUID id, Authentication a) {
    var u = lockedAdmin(a);
    var department =
        db.one(
            "SELECT id,name,deleted_at FROM department WHERE id=? AND municipality_id=? FOR UPDATE",
            id,
            u.get("municipality_id"));
    if (department.get("deleted_at") != null) return;
    var dependencies =
        db.list(
            "SELECT 'staff' dependency WHERE EXISTS(SELECT 1 FROM app_user WHERE department_id=? AND deleted_at IS NULL)"
                + " UNION ALL SELECT 'categories' WHERE EXISTS(SELECT 1 FROM category WHERE department_id=? AND active=true)"
                + " UNION ALL SELECT 'complaints' WHERE EXISTS(SELECT 1 FROM complaint WHERE department_id=? AND status NOT IN ('CLOSED','REJECTED','TERMINATED'))"
                + " UNION ALL SELECT 'transfers' WHERE EXISTS(SELECT 1 FROM department_transfer WHERE (source_department_id=? OR target_department_id=?) AND state='PENDING')"
                + " UNION ALL SELECT 'teams' WHERE EXISTS(SELECT 1 FROM field_team WHERE department_id=? AND active=true)"
                + " UNION ALL SELECT 'govMappings' WHERE EXISTS(SELECT 1 FROM gov_role_mapping WHERE department_id=?)"
                + " UNION ALL SELECT 'routes' WHERE EXISTS(SELECT 1 FROM route_plan p WHERE department_id=? AND (status IN ('DRAFT','PROPOSED') OR EXISTS(SELECT 1 FROM route_stop s WHERE s.plan_id=p.id AND s.reserved)))",
            id,
            id,
            id,
            id,
            id,
            id,
            id,
            id);
    if (!dependencies.isEmpty())
      throw new ResponseStatusException(
          HttpStatus.CONFLICT,
          "ไม่สามารถลบกองที่ยังมีข้อมูลใช้งาน กรุณาย้ายบุคลากร ประเภทคำร้อง งาน ทีม และการจับคู่บทบาทออกก่อน");
    db.run(
        "UPDATE department SET deleted_at=clock_timestamp() WHERE id=? AND municipality_id=?",
        id,
        u.get("municipality_id"));
    workflow.audit(
        u, null, "DEPARTMENT_DELETE", null, null, "ลบกอง " + id + " " + department.get("name"));
  }

  @PostMapping("/departments/{id}/field-users")
  @Transactional
  public void assignFieldUsers(
      @PathVariable UUID id, @RequestBody Map<String, Object> b, Authentication a) {
    var u = lockedAdmin(a);
    db.one(
        "SELECT id FROM department WHERE id=? AND municipality_id=? AND deleted_at IS NULL FOR SHARE",
        id,
        u.get("municipality_id"));
    if (!(b.get("userIds") instanceof List<?> values) || values.isEmpty() || values.size() > 100)
      throw new IllegalArgumentException();
    var ids = new LinkedHashSet<UUID>();
    for (Object value : values) {
      if (!(value instanceof String) || !ids.add(Db.id(value)))
        throw new IllegalArgumentException();
    }
    var targets = new ArrayList<Map<String, Object>>();
    for (UUID userId : ids) {
      var target =
          db.one(
              "SELECT id,username,role,department_id,enabled FROM app_user WHERE id=? AND municipality_id=? AND deleted_at IS NULL FOR UPDATE",
              userId,
              u.get("municipality_id"));
      if (!Boolean.TRUE.equals(target.get("enabled")) || "ADMIN".equals(target.get("role")))
        throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST, "เลือกได้เฉพาะบัญชีที่เปิดใช้งานและไม่ใช่ผู้ดูแลระบบ");
      targets.add(target);
    }
    // Validate the entire selection before the first write or session revocation.
    for (var target : targets) {
      db.run(
          "UPDATE app_user SET role=?,department_id=? WHERE id=? AND municipality_id=?",
          "FIELD",
          id,
          target.get("id"),
          u.get("municipality_id"));
      workflow.audit(
          u,
          null,
          "USER_ROLE",
          null,
          null,
          "บัญชี "
              + target.get("username")
              + " role="
              + target.get("role")
              + "->FIELD department="
              + target.get("department_id")
              + "->"
              + id);
    }
    for (var target : targets) sessions.revoke(target.get("username").toString());
  }

  @PostMapping("/users")
  @Transactional
  public Object user(@RequestBody Map<String, Object> b, Authentication a) {
    var u = lockedAdmin(a);
    String role = Workflow.text(b, "role", 20);
    if (!List.of("ADMIN", "OFFICER", "LEADER", "FIELD", "APPROVER", "CITIZEN").contains(role))
      throw new IllegalArgumentException();
    String name = Workflow.text(b, "username", 60);
    if (!name.matches("[a-zA-Z0-9._-]{4,60}")) throw new IllegalArgumentException();
    String password = Workflow.text(b, "password", 72);
    if (password.length() < 12) throw new IllegalArgumentException();
    UUID dept = b.get("departmentId") == null ? null : Db.id(b.get("departmentId"));
    if (List.of("OFFICER", "APPROVER", "CITIZEN").contains(role)) dept = null;
    if (Access.departmentRole(role) && dept == null)
      throw new IllegalArgumentException("กรุณาเลือกกองสำหรับหัวหน้าหรือผู้ลงพื้นที่");
    if (dept != null)
      db.one(
          "SELECT id FROM department WHERE id=? AND municipality_id=? AND deleted_at IS NULL FOR SHARE",
          dept,
          u.get("municipality_id"));
    UUID id = UUID.randomUUID();
    db.run(
        "INSERT INTO"
            + " app_user(id,municipality_id,department_id,username,password_hash,display_name,role)"
            + " VALUES(?,?,?,?,?,?,?)",
        id,
        u.get("municipality_id"),
        dept,
        name,
        encoder.encode(password),
        Workflow.text(b, "displayName", 200),
        role);
    workflow.audit(u, null, "CREATE_USER", null, null, "สร้างบัญชี " + name);
    return Map.of("id", id);
  }

  @PostMapping("/users/{id}/role")
  @Transactional
  public void assignRole(
      @PathVariable UUID id, @RequestBody Map<String, Object> b, Authentication a) {
    var u = lockedAdmin(a);
    var target =
        db.one(
            "SELECT id,username,role,gov_role,department_id FROM app_user WHERE id=? AND municipality_id=? AND deleted_at IS NULL FOR UPDATE",
            id,
            u.get("municipality_id"));
    String role = Workflow.text(b, "role", 20);
    if (!List.of("ADMIN", "OFFICER", "LEADER", "FIELD", "APPROVER", "CITIZEN").contains(role))
      throw new IllegalArgumentException();
    if (u.get("id").equals(id) && !role.equals("ADMIN"))
      throw new IllegalArgumentException("ไม่สามารถลดสิทธิ์ผู้ดูแลระบบของตนเองได้");
    UUID department = b.get("departmentId") == null ? null : Db.id(b.get("departmentId"));
    if (List.of("OFFICER", "APPROVER", "CITIZEN").contains(role)) department = null;
    if (Access.departmentRole(role) && department == null)
      throw new IllegalArgumentException("กรุณาเลือกหน่วยงานสำหรับบุคลากร");
    if (department != null)
      db.one(
          "SELECT id FROM department WHERE id=? AND municipality_id=? AND deleted_at IS NULL FOR SHARE",
          department,
          u.get("municipality_id"));
    // Older clients leave the position out, which keeps the current one.
    Object govRole = target.get("gov_role");
    if (b.containsKey("govRole")) {
      Object requested = b.get("govRole");
      if (requested == null) govRole = null;
      else if (requested instanceof String code)
        govRole = code.isBlank() ? null : GovRoleMapping.roleCode(code);
      else throw new IllegalArgumentException();
    }
    if (role.equals("CITIZEN")) govRole = null;
    db.run(
        "UPDATE app_user SET role=?,department_id=?,gov_role=? WHERE id=? AND municipality_id=?",
        role,
        department,
        govRole,
        id,
        u.get("municipality_id"));
    sessions.revoke(target.get("username").toString());
    workflow.audit(
        u,
        null,
        "USER_ROLE",
        null,
        null,
        "บัญชี "
            + target.get("username")
            + " role="
            + target.get("role")
            + "->"
            + role
            + " department="
            + target.get("department_id")
            + "->"
            + department
            + " govRole="
            + target.get("gov_role")
            + "->"
            + govRole);
  }

  @PostMapping("/users/{id}/enabled")
  @Transactional
  public void enabled(
      @PathVariable UUID id, @RequestBody Map<String, Boolean> b, Authentication a) {
    var u = lockedAdmin(a);
    if (u.get("id").equals(id)) throw new IllegalArgumentException();
    var target =
        db.one(
            "SELECT id,username FROM app_user WHERE id=? AND municipality_id=? AND deleted_at IS NULL FOR UPDATE",
            id,
            u.get("municipality_id"));
    if (b.get("enabled") == null) throw new IllegalArgumentException();
    db.run("UPDATE app_user SET enabled=? WHERE id=?", b.get("enabled"), id);
    sessions.revoke(target.get("username").toString());
    workflow.audit(
        u, null, "USER_ENABLED", null, null, "บัญชี " + id + " enabled=" + b.get("enabled"));
  }

  @DeleteMapping("/users/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @Transactional
  public void deleteUser(@PathVariable UUID id, Authentication a) {
    var u = lockedAdmin(a);
    if (u.get("id").equals(id))
      throw new IllegalArgumentException("ไม่สามารถลบบัญชีผู้ดูแลระบบของตนเองได้");
    var target =
        db.one(
            "SELECT id,username,deleted_at FROM app_user WHERE id=? AND municipality_id=? FOR UPDATE",
            id,
            u.get("municipality_id"));
    if (target.get("deleted_at") != null) return;
    db.run("UPDATE app_user SET enabled=false,deleted_at=now() WHERE id=?", id);
    sessions.revoke(target.get("username").toString());
    workflow.audit(u, null, "USER_DELETE", null, null, "ลบบัญชี " + target.get("username"));
  }

  @PostMapping("/workflows")
  @Transactional
  public Object workflow(@RequestBody Map<String, Object> b, Authentication a) {
    var u = admin(a);
    db.one("SELECT id FROM municipality WHERE id=? FOR UPDATE", u.get("municipality_id"));
    int stages = Integer.parseInt(String.valueOf(b.get("approvalStages")));
    if (stages < 1 || stages > 5) throw new IllegalArgumentException();
    int v =
        ((Number)
                db.one(
                        "SELECT COALESCE(MAX(version),0)+1 n FROM workflow_version WHERE"
                            + " municipality_id=?",
                        u.get("municipality_id"))
                    .get("n"))
            .intValue();
    UUID id = workflow.createDefault((UUID) u.get("municipality_id"), v);
    db.run(
        "UPDATE workflow_version SET name=?,approval_stages=? WHERE id=?",
        Workflow.text(b, "name", 200),
        stages,
        id);
    workflow.audit(
        u,
        null,
        "PUBLISH_WORKFLOW",
        null,
        null,
        "เผยแพร่ Workflow รุ่น " + v + " จำนวนผู้อนุมัติ " + stages);
    return Map.of("id", id);
  }

  @PostMapping("/categories")
  @Transactional
  public Object category(@RequestBody Map<String, Object> b, Authentication a) throws Exception {
    var u = lockedAdmin(a);
    UUID dept = Db.id(b.get("departmentId")), wf = Db.id(b.get("workflowId"));
    db.one(
        "SELECT id FROM department WHERE id=? AND municipality_id=? AND deleted_at IS NULL FOR SHARE",
        dept,
        u.get("municipality_id"));
    db.one(
        "SELECT id FROM workflow_version WHERE id=? AND municipality_id=? AND published=true",
        wf,
        u.get("municipality_id"));
    int hours = Integer.parseInt(String.valueOf(b.get("slaHours")));
    if (hours < 1 || hours > 87600) throw new IllegalArgumentException();
    Object fields = b.getOrDefault("fields", List.of());
    var tree = json.valueToTree(fields);
    if (!tree.isArray() || tree.size() > 30) throw new IllegalArgumentException();
    Set<String> keys = new HashSet<>();
    for (var f : tree) {
      String key = f.path("key").asText();
      if (!key.matches("[a-zA-Z][a-zA-Z0-9_]{0,39}")
          || !keys.add(key)
          || f.path("label").asText().isBlank()
          || f.path("label").asText().length() > 200
          || !f.path("required").isBoolean()) throw new IllegalArgumentException();
    }
    UUID id = b.get("id") == null ? UUID.randomUUID() : Db.id(b.get("id"));
    String name = Workflow.text(b, "name", 200);
    if (b.get("id") == null)
      db.run(
          "INSERT INTO category(id,municipality_id,department_id,workflow_id,name,sla_hours,fields)"
              + " VALUES(?,?,?,?,?,?,?::jsonb)",
          id,
          u.get("municipality_id"),
          dept,
          wf,
          name,
          hours,
          json.writeValueAsString(fields));
    else {
      db.one(
          "SELECT id FROM category WHERE id=? AND municipality_id=?", id, u.get("municipality_id"));
      db.run(
          "UPDATE category SET"
              + " name=?,department_id=?,workflow_id=?,sla_hours=?,fields=?::jsonb,active=? WHERE"
              + " id=?",
          name,
          dept,
          wf,
          hours,
          json.writeValueAsString(fields),
          b.getOrDefault("active", true),
          id);
    }
    workflow.audit(u, null, "CONFIG_CATEGORY", null, null, "ตั้งค่าประเภทปัญหา " + name);
    return Map.of("id", id);
  }

  @GetMapping("/audit")
  public Object audit(Authentication a) {
    var u = admin(a);
    return db.list(
        "SELECT e.id,e.action,e.from_status,e.to_status,e.reason,e.created_at,COALESCE(u.display_name,'ระบบ')"
            + " actor_name FROM audit_event e LEFT JOIN app_user u ON u.id=e.actor_id WHERE"
            + " e.municipality_id=? ORDER BY e.created_at DESC LIMIT 200",
        u.get("municipality_id"));
  }

  @GetMapping("/deliveries")
  public Object deliveries(Authentication a) {
    var u = admin(a);
    return db.list(
        "SELECT d.notification_id,d.state,d.attempts,d.last_error,d.next_attempt,d.sent_at FROM"
            + " notification_delivery d JOIN notification n ON n.id=d.notification_id JOIN"
            + " app_user r ON r.id=n.user_id WHERE r.municipality_id=? ORDER BY n.created_at"
            + " DESC LIMIT 200",
        u.get("municipality_id"));
  }
}
