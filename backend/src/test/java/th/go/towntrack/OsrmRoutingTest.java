package th.go.towntrack;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.util.*;
import java.util.concurrent.atomic.*;
import org.junit.jupiter.api.*;

class OsrmRoutingTest {
  HttpServer server;
  AtomicInteger calls = new AtomicInteger();
  AtomicLong clock = new AtomicLong(10000);
  List<String> urls = new ArrayList<>();
  List<String> agents = new ArrayList<>();
  String failure = "";
  final List<OsrmRouting.Point> points =
      List.of(
          new OsrmRouting.Point(13.75, 100.5),
          new OsrmRouting.Point(13.76, 100.51),
          new OsrmRouting.Point(13.77, 100.52));

  @BeforeEach
  void setup() throws Exception {
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext(
        "/",
        e -> {
          calls.incrementAndGet();
          urls.add(e.getRequestURI().toString());
          agents.add(e.getRequestHeaders().getFirst("User-Agent"));
          String body =
              !failure.isEmpty()
                  ? failure
                  : e.getRequestURI().getPath().contains("/table/")
                      ? "{\"code\":\"Ok\",\"durations\":[[0,12,20],[11,0,8],[25,10,0]]}"
                      : "{\"code\":\"Ok\",\"routes\":[{\"distance\":1200,\"duration\":300,\"geometry\":{\"type\":\"LineString\",\"coordinates\":[[100.5,13.75],[100.51,13.76],[100.52,13.77]]}}]}";
          byte[] bytes = body.getBytes(java.nio.charset.StandardCharsets.UTF_8);
          e.sendResponseHeaders(200, bytes.length);
          e.getResponseBody().write(bytes);
          e.close();
        });
    server.start();
  }

  @AfterEach
  void close() {
    server.stop(0);
  }

  OsrmRouting routing() {
    return new OsrmRouting(
        "http://127.0.0.1:" + server.getAddress().getPort(),
        new ObjectMapper(),
        clock::get,
        millis -> clock.addAndGet(millis));
  }

  @Test
  void sendsCoordinatesOnlyIdentifiesItselfAndCachesWithinSharedRateGate() throws Exception {
    var routing = routing();
    assertEquals(12, routing.table(points)[0][1]);
    assertEquals(12, routing.table(points)[0][1]);
    var road = routing.road(points);
    assertEquals(1200, road.distance());
    assertEquals(300, road.duration());
    assertEquals(2, calls.get());
    assertTrue(clock.get() >= 11100);
    assertTrue(agents.stream().allMatch(a -> a.startsWith("TownTrack/")));
    assertTrue(
        urls.stream()
            .allMatch(
                url ->
                    url.contains("100.500000,13.750000")
                        && !url.contains("count=")
                        && !url.contains("name=")
                        && !url.contains("description=")
                        && !url.contains("email=")));
  }

  @Test
  void refusesInvalidOrUnreachableResponsesInsteadOfFabricatingRoadData() {
    failure = "{\"code\":\"NoRoute\"}";
    assertThrows(
        org.springframework.web.server.ResponseStatusException.class, () -> routing().road(points));
    failure = "{\"code\":\"Ok\",\"durations\":[[0,1]]}";
    assertThrows(
        org.springframework.web.server.ResponseStatusException.class,
        () -> routing().table(points));
    assertThrows(IllegalArgumentException.class, () -> new OsrmRouting.Point(Double.NaN, 100));
  }

  @Test
  void failedResponsesAreNotCachedAndSuccessExpires() throws Exception {
    var routing = routing();
    failure = "{}";
    assertThrows(
        org.springframework.web.server.ResponseStatusException.class, () -> routing.table(points));
    failure = "";
    routing.table(points);
    routing.table(points);
    assertEquals(2, calls.get());
    clock.addAndGet(900001);
    routing.table(points);
    assertEquals(3, calls.get());
  }

  @Test
  void cachedRoadGeometryHasABoundedByteBudgetForSmallCloudInstances() {
    failure =
        "{\"code\":\"Ok\",\"routes\":[{\"distance\":1200,\"duration\":300,\"geometry\":{\"type\":\"LineString\",\"coordinates\":["
            + String.join(",", Collections.nCopies(3000, "[100.5001,13.7501]"))
            + "]}}]}";
    var routing = routing();
    for (int i = 0; i < 60; i++)
      routing.road(
          List.of(points.get(0), points.get(1), new OsrmRouting.Point(13.77 + i * .00001, 100.52)));
    long bytes =
        routing.cache.values().stream()
            .mapToLong(
                c -> c.value().toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length)
            .sum();
    assertTrue(
        bytes <= 2_000_000, "Cached serialized geometry must fit its 2 MB budget; got " + bytes);
  }
}
