package th.go.towntrack;

import com.fasterxml.jackson.databind.*;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class GovCenterSsoClient {
  static final String API_URL = "https://api-auth.govcenter.co";
  static final String AUTH_URL = "https://auth.govcenter.co";
  final String serviceCode, apiKey, callbackUrl;
  final ObjectMapper json;
  final HttpClient http =
      HttpClient.newBuilder()
          .connectTimeout(Duration.ofSeconds(3))
          .followRedirects(HttpClient.Redirect.NEVER)
          .build();

  public GovCenterSsoClient(
      ObjectMapper json,
      @Value("${E_SERVICE_CODE:}") String serviceCode,
      @Value("${E_SERVICE_API_KEY:}") String apiKey,
      @Value("${GOV_CALLBACK_URL:}") String callbackUrl) {
    this.json = json;
    this.serviceCode = serviceCode;
    this.apiKey = apiKey;
    this.callbackUrl = callbackUrl;
  }

  static boolean trustedUrl(String value) {
    try {
      var u = URI.create(value);
      return u.getHost() != null
          && u.getUserInfo() == null
          && u.getQuery() == null
          && u.getFragment() == null
          && ("https".equals(u.getScheme())
              || ("http".equals(u.getScheme())
                  && List.of("localhost", "127.0.0.1", "[::1]").contains(u.getHost())));
    } catch (Exception e) {
      return false;
    }
  }

  boolean configured() {
    try {
      return serviceCode.matches("[a-zA-Z0-9_-]{1,64}")
          && !apiKey.isBlank()
          && apiKey.chars().allMatch(c -> c > 32 && c < 127)
          && trustedUrl(callbackUrl)
          && "/auth/callback".equals(URI.create(callbackUrl).getPath());
    } catch (Exception e) {
      return false;
    }
  }

  void requireConfigured() {
    if (!configured())
      throw new ResponseStatusException(
          HttpStatus.SERVICE_UNAVAILABLE, "ยังไม่ได้ตั้งค่า Gov Center SSO ครบถ้วน");
  }

  Map<String, Object> publicConfig() {
    return Map.of(
        "mode",
        "local",
        "configured",
        configured(),
        "iamAuthUrl",
        AUTH_URL,
        "serviceCode",
        serviceCode,
        "callbackUrl",
        callbackUrl);
  }

  JsonNode verify(String code) {
    requireConfigured();
    if (code == null || code.isBlank() || code.length() > 10000)
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "ไม่พบรหัส SSO กรุณาเข้าสู่ระบบใหม่");
    try {
      var request =
          HttpRequest.newBuilder(URI.create(API_URL + "/e-services/sso/verify-code"))
              .timeout(Duration.ofSeconds(8))
              .header("Content-Type", "application/json")
              .header("x-api-key", apiKey)
              .POST(
                  HttpRequest.BodyPublishers.ofString(
                      json.writeValueAsString(Map.of("code", code.trim()))))
              .build();
      var response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
      try (var input = response.body()) {
        if (List.of(400, 401, 403, 409).contains(response.statusCode())) {
          String error =
              new String(input.readNBytes(8192), java.nio.charset.StandardCharsets.UTF_8)
                  .toLowerCase(Locale.ROOT);
          if (error.contains("invalid sso code")
              || error.contains("sso code has already been used")
              || error.contains("sso code has expired"))
            throw new ResponseStatusException(
                HttpStatus.UNAUTHORIZED,
                "รหัส SSO ไม่ถูกต้อง หมดอายุ หรือใช้แล้ว กรุณาเข้าสู่ระบบใหม่");
          throw new ResponseStatusException(
              HttpStatus.SERVICE_UNAVAILABLE,
              "Gov Center ปฏิเสธการเชื่อมต่อ กรุณาให้ผู้ดูแลตรวจ API Key, Service Code และสิทธิ์บริการ");
        }
        if (response.statusCode() != 200)
          throw new ResponseStatusException(
              HttpStatus.SERVICE_UNAVAILABLE,
              "Gov Center ไม่พร้อมใช้งาน กรุณาเริ่มเข้าสู่ระบบใหม่");
        byte[] data = input.readNBytes(1048577);
        if (data.length > 1048576) throw new IllegalArgumentException();
        JsonNode result = json.readTree(data);
        if (result == null
            || !result.isObject()
            || !result.path("user").isObject()
            || !result.path("user").path("id").isTextual()
            || result.path("user").path("id").asText().isBlank()
            || result.path("user").path("id").asText().length() > 200)
          throw new IllegalArgumentException();
        return result;
      }
    } catch (ResponseStatusException e) {
      throw e;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new ResponseStatusException(
          HttpStatus.SERVICE_UNAVAILABLE,
          "การเชื่อมต่อ Gov Center ถูกขัดจังหวะ กรุณาเข้าสู่ระบบใหม่");
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new ResponseStatusException(
          HttpStatus.BAD_GATEWAY, "ข้อมูลตอบกลับ Gov Center ไม่ถูกต้อง");
    } catch (java.io.IOException e) {
      throw new ResponseStatusException(
          HttpStatus.SERVICE_UNAVAILABLE, "เชื่อมต่อ Gov Center ไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่");
    } catch (Exception e) {
      throw new ResponseStatusException(
          HttpStatus.BAD_GATEWAY, "ข้อมูลตอบกลับ Gov Center ไม่ถูกต้อง");
    }
  }
}
