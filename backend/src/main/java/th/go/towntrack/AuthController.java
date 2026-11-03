package th.go.towntrack;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
public class AuthController {
  final Db db;
  final Access access;
  final PasswordEncoder encoder;

  public AuthController(Db d, Access a, PasswordEncoder e) {
    db = d;
    access = a;
    encoder = e;
  }

  @GetMapping("/api/auth/csrf")
  public Map<String, String> csrf(CsrfToken t) {
    return Map.of("token", t.getToken(), "headerName", t.getHeaderName());
  }

  @GetMapping("/api/auth/me")
  public Map<String, Object> me(Authentication a) {
    return access.user(a);
  }

  record AdminRole(@NotNull String role, UUID departmentId) {}

  @PostMapping("/api/auth/admin-role")
  public Object adminRole(
      @Valid @RequestBody AdminRole body,
      Authentication auth,
      jakarta.servlet.http.HttpServletRequest request) {
    var account =
        db.one(
            "SELECT id,role,municipality_id FROM app_user WHERE username=? AND enabled=true",
            auth.getName());
    if (!"ADMIN".equals(account.get("role"))) Access.deny();
    if (!Set.of("ADMIN", "CITIZEN", "OFFICER", "LEADER", "FIELD", "APPROVER").contains(body.role()))
      throw new IllegalArgumentException("บทบาทไม่ถูกต้อง");
    if (!Set.of("ADMIN", "CITIZEN").contains(body.role()) && body.departmentId() == null)
      throw new IllegalArgumentException("กรุณาเลือกหน่วยงาน");
    if (body.departmentId() != null)
      db.one(
          "SELECT id FROM department WHERE id=? AND municipality_id=?",
          body.departmentId(),
          account.get("municipality_id"));
    var session = request.getSession();
    session.setAttribute("admin_role", body.role());
    if (body.departmentId() == null) session.removeAttribute("admin_department");
    else session.setAttribute("admin_department", body.departmentId());
    db.run(
        "INSERT INTO audit_event(id,municipality_id,actor_id,action,reason) VALUES(?,?,?,'ADMIN_ROLE_SWITCH',?)",
        UUID.randomUUID(),
        account.get("municipality_id"),
        account.get("id"),
        "Switch to " + body.role());
    return access.user(auth);
  }

  @GetMapping("/api/public/municipalities")
  public Object municipalities() {
    return db.list("SELECT id,name FROM municipality ORDER BY name");
  }

  record Registration(
      @NotNull UUID municipalityId,
      @Pattern(regexp = "[a-zA-Z0-9._-]{4,60}") @NotNull String username,
      @NotBlank @Size(min = 12, max = 72) String password,
      @NotBlank @Size(max = 200) String displayName) {}

  @PostMapping("/api/auth/register")
  public Map<String, Boolean> register(@Valid @RequestBody Registration r) {
    db.one("SELECT id FROM municipality WHERE id=?", r.municipalityId());
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role)"
            + " VALUES(?,?,?,?,?,'CITIZEN')",
        UUID.randomUUID(),
        r.municipalityId(),
        r.username(),
        encoder.encode(r.password()),
        r.displayName());
    return Map.of("ok", true);
  }
}
