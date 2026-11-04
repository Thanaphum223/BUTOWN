package th.go.towntrack;

import java.io.*;
import java.net.http.*;
import java.nio.ByteBuffer;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.Flow.Subscription;

/** A deadline must cover the body too: Java 21's request timeout alone stops at headers. */
final class GovHttp {
  private GovHttp() {}

  static HttpResponse<byte[]> send(HttpClient http, HttpRequest request, int limit)
      throws IOException, InterruptedException {
    var pending = http.sendAsync(request, info -> new LimitedBody(limit));
    try {
      return pending.get(request.timeout().orElseThrow().toMillis(), TimeUnit.MILLISECONDS);
    } catch (TimeoutException e) {
      pending.cancel(true);
      throw new HttpTimeoutException("Gov response deadline exceeded");
    } catch (InterruptedException e) {
      pending.cancel(true);
      throw e;
    } catch (ExecutionException e) {
      if (e.getCause() instanceof IOException io) throw io;
      throw new IOException("Invalid Gov response");
    }
  }

  private static final class LimitedBody implements HttpResponse.BodySubscriber<byte[]> {
    final int limit;
    final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    final CompletableFuture<byte[]> result = new CompletableFuture<>();
    Subscription subscription;

    LimitedBody(int limit) {
      this.limit = limit;
    }

    public CompletionStage<byte[]> getBody() {
      return result;
    }

    public void onSubscribe(Subscription subscription) {
      this.subscription = subscription;
      subscription.request(Long.MAX_VALUE);
    }

    public void onNext(List<ByteBuffer> chunks) {
      for (var chunk : chunks) {
        if (chunk.remaining() > limit - bytes.size()) {
          subscription.cancel();
          result.completeExceptionally(new IOException("Gov response exceeds limit"));
          return;
        }
        byte[] data = new byte[chunk.remaining()];
        chunk.get(data);
        bytes.writeBytes(data);
      }
    }

    public void onError(Throwable error) {
      result.completeExceptionally(error);
    }

    public void onComplete() {
      result.complete(bytes.toByteArray());
    }
  }
}
