package th.go.towntrack;

import java.util.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
public class GovProfileController {
  final Db db;
  final Access access;
  public GovProfileController(Db db, Access access) {
    this.db = db; this.access = access;
  }

  @GetMapping("/api/auth/gov-profile")
  public Object profile(Authentication authentication) {
    var account = access.user(authentication);
    var profiles = db.list("SELECT iam_user_id id,display_name name,email,last_sso_at FROM iam_user_profile WHERE local_user_id=? AND municipality_id=?",
        account.get("id"), account.get("municipality_id"));
    if (profiles.isEmpty()) return Map.of("linked", false, "residences", List.of());
    var profile = profiles.getFirst();
    var residences = new ArrayList<Map<String, Object>>();
    for (var row : db.list("SELECT r.iam_residence_id,r.member_role,r.member_status,r.residence_status,s.formatted_address FROM iam_user_residence r JOIN iam_residence_snapshot s USING(municipality_id,iam_residence_id) WHERE r.municipality_id=? AND r.iam_user_id=? ORDER BY r.iam_residence_id",
        account.get("municipality_id"), profile.get("id"))) {
      var home = new LinkedHashMap<String, Object>();
      home.put("residenceId", row.get("iam_residence_id"));
      home.put("address", row.get("formatted_address"));
      home.put("memberRole", row.get("member_role"));
      home.put("memberStatus", row.get("member_status"));
      home.put("residenceStatus", row.get("residence_status"));
      home.put("canUseForOfficialTransaction", "VERIFIED".equals(row.get("member_status")) && "VERIFIED".equals(row.get("residence_status")));
      residences.add(home);
    }
    return Map.of("linked", true, "profile", profile, "residences", residences);
  }
}
