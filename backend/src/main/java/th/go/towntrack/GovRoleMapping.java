package th.go.towntrack;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/admin/gov-roles")
public class GovRoleMapping {
  static final Set<String> ROLES =
      Set.of("CITIZEN", "OFFICER", "LEADER", "FIELD", "APPROVER", "ADMIN");
  final Db db;
  final AdminController admin;
  final GovCenterSsoClient provider;
  final Workflow workflow;

  record Mapping(String govRole, String role, UUID departmentId) {}

  record Settings(String municipalityId, String serviceId, List<Mapping> mappings) {}

  record Initial(String role, UUID department) {}

  public GovRoleMapping(
      Db db, AdminController admin, GovCenterSsoClient provider, Workflow workflow) {
    this.db = db;
    this.admin = admin;
    this.provider = provider;
    this.workflow = workflow;
  }

  Settings settings(UUID town) {
    var rows =
        db.list(
            "SELECT gov_municipality_id,gov_service_id FROM gov_role_settings WHERE municipality_id=? FOR SHARE",
            town);
    if (rows.isEmpty()) {
      var defaults = new ArrayList<Mapping>();
      for (String role : List.of("CITIZEN", "OFFICER", "LEADER", "FIELD", "APPROVER", "ADMIN"))
        defaults.add(new Mapping(role, role, null));
      defaults.add(new Mapping("USER", "CITIZEN", null));
      defaults.add(new Mapping("MEMBER", "CITIZEN", null));
      for (String code :
          List.of(
              "MAYOR",
              "DEPUTY_MAYOR",
              "MUNICIPAL_CLERK",
              "DEPUTY_CLERK",
              "FINANCE_DIRECTOR",
              "SUPPLY_HEAD")) defaults.add(new Mapping(code, "APPROVER", null));
      for (String code : List.of("CENTRAL_OFFICER", "SARABAN_OFFICER"))
        defaults.add(new Mapping(code, "OFFICER", null));
      defaults.add(new Mapping("IT_ADMIN", "ADMIN", null));
      return new Settings("", "", defaults);
    }
    var row = rows.getFirst();
    var mappings =
        db
            .list(
                "SELECT gov_role,local_role,department_id FROM gov_role_mapping WHERE municipality_id=? ORDER BY gov_role",
                town)
            .stream()
            .map(
                m ->
                    new Mapping(
                        (String) m.get("gov_role"),
                        (String) m.get("local_role"),
                        (UUID) m.get("department_id")))
            .toList();
    return new Settings(
        (String) row.get("gov_municipality_id"), (String) row.get("gov_service_id"), mappings);
  }

  @GetMapping
  @Transactional
  public Settings get(Authentication a) {
    return settings((UUID) admin.admin(a).get("municipality_id"));
  }

  @PostMapping
  @Transactional
  public void save(@RequestBody Settings body, Authentication a) {
    var actor = admin.lockedAdmin(a);
    UUID town = (UUID) actor.get("municipality_id");
    String municipality = identifier(body.municipalityId()), service = identifier(body.serviceId());
    if (body.mappings() == null || body.mappings().size() > 100)
      throw new IllegalArgumentException("ตั้งค่าบทบาทได้ไม่เกิน 100 รายการ");
    var seen = new HashSet<String>();
    var clean = new ArrayList<Mapping>();
    for (var rule : body.mappings()) {
      if (rule == null) throw new IllegalArgumentException();
      String code = roleCode(rule.govRole());
      if (!seen.add(code) || rule.role() == null || !ROLES.contains(rule.role()))
        throw new IllegalArgumentException("รหัสบทบาทซ้ำหรือบทบาทในระบบไม่ถูกต้อง");
      UUID department = Access.departmentRole(rule.role()) ? rule.departmentId() : null;
      if (department != null)
        db.one(
            "SELECT id FROM department WHERE id=? AND municipality_id=? AND deleted_at IS NULL FOR SHARE",
            department,
            town);
      clean.add(new Mapping(code, rule.role(), department));
    }
    db.run(
        "INSERT INTO gov_role_settings(municipality_id,gov_municipality_id,gov_service_id) VALUES(?,?,?) ON CONFLICT(municipality_id) DO UPDATE SET gov_municipality_id=excluded.gov_municipality_id,gov_service_id=excluded.gov_service_id",
        town,
        municipality,
        service);
    db.run("DELETE FROM gov_role_mapping WHERE municipality_id=?", town);
    for (var rule : clean)
      db.run(
          "INSERT INTO gov_role_mapping(municipality_id,gov_role,local_role,department_id) VALUES(?,?,?,?)",
          town,
          rule.govRole(),
          rule.role(),
          rule.departmentId());
    workflow.audit(
        actor,
        null,
        "GOV_ROLE_SETTINGS",
        null,
        null,
        "ตั้งค่าบทบาทเริ่มต้นจาก Gov Center " + clean.size() + " รายการ");
  }

  static String identifier(String value) {
    if (value == null) throw new IllegalArgumentException();
    value = value.trim();
    if (!value.isEmpty() && !value.matches("[a-zA-Z0-9_.-]{1,200}"))
      throw new IllegalArgumentException("รหัส Gov Center ไม่ถูกต้อง");
    return value;
  }

