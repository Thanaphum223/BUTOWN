package th.go.towntrack;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import java.util.concurrent.Semaphore;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class RoutePlanning {
  final Db db;
  final Access access;
  final Workflow workflow;
  final OsrmRouting routing;
  final ObjectMapper json;
  final Semaphore calculating = new Semaphore(1);

  RoutePlanning(Db db, Access access, Workflow workflow, OsrmRouting routing, ObjectMapper json) {
    this.db = db;
    this.access = access;
    this.workflow = workflow;
    this.routing = routing;
    this.json = json;
  }

  ResponseStatusException changed() {
    return new ResponseStatusException(
        HttpStatus.CONFLICT, "งานหรือรอบงานเปลี่ยนแล้ว กรุณาโหลดใหม่และคำนวณรอบอีกครั้ง");
  }

  static final String NO_ACTIVE =
      "NOT EXISTS(SELECT 1 FROM work_order w WHERE w.complaint_id=c.id AND w.status NOT IN ('DECLINED','CANCELLED','COMPLETE'))";

  List<Map<String, Object>> candidates(Map<String, Object> u) {
    access.role(u, "OFFICER", "LEADER");
    return db.list(
        "SELECT c.id,c.title,c.address,c.version,c.due_at,c.leader_id,c.department_id,l.display_name leader_name,d.name department_name,ST_Y(c.location::geometry) latitude,ST_X(c.location::geometry) longitude FROM complaint c JOIN app_user l ON l.id=c.leader_id JOIN department d ON d.id=c.department_id WHERE c.municipality_id=? AND c.status='TRIAGED' AND c.location IS NOT NULL AND l.enabled AND l.role IN ('LEADER','ADMIN') AND l.department_id=c.department_id AND (?::uuid IS NULL OR c.leader_id=?) AND "
            + NO_ACTIVE
            + " AND NOT EXISTS(SELECT 1 FROM route_stop rs WHERE rs.complaint_id=c.id AND rs.reserved) ORDER BY c.due_at,c.id LIMIT 200",
        u.get("municipality_id"),
        u.get("role").equals("LEADER") ? u.get("id") : null,
        u.get("role").equals("LEADER") ? u.get("id") : null);
  }

  boolean visible(Map<String, Object> p, Map<String, Object> u) {
    if ("ADMIN".equals(u.get("role"))) return true;
    if ("DRAFT".equals(p.get("status")))
      return List.of("OFFICER", "LEADER").contains(u.get("role"))
          && u.get("id").equals(p.get("created_by"));
    return switch ((String) u.get("role")) {
      case "OFFICER" -> true;
      case "LEADER" -> u.get("id").equals(p.get("leader_id"));
      case "FIELD" ->
          !db.list(
                  "SELECT rs.complaint_id FROM route_stop rs JOIN work_order w ON w.id=rs.work_order_id WHERE rs.plan_id=? AND (w.assignee_id=? OR EXISTS(SELECT 1 FROM work_member wm WHERE wm.work_order_id=w.id AND wm.user_id=?))",
                  p.get("id"),
                  u.get("id"),
                  u.get("id"))
              .isEmpty();
      default -> false;
    };
  }

  Map<String, Object> plan(UUID id, Map<String, Object> u, boolean lock) {
    access.role(u, "OFFICER", "LEADER", "FIELD", "ADMIN");
    var p =
        db.one(
            "SELECT * FROM route_plan WHERE id=? AND municipality_id=?"
                + (lock ? " FOR UPDATE" : ""),
            id,
            u.get("municipality_id"));
    if (!visible(p, u)) Access.deny();
    return p;
  }

  List<Map<String, Object>> list(Map<String, Object> u) {
    access.role(u, "OFFICER", "LEADER", "FIELD", "ADMIN");
    String scope =
        switch ((String) u.get("role")) {
          case "LEADER" -> "p.leader_id=? AND (p.status<>'DRAFT' OR p.created_by=?)";
          case "FIELD" ->
              "EXISTS(SELECT 1 FROM route_stop rs JOIN work_order w ON w.id=rs.work_order_id WHERE rs.plan_id=p.id AND (w.assignee_id=? OR EXISTS(SELECT 1 FROM work_member wm WHERE wm.work_order_id=w.id AND wm.user_id=?)))";
          case "OFFICER" -> "(p.status<>'DRAFT' OR p.created_by=?)";
          default -> "true";
        };
    var args = new ArrayList<Object>();
    args.add(u.get("municipality_id"));
    if (!u.get("role").equals("ADMIN")) args.add(u.get("id"));
    if (List.of("LEADER", "FIELD").contains(u.get("role"))) args.add(u.get("id"));
    return db.list(
        "SELECT p.id,p.name,p.status,p.version,p.distance,p.duration,p.return_to_start,p.created_at,l.display_name leader_name,d.name department_name,t.name team_name,(SELECT count(*) FROM route_stop rs WHERE rs.plan_id=p.id) stop_count FROM route_plan p JOIN app_user l ON l.id=p.leader_id JOIN department d ON d.id=p.department_id LEFT JOIN field_team t ON t.id=p.team_id WHERE p.municipality_id=? AND "
            + scope
            + " ORDER BY p.created_at DESC LIMIT 100",
        args.toArray());
  }

  List<Map<String, Object>> stops(UUID id) {
    return db.list(
        "SELECT rs.*,w.status work_status,COALESCE(w.handed_off,false) historical,c.status complaint_status FROM route_stop rs JOIN complaint c ON c.id=rs.complaint_id LEFT JOIN work_order w ON w.id=rs.work_order_id WHERE rs.plan_id=? ORDER BY rs.stop_order",
        id);
  }

  Map<String, Object> detail(UUID id, Map<String, Object> u) {
    var p = plan(id, u, false);
    try {
      p.put("geometry", json.readTree(p.get("geometry").toString()));
    } catch (Exception e) {
      throw new IllegalStateException("Stored route geometry invalid");
    }
    p.put("stops", stops(id));
    p.put(
        "history",
        db.list(
            "SELECT action,reason,created_at,details->>'actorName' actor_name,details->>'actorRole' actor_role FROM audit_event WHERE municipality_id=? AND details->>'routePlanId'=? ORDER BY created_at,id",
            u.get("municipality_id"),
            id.toString()));
    p.put("routing_enabled", routing.enabled());
    return p;
  }

  double number(Map<String, Object> body, String key) {
    if (!(body.get(key) instanceof Number n) || !Double.isFinite(n.doubleValue()))
      throw new IllegalArgumentException("กรุณาระบุจุดเริ่มเส้นทาง");
    return n.doubleValue();
  }

  Map<String, Object> calculate(Map<String, Object> b, Map<String, Object> u) {
    access.role(u, "OFFICER", "LEADER");
    if (!(b.get("complaintIds") instanceof List<?> raw) || raw.size() < 2 || raw.size() > 10)
      throw new IllegalArgumentException("เลือกงาน 2–10 จุดในกองและหัวหน้าคนเดียวกัน");
    var ids = raw.stream().map(Db::id).toList();
    if (new HashSet<>(ids).size() != ids.size())
      throw new IllegalArgumentException("มีเลขเรื่องซ้ำในรอบ");
    var start = new OsrmRouting.Point(number(b, "startLatitude"), number(b, "startLongitude"));
    if (!(b.get("returnToStart") instanceof Boolean loop))
      throw new IllegalArgumentException("กรุณาเลือกรูปแบบจบเส้นทาง");
    boolean optimize = !Boolean.FALSE.equals(b.get("optimize"));
    if (b.containsKey("optimize") && !(b.get("optimize") instanceof Boolean))
      throw new IllegalArgumentException();
    if (!calculating.tryAcquire())
      throw new ResponseStatusException(
          HttpStatus.TOO_MANY_REQUESTS, "กำลังคำนวณรอบอื่น กรุณารอสักครู่แล้วลองอีกครั้ง");
    try {
      var cases = new ArrayList<Map<String, Object>>();
      Object leader = null, department = null;
      for (UUID id : ids) {
        var c = access.complaint(id, u, false);
        eligible(c);
        if (c.get("leader_id") == null
            || c.get("department_id") == null
            || c.get("latitude") == null) throw changed();
        if (leader == null) {
          leader = c.get("leader_id");
          department = c.get("department_id");
        }
        if (!leader.equals(c.get("leader_id")) || !department.equals(c.get("department_id")))
          throw changed();
        if (!db.list("SELECT plan_id FROM route_stop WHERE complaint_id=? AND reserved", id)
            .isEmpty()) throw changed();
        cases.add(c);
      }
      access.target(leader, u, "LEADER", department);
      var points = new ArrayList<OsrmRouting.Point>();
      points.add(start);
      for (var c : cases) points.add(point(c));
      List<Integer> order =
          optimize
              ? RouteOptimizer.order(routing.table(points), loop)
              : java.util.stream.IntStream.range(1, points.size()).boxed().toList();
      var roadPoints = new ArrayList<OsrmRouting.Point>();
      roadPoints.add(start);
      for (int j : order) roadPoints.add(points.get(j));
      if (loop) roadPoints.add(start);
      var road = routing.road(roadPoints);
      UUID id = UUID.randomUUID();
      db.run(
          "INSERT INTO route_plan(id,municipality_id,department_id,leader_id,created_by,name,start_latitude,start_longitude,return_to_start,optimized,distance,duration,geometry) VALUES(?,?,?,?,?,'รอบงานใหม่',?,?,?,?,?,?,?::jsonb)",
          id,
          u.get("municipality_id"),
          department,
          leader,
          u.get("id"),
          start.latitude(),
          start.longitude(),
          loop,
          optimize,
          road.distance(),
          road.duration(),
          road.geometry().toString());
      for (int n = 0; n < order.size(); n++) {
        var c = cases.get(order.get(n) - 1);
        db.run(
            "INSERT INTO route_stop(plan_id,complaint_id,stop_order,complaint_version,title,address,latitude,longitude) VALUES(?,?,?,?,?,?,?,?)",
            id,
            c.get("id"),
            n + 1,
            c.get("version"),
            c.get("title"),
            c.get("address"),
            c.get("latitude"),
            c.get("longitude"));
      }
      audit(id, u, "ROUTE_CALCULATE", "");
      return detail(id, u);
    } finally {
      calculating.release();
    }
  }

  OsrmRouting.Point point(Map<String, Object> c) {
    return new OsrmRouting.Point(
        ((Number) c.get("latitude")).doubleValue(), ((Number) c.get("longitude")).doubleValue());
  }

  void eligible(Map<String, Object> c) {
    if (!"TRIAGED".equals(c.get("status"))
        || !db.list(
                "SELECT id FROM work_order WHERE complaint_id=? AND status NOT IN ('DECLINED','CANCELLED','COMPLETE')",
                c.get("id"))
            .isEmpty()) throw changed();
  }

  void version(Map<String, Object> p, Map<String, Object> b) {
    if (!(b.get("version") instanceof Number n)
        || n.doubleValue() != n.longValue()
        || n.longValue() < 0) throw new IllegalArgumentException("version ไม่ถูกต้อง");
    if (n.longValue() != ((Number) p.get("version")).longValue()) throw changed();
  }

  void validateStops(
      Map<String, Object> p, List<Map<String, Object>> stops, Map<String, Object> u) {
    if (stops.size() < 2 || stops.size() > 10) throw changed();
    // Stable lock ordering prevents two overlapping proposals or confirmations from deadlocking.
    var sorted =
        stops.stream().sorted(Comparator.comparing(s -> s.get("complaint_id").toString())).toList();
    for (var stop : sorted) {
      var c = access.complaint((UUID) stop.get("complaint_id"), u, true);
      eligible(c);
      if (c.get("latitude") == null
          || c.get("longitude") == null
          || !Objects.equals(c.get("leader_id"), p.get("leader_id"))
          || !Objects.equals(c.get("department_id"), p.get("department_id"))
          || ((Number) c.get("version")).longValue()
              != ((Number) stop.get("complaint_version")).longValue()
          || !point(c)
              .equals(
                  new OsrmRouting.Point(
                      ((Number) stop.get("latitude")).doubleValue(),
                      ((Number) stop.get("longitude")).doubleValue()))) throw changed();
      var reservation =
          db.list("SELECT plan_id FROM route_stop WHERE complaint_id=? AND reserved", c.get("id"));
      if (!reservation.isEmpty() && !reservation.getFirst().get("plan_id").equals(p.get("id")))
        throw changed();
    }
    access.target(p.get("leader_id"), u, "LEADER", p.get("department_id"));
  }

  Map<String, Object> change(UUID id, String action, Map<String, Object> b, Map<String, Object> u) {
    var p = plan(id, u, true);
    version(p, b);
    String status = (String) p.get("status");
    if (action.equals("propose")) {
      access.role(u, "OFFICER", "LEADER");
      if (!u.get("id").equals(p.get("created_by"))) Access.deny();
      if (!status.equals("DRAFT")
          || ((java.sql.Timestamp) p.get("created_at"))
              .toInstant()
              .isBefore(Instant.now().minusSeconds(900))) throw changed();
      String name = Workflow.text(b, "name", 200);
      validateStops(p, stops(id), u);
      db.run("UPDATE route_stop SET reserved=true WHERE plan_id=?", id);
      db.run(
          "UPDATE route_plan SET name=?,status='PROPOSED',version=version+1,proposed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=?",
          name,
          id);
      audit(id, u, "ROUTE_PROPOSE", optionalReason(b));
      for (var stop : stops(id))
        workflow.notifyUser(
            p.get("leader_id"), (UUID) stop.get("complaint_id"), "มีรอบงานเสนอให้จัดทีม: " + name);
    } else if (action.equals("confirm")) {
      access.role(u, "LEADER");
      if (!u.get("id").equals(p.get("leader_id"))) Access.deny();
      if (!status.equals("PROPOSED")) throw changed();
      var stops = stops(id);
      validateStops(p, stops, u);
      UUID team = Db.id(b.get("teamId"));
      for (var stop : stops) {
        UUID complaint = (UUID) stop.get("complaint_id");
        workflow.actForRoute(
            complaint,
            new HashMap<>(
                Map.of(
                    "action",
                    "ASSIGN",
                    "version",
                    stop.get("complaint_version"),
                    "teamId",
                    team,
                    "reason",
                    optionalReason(b))),
            u,
            id);
        db.run(
            "UPDATE route_stop SET work_order_id=? WHERE plan_id=? AND complaint_id=?",
            workflow.active(complaint).get("id"),
            id,
            complaint);
      }
      db.run("UPDATE route_stop SET reserved=false WHERE plan_id=?", id);
      db.run(
          "UPDATE route_plan SET status='DISPATCHED',team_id=?,confirmed_by=?,confirmed_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() WHERE id=?",
          team,
          u.get("id"),
          id);
      audit(id, u, "ROUTE_CONFIRM", optionalReason(b));
    } else if (List.of("decline", "cancel").contains(action)) {
      access.role(u, "OFFICER", "LEADER");
      if (action.equals("decline")) {
        if (!"LEADER".equals(u.get("role")) || !u.get("id").equals(p.get("leader_id")))
          Access.deny();
        if (!status.equals("PROPOSED")) throw changed();
      } else if (!u.get("id").equals(p.get("created_by")) && !"OFFICER".equals(u.get("role")))
        Access.deny();
      if (!List.of("DRAFT", "PROPOSED").contains(status)) throw changed();
      String reason = status.equals("DRAFT") ? optionalReason(b) : Workflow.text(b, "reason", 4000);
      db.run("UPDATE route_stop SET reserved=false WHERE plan_id=?", id);
      db.run(
          "UPDATE route_plan SET status=?,version=version+1,updated_at=clock_timestamp() WHERE id=?",
          action.equals("decline") ? "DECLINED" : "CANCELLED",
          id);
      audit(id, u, action.equals("decline") ? "ROUTE_DECLINE" : "ROUTE_CANCEL", reason);
      for (var stop : stops(id))
        workflow.notifyUser(
            p.get("created_by"),
            (UUID) stop.get("complaint_id"),
            "รอบงานถูกส่งกลับหรือยกเลิก กรุณาตรวจเหตุผล");
    } else throw new IllegalArgumentException();
    return detail(id, u);
  }

  String optionalReason(Map<String, Object> b) {
    if (!b.containsKey("reason")) return "";
    if (!(b.get("reason") instanceof String s) || s.length() > 4000)
      throw new IllegalArgumentException();
    return s.trim();
  }

  void audit(UUID id, Map<String, Object> u, String action, String reason) {
    db.run(
        "INSERT INTO audit_event(id,municipality_id,actor_id,action,reason,details) VALUES(?,?,?,?,?,?::jsonb)",
        UUID.randomUUID(),
        u.get("municipality_id"),
        u.get("id"),
        action,
        reason,
        json.valueToTree(
                Map.of(
                    "routePlanId",
                    id,
                    "actorRole",
                    u.get("role"),
                    "actorName",
                    u.get("display_name")))
            .toString());
  }
}
