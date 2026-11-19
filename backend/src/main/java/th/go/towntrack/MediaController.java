package th.go.towntrack;

import java.io.*;
import java.nio.file.*;
import java.util.*;
import org.springframework.core.io.*;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class MediaController {
  final Db db;
  final Access access;
  final FileController files;
  final ObjectStorage storage;
  final EvidenceMedia evidence;

  MediaController(
      Db db, Access access, FileController files, ObjectStorage storage, EvidenceMedia evidence) {
    this.db = db;
    this.access = access;
    this.files = files;
    this.storage = storage;
    this.evidence = evidence;
  }

  @GetMapping("/media/{id}")
  public ResponseEntity<?> preview(
      @PathVariable UUID id,
      @RequestParam(defaultValue = "false") boolean thumbnail,
      @RequestHeader(value = "Range", required = false) String range,
      Authentication auth)
      throws IOException {
    var u = access.user(auth);
    var f =
        db.one(
            "SELECT a.*,c.municipality_id,c.external_id FROM attachment a JOIN complaint c ON c.id=a.complaint_id WHERE a.id=? AND c.municipality_id=?",
            id,
            u.get("municipality_id"));
    if ("CITIZEN".equals(u.get("role"))) {
      if (!evidence.citizenCanView(id, u)) Access.deny();
    } else access.complaint((UUID) f.get("complaint_id"), u, false);
    String type = f.get("content_type").toString();
    if (!type.startsWith("image/") && !type.startsWith("video/") && !type.equals("application/pdf"))
      throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    // Chrome and Android refuse video/quicktime, but iPhone MOV clips are the same ISO container as
    // MP4, so labelling them MP4 lets every browser play them inline.
    if (type.equals("video/quicktime")) type = "video/mp4";
    String key = f.get("storage_key").toString();
    boolean thumb = thumbnail && f.get("thumbnail_key") != null;
    if (thumb) {
      key = f.get("thumbnail_key").toString();
      type = "image/jpeg";
    }
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.parseMediaType(type));
    headers.setCacheControl("private, no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Accept-Ranges", "bytes");
    headers.setContentDisposition(
        type.equals("application/pdf")
            ? ContentDisposition.attachment()
                .filename((String) f.get("original_name"), java.nio.charset.StandardCharsets.UTF_8)
                .build()
            : ContentDisposition.inline().build());
    if ("s3".equals(f.get("storage_provider"))) {
      long size = ((Number) f.get(thumb ? "thumbnail_size" : "size_bytes")).longValue();
      if (range != null) {
        List<HttpRange> ranges;
        try {
          ranges = HttpRange.parseRanges(range);
        } catch (IllegalArgumentException e) {
          return ResponseEntity.status(416).header("Content-Range", "bytes */" + size).build();
        }
        if (ranges.size() != 1) return ResponseEntity.status(416).build();
        long start = ranges.getFirst().getRangeStart(size),
            end = ranges.getFirst().getRangeEnd(size);
        if (start >= size || start > end)
          return ResponseEntity.status(416).header("Content-Range", "bytes */" + size).build();
        headers.set("Content-Range", "bytes " + start + "-" + end + "/" + size);
        headers.setContentLength(end - start + 1);
        return new ResponseEntity<>(
            new InputStreamResource(storage.get(key, start, end)),
            headers,
            HttpStatus.PARTIAL_CONTENT);
      }
      headers.setContentLength(size);
      return new ResponseEntity<>(
          new InputStreamResource(storage.get(key)), headers, HttpStatus.OK);
    }
    Path path = files.rootPath().resolve(key).normalize();
    if (!path.startsWith(files.rootPath())) Access.deny();
    if (!Files.exists(path))
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "ไม่พบไฟล์หลักฐาน");
    return new ResponseEntity<>(new FileSystemResource(path), headers, HttpStatus.OK);
  }

  @PostMapping("/complaints/{id}/shared-media")
  @Transactional(rollbackFor = Exception.class)
  public Object publish(
      @PathVariable UUID id,
      @RequestParam UUID sourceId,
      @RequestParam boolean confirmedClean,
      @RequestParam("file") MultipartFile file,
      Authentication auth)
      throws Exception {
    var u = access.user(auth);
    access.role(u, "OFFICER", "ADMIN");
    access.complaint(id, u, true);
    if (!confirmedClean)
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "กรุณายืนยันว่าตรวจและปกปิดข้อมูลส่วนบุคคลแล้ว");
    var original =
        db.one(
            "SELECT id,evidence_stage FROM attachment WHERE id=? AND complaint_id=? AND public_copy_of IS NULL",
            sourceId,
            id);
    var created = (Map<?, ?>) files.upload(id, file, auth);
    UUID copy = (UUID) created.get("id");
    var saved =
        db.one("SELECT content_type,storage_key,storage_provider FROM attachment WHERE id=?", copy);
    String type = saved.get("content_type").toString();
    if (!type.startsWith("image/") && !type.startsWith("video/"))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "เผยแพร่ได้เฉพาะภาพหรือวิดีโอ");
    db.run(
        "UPDATE attachment SET public_approved=true,public_copy_of=?,evidence_stage=? WHERE id=?",
        sourceId,
        original.get("evidence_stage"),
        copy);
    db.run(
        "INSERT INTO audit_event(id,complaint_id,municipality_id,actor_id,action,reason,details) VALUES(?,?,?,?,?,'ตรวจและอนุญาตสำเนาที่ปกปิดข้อมูลแล้ว',jsonb_build_object('sourceId',?::text,'copyId',?::text))",
        UUID.randomUUID(),
        id,
        u.get("municipality_id"),
        u.get("id"),
        "PUBLISH_EVIDENCE",
        sourceId.toString(),
        copy.toString());
    return Map.of("id", copy);
  }

  @DeleteMapping("/complaints/{id}/shared-media/{copy}")
  public Object unpublish(@PathVariable UUID id, @PathVariable UUID copy, Authentication auth) {
    var u = access.user(auth);
    access.role(u, "OFFICER", "ADMIN");
    access.complaint(id, u, false);
    db.run(
        "UPDATE attachment SET public_approved=false WHERE id=? AND complaint_id=? AND public_copy_of IS NOT NULL",
        copy,
        id);
    return Map.of("ok", true);
  }
}
