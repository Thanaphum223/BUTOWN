package th.go.towntrack;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GovIdentityService {
  final Db db;
  final PasswordEncoder passwords;

  public GovIdentityService(Db db, PasswordEncoder passwords) {
    this.db = db;
    this.passwords = passwords;
  }

  static String text(JsonNode n, String key, int max, boolean required) {
    var value = n.path(key);
    if (value.isMissingNode() || value.isNull()) {
      if (required) throw bad();
      return null;
    }
    if (!value.isTextual()
        || value.asText().length() > max
        || (required && value.asText().isBlank())) throw bad();
    return value.asText();
  }

  static ResponseStatusException bad() {
    return new ResponseStatusException(
        HttpStatus.BAD_GATEWAY, "ข้อมูลผู้ใช้หรือข้อมูลบ้านจาก Gov Center ไม่ถูกต้อง");
  }

  record Residence(
      String id,
      String membership,
      String role,
      String memberStatus,
      String status,
      String address,
      String snapshot,
      Instant verified) {}

  List<Residence> residences(JsonNode root) {
    var list = root.path("residences");
    if (list.isMissingNode()) return List.of();
    if (!list.isArray() || list.size() > 100) throw bad();
    var result = new ArrayList<Residence>();
    var seen = new HashSet<String>();
    for (var item : list) {
      var snapshot = item.path("addressSnapshot");
      if (!snapshot.isObject()) throw bad();
      String id = text(snapshot, "residenceId", 200, true);
      if (!seen.add(id)) throw bad();
      String residenceStatus = text(item.path("residence"), "status", 50, false);
      if (residenceStatus == null) residenceStatus = text(snapshot, "residenceStatus", 50, false);
      if (residenceStatus == null) residenceStatus = text(snapshot, "status", 50, false);
      if (residenceStatus == null) residenceStatus = "UNKNOWN";
      Instant verified = null;
      String at = text(item, "verifiedAt", 100, false);
      if (at != null)
        try {
          verified = Instant.parse(at);
        } catch (Exception e) {
          throw bad();
        }
      var clean = new LinkedHashMap<String, Object>();
      for (String key :
          List.of(
              "residenceId",
              "residenceCode",
              "formattedAddress",
              "houseNo",
              "moo",
              "soi",
              "road",
              "postalCode",
              "villageName",
              "buildingName",
              "floor",
              "roomNo",
              "provinceId",
              "provinceNameTh",
              "districtId",
              "districtNameTh",
              "subdistrictId",
              "subdistrictNameTh",
              "municipalityId",
              "municipalityName",
              "latitude",
              "longitude",
              "locationAccuracy",
              "residenceStatus",
              "status")) if (snapshot.has(key)) clean.put(key, snapshot.get(key));
      try {
        result.add(
            new Residence(
                id,
                text(item, "membershipId", 200, true),
                text(item, "role", 50, false),
                text(item, "status", 50, true),
                residenceStatus,
                text(snapshot, "formattedAddress", 4000, false),
                new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(clean),
                verified));
      } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
        throw bad();
      }
    }
    return result;
  }

  @Transactional
  public Map<String, Object> sync(UUID town, JsonNode data, UUID linkUser) {
    var user = data.path("user");
    String iamId = text(user, "id", 200, true),
        name = text(user, "name", 200, false),
        email = text(user, "email", 320, false);
    var homes = residences(data);
    db.one("SELECT id FROM municipality WHERE id=?", town);
    db.one("SELECT pg_advisory_xact_lock(hashtextextended(?,0)) locked", town + ":" + iamId);
    var bindings =
        db.list(
            "SELECT local_user_id FROM iam_user_profile WHERE municipality_id=? AND iam_user_id=?",
            town,
            iamId);
    UUID local = bindings.isEmpty() ? null : (UUID) bindings.getFirst().get("local_user_id");
    if (linkUser != null) {
      db.one(
          "SELECT id FROM app_user WHERE id=? AND municipality_id=? AND enabled=true FOR UPDATE",
          linkUser,
          town);
      if (local != null && !local.equals(linkUser))
        throw new ResponseStatusException(
            HttpStatus.CONFLICT, "บัญชี Gov Center นี้เชื่อมกับบัญชีอื่นแล้ว");
      if (!db.list(
              "SELECT iam_user_id FROM iam_user_profile WHERE local_user_id=? AND iam_user_id<>?",
              linkUser,
              iamId)
          .isEmpty())
        throw new ResponseStatusException(
            HttpStatus.CONFLICT, "บัญชีนี้เชื่อมกับ Gov Center อื่นแล้ว");
      local = linkUser;
    }
    if (local == null) {
      local = UUID.randomUUID();
      db.run(
          "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role) VALUES(?,?,?,?,?,'CITIZEN')",
          local,
          town,
          "iam_" + local.toString().replace("-", ""),
          passwords.encode((UUID.randomUUID().toString() + UUID.randomUUID()).replace("-", "")),
          name == null || name.isBlank() ? "ผู้ใช้ Gov Center" : name);
    }
    var rows =
        db.list(
            "SELECT id,username,display_name,role,department_id FROM app_user WHERE id=? AND municipality_id=? AND enabled=true",
            local,
            town);
    if (rows.isEmpty())
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "บัญชี TownTrack ถูกระงับการใช้งาน");
    db.run(
        "INSERT INTO iam_user_profile(municipality_id,iam_user_id,local_user_id,email,display_name) VALUES(?,?,?,?,?) ON CONFLICT(municipality_id,iam_user_id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,last_sso_at=now()",
        town,
        iamId,
        local,
        email,
        name);
    db.run("DELETE FROM iam_user_residence WHERE municipality_id=? AND iam_user_id=?", town, iamId);
    for (var r : homes) {
      db.run(
          "INSERT INTO iam_residence_snapshot(municipality_id,iam_residence_id,residence_status,formatted_address,address_snapshot) VALUES(?,?,?,?,?::jsonb) ON CONFLICT(municipality_id,iam_residence_id) DO UPDATE SET residence_status=excluded.residence_status,formatted_address=excluded.formatted_address,address_snapshot=excluded.address_snapshot,synced_at=now()",
          town,
          r.id(),
          r.status(),
          r.address(),
          r.snapshot());
      db.run(
          "INSERT INTO iam_user_residence(municipality_id,iam_user_id,iam_residence_id,iam_membership_id,member_role,member_status,residence_status,verified_at) VALUES(?,?,?,?,?,?,?,?)",
          town,
          iamId,
          r.id(),
          r.membership(),
          r.role(),
          r.memberStatus(),
          r.status(),
          r.verified() == null ? null : java.sql.Timestamp.from(r.verified()));
    }
    db.run(
        "INSERT INTO audit_event(id,municipality_id,actor_id,action,reason) VALUES(?,?,?,?,'ยืนยันตัวตนกับ Gov Center สำเร็จ')",
        UUID.randomUUID(),
        town,
        local,
        linkUser == null ? "IAM_LOGIN" : "IAM_LINK");
    return rows.getFirst();
  }
}
