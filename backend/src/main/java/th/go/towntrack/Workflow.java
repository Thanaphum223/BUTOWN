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

  @org.springframework.beans.factory.annotation.Autowired
  com.fasterxml.jackson.databind.ObjectMapper json;

  @org.springframework.beans.factory.annotation.Autowired WorkflowPolicy policy;
  @org.springframework.beans.factory.annotation.Autowired DepartmentTransfers transfers;
  @org.springframework.beans.factory.annotation.Autowired Stock stock;

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

  /** Optional number within [min, max]; absent means null. */
  static Double number(Map<String, Object> b, String key, double min, double max) {
    Object x = b.get(key);
    if (x == null) return null;
    if (!(x instanceof Number n) || !Double.isFinite(n.doubleValue()))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "กรุณาระบุ " + key + " ให้ถูกต้อง");
    double v = n.doubleValue();
    if (v < min || v > max)
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "กรุณาระบุ " + key + " ให้ถูกต้อง");
    return v;
  }

  public Map<String, Object> active(UUID id) {
    return db.one(
        "SELECT * FROM work_order WHERE complaint_id=? AND status NOT IN"
            + " ('DECLINED','COMPLETE','CANCELLED') ORDER BY created_at DESC LIMIT 1",
        id);
  }

  public void audit(
      Map<String, Object> u, UUID id, String action, String from, String to, String reason) {
    audit(u, id, action, from, to, reason, Map.of());
  }

  void audit(
      Map<String, Object> u,
      UUID id,
      String action,
      String from,
      String to,
      String reason,
      Map<String, Object> extra) {
    var details = new LinkedHashMap<String, Object>(extra);
    details.put("actorRole", u.get("role"));
    details.put("actorName", u.get("display_name"));
    if (u.get("department_id") != null) details.put("actorDepartmentId", u.get("department_id"));
    db.run(
        "INSERT INTO"
            + " audit_event(id,complaint_id,municipality_id,actor_id,action,from_status,to_status,reason,details)"
            + " VALUES(?,?,?,?,?,?,?,?,?::jsonb)",
        UUID.randomUUID(),
        id,
        u.get("municipality_id"),
        u.get("id"),
        action,
        from,
        to,
        reason,
        json.valueToTree(details).toString());
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
        reason = policy.reason(b, action),
        from = (String) c.get("status");
    var tr = policy.transition(c, action, u);
    access.role(u, (String) tr.get("role"));
    String to = (String) tr.get("to_status");
    if (List.of("FORWARD_REPORT", "VERIFY", "CLOSE", "REQUEST_TRANSFER").contains(action)) {
      var latest = latestReport(id);
      Object reportId = latest.get("id");
      var evidence =
          db.one(
              "SELECT count(*) FILTER(WHERE evidence_stage='BEFORE') before_count,count(*)"
                  + " FILTER(WHERE evidence_stage='AFTER' AND report_id=?) after_count FROM"
                  + " attachment WHERE (report_id=? OR work_order_id=?) AND content_type LIKE"
                  + " 'image/%'",
              reportId, reportId, latest.get("work_order_id"));
      if (((Number) evidence.get("before_count")).longValue() == 0
          || ((Number) evidence.get("after_count")).longValue() == 0)
        throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "ต้องมีภาพ BEFORE และ AFTER ของรายงานฉบับล่าสุดก่อนตรวจผ่านหรือปิดเรื่อง");
      if (List.of("VERIFY", "CLOSE").contains(action)
          && db.list(
                  "SELECT id FROM review WHERE report_id=? AND decision='FORWARD_REPORT'", reportId)
              .isEmpty())
        throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST, "รายงานฉบับล่าสุดยังไม่ผ่านหัวหน้าผู้ลงพื้นที่");
      if (action.equals("CLOSE")
          && db.list("SELECT id FROM review WHERE report_id=? AND decision='VERIFY'", reportId)
              .isEmpty())
        throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST, "รายงานฉบับล่าสุดยังไม่ผ่านการตรวจรับของเจ้าหน้าที่");
    }
    switch (action) {
      case "REQUEST_TRANSFER" -> {
        transfers.request(c, b, u, reason, latestReport(id).get("id"));
        notifyUser(c.get("officer_id"), id, "มีงานรอส่งต่อให้หน่วยงานอื่น");
      }
      case "TRANSFER_DEPARTMENT" -> {
        var leader = transfers.dispatch(c, b, u, reason);
        notifyUser(leader.get("id"), id, "มีงานรับช่วงต่อ รอจัดทีมลงพื้นที่");
      }
      case "RETURN_TRANSFER" -> {
        transfers.returnRequest(id, u, reason);
        notifyUser(c.get("leader_id"), id, "เจ้าหน้าที่ส่งกลับคำขอส่งต่อ กรุณาตรวจหมายเหตุ");
      }
      case "RETURN_ASSIGNMENT" -> {
        db.run("UPDATE complaint SET leader_id=NULL WHERE id=?", id);
        notifyUser(c.get("officer_id"), id, "หัวหน้าส่งคืนงาน กรุณาตรวจหน่วยงานที่รับผิดชอบ");
      }
      case "REASSIGN_LEADER" -> {
        var leader = access.target(b.get("leaderId"), u, "LEADER", c.get("department_id"));
        db.run(
            "UPDATE complaint SET officer_id=?,leader_id=? WHERE id=?",
            u.get("id"),
            leader.get("id"),
            id);
        // Keep original dispatch details and all earlier history intact.
        notifyUser(leader.get("id"), id, "มีคำร้องรอจัดทีม หลังเปลี่ยนหัวหน้าผู้รับผิดชอบ");
      }
      case "TRIAGE" -> {
        var leader = access.target(b.get("leaderId"), u, "LEADER", c.get("department_id"));
        db.run(
            "UPDATE complaint SET officer_id=?,leader_id=?,department_id=? WHERE id=?",
            u.get("id"),
            leader.get("id"),
            leader.get("department_id"),
            id);
        Map<String, Object> details = new LinkedHashMap<>();
        for (String key :
            List.of(
                "operationMethod",
                "urgency",
                "appointment",
                "workScope",
                "precautions",
                "coordinator")) {
          Object value = b.get(key);
          if (value != null) {
            if (!(value instanceof String text) || text.length() > 4000)
              throw new IllegalArgumentException();
            details.put(key, text);
          }
        }
        try {
          db.run(
              "UPDATE complaint SET assignment_details=?::jsonb WHERE id=?",
              json.writeValueAsString(details),
              id);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
          throw new IllegalArgumentException();
        }
        notifyUser(leader.get("id"), id, "มีคำร้องรอจัดทีม");
      }
      case "ASSIGN" -> {
        UUID teamId = b.get("teamId") == null ? null : Db.id(b.get("teamId"));
        Object assignee = b.get("assigneeId");
        var memberIds = new LinkedHashSet<UUID>();
        if (b.get("memberIds") != null) {
          if (!(b.get("memberIds") instanceof List<?> list) || teamId != null)
            throw new IllegalArgumentException();
          for (Object member : list) memberIds.add(Db.id(member));
          if (memberIds.size() < 2 || memberIds.size() > 50)
            throw new IllegalArgumentException("กรุณาเลือกสมาชิกทีม 2–50 คน");
          if (assignee == null || !memberIds.contains(Db.id(assignee)))
            throw new IllegalArgumentException("กรุณาเลือกผู้แทนทีมจากสมาชิกที่เลือก");
          // Validate every member before writing so one invalid person changes nothing.
          for (UUID member : memberIds) access.target(member, u, "FIELD", c.get("department_id"));
        }
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
          var members =
              db.list(
                  "SELECT p.id,p.role,p.enabled,p.department_id FROM team_member m JOIN app_user p"
                      + " ON p.id=m.user_id WHERE m.team_id=? FOR SHARE OF p",
                  teamId);
          if (members.isEmpty()
              || members.stream()
                  .noneMatch(member -> member.get("id").equals(team.get("representative_id"))))
            throw new IllegalArgumentException("ทีมนี้ไม่มีผู้แทนในรายชื่อสมาชิก กรุณาจัดทีมใหม่");
          for (var member : members) {
            if (!Boolean.TRUE.equals(member.get("enabled"))
                || !List.of("FIELD", "ADMIN").contains(member.get("role"))
                || !Objects.equals(c.get("department_id"), member.get("department_id")))
              throw new IllegalArgumentException(
                  "สมาชิกทีมมีการเปลี่ยนกอง บทบาท หรือปิดบัญชีแล้ว กรุณาจัดทีมใหม่ก่อนมอบหมายงาน");
            access.target(member.get("id"), u, "FIELD", c.get("department_id"));
          }
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
        for (UUID member : memberIds)
          db.run("INSERT INTO work_member(work_order_id,user_id) VALUES(?,?)", workId, member);
        notifyUser(target.get("id"), id, "มีงานลงพื้นที่รอรับงาน");
      }
      case "ACCEPT", "DECLINE", "START", "REQUEST_RESOURCE", "REPORT" -> {
        if (action.equals("REQUEST_RESOURCE") && from.equals("TRIAGED")) {
          db.run(
              "INSERT INTO resource_request(id,complaint_id,requested_by,workflow_origin,necessity)"
                  + " VALUES(?,?,?,'PRE_ASSIGN',?)",
              UUID.randomUUID(),
              id,
              u.get("id"),
              reason);
          notifyUser(
              c.get("officer_id"), id, "หัวหน้าผู้ลงพื้นที่เริ่มจัดทำข้อเสนอทรัพยากรก่อนจัดทีม");
          break;
        }
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
          case "START" -> {
            db.run(
                "UPDATE attachment SET work_order_id=? WHERE complaint_id=? AND"
                    + " evidence_stage='BEFORE' AND content_type LIKE 'image/%' AND report_id IS"
                    + " NULL AND resource_id IS NULL AND work_order_id IS NULL AND uploaded_by IN"
                    + " (SELECT assignee_id FROM work_order WHERE id=? UNION SELECT user_id FROM"
                    + " work_member WHERE work_order_id=?)",
                w.get("id"), id, w.get("id"), w.get("id"));
            if (db.list(
                    "SELECT id FROM attachment WHERE work_order_id=? AND evidence_stage='BEFORE'",
                    w.get("id"))
                .isEmpty())
              throw new ResponseStatusException(
                  HttpStatus.BAD_REQUEST, "กรุณาถ่ายรูปหน้างานก่อนเริ่มปฏิบัติงาน");
            Double lat = number(b, "latitude", -90, 90), lng = number(b, "longitude", -180, 180);
            if ((lat == null) != (lng == null))
              throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "กรุณาระบุพิกัดให้ครบ");
            Double accuracy = number(b, "accuracy", 0, 100000);
            db.run(
                "UPDATE work_order SET status='IN_PROGRESS',start_latitude=?::numeric,start_longitude=?::numeric,"
                    + "start_accuracy_m=?::numeric,start_distance_m=(SELECT"
                    + " round(ST_Distance(c.location,ST_SetSRID(ST_MakePoint(?::float8,?::float8),4326)::geography)::numeric,1)"
                    + " FROM complaint c WHERE c.id=?) WHERE id=?",
                lat,
                lng,
                lat == null ? null : accuracy,
                lng,
                lat,
                id,
                w.get("id"));
            issueForStart(c, w, b, u);
          }
          case "REQUEST_RESOURCE" -> {
            db.run(
                "INSERT INTO"
                    + " resource_request(id,complaint_id,work_order_id,requested_by,necessity,requested_items)"
                    + " VALUES(?,?,?,?,?,?::jsonb)",
                UUID.randomUUID(),
                id,
                w.get("id"),
                u.get("id"),
                reason,
                json.valueToTree(fromStock(requestedItems(b), u)).toString());
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
                        + " IS NULL AND resource_id IS NULL AND work_order_id IS NULL",
                    id,
                    u.get("id"))
                .isEmpty())
              throw new ResponseStatusException(
                  HttpStatus.BAD_REQUEST, "กรุณาแนบหลักฐานก่อนส่งรายงาน");
            var stages =
                db.one(
                    "SELECT count(*) FILTER(WHERE evidence_stage='BEFORE') b,count(*) FILTER(WHERE"
                        + " evidence_stage='AFTER' AND work_order_id IS NULL) a FROM attachment"
                        + " WHERE complaint_id=? AND content_type LIKE 'image/%' AND ((uploaded_by=?"
                        + " AND report_id IS NULL AND resource_id IS NULL AND work_order_id IS NULL)"
                        + " OR work_order_id=?)",
                    id, u.get("id"), w.get("id"));
            if (((Number) stages.get("b")).longValue() == 0
                || ((Number) stages.get("a")).longValue() == 0)
              throw new ResponseStatusException(
                  HttpStatus.BAD_REQUEST, "กรุณาแนบภาพก่อนทำ BEFORE และหลังทำ AFTER ให้ครบ");
            returnLeftovers(c, w, b, u);
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
                    + " report_id IS NULL AND resource_id IS NULL AND work_order_id IS NULL",
                report,
                id,
                u.get("id"));
            notifyUser(c.get("leader_id"), id, "มีรายงานรอตรวจ");
          }
        }
      }
      case "PROPOSE" -> {
        var r = resource(id);
        var documents =
            db.list(
                "SELECT content_type,size_bytes FROM attachment WHERE complaint_id=? AND"
                    + " uploaded_by=? AND report_id IS NULL AND resource_id IS NULL",
                id,
                u.get("id"));
        if (documents.isEmpty())
          throw new ResponseStatusException(
              HttpStatus.BAD_REQUEST, "กรุณาแนบเอกสารคำขอ PDF หรือรูปภาพ PNG/JPEG");
        if (documents.stream()
            .anyMatch(
                document ->
                    !List.of("application/pdf", "image/jpeg", "image/png")
                        .contains(document.get("content_type"))))
          throw new ResponseStatusException(
              HttpStatus.BAD_REQUEST, "รองรับเอกสาร PDF หรือรูปภาพ PNG/JPEG");
        if (documents.stream()
            .anyMatch(document -> ((Number) document.get("size_bytes")).longValue() > 15_000_000))
          throw new ResponseStatusException(
              HttpStatus.BAD_REQUEST, "ไฟล์เอกสารแต่ละไฟล์ต้องไม่เกิน 15 MB");
        String proposal = text(b, "proposal", 20000);
        var lineItems = new ArrayList<Map<String, Object>>();
        java.math.BigDecimal itemTotal = java.math.BigDecimal.ZERO;
        if (!b.containsKey("lineItems"))
          throw new IllegalArgumentException("กรุณาระบุรายการทรัพยากรอย่างน้อย 1 รายการ");
        if (b.containsKey("lineItems")) {
          if (!(b.get("lineItems") instanceof List<?> items)
              || items.isEmpty()
              || items.size() > 50)
            throw new IllegalArgumentException("กรุณาระบุรายการทรัพยากร 1–50 รายการ");
          // When field staff listed what they need, the leader prices exactly those items and may
          // only change quantities; names and units come from the request, matched by position.
          com.fasterxml.jackson.databind.JsonNode requested;
          try {
            requested = json.readTree(String.valueOf(r.get("requested_items")));
          } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException(e);
          }
          boolean fixed = requested != null && requested.isArray() && requested.size() > 0;
          if (fixed && items.size() != requested.size())
            throw new IllegalArgumentException(
                "หัวหน้าเพิ่มหรือลบรายการที่ผู้ลงพื้นที่ขอไม่ได้ ปรับได้เฉพาะจำนวนและราคา");
          for (int i = 0; i < items.size(); i++) {
            var entry = items.get(i);
            if (!(entry instanceof Map<?, ?> item)
                || !(item.get("name") instanceof String name)
                || name.isBlank()
                || name.trim().length() > 200)
              throw new IllegalArgumentException("กรุณาระบุชื่อรายการทรัพยากรให้ครบ");
            java.math.BigDecimal price;
            try {
              price = new java.math.BigDecimal(String.valueOf(item.get("amount")));
            } catch (Exception e) {
              throw new IllegalArgumentException("กรุณาระบุราคาของทุกรายการ");
            }
            if (price.signum() < 0
                || price.scale() > 2
                || price.compareTo(new java.math.BigDecimal("999999999999.99")) > 0)
              throw new IllegalArgumentException("ราคาต้องไม่ติดลบและมีทศนิยมไม่เกินสองตำแหน่ง");
            itemTotal = itemTotal.add(price);
            if (!fixed) {
              lineItems.add(Map.of("name", name.trim(), "amount", price));
              continue;
            }
            var want = requested.get(i);
            Object asked = item.get("quantity");
            if (asked == null) asked = want.get("quantity").asText();
            var line = new LinkedHashMap<String, Object>();
            line.put("name", want.get("name").asText());
            line.put("quantity", quantity(asked));
            line.put("unit", want.get("unit").asText());
            if (want.hasNonNull("stockItemId"))
              line.put("stockItemId", want.get("stockItemId").asText());
            line.put("amount", price);
            lineItems.add(line);
          }
        }
        java.math.BigDecimal amount;
        int days;
        try {
          amount =
              b.containsKey("lineItems")
                  ? itemTotal
                  : new java.math.BigDecimal(String.valueOf(b.get("amount")));
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
        UUID resourceRevision = UUID.randomUUID();
        db.run(
            "INSERT INTO"
                + " resource_revision(id,resource_id,revision,proposal,amount,duration_days,submitted_by,line_items)"
                + " VALUES(?,?,?,?,?,?,?,?::jsonb)",
            resourceRevision,
            r.get("id"),
            n,
            proposal,
            amount,
            days,
            u.get("id"),
            json.valueToTree(lineItems).toString());
        db.run(
            "UPDATE attachment SET resource_id=?,resource_revision_id=? WHERE complaint_id=? AND"
                + " uploaded_by=? AND report_id IS NULL AND resource_id IS NULL",
            r.get("id"),
            resourceRevision,
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
            var target = access.target(ids.get(i), u, "APPROVER", null);
            db.run(
                "INSERT INTO approval_assignment(resource_id,step,approver_id) VALUES(?,?,?)",
                r.get("id"),
                i + 1,
                target.get("id"));
          }
          checkApprovalAuthority(
              (UUID) r.get("id"),
              db.one("SELECT gov_role FROM app_user WHERE id=?", Db.id(ids.getLast())));
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
            } else checkApprovalAuthority((UUID) r.get("id"), u);
          }
        }
        String state =
            switch (action) {
              case "RETURN_RESOURCE" -> "REVISION";
              case "SEND_APPROVAL" -> "PENDING";
              case "APPROVE" -> to.equals("READY") ? "APPROVED" : "PENDING";
              default -> "DENIED";
            };
        if (action.equals("APPROVE") && to.equals("READY")) checkStock(r, u);
        if (action.equals("APPROVE")
            && to.equals("READY")
            && "PRE_ASSIGN".equals(r.get("workflow_origin"))) to = "TRIAGED";
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
        var report = latestReport(id);
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
      case "WITHDRAW_RESOURCE_REQUEST" -> {
        if (!u.get("id").equals(active(id).get("assignee_id"))) Access.deny();
        db.run(
            "UPDATE resource_request SET status='WITHDRAWN',version=version+1 WHERE id=?",
            resource(id).get("id"));
        notifyUser(c.get("leader_id"), id, "ผู้ลงพื้นที่ถอนคำขอใช้ทรัพยากร");
      }
      case "WITHDRAW_PROPOSAL" -> {
        db.run(
            "UPDATE resource_request SET status='REVISION',version=version+1 WHERE id=?",
            resource(id).get("id"));
        notifyUser(c.get("officer_id"), id, "หัวหน้าถอนข้อเสนอทรัพยากรกลับไปแก้ไข");
      }
      case "WITHDRAW_APPROVAL" -> {
        var r = resource(id);
        db.run(
            "DELETE FROM approval_assignment WHERE resource_id=? AND decision IS NULL",
            r.get("id"));
        db.run(
            "UPDATE resource_request SET status='CHECK',approver_id=NULL,version=version+1 WHERE"
                + " id=?",
            r.get("id"));
        notifyUser(r.get("approver_id"), id, "เจ้าหน้าที่ถอนคำขอทรัพยากรกลับไปตรวจใหม่");
      }
      case "UNDO_START" -> {
        var w = active(id);
        if (!u.get("id").equals(w.get("assignee_id"))) Access.deny();
        stock.returnAll(u, id, w.get("id"), "คืนวัสดุอัตโนมัติจากการยกเลิกการเริ่มปฏิบัติงาน");
        db.run(
            "UPDATE work_order SET status='ACCEPTED',start_latitude=NULL,start_longitude=NULL,"
                + "start_accuracy_m=NULL,start_distance_m=NULL WHERE id=?",
            w.get("id"));
        notifyUser(c.get("leader_id"), id, "ผู้ลงพื้นที่ยกเลิกการเริ่มปฏิบัติงาน");
      }
      case "REJECT" -> {}
      default ->
          throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ไม่รองรับการดำเนินการนี้");
    }
    // A new request replaces the approved one, so its hold must not outlive it.
    if (List.of("TRANSFER_DEPARTMENT", "REQUEST_RESOURCE").contains(action)
        || SlaController.CLOSED.contains(to)) stock.release(id);
    db.run(
        "UPDATE complaint SET status=?,version=version+1,updated_at=now(),closed_at=CASE WHEN ?"
            + " THEN now() END WHERE id=?",
        to,
        SlaController.CLOSED.contains(to),
        id);
    var assignmentAudit = new LinkedHashMap<String, Object>();
    if (action.equals("REASSIGN_LEADER")) {
      assignmentAudit.put("previousLeaderId", c.get("leader_id"));
      assignmentAudit.put("leaderId", b.get("leaderId"));
    }
    audit(u, id, action, from, to, reason, assignmentAudit);
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

  // Thai and Arabic digits both count as numbers; the quantity belongs in its own field.
  static final java.util.regex.Pattern UNIT =
      java.util.regex.Pattern.compile("[^\\p{N}]*\\p{L}[^\\p{N}]*");

  static List<Map<String, Object>> requestedItems(Map<String, Object> b) {
    if (!(b.get("items") instanceof List<?> items) || items.isEmpty() || items.size() > 50)
      throw new IllegalArgumentException("กรุณาระบุรายการที่ขอ 1–50 รายการ");
    var result = new ArrayList<Map<String, Object>>();
    for (Object entry : items) {
      if (!(entry instanceof Map<?, ?> item)
          || !(item.get("name") instanceof String name)
          || name.isBlank()
          || name.trim().length() > 200
          || !(item.get("unit") instanceof String unit)
          || unit.isBlank()
          || unit.trim().length() > 50)
        throw new IllegalArgumentException("กรุณาระบุชื่อรายการ จำนวน และหน่วยให้ครบ");
      if (!UNIT.matcher(unit.trim()).matches())
        throw new IllegalArgumentException("หน่วยต้องเป็นคำ เช่น ถุง เมตร และห้ามมีตัวเลข");
      var clean = new LinkedHashMap<String, Object>();
      clean.put("name", name.trim());
      clean.put("quantity", quantity(item.get("quantity")));
      clean.put("unit", unit.trim());
      if (item.get("stockItemId") != null)
        clean.put("stockItemId", Db.id(item.get("stockItemId")).toString());
      result.add(clean);
    }
    return result;
  }

  static java.math.BigDecimal quantity(Object value) {
    java.math.BigDecimal quantity;
    try {
      quantity = new java.math.BigDecimal(String.valueOf(value));
    } catch (NumberFormatException e) {
      throw new IllegalArgumentException("กรุณาระบุจำนวนเป็นตัวเลข");
    }
    if (quantity.signum() <= 0
        || quantity.scale() > 2
        || quantity.compareTo(new java.math.BigDecimal("1000000000")) > 0)
      throw new IllegalArgumentException("จำนวนต้องมากกว่า 0 และมีทศนิยมไม่เกินสองตำแหน่ง");
    return quantity;
  }

  /** Stock-linked request lines take their name and unit from the register. */
  List<Map<String, Object>> fromStock(List<Map<String, Object>> items, Map<String, Object> u) {
    for (var item : items) {
      if (item.get("stockItemId") == null) continue;
      var registered = stock.item(item.get("stockItemId"), u, false);
      if (!Boolean.TRUE.equals(registered.get("active")))
        throw new IllegalArgumentException("วัสดุนี้ปิดใช้งานในคลังแล้ว");
      item.put("name", registered.get("name"));
      item.put("unit", registered.get("unit"));
    }
    return items;
  }

  /** Stock lines of the latest approved proposal: stock item id to quantity. */
  Map<UUID, java.math.BigDecimal> approvedStock(Map<String, Object> r) {
    var result = new LinkedHashMap<UUID, java.math.BigDecimal>();
    var rows =
        db.list(
            "SELECT line_items::text items FROM resource_revision WHERE resource_id=? ORDER BY"
                + " revision DESC LIMIT 1",
            r.get("id"));
    if (rows.isEmpty() || rows.getFirst().get("items") == null) return result;
    try {
      for (var line : json.readTree((String) rows.getFirst().get("items")))
        if (line.hasNonNull("stockItemId") && line.hasNonNull("quantity"))
          result.merge(
              UUID.fromString(line.get("stockItemId").asText()),
              new java.math.BigDecimal(line.get("quantity").asText()),
              java.math.BigDecimal::add);
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalStateException(e);
    }
    return result;
  }

  // Approval does not move stock (clause 205 records the actual issue), but it holds the approved
  // quantity so no other job can take it.
  void checkStock(Map<String, Object> r, Map<String, Object> u) {
    stock.reserve(u, r.get("id"), approvedStock(r));
  }

  // Starting work is when items leave the store: approved items, plus anything the team takes
  // without a prior request (recorded as a retrospective issue for the leader to confirm).
  void issueForStart(
      Map<String, Object> c, Map<String, Object> w, Map<String, Object> b, Map<String, Object> u) {
    UUID id = (UUID) c.get("id");
    var latest =
        db.list(
            "SELECT * FROM resource_request WHERE complaint_id=? AND NOT handed_off ORDER BY created_at"
                + " DESC LIMIT 1",
            id);
    Map<UUID, java.math.BigDecimal> approved = Map.of();
    if (!latest.isEmpty()
        && "APPROVED".equals(latest.getFirst().get("status"))
        && ((java.math.BigDecimal)
                    db.one(
                            "SELECT COALESCE(-SUM(delta),0) net FROM stock_movement WHERE"
                                + " resource_id=? AND kind IN ('ISSUE','RETURN')",
                            latest.getFirst().get("id"))
                        .get("net"))
                .signum()
            == 0) approved = approvedStock(latest.getFirst());
    var extra = Stock.lines(b.get("stockItems"));
    var items = new HashSet<>(approved.keySet());
    for (var line : extra) items.add((UUID) line.get("stockItemId"));
    stock.lock(u, items);
    if (!approved.isEmpty()) {
      // Free this request's own hold first so the check below only protects other jobs.
      db.run(
          "UPDATE stock_reservation SET status='FULFILLED',resolved_at=now() WHERE resource_id=?"
              + " AND status='ACTIVE'",
          latest.getFirst().get("id"));
      for (var line : approved.entrySet()) {
        stock.requireAvailable(u, line.getKey(), line.getValue());
        stock.move(
            u,
            line.getKey(),
            "ISSUE",
            line.getValue().negate(),
            "เบิกตามคำขอใช้ทรัพยากรที่อนุมัติแล้ว",
            id,
            latest.getFirst().get("id"),
            w.get("id"));
      }
    }
    for (var line : extra) {
      if (!Boolean.TRUE.equals(stock.item(line.get("stockItemId"), u, false).get("active")))
        throw new IllegalArgumentException("วัสดุนี้ปิดใช้งานในคลังแล้ว");
      stock.requireAvailable(
          u, line.get("stockItemId"), (java.math.BigDecimal) line.get("quantity"));
      stock.move(
          u,
          line.get("stockItemId"),
          "ISSUE",
          ((java.math.BigDecimal) line.get("quantity")).negate(),
          "เบิกใช้หน้างานโดยไม่ได้ขอใช้ทรัพยากรล่วงหน้า (ใบเบิกย้อนหลัง รอหัวหน้ายืนยัน)",
          id,
          null,
          w.get("id"));
    }
    if (!extra.isEmpty())
      notifyUser(
          c.get("leader_id"),
          id,
          "ผู้ลงพื้นที่เบิกวัสดุจากคลังโดยไม่ได้ขอใช้ล่วงหน้า กรุณาตรวจสอบ");
  }

  // Leftovers come back to the register with the report; the rest counts as used on the job.
  void returnLeftovers(
      Map<String, Object> c, Map<String, Object> w, Map<String, Object> b, Map<String, Object> u) {
    var outstanding = stock.outstanding(w.get("id"));
    stock.lock(u, outstanding.keySet());
    for (var line : Stock.lines(b.get("stockReturns"))) {
      var held = outstanding.get((UUID) line.get("stockItemId"));
      var quantity = (java.math.BigDecimal) line.get("quantity");
      if (held == null || quantity.compareTo(held) > 0)
        throw new IllegalArgumentException("จำนวนที่คืนต้องไม่เกินจำนวนที่เบิกไป");
      stock.move(
          u,
          line.get("stockItemId"),
          "RETURN",
          quantity,
          "คืนวัสดุที่เหลือหลังปฏิบัติงาน",
          c.get("id"),
          null,
          w.get("id"));
    }
    boolean equipmentMissing = false;
    for (UUID item : stock.outstanding(w.get("id")).keySet())
      equipmentMissing |= "EQUIPMENT".equals(stock.item(item, u, false).get("item_type"));
    if (!equipmentMissing) return;
    var recipients = new LinkedHashSet<Object>();
    recipients.add(c.get("leader_id"));
    for (var keeper :
        db.list(
            "SELECT id FROM app_user WHERE municipality_id=? AND stock_keeper=true AND enabled=true",
            u.get("municipality_id"))) recipients.add(keeper.get("id"));
    for (Object recipient : recipients)
      notifyUser(
          recipient,
          (UUID) c.get("id"),
          "ครุภัณฑ์ที่เบิกไปยังคืนคลังไม่ครบ กรุณาตรวจสอบกับผู้ลงพื้นที่");
  }

  // Procurement regulation 2560, clause 79: these positions may not give final approval above this.
  static final java.math.BigDecimal LIMITED_APPROVAL = new java.math.BigDecimal("500000.00");
  static final Set<String> LIMITED_APPROVERS = Set.of("FINANCE_DIRECTOR", "SUPPLY_HEAD");

  void checkApprovalAuthority(UUID resourceId, Map<String, Object> finalApprover) {
    Object govRole = finalApprover.get("gov_role");
    if (govRole == null || !LIMITED_APPROVERS.contains(govRole)) return;
    var latest =
        db.list(
            "SELECT amount FROM resource_revision WHERE resource_id=? ORDER BY revision DESC LIMIT 1",
            resourceId);
    if (!latest.isEmpty()
        && ((java.math.BigDecimal) latest.getFirst().get("amount")).compareTo(LIMITED_APPROVAL) > 0)
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST,
          "วงเงินเกิน 500,000 บาท เกินอำนาจอนุมัติของผู้อำนวยการกองคลัง/หัวหน้าเจ้าหน้าที่พัสดุ กรุณาเลือกปลัดเทศบาล รองปลัดเทศบาล รองนายกเทศมนตรี หรือนายกเทศมนตรีเป็นผู้อนุมัติลำดับสุดท้าย");
  }

  Map<String, Object> latestReport(UUID id) {
    return db.one(
        "SELECT r.* FROM field_report r JOIN work_order w ON w.id=r.work_order_id WHERE"
            + " r.complaint_id=? AND NOT w.handed_off ORDER BY r.created_at DESC,r.revision DESC"
            + " LIMIT 1",
        id);
  }

  public Map<String, Object> resource(UUID id) {
    return db.one(
        "SELECT * FROM resource_request WHERE complaint_id=? ORDER BY created_at DESC LIMIT 1", id);
  }
}
