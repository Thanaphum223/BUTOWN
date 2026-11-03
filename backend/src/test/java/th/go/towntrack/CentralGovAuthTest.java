package th.go.towntrack;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class CentralGovAuthTest {
  GovCenterSsoClient config(String code, String key, String callback) {
    return new GovCenterSsoClient(new ObjectMapper(), code, key, callback);
  }

  @Test
  void exactlyThreeSettingsAreEnoughAndProviderEndpointsAreFixed() {
    var ready = config("town-track", "isolated-test-key", "https://towntrack.test/auth/callback");
    assertTrue(ready.configured());
    assertEquals("https://auth.govcenter.co", ready.publicConfig().get("iamAuthUrl"));
    assertEquals("https://api-auth.govcenter.co", GovCenterSsoClient.API_URL);
    assertFalse(ready.publicConfig().containsKey("apiKey"));
  }

  @Test
  void absentCredentialsAndUnsafeCallbackFailClosed() {
    var missing = config("", "", "");
    assertFalse(missing.configured());
    assertThrows(ResponseStatusException.class, () -> missing.verify("code"));
    for (String callback :
        List.of(
            "http://evil.example/auth/callback",
            "https://u:p@towntrack.test/auth/callback",
            "https://towntrack.test/auth/callback?state=x",
            "https://towntrack.test/"))
      assertFalse(config("town-track", "secret", callback).configured());
  }

  @Test
  void invalidServiceCodeAndMalformedKeyFailClosed() {
    for (String code : List.of("", "town track", "town/track", "x".repeat(65)))
      assertFalse(config(code, "secret", "https://towntrack.test/auth/callback").configured());
    for (String key : List.of("", " secret", "secret\nvalue"))
      assertFalse(config("town-track", key, "https://towntrack.test/auth/callback").configured());
  }

  @Test
  void missingOrAmbiguousLocalMunicipalityCannotBeGuessed() {
    var db = org.mockito.Mockito.mock(Db.class);
    org.mockito.Mockito.when(db.list(org.mockito.ArgumentMatchers.anyString()))
        .thenReturn(List.of());
    assertThrows(
        ResponseStatusException.class, () -> CentralGovAuthController.onlyMunicipality(db));
    org.mockito.Mockito.when(db.list(org.mockito.ArgumentMatchers.anyString()))
        .thenReturn(List.of(Map.of("id", UUID.randomUUID()), Map.of("id", UUID.randomUUID())));
    assertThrows(
        ResponseStatusException.class, () -> CentralGovAuthController.onlyMunicipality(db));
  }
}
