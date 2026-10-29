package th.go.towntrack;

import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class PasswordController {
  final Db db;
  final Access access;
  final PasswordEncoder encoder;
  final org.springframework.security.core.session.SessionRegistry sessions;

  public PasswordController(
      Db d,
      Access a,
      PasswordEncoder e,
      org.springframework.security.core.session.SessionRegistry sessions) {
    this.sessions = sessions;
    db = d;
    access = a;
    encoder = e;
  }

  @PostMapping("/api/auth/password")
  public void change(
      @RequestBody Map<String, Object> b, Authentication a, HttpServletRequest request) {
    var u = access.user(a);
    String old = Workflow.text(b, "currentPassword", 72),
        next = Workflow.text(b, "newPassword", 72);
    if (next.length() < 12) throw new IllegalArgumentException();
    var row = db.one("SELECT password_hash FROM app_user WHERE id=?", u.get("id"));
    if (!encoder.matches(old, (String) row.get("password_hash")))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "รหัสผ่านเดิมไม่ถูกต้อง");
    db.run("UPDATE app_user SET password_hash=? WHERE id=?", encoder.encode(next), u.get("id"));
    for (Object principal : sessions.getAllPrincipals()) {
      if (principal instanceof org.springframework.security.core.userdetails.UserDetails details
          && details.getUsername().equals(a.getName())) {
        for (var session : sessions.getAllSessions(principal, false)) session.expireNow();
      }
    }
    request.getSession().invalidate();
  }
}
