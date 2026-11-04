package th.go.towntrack;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.*;
import java.net.http.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.Flow;
import org.junit.jupiter.api.*;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

class GovAccountClientTest {
  final ObjectMapper json = new ObjectMapper();
  final GovCenterSsoClient sso =
      new GovCenterSsoClient(json, "town-track", "isolated-key", "https://town.test/auth/callback");
  GovAccountClient client;
  List<HttpRequest> sent;
  Deque<Object> replies;

  @BeforeEach
  void setup() throws Exception {
    client = new GovAccountClient(sso, json);
    sent = new ArrayList<>();
    replies = new ArrayDeque<>();
    HttpClient http = mock(HttpClient.class);
    doAnswer(
            call -> {
              HttpRequest req = call.getArgument(0);
              assertEquals(
                  "https://api-auth.govcenter.co",
                  req.uri().getScheme() + "://" + req.uri().getHost());
              sent.add(req);
              Object next = replies.removeFirst();
              if (next instanceof IOException e) throw e;
              return next;
            })
        .when(http)
        .send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
    ReflectionTestUtils.setField(client, "http", http);
  }

  @SuppressWarnings("unchecked")
  void reply(int status, String body) {
    HttpResponse<InputStream> r = mock(HttpResponse.class);
    when(r.statusCode()).thenReturn(status);
    when(r.body()).thenReturn(new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
    replies.add(r);
  }

  String body(HttpRequest r) {
    var out = new ByteArrayOutputStream();
    r.bodyPublisher()
        .orElseThrow()
        .subscribe(
            new Flow.Subscriber<ByteBuffer>() {
              public void onSubscribe(Flow.Subscription s) {
                s.request(Long.MAX_VALUE);
              }

              public void onNext(ByteBuffer b) {
                byte[] bytes = new byte[b.remaining()];
                b.get(bytes);
                out.writeBytes(bytes);
              }

              public void onError(Throwable e) {
                fail(e);
              }

              public void onComplete() {}
            });
    return out.toString(StandardCharsets.UTF_8);
  }

  @Test
  void registersWithOnlyOfficialFieldsThenObtainsServiceScopedCode() throws Exception {
    reply(201, "{\"id\":\"untrusted-registration-id\"}");
    reply(200, "{\"code\":\"service-code\",\"accessToken\":\"must-not-be-used\"}");
    client.register("Citizen", "citizen@example.test", " Password123! ");
    assertEquals("service-code", client.loginCode("citizen@example.test", " Password123! "));
    assertEquals("/auth/register", sent.get(0).uri().getPath());
    assertEquals(
        Map.of("name", "Citizen", "email", "citizen@example.test", "password", " Password123! "),
        json.readValue(body(sent.get(0)), Map.class));
    assertEquals(
        "https://api-auth.govcenter.co/auth/login?service=town-track",
        sent.get(1).uri().toString());
    assertEquals(
        Map.of("email", "citizen@example.test", "password", " Password123! "),
        json.readValue(body(sent.get(1)), Map.class));
    for (HttpRequest req : sent) {
      assertEquals("POST", req.method());
      assertTrue(req.headers().firstValue("x-api-key").isEmpty());
      assertTrue(req.headers().firstValue("Authorization").isEmpty());
    }
  }

  @Test
  void exchangesBearerOnlyAtOfficialGenerateCodeEndpoint() throws Exception {
    reply(200, "{\"access_token\":\"in-memory-token\",\"refresh_token\":\"discard-me\"}");
    reply(201, "{\"code\":\"generated-code\",\"expiresAt\":\"2026-11-04T00:00:00Z\"}");
    assertEquals("generated-code", client.loginCode("citizen@example.test", "pass"));
    assertEquals(
        "https://api-auth.govcenter.co/e-services/sso/generate-code", sent.get(1).uri().toString());
    assertEquals(
        "Bearer in-memory-token", sent.get(1).headers().firstValue("Authorization").orElseThrow());
    assertEquals(
        Map.of("eServiceCode", "town-track"), json.readValue(body(sent.get(1)), Map.class));
  }

  @Test
  void supportsPublishedWebAccessTokenField() {
    reply(200, "{\"accessToken\":\"web-token\"}");
    reply(201, "{\"code\":\"generated\"}");
    assertEquals("generated", client.loginCode("a@example.test", "pass"));
  }

  @Test
  void rejectsRedirectsAndMalformedOrOversizedCredentialsResponses() {
    for (String body :
        List.of(
            "{}", "{\"code\":3}", "{\"access_token\":\"bad\\r\\nheader\"}", "x".repeat(65537))) {
      reply(200, body);
      assertThrows(
          ResponseStatusException.class, () -> client.loginCode("a@example.test", "secret"));
    }
    reply(302, "{\"code\":\"must-not-follow\"}");
    assertThrows(ResponseStatusException.class, () -> client.loginCode("a@example.test", "secret"));
    assertEquals(5, sent.size());
  }

  @Test
  void conflictAndUnknownRegistrationOutcomeAreSafeAndNeverRetried() {
    reply(409, "{\"message\":\"do not reflect secret\"}");
    var conflict =
        assertThrows(
            ResponseStatusException.class, () -> client.register("A", "a@example.test", "secret"));
    assertEquals(409, conflict.getStatusCode().value());
    assertFalse(conflict.getReason().contains("secret"));
    replies.add(new java.net.http.HttpTimeoutException("secret transport detail"));
    var unknown =
        assertThrows(
            ResponseStatusException.class, () -> client.register("A", "a@example.test", "secret"));
    assertTrue(unknown.getReason().contains("ตรวจสอบผลการสมัคร"));
    assertEquals(2, sent.size());
  }

  @Test
  void invalidPasswordAndUpstreamDetailsNeverEscape() {
    reply(401, "{\"password\":\"secret\"}");
    var e =
        assertThrows(
            ResponseStatusException.class, () -> client.loginCode("a@example.test", "secret"));
    assertEquals(401, e.getStatusCode().value());
    assertFalse(e.toString().contains("secret"));
  }
}
