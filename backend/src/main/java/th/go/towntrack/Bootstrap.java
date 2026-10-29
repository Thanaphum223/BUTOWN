package th.go.towntrack;

import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class Bootstrap implements CommandLineRunner {
  final Db db;
  final Workflow workflow;
  final PasswordEncoder encoder;
  final String password, demo;

  public Bootstrap(
      Db d,
      Workflow w,
      PasswordEncoder e,
      @Value("${towntrack.bootstrap-password}") String p,
      @Value("${DEMO_PASSWORD:}") String demo) {
    db = d;
    workflow = w;
    encoder = e;
    password = p;
    this.demo = demo;
  }

  @Transactional
  public void run(String... args) {
    if (!db.list("SELECT id FROM municipality LIMIT 1").isEmpty()) return;
    if (password.length() < 16)
      throw new IllegalStateException(
          "First startup requires BOOTSTRAP_PASSWORD of at least 16 characters");
    UUID m = UUID.randomUUID(), dept = UUID.randomUUID();
    db.run(
        "INSERT INTO municipality(id,name) VALUES(?,?)",
        m,
        demo.isBlank() ? "เทศบาล (กรุณาตั้งชื่อในระบบ)" : "เทศบาลทดสอบ TownTrack");
    db.run("INSERT INTO department(id,municipality_id,name) VALUES(?,?,'กองช่าง')", dept, m);
    UUID w = workflow.createDefault(m, 1);
    db.run(
        "INSERT INTO category(id,municipality_id,department_id,workflow_id,name,sla_hours)"
            + " VALUES(?,?,?,?,'ถนนและทางเท้า',72)",
        UUID.randomUUID(),
        m,
        dept,
        w);
    for (String category :
        List.of(
            "น้ำรั่ว / น้ำท่วม",
            "รถติด / กีดขวาง",
            "ไฟดับ / ไฟส่องสว่าง",
            "น้ำไม่ไหล / ท่อแตก",
            "ต้นไม้ล้ม",
            "ไฟไหม้ / เหตุฉุกเฉิน",
            "ขอรถกระเช้า"))
      db.run(
          "INSERT INTO category(id,municipality_id,department_id,workflow_id,name,sla_hours)"
              + " VALUES(?,?,?,?,?,72)",
          UUID.randomUUID(),
          m,
          dept,
          w,
          category);
    create(m, dept, "admin", "ผู้ดูแลระบบ", "ADMIN", password);
    if (!demo.isBlank()) {
      if (demo.length() < 16) throw new IllegalStateException("DEMO_PASSWORD too short");
      for (String r : List.of("CITIZEN", "OFFICER", "LEADER", "FIELD", "APPROVER"))
        create(m, dept, r.toLowerCase(), "บัญชีทดสอบ " + r, r, demo);
    }
  }

  void create(UUID m, UUID dept, String username, String name, String role, String password) {
    db.run(
        "INSERT INTO"
            + " app_user(id,municipality_id,department_id,username,password_hash,display_name,role)"
            + " VALUES(?,?,?,?,?,?,?)",
        UUID.randomUUID(),
        m,
        role.equals("CITIZEN") ? null : dept,
        username,
        encoder.encode(password),
        name,
        role);
  }
}
