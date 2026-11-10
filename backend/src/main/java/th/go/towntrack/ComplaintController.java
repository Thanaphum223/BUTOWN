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
  final FileController files;
  @org.springframework.beans.factory.annotation.Autowired EvidenceMedia media;
  @org.springframework.beans.factory.annotation.Autowired SubmissionKeys keys;
  @org.springframework.beans.factory.annotation.Autowired WorkflowPolicy policy;
  @org.springframework.beans.factory.annotation.Autowired WorkHistory workHistory;
  @org.springframework.beans.factory.annotation.Autowired DepartmentTransfers transfers;
  @org.springframework.beans.factory.annotation.Autowired RoleQueues queues;

  public ComplaintController(Db d, Access a, Workflow w, ObjectMapper j, FileController files) {
    db = d;
    access = a;
    workflow = w;
    json = j;
    this.files = files;
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
        "queues",
        queues.options((String) u.get("role")),
        "departments",
        db.list(
            "SELECT id,name FROM department WHERE municipality_id=? AND deleted_at IS NULL",
            u.get("municipality_id")));
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

  @PostMapping(value = "/complaints", consumes = "application/json")
  public Object missingEvidence(@Valid @RequestBody NewComplaint b, Authentication a) {
    access.role(access.user(a), "CITIZEN");
    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "กรุณาแนบหลักฐานอย่างน้อย 1 ไฟล์");
  }

  @PostMapping(value = "/complaints", consumes = "multipart/form-data")
  @Transactional(rollbackFor = Exception.class)
  public Object createWithEvidence(
      @Valid @RequestPart("complaint") NewComplaint b,
      @RequestPart(value = "files", required = false)
          List<org.springframework.web.multipart.MultipartFile> evidence,
      Authentication a,
      @RequestHeader(value = "Idempotency-Key", required = false) UUID key)
      throws Exception {
    var submittingUser = access.user(a);
    access.role(submittingUser, "CITIZEN");
    if (evidence == null
        || evidence.isEmpty()
        || evidence.stream().anyMatch(org.springframework.web.multipart.MultipartFile::isEmpty))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "กรุณาแนบหลักฐานอย่างน้อย 1 ไฟล์");
    long total = 0;
    for (var file : evidence) {
      if (file.getSize() > FileController.MAX_TOTAL_BYTES - total)
        throw new ResponseStatusException(
            HttpStatus.PAYLOAD_TOO_LARGE, "ไฟล์แนบรวมทั้งหมดต่อคำร้องต้องไม่เกิน 1 GB (1,000 MB)");
      total += file.getSize();
    }
    var fingerprints = new ArrayList<String>();
    for (var f : evidence) {
      var digest = java.security.MessageDigest.getInstance("SHA-256");
      try (var in = f.getInputStream()) {
        byte[] buffer = new byte[65536];
        int n;
        while ((n = in.read(buffer)) != -1) digest.update(buffer, 0, n);
      }
      fingerprints.add(
          f.getOriginalFilename()
              + ":"
              + f.getSize()
              + ":"
              + HexFormat.of().formatHex(digest.digest()));
    }
    String hash = keys.hash(Map.of("complaint", b, "files", fingerprints));
    Object prior = keys.find(submittingUser.get("id"), "CREATE", key, hash);
    if (prior != null) return prior;
    var result = createRecord(b, a);
    UUID id = (UUID) result.get("id");
    for (var file : evidence) files.upload(id, file, a);
    keys.save(submittingUser.get("id"), "CREATE", key, hash, result);
    return result;
  }

  Map<String, Object> createRecord(NewComplaint b, Authentication a) throws Exception {
    var u = access.user(a);
    access.role(u, "CITIZEN");
    // Match administration's municipality -> department lock order through insertion.
    db.one("SELECT id FROM municipality WHERE id=? FOR KEY SHARE", u.get("municipality_id"));
    var cat =
        db.one(
            "SELECT * FROM category WHERE id=? AND municipality_id=? AND active=true",
            b.categoryId(),
            u.get("municipality_id"));
    if (cat.get("department_id") != null)
      db.one(
          "SELECT id FROM department WHERE id=? AND municipality_id=? AND deleted_at IS NULL FOR SHARE",
          cat.get("department_id"),
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
        "UPDATE complaint SET contact_name=?,contact_phone=?,contact_email=(SELECT"
            + " NULLIF(btrim(email),'') FROM iam_user_profile WHERE local_user_id=? AND"
            + " municipality_id=?) WHERE id=?",
        b.contactName(),
        b.contactPhone(),
        u.get("id"),
        u.get("municipality_id"),
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
      @RequestParam(defaultValue = "") String status,
      @RequestParam(defaultValue = "") String queue,
      @RequestParam(required = false) UUID categoryId,
      @RequestParam(defaultValue = "") String area,
      @RequestParam(defaultValue = "newest") String sort,
      @RequestParam(defaultValue = "false") boolean activeOnly,
      @RequestParam(defaultValue = "false") boolean completedOnly,
      @RequestParam(defaultValue = "false") boolean historyOnly,
      @RequestParam(defaultValue = "false") boolean overview) {
    if (page < 0
        || page > 1000000
        || size < 1
        || size > 100
        || q.length() > 200
        || status.length() > 40) throw new IllegalArgumentException();
    var u = access.user(a);
    if (overview) {
      access.role(u, "APPROVER");
      if (historyOnly || !queue.isBlank()) throw new IllegalArgumentException();
    }
    String scope =
        overview
            ? "true"
            : switch ((String) u.get("role")) {
              case "ADMIN", "OFFICER" -> "true";
              case "CITIZEN" -> "c.reporter_id=?";
              case "LEADER" -> "c.leader_id=?";
              case "FIELD" ->
                  "EXISTS(SELECT 1 FROM work_order w WHERE w.complaint_id=c.id AND (w.assignee_id=?"
                      + " OR EXISTS(SELECT 1 FROM work_member wm WHERE wm.work_order_id=w.id AND"
                      + " wm.user_id=?)) AND NOT w.handed_off AND w.status NOT IN"
                      + " ('DECLINED','CANCELLED'))";
              case "APPROVER" ->
                  "EXISTS(SELECT 1 FROM resource_request r WHERE r.complaint_id=c.id AND"
                      + (Access.approvalOverview(u)
                          ? " NOT r.handed_off AND r.approver_id IS NOT NULL)"
                          : " NOT r.handed_off AND r.approver_id=?)");
              default -> "false";
            };
    var args = new ArrayList<Object>();
    args.add(u.get("municipality_id"));
    if (!overview
        && !List.of("ADMIN", "OFFICER").contains(u.get("role"))
        && !Access.approvalOverview(u)) args.add(u.get("id"));
    if (u.get("role").equals("FIELD")) args.add(u.get("id"));
    if (historyOnly) {
      if (activeOnly || completedOnly) throw new IllegalArgumentException();
      scope =
          "(("
              + scope
              + ") AND c.status IN ('CLOSED','REJECTED','TERMINATED') OR "
              + WorkHistory.OWN_OUTCOME
              + ")";
      args.add(u.get("id"));
      args.add(u.get("id"));
      args.add(u.get("id"));
    }
    String base =
        " FROM complaint c JOIN category k ON k.id=c.category_id WHERE c.municipality_id=? AND "
            + scope;
    if (activeOnly && !overview) base += " AND " + queues.actionable((String) u.get("role"));
    var stats =
        db.one(
            "SELECT count(*) total,count(*) FILTER(WHERE c.status NOT IN"
                + " ('CLOSED','REJECTED','TERMINATED')) in_progress,count(*) FILTER(WHERE"
                + " c.status='CLOSED') closed,count(*) FILTER(WHERE c.status NOT IN"
                + " ('CLOSED','REJECTED','TERMINATED') AND c.due_at<now()) overdue"
                + base,
            args.toArray());
    if (completedOnly) base += " AND c.status IN ('CLOSED','REJECTED','TERMINATED')";
    if (activeOnly) base += " AND c.status NOT IN ('CLOSED','REJECTED','TERMINATED')";
    if (!queue.isBlank()) {
      if (historyOnly || queue.length() > 40) throw new IllegalArgumentException();
      base += " AND " + queues.predicate((String) u.get("role"), queue);
    }
    if (!q.isBlank()) {
      base += " AND (c.title ILIKE ? OR c.id::text ILIKE ?)";
      args.add("%" + q + "%");
      args.add("%" + q + "%");
    }
    if (!status.isBlank()) {
      base += " AND c.status=?";
      args.add(status);
    }
    if (categoryId != null) {
      base += " AND c.category_id=?";
      args.add(categoryId);
    }
    if (!area.isBlank()) {
      if (area.length() > 200) throw new IllegalArgumentException();
      base += " AND c.address ILIKE ?";
      args.add("%" + area + "%");
    }
    if (!List.of("newest", "oldest", "votes").contains(sort)) throw new IllegalArgumentException();
    String order =
        sort.equals("votes")
            ? "votes DESC,c.created_at DESC,c.id"
            : sort.equals("oldest") ? "c.created_at ASC,c.id" : "c.created_at DESC,c.id";
    Object count = db.one("SELECT count(*) total" + base, args.toArray()).get("total");
    args.add(size);
    args.add((long) page * size);
    var itemArgs = new ArrayList<Object>();
    itemArgs.add(u.get("id"));
    itemArgs.addAll(args);
    var items =
        db.list(
            "SELECT c.id,c.title,c.address,c.status,c.created_at,c.due_at,c.version,k.name"
                + " category_name,(SELECT count(*) FROM complaint_vote v WHERE v.complaint_id=c.id)"
                + " votes,EXISTS(SELECT 1 FROM resource_request r WHERE r.complaint_id=c.id AND NOT"
                + " r.handed_off AND r.approver_id=?) can_open"
                + base
                + " ORDER BY "
                + order
                + " LIMIT ? OFFSET ?",
            itemArgs.toArray());
    return Map.of("items", items, "total", count, "page", page, "size", size, "stats", stats);
  }

  @GetMapping("/complaints/{id}")
  public Object detail(
      @PathVariable UUID id,
      Authentication a,
      @RequestParam(defaultValue = "false") boolean historyOnly) {
    var u = access.user(a);
    Map<String, Object> c;
    try {
      c = access.complaint(id, u, false);
    } catch (ResponseStatusException denied) {
      if (historyOnly && denied.getStatusCode().value() == 403 && workHistory.hasOutcome(id, u))
        return workHistory.detail(id, u);
      throw denied;
    }
    boolean citizen = u.get("role").equals("CITIZEN");
    transfers.publicProgress(c);
    var result = new LinkedHashMap<String, Object>();
    result.put("readOnlyHistory", historyOnly);
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
              "version",
              "transfer_department_name")) clean.put(k, c.get(k));
      result.put("complaint", clean);
      result.put("history", citizenHistory(id, (String) c.get("status")));
      result.put(
          "files",
          db.list(
              "SELECT id,original_name,size_bytes FROM attachment WHERE complaint_id=? AND"
                  + " uploaded_by=? ORDER BY created_at",
              id,
              u.get("id")));
      result.put("media", media.visible(id, u));
      result.put("actions", List.of());
      return result;
    }
    result.put(
        "transfers",
        db.list(
            "SELECT t.*,s.name source_department_name,d.name target_department_name FROM"
                + " department_transfer t JOIN department s ON s.id=t.source_department_id JOIN"
                + " department d ON d.id=t.target_department_id WHERE t.complaint_id=? ORDER BY"
                + " t.created_at",
            id));
    c.put("assignment_details", c.get("assignment_details").toString());
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
            "SELECT r.*,u.display_name approver_name,requester.display_name"
                + " requester_name,COALESCE((SELECT json_agg(v ORDER BY v.revision) FROM"
                + " resource_revision v WHERE v.resource_id=r.id),'[]'::json)::text revisions FROM"
                + " resource_request r LEFT JOIN app_user u ON u.id=r.approver_id LEFT JOIN"
                + " app_user requester ON requester.id=r.requested_by WHERE r.complaint_id=? ORDER"
                + " BY r.handed_off DESC,r.created_at",
            id));
    result.put(
        "reports",
        db.list(
            "SELECT r.* FROM field_report r JOIN work_order w ON w.id=r.work_order_id WHERE"
                + " r.complaint_id=? ORDER BY w.handed_off DESC,r.created_at,r.revision",
            id));
    result.put(
        "reviews",
        db.list(
            "SELECT r.*,u.display_name actor_name FROM review r JOIN app_user u ON u.id=r.actor_id"
                + " WHERE complaint_id=? ORDER BY created_at",
            id));
    result.put(
        "files",
        db.list(
            "SELECT"
                + " id,original_name,size_bytes,uploaded_by,report_id,resource_id,resource_revision_id,evidence_stage,content_type,public_approved,public_copy_of,created_at"
                + " FROM attachment WHERE complaint_id=? ORDER BY created_at",
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
    boolean approvalRecipient =
        !"APPROVER".equals(u.get("role"))
            || u.get("id").equals(workflow.resource(id).get("approver_id"));
    result.put(
        "actions",
        !historyOnly && representative && approvalRecipient ? policy.actions(c, u) : List.of());
    return result;
  }

  @PostMapping("/complaints/{id}/actions")
  @Transactional
  public Object act(
      @PathVariable UUID id,
      @RequestBody Map<String, Object> b,
      Authentication a,
      @RequestHeader(value = "Idempotency-Key", required = false) UUID key)
      throws Exception {
    var u = access.user(a);
    String operation = "ACTION:" + id;
    String hash = keys.hash(b);
    Object previous = keys.find(u.get("id"), operation, key, hash);
    if (previous != null) return previous;
    var result = workflow.act(id, b, u);
    keys.save(u.get("id"), operation, key, hash, result);
    return result;
  }

  @GetMapping("/people")
  public Object people(
      @RequestParam String role,
      @RequestParam(required = false) UUID departmentId,
      Authentication a) {
    var u = access.user(a);
    access.role(u, "OFFICER", "LEADER", "ADMIN");
    if (!List.of("LEADER", "FIELD", "APPROVER").contains(role))
      throw new IllegalArgumentException();
    UUID department = Access.departmentRole(role) ? departmentId : null;
    if ("LEADER".equals(u.get("role"))) {
      if (!"FIELD".equals(role)
          || (departmentId != null && !departmentId.equals(u.get("department_id")))) Access.deny();
      department = (UUID) u.get("department_id");
      if (department == null) Access.deny();
    }
    if (department != null)
      db.one(
          "SELECT id FROM department WHERE id=? AND municipality_id=? AND deleted_at IS NULL",
          department,
          u.get("municipality_id"));
    return db.list(
        "SELECT id,display_name,department_id FROM app_user WHERE municipality_id=? AND role IN"
            + " (?,'ADMIN') AND enabled=true AND (?::uuid IS NULL OR department_id=?) ORDER BY"
            + " display_name",
        u.get("municipality_id"),
        role,
        department,
        department);
  }

  @GetMapping("/community/complaints")
  public Object community(
      Authentication a,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "12") int size,
      @RequestParam(required = false) UUID categoryId,
      @RequestParam(defaultValue = "nearby") String scope,
      @RequestParam(required = false) Double latitude,
      @RequestParam(required = false) Double longitude) {
    var u = access.user(a);
    access.role(u, "CITIZEN");
    boolean nearby = "nearby".equals(scope);
    if ((!nearby && !"municipality".equals(scope))
        || (nearby && (latitude == null || longitude == null))
        || (latitude != null && (!Double.isFinite(latitude) || Math.abs(latitude) > 90))
        || (longitude != null && (!Double.isFinite(longitude) || Math.abs(longitude) > 180))
        || page < 0
        || page > 1000000
        || size < 1
        || size > 100) throw new IllegalArgumentException();
    String base =
        " FROM complaint c JOIN category k ON k.id=c.category_id"
            + " WHERE c.municipality_id=? AND (?::uuid IS NULL OR c.category_id=?::uuid)";
    var parameters =
        new ArrayList<Object>(Arrays.asList(u.get("municipality_id"), categoryId, categoryId));
    var municipalityTotal =
        db.one("SELECT count(*) total" + base, parameters.toArray()).get("total");
    if (nearby) {
      base += " AND ST_DWithin(c.location,ST_SetSRID(ST_MakePoint(?,?),4326)::geography,5000)";
      parameters.add(longitude);
      parameters.add(latitude);
    }
    var stats =
        db.one(
            "SELECT COALESCE(sum((SELECT count(*) FROM complaint_vote v WHERE"
                + " v.complaint_id=c.id)),0) votes,count(*) total,count(*) FILTER(WHERE c.status"
                + " NOT IN ('CLOSED','REJECTED','TERMINATED')) in_progress,count(*) FILTER(WHERE"
                + " c.status='CLOSED') closed"
                + base,
            parameters.toArray());
    String fields =
        "SELECT (c.external_id LIKE 'mock-community-v1:%') mock,c.id,c.category_id,k.name"
            + " category_name,c.status,c.created_at,(SELECT count(*) FROM complaint_vote v WHERE"
            + " v.complaint_id=c.id) votes,EXISTS(SELECT 1 FROM follower f WHERE"
            + " f.complaint_id=c.id AND f.user_id=?::uuid) following,EXISTS(SELECT 1 FROM"
            + " complaint_vote v WHERE v.complaint_id=c.id AND v.user_id=?::uuid) voted,";
    var readerParameters = new ArrayList<Object>(List.of(u.get("id"), u.get("id")));
    readerParameters.addAll(parameters);
    var pagedParameters = new ArrayList<Object>(readerParameters);
    pagedParameters.add(size);
    pagedParameters.add((long) page * size);
    var items =
        db.list(
            fields
                + "round(ST_Y(c.location::geometry)::numeric,3) latitude,"
                + "round(ST_X(c.location::geometry)::numeric,3) longitude"
                + base
                + " ORDER BY c.created_at DESC,c.id LIMIT ? OFFSET ?",
            pagedParameters.toArray());
    var top =
        db.list(
            fields
                + "round(ST_Y(c.location::geometry)::numeric,3) latitude,"
                + "round(ST_X(c.location::geometry)::numeric,3) longitude"
                + base
                + " AND EXISTS(SELECT 1 FROM complaint_vote v WHERE v.complaint_id=c.id)"
                + " ORDER BY votes DESC,c.created_at DESC,c.id LIMIT 5",
            readerParameters.toArray());
    items.forEach(transfers::publicProgress);
    top.forEach(transfers::publicProgress);
    media.decorate(items, u);
    media.decorate(top, u);
    return Map.of(
        "items",
        items,
        "top",
        top,
        "total",
        stats.get("total"),
        "stats",
        stats,
        "municipalityTotal",
        municipalityTotal);
  }

  @GetMapping("/community/complaints/{id}")
  public Object communityDetail(@PathVariable UUID id, Authentication a) {
    var u = access.user(a);
    access.role(u, "CITIZEN");
    var c =
        db.one(
            "SELECT c.id,k.name category_name,k.name"
                + " title,c.status,c.created_at,c.updated_at,c.due_at,round(ST_Y(c.location::geometry)::numeric,3)"
                + " latitude,round(ST_X(c.location::geometry)::numeric,3) longitude,(c.external_id"
                + " LIKE 'mock-community-v1:%') mock FROM complaint c JOIN category k ON"
                + " k.id=c.category_id WHERE c.id=? AND c.municipality_id=?",
            id, u.get("municipality_id"));
    transfers.publicProgress(c);
    return Map.of(
        "complaint",
        c,
        "media",
        media.visible(id, u),
        "history",
        citizenHistory(id, (String) c.get("status")),
        "files",
        List.of(),
        "actions",
        List.of());
  }

  private List<Map<String, Object>> citizenHistory(UUID id, String status) {
    var history =
        db.list(
            "SELECT action,from_status,to_status,created_at,reason FROM audit_event WHERE"
                + " complaint_id=? AND to_status IS NOT NULL ORDER BY created_at,id",
            id);
    String terminalAction =
        Map.of("REJECTED", "REJECT", "TERMINATED", "DENY", "CLOSED", "CLOSE").get(status);
    int publicDecision = -1;
    for (int i = 0; i < history.size(); i++)
      if (terminalAction != null
          && terminalAction.equals(history.get(i).get("action"))
          && status.equals(history.get(i).get("to_status"))) publicDecision = i;
    for (int i = 0; i < history.size(); i++)
      if (i != publicDecision) history.get(i).remove("reason");
    return history;
  }

  @PostMapping("/community/complaints/{id}/follow")
  public Object communityFollow(@PathVariable UUID id, Authentication a) {
    var u = access.user(a);
    access.role(u, "CITIZEN");
    db.one(
        "SELECT id FROM complaint WHERE id=? AND municipality_id=?", id, u.get("municipality_id"));
    db.run(
        "INSERT INTO follower(complaint_id,user_id) VALUES(?,?) ON CONFLICT DO NOTHING",
        id,
        u.get("id"));
    return Map.of("ok", true);
  }

  @PostMapping("/community/complaints/{id}/vote")
  public Object vote(@PathVariable UUID id, Authentication a) {
    var u = access.user(a);
    access.role(u, "CITIZEN");
    db.one(
        "SELECT id FROM complaint WHERE id=? AND municipality_id=?", id, u.get("municipality_id"));
    db.run(
        "INSERT INTO complaint_vote(complaint_id,user_id) VALUES(?,?) ON CONFLICT DO NOTHING",
        id,
        u.get("id"));
    return Map.of("ok", true);
  }

  @DeleteMapping("/community/complaints/{id}/vote")
  public Object removeVote(@PathVariable UUID id, Authentication a) {
    var u = access.user(a);
    access.role(u, "CITIZEN");
    db.run("DELETE FROM complaint_vote WHERE complaint_id=? AND user_id=?", id, u.get("id"));
    return Map.of("ok", true);
  }

  @GetMapping("/nearby")
  public Object nearby(
      @RequestParam(required = false) UUID categoryId,
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
        "SELECT c.id,c.category_id,k.name"
            + " category_name,c.status,c.created_at,COALESCE(c.external_id LIKE"
            + " 'mock-community-v1:%',false) mock,(SELECT count(*) FROM complaint_vote v WHERE"
            + " v.complaint_id=c.id) votes,EXISTS(SELECT 1 FROM complaint_vote v WHERE"
            + " v.complaint_id=c.id AND v.user_id=?::uuid) voted,EXISTS(SELECT 1 FROM follower f"
            + " WHERE f.complaint_id=c.id AND f.user_id=?::uuid) following,"
            + "round(ST_Y(c.location::geometry)::numeric,3)"
            + " latitude,round(ST_X(c.location::geometry)::numeric,3) longitude FROM complaint c"
            + " JOIN category k ON k.id=c.category_id WHERE c.municipality_id=? AND (?::uuid IS"
            + " NULL OR c.category_id=?::uuid) AND c.status NOT IN"
            + " ('REJECTED','TERMINATED','CLOSED') AND"
            + " ST_DWithin(c.location,ST_SetSRID(ST_MakePoint(?,?),4326)::geography,100) ORDER BY"
            + " c.created_at DESC LIMIT 20",
        u.get("id"),
        u.get("id"),
        u.get("municipality_id"),
        categoryId,
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
