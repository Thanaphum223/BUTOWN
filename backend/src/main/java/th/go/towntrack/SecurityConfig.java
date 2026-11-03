package th.go.towntrack;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
public class SecurityConfig {
  @Bean java.time.Clock govSsoClock(){return java.time.Clock.systemUTC();}
  @Bean
  org.springframework.security.core.session.SessionRegistry sessionRegistry() {
    return new org.springframework.security.core.session.SessionRegistryImpl();
  }

  @Bean
  org.springframework.security.web.session.HttpSessionEventPublisher sessionEvents() {
    return new org.springframework.security.web.session.HttpSessionEventPublisher();
  }

  @Bean
  PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder(12);
  }

  @Bean
  UserDetailsService users(Db db) {
    return name -> {
      var rows = db.list("SELECT * FROM app_user WHERE username=? AND enabled=true", name);
      if (rows.isEmpty()) throw new UsernameNotFoundException("Invalid credentials");
      var u = rows.getFirst();
      return User.withUsername(name)
          .password((String) u.get("password_hash"))
          .roles((String) u.get("role"))
          .build();
    };
  }

  @Bean
  SecurityFilterChain security(
      HttpSecurity h, org.springframework.security.core.session.SessionRegistry sessions,
      @org.springframework.beans.factory.annotation.Value("${GOV_AUTH_MODE:local}") String govMode)
      throws Exception {
    h.authorizeHttpRequests(
            a ->
                a.requestMatchers(
                        "/api/auth/csrf",
                        "/api/auth/login",
                        "/api/auth/register",
                        "/api/public/municipalities",
                        "/api/public/line",
                        "/api/public/map-config",
                        "/api/emergency/nearby",
                        "/api/auth/line",
                        "/api/auth/gov",
                        "/api/auth/gov/start",
                        "/api/auth/sso-callback",
                        "/api/public/gov-auth",
                        "/actuator/health")
                    .permitAll()
                    .anyRequest()
                    .authenticated())
        .formLogin(
            f ->
                f.loginProcessingUrl("/api/auth/login")
                    .successHandler(
                        (q, s, a) -> {
                          var session=q.getSession(false);
                          if(session!=null){session.removeAttribute("gov_verified_until");session.removeAttribute("gov_verified_username");session.removeAttribute(CentralGovAuthController.PENDING);session.removeAttribute(CentralGovAuthController.EXCHANGING);session.removeAttribute("admin_role");session.removeAttribute("admin_department");}
                          s.setCharacterEncoding("UTF-8");
                          s.setContentType("application/json");
                          s.getWriter().write("{\"ok\":true}");
                        })
                    .failureHandler(
                        (q, s, e) -> {
                          s.setStatus(401);
                          s.setContentType("application/json");
                          s.getWriter().write("{\"message\":\"ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง\"}");
                        }))
        .logout(
            l ->
                l.logoutUrl("/api/auth/logout").logoutSuccessHandler((q, s, a) -> s.setStatus(204)))
        .sessionManagement(
            sm ->
                sm.maximumSessions(5)
                    .sessionRegistry(sessions)
                    .expiredSessionStrategy(event -> event.getResponse().sendError(401)))
        .requestCache(c -> c.disable())
        .exceptionHandling(
            e ->
                e.authenticationEntryPoint((q, s, x) -> s.sendError(401))
                    .accessDeniedHandler((q, s, x) -> s.sendError(403)))
        .headers(
            x ->
                x.contentSecurityPolicy(
                    c -> c.policyDirectives("default-src 'none'; frame-ancestors 'none'")))
        .addFilterBefore(new SerializedLogout(), org.springframework.security.web.authentication.logout.LogoutFilter.class)
        .addFilterBefore(new LoginLimit(), UsernamePasswordAuthenticationFilter.class)
        .addFilterAfter(new GovSessionGuard(govMode), org.springframework.security.web.context.SecurityContextHolderFilter.class);
    return h.build();
  }

  // Logout must not invalidate between an external login's final check and context save.
  static class SerializedLogout extends OncePerRequestFilter {
    @Override protected void doFilterInternal(HttpServletRequest q,HttpServletResponse s,FilterChain chain)throws ServletException,IOException {
      var session=q.getSession(false);
      if(session!=null&&q.getMethod().equals("POST")&&q.getRequestURI().equals("/api/auth/logout")){
        synchronized(org.springframework.web.util.WebUtils.getSessionMutex(session)){chain.doFilter(q,s);}
      }else chain.doFilter(q,s);
    }
  }

  static class GovSessionGuard extends OncePerRequestFilter {
    final String mode; GovSessionGuard(String mode){this.mode=mode;}
    protected void doFilterInternal(HttpServletRequest q,HttpServletResponse s,FilterChain chain)throws ServletException,IOException {
      var auth=org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
      if(!Set.of("/api/auth/csrf","/api/auth/gov/start","/api/auth/sso-callback","/api/auth/gov","/api/auth/logout","/api/public/gov-auth").contains(q.getRequestURI())&&mode.equals("central")&&auth!=null&&auth.isAuthenticated()&&auth.getAuthorities().stream().anyMatch(r->r.getAuthority().matches("ROLE_(ADMIN|OFFICER|LEADER|FIELD|APPROVER)"))) {
        var session=q.getSession(false);Object expires=session==null?null:session.getAttribute("gov_verified_until");
        if(!(expires instanceof Long time)||time<=java.time.Instant.now().getEpochSecond()||!auth.getName().equals(session.getAttribute("gov_verified_username"))) {
          org.springframework.security.core.context.SecurityContextHolder.clearContext();if(session!=null)session.invalidate();
          s.sendError(503,"Central Gov-Auth verification required");return;
        }
      }
      chain.doFilter(q,s);
    }
  }

  static class LoginLimit extends OncePerRequestFilter {
    record Window(long start, int count) {}

    private final Map<String, Window> attempts = new ConcurrentHashMap<>();

    protected void doFilterInternal(HttpServletRequest q, HttpServletResponse s, FilterChain c)
        throws ServletException, IOException {
      if (q.getMethod().equals("POST")
          && (q.getRequestURI().equals("/api/auth/login")
              || q.getRequestURI().equals("/api/auth/register")
              || q.getRequestURI().equals("/api/auth/line")
              || q.getRequestURI().equals("/api/auth/gov/start")
              || q.getRequestURI().equals("/api/auth/sso-callback")
              || q.getRequestURI().equals("/api/auth/gov"))) {
        long now = System.currentTimeMillis();
        if (attempts.size() > 10000)
          attempts.entrySet().removeIf(e -> now - e.getValue().start() > 60000);
        Window w =
            attempts.compute(
                q.getRemoteAddr(),
                (k, v) ->
                    v == null || now - v.start() > 60000
                        ? new Window(now, 1)
                        : new Window(v.start(), v.count() + 1));
        if (w.count() > 20) {
          s.setStatus(429);
          return;
        }
      }
      c.doFilter(q, s);
    }
  }
}
