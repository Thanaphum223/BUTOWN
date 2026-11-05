package th.go.towntrack;

import java.util.*;
import org.springframework.stereotype.Component;

/**
 * A historical participation record never authorizes the current workflow or its new attachments.
 */
@Component
public class WorkHistory {
  final Db db;
  static final String OWN_OUTCOME =
      "(EXISTS(SELECT 1 FROM audit_event h WHERE h.complaint_id=c.id AND h.actor_id=? AND h.action IN ('DECLINE','RETURN_ASSIGNMENT','REQUEST_TRANSFER','APPROVE','DENY')) OR EXISTS(SELECT 1 FROM work_order hw WHERE hw.complaint_id=c.id AND (hw.handed_off OR hw.status IN ('DECLINED','CANCELLED')) AND (hw.assignee_id=? OR EXISTS(SELECT 1 FROM work_member hm WHERE hm.work_order_id=hw.id AND hm.user_id=?))))";

  WorkHistory(Db db) {
    this.db = db;
  }

  boolean hasOutcome(UUID id, Map<String, Object> user) {
    return !db.list(
            "SELECT c.id FROM complaint c WHERE c.id=? AND c.municipality_id=? AND " + OWN_OUTCOME,
            id,
            user.get("municipality_id"),
            user.get("id"),
            user.get("id"),
            user.get("id"))
        .isEmpty();
  }

  Map<String, Object> detail(UUID id, Map<String, Object> user) {
    if (!hasOutcome(id, user)) Access.deny();
    var result = new LinkedHashMap<String, Object>();
    result.put(
        "complaint",
        db.one(
            "SELECT id,title,description,address,status,created_at,updated_at,due_at,version FROM complaint WHERE id=? AND municipality_id=?",
            id,
            user.get("municipality_id")));
    result.put("readOnlyHistory", true);
    result.put("limitedHistory", true);
    result.put(
        "history",
        db.list(
            "SELECT e.action,e.from_status,e.to_status,e.reason,e.created_at,COALESCE(e.details->>'actorName',u.display_name) actor_name FROM audit_event e JOIN app_user u ON u.id=e.actor_id WHERE e.complaint_id=? AND e.actor_id=? ORDER BY e.created_at",
            id,
            user.get("id")));
    result.put(
        "workOrders",
        db.list(
            "SELECT w.id,w.status,w.reason,w.created_at FROM work_order w WHERE w.complaint_id=? AND w.status IN ('DECLINED','CANCELLED','COMPLETE') AND (w.assignee_id=? OR EXISTS(SELECT 1 FROM work_member m WHERE m.work_order_id=w.id AND m.user_id=?)) ORDER BY w.created_at",
            id,
            user.get("id"),
            user.get("id")));
    for (String field :
        List.of("actions", "files", "resources", "reports", "reviews", "approvals", "media"))
      result.put(field, List.of());
    return result;
  }
}
