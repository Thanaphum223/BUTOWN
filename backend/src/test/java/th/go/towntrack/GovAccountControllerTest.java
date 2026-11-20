package th.go.towntrack;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.http.*;
import org.springframework.mock.web.*;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.session.SessionRegistryImpl;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

class GovAccountControllerTest {
  static final String STATE = "abcdef0123456789".repeat(4);
  final UUID town = UUID.randomUUID();
  final ObjectMapper json = new ObjectMapper();
  final GovCenterSsoClient sso = mock(GovCenterSsoClient.class);
  final GovAccountClient api = mock(GovAccountClient.class);
  final GovIdentityService identities = mock(GovIdentityService.class);
  final Db db = mock(Db.class);
  final UserDetailsService users =
      name -> User.withUsername(name).password("random-local-hash").roles("CITIZEN").build();
  CentralGovAuthController central;
  MockMvc mvc;
  MockHttpSession session;

  @BeforeEach
  void setup() throws Exception {
    central =
        new CentralGovAuthController(
            sso,
            identities,
            users,
            db,
            new ExternalLoginSessions(new SessionRegistryImpl()),
            Clock.systemUTC());
    mvc =
        MockMvcBuilders.standaloneSetup(central, new GovAccountController(api, central))
            .setControllerAdvice(new Errors())
            .build();
    when(db.list("SELECT id FROM municipality ORDER BY id LIMIT 2"))
        .thenReturn(List.of(Map.of("id", town)));
    when(api.loginCode(anyString(), anyString())).thenReturn("verified-code");
    var verified = json.readTree("{\"user\":{\"id\":\"central-id\",\"name\":\"Verified Name\"}}");
    when(sso.verify("verified-code")).thenReturn(verified);
    when(identities.sync(town, verified, null))
        .thenReturn(
            Map.of("username", "iam-citizen", "role", "CITIZEN", "display_name", "Verified Name"));
    session = new MockHttpSession();
  }

  @AfterEach
  void cleanup() {
    SecurityContextHolder.clearContext();
  }

