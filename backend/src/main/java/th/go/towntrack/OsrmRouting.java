package th.go.towntrack;

import com.fasterxml.jackson.databind.*;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.function.LongSupplier;
import org.springframework.beans.factory.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * Single-instance test deployment gateway: explicit calls only, coordinates only, <=1 request/s.
 */
@Service
public class OsrmRouting {
  record Point(double latitude, double longitude) {
    Point {
      if (!Double.isFinite(latitude)
          || !Double.isFinite(longitude)
          || Math.abs(latitude) > 90
          || Math.abs(longitude) > 180) throw new IllegalArgumentException("พิกัดไม่ถูกต้อง");
    }
  }

  record Road(double distance, double duration, JsonNode geometry) {}

  interface Sleep {
    void waitFor(long millis) throws InterruptedException;
  }

  record Cached(JsonNode value, long at, int bytes) {}

  final String base;
  final ObjectMapper json;
  final LongSupplier clock;
  final Sleep sleep;
  final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
  final Map<String, Cached> cache = new LinkedHashMap<>();
  long last;
  long cachedBytes;
  boolean requested;

  @Autowired
  public OsrmRouting(@Value("${ROUTING_BASE_URL:}") String base, ObjectMapper json) {
    this(base, json, () -> System.nanoTime() / 1_000_000, Thread::sleep);
  }

  OsrmRouting(String base, ObjectMapper json, LongSupplier clock, Sleep sleep) {
    this.base = base.replaceAll("/+$", "");
    this.json = json;
    this.clock = clock;
    this.sleep = sleep;
    if (!base.isBlank()) {
      URI uri = URI.create(base);
      if (uri.getHost() == null
          || uri.getUserInfo() != null
          || uri.getQuery() != null
          || uri.getFragment() != null
          || !("https".equals(uri.getScheme())
              || "http".equals(uri.getScheme())
                  && List.of("127.0.0.1", "localhost").contains(uri.getHost())))
        throw new IllegalArgumentException("บริการเส้นทางต้องใช้ HTTPS");
    }
  }

  boolean enabled() {
    return !base.isBlank();
  }

  static String coordinates(List<Point> points) {
    return String.join(
        ";",
        points.stream()
            .map(p -> String.format(Locale.ROOT, "%.6f,%.6f", p.longitude, p.latitude))
            .toList());
  }

  synchronized JsonNode call(String query) {
    if (!enabled())
      throw new ResponseStatusException(
          HttpStatus.SERVICE_UNAVAILABLE, "ยังไม่ได้ตั้งค่าบริการเส้นทาง กรุณาติดต่อผู้ดูแล");
    long now = clock.getAsLong();
    var cached = cache.get(query);
    if (cached != null && now - cached.at < 900_000) return cached.value;
    if (cached != null) {
      cache.remove(query);
      cachedBytes -= cached.bytes;
    }
    try {
      if (requested) {
        long wait = 1100 - (now - last);
        if (wait > 0) sleep.waitFor(wait);
      }
      last = clock.getAsLong();
      requested = true;
      var request =
          HttpRequest.newBuilder(URI.create(base + query.replaceAll("&count=\\d+$", "")))
              .timeout(Duration.ofSeconds(8))
              .header(
                  "User-Agent",
                  "TownTrack/0.1 municipal-route-planning (https://towntrack.201.79.98.199.sslip.io)")
              .header("Accept", "application/json")
              .GET()
              .build();
      var response = GovHttp.send(client, request, 2_000_000);
      if (response.statusCode() != 200) throw unavailable();
      var data = json.readTree(response.body());
      if (!"Ok".equals(data.path("code").asText())) {
        if (List.of("NoRoute", "NoTable", "NoSegment").contains(data.path("code").asText()))
          throw new ResponseStatusException(
              HttpStatus.UNPROCESSABLE_ENTITY,
              "ไม่พบเส้นทางถนนครบทุกจุด กรุณาขยับหมุดหรือแยกรอบงาน");
        throw unavailable();
      }
      // Validate service-specific data before it is admitted to the shared bounded cache.
      if (query.startsWith("/table/"))
        validateTable(data, Integer.parseInt(query.substring(query.lastIndexOf("&count=") + 7)));
      else validateRoad(data);
      int bytes = response.body().length;
      if (bytes <= 256_000) {
        while (!cache.isEmpty() && (cache.size() >= 128 || cachedBytes + bytes > 2_000_000)) {
          var removed = cache.remove(cache.keySet().iterator().next());
          cachedBytes -= removed.bytes;
        }
        cache.put(query, new Cached(data, clock.getAsLong(), bytes));
        cachedBytes += bytes;
      }
      return data;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw unavailable();
    } catch (ResponseStatusException e) {
      throw e;
    } catch (Exception e) {
      throw unavailable();
    }
  }

