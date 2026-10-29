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
