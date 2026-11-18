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
          "REASSIGN_LEADER",
          "REQUEST_RESOURCE",
          "RETURN_RESOURCE",
          "RETURN_FIELD",
          "RETURN_LEADER",
          "REQUEST_TRANSFER",
          "RETURN_TRANSFER",
          "TRANSFER_DEPARTMENT",
          "APPROVE",
          "DENY",
          "CLOSE",
          "WITHDRAW_RESOURCE_REQUEST",
          "WITHDRAW_PROPOSAL",
          "WITHDRAW_APPROVAL",
          "UNDO_START");

  // Reversals are allowed only before the next person has acted on the step being undone.
  static final Map<String, List<String>> REVERSALS =
      Map.of(
          "WITHDRAW_RESOURCE_REQUEST", List.of("RESOURCE_DRAFT", "FIELD"),
          "WITHDRAW_PROPOSAL", List.of("RESOURCE_CHECK", "LEADER"),
          "WITHDRAW_APPROVAL", List.of("RESOURCE_APPROVAL", "OFFICER"),
          "UNDO_START", List.of("IN_PROGRESS", "FIELD"));

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

  // Only undispatched work can be recovered without changing an existing team's scope.
  static final String RECOVERABLE_ASSIGNMENT =
      "(c.status='TRIAGED' AND NOT EXISTS(SELECT 1 FROM work_order w WHERE w.complaint_id=c.id AND NOT w.handed_off)"
          + " AND NOT EXISTS(SELECT 1 FROM app_user head WHERE head.id=c.leader_id AND head.enabled=true"
          + " AND head.role IN ('LEADER','ADMIN') AND head.municipality_id=c.municipality_id AND head.department_id=c.department_id))";

  boolean recoverableAssignment(Map<String, Object> c) {
    return !db.list(
            "SELECT c.id FROM complaint c WHERE c.id=? AND " + RECOVERABLE_ASSIGNMENT, c.get("id"))
        .isEmpty();
  }

  Map<String, Object> transition(Map<String, Object> c, String action, Map<String, Object> user) {
    if (action.equals("REASSIGN_LEADER")) {
      accessRecoveryRole(user);
      if (!recoverableAssignment(c))
        throw new ResponseStatusException(
            HttpStatus.CONFLICT,
            "งานนี้ยังมีหัวหน้ารับผิดชอบหรือเคยมอบหมายทีมแล้ว ไม่สามารถเลือกหัวหน้าใหม่ในขั้นตอนนี้ได้");
      return Map.of("role", "OFFICER", "to_status", "TRIAGED");
    }
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
    if (REVERSALS.containsKey(action)) {
      if (!reversible(c, action))
        throw new ResponseStatusException(
            HttpStatus.CONFLICT, "ขั้นตอนนี้ดำเนินการต่อไปแล้ว ไม่สามารถถอนหรือย้อนกลับได้");
      String to =
          switch (action) {
            case "WITHDRAW_RESOURCE_REQUEST" -> "ACCEPTED";
            case "WITHDRAW_PROPOSAL" -> "RESOURCE_REVISION";
            case "WITHDRAW_APPROVAL" -> "RESOURCE_CHECK";
            default -> startedFrom(c.get("id"));
          };
      return Map.of("role", REVERSALS.get(action).get(1), "to_status", to);
    }
    return db.one(
        "SELECT * FROM workflow_transition WHERE workflow_id=? AND from_status=? AND action=?",
        c.get("workflow_id"),
        c.get("status"),
        action);
  }

  boolean reversible(Map<String, Object> c, String action) {
    var rule = REVERSALS.get(action);
    if (rule == null || !rule.get(0).equals(c.get("status"))) return false;
    Object id = c.get("id");
    String latestResource =
        "SELECT id FROM resource_request r WHERE r.complaint_id=? AND NOT r.handed_off AND"
            + " r.created_at=(SELECT max(created_at) FROM resource_request WHERE complaint_id=r.complaint_id) AND ";
    String condition =
        switch (action) {
          case "WITHDRAW_RESOURCE_REQUEST" ->
              latestResource
                  + "r.status='DRAFT' AND r.workflow_origin='POST_ACCEPT' AND NOT EXISTS(SELECT 1"
                  + " FROM resource_revision v WHERE v.resource_id=r.id)";
          case "WITHDRAW_PROPOSAL" -> latestResource + "r.status='CHECK'";
          case "WITHDRAW_APPROVAL" ->
              latestResource
                  + "r.status='PENDING' AND NOT EXISTS(SELECT 1 FROM approval_assignment a WHERE"
                  + " a.resource_id=r.id AND a.decision IS NOT NULL)";
          default ->
              "SELECT w.id FROM work_order w WHERE w.complaint_id=? AND NOT w.handed_off AND"
                  + " w.status='IN_PROGRESS' AND NOT EXISTS(SELECT 1 FROM field_report f WHERE"
                  + " f.work_order_id=w.id)";
        };
    return !db.list(condition, id).isEmpty();
  }

  String startedFrom(Object complaintId) {
    var rows =
        db.list(
            "SELECT from_status FROM audit_event WHERE complaint_id=? AND action='START' ORDER BY"
                + " created_at DESC LIMIT 1",
            complaintId);
    return !rows.isEmpty() && "READY".equals(rows.getFirst().get("from_status"))
        ? "READY"
        : "ACCEPTED";
  }

  private void accessRecoveryRole(Map<String, Object> user) {
    if (!"OFFICER".equals(user.get("role"))) Access.deny();
  }

  List<Map<String, Object>> actions(Map<String, Object> c, Map<String, Object> user) {
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
      if (recoverableAssignment(c)) result.add(Map.of("action", "REASSIGN_LEADER"));
      if (List.of("TRANSFER_PENDING", "DEPARTMENT_RETURNED").contains(from))
        result.add(Map.of("action", "TRANSFER_DEPARTMENT"));
      if (from.equals("TRANSFER_PENDING")) result.add(Map.of("action", "RETURN_TRANSFER"));
    }
    for (var reversal : REVERSALS.entrySet())
      if (reversal.getValue().get(1).equals(user.get("role")) && reversible(c, reversal.getKey()))
        result.add(Map.of("action", reversal.getKey()));
    return result;
  }
}
