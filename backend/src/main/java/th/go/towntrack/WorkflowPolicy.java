package th.go.towntrack;

import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** Current operational permissions, including complaints with older published definitions. */
@Component
public class WorkflowPolicy {
  final Db db;
  private static final Set<String> REQUIRED_REASON =
      Set.of(
          "REJECT",
          "DECLINE",
          "RETURN_ASSIGNMENT",
          "REQUEST_RESOURCE",
          "RETURN_RESOURCE",
          "RETURN_FIELD",
          "RETURN_LEADER",
          "REQUEST_TRANSFER",
          "RETURN_TRANSFER",
          "TRANSFER_DEPARTMENT",
          "APPROVE",
          "DENY",
          "CLOSE");

  WorkflowPolicy(Db db) {
    this.db = db;
  }

  String reason(Map<String, Object> body, String action) {
    Object value = body.get("reason");
    if (REQUIRED_REASON.contains(action)) return Workflow.text(body, "reason", 4000);
    if (value == null) return "";
    if (!(value instanceof String text) || text.length() > 4000)
      throw new IllegalArgumentException("บันทึกการดำเนินการไม่ถูกต้อง");
    return text.trim();
  }

  boolean dispatched(Object id) {
    return !db.list("SELECT id FROM work_order WHERE complaint_id=? AND NOT handed_off LIMIT 1", id)
        .isEmpty();
  }

  Map<String, Object> transition(Map<String, Object> c, String action, Map<String, Object> user) {
    if (action.equals("REQUEST_RESOURCE") && !"FIELD".equals(user.get("role"))) Access.deny();
    if (action.equals("RETURN_ASSIGNMENT") && "TRIAGED".equals(c.get("status"))) {
      if (dispatched(c.get("id")))
        throw new ResponseStatusException(
            HttpStatus.CONFLICT,
            "งานนี้เคยมอบหมายผู้ลงพื้นที่แล้ว ไม่สามารถส่งคืนแบบจ่ายงานผิดได้");
      return Map.of("role", "LEADER", "to_status", "DEPARTMENT_RETURNED");
    }
    String from = (String) c.get("status");
    if (action.equals("REQUEST_TRANSFER")
        && List.of("LEADER_REVIEW", "LEADER_REVISION").contains(from))
      return Map.of("role", "LEADER", "to_status", "TRANSFER_PENDING");
    if (action.equals("TRANSFER_DEPARTMENT")
        && List.of("TRANSFER_PENDING", "DEPARTMENT_RETURNED").contains(from))
      return Map.of("role", "OFFICER", "to_status", "TRIAGED");
    if (action.equals("RETURN_TRANSFER") && from.equals("TRANSFER_PENDING"))
      return Map.of("role", "OFFICER", "to_status", "LEADER_REVISION");
    return db.one(
        "SELECT * FROM workflow_transition WHERE workflow_id=? AND from_status=? AND action=?",
        c.get("workflow_id"),
        c.get("status"),
        action);
  }

  List<Map<String, Object>> actions(Map<String, Object> c, Map<String, Object> user) {
    if (!db.list("SELECT plan_id FROM route_stop WHERE complaint_id=? AND reserved", c.get("id"))
        .isEmpty()) return List.of();
    var result =
        new ArrayList<>(
            db.list(
                "SELECT action FROM workflow_transition WHERE workflow_id=? AND from_status=? AND role=?",
                c.get("workflow_id"),
                c.get("status"),
                user.get("role")));
    if (!"FIELD".equals(user.get("role")))
      result.removeIf(row -> "REQUEST_RESOURCE".equals(row.get("action")));
    if ("LEADER".equals(user.get("role"))
        && "TRIAGED".equals(c.get("status"))
        && !dispatched(c.get("id"))) result.add(Map.of("action", "RETURN_ASSIGNMENT"));
    String from = (String) c.get("status");
    if ("LEADER".equals(user.get("role"))
        && List.of("LEADER_REVIEW", "LEADER_REVISION").contains(from))
      result.add(Map.of("action", "REQUEST_TRANSFER"));
    if ("OFFICER".equals(user.get("role"))) {
      if (List.of("TRANSFER_PENDING", "DEPARTMENT_RETURNED").contains(from))
        result.add(Map.of("action", "TRANSFER_DEPARTMENT"));
      if (from.equals("TRANSFER_PENDING")) result.add(Map.of("action", "RETURN_TRANSFER"));
    }
    return result;
  }
}
