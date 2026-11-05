package th.go.towntrack;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.util.*;

/** Synthetic loopback HTTP provider for browser regressions; never included in a release jar. */
final class BrowserRoadProvider implements AutoCloseable {
  final HttpServer server;

  BrowserRoadProvider() throws Exception {
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    var json = new ObjectMapper();
    server.createContext(
        "/",
        exchange -> {
          try {
            String path = exchange.getRequestURI().getPath();
            var points =
                Arrays.stream(path.substring(path.lastIndexOf('/') + 1).split(";"))
                    .map(p -> Arrays.stream(p.split(",")).map(Double::valueOf).toList())
                    .toList();
            Object body;
            if (path.startsWith("/table/")) {
              double[][] matrix = new double[points.size()][points.size()];
              for (int i = 0; i < points.size(); i++)
                for (int j = 0; j < points.size(); j++)
                  matrix[i][j] =
                      i == j ? 0 : distance(points.get(i), points.get(j)) / 10 + Math.abs(j - i);
              body = Map.of("code", "Ok", "durations", matrix);
            } else if (path.startsWith("/route/")) {
              double meters = 0;
              for (int i = 1; i < points.size(); i++)
                meters += distance(points.get(i - 1), points.get(i));
              body =
                  Map.of(
                      "code",
                      "Ok",
                      "routes",
                      List.of(
                          Map.of(
                              "distance",
                              meters,
                              "duration",
                              meters / 10,
                              "geometry",
                              Map.of("type", "LineString", "coordinates", points))));
            } else {
              exchange.sendResponseHeaders(404, -1);
              return;
            }
            byte[] bytes = json.writeValueAsBytes(body);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
          } catch (Exception failure) {
            exchange.sendResponseHeaders(400, -1);
          } finally {
            exchange.close();
          }
        });
    server.start();
  }

  double distance(List<Double> a, List<Double> b) {
    return Math.hypot((a.get(0) - b.get(0)) * 108000, (a.get(1) - b.get(1)) * 111000);
  }

  String base() {
    return "http://127.0.0.1:" + server.getAddress().getPort();
  }

  public void close() {
    server.stop(0);
  }
}
