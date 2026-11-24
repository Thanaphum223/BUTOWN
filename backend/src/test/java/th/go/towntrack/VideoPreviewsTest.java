package th.go.towntrack;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

class VideoPreviewsTest {
  @TempDir Path dir;

  @Test
  void webmFromAndroidBecomesH264WhileMp4IsLeftAlone() throws Exception {
    Assumptions.assumeTrue(VideoPreviews.runs("ffmpeg") && VideoPreviews.runs("ffprobe"));
    var db = mock(Db.class);
    when(db.run(anyString(), any(Object[].class))).thenReturn(1);
    var previews = new VideoPreviews(db, true, "ffmpeg", "ffprobe");
    try {
      for (String[] clip : new String[][] {{"a.webm", "libvpx"}, {"b.webm", "libvpx-vp9"}}) {
        UUID id = UUID.randomUUID();
        previews.convert(id, record(clip[0], clip[1]), null);
        assertEquals("h264", previews.codec(dir.resolve(id + "-preview.mp4")));
      }
      UUID id = UUID.randomUUID();
      previews.convert(id, record("c.mp4", "libx264"), null);
      assertFalse(Files.exists(dir.resolve(id + "-preview.mp4")));
      assertTrue(VideoPreviews.CONVERTED.containsAll(List.of("hevc", "vp8", "vp9", "av1")));
    } finally {
      previews.close();
    }
  }

  Path record(String name, String codec) throws Exception {
    Path file = dir.resolve(name);
    VideoPreviews.exec(
        60,
        "ffmpeg",
        "-nostdin",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc=duration=1:size=64x64:rate=5",
        "-c:v",
        codec,
        "-pix_fmt",
        "yuv420p",
        "-y",
        file.toString());
    return file;
  }
}
