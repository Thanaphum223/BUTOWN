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
    return db.one(
        "SELECT id,municipality_id,department_id,username,display_name,role FROM app_user WHERE"
            + " username=? AND enabled=true",
        a.getName());
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
          case "OFFICER" ->
              c.get("department_id") == null
                  || Objects.equals(u.get("department_id"), c.get("department_id"));
          case "LEADER" -> u.get("id").equals(c.get("leader_id"));
          case "FIELD" ->
              !db.list(
                      "SELECT id FROM work_order WHERE complaint_id=? AND (assignee_id=? OR"
                          + " EXISTS(SELECT 1 FROM work_member wm WHERE"
                          + " wm.work_order_id=work_order.id AND wm.user_id=?)) AND status NOT IN"
                          + " ('DECLINED','CANCELLED')",
                      id,
                      u.get("id"),
                      u.get("id"))
                  .isEmpty();
          case "APPROVER" ->
              !db.list(
                      "SELECT id FROM resource_request WHERE complaint_id=? AND approver_id=?",
                      id,
                      u.get("id"))
                  .isEmpty();
          default -> false;
        };
    if (!ok) deny();
    return c;
  }

  public Map<String, Object> target(Object id, Map<String, Object> u, String role, Object dept) {
    var t =
        db.one(
            "SELECT id,department_id FROM app_user WHERE id=? AND municipality_id=? AND role=? AND"
                + " enabled=true",
            Db.id(id),
            u.get("municipality_id"),
            role);
    if (dept != null && !dept.equals(t.get("department_id"))) deny();
    return t;
  }
}
