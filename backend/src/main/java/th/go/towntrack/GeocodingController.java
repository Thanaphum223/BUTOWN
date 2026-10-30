package th.go.towntrack;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/geocoding")
public class GeocodingController {
  final String base;
  final ObjectMapper json;
  final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
  final Map<String, Object> cache = new LinkedHashMap<>();
  long last;

  public GeocodingController(@Value("${GEOCODING_BASE_URL:}") String base, ObjectMapper json) {
    this.base = base.replaceAll("/+$", "");
    this.json = json;
  }

  synchronized Object call(String query) throws Exception {
    if (base.isBlank())
      throw new ResponseStatusException(
          HttpStatus.SERVICE_UNAVAILABLE,
          "ยังไม่ได้ตั้งค่าบริการค้นหาสถานที่ กรุณาปักหมุดหรือกรอกที่อยู่เอง");
    if (cache.containsKey(query)) return cache.get(query);
    long now = System.currentTimeMillis();
    if (now - last < 1100)
      throw new ResponseStatusException(
          HttpStatus.TOO_MANY_REQUESTS, "กรุณารอสักครู่แล้วค้นหาอีกครั้ง");
    last = now;
    var request =
        HttpRequest.newBuilder(URI.create(base + query))
            .timeout(Duration.ofSeconds(5))
            .header("User-Agent", "TownTrack/0.1 municipal-service")
            .header("Accept-Language", "th")
            .GET()
            .build();
    var response = client.send(request, HttpResponse.BodyHandlers.ofString());
    if (response.statusCode() != 200)
      throw new ResponseStatusException(
          HttpStatus.SERVICE_UNAVAILABLE, "บริการแผนที่ไม่พร้อม กรุณาปักหมุดเอง");
    Object result = json.readValue(response.body(), Object.class);
    if (cache.size() >= 200) cache.remove(cache.keySet().iterator().next());
    cache.put(query, result);
    return result;
  }

  @GetMapping("/search")
  public Object search(@RequestParam String q) throws Exception {
    if (q.isBlank() || q.length() > 200) throw new IllegalArgumentException();
    return call(
        "/search?format=jsonv2&limit=5&countrycodes=th&addressdetails=1&q="
            + URLEncoder.encode(q, java.nio.charset.StandardCharsets.UTF_8));
  }

  @GetMapping("/reverse")
  public Object reverse(@RequestParam double latitude, @RequestParam double longitude)
      throws Exception {
    if (!Double.isFinite(latitude)
        || !Double.isFinite(longitude)
        || Math.abs(latitude) > 90
        || Math.abs(longitude) > 180) throw new IllegalArgumentException();
    return call("/reverse?format=jsonv2&lat=" + latitude + "&lon=" + longitude);
  }
}
