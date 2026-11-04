package th.go.towntrack;

import com.fasterxml.jackson.databind.*;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** Credential passthrough to Gov. No credentials or central tokens outlive this call. */
@Component
public class GovAccountClient {
  final GovCenterSsoClient sso;
  final ObjectMapper json;
  final HttpClient http =
      HttpClient.newBuilder()
          .connectTimeout(Duration.ofSeconds(3))
          .followRedirects(HttpClient.Redirect.NEVER)
          .build();

  public GovAccountClient(GovCenterSsoClient sso, ObjectMapper json) {
    this.sso = sso;
    this.json = json;
  }

  void register(String name, String email, String password) {
    send("/auth/register", Map.of("name", name, "email", email, "password", password), null, true);
  }

  String loginCode(String email, String password) {
    var login =
        send(
            "/auth/login?service=" + URLEncoder.encode(sso.serviceCode, StandardCharsets.UTF_8),
            Map.of("email", email, "password", password),
            null,
            false);
    if (login.hasNonNull("code")) return code(login);
    JsonNode token =
        login.hasNonNull("access_token") ? login.path("access_token") : login.path("accessToken");
    if (!token.isTextual()
        || token.asText().isEmpty()
        || token.asText().length() > 16384
        || !token.asText().chars().allMatch(c -> c > 32 && c < 127)) throw malformed();
    return code(
        send(
            "/e-services/sso/generate-code",
            Map.of("eServiceCode", sso.serviceCode),
            token.asText(),
            false));
  }

  private String code(JsonNode value) {
    JsonNode code = value.path("code");
    if (!code.isTextual()
        || code.asText().isBlank()
        || code.asText().length() > 10000
        || code.asText().chars().anyMatch(Character::isISOControl)) throw malformed();
    return code.asText();
  }

  private JsonNode send(String path, Map<String, String> body, String token, boolean registration) {
    sso.requireConfigured();
    try {
      var builder =
          HttpRequest.newBuilder(URI.create(GovCenterSsoClient.API_URL + path))
              .timeout(Duration.ofSeconds(8))
              .header("Content-Type", "application/json")
              .header("Accept", "application/json")
              .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
      if (token != null) builder.header("Authorization", "Bearer " + token);
      var response = GovHttp.send(http, builder.build(), 65536);
      int status = response.statusCode();
      if (registration && status == 409)
        throw new ResponseStatusException(
            HttpStatus.CONFLICT,
            "อีเมลนี้มีบัญชี Gov Center แล้ว กรุณาเข้าสู่ระบบด้วยอีเมล Gov Center");
      if (!registration && path.startsWith("/auth/login") && status == 401)
        throw new ResponseStatusException(
            HttpStatus.UNAUTHORIZED, "อีเมลหรือรหัสผ่าน Gov Center ไม่ถูกต้อง");
      if (registration && status != 201
          || !registration && status != (path.startsWith("/auth/login") ? 200 : 201))
        throw new ResponseStatusException(
            HttpStatus.SERVICE_UNAVAILABLE,
            registration
                ? "Gov Center ไม่รับคำขอสมัคร กรุณาลองเข้าสู่ระบบด้วยอีเมลก่อนสมัครใหม่"
                : "Gov Center ไม่พร้อมเข้าสู่ระบบ กรุณาลองใหม่ภายหลัง");
      // Registration's response is not an identity source, and can have no JSON body.
      if (registration) return json.createObjectNode();
      byte[] bytes = response.body();
      if (bytes.length > 65536) throw malformed();
      var result = json.readTree(bytes);
      if (result == null || !result.isObject()) throw malformed();
      return result;
    } catch (ResponseStatusException e) {
      throw e;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw unavailable(registration);
    } catch (IOException e) {
      throw unavailable(registration);
    } catch (Exception e) {
      throw malformed();
    }
  }

  private ResponseStatusException unavailable(boolean registration) {
    return new ResponseStatusException(
        HttpStatus.SERVICE_UNAVAILABLE,
        registration
            ? "ยังตรวจสอบผลการสมัครไม่ได้ กรุณาลองเข้าสู่ระบบด้วยอีเมล Gov Center ก่อนสมัครใหม่"
            : "เชื่อมต่อ Gov Center ไม่สำเร็จ กรุณาลองเข้าสู่ระบบใหม่");
  }

  private ResponseStatusException malformed() {
    return new ResponseStatusException(
        HttpStatus.BAD_GATEWAY,
        "ข้อมูลตอบกลับ Gov Center ไม่ถูกต้อง กรุณาลองเข้าสู่ระบบด้วยอีเมล Gov Center");
  }
}
