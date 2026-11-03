package th.go.towntrack;

import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class PrivacyController {
  final Db db;
  final Access access;
  final String version, notice;

  public PrivacyController(
      Db db,
      Access access,
      @Value("${PRIVACY_NOTICE_VERSION:local-test-v1}") String version,
      @Value(
              "${PRIVACY_NOTICE_TEXT:ใช้ข้อมูลบัญชีและรายละเอียดคำร้องเพื่อรับเรื่อง ประสานงาน ติดตามและแจ้งผลการแก้ไข เผยแพร่เฉพาะข้อมูลสรุปและตำแหน่งโดยประมาณ การใช้ GPS ขออนุญาตแยกต่างหาก ประกาศนี้สำหรับทดสอบ หน่วยงานต้องกำหนดผู้ควบคุมข้อมูล ฐานการประมวลผล ระยะเก็บรักษา และช่องทางใช้สิทธิก่อนเปิดบริการจริง}")
          String notice) {
    this.db = db;
    this.access = access;
    this.version = version;
    this.notice = notice;
  }

  @GetMapping("/privacy")
  public Object notice(Authentication a) {
    var u = access.user(a);
    return Map.of(
        "version",
        version,
        "text",
        notice,
        "acknowledged",
        !db.list(
                "SELECT user_id FROM privacy_acknowledgement WHERE user_id=? AND notice_version=?",
                u.get("id"),
                version)
            .isEmpty());
  }

  @PostMapping("/users/pdpa-consent")
  public Object acknowledge(@RequestBody Map<String, String> body, Authentication a) {
    var u = access.user(a);
    if (!version.equals(body.get("version")))
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "ประกาศเปลี่ยนแล้ว กรุณาอ่านฉบับล่าสุด");
    db.run(
        "INSERT INTO privacy_acknowledgement(user_id,notice_version) VALUES(?,?) ON CONFLICT DO NOTHING",
        u.get("id"),
        version);
    return Map.of("ok", true);
  }

  @GetMapping("/municipal-center")
  public Object center(Authentication a) {
    return db.one(
        "SELECT name,center_latitude latitude,center_longitude longitude FROM municipality WHERE id=?",
        access.user(a).get("municipality_id"));
  }
}