  static String roleCode(String value) {
    if (value == null || !value.trim().matches("[\\p{L}\\p{N}_ .-]{1,100}"))
      throw new IllegalArgumentException("รหัสบทบาท Gov Center ไม่ถูกต้อง");
    return value.trim().toUpperCase(Locale.ROOT);
  }

  static String unique(String... values) {
    var found = new HashSet<String>();
    for (String value : values) if (value != null && !value.isBlank()) found.add(value);
    if (found.size() > 1) throw GovIdentityService.bad();
    return found.isEmpty() ? null : found.iterator().next();
  }

  static String text(JsonNode value, String field) {
    return GovIdentityService.text(value, field, 200, false);
  }

  boolean thisService(JsonNode access, Settings config) {
    String code =
        unique(
            text(access, "serviceCode"),
            text(access.path("eService"), "code"),
            text(access.path("service"), "code"));
    String id =
        unique(
            text(access, "eServiceId"),
            text(access, "serviceId"),
            text(access.path("eService"), "id"),
            text(access.path("service"), "id"));
    if (code != null && !code.equals(provider.serviceCode)) return false;
    if (id != null && !config.serviceId().isEmpty() && !id.equals(config.serviceId())) return false;
    return code != null
        || id != null && !config.serviceId().isEmpty() && id.equals(config.serviceId());
  }

  record Codes(Set<String> codes, boolean missingMunicipality) {}

  /** The single Gov role code granted to TownTrack, or null when absent or ambiguous. */
  String rank(UUID town, JsonNode user) {
    try {
      var codes = codes(user, settings(town)).codes();
      return codes.size() == 1 ? codes.iterator().next() : null;
    } catch (RuntimeException e) {
      return null;
    }
  }

  /** Codes that name a TownTrack role rather than an official position. */
  static boolean generic(String code) {
    return code == null || ROLES.contains(code) || Set.of("USER", "MEMBER").contains(code);
  }

  Codes codes(JsonNode user, Settings config) {
    var members = user.path("memberships");
    if (members.isMissingNode() || members.isNull()) return new Codes(Set.of(), false);
    if (!members.isArray() || members.size() > 100) throw GovIdentityService.bad();
    var codes = new HashSet<String>();
    boolean missingMunicipality = false;
    for (var membership : members) {
      if (!membership.path("isActive").isBoolean() || !membership.path("isActive").booleanValue())
        continue;
      String municipality =
          unique(text(membership, "municipalityId"), text(membership.path("municipality"), "id"));
      if (municipality != null
          && !config.municipalityId().isEmpty()
          && !config.municipalityId().equals(municipality)) continue;
      var accesses = membership.path("serviceAccess");
      if (accesses.isMissingNode() || accesses.isNull()) continue;
      if (!accesses.isArray() || accesses.size() > 100) throw GovIdentityService.bad();
      for (var access : accesses) {
        if (access.has("isActive")
            && (!access.path("isActive").isBoolean() || !access.path("isActive").booleanValue()))
          continue;
        if (!thisService(access, config)) continue;
        missingMunicipality |= municipality == null;
        var role = access.path("role");
        String code =
            unique(text(access, "roleCode"), role.isTextual() ? role.asText() : text(role, "code"));
        if (code == null) throw setup("Gov Center ไม่ได้ส่งรหัสบทบาทของบริการ TownTrack");
        try {
          codes.add(roleCode(code));
        } catch (IllegalArgumentException e) {
          throw GovIdentityService.bad();
        }
      }
    }
    return new Codes(codes, missingMunicipality);
  }

  Initial initial(UUID town, JsonNode user) {
    var config = settings(town);
    var found = codes(user, config);
    var codes = found.codes();
    boolean missingMunicipality = found.missingMunicipality();
    if (codes.isEmpty()) return new Initial("CITIZEN", null);
    if (codes.size() > 1)
      throw setup("พบบทบาท Gov Center หลายบทบาทที่ขัดกัน กรุณาให้ผู้ดูแลตรวจการจับคู่บทบาท");
    String code = codes.iterator().next();
    var mapping =
        config.mappings().stream()
            .filter(m -> m.govRole().equals(code))
            .findFirst()
            .orElseThrow(
                () ->
                    setup(
                        "ยังไม่ได้จับคู่บทบาท Gov Center: "
                            + code
                            + " กรุณาติดต่อผู้ดูแล TownTrack"));
    if (!mapping.role().equals("CITIZEN") && missingMunicipality)
      throw setup(
          "ข้อมูลบทบาทจาก Gov Center ไม่มีรหัสเทศบาล กรุณาให้ผู้ดูแลตรวจข้อมูลสิทธิ์ใน Gov Center");
    if (!mapping.role().equals("CITIZEN") && config.municipalityId().isEmpty())
      throw setup(
          "กรุณาให้ผู้ดูแลระบุรหัสเทศบาล Gov Center ในหน้าจับคู่บทบาทก่อนให้บุคลากรเข้าสู่ระบบ");
    if (Access.departmentRole(mapping.role()) && mapping.departmentId() == null)
      throw setup("กรุณาให้ผู้ดูแลเลือกกองสำหรับบทบาท Gov Center: " + code);
    if (mapping.departmentId() != null)
      db.one(
          "SELECT id FROM department WHERE id=? AND municipality_id=? AND deleted_at IS NULL FOR SHARE",
          mapping.departmentId(),
          town);
    return new Initial(mapping.role(), mapping.departmentId());
  }

  static ResponseStatusException setup(String message) {
    return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, message);
  }
}
