package th.go.towntrack;

import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.springframework.test.context.web.WebAppConfiguration;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

@ExtendWith(SpringExtension.class)
@WebAppConfiguration
@ContextConfiguration(classes = {SecurityConfig.class, GovOnlyAuthenticationTest.Config.class})
class GovOnlyAuthenticationTest {
  @Configuration
  @EnableWebSecurity
  @EnableWebMvc
  static class Config {
    @Bean
    Db db() {
      return mock(Db.class);
    }

    @Bean
    LegacyEndpoints endpoints() {
      return new LegacyEndpoints();
    }
  }

  @RestController
  static class LegacyEndpoints {
    @PostMapping({"/api/auth/login", "/api/auth/register", "/api/auth/line"})
    Map<String, Boolean> legacy() {
      return Map.of("ok", true);
    }
  }

  @Autowired WebApplicationContext context;
  @Autowired Db db;
  @Autowired PasswordEncoder passwords;
  MockMvc mvc;

  @BeforeEach
  void setup() {
    reset(db);
    mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
  }

  @Test
  void validStoredLocalPasswordCannotAuthenticateOrTouchAccounts() throws Exception {
    when(db.list("SELECT * FROM app_user WHERE username=? AND enabled=true", "existing-citizen"))
        .thenReturn(
            List.of(
                Map.of(
                    "password_hash",
                    passwords.encode("Synthetic-password-123"),
                    "role",
                    "CITIZEN")));
    mvc.perform(
            post("/api/auth/login")
                .with(csrf())
                .param("username", "existing-citizen")
                .param("password", "Synthetic-password-123"))
        .andExpect(status().isUnauthorized())
        .andExpect(unauthenticated());
    verifyNoInteractions(db);
  }

  @ParameterizedTest
  @ValueSource(strings = {"/api/auth/login", "/api/auth/register", "/api/auth/line"})
  void anonymousCannotUseLegacyEntryPoints(String path) throws Exception {
    mvc.perform(post(path).with(csrf()))
        .andExpect(status().isUnauthorized())
        .andExpect(unauthenticated());
    verifyNoInteractions(db);
  }

  @ParameterizedTest
  @ValueSource(strings = {"/api/auth/login", "/api/auth/register", "/api/auth/line"})
  void signedInIdentityCannotUseLegacyEntryPoints(String path) throws Exception {
    mvc.perform(post(path).with(csrf()).with(user("verified-gov-user")))
        .andExpect(status().isForbidden())
        .andExpect(authenticated().withUsername("verified-gov-user"));
    verifyNoInteractions(db);
  }

  @Test
  void legacyRequestWithoutCsrfStillFails() throws Exception {
    mvc.perform(post("/api/auth/login"))
        .andExpect(status().isForbidden())
        .andExpect(unauthenticated());
    verifyNoInteractions(db);
  }
}
