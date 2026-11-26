package th.go.towntrack;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.*;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ComplaintRetentionIntegrationTest {
  static final List<String> CHILDREN =
      List.of(
          "work_order",
          "resource_request",
          "field_report",
          "review",
          "attachment",
          "follower",
          "audit_event",
          "notification",
          "sla_reminder",
          "complaint_vote",
          "department_transfer",
          "route_stop",
          "stock_movement",
          "sla_extension",
          "complaint_message");
  @Autowired MockMvc mvc;
  @Autowired Db db;
  @Autowired Workflow workflow;
  @Autowired ObjectMapper json;
  @Autowired ComplaintRetention retention;
  UUID town, dept, category;
  Map<String, UUID> users = new HashMap<>();
  Map<String, String> names = new HashMap<>();

  @BeforeEach
  void setup() {
    town = UUID.randomUUID();
    dept = UUID.randomUUID();
    category = UUID.randomUUID();
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Retention test town')", town);
    db.run("INSERT INTO department(id,municipality_id,name) VALUES(?,?,'Engineering')", dept, town);
    UUID definition = workflow.createDefault(town, 1);
    db.run(
        "INSERT INTO category(id,municipality_id,department_id,workflow_id,name,sla_hours)"
            + " VALUES(?,?,?,?,'Road',72)",
        category,
        town,
        dept,
        definition);
    for (String role : List.of("CITIZEN", "OFFICER", "LEADER", "FIELD", "APPROVER", "ADMIN")) {
      UUID id = UUID.randomUUID();
      users.put(role, id);
      names.put(role, "retention_" + id);
      db.run(
          "INSERT INTO app_user(id,municipality_id,department_id,username,password_hash,"
              + "display_name,role) VALUES(?,?,?,?,?,?,?)",
          id,
          town,
          Access.departmentRole(role) ? dept : null,
          names.get(role),
          "x",
          "Test " + role,
          role);
    }
    db.run("UPDATE app_user SET stock_keeper=true WHERE id=?", users.get("OFFICER"));
  }

  UUID complaint(String status) {
    UUID id = UUID.randomUUID();
    db.run(
        "INSERT INTO complaint(id,municipality_id,category_id,reporter_id,officer_id,leader_id,"
            + "department_id,workflow_id,title,description,address,status,due_at)"
            + " SELECT ?,?,?,?,?,?,?,workflow_id,'Road case','Original report','Public location',?,"
            + "now()+interval '3 days' FROM category WHERE id=?",
        id,
        town,
        category,
        users.get("CITIZEN"),
        users.get("OFFICER"),
        users.get("LEADER"),
        dept,
        status,
        category);
    return id;
  }

  ResultActions send(String role, String url, Object body) throws Exception {
    return mvc.perform(
        post(url)
            .with(user(names.get(role)))
            .with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(body)));
  }

  ResultActions action(UUID id, String role, String action, Map<String, ?> values)
      throws Exception {
    Map<String, Object> body = new LinkedHashMap<>(values);
    body.put("action", action);
    body.put("version", db.one("SELECT version FROM complaint WHERE id=?", id).get("version"));
    return send(role, "/api/complaints/" + id + "/actions", body);
  }

  ResultActions purge(String role, UUID id, String reason) throws Exception {
    return send(role, "/api/admin/complaints/" + id + "/purge", Map.of("reason", reason));
  }

  void photo(UUID id, String stage) throws Exception {
    var image = new java.awt.image.BufferedImage(2, 2, java.awt.image.BufferedImage.TYPE_INT_RGB);
    var bytes = new java.io.ByteArrayOutputStream();
    javax.imageio.ImageIO.write(image, "png", bytes);
    mvc.perform(
            multipart("/api/complaints/" + id + "/files")
                .file(
                    new MockMultipartFile("file", stage + ".png", "image/png", bytes.toByteArray()))
                .param("evidenceStage", stage)
                .with(user(names.get("FIELD")))
                .with(csrf()))
        .andExpect(status().isOk());
  }

  UUID item(String name, String type) throws Exception {
    var result =
        send(
                "OFFICER",
                "/api/stock",
                Map.of("name", name, "unit", "pcs", "quantity", 10, "itemType", type))
            .andExpect(status().isOk())
            .andReturn();
    return UUID.fromString(
        json.readTree(result.getResponse().getContentAsString()).get("id").asText());
  }

  UUID started(UUID item, int quantity) throws Exception {
    UUID id = complaint("TRIAGED");
    action(id, "LEADER", "ASSIGN", Map.of("assigneeId", users.get("FIELD")))
        .andExpect(status().isOk());
    action(id, "FIELD", "ACCEPT", Map.of()).andExpect(status().isOk());
    photo(id, "BEFORE");
    action(
            id,
            "FIELD",
            "START",
            Map.of("stockItems", List.of(Map.of("stockItemId", item, "quantity", quantity))))
        .andExpect(status().isOk());
    return id;
  }

  UUID closed(UUID item) throws Exception {
    UUID id = started(item, 2);
    photo(id, "AFTER");
    action(id, "FIELD", "REPORT", Map.of("content", "Done")).andExpect(status().isOk());
    action(id, "LEADER", "FORWARD_REPORT", Map.of()).andExpect(status().isOk());
    action(id, "OFFICER", "VERIFY", Map.of()).andExpect(status().isOk());
    action(id, "OFFICER", "CLOSE", Map.of("reason", "Done")).andExpect(status().isOk());
    return id;
  }

  long count(String table, UUID id) {
    return ((Number)
            db.one("SELECT count(*) n FROM " + table + " WHERE complaint_id=?", id).get("n"))
        .longValue();
  }

  @Test
  void closingStartsTheRetentionClockShownOnTheReport() throws Exception {
    UUID cement = item("Cement", "CONSUMABLE");
    UUID open = complaint("TRIAGED");
    mvc.perform(get("/api/complaints/" + open).with(user(names.get("CITIZEN"))))
        .andExpect(jsonPath("$.retention.years").value(5))
        .andExpect(jsonPath("$.retention.until").doesNotExist());
    UUID id = closed(cement);
    var row =
        db.one(
            "SELECT closed_at IS NOT NULL closed,"
                + " (closed_at+interval '5 years')::date=(now()+interval '5 years')::date due"
                + " FROM complaint WHERE id=?",
            id);
    assertEquals(true, row.get("closed"));
    assertEquals(true, row.get("due"));
    mvc.perform(get("/api/complaints/" + id).with(user(names.get("CITIZEN"))))
        .andExpect(jsonPath("$.retention.until").exists());
  }

  @Test
  void onlyAnAdministratorWithAReasonDeletesAComplaint() throws Exception {
    UUID id = complaint("NEW");
    purge("OFFICER", id, "Spam").andExpect(status().isForbidden());
    purge("ADMIN", id, "  ").andExpect(status().isBadRequest());
    UUID other = UUID.randomUUID();
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Elsewhere')", other);
    users.put("OTHER_ADMIN", UUID.randomUUID());
    names.put("OTHER_ADMIN", "retention_" + users.get("OTHER_ADMIN"));
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role)"
            + " VALUES(?,?,?,'x','Other admin','ADMIN')",
        users.get("OTHER_ADMIN"),
        other,
        names.get("OTHER_ADMIN"));
    purge("OTHER_ADMIN", id, "Spam").andExpect(status().isNotFound());
    assertEquals(1, db.list("SELECT id FROM complaint WHERE id=?", id).size());
    UUID spam = complaint("NEW");
    mvc.perform(
            post("/api/admin/complaints/" + spam + "/purge")
                .with(user(names.get("ADMIN")))
                .with(csrf())
                .sessionAttr("admin_role", "OFFICER")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("reason", "Spam"))))
        .andExpect(status().isOk());
    assertTrue(db.list("SELECT id FROM complaint WHERE id=?", spam).isEmpty());
  }

  @Test
  void deletingRemovesEveryRecordButKeepsTheStockLedger() throws Exception {
    UUID cement = item("Cement", "CONSUMABLE");
    UUID id = closed(cement);
    UUID citizen = users.get("CITIZEN");
    db.run("INSERT INTO complaint_vote(complaint_id,user_id) VALUES(?,?)", id, citizen);
    db.run(
        "INSERT INTO follower(complaint_id,user_id) VALUES(?,?) ON CONFLICT DO NOTHING",
        id,
        citizen);
    db.run("INSERT INTO follower(complaint_id,user_id) VALUES(?,?)", id, users.get("LEADER"));
    db.run(
        "INSERT INTO sla_reminder(complaint_id,user_id,reminder_type) VALUES(?,?,'PROGRESS')",
        id,
        users.get("OFFICER"));
    db.run(
        "INSERT INTO complaint_message(id,complaint_id,municipality_id,sender_id,sender_role,body)"
            + " VALUES(?,?,?,?,'CITIZEN','Hello')",
        UUID.randomUUID(),
        id,
        town,
        citizen);
    db.run(
        "INSERT INTO sla_extension(id,complaint_id,requested_by,reason,days,previous_due_at,"
            + "requested_due_at,status) VALUES(?,?,?,'Rain',3,now(),now(),'REJECTED')",
        UUID.randomUUID(),
        id,
        users.get("LEADER"));
    UUID notice = UUID.randomUUID();
    db.run(
        "INSERT INTO notification(id,user_id,complaint_id,message) VALUES(?,?,?,'x')",
        notice,
        citizen,
        id);
    db.run(
        "INSERT INTO notification_delivery(notification_id,idempotency_key) VALUES(?,?)",
        notice,
        UUID.randomUUID());
    db.run(
        "INSERT INTO integration_reference(id,municipality_id,entity_type,local_id,provider,"
            + "external_id) VALUES(?,?,'COMPLAINT',?,'test',?)",
        UUID.randomUUID(),
        town,
        id,
        "ext-" + id);
    db.run(
        "INSERT INTO submission_key(user_id,operation,request_key,request_hash,response)"
            + " VALUES(?,'complaint',?,'h',?::jsonb)",
        citizen,
        UUID.randomUUID(),
        "{\"id\":\"" + id + "\"}");
    UUID first = UUID.randomUUID();
    db.run(
        "INSERT INTO attachment(id,complaint_id,uploaded_by,original_name,content_type,size_bytes,"
            + "sha256,storage_key) SELECT ?,complaint_id,uploaded_by,'copy.png',content_type,"
            + "size_bytes,sha256,? FROM attachment WHERE complaint_id=? LIMIT 1",
        first,
        "copy-" + first,
        id);
    db.run(
        "UPDATE attachment SET public_copy_of=(SELECT id FROM attachment WHERE complaint_id=? AND"
            + " id<>? LIMIT 1) WHERE id=?",
        id,
        first,
        first);
    UUID resource = UUID.randomUUID();
    Object work = db.one("SELECT id FROM work_order WHERE complaint_id=? LIMIT 1", id).get("id");
    db.run(
        "INSERT INTO resource_request(id,complaint_id,work_order_id,requested_by,status)"
            + " VALUES(?,?,?,?,'APPROVED')",
        resource,
        id,
        work,
        users.get("FIELD"));
    db.run(
        "INSERT INTO resource_revision(id,resource_id,revision,proposal,amount,duration_days,"
            + "submitted_by) VALUES(?,?,1,'Pipes',0,1,?)",
        UUID.randomUUID(),
        resource,
        users.get("LEADER"));
    db.run(
        "INSERT INTO approval_assignment(resource_id,step,approver_id) VALUES(?,1,?)",
        resource,
        users.get("APPROVER"));
    db.run(
        "INSERT INTO stock_reservation(id,resource_id,stock_item_id,municipality_id,quantity,"
            + "status) VALUES(?,?,?,?,1,'RELEASED')",
        UUID.randomUUID(),
        resource,
        cement,
        town);
    Object report = db.one("SELECT id FROM field_report WHERE complaint_id=?", id).get("id");
    db.run(
        "INSERT INTO review(id,complaint_id,resource_id,report_id,actor_id,stage,decision,reason)"
            + " VALUES(?,?,?,?,?,'LEADER','APPROVE','ok')",
        UUID.randomUUID(),
        id,
        resource,
        report,
        users.get("LEADER"));
    UUID target = UUID.randomUUID();
    db.run("INSERT INTO department(id,municipality_id,name) VALUES(?,?,'Health')", target, town);
    db.run(
        "INSERT INTO department_transfer(id,complaint_id,municipality_id,source_department_id,"
            + "target_department_id,requested_by,report_id,reason,state) VALUES(?,?,?,?,?,?,?,"
            + "'Wrong team','RETURNED')",
        UUID.randomUUID(),
        id,
        town,
        dept,
        target,
        users.get("LEADER"),
        report);
    long ledger = db.list("SELECT id FROM stock_movement WHERE stock_item_id=?", cement).size();
    for (String table : CHILDREN)
      if (!table.equals("route_stop")) assertTrue(count(table, id) > 0, table);

    purge("ADMIN", id, "Duplicate of another report").andExpect(status().isOk());

    assertTrue(db.list("SELECT id FROM complaint WHERE id=?", id).isEmpty());
    for (String table : CHILDREN) assertEquals(0, count(table, id), table);
    assertTrue(db.list("SELECT 1 FROM integration_reference WHERE local_id=?", id).isEmpty());
    assertTrue(
        db.list("SELECT 1 FROM submission_key WHERE response->>'id'=?", id.toString()).isEmpty());
    assertEquals(
        ledger, db.list("SELECT id FROM stock_movement WHERE stock_item_id=?", cement).size());
    var event =
        db.one(
            "SELECT actor_id,reason,details->>'complaintId' complaint,details->>'mode' mode FROM"
                + " audit_event WHERE municipality_id=? AND action='COMPLAINT_PURGED'",
            town);
    assertEquals(users.get("ADMIN"), event.get("actor_id"));
    assertEquals(id.toString(), event.get("complaint"));
    assertEquals("ADMIN", event.get("mode"));
    assertTrue(event.get("reason").toString().contains("Duplicate of another report"));
    assertEquals("off", db.one("SELECT current_setting('towntrack.purge') v").get("v"));
    String ref = id.toString().substring(0, 8).toUpperCase();
    for (String role : List.of("CITIZEN", "LEADER"))
      assertEquals(
          List.of(Map.of("message", "ผู้ดูแลระบบได้ลบคำร้อง #" + ref + " ออกจากระบบแล้ว")),
          db.list(
              "SELECT message FROM notification WHERE user_id=? AND complaint_id IS NULL",
              users.get(role)),
          role);
    assertTrue(
        db.list(
                "SELECT 1 FROM notification WHERE user_id=? AND message LIKE ?",
                users.get("OFFICER"),
                "%#" + ref + "%")
            .isEmpty());
  }

  @Test
  void theEquipmentLoanRegisterOutlivesTheComplaint() throws Exception {
    UUID drill = item("Drill", "EQUIPMENT");
    UUID id = closed(item("Cement", "CONSUMABLE"));
    Object work = db.one("SELECT id FROM work_order WHERE complaint_id=? LIMIT 1", id).get("id");
    UUID resource = UUID.randomUUID(), loan = UUID.randomUUID();
    db.run(
        "INSERT INTO resource_request(id,complaint_id,work_order_id,requested_by,status)"
            + " VALUES(?,?,?,?,'APPROVED')",
        resource,
        id,
        work,
        users.get("FIELD"));
    db.run(
        "INSERT INTO equipment_loan(id,municipality_id,stock_item_id,complaint_id,resource_id,"
            + "work_order_id,borrower_id,approved_by,quantity,reason,due_on,returned_at,"
            + "return_condition) VALUES(?,?,?,?,?,?,?,?,1,'Drill holes',current_date,now(),'GOOD')",
        loan,
        town,
        drill,
        id,
        resource,
        work,
        users.get("FIELD"),
        users.get("APPROVER"));

    purge("ADMIN", id, "Duplicate of another report").andExpect(status().isOk());

    var row =
        db.one(
            "SELECT complaint_id,resource_id,work_order_id,borrower_id,return_condition"
                + " FROM equipment_loan WHERE id=?",
            loan);
    assertNull(row.get("complaint_id"));
    assertNull(row.get("resource_id"));
    assertNull(row.get("work_order_id"));
    assertEquals(users.get("FIELD"), row.get("borrower_id"));
    assertEquals("GOOD", row.get("return_condition"));
  }

  @Test
  void equipmentStillOutBlocksTheDeletion() throws Exception {
    // Taken on site as a consumable, then reclassified; equipment cannot be taken at start.
    UUID drill = item("Drill", "CONSUMABLE");
    UUID id = started(drill, 1);
    db.run("UPDATE stock_item SET item_type='EQUIPMENT' WHERE id=?", drill);
    purge("ADMIN", id, "Mistake").andExpect(status().isConflict());
    assertEquals(1, db.list("SELECT id FROM complaint WHERE id=?", id).size());
    // The scheduler passes over it and still removes a later expired complaint.
    UUID later = complaint("CLOSED");
    db.run(
        "UPDATE complaint SET status='CLOSED',closed_at=now()-interval '6 years' WHERE id=?", id);
    db.run("UPDATE complaint SET closed_at=now()-interval '5 years 1 day' WHERE id=?", later);
    retention.purgeExpired();
    assertEquals(1, db.list("SELECT id FROM complaint WHERE id=?", id).size());
    assertTrue(db.list("SELECT id FROM complaint WHERE id=?", later).isEmpty());
  }

  @Test
  void complaintsClosedLongerThanTheRetentionPeriodAreRemoved() throws Exception {
    UUID expired = complaint("CLOSED"), recent = complaint("CLOSED"), open = complaint("TRIAGED");
    db.run(
        "UPDATE complaint SET closed_at=now()-interval '5 years 1 day' WHERE id IN (?,?)",
        expired,
        open);
    db.run(
        "UPDATE complaint SET closed_at=now()-interval '5 years'+interval '1 day' WHERE id=?",
        recent);
    workflow.audit(
        db.one("SELECT * FROM app_user WHERE id=?", users.get("OFFICER")),
        expired,
        "CLOSE",
        "RESOLVED",
        "CLOSED",
        "Done");
    retention.purgeExpired();
    assertTrue(db.list("SELECT id FROM complaint WHERE id=?", expired).isEmpty());
    assertEquals(1, db.list("SELECT id FROM complaint WHERE id=?", recent).size());
    assertEquals(1, db.list("SELECT id FROM complaint WHERE id=?", open).size());
    var event =
        db.one(
            "SELECT actor_id,details->>'mode' mode FROM audit_event WHERE municipality_id=? AND"
                + " action='COMPLAINT_PURGED'",
            town);
    assertNull(event.get("actor_id"));
    assertEquals("RETENTION", event.get("mode"));
    assertEquals(
        "คำร้อง #"
            + expired.toString().substring(0, 8).toUpperCase()
            + " ครบระยะเวลาเก็บ 5 ปี ระบบจึงลบออกจากระบบแล้ว",
        db.one(
                "SELECT message FROM notification WHERE user_id=? AND complaint_id IS NULL",
                users.get("CITIZEN"))
            .get("message"));
    mvc.perform(get("/api/admin/audit").with(user(names.get("ADMIN"))))
        .andExpect(jsonPath("$[0].actor_name").value("ระบบ"));
  }

  @Test
  void auditEventsStayAppendOnlyOutsideAPurge() {
    UUID id = complaint("NEW");
    workflow.audit(
        db.one("SELECT * FROM app_user WHERE id=?", users.get("OFFICER")),
        id,
        "TRIAGE",
        "NEW",
        "TRIAGED",
        "x");
    assertThrows(Exception.class, () -> db.run("DELETE FROM audit_event WHERE complaint_id=?", id));
  }

  @Test
  void aPurgeMayOnlyUnlinkStockMovements() throws Exception {
    UUID cement = item("Cement", "CONSUMABLE");
    started(cement, 1);
    db.run("SET LOCAL towntrack.purge = 'on'");
    assertThrows(
        Exception.class,
        () ->
            db.run(
                "UPDATE stock_movement SET complaint_id=NULL,resource_id=NULL,work_order_id=NULL,"
                    + "delta=delta-1 WHERE stock_item_id=? AND kind='ISSUE'",
                cement));
  }

  @Test
  void storedFilesAreDeletedFromDisk() throws Exception {
    var root = retention.root;
    var file = Files.writeString(root.resolve("retention-" + UUID.randomUUID()), "x");
    var thumb = Files.writeString(root.resolve("retention-" + UUID.randomUUID()), "x");
    var stored = new HashMap<String, Object>();
    stored.put("storage_key", file.getFileName().toString());
    stored.put("thumbnail_key", thumb.getFileName().toString());
    stored.put("storage_provider", "local");
    retention.deleteStored(stored);
    assertFalse(Files.exists(file));
    assertFalse(Files.exists(thumb));
    stored.put("storage_key", "../outside");
    retention.deleteStored(stored);
  }
}