  ResponseStatusException unavailable() {
    return new ResponseStatusException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "บริการคำนวณเส้นทางไม่พร้อม กรุณาลองอีกครั้ง ระบบยังไม่ได้มอบหมายงาน");
  }

  void validateTable(JsonNode data, int size) {
    var matrix = data.path("durations");
    if (!matrix.isArray() || matrix.size() != size) throw unavailable();
    for (var row : matrix) {
      if (!row.isArray() || row.size() != size) throw unavailable();
      for (var v : row)
        if (!v.isNull() && (!v.isNumber() || !Double.isFinite(v.asDouble()) || v.asDouble() < 0))
          throw unavailable();
    }
  }

  void validateRoad(JsonNode data) {
    var route = data.path("routes").path(0);
    var coords = route.path("geometry").path("coordinates");
    if (!"LineString".equals(route.path("geometry").path("type").asText())
        || !coords.isArray()
        || coords.size() < 2
        || coords.size() > 100_000) throw unavailable();
    for (var point : coords)
      if (!point.isArray()
          || point.size() != 2
          || !point.get(0).isNumber()
          || !point.get(1).isNumber()
          || !Double.isFinite(point.get(0).asDouble())
          || !Double.isFinite(point.get(1).asDouble())
          || Math.abs(point.get(0).asDouble()) > 180
          || Math.abs(point.get(1).asDouble()) > 90) throw unavailable();
    for (String key : List.of("distance", "duration"))
      if (!route.path(key).isNumber()
          || !Double.isFinite(route.path(key).asDouble())
          || route.path(key).asDouble() < 0) throw unavailable();
  }

  double[][] table(List<Point> points) {
    if (points == null || points.size() < 3 || points.size() > 11)
      throw new IllegalArgumentException("เลือกรายการงาน 2–10 จุด");
    // Count is a local cache validation suffix, stripped before sending the HTTP request below.
    var data =
        call(
            "/table/v1/driving/"
                + coordinates(points)
                + "?annotations=duration&generate_hints=false&count="
                + points.size());
    double[][] matrix = new double[points.size()][points.size()];
    for (int i = 0; i < matrix.length; i++)
      for (int j = 0; j < matrix.length; j++)
        matrix[i][j] =
            data.path("durations").get(i).get(j).isNull()
                ? Double.POSITIVE_INFINITY
                : data.path("durations").get(i).get(j).asDouble();
    return matrix;
  }

  Road road(List<Point> points) {
    if (points == null || points.size() < 3 || points.size() > 12)
      throw new IllegalArgumentException("เลือกรายการงาน 2–10 จุด");
    var data =
        call("/route/v1/driving/"
                + coordinates(points)
                + "?overview=simplified&geometries=geojson&steps=false&generate_hints=false&continue_straight=false")
            .path("routes")
            .path(0);
    return new Road(
        data.path("distance").asDouble(), data.path("duration").asDouble(), data.path("geometry"));
  }
}
