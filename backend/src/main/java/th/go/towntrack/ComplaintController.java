package th.go.towntrack;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class ComplaintController {
  final Db db;
  final Access access;
  final Workflow workflow;
  final ObjectMapper json;

  public ComplaintController(Db d, Access a, Workflow w, ObjectMapper j) {
    db = d;
    access = a;
    workflow = w;
    json = j;
  }

  @GetMapping("/catalog")
  public Object catalog(Authentication a) {
    var u = access.user(a);
    var categories =
        db.list(
            "SELECT id,name,sla_hours,fields::text fields FROM category WHERE municipality_id=? AND"
                + " active=true ORDER BY name",
            u.get("municipality_id"));
    return Map.of(
        "categories",
        categories,
        "departments",
        db.list(
            "SELECT id,name FROM department WHERE municipality_id=?", u.get("municipality_id")));
  }

  record NewComplaint(
      @NotNull UUID categoryId,
      @NotBlank @Size(max = 200) String title,
      @NotBlank @Size(max = 20000) String description,
      @NotBlank @Size(max = 1000) String address,
      @DecimalMin("-90") @DecimalMax("90") Double latitude,
      @DecimalMin("-180") @DecimalMax("180") Double longitude,
      Map<String, String> answers,
      @Size(max = 200) String contactName,
      @Size(max = 30) @Pattern(regexp = "[0-9+() -]*") String contactPhone) {}

  @PostMapping("/complaints")
  @Transactional
  public Object create(@Valid @RequestBody NewComplaint b, Authentication a) throws Exception {
    var u = access.user(a);
    access.role(u, "CITIZEN");
    var cat =
        db.one(
            "SELECT * FROM category WHERE id=? AND municipality_id=? AND active=true",
            b.categoryId(),
            u.get("municipality_id"));
    var answers = b.answers() == null ? Map.<String, String>of() : b.answers();
    var fields = json.readTree(cat.get("fields").toString());
    Set<String> keys = new HashSet<>();
    for (var f : fields) {
      String key = f.path("key").asText();
      keys.add(key);
      if (f.path("required").asBoolean() && answers.getOrDefault(key, "").isBlank())
        throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST, "กรุณากรอก " + f.path("label").asText());
    }
    for (var e : answers.entrySet())
      if (!keys.contains(e.getKey()) || e.getValue() == null || e.getValue().length() > 4000)
        throw new IllegalArgumentException();
    if ((b.latitude() == null) != (b.longitude() == null)) throw new IllegalArgumentException();
    UUID id = UUID.randomUUID();
    String position =
        b.latitude() == null ? null : "POINT(" + b.longitude() + " " + b.latitude() + ")";
    db.run(
        "INSERT INTO"
            + " complaint(id,municipality_id,category_id,reporter_id,department_id,workflow_id,title,description,address,location,answers,due_at)"
            + " VALUES(?,?,?,?,?,?,?,?,?,ST_GeogFromText(?),?::jsonb,now()+(? * interval '1"
            + " hour'))",
        id,
        u.get("municipality_id"),
        b.categoryId(),
        u.get("id"),
        cat.get("department_id"),
        cat.get("workflow_id"),
        b.title(),
        b.description(),
        b.address(),
        position,
        json.writeValueAsString(answers),
        cat.get("sla_hours"));
    db.run(
        "UPDATE complaint SET form_schema=?::jsonb WHERE id=?", cat.get("fields").toString(), id);
    db.run(
        "UPDATE complaint SET contact_name=?,contact_phone=? WHERE id=?",
        b.contactName(),
        b.contactPhone(),
        id);
    workflow.audit(u, id, "CREATE", null, "NEW", "ยื่นคำร้อง");
    return Map.of("id", id);
  }

  @GetMapping("/complaints")
  public Object list(
      Authentication a,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "10") int size,
      @RequestParam(defaultValue = "") String q,
      @RequestParam(defaultValue = "") String status) {
    if (page < 0
        || page > 1000000
        || size < 1
        || size > 100
        || q.length() > 200
        || status.length() > 40) throw new IllegalArgumentException();
    var u = access.user(a);
    String scope =
        switch ((String) u.get("role")) {
          case "ADMIN" -> "true";
          case "CITIZEN" -> "c.reporter_id=?";
          case "OFFICER" -> "(c.department_id IS NULL OR c.department_id=?)";
          case "LEADER" -> "c.leader_id=?";
          case "FIELD" ->
              "EXISTS(SELECT 1 FROM work_order w WHERE w.complaint_id=c.id AND (w.assignee_id=? OR"
                  + " EXISTS(SELECT 1 FROM work_member wm WHERE wm.work_order_id=w.id AND"
                  + " wm.user_id=?)) AND w.status NOT IN ('DECLINED','CANCELLED'))";
          case "APPROVER" ->
              "EXISTS(SELECT 1 FROM resource_request r WHERE r.complaint_id=c.id AND"
                  + " r.approver_id=?)";
          default -> "false";
        };
    var args = new ArrayList<Object>();
    args.add(u.get("municipality_id"));
    if (!u.get("role").equals("ADMIN"))
      args.add(u.get(u.get("role").equals("OFFICER") ? "department_id" : "id"));
    if (u.get("role").equals("FIELD")) args.add(u.get("id"));
    String base =
        " FROM complaint c JOIN category k ON k.id=c.category_id WHERE c.municipality_id=? AND "
            + scope;
    var stats =
        db.one(
            "SELECT count(*) total,count(*) FILTER(WHERE c.status NOT IN"
                + " ('CLOSED','REJECTED','TERMINATED')) in_progress,count(*) FILTER(WHERE"
                + " c.status='CLOSED') closed,count(*) FILTER(WHERE c.status NOT IN"
                + " ('CLOSED','REJECTED','TERMINATED') AND c.due_at<now()) overdue"
                + base,
            args.toArray());
    if (!q.isBlank()) {
      base += " AND (c.title ILIKE ? OR c.id::text ILIKE ?)";
      args.add("%" + q + "%");
      args.add("%" + q + "%");
    }
    if (!status.isBlank()) {
      base += " AND c.status=?";
      args.add(status);
    }
    Object count = db.one("SELECT count(*) total" + base, args.toArray()).get("total");
    args.add(size);
    args.add((long) page * size);
    var items =
        db.list(
            "SELECT c.id,c.title,c.status,c.created_at,c.due_at,c.version,k.name category_name"
                + base
                + " ORDER BY c.created_at DESC,c.id LIMIT ? OFFSET ?",
            args.toArray());
    return Map.of("items", items, "total", count, "page", page, "size", size, "stats", stats);
  }

  @GetMapping("/complaints/{id}")
  public Object detail(@PathVariable UUID id, Authentication a) {
    var u = access.user(a);
    var c = access.complaint(id, u, false);
    boolean citizen = u.get("role").equals("CITIZEN");
    var result = new LinkedHashMap<String, Object>();
    if (citizen) {
      var clean = new LinkedHashMap<String, Object>();
      for (String k :
          List.of(
              "id",
              "title",
              "description",
              "address",
              "status",
              "created_at",
              "updated_at",
              "due_at",
              "latitude",
              "longitude",
              "version")) clean.put(k, c.get(k));
      result.put("complaint", clean);
      result.put(
          "history",
          db.list(
              "SELECT action,from_status,to_status,created_at FROM audit_event WHERE complaint_id=?"
                  + " ORDER BY created_at",
              id));
      result.put(
          "files",
          db.list(
              "SELECT id,original_name,size_bytes FROM attachment WHERE complaint_id=? AND"
                  + " uploaded_by=? ORDER BY created_at",
              id,
              u.get("id")));
      result.put("actions", List.of());
      return result;
    }
    c.put("answers", c.get("answers").toString());
    c.put("form_schema", c.get("form_schema").toString());
    result.put("complaint", c);
    result.put(
        "history",
        db.list(
            "SELECT e.*,u.display_name actor_name FROM audit_event e JOIN app_user u ON"
                + " u.id=e.actor_id WHERE e.complaint_id=? ORDER BY e.created_at",
            id));
    result.put(
        "workOrders",
        db.list(
            "SELECT w.*,u.display_name assignee_name FROM work_order w JOIN app_user u ON"
                + " u.id=w.assignee_id WHERE complaint_id=? ORDER BY created_at",
            id));
    result.put(
        "resources",
        db.list(
            "SELECT r.*,COALESCE((SELECT json_agg(v ORDER BY v.revision) FROM resource_revision v"
                + " WHERE v.resource_id=r.id),'[]'::json)::text revisions FROM resource_request r"
                + " WHERE complaint_id=? ORDER BY created_at",
            id));
    result.put(
        "reports",
        db.list("SELECT * FROM field_report WHERE complaint_id=? ORDER BY revision", id));
    result.put(
        "reviews",
        db.list(
            "SELECT r.*,u.display_name actor_name FROM review r JOIN app_user u ON u.id=r.actor_id"
                + " WHERE complaint_id=? ORDER BY created_at",
            id));
    result.put(
        "files",
        db.list(
            "SELECT id,original_name,size_bytes,report_id,resource_id,created_at FROM attachment"
                + " WHERE complaint_id=? ORDER BY created_at",
            id));
    result.put(
        "approvalStages",
        db.one("SELECT approval_stages FROM workflow_version WHERE id=?", c.get("workflow_id"))
            .get("approval_stages"));
    result.put(
        "approvals",
        db.list(
            "SELECT aa.step,aa.decision,aa.reason,aa.decided_at,u.display_name approver_name FROM"
                + " approval_assignment aa JOIN resource_request r ON r.id=aa.resource_id JOIN"
                + " app_user u ON u.id=aa.approver_id WHERE r.complaint_id=? ORDER BY aa.step",
            id));
    boolean representative =
        !u.get("role").equals("FIELD")
            || !db.list(
                    "SELECT id FROM work_order WHERE complaint_id=? AND assignee_id=? AND status"
                        + " NOT IN ('DECLINED','CANCELLED','COMPLETE')",
                    id,
                    u.get("id"))
                .isEmpty();
    result.put(
        "actions",
        representative
            ? db.list(
                "SELECT action FROM workflow_transition WHERE workflow_id=? AND from_status=? AND"
                    + " role=?",
                c.get("workflow_id"),
                c.get("status"),
                u.get("role"))
            : List.of());
    return result;
  }

  @PostMapping("/complaints/{id}/actions")
  public Object act(@PathVariable UUID id, @RequestBody Map<String, Object> b, Authentication a) {
    return workflow.act(id, b, access.user(a));
  }

  @GetMapping("/people")
  public Object people(@RequestParam String role, Authentication a) {
    var u = access.user(a);
    access.role(u, "OFFICER", "LEADER", "ADMIN");
    return db.list(
        "SELECT id,display_name,department_id FROM app_user WHERE municipality_id=? AND role=? AND"
            + " enabled=true AND (department_id=? OR ?='ADMIN') ORDER BY display_name",
        u.get("municipality_id"),
        role,
        u.get("department_id"),
        u.get("role"));
  }

  @GetMapping("/nearby")
  public Object nearby(
      @RequestParam UUID categoryId,
      @RequestParam double latitude,
      @RequestParam double longitude,
      Authentication a) {
    var u = access.user(a);
    access.role(u, "CITIZEN");
    if (!Double.isFinite(latitude)
        || !Double.isFinite(longitude)
        || Math.abs(latitude) > 90
        || Math.abs(longitude) > 180) throw new IllegalArgumentException();
    return db.list(
        "SELECT c.id,k.name category_name,c.status,round(ST_Y(c.location::geometry)::numeric,3)"
            + " latitude,round(ST_X(c.location::geometry)::numeric,3) longitude FROM complaint c"
            + " JOIN category k ON k.id=c.category_id WHERE c.municipality_id=? AND c.category_id=?"
            + " AND c.status NOT IN ('REJECTED','TERMINATED','CLOSED') AND"
            + " ST_DWithin(c.location,ST_SetSRID(ST_MakePoint(?,?),4326)::geography,100) ORDER BY"
            + " c.created_at DESC LIMIT 20",
        u.get("municipality_id"),
        categoryId,
        longitude,
        latitude);
  }

  record Follow(
      @NotNull UUID categoryId,
      @DecimalMin("-90") @DecimalMax("90") double latitude,
      @DecimalMin("-180") @DecimalMax("180") double longitude) {}

  @PostMapping("/complaints/{id}/follow")
  public Object follow(@PathVariable UUID id, @Valid @RequestBody Follow b, Authentication a) {
    var u = access.user(a);
    access.role(u, "CITIZEN");
    db.one(
        "SELECT id FROM complaint WHERE id=? AND municipality_id=? AND category_id=? AND status NOT"
            + " IN ('REJECTED','TERMINATED','CLOSED') AND"
            + " ST_DWithin(location,ST_SetSRID(ST_MakePoint(?,?),4326)::geography,100)",
        id,
        u.get("municipality_id"),
        b.categoryId(),
        b.longitude(),
        b.latitude());
    db.run("INSERT INTO follower VALUES(?,?) ON CONFLICT DO NOTHING", id, u.get("id"));
    return Map.of("ok", true);
  }

  @GetMapping("/following")
  public Object following(Authentication a) {
    var u = access.user(a);
    return db.list(
        "SELECT c.id,k.name category_name,c.status,c.updated_at FROM follower f JOIN complaint c ON"
            + " c.id=f.complaint_id JOIN category k ON k.id=c.category_id WHERE f.user_id=? AND"
            + " c.municipality_id=? ORDER BY c.updated_at DESC",
        u.get("id"),
        u.get("municipality_id"));
  }

  @DeleteMapping("/complaints/{id}/follow")
  public void unfollow(@PathVariable UUID id, Authentication a) {
    db.run("DELETE FROM follower WHERE complaint_id=? AND user_id=?", id, access.user(a).get("id"));
  }

  @GetMapping("/notifications")
  public Object notifications(Authentication a) {
    return db.list(
        "SELECT id,complaint_id,message,created_at,read_at FROM notification WHERE user_id=? ORDER"
            + " BY created_at DESC LIMIT 100",
        access.user(a).get("id"));
  }

  @PostMapping("/notifications/read")
  public void read(Authentication a) {
    db.run(
        "UPDATE notification SET read_at=now() WHERE user_id=? AND read_at IS NULL",
        access.user(a).get("id"));
  }
}
