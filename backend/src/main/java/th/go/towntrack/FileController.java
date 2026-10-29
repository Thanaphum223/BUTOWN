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

  void scan(byte[] data) throws IOException {
    if (clamHost.isBlank()) {
      if (!dev)
        throw new ResponseStatusException(
            HttpStatus.SERVICE_UNAVAILABLE, "ยังไม่ได้ตั้งค่าระบบตรวจไฟล์");
      return;
    }
    try (Socket sock = new Socket()) {
      sock.connect(new InetSocketAddress(clamHost, 3310), 5000);
      sock.setSoTimeout(30000);
      var out = new DataOutputStream(sock.getOutputStream());
      out.write(new byte[] {'z', 'I', 'N', 'S', 'T', 'R', 'E', 'A', 'M', 0});
      for (int i = 0; i < data.length; i += 8192) {
        int n = Math.min(8192, data.length - i);
        out.writeInt(n);
        out.write(data, i, n);
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
    byte[] data = f.getBytes();
    if (data.length == 0 || data.length > 10 * 1024 * 1024) throw new IllegalArgumentException();
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
    } else
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "รองรับเฉพาะ PNG, JPEG และ PDF ที่ถูกต้อง");
    scan(data);
    UUID fileId = UUID.randomUUID();
    String key = fileId + ext;
    String name =
        Optional.ofNullable(f.getOriginalFilename())
            .orElse("attachment" + ext)
            .replaceAll("[\\/\r\n]", "_");
    if (name.length() > 200) name = name.substring(0, 200) + ext;
    Path dest = root.resolve(key);
    Files.write(dest, data, StandardOpenOption.CREATE_NEW);
    try {
      db.run(
          "INSERT INTO"
              + " attachment(id,complaint_id,uploaded_by,original_name,content_type,size_bytes,sha256,storage_key)"
              + " VALUES(?,?,?,?,?,?,?,?)",
          fileId,
          id,
          u.get("id"),
          name,
          type,
          data.length,
          HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data)),
          key);
    } catch (Exception e) {
      Files.deleteIfExists(dest);
      throw e;
    }
    return Map.of("id", fileId, "name", name);
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
