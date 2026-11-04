package th.go.towntrack;

import jakarta.servlet.http.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class CentralGovAuthController {
  final GovCenterSsoClient client;
  final GovIdentityService identities;
  final UserDetailsService users;
  final Db db;
  final ExternalLoginSessions sessions;
  final Clock clock;
  static final String PENDING = "gov_sso_pending", EXCHANGING = "gov_sso_exchanging";

  record Pending(String state, Instant expires, UUID linkUser, UUID municipality, String purpose) {
    boolean reuse() {
      return purpose.equals("REUSE");
    }
  }

  record Exchange(Pending pending, HttpSession session, String sessionId, Object mutex) {}

  public CentralGovAuthController(
      GovCenterSsoClient client,
      GovIdentityService identities,
      UserDetailsService users,
      Db db,
      ExternalLoginSessions sessions,
      Clock clock) {
    this.client = client;
    this.identities = identities;
    this.users = users;
    this.db = db;
    this.sessions = sessions;
    this.clock = clock;
  }

  @GetMapping("/api/public/gov-auth")
  Object config() {
    return client.publicConfig();
  }

  @PostMapping("/api/auth/gov/start")
  Object start(
      @RequestBody Map<String, String> body, HttpServletRequest request, Authentication auth) {
    client.requireConfigured();
    String state = body.getOrDefault("state", "");
    String purpose = body.getOrDefault("purpose", "LOGIN");
    if (state == null
        || purpose == null
        || !state.matches("[a-f0-9]{64}")
        || !List.of("LOGIN", "LINK", "REUSE", "REGISTER", "PASSWORD_LOGIN").contains(purpose))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ข้อมูลเริ่มต้น SSO ไม่ถูกต้อง");
    if (List.of("REUSE", "REGISTER", "PASSWORD_LOGIN").contains(purpose) && signedIn(auth))
      throw changedSession();
    UUID link = null;
    UUID municipality;
    if (purpose.equals("LINK")) {
      if (auth == null || !auth.isAuthenticated() || "anonymousUser".equals(auth.getName()))
        throw new ResponseStatusException(
            HttpStatus.UNAUTHORIZED, "กรุณาเข้าสู่ระบบก่อนเชื่อมบัญชี");
      var account =
          db.one(
              "SELECT id,municipality_id FROM app_user WHERE username=? AND enabled=true",
              auth.getName());
      link = (UUID) account.get("id");
      municipality = (UUID) account.get("municipality_id");
    } else municipality = onlyMunicipality(db);
    var session = request.getSession();
    synchronized (org.springframework.web.util.WebUtils.getSessionMutex(session)) {
      session.removeAttribute(EXCHANGING);
      session.setAttribute(
          PENDING,
          new Pending(state, clock.instant().plusSeconds(600), link, municipality, purpose));
    }
    return Map.of("ok", true);
  }

  @PostMapping({"/api/auth/sso-callback", "/api/auth/gov"})
  Object callback(
      @RequestBody Map<String, String> body,
      HttpServletRequest request,
      HttpServletResponse response,
      Authentication auth) {
    var exchange = consume(request, body.get("state"), List.of("LOGIN", "LINK", "REUSE"));
    var pending = exchange.pending();
    if (pending.reuse() && signedIn(auth)) throw changedSession();
    if (pending.linkUser() != null) {
      if (auth == null
          || !auth.isAuthenticated()
          || db.list(
                  "SELECT id FROM app_user WHERE id=? AND username=? AND municipality_id=? AND enabled=true",
                  pending.linkUser(),
                  auth.getName(),
                  pending.municipality())
              .isEmpty())
        throw new ResponseStatusException(
            HttpStatus.UNAUTHORIZED, "บัญชีที่กำลังเชื่อมเปลี่ยนไป กรุณาเริ่มใหม่");
    }
    var verified = client.verify(body.get("code"));
    return complete(exchange, verified, request, response);
  }

  Exchange consume(HttpServletRequest request, String state, List<String> purposes) {
    client.requireConfigured();
    var session = request.getSession(false);
    Pending pending = null;
    String sessionId = session == null ? null : session.getId();
    Object mutex =
        session == null
            ? new Object()
            : org.springframework.web.util.WebUtils.getSessionMutex(session);
    if (session != null)
      synchronized (mutex) {
        if (session.getAttribute(PENDING) instanceof Pending value) pending = value;
        session.removeAttribute(PENDING);
        if (pending != null) session.setAttribute(EXCHANGING, pending);
      }
    if (pending == null
        || !purposes.contains(pending.purpose())
        || !pending.expires().isAfter(clock.instant())
        || state == null
        || !MessageDigest.isEqual(
            pending.state().getBytes(StandardCharsets.UTF_8),
            state.getBytes(StandardCharsets.UTF_8)))
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "การตรวจสอบ SSO ไม่สำเร็จ กรุณาเริ่มเข้าสู่ระบบใหม่");
    return new Exchange(pending, session, sessionId, mutex);
  }

  Object complete(
      Exchange exchange,
      com.fasterxml.jackson.databind.JsonNode verified,
      HttpServletRequest request,
      HttpServletResponse response) {
    var session = exchange.session();
    var pending = exchange.pending();
    // Identity comparison also rejects a newer transaction that reused the same state.
    synchronized (exchange.mutex()) {
      try {
        if (!Objects.equals(exchange.sessionId(), session.getId())
            || pending != session.getAttribute(EXCHANGING)) throw changedSession();
        session.removeAttribute(EXCHANGING);
      } catch (IllegalStateException expired) {
        throw changedSession();
      }
      var account = identities.sync(pending.municipality(), verified, pending.linkUser());
      var principal = users.loadUserByUsername(account.get("username").toString());
      var authentication =
          UsernamePasswordAuthenticationToken.authenticated(
              principal, null, principal.getAuthorities());
      sessions.authenticate(authentication, request, response);
      session.removeAttribute("admin_role");
      session.removeAttribute("admin_department");
      var context = SecurityContextHolder.createEmptyContext();
      context.setAuthentication(authentication);
      SecurityContextHolder.setContext(context);
      session.setAttribute("gov_verified_username", principal.getUsername());
      session.setAttribute(
          "gov_verified_until", clock.instant().plusSeconds(1800).getEpochSecond());
      new HttpSessionSecurityContextRepository().saveContext(context, request, response);
      new org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository()
          .saveToken(null, request, response);
      return Map.of("success", true, "user", account);
    }
  }

  static boolean signedIn(Authentication auth) {
    return auth != null && auth.isAuthenticated() && !"anonymousUser".equals(auth.getName());
  }

  static UUID onlyMunicipality(Db db) {
    var towns = db.list("SELECT id FROM municipality ORDER BY id LIMIT 2");
    if (towns.size() != 1)
      throw new ResponseStatusException(
          HttpStatus.SERVICE_UNAVAILABLE,
          "กรุณาตรวจสอบเทศบาลใน TownTrack ต้องมีเพียงหนึ่งแห่งสำหรับเริ่มเข้าสู่ระบบ Gov Center");
    return (UUID) towns.getFirst().get("id");
  }

  static ResponseStatusException changedSession() {
    return new ResponseStatusException(
        HttpStatus.CONFLICT, "บัญชีหรือ Session เปลี่ยนไป กรุณาเริ่มเข้าสู่ระบบใหม่");
  }
}
