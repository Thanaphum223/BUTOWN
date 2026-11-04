package th.go.towntrack;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class GeocodingTest {
  @Test
  void reverseUsesAnIdentifiedThaiRequestCachesResultsAndLimitsNewRequests() throws Exception {
    var calls = new AtomicInteger();
    var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext(
        "/reverse",
        exchange -> {
          calls.incrementAndGet();
          assertTrue(exchange.getRequestHeaders().getFirst("User-Agent").startsWith("TownTrack/"));
          assertEquals("th", exchange.getRequestHeaders().getFirst("Accept-Language"));
          assertTrue(exchange.getRequestURI().getQuery().contains("format=jsonv2"));
          byte[] body =
              "{\"display_name\":\"Public fixture road\"}".getBytes(StandardCharsets.UTF_8);
          exchange.getResponseHeaders().set("Content-Type", "application/json");
          exchange.sendResponseHeaders(200, body.length);
          exchange.getResponseBody().write(body);
          exchange.close();
        });
    server.start();
    try {
      var api =
          new GeocodingController(
              "http://127.0.0.1:" + server.getAddress().getPort(), new ObjectMapper());
      var result = (Map<?, ?>) api.reverse(13.75, 100.5);
      assertEquals("Public fixture road", result.get("display_name"));
      assertEquals(result, api.reverse(13.75, 100.5));
      assertEquals(1, calls.get());
      // Pin the current limit window so CI scheduling cannot expire it between assertions.
      api.last = System.currentTimeMillis();
      var limited = assertThrows(ResponseStatusException.class, () -> api.reverse(13.76, 100.5));
      assertEquals(429, limited.getStatusCode().value());
      assertEquals(1, calls.get());
    } finally {
      server.stop(0);
    }
  }

  @Test
  void disabledProviderDoesNotReturnInventedAddressAndInvalidPointsAreRejected() {
    var api = new GeocodingController("", new ObjectMapper());
    var error = assertThrows(ResponseStatusException.class, () -> api.reverse(13.75, 100.5));
    assertEquals(503, error.getStatusCode().value());
    assertThrows(IllegalArgumentException.class, () -> api.reverse(Double.NaN, 100.5));
    assertThrows(IllegalArgumentException.class, () -> api.reverse(91, 100.5));
  }
}
