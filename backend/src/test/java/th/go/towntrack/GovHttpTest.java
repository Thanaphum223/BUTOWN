package th.go.towntrack;

import static org.junit.jupiter.api.Assertions.*;

import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;

class GovHttpTest {
  @Test
  void deadlineCoversHeadersAndStalledBody() throws Exception {
    var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    var released = new CountDownLatch(1);
    server.createContext(
        "/",
        e -> {
          try {
            e.sendResponseHeaders(200, 100);
            e.getResponseBody().write('a');
            e.getResponseBody().flush();
            released.await(3, TimeUnit.SECONDS);
            e.getResponseBody().write(new byte[99]);
          } catch (Exception ignored) {
          } finally {
            e.close();
          }
        });
    server.start();
    try (var client = HttpClient.newHttpClient()) {
      var request =
          HttpRequest.newBuilder(
                  URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/"))
              .timeout(Duration.ofMillis(250))
              .build();
      long started = System.nanoTime();
      assertThrows(HttpTimeoutException.class, () -> GovHttp.send(client, request, 65536));
      assertTrue(Duration.ofNanos(System.nanoTime() - started).toMillis() < 1500);
    } finally {
      released.countDown();
      server.stop(0);
    }
  }

  @Test
  void sizeCapCancelsOversizedResponseAndAllowsExactLimit() throws Exception {
    var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext(
        "/",
        e -> {
          byte[] body = "12345".getBytes();
          e.sendResponseHeaders(200, body.length);
          e.getResponseBody().write(body);
          e.close();
        });
    server.start();
    try (var client = HttpClient.newHttpClient()) {
      var request =
          HttpRequest.newBuilder(
                  URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/"))
              .timeout(Duration.ofSeconds(2))
              .build();
      assertThrows(java.io.IOException.class, () -> GovHttp.send(client, request, 4));
      assertEquals("12345", new String(GovHttp.send(client, request, 5).body()));
    } finally {
      server.stop(0);
    }
  }
}
