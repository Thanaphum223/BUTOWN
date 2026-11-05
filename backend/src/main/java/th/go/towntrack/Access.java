package th.go.towntrack;

import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class Access {
  private final Db db;

  public Access(Db d) {
    db = d;
  }

  public Map<String, Object> user(Authentication a) {
    if (a == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
    var user =
        db.one(
            "SELECT id,municipality_id,department_id,username,display_name,role FROM app_user WHERE"
                + " username=? AND enabled=true",
            a.getName());
    if ("ADMIN".equals(user.get("role"))) {
      user = new HashMap<>(user);
      user.put("account_role", "ADMIN");
      var attributes =
          org.springframework.web.context.request.RequestContextHolder.getRequestAttributes();
      if (attributes
          instanceof org.springframework.web.context.request.ServletRequestAttributes request) {
        var session = request.getRequest().getSession(false);
        if (session != null && session.getAttribute("admin_role") instanceof String role) {
          user.put("role", role);
          user.put("department_id", session.getAttribute("admin_department"));
        }
      }
    }
    return user;
  }

  public static boolean departmentRole(String role) {
    return Set.of("LEADER", "FIELD").contains(role);
  }

  public static boolean approvalOverview(Map<String, Object> user) {
    return "APPROVER".equals(user.get("role")) && "ADMIN".equals(user.get("account_role"));
  }

  public void role(Map<String, Object> u, String... roles) {
    if (!List.of(roles).contains(u.get("role"))) deny();
  }

  public static void deny() {
    throw new ResponseStatusException(HttpStatus.FORBIDDEN, "ไม่มีสิทธิ์ดำเนินการ");
  }

  public Map<String, Object> complaint(UUID id, Map<String, Object> u, boolean lock) {
    var c =
        db.one(
            "SELECT *,ST_Y(location::geometry) latitude,ST_X(location::geometry) longitude FROM"
                + " complaint WHERE id=? AND municipality_id=?"
                + (lock ? " FOR UPDATE" : ""),
            id,
            u.get("municipality_id"));
    String r = (String) u.get("role");
    boolean ok =
        switch (r) {
          case "ADMIN" -> true;
          case "CITIZEN" -> u.get("id").equals(c.get("reporter_id"));
          case "OFFICER" -> true;
          case "LEADER" -> u.get("id").equals(c.get("leader_id"));
          case "FIELD" ->
              !db.list(
                      "SELECT id FROM work_order WHERE complaint_id=? AND (assignee_id=? OR"
                          + " EXISTS(SELECT 1 FROM work_member wm WHERE"
                          + " wm.work_order_id=work_order.id AND wm.user_id=?)) AND NOT handed_off AND status NOT IN"
                          + " ('DECLINED','CANCELLED')",
                      id,
                      u.get("id"),
                      u.get("id"))
                  .isEmpty();
          case "APPROVER" ->
              !db.list(
                      "SELECT id FROM resource_request WHERE complaint_id=? AND "
                          + (approvalOverview(u)
                              ? "NOT handed_off AND approver_id IS NOT NULL"
                              : "NOT handed_off AND approver_id=?"),
                      approvalOverview(u) ? new Object[] {id} : new Object[] {id, u.get("id")})
                  .isEmpty();
          default -> false;
        };
    if (!ok) deny();
    return c;
  }

  public Map<String, Object> target(Object id, Map<String, Object> u, String role, Object dept) {
    var t =
        db.one(
            "SELECT id,department_id FROM app_user WHERE id=? AND municipality_id=? AND role IN (?,'ADMIN') AND"
                + " enabled=true FOR SHARE",
            Db.id(id),
            u.get("municipality_id"),
            role);
    if (departmentRole(role) && (dept == null || !dept.equals(t.get("department_id")))) deny();
    return t;
  }
}
