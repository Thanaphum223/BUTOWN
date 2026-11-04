package th.go.towntrack;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.servlet.function.*;

/** Isolated CI fixtures, compiled only to test-classes and never shipped in the application jar. */
public class BrowserTestServer {
  public static void main(String[] args) {
    SpringApplication.from(TownTrackApplication::main).with(Fixtures.class).run(args);
  }

  @TestConfiguration
  static class Fixtures {
    @Bean
    @Order(0)
    SecurityFilterChain fixtureSessions(HttpSecurity http, SessionRegistry sessions)
        throws Exception {
      return http.securityMatcher("/api/test/session", "/api/test/accounts")
          .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
          .formLogin(
              form ->
                  form.loginProcessingUrl("/api/test/session")
                      .successHandler(
                          (q, s, a) -> {
                            s.setContentType("application/json");
                            s.getWriter().write("{\"ok\":true}");
                          })
                      .failureHandler((q, s, e) -> s.setStatus(401)))
          .sessionManagement(sm -> sm.maximumSessions(5).sessionRegistry(sessions))
          .requestCache(cache -> cache.disable())
          .build();
    }

    @Bean
    RouterFunction<ServerResponse> fixtureAccounts(AuthController accounts) {
      return RouterFunctions.route()
          .POST(
              "/api/test/accounts",
              request ->
                  ServerResponse.ok()
                      .body(accounts.register(request.body(AuthController.Registration.class))))
          .build();
    }
  }
}
