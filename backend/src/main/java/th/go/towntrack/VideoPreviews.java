package th.go.towntrack;

import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * iPhones record HEVC, which many Android browsers cannot decode. After upload, HEVC clips get an
 * H.264 MP4 rendition stored as the attachment's thumbnail_key, which the in-page player uses;
 * downloads keep the original. Disabled automatically when ffmpeg is not installed.
 */
@Service
public class VideoPreviews {
  static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(VideoPreviews.class);
  final Db db;
  final String ffmpeg, ffprobe;
  final boolean available;
  // One conversion at a time keeps a small server responsive.
  final ExecutorService worker =
      Executors.newSingleThreadExecutor(
          task -> {
            var thread = new Thread(task, "video-previews");
            thread.setDaemon(true);
            return thread;
          });

  VideoPreviews(
      Db db,
      @Value("${VIDEO_PREVIEWS:true}") boolean enabled,
      @Value("${FFMPEG_PATH:ffmpeg}") String ffmpeg,
      @Value("${FFPROBE_PATH:ffprobe}") String ffprobe) {
    this.db = db;
    this.ffmpeg = ffmpeg;
    this.ffprobe = ffprobe;
    available = enabled && runs(ffmpeg) && runs(ffprobe);
    log.info("HEVC video previews {}", available ? "enabled" : "disabled (ffmpeg not found)");
  }

  @jakarta.annotation.PreDestroy
  void close() {
    worker.shutdownNow();
  }

  boolean available() {
    return available;
  }

  /** Takes ownership of {@code source} when {@code cloud} is set: it is deleted afterwards. */
  Future<?> submit(UUID fileId, Path source, ObjectStorage cloud) {
    return worker.submit(() -> convert(fileId, source, cloud));
  }

  void convert(UUID fileId, Path source, ObjectStorage cloud) {
    Path out = source.resolveSibling(fileId + "-preview.mp4");
    try {
      if (!"hevc".equals(codec(source))) return;
      // Only local files are read; -protocol_whitelist stops a crafted file reaching the network.
      exec(
          900,
          ffmpeg,
          "-nostdin",
          "-v",
          "error",
          "-protocol_whitelist",
          "file",
          "-i",
          source.toString(),
          "-map",
          "0:v:0",
          "-map",
          "0:a:0?",
          "-vf",
          "scale='min(1280,iw)':-2",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "26",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-movflags",
          "+faststart",
          "-threads",
          "2",
          "-y",
          out.toString());
      String key = out.getFileName().toString();
      if (cloud != null) cloud.put(key, out, "video/mp4");
      int saved =
          db.run(
              "UPDATE attachment SET thumbnail_key=?,thumbnail_size=? WHERE id=? AND"
                  + " thumbnail_key IS NULL",
              key,
              Files.size(out),
              fileId);
      if (saved == 0) {
        if (cloud != null) cloud.delete(key);
        else Files.deleteIfExists(out);
      }
      if (cloud != null) Files.deleteIfExists(out);
    } catch (Exception e) {
      log.warn("Video preview failed for {}: {}", fileId, e.getMessage());
      try {
        Files.deleteIfExists(out);
      } catch (Exception ignored) {
      }
    } finally {
      if (cloud != null) {
        try {
          Files.deleteIfExists(source);
        } catch (Exception ignored) {
        }
      }
    }
  }

  String codec(Path file) throws Exception {
    return exec(
            30,
            ffprobe,
            "-v",
            "error",
            "-protocol_whitelist",
            "file",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=codec_name",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            file.toString())
        .trim();
  }

  static String exec(long seconds, String... command) throws Exception {
    var process = new ProcessBuilder(command).redirectErrorStream(true).start();
    var output = CompletableFuture.supplyAsync(() -> read(process));
    if (!process.waitFor(seconds, TimeUnit.SECONDS)) {
      process.destroyForcibly();
      throw new TimeoutException(command[0] + " exceeded " + seconds + "s");
    }
    String text = output.get(5, TimeUnit.SECONDS);
    if (process.exitValue() != 0)
      throw new IllegalStateException(
          command[0] + " failed: " + text.substring(0, Math.min(300, text.length())));
    return text;
  }

  static String read(Process process) {
    try (var in = process.getInputStream()) {
      return new String(in.readAllBytes(), StandardCharsets.UTF_8);
    } catch (Exception e) {
      return "";
    }
  }

  static boolean runs(String binary) {
    try {
      exec(30, binary, "-version");
      return true;
    } catch (Exception e) {
      return false;
    }
  }
}
