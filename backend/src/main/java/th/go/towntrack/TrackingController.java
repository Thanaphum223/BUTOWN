package th.go.towntrack;

import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/citizen/tracking")
public class TrackingController {
  final Db db;
  final Access access;

  TrackingController(Db db, Access access) {
    this.db = db;
    this.access = access;
  }

  @GetMapping
  public Object list(
      Authentication a,
      @RequestParam(defaultValue = "mine") String tab,
      @RequestParam(defaultValue = "0") int page) {
    var u = access.user(a);
    access.role(u, "CITIZEN");
    if (!java.util.List.of("mine", "following").contains(tab) || page < 0 || page > 1000000)
      throw new IllegalArgumentException();
    String scope =
        tab.equals("mine")
            ? "c.reporter_id=?"
            : "EXISTS(SELECT 1 FROM follower f WHERE f.complaint_id=c.id AND f.user_id=?)";
    String base =
        " FROM complaint c JOIN category k ON k.id=c.category_id WHERE c.municipality_id=? AND "
            + scope;
    return Map.of(
        "total",
        db.one("SELECT count(*) total" + base, u.get("municipality_id"), u.get("id")).get("total"),
        "items",
        db.list(
            "SELECT c.id,k.name category_name,c.status,c.created_at,c.updated_at"
                + base
                + " ORDER BY c.updated_at DESC,c.id LIMIT 5 OFFSET ?",
            u.get("municipality_id"),
            u.get("id"),
            (long) page * 5));
  }
}
