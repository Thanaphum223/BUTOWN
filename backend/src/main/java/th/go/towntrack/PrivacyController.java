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
              "${PRIVACY_NOTICE_TEXT:ประกาศคุ้มครองข้อมูลส่วนบุคคล เทศบาลทดสอบ TownTrack (ผู้ควบคุมข้อมูลส่วนบุคคล): ระบบจัดเก็บข้อมูลบัญชี รายละเอียดคำร้อง หลักฐานประกอบ และข้อมูลติดต่อเท่าที่จำเป็นเพื่อการรับเรื่อง ประสานงาน ติดตาม และแจ้งผลการแก้ไขปัญหาสาธารณะตามฐานภารกิจเพื่อประโยชน์สาธารณะ (พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562) โดยจะไม่เผยแพร่ชื่อ เบอร์โทร อีเมล หรือไฟล์ต้นฉบับต่อสาธารณะ การเข้าถึงพิกัด GPS จะขอความยินยอมแยกต่างหากและท่านสามารถปฏิเสธหรือถอนความยินยอมได้ภายหลัง ข้อมูลจะถูกเก็บรักษาตามระยะเวลาที่ระเบียบงานสารบรรณกำหนด ท่านสามารถขอใช้สิทธิเข้าถึง แก้ไข หรือลบข้อมูลได้ที่เจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล (DPO) เทศบาลทดสอบ TownTrack อีเมล dpo@towntrack-demo.go.th}")
          String notice) {
    this.db = db;
    this.access = access;
    this.version = version;
    this.notice = notice;
  }

  @GetMapping("/privacy")
  public Object notice(Authentication a) {
    var u = access.user(a);
    var decision =
        db.list(
            "SELECT consented FROM privacy_acknowledgement WHERE user_id=? AND notice_version=?",
            u.get("id"),
            version);
    return Map.of(
        "version",
        version,
        "text",
        notice,
        "acknowledged",
        !decision.isEmpty(),
        "consented",
        !decision.isEmpty() && Boolean.TRUE.equals(decision.get(0).get("consented")));
  }

  @PostMapping("/users/pdpa-consent")
  public Object acknowledge(@RequestBody Map<String, Object> body, Authentication a) {
    var u = access.user(a);
    if (!version.equals(body.get("version")))
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "ประกาศเปลี่ยนแล้ว กรุณาอ่านฉบับล่าสุด");
    // Older clients send only the version, which means they accepted the notice.
    Object consent = body.getOrDefault("consent", true);
    if (!(consent instanceof Boolean consented)) throw new IllegalArgumentException();
    db.run(
        "INSERT INTO privacy_acknowledgement(user_id,notice_version,consented) VALUES(?,?,?)"
            + " ON CONFLICT(user_id,notice_version) DO UPDATE SET consented=EXCLUDED.consented,"
            + " acknowledged_at=now()",
        u.get("id"),
        version,
        consented);
    return Map.of("ok", true, "consented", consented);
  }

  @GetMapping("/municipal-center")
  public Object center(Authentication a) {
    return db.one(
        "SELECT name,center_latitude latitude,center_longitude longitude FROM municipality WHERE id=?",
        access.user(a).get("municipality_id"));
  }
}
