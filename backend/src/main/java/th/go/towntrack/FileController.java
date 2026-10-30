package th.go.towntrack;

import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class FileController {
  static final long MAX_TOTAL_BYTES = 1024L * 1024 * 1024;
  final Db db;
  final Access access;
  final Path root;
  final String clamHost;
  final boolean dev;

  public FileController(
      Db d,
      Access a,
      @Value("${towntrack.files}") String r,
      @Value("${CLAMAV_HOST:}") String host,
      @Value("${DEV_UNSCANNED_FILES:false}") boolean dev)
      throws IOException {
    db = d;
    access = a;
    root = Path.of(r).toAbsolutePath().normalize();
    Files.createDirectories(root);
    clamHost = host;
    this.dev = dev;
  }

  void scan(Path file) throws IOException {
    if (clamHost.isBlank()) {
      if (!dev)
        throw new ResponseStatusException(
            HttpStatus.SERVICE_UNAVAILABLE, "ยังไม่ได้ตั้งค่าระบบตรวจไฟล์");
      return;
    }
    try (Socket sock = new Socket()) {
      sock.connect(new InetSocketAddress(clamHost, 3310), 5000);
      sock.setSoTimeout(600000);
      var out = new DataOutputStream(sock.getOutputStream());
      out.write(new byte[] {'z', 'I', 'N', 'S', 'T', 'R', 'E', 'A', 'M', 0});
      try (InputStream input = Files.newInputStream(file)) {
        byte[] buffer = new byte[64 * 1024];
        int n;
        while ((n = input.read(buffer)) != -1) {
          out.writeInt(n);
          out.write(buffer, 0, n);
        }
      }
      out.writeInt(0);
      out.flush();
      var response = new ByteArrayOutputStream();
      int ch;
      while ((ch = sock.getInputStream().read()) > 0 && response.size() < 2048) response.write(ch);
      if (!response.toString(java.nio.charset.StandardCharsets.UTF_8).endsWith("OK"))
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ไฟล์ไม่ผ่านการตรวจสอบ");
    }
  }

  @PostMapping("/complaints/{id}/files")
  @Transactional
  public Object upload(
      @PathVariable UUID id, @RequestParam("file") MultipartFile f, Authentication a)
      throws Exception {
    var u = access.user(a);
    var c = access.complaint(id, u, true);
    String r = (String) u.get("role"), s = (String) c.get("status");
    boolean allowed =
        switch (r) {
          case "CITIZEN" -> s.equals("NEW");
          case "LEADER" -> List.of("RESOURCE_DRAFT", "RESOURCE_REVISION").contains(s);
          case "FIELD" -> List.of("IN_PROGRESS", "FIELD_REVISION").contains(s);
          default -> false;
        };
    if (!allowed) Access.deny();
    // Serialize uploads to the same complaint so concurrent files cannot exceed the quota.
    db.one("SELECT id FROM complaint WHERE id=? FOR UPDATE", id);
    long used = ((Number) db.one(
        "SELECT COALESCE(SUM(size_bytes),0) used FROM attachment WHERE complaint_id=?", id)
        .get("used")).longValue();
    long size = f.getSize();
    if (size <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ไฟล์ต้องไม่ว่าง");
    if (size > MAX_TOTAL_BYTES || used > MAX_TOTAL_BYTES - size)
      throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,
          "ไฟล์แนบรวมทั้งหมดต่อคำร้องต้องไม่เกิน 1 GB (1024 MB)");
    byte[] data;
    try (InputStream input = f.getInputStream()) { data = input.readNBytes(4096); }
    String type;
    String ext;
    if (data.length > 8
        && data[0] == (byte) 137
        && data[1] == 80
        && data[2] == 78
        && data[3] == 71) {
      type = "image/png";
      ext = ".png";
    } else if (data.length > 3
        && data[0] == (byte) 255
        && data[1] == (byte) 216
        && data[2] == (byte) 255) {
      type = "image/jpeg";
      ext = ".jpg";
    } else if (data.length > 5
        && new String(data, 0, 5, java.nio.charset.StandardCharsets.US_ASCII).equals("%PDF-")) {
      type = "application/pdf";
      ext = ".pdf";
    } else if (data.length >= 16 && ascii(data, 4, 4).equals("ftyp")
        && List.of("isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42",
            "avc1", "M4V ", "MSNV", "dash", "qt  ").contains(ascii(data, 8, 4))) {
      boolean quicktime = ascii(data, 8, 4).equals("qt  ");
      type = quicktime ? "video/quicktime" : "video/mp4";
      ext = quicktime ? ".mov" : ".mp4";
    } else if (data.length >= 16 && data[0] == 0x1a && data[1] == 0x45
        && data[2] == (byte) 0xdf && data[3] == (byte) 0xa3
        && ascii(data, 0, data.length).contains("webm")) {
      type = "video/webm";
      ext = ".webm";
    } else
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
          "รองรับ PNG, JPEG, PDF และวิดีโอ MP4, MOV, WebM ที่มีรูปแบบไฟล์ถูกต้อง");
    UUID fileId = UUID.randomUUID();
    String key = fileId + ext;
    String name =
        Optional.ofNullable(f.getOriginalFilename())
            .orElse("attachment" + ext)
            .replaceAll("[\\/\r\n]", "_");
    if (name.length() > 200) name = name.substring(0, 200) + ext;
    Path dest = root.resolve(key);
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    try {
      try (InputStream input = f.getInputStream();
          OutputStream output = Files.newOutputStream(dest, StandardOpenOption.CREATE_NEW)) {
        byte[] buffer = new byte[64 * 1024];
        long written = 0;
        int n;
        while ((n = input.read(buffer)) != -1) {
          written += n;
          if (written > size || used > MAX_TOTAL_BYTES - written)
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,
                "ไฟล์แนบรวมทั้งหมดต่อคำร้องต้องไม่เกิน 1 GB (1024 MB)");
          digest.update(buffer, 0, n);
          output.write(buffer, 0, n);
        }
        if (written != size) throw new IOException("Incomplete upload");
      }
      scan(dest);
      db.run(
          "INSERT INTO"
              + " attachment(id,complaint_id,uploaded_by,original_name,content_type,size_bytes,sha256,storage_key)"
              + " VALUES(?,?,?,?,?,?,?,?)",
          fileId,
          id,
          u.get("id"),
          name,
          type,
          size,
          HexFormat.of().formatHex(digest.digest()),
          key);
    } catch (Exception e) {
      Files.deleteIfExists(dest);
      throw e;
    }
    if (org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive())
      org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
          new org.springframework.transaction.support.TransactionSynchronization() {
            public void afterCompletion(int status) {
              if (status != STATUS_COMMITTED) {
                try { Files.deleteIfExists(dest); } catch (IOException ignored) {}
              }
            }
          });
    return Map.of("id", fileId, "name", name);
  }

  static String ascii(byte[] data, int offset, int length) {
    return new String(data, offset, length, java.nio.charset.StandardCharsets.US_ASCII);
  }

  @GetMapping("/files/{id}")
  public ResponseEntity<?> download(@PathVariable UUID id, Authentication a) {
    var u = access.user(a);
    var f = db.one("SELECT * FROM attachment WHERE id=?", id);
    access.complaint((UUID) f.get("complaint_id"), u, false);
    if (u.get("role").equals("CITIZEN") && !u.get("id").equals(f.get("uploaded_by"))) Access.deny();
    Path p = root.resolve((String) f.get("storage_key")).normalize();
    if (!p.startsWith(root)) Access.deny();
    return ResponseEntity.ok()
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment()
                .filename((String) f.get("original_name"), java.nio.charset.StandardCharsets.UTF_8)
                .build()
                .toString())
        .header("X-Content-Type-Options", "nosniff")
        .cacheControl(CacheControl.noStore())
        .contentType(MediaType.APPLICATION_OCTET_STREAM)
        .body(new FileSystemResource(p));
  }
}
