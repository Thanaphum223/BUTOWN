package th.go.towntrack;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.server.ResponseStatusException;

class FileScanTest {
  @TempDir Path directory;
  ServerSocket clamd;
  final ExecutorService server = Executors.newSingleThreadExecutor();

  @AfterEach
  void stop() throws IOException {
    server.shutdownNow();
    if (clamd != null) clamd.close();
  }

  FileController scanner(int port) throws IOException {
    var files =
        new FileController(
            mock(Db.class), mock(Access.class), directory.toString(), "127.0.0.1", false) {
          @Override
          long scanMillis(long bytes) {
            return 1500;
          }
        };
    files.clamPort = port;
    return files;
  }

  /** A clamd stand-in that reads the stream and answers, or never answers when reply is null. */
  int fake(String reply, boolean drain) throws IOException {
    clamd = new ServerSocket(0, 1, InetAddress.getLoopbackAddress());
    server.submit(
        () -> {
          try (Socket client = clamd.accept()) {
            if (!drain) {
              Thread.sleep(60_000);
              return null;
            }
            var in = new DataInputStream(client.getInputStream());
            in.readNBytes(10);
            for (int n; (n = in.readInt()) > 0; ) in.readNBytes(n);
            if (reply == null) Thread.sleep(60_000);
            else client.getOutputStream().write((reply + "\0").getBytes());
          }
          return null;
        });
    return clamd.getLocalPort();
  }

  Path file(int bytes) throws IOException {
    return Files.write(directory.resolve("proof.pdf"), new byte[bytes]);
  }

  int status(FileController files, Path file) {
    long started = System.nanoTime();
    var error = assertThrows(ResponseStatusException.class, () -> files.scan(file));
    // Fails within the deadline instead of hanging for ten minutes.
    assertTrue(System.nanoTime() - started < TimeUnit.SECONDS.toNanos(10));
    return error.getStatusCode().value();
  }

  @Test
  void cleanFilesPass() throws Exception {
    scanner(fake("stream: OK", true)).scan(file(1000));
  }

  @Test
  void infectedFilesAreRejected() throws Exception {
    assertEquals(400, status(scanner(fake("stream: Eicar-Signature FOUND", true)), file(1000)));
  }

  @Test
  void aScannerThatNeverAnswersFailsWithinTheDeadline() throws Exception {
    assertEquals(503, status(scanner(fake(null, true)), file(1000)));
  }

  @Test
  void aScannerThatStopsReadingFailsWithinTheDeadline() throws Exception {
    // Larger than the socket buffers, so the upload itself blocks.
    assertEquals(503, status(scanner(fake(null, false)), file(20_000_000)));
  }

  @Test
  void scannerErrorsAndMissingScannersAreNotTreatedAsClean() throws Exception {
    assertEquals(
        503, status(scanner(fake("INSTREAM size limit exceeded. ERROR", true)), file(1000)));
    int closed;
    try (var unused = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
      closed = unused.getLocalPort();
    }
    assertEquals(503, status(scanner(closed), file(1000)));
  }

  @Test
  void deadlinesGrowWithFileSize() throws Exception {
    var files =
        new FileController(mock(Db.class), mock(Access.class), directory.toString(), "", false);
    assertEquals(30_000, files.scanMillis(0));
    assertEquals(75_000, files.scanMillis(15_000_000));
    assertEquals(330_000, files.scanMillis(100_000_000));
  }
}
