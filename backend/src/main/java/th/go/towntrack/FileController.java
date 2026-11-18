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
  static final long MAX_TOTAL_BYTES = 1_000_000_000L;
  final Db db;
  final Access access;
  final Path root;
  final String clamHost;
  final boolean dev;

  @org.springframework.beans.factory.annotation.Autowired(required = false)
  ObjectStorage objectStorage;

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

  public Path rootPath() {
    return root;
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
  public Object uploadStaged(
      @PathVariable UUID id,
      @RequestParam("file") MultipartFile f,
      @RequestParam(defaultValue = "GENERAL") String evidenceStage,
      Authentication a)
      throws Exception {
    if (!List.of("GENERAL", "BEFORE", "AFTER").contains(evidenceStage))
      throw new IllegalArgumentException();
    var u = access.user(a);
    if (!evidenceStage.equals("GENERAL") && !u.get("role").equals("FIELD")) Access.deny();
    var result = (Map<?, ?>) upload(id, f, a, evidenceStage.equals("BEFORE"));
    if (!evidenceStage.equals("GENERAL")) {
      var saved = db.one("SELECT content_type FROM attachment WHERE id=?", result.get("id"));
      if (!saved.get("content_type").toString().startsWith("image/"))
        throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST, "หลักฐาน BEFORE/AFTER ต้องเป็นภาพถ่าย");
    }
    db.run("UPDATE attachment SET evidence_stage=? WHERE id=?", evidenceStage, result.get("id"));
    return result;
  }

  @Transactional
  public Object upload(
      @PathVariable UUID id, @RequestParam("file") MultipartFile f, Authentication a)
      throws Exception {
    return upload(id, f, a, false);
  }

  Object upload(UUID id, MultipartFile f, Authentication a, boolean startPhoto) throws Exception {
    var u = access.user(a);
    var c = access.complaint(id, u, true);
    String r = (String) u.get("role"), s = (String) c.get("status");
    boolean allowed =
        switch (r) {
          case "CITIZEN" -> s.equals("NEW");
          case "OFFICER", "ADMIN" -> true;
          case "LEADER" -> List.of("RESOURCE_DRAFT", "RESOURCE_REVISION").contains(s);
          // Before starting, field staff may only add the site photo that START requires.
          case "FIELD" ->
              List.of("IN_PROGRESS", "FIELD_REVISION").contains(s)
                  || (startPhoto && List.of("ACCEPTED", "READY").contains(s));
          default -> false;
        };
    if (!allowed) Access.deny();
    // Serialize uploads to the same complaint so concurrent files cannot exceed the quota.
    db.one("SELECT id FROM complaint WHERE id=? FOR UPDATE", id);
    long used =
        ((Number)
                db.one(
                        "SELECT COALESCE(SUM(size_bytes),0) used FROM attachment WHERE complaint_id=?",
                        id)
                    .get("used"))
            .longValue();
    long size = f.getSize();
    if (size <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ไฟล์ต้องไม่ว่าง");
    if (size > MAX_TOTAL_BYTES || used > MAX_TOTAL_BYTES - size)
      throw new ResponseStatusException(
          HttpStatus.PAYLOAD_TOO_LARGE, "ไฟล์แนบรวมทั้งหมดต่อคำร้องต้องไม่เกิน 1 GB (1,000 MB)");
    byte[] data;
    try (InputStream input = f.getInputStream()) {
      data = input.readNBytes(4096);
    }
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
    } else if (data.length >= 16
        && ascii(data, 4, 4).equals("ftyp")
        && List.of(
                "isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "M4V ",
                "MSNV", "dash", "qt  ")
            .contains(ascii(data, 8, 4))) {
      boolean quicktime = ascii(data, 8, 4).equals("qt  ");
      type = quicktime ? "video/quicktime" : "video/mp4";
      ext = quicktime ? ".mov" : ".mp4";
    } else if (data.length >= 16
        && data[0] == 0x1a
        && data[1] == 0x45
        && data[2] == (byte) 0xdf
        && data[3] == (byte) 0xa3
        && ascii(data, 0, data.length).contains("webm")) {
      type = "video/webm";
      ext = ".webm";
    } else
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST,
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
            throw new ResponseStatusException(
                HttpStatus.PAYLOAD_TOO_LARGE,
                "ไฟล์แนบรวมทั้งหมดต่อคำร้องต้องไม่เกิน 1 GB (1,000 MB)");
          digest.update(buffer, 0, n);
          output.write(buffer, 0, n);
        }
        if (written != size) throw new IOException("Incomplete upload");
      }
      scan(dest);
      if (objectStorage != null && objectStorage.enabled()) objectStorage.put(key, dest, type);
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
      if (objectStorage != null && objectStorage.enabled()) {
        try {
          objectStorage.delete(key);
        } catch (Exception ignored) {
        }
      }
      throw e;
    }
    boolean cloud = objectStorage != null && objectStorage.enabled();
    if (cloud) db.run("UPDATE attachment SET storage_provider='s3' WHERE id=?", fileId);
    if (org.springframework.transaction.support.TransactionSynchronizationManager
        .isSynchronizationActive())
      org.springframework.transaction.support.TransactionSynchronizationManager
          .registerSynchronization(
              new org.springframework.transaction.support.TransactionSynchronization() {
                public void afterCompletion(int status) {
                  if (status == STATUS_COMMITTED && cloud) {
                    try {
                      Files.deleteIfExists(dest);
                    } catch (IOException ignored) {
                    }
                  }
                  if (status != STATUS_COMMITTED) {
                    if (cloud) {
                      try {
                        objectStorage.delete(key);
                      } catch (Exception ignored) {
                      }
                    }
                    try {
                      Files.deleteIfExists(dest);
                    } catch (IOException ignored) {
                    }
                  }
                }
              });
    createThumbnail(fileId, dest, type, cloud);
    return Map.of("id", fileId, "name", name);
  }

  void createThumbnail(UUID fileId, Path original, String type, boolean cloud) throws IOException {
    if (!type.startsWith("image/")) return;
    java.awt.image.BufferedImage image;
    try (var in = javax.imageio.ImageIO.createImageInputStream(original.toFile())) {
      var readers = javax.imageio.ImageIO.getImageReaders(in);
      if (!readers.hasNext()) return;
      var reader = readers.next();
      try {
        reader.setInput(in);
        long pixels = (long) reader.getWidth(0) * reader.getHeight(0);
        if (pixels > 20000000) return;
        image = reader.read(0);
      } finally {
        reader.dispose();
      }
    } catch (IOException e) {
      return;
    }
    double scale = Math.min(1, Math.min(640.0 / image.getWidth(), 400.0 / image.getHeight()));
    var thumb =
        new java.awt.image.BufferedImage(
            Math.max(1, (int) (image.getWidth() * scale)),
            Math.max(1, (int) (image.getHeight() * scale)),
            java.awt.image.BufferedImage.TYPE_INT_RGB);
    var graphics = thumb.createGraphics();
    graphics.setColor(java.awt.Color.WHITE);
    graphics.fillRect(0, 0, thumb.getWidth(), thumb.getHeight());
    graphics.drawImage(image, 0, 0, thumb.getWidth(), thumb.getHeight(), null);
    graphics.dispose();
    String key = UUID.randomUUID() + "-thumb.jpg";
    Path path = root.resolve(key);
    javax.imageio.ImageIO.write(thumb, "jpg", path.toFile());
    if (org.springframework.transaction.support.TransactionSynchronizationManager
        .isSynchronizationActive())
      org.springframework.transaction.support.TransactionSynchronizationManager
          .registerSynchronization(
              new org.springframework.transaction.support.TransactionSynchronization() {
                public void afterCompletion(int status) {
                  if (status != STATUS_COMMITTED || cloud) {
                    try {
                      Files.deleteIfExists(path);
                    } catch (IOException ignored) {
                    }
                  }
                  if (status != STATUS_COMMITTED && cloud) {
                    try {
                      objectStorage.delete(key);
                    } catch (Exception ignored) {
                    }
                  }
                }
              });
    if (cloud) objectStorage.put(key, path, "image/jpeg");
    db.run(
        "UPDATE attachment SET thumbnail_key=?,thumbnail_size=? WHERE id=?",
        key,
        Files.size(path),
        fileId);
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
    if ("s3".equals(f.get("storage_provider"))) {
      return ResponseEntity.ok()
          .header(
              HttpHeaders.CONTENT_DISPOSITION,
              ContentDisposition.attachment()
                  .filename(
                      (String) f.get("original_name"), java.nio.charset.StandardCharsets.UTF_8)
                  .build()
                  .toString())
          .header("Cache-Control", "private, no-store")
          .header("X-Content-Type-Options", "nosniff")
          .contentType(MediaType.parseMediaType(f.get("content_type").toString()))
          .contentLength(((Number) f.get("size_bytes")).longValue())
          .body(
              new org.springframework.core.io.InputStreamResource(
                  objectStorage.get(f.get("storage_key").toString())));
    }
    Path p = root.resolve((String) f.get("storage_key")).normalize();
    if (!p.startsWith(root)) Access.deny();
    if (!Files.isRegularFile(p))
      throw new ResponseStatusException(
          HttpStatus.NOT_FOUND, "ไม่พบไฟล์เอกสาร กรุณาติดต่อเจ้าหน้าที่");
    return ResponseEntity.ok()
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment()
                .filename((String) f.get("original_name"), java.nio.charset.StandardCharsets.UTF_8)
                .build()
                .toString())
        .header("X-Content-Type-Options", "nosniff")
        .header("Cache-Control", "private, no-store")
        .contentType(MediaType.parseMediaType(f.get("content_type").toString()))
        .body(new FileSystemResource(p));
  }
}
