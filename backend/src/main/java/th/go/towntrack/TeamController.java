package th.go.towntrack;

import java.util.*;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/teams")
public class TeamController {
  final Db db;
  final Access access;

  public TeamController(Db d, Access a) {
    db = d;
    access = a;
  }

  @GetMapping
  public Object list(Authentication a) {
    var u = access.user(a);
    access.role(u, "LEADER");
    return db.list(
        "SELECT t.*,u.display_name representative_name,(SELECT count(*) FROM work_order w WHERE w.team_id=t.id AND w.status NOT IN ('DECLINED','CANCELLED','COMPLETE')) active_work_count,(SELECT"
            + " json_agg(json_build_object('id',m.user_id,'name',p.display_name)) FROM team_member"
            + " m JOIN app_user p ON p.id=m.user_id WHERE m.team_id=t.id)::text members FROM"
            + " field_team t JOIN app_user u ON u.id=t.representative_id WHERE t.municipality_id=?"
            + " AND t.leader_id=? AND t.active=true ORDER BY t.name",
        u.get("municipality_id"),
        u.get("id"));
  }

  @PostMapping
  @Transactional
  public Object create(@RequestBody Map<String, Object> b, Authentication a) {
    var u = access.user(a);
    access.role(u, "LEADER");
    String name = Workflow.text(b, "name", 200);
    if (!(b.get("memberIds") instanceof List<?> members)
        || members.isEmpty()
        || members.size() > 50) throw new IllegalArgumentException();
    UUID representative = Db.id(b.get("representativeId"));
    Set<UUID> ids = new HashSet<>();
    for (Object id : members)
      ids.add((UUID) access.target(id, u, "FIELD", u.get("department_id")).get("id"));
    if (!ids.contains(representative)) throw new IllegalArgumentException();
    UUID id = UUID.randomUUID();
    db.run(
        "INSERT INTO field_team(id,municipality_id,department_id,leader_id,representative_id,name)"
            + " VALUES(?,?,?,?,?,?)",
        id,
        u.get("municipality_id"),
        u.get("department_id"),
        u.get("id"),
        representative,
        name);
    for (UUID member : ids) db.run("INSERT INTO team_member VALUES(?,?)", id, member);
    return Map.of("id", id);
  }

  @PostMapping("/{id}/retire")
  public void retire(@PathVariable UUID id, Authentication a) {
    var u = access.user(a);
    access.role(u, "LEADER");
    db.one(
        "SELECT id FROM field_team WHERE id=? AND leader_id=? AND municipality_id=?",
        id,
        u.get("id"),
        u.get("municipality_id"));
    db.run("UPDATE field_team SET active=false WHERE id=?", id);
  }
}