  void start(String purpose) throws Exception {
    mvc.perform(
            post("/api/auth/gov/start")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("purpose", purpose, "state", STATE))))
        .andExpect(status().isOk());
  }

  String data(boolean register) throws Exception {
    var fields =
        new HashMap<String, String>(
            Map.of(
                "state", STATE, "email", " CITIZEN@example.test ", "password", " Password123! "));
    if (register) fields.put("name", "  Submitted Name  ");
    return json.writeValueAsString(fields);
  }

  ResultActions submit(boolean register) throws Exception {
    return mvc.perform(
        post(register ? "/api/auth/gov/register" : "/api/auth/gov/password-login")
            .session(session)
            .contentType(MediaType.APPLICATION_JSON)
            .content(data(register)));
  }

  @Test
  void signupCreatesOnlyVerifiedSessionAndRotatesIt() throws Exception {
    start("REGISTER");
    String original = session.getId();
    submit(true)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.user.display_name").value("Verified Name"))
        .andExpect(jsonPath("$.password").doesNotExist())
        .andExpect(jsonPath("$.access_token").doesNotExist());
    assertNotEquals(original, session.getId());
    assertEquals("iam-citizen", SecurityContextHolder.getContext().getAuthentication().getName());
    verify(api).register("Submitted Name", "citizen@example.test", " Password123! ");
    assertEquals("iam-citizen", session.getAttribute("gov_verified_username"));
    for (String key : Collections.list(session.getAttributeNames())) {
      assertFalse(String.valueOf(session.getAttribute(key)).contains("Password123!"));
    }
    submit(true).andExpect(status().isBadRequest());
    verify(api, times(1)).register(anyString(), anyString(), anyString());
  }

  @Test
  void emailLoginUsesVerifiedIdentityWithoutRegistering() throws Exception {
    start("PASSWORD_LOGIN");
    submit(false).andExpect(status().isOk());
    verify(api, never()).register(anyString(), anyString(), anyString());
  }

  @Test
  void refusesMissingWrongPurposeAndWrongStateBeforeRegistering() throws Exception {
    submit(true).andExpect(status().isBadRequest());
    start("LOGIN");
    submit(true).andExpect(status().isBadRequest());
    start("REGISTER");
    mvc.perform(
            post("/api/auth/gov/register")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(data(true).replace(STATE, "0".repeat(64))))
        .andExpect(status().isBadRequest());
    verifyNoInteractions(api);
  }

  @Test
  void callbackCannotConsumeAccountTransaction() throws Exception {
    start("REGISTER");
    mvc.perform(
            post("/api/auth/sso-callback")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("state", STATE, "code", "verified-code"))))
        .andExpect(status().isBadRequest());
    verify(sso, never()).verify(anyString());
  }

  @Test
  void validatesAndDoesNotEchoCredentials() throws Exception {
    start("REGISTER");
    var invalid = data(true).replace(" Password123! ", "short");
    mvc.perform(
            post("/api/auth/gov/register")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(invalid))
        .andExpect(status().isBadRequest())
        .andExpect(
            content()
                .string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("short"))));
    verifyNoInteractions(api);
    var dto = json.readValue(data(true), GovAccountController.Registration.class);
    assertFalse(dto.toString().contains("Password123!"));
    assertFalse(json.writeValueAsString(dto).contains("Password123!"));
  }

  @Test
  void refusesThaiLettersInEmailAndPassword() throws Exception {
    for (String thai :
        List.of(
            data(true).replace(" Password123! ", "รหัสผ่านภาษาไทย12"),
            data(true).replaceFirst("\"email\":\"", "\"email\":\"ไทย"))) {
      start("REGISTER");
      mvc.perform(
              post("/api/auth/gov/register")
                  .session(session)
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(thai))
          .andExpect(status().isBadRequest());
    }
    verifyNoInteractions(api);
  }

  @Test
  void partialSignupReportsAccountExistsAndNeverRetriesRegister() throws Exception {
    start("REGISTER");
    when(api.loginCode(anyString(), anyString()))
        .thenThrow(
            new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "เข้าสู่ระบบขัดข้อง"));
    submit(true)
        .andExpect(status().isServiceUnavailable())
        .andExpect(
            jsonPath("$.message")
                .value(org.hamcrest.Matchers.containsString("สมัครบัญชี Gov Center สำเร็จแล้ว")));
    submit(true).andExpect(status().isBadRequest());
    verify(api, times(1)).register(anyString(), anyString(), anyString());
  }

  @Test
  void logoutDuringNetworkCannotRestoreSession() throws Exception {
    start("REGISTER");
    when(api.loginCode(anyString(), anyString()))
        .thenAnswer(
            call -> {
              session.invalidate();
              return "verified-code";
            });
    submit(true).andExpect(status().isConflict());
    verifyNoInteractions(identities);
  }

  @Test
  void newerStartDuringNetworkCannotBeOverwritten() throws Exception {
    start("PASSWORD_LOGIN");
    when(api.loginCode(anyString(), anyString()))
        .thenAnswer(
            call -> {
              start("LOGIN");
              return "verified-code";
            });
    submit(false).andExpect(status().isConflict());
    verifyNoInteractions(identities);
  }

  @Test
  void signedInAccountCannotBeReplacedBySignup() throws Exception {
    mvc.perform(
            post("/api/auth/gov/start")
                .principal(
                    org.springframework.security.authentication.UsernamePasswordAuthenticationToken
                        .authenticated("staff", null, List.of()))
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("purpose", "REGISTER", "state", STATE))))
        .andExpect(status().isConflict());
    verifyNoInteractions(api);
  }

  @Test
  void persistenceFailureAfterSignupHasSanitizedEmailRecoveryAndNoSession() throws Exception {
    start("REGISTER");
    when(identities.sync(any(), any(), isNull()))
        .thenThrow(
            new org.springframework.dao.DataAccessResourceFailureException(
                "secret database details"));
    submit(true)
        .andExpect(status().isServiceUnavailable())
        .andExpect(
            jsonPath("$.message")
                .value(org.hamcrest.Matchers.containsString("สมัครบัญชี Gov Center สำเร็จแล้ว")))
        .andExpect(
            jsonPath("$.message").value(org.hamcrest.Matchers.containsString("อีเมล Gov Center")))
        .andExpect(
            content()
                .string(
                    org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("secret database"))));
    assertNull(session.getAttribute("SPRING_SECURITY_CONTEXT"));
    assertNull(SecurityContextHolder.getContext().getAuthentication());
    verify(api, times(1)).register(anyString(), anyString(), anyString());
  }

  @Test
  void newerStaffLoginWaitsForGovFinalizationAndWins() throws Exception {
    start("PASSWORD_LOGIN");
    var syncing = new java.util.concurrent.CountDownLatch(1);
    var release = new java.util.concurrent.CountDownLatch(1);
    when(identities.sync(any(), any(), isNull()))
        .thenAnswer(
            call -> {
              syncing.countDown();
              assertTrue(release.await(3, java.util.concurrent.TimeUnit.SECONDS));
              return Map.of("username", "iam-citizen", "role", "CITIZEN");
            });
    var gov =
        java.util.concurrent.CompletableFuture.supplyAsync(
            () -> {
              try {
                return submit(false).andReturn().getResponse().getStatus();
              } catch (Exception e) {
                throw new RuntimeException(e);
              }
            });
    assertTrue(syncing.await(2, java.util.concurrent.TimeUnit.SECONDS));
    var staff =
        java.util.concurrent.CompletableFuture.runAsync(
            () -> {
              var q = new MockHttpServletRequest("POST", "/api/auth/login");
              q.setSession(session);
              try {
                new SecurityConfig.SerializedSessionMutation()
                    .doFilter(
                        q,
                        new MockHttpServletResponse(),
                        (req, res) -> {
                          session.changeSessionId();
                          var context = SecurityContextHolder.createEmptyContext();
                          context.setAuthentication(
                              org.springframework.security.authentication
                                  .UsernamePasswordAuthenticationToken.authenticated(
                                  "staff", null, List.of()));
                          session.setAttribute("SPRING_SECURITY_CONTEXT", context);
                        });
              } catch (Exception e) {
                throw new RuntimeException(e);
              }
            });
    try {
      assertThrows(
          java.util.concurrent.TimeoutException.class,
          () -> staff.get(150, java.util.concurrent.TimeUnit.MILLISECONDS));
    } finally {
      release.countDown();
    }
    assertEquals(200, gov.get(3, java.util.concurrent.TimeUnit.SECONDS));
    staff.get(3, java.util.concurrent.TimeUnit.SECONDS);
    var saved =
        (org.springframework.security.core.context.SecurityContext)
            session.getAttribute("SPRING_SECURITY_CONTEXT");
    assertEquals("staff", saved.getAuthentication().getName());
  }
}
