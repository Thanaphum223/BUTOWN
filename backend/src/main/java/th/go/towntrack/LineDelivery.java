package th.go.towntrack;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@EnableScheduling
public class LineDelivery {
  final Db db;
  final String token;
  final ObjectMapper json;
  final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

  public LineDelivery(Db d, ObjectMapper j, @Value("${LINE_CHANNEL_ACCESS_TOKEN:}") String t) {
    db = d;
    json = j;
    token = t;
  }

  @Scheduled(fixedDelay = 15000)
  @Transactional
  public void deliver() {
    if (token.isBlank()) return;
    var jobs =
        db.list(
            "SELECT d.*,n.message,u.external_id FROM notification_delivery d JOIN notification n ON"
                + " n.id=d.notification_id JOIN app_user u ON u.id=n.user_id WHERE"
                + " d.state='PENDING' AND d.next_attempt<=now() ORDER BY d.next_attempt LIMIT 5 FOR"
                + " UPDATE OF d SKIP LOCKED");
    for (var job : jobs) {
      try {
        String external = (String) job.get("external_id");
        var req =
            HttpRequest.newBuilder(URI.create("https://api.line.me/v2/bot/message/push"))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + token)
                .header("X-Line-Retry-Key", job.get("idempotency_key").toString())
                .POST(
                    HttpRequest.BodyPublishers.ofString(
                        json.writeValueAsString(
                            Map.of(
                                "to",
                                external.substring(5),
                                "messages",
                                List.of(Map.of("type", "text", "text", job.get("message")))))))
                .build();
        int status = http.send(req, HttpResponse.BodyHandlers.discarding()).statusCode();
        if (status == 200 || status == 409)
          db.run(
              "UPDATE notification_delivery SET state='SENT',sent_at=now(),last_error=NULL WHERE"
                  + " notification_id=?",
              job.get("notification_id"));
        else fail(job, "HTTP " + status);
      } catch (Exception e) {
        if (e instanceof InterruptedException) Thread.currentThread().interrupt();
        fail(job, "Delivery unavailable");
      }
    }
  }

  void fail(Map<String, Object> job, String error) {
    int n = ((Number) job.get("attempts")).intValue() + 1;
    db.run(
        "UPDATE notification_delivery SET attempts=?,state=?,last_error=?,next_attempt=now()+(? *"
            + " interval '1 minute') WHERE notification_id=?",
        n,
        n >= 6 ? "FAILED" : "PENDING",
        error,
        Math.min(60, 1 << n),
        job.get("notification_id"));
  }
}
