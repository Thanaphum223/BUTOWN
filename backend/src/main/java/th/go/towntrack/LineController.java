package th.go.towntrack;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.*;
import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class LineController {
  final org.springframework.security.core.session.SessionRegistry sessions;
  final Db db;
  final ObjectMapper json;
  final UserDetailsService users;
  final PasswordEncoder encoder;
  final String channel, liff;
  final UUID town;
  final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

  public LineController(
      org.springframework.security.core.session.SessionRegistry sessions,
      Db d,
      ObjectMapper j,
      UserDetailsService u,
      PasswordEncoder e,
      @Value("${LINE_LOGIN_CHANNEL_ID:}") String channel,
      @Value("${LINE_LIFF_ID:}") String liff,
      @Value("${LINE_MUNICIPALITY_ID:}") String town) {
    this.sessions = sessions;
    db = d;
    json = j;
    users = u;
    encoder = e;
    this.channel = channel;
    this.liff = liff;
    this.town = town.isBlank() ? null : UUID.fromString(town);
  }

  @GetMapping("/api/public/line")
  public Object config() {
    return Map.of("enabled", !channel.isBlank() && !liff.isBlank() && town != null, "liffId", liff);
  }

  @PostMapping({"/api/auth/line","/api/auth/liff-verify"})
  @Transactional
  public Object login(
      @RequestBody Map<String, Object> b, HttpServletRequest request, HttpServletResponse response)
      throws Exception {
    if (channel.isBlank() || liff.isBlank() || town == null)
      throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "ยังไม่ได้ตั้งค่า LINE");
    String token = Workflow.text(b, "idToken", 10000);
    var http =
        HttpRequest.newBuilder(URI.create("https://api.line.me/oauth2/v2.1/verify"))
            .timeout(Duration.ofSeconds(10))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .POST(
                HttpRequest.BodyPublishers.ofString(
                    "id_token="
                        + URLEncoder.encode(token, java.nio.charset.StandardCharsets.UTF_8)
                        + "&client_id="
                        + URLEncoder.encode(channel, java.nio.charset.StandardCharsets.UTF_8)))
            .build();
    var result = client.send(http, HttpResponse.BodyHandlers.ofString());
    if (result.statusCode() != 200)
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "ไม่สามารถยืนยันบัญชี LINE ได้");
    var profile = json.readTree(result.body());
    String subject = profile.path("sub").asText();
    if (!subject.matches("U[0-9a-fA-F]{32}")
        || !profile.path("aud").asText().equals(channel)
        || profile.path("exp").asLong() <= java.time.Instant.now().getEpochSecond())
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "LINE Token ไม่ถูกต้อง");
    db.one("SELECT id FROM municipality WHERE id=? FOR UPDATE", town);
    String external = "line:" + subject;
    var existing =
        db.list(
            "SELECT username,role,enabled FROM app_user WHERE municipality_id=? AND external_id=?",
            town,
            external);
    String name;
    if (existing.isEmpty()) {
      name = "line-" + UUID.randomUUID();
      String display = profile.path("name").asText("ประชาชน LINE");
      if (display.length() > 200) display = display.substring(0, 200);
      db.run(
          "INSERT INTO"
              + " app_user(id,municipality_id,username,password_hash,display_name,role,external_id)"
              + " VALUES(?,?,?,?,?,'CITIZEN',?)",
          UUID.randomUUID(),
          town,
          name,
          encoder.encode(UUID.randomUUID().toString() + UUID.randomUUID()),
          display,
          external);
    } else {
      name = (String) existing.getFirst().get("username");
      if (!existing.getFirst().get("role").equals("CITIZEN")
          || !Boolean.TRUE.equals(existing.getFirst().get("enabled")))
        throw new ResponseStatusException(HttpStatus.FORBIDDEN);
    }
    var user = users.loadUserByUsername(name);
    request.getSession();
    sessions.removeSessionInformation(request.getSession().getId());
    request.changeSessionId();
    request.getSession().removeAttribute("gov_verified_until");
    request.getSession().removeAttribute("gov_verified_username");
    request.getSession().removeAttribute(CentralGovAuthController.PENDING);
    var context = SecurityContextHolder.createEmptyContext();
    context.setAuthentication(
        UsernamePasswordAuthenticationToken.authenticated(user, null, user.getAuthorities()));
    SecurityContextHolder.setContext(context);
    sessions.registerNewSession(request.getSession().getId(), user);
    new HttpSessionSecurityContextRepository().saveContext(context, request, response);
    new org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository()
        .saveToken(null, request, response);
    return Map.of("ok", true);
  }
}
