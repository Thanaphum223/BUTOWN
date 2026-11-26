package th.go.towntrack;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
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
class StockAndSlaIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired Db db;
  @Autowired Workflow workflow;
  @Autowired ObjectMapper json;
  UUID town, dept, category, definition;
  Map<String, UUID> users = new HashMap<>();
  Map<String, String> names = new HashMap<>();

  @BeforeEach
  void setup() {
    town = UUID.randomUUID();
    dept = UUID.randomUUID();
    category = UUID.randomUUID();
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Stock test town')", town);
    db.run("INSERT INTO department(id,municipality_id,name) VALUES(?,?,'Engineering')", dept, town);
    definition = workflow.createDefault(town, 1);
    db.run(
        "INSERT INTO category(id,municipality_id,department_id,workflow_id,name,sla_hours)"
            + " VALUES(?,?,?,?,'Road',72)",
        category,
        town,
        dept,
        definition);
    for (String role :
        List.of("CITIZEN", "OFFICER", "LEADER", "FIELD", "FIELD_2", "APPROVER", "ADMIN")) {
      UUID id = UUID.randomUUID();
      String name = "stock_" + id;
      String stored = role.startsWith("FIELD") ? "FIELD" : role;
      users.put(role, id);
      names.put(role, name);
      db.run(
          "INSERT INTO app_user(id,municipality_id,department_id,username,password_hash,"
              + "display_name,role) VALUES(?,?,?,?,?,?,?)",
          id,
          town,
          Access.departmentRole(stored) ? dept : null,
          name,
          "x",
          "Test " + role,
          stored);
    }
    db.run("UPDATE app_user SET stock_keeper=true WHERE id=?", users.get("OFFICER"));
  }

  UUID complaint(String status) {
    UUID id = UUID.randomUUID();
    db.run(
        "INSERT INTO complaint(id,municipality_id,category_id,reporter_id,officer_id,leader_id,"
            + "department_id,workflow_id,title,description,address,status,due_at)"
            + " VALUES(?,?,?,?,?,?,?,?,'Road case','Original report','Public location',?,"
            + "now()+interval '3 days')",
        id,
        town,
        category,
        users.get("CITIZEN"),
        users.get("OFFICER"),
        users.get("LEADER"),
        dept,
        definition,
        status);
    return id;
  }

  ResultActions send(String role, MockHttpServletRequestBuilderFactory request, Object body)
      throws Exception {
    return mvc.perform(
        request
            .get()
            .with(user(names.get(role)))
            .with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(body)));
  }

  interface MockHttpServletRequestBuilderFactory {
    org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder get();
  }

  ResultActions action(UUID id, String role, String action, Map<String, ?> values)
      throws Exception {
    Map<String, Object> body = new LinkedHashMap<>(values);
    body.put("action", action);
    body.put("version", db.one("SELECT version FROM complaint WHERE id=?", id).get("version"));
    return send(role, () -> post("/api/complaints/" + id + "/actions"), body);
  }

  byte[] png() throws Exception {
    var image = new java.awt.image.BufferedImage(2, 2, java.awt.image.BufferedImage.TYPE_INT_RGB);
    var bytes = new java.io.ByteArrayOutputStream();
    javax.imageio.ImageIO.write(image, "png", bytes);
    return bytes.toByteArray();
  }

  void photo(UUID id, String stage) throws Exception {
    mvc.perform(
            multipart("/api/complaints/" + id + "/files")
                .file(new MockMultipartFile("file", stage + ".png", "image/png", png()))
                .param("evidenceStage", stage)
                .with(user(names.get("FIELD")))
                .with(csrf()))
        .andExpect(status().isOk());
  }

  UUID accepted() throws Exception {
    UUID id = complaint("TRIAGED");
    action(id, "LEADER", "ASSIGN", Map.of("assigneeId", users.get("FIELD")))
        .andExpect(status().isOk());
    action(id, "FIELD", "ACCEPT", Map.of()).andExpect(status().isOk());
    return id;
  }

  UUID item(String name, int quantity) throws Exception {
    var result =
        send(
                "OFFICER",
                () -> post("/api/stock"),
                Map.of("name", name, "unit", "bags", "quantity", quantity))
            .andExpect(status().isOk())
            .andReturn();
    return UUID.fromString(
        json.readTree(result.getResponse().getContentAsString()).get("id").asText());
  }

  int onHand(UUID item) {
    return ((BigDecimal) db.one("SELECT on_hand FROM stock_item WHERE id=?", item).get("on_hand"))
        .intValueExact();
  }

  @Test
  void onlyKeepersChangeStockAndEveryReceiptNeedsEvidence() throws Exception {
    UUID cement = item("Cement", 10);
    assertEquals(10, onHand(cement));
    send("LEADER", () -> post("/api/stock"), Map.of("name", "Sand", "unit", "bags"))
        .andExpect(status().isForbidden());
    send(
            "OFFICER",
            () -> post("/api/stock/" + cement + "/movements"),
            Map.of("kind", "RECEIVE", "quantity", 5))
        .andExpect(status().isBadRequest());
    send(
            "OFFICER",
            () -> post("/api/stock/" + cement + "/movements"),
            Map.of("kind", "RECEIVE", "quantity", 5, "note", "Delivery note 42"))
        .andExpect(status().isOk());
    send(
            "OFFICER",
            () -> post("/api/stock/" + cement + "/movements"),
            Map.of("kind", "ADJUST", "quantity", -100, "note", "Count"))
        .andExpect(status().isConflict());
    assertEquals(15, onHand(cement));
    mvc.perform(get("/api/stock").with(user(names.get("FIELD"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.keeper").value(false))
        .andExpect(jsonPath("$.items[0].name").value("Cement"));
    assertThrows(
        Exception.class,
        () -> db.run("UPDATE stock_movement SET delta=1 WHERE stock_item_id=?", cement));
  }

  @Test
  void startingCannotTakeADeactivatedItem() throws Exception {
    UUID cement = item("Cement", 10);
    UUID id = accepted();
    photo(id, "BEFORE");
    db.run("UPDATE stock_item SET active=false WHERE id=?", cement);
    action(
            id,
            "FIELD",
            "START",
            Map.of("stockItems", List.of(Map.of("stockItemId", cement, "quantity", 1))))
        .andExpect(status().isBadRequest());
    assertEquals(10, onHand(cement));
  }

  @Test
  void startingWithoutARequestIssuesStockAndTheReportReturnsLeftovers() throws Exception {
    UUID cement = item("Cement", 10);
    UUID id = accepted();
    photo(id, "BEFORE");
    action(
            id,
            "FIELD",
            "START",
            Map.of("stockItems", List.of(Map.of("stockItemId", cement, "quantity", 20))))
        .andExpect(status().isConflict());
    assertEquals(10, onHand(cement));
    action(
            id,
            "FIELD",
            "START",
            Map.of("stockItems", List.of(Map.of("stockItemId", cement, "quantity", 4))))
        .andExpect(status().isOk());
    assertEquals(6, onHand(cement));
    assertFalse(
        db.list(
                "SELECT id FROM notification WHERE user_id=? AND message LIKE '%ไม่ได้ขอใช้ล่วงหน้า%'",
                users.get("LEADER"))
            .isEmpty());

    photo(id, "AFTER");
    action(
            id,
            "FIELD",
            "REPORT",
            Map.of(
                "content",
                "Done",
                "stockReturns",
                List.of(Map.of("stockItemId", cement, "quantity", 5))))
        .andExpect(status().isBadRequest());
    action(
            id,
            "FIELD",
            "REPORT",
            Map.of(
                "content",
                "Done",
                "stockReturns",
                List.of(Map.of("stockItemId", cement, "quantity", 1))))
        .andExpect(status().isOk());
    assertEquals(7, onHand(cement));
    mvc.perform(get("/api/stock/complaints/" + id).with(user(names.get("LEADER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].issued").value(4.0))
        .andExpect(jsonPath("$[0].returned").value(1.0))
        .andExpect(jsonPath("$[0].used").value(3.0));
  }

  UUID resource(UUID complaint, String status, UUID item, int quantity) throws Exception {
    UUID resource = UUID.randomUUID();
    db.run(
        "INSERT INTO resource_request(id,complaint_id,work_order_id,requested_by,status,approver_id)"
            + " VALUES(?,?,?,?,?,?)",
        resource,
        complaint,
        workflow.active(complaint).get("id"),
        users.get("FIELD"),
        status,
        users.get("APPROVER"));
    var line = new LinkedHashMap<String, Object>();
    line.put("name", "Cement");
    line.put("quantity", quantity);
    line.put("unit", "bags");
    line.put("stockItemId", item.toString());
    line.put("amount", 0);
    db.run(
        "INSERT INTO resource_revision(id,resource_id,revision,proposal,amount,duration_days,"
            + "submitted_by,line_items) VALUES(?,?,1,'Cement',0,1,?,?::jsonb)",
        UUID.randomUUID(),
        resource,
        users.get("LEADER"),
        json.writeValueAsString(List.of(line)));
    return resource;
  }

  @Test
  void approvalChecksTheBalanceAndStartIssuesTheApprovedItems() throws Exception {
    UUID cement = item("Cement", 5);
    UUID short_ = accepted();
    UUID pending = resource(short_, "PENDING", cement, 8);
    db.run(
        "INSERT INTO approval_assignment(resource_id,step,approver_id) VALUES(?,1,?)",
        pending,
        users.get("APPROVER"));
    db.run("UPDATE complaint SET status='RESOURCE_APPROVAL' WHERE id=?", short_);
    action(short_, "APPROVER", "APPROVE", Map.of("reason", "Fine"))
        .andExpect(status().isConflict());

    UUID id = accepted();
    resource(id, "APPROVED", cement, 3);
    db.run("UPDATE complaint SET status='READY' WHERE id=?", id);
    photo(id, "BEFORE");
    action(id, "FIELD", "START", Map.of()).andExpect(status().isOk());
    assertEquals(2, onHand(cement));
  }

  @Test
  void leadersAskForMoreTimeAndApproversDecide() throws Exception {
    UUID id = complaint("TRIAGED");
    var before =
        ((java.sql.Timestamp) db.one("SELECT due_at FROM complaint WHERE id=?", id).get("due_at"))
            .toInstant();
    send(
            "FIELD",
            () -> post("/api/complaints/" + id + "/sla-extensions"),
            Map.of("days", 7, "reason", "x"))
        .andExpect(status().isForbidden());
    send(
            "LEADER",
            () -> post("/api/complaints/" + id + "/sla-extensions"),
            Map.of("days", 0, "reason", "x"))
        .andExpect(status().isBadRequest());
    var created =
        send(
                "LEADER",
                () -> post("/api/complaints/" + id + "/sla-extensions"),
                Map.of("days", 7, "reason", "Waiting for pipes"))
            .andExpect(status().isOk())
            .andReturn();
    send(
            "LEADER",
            () -> post("/api/complaints/" + id + "/sla-extensions"),
            Map.of("days", 3, "reason", "Again"))
        .andExpect(status().isConflict());
    String extension = json.readTree(created.getResponse().getContentAsString()).get("id").asText();
    send(
            "LEADER",
            () -> post("/api/complaints/" + id + "/sla-extensions/" + extension + "/decision"),
            Map.of("approve", true, "reason", "ok"))
        .andExpect(status().isForbidden());
    send(
            "OFFICER",
            () -> post("/api/complaints/" + id + "/sla-extensions/" + extension + "/decision"),
            Map.of("approve", true, "reason", "Justified"))
        .andExpect(status().isForbidden());
    // The approver has no resource request here: the extension alone opens the case and queue.
    mvc.perform(get("/api/complaints/" + id).with(user(names.get("APPROVER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.actions").isEmpty());
    mvc.perform(get("/api/complaints/" + id + "/sla").with(user(names.get("APPROVER"))))
        .andExpect(jsonPath("$.canDecide").value(true))
        .andExpect(jsonPath("$.remainingExtensions").value(1));
    mvc.perform(get("/api/complaints?activeOnly=true&queue=sla").with(user(names.get("APPROVER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].id").value(id.toString()))
        .andExpect(jsonPath("$.items[0].can_open").value(true));
    assertEquals(1, notified("APPROVER", "รอพิจารณา"));
    assertEquals(1, notified("OFFICER", "รอพิจารณา"));
    send(
            "APPROVER",
            () -> post("/api/complaints/" + id + "/sla-extensions/" + extension + "/decision"),
            Map.of("approve", true, "reason", "Justified"))
        .andExpect(status().isOk());
    mvc.perform(get("/api/complaints?activeOnly=true").with(user(names.get("APPROVER"))))
        .andExpect(jsonPath("$.total").value(0));
    var after =
        ((java.sql.Timestamp) db.one("SELECT due_at FROM complaint WHERE id=?", id).get("due_at"))
            .toInstant();
    assertEquals(7, java.time.Duration.between(before, after).toDays());
    assertFalse(
        db.list(
                "SELECT id FROM notification WHERE user_id=? AND message LIKE '%ขยายระยะเวลา%'",
                users.get("CITIZEN"))
            .isEmpty());
    mvc.perform(get("/api/complaints/" + id + "/sla").with(user(names.get("CITIZEN"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.canRequest").value(false))
        .andExpect(jsonPath("$.extensions[0].status").value("APPROVED"))
        .andExpect(jsonPath("$.progress_days").value(15));
  }

  int notified(String role, String text) {
    return db.list(
            "SELECT id FROM notification WHERE user_id=? AND message LIKE ?",
            users.get(role),
            "%" + text + "%")
        .size();
  }

  String extension(UUID id, int days) throws Exception {
    var result =
        send(
                "LEADER",
                () -> post("/api/complaints/" + id + "/sla-extensions"),
                Map.of("days", days, "reason", "Waiting"))
            .andExpect(status().isOk())
            .andReturn();
    return json.readTree(result.getResponse().getContentAsString()).get("id").asText();
  }

  ResultActions decide(UUID id, String extension, boolean approve) throws Exception {
    return send(
        "APPROVER",
        () -> post("/api/complaints/" + id + "/sla-extensions/" + extension + "/decision"),
        Map.of("approve", approve, "reason", "Considered"));
  }

  @Test
  void extensionsAreLimitedToFifteenDaysAndTwicePerCase() throws Exception {
    UUID id = complaint("TRIAGED");
    send(
            "LEADER",
            () -> post("/api/complaints/" + id + "/sla-extensions"),
            Map.of("days", 16, "reason", "Too long"))
        .andExpect(status().isBadRequest());
    // A refused request does not use up one of the two.
    decide(id, extension(id, 1), false).andExpect(status().isOk());
    decide(id, extension(id, 15), true).andExpect(status().isOk());
    decide(id, extension(id, 15), true).andExpect(status().isOk());
    send(
            "LEADER",
            () -> post("/api/complaints/" + id + "/sla-extensions"),
            Map.of("days", 3, "reason", "Third"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.message").value("ขอขยายเวลาครบจำนวนสูงสุด 2 ครั้งต่อคำร้องแล้ว"));
    mvc.perform(get("/api/complaints/" + id + "/sla").with(user(names.get("LEADER"))))
        .andExpect(jsonPath("$.remainingExtensions").value(0));

    UUID closed = complaint("TRIAGED");
    String pending = extension(closed, 5);
    db.run("UPDATE complaint SET status='CLOSED' WHERE id=?", closed);
    decide(closed, pending, true).andExpect(status().isConflict());
  }

  @Test
  void quietCasesRemindStaffBeforeTheProgressDeadlineOnce() {
    UUID id = complaint("TRIAGED");
    db.run(
        "INSERT INTO audit_event(id,complaint_id,municipality_id,actor_id,action,to_status,reason,"
            + "created_at) VALUES(?,?,?,?,'CREATE','NEW','',now()-interval '13 days')",
        UUID.randomUUID(),
        id,
        town,
        users.get("CITIZEN"));
    var reminder = new SlaReminder(db, workflow);
    // The shared test database may hold other quiet cases; each pass handles up to 100.
    for (int i = 0; i < 20 && notified("OFFICER", "ใกล้ครบ 15 วัน") == 0; i++)
      reminder.remindProgress();
    for (int i = 0; i < 20 && notified("LEADER", "ใกล้ครบ 15 วัน") == 0; i++)
      reminder.remindProgress();
    reminder.remindProgress();
    assertEquals(1, notified("OFFICER", "ใกล้ครบ 15 วัน"));
    assertEquals(1, notified("LEADER", "ใกล้ครบ 15 วัน"));
  }

  UUID approved(UUID item, int quantity) throws Exception {
    UUID id = accepted();
    UUID pending = resource(id, "PENDING", item, quantity);
    db.run(
        "INSERT INTO approval_assignment(resource_id,step,approver_id) VALUES(?,1,?)",
        pending,
        users.get("APPROVER"));
    db.run("UPDATE complaint SET status='RESOURCE_APPROVAL' WHERE id=?", id);
    return id;
  }

  String reservation(UUID complaint) {
    return (String)
        db.one(
                "SELECT s.status FROM stock_reservation s JOIN resource_request r ON"
                    + " r.id=s.resource_id WHERE r.complaint_id=?",
                complaint)
            .get("status");
  }

  ResultActions balance(String field, double value) throws Exception {
    return mvc.perform(get("/api/stock").with(user(names.get("OFFICER"))))
        .andExpect(jsonPath("$.items[0]." + field).value(value));
  }

  @Test
  void approvalReservesStockAndUndoingTheStartRestoresIt() throws Exception {
    UUID cement = item("Cement", 10);
    UUID first = approved(cement, 8), second = approved(cement, 8);
    action(first, "APPROVER", "APPROVE", Map.of("reason", "Fine")).andExpect(status().isOk());
    assertEquals(10, onHand(cement));
    assertEquals("ACTIVE", reservation(first));
    balance("reserved", 8).andExpect(jsonPath("$.items[0].available").value(2.0));
    action(second, "APPROVER", "APPROVE", Map.of("reason", "Fine"))
        .andExpect(status().isConflict());
    send(
            "OFFICER",
            () -> post("/api/stock/" + cement + "/movements"),
            Map.of("kind", "ADJUST", "quantity", -3, "note", "Count"))
        .andExpect(status().isConflict());
    UUID other = accepted();
    photo(other, "BEFORE");
    action(
            other,
            "FIELD",
            "START",
            Map.of("stockItems", List.of(Map.of("stockItemId", cement, "quantity", 3))))
        .andExpect(status().isConflict());

    photo(first, "BEFORE");
    for (int round = 0; round < 2; round++) {
      action(
              first,
              "FIELD",
              "START",
              Map.of("stockItems", List.of(Map.of("stockItemId", cement, "quantity", 1))))
          .andExpect(status().isOk());
      assertEquals(1, onHand(cement));
      assertEquals("FULFILLED", reservation(first));
      balance("in_use", 9);
      if (round == 1) break;
      action(first, "FIELD", "UNDO_START", Map.of("reason", "Rain")).andExpect(status().isOk());
      assertEquals(10, onHand(cement));
      assertEquals("ACTIVE", reservation(first));
      balance("in_use", 0);
    }
  }

  @Test
  void deniedCasesReleaseTheirReservation() throws Exception {
    UUID cement = item("Cement", 10);
    UUID id = approved(cement, 4);
    action(id, "APPROVER", "APPROVE", Map.of("reason", "Fine")).andExpect(status().isOk());
    db.run("UPDATE complaint SET status='RESOURCE_APPROVAL' WHERE id=?", id);
    db.run(
        "UPDATE approval_assignment SET decision=NULL,decided_at=NULL WHERE resource_id=?",
        workflow.resource(id).get("id"));
    action(id, "APPROVER", "DENY", Map.of("reason", "No")).andExpect(status().isOk());
    assertEquals("RELEASED", reservation(id));
    balance("reserved", 0);
  }

  UUID startedWith(UUID item, int quantity) throws Exception {
    UUID id = accepted();
    photo(id, "BEFORE");
    action(
            id,
            "FIELD",
            "START",
            Map.of("stockItems", List.of(Map.of("stockItemId", item, "quantity", quantity))))
        .andExpect(status().isOk());
    return id;
  }

  @Test
  void closedJobsNoLongerCountAsInUse() throws Exception {
    UUID cement = item("Cement", 10);
    UUID id = startedWith(cement, 4);
    balance("in_use", 4);
    photo(id, "AFTER");
    action(id, "FIELD", "REPORT", Map.of("content", "Done")).andExpect(status().isOk());
    action(id, "LEADER", "FORWARD_REPORT", Map.of()).andExpect(status().isOk());
    action(id, "OFFICER", "VERIFY", Map.of()).andExpect(status().isOk());
    action(id, "OFFICER", "CLOSE", Map.of("reason", "Done")).andExpect(status().isOk());
    balance("in_use", 0);
    assertEquals(6, onHand(cement));
  }

  @Test
  void missingEquipmentAlertsTheLeaderAndKeepers() throws Exception {
    var created =
        send(
                "OFFICER",
                () -> post("/api/stock"),
                Map.of("name", "Drill", "unit", "pcs", "quantity", 2, "itemType", "EQUIPMENT"))
            .andExpect(status().isOk())
            .andReturn();
    UUID drill =
        UUID.fromString(
            json.readTree(created.getResponse().getContentAsString()).get("id").asText());
    send(
            "OFFICER",
            () -> post("/api/stock"),
            Map.of("name", "Bad", "unit", "pcs", "itemType", "OTHER"))
        .andExpect(status().isBadRequest());
    mvc.perform(get("/api/stock").with(user(names.get("FIELD"))))
        .andExpect(jsonPath("$.items[0].item_type").value("EQUIPMENT"));
    // Equipment leaves the store only through an approved request (clause 208(2)).
    UUID unasked = accepted();
    photo(unasked, "BEFORE");
    action(
            unasked,
            "FIELD",
            "START",
            Map.of("stockItems", List.of(Map.of("stockItemId", drill, "quantity", 1))))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("ครุภัณฑ์")));
    assertEquals(2, onHand(drill));
    UUID id = approved(drill, 2);
    // Only the mayor or a written delegate may approve the loan.
    action(id, "APPROVER", "APPROVE", Map.of("reason", "Fine")).andExpect(status().isBadRequest());
    send(
            "ADMIN",
            () -> put("/api/stock/loan-approvers/" + users.get("APPROVER")),
            Map.of("approver", true, "reference", "คำสั่งที่ 1/2569"))
        .andExpect(status().isOk());
    action(id, "APPROVER", "APPROVE", Map.of("reason", "Fine")).andExpect(status().isOk());
    photo(id, "BEFORE");
    action(id, "FIELD", "START", Map.of()).andExpect(status().isOk());
    assertEquals(0, onHand(drill));
    assertEquals(
        1,
        db.list(
                "SELECT id FROM equipment_loan WHERE complaint_id=? AND returned_at IS NULL"
                    + " AND approved_by=?",
                id,
                users.get("APPROVER"))
            .size());
    photo(id, "AFTER");
    action(
            id,
            "FIELD",
            "REPORT",
            Map.of(
                "content",
                "Done",
                "stockReturns",
                List.of(Map.of("stockItemId", drill, "quantity", 1))))
        .andExpect(status().isOk());
    assertEquals(1, notified("LEADER", "ครุภัณฑ์"));
    assertEquals(1, notified("OFFICER", "ครุภัณฑ์"));
  }

  @Test
  void leadersAndKeepersConfirmItemsTakenWithoutARequest() throws Exception {
    UUID cement = item("Cement", 10);
    UUID id = startedWith(cement, 2);
    assertEquals(1, notified("LEADER", "ใบเบิกย้อนหลัง"));
    assertEquals(1, notified("OFFICER", "ใบเบิกย้อนหลัง"));
    var issue =
        db.one("SELECT id FROM stock_movement WHERE complaint_id=? AND kind='ISSUE'", id).get("id");
    var opening =
        db.one("SELECT id FROM stock_movement WHERE stock_item_id=? AND kind='RECEIVE'", cement)
            .get("id");
    mvc.perform(get("/api/stock/pending-verifications").with(user(names.get("FIELD"))))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/stock/pending-verifications").with(user(names.get("LEADER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].id").value(issue.toString()))
        .andExpect(jsonPath("$[0].verify_as").value("LEADER"));
    send("FIELD", () -> post("/api/stock/movements/" + issue + "/verify"), Map.of())
        .andExpect(status().isForbidden());
    send("OFFICER", () -> post("/api/stock/movements/" + opening + "/verify"), Map.of())
        .andExpect(status().isNotFound());
    send("LEADER", () -> post("/api/stock/movements/" + issue + "/verify"), Map.of("note", "Seen"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.verifierRole").value("LEADER"));
    send("LEADER", () -> post("/api/stock/movements/" + issue + "/verify"), Map.of())
        .andExpect(status().isConflict());
    send("OFFICER", () -> post("/api/stock/movements/" + issue + "/verify"), Map.of())
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.verifierRole").value("KEEPER"));
    mvc.perform(get("/api/stock/pending-verifications").with(user(names.get("OFFICER"))))
        .andExpect(jsonPath("$").isEmpty());
    mvc.perform(
            get("/api/stock/complaints/" + id + "/verifications").with(user(names.get("FIELD"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].leader_note").value("Seen"))
        .andExpect(jsonPath("$[0].keeper_verified_by").value("Test OFFICER"));
    assertEquals(
        2,
        db.list(
                "SELECT id FROM audit_event WHERE complaint_id=? AND action='VERIFY_STOCK_ISSUE'",
                id)
            .size());
  }

  @Test
  void stockReportOpensInSpreadsheetsWithoutRunningFormulas() throws Exception {
    UUID cement = item("=HYPERLINK(1)", 10);
    startedWith(cement, 4);
    mvc.perform(get("/api/stock/export.csv").with(user(names.get("CITIZEN"))))
        .andExpect(status().isForbidden());
    var bytes =
        mvc.perform(get("/api/stock/export.csv").with(user(names.get("APPROVER"))))
            .andExpect(status().isOk())
            .andExpect(header().string("Content-Type", "text/csv; charset=UTF-8"))
            .andReturn()
            .getResponse()
            .getContentAsByteArray();
    String csv = new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
    assertTrue(csv.startsWith("\uFEFFชื่อวัสดุ,ประเภท,หน่วย,สถานะ,"));
    assertTrue(
        csv.contains("\"'=HYPERLINK(1)\",วัสดุสิ้นเปลือง,\"bags\",ใช้งาน,6,0,6,4,10,4,0,4"), csv);
    for (String formula : List.of("=1", "+1", "-1", "@A", "\t=1"))
      assertEquals("\"'" + formula + "\"", StockController.cell(formula));
    String earlier =
        mvc.perform(get("/api/stock/export.csv?to=2000-01-01").with(user(names.get("OFFICER"))))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
    assertTrue(earlier.contains(",6,0,6,4,0,0,0,0"), earlier);
    mvc.perform(
            get("/api/stock/export.csv?from=2026-02-01&to=2026-01-01")
                .with(user(names.get("OFFICER"))))
        .andExpect(status().isBadRequest());
  }

  @Test
  void everyDefaultCategoryHasOneOfTheFourServiceLevels() {
    var counts = new TreeMap<Integer, Integer>();
    for (String name : MunicipalCategories.NAMES)
      counts.merge(MunicipalCategories.defaultSlaHours(name), 1, Integer::sum);
    assertEquals(Map.of(24, 5, 72, 8, 168, 8, 360, 3), counts);
  }

  @Test
  void peopleShowFieldWorkloadAndTheOfficersUsualApprover() throws Exception {
    accepted();
    mvc.perform(get("/api/people?role=FIELD").with(user(names.get("LEADER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[?(@.display_name=='Test FIELD')].active").value(1))
        .andExpect(jsonPath("$[?(@.display_name=='Test FIELD')].accepted").value(1))
        .andExpect(jsonPath("$[?(@.display_name=='Test FIELD_2')].active").value(0));

    UUID id = accepted();
    UUID resource = UUID.randomUUID();
    db.run(
        "INSERT INTO resource_request(id,complaint_id,requested_by) VALUES(?,?,?)",
        resource,
        id,
        users.get("LEADER"));
    db.run(
        "INSERT INTO approval_assignment(resource_id,step,approver_id) VALUES(?,1,?)",
        resource,
        users.get("APPROVER"));
    db.run(
        "INSERT INTO review(id,complaint_id,resource_id,actor_id,stage,decision,reason)"
            + " VALUES(?,?,?,?,'RESOURCE_CHECK','SEND_APPROVAL','')",
        UUID.randomUUID(),
        id,
        resource,
        users.get("OFFICER"));
    mvc.perform(get("/api/people?role=APPROVER").with(user(names.get("OFFICER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[?(@.display_name=='Test APPROVER')].usual_step").value(1));
  }

  @Test
  void citizensMayLeaveTitleAndDescriptionBlank() throws Exception {
    var payload = Map.of("categoryId", category, "address", "Front of the market");
    var result =
        mvc.perform(
                multipart("/api/complaints")
                    .file(
                        new MockMultipartFile(
                            "complaint", "", "application/json", json.writeValueAsBytes(payload)))
                    .file(new MockMultipartFile("files", "site.png", "image/png", png()))
                    .with(user(names.get("CITIZEN")))
                    .with(csrf()))
            .andExpect(status().isOk())
            .andReturn();
    String id = json.readTree(result.getResponse().getContentAsString()).get("id").asText();
    var saved = db.one("SELECT title,description FROM complaint WHERE id=?::uuid", id);
    assertEquals("Road", saved.get("title"));
    assertEquals("", saved.get("description"));
  }

  @Autowired EquipmentLoans equipmentLoans;

  UUID equip(String name, int qty) throws Exception {
    var result =
        send(
                "OFFICER",
                () -> post("/api/stock"),
                Map.of("name", name, "unit", "pcs", "quantity", qty, "itemType", "EQUIPMENT"))
            .andExpect(status().isOk())
            .andReturn();
    return UUID.fromString(
        json.readTree(result.getResponse().getContentAsString()).get("id").asText());
  }

  UUID delegateAndApprove(UUID drill, int qty) throws Exception {
    send(
            "ADMIN",
            () -> put("/api/stock/loan-approvers/" + users.get("APPROVER")),
            Map.of("approver", true, "reference", "คำสั่งที่ 1/2569"))
        .andExpect(status().isOk());
    UUID id = approved(drill, qty);
    action(id, "APPROVER", "APPROVE", Map.of("reason", "Fine")).andExpect(status().isOk());
    photo(id, "BEFORE");
    action(id, "FIELD", "START", Map.of()).andExpect(status().isOk());
    return id;
  }

  @Test
  void equipmentRequestRequiresAFutureLoanDueOn() throws Exception {
    UUID drill = equip("Drill", 2);
    UUID id = accepted();
    var drillLine = Map.of("stockItemId", drill, "name", "Drill", "unit", "pcs", "quantity", 1);
    // Missing loanDueOn → 400
    action(
            id,
            "FIELD",
            "REQUEST_RESOURCE",
            Map.of("reason", "Need", "items", List.of(drillLine)))
        .andExpect(status().isBadRequest())
        .andExpect(
            jsonPath("$.message")
                .value(org.hamcrest.Matchers.containsString("กำหนดวันส่งคืน")));
    // Past date → 400
    action(
            id,
            "FIELD",
            "REQUEST_RESOURCE",
            Map.of("reason", "Need", "loanDueOn", "2020-01-01", "items", List.of(drillLine)))
        .andExpect(status().isBadRequest())
        .andExpect(
            jsonPath("$.message")
                .value(org.hamcrest.Matchers.containsString("กำหนดวันส่งคืน")));
    // Valid date within one year → 200
    String validDue =
        java.time.LocalDate.now(java.time.ZoneId.of("Asia/Bangkok")).plusDays(30).toString();
    action(
            id,
            "FIELD",
            "REQUEST_RESOURCE",
            Map.of("reason", "Need", "loanDueOn", validDue, "items", List.of(drillLine)))
        .andExpect(status().isOk());
  }

  @Test
  void keeperReceivesEquipmentBackInThreeConditions() throws Exception {
    UUID drill = equip("Drill", 3);
    send(
            "ADMIN",
            () -> put("/api/stock/loan-approvers/" + users.get("APPROVER")),
            Map.of("approver", true, "reference", "คำสั่งที่ 1/2569"))
        .andExpect(status().isOk());

    // GOOD: equipment comes back — balance restored
    UUID id1 = approved(drill, 1);
    action(id1, "APPROVER", "APPROVE", Map.of("reason", "Fine")).andExpect(status().isOk());
    photo(id1, "BEFORE");
    action(id1, "FIELD", "START", Map.of()).andExpect(status().isOk());
    UUID loan1 =
        (UUID)
            db.one(
                    "SELECT id FROM equipment_loan WHERE complaint_id=? AND returned_at IS NULL",
                    id1)
                .get("id");
    assertEquals(2, onHand(drill));
    send("OFFICER", () -> post("/api/stock/loans/" + loan1 + "/return"), Map.of("condition", "GOOD"))
        .andExpect(status().isOk());
    assertEquals(3, onHand(drill));
    assertEquals(
        "GOOD",
        db.one("SELECT return_condition FROM equipment_loan WHERE id=?", loan1)
            .get("return_condition"));

    // DAMAGED: equipment comes back with a note — balance restored
    UUID id2 = approved(drill, 1);
    action(id2, "APPROVER", "APPROVE", Map.of("reason", "Fine")).andExpect(status().isOk());
    photo(id2, "BEFORE");
    action(id2, "FIELD", "START", Map.of()).andExpect(status().isOk());
    UUID loan2 =
        (UUID)
            db.one(
                    "SELECT id FROM equipment_loan WHERE complaint_id=? AND returned_at IS NULL",
                    id2)
                .get("id");
    send(
            "OFFICER",
            () -> post("/api/stock/loans/" + loan2 + "/return"),
            Map.of("condition", "DAMAGED", "note", "Cracked casing"))
        .andExpect(status().isOk());
    assertEquals(3, onHand(drill));
    assertEquals(
        "DAMAGED",
        db.one("SELECT return_condition FROM equipment_loan WHERE id=?", loan2)
            .get("return_condition"));

    // LOST: return movement then written-off adjustment — balance drops by one
    UUID id3 = approved(drill, 1);
    action(id3, "APPROVER", "APPROVE", Map.of("reason", "Fine")).andExpect(status().isOk());
    photo(id3, "BEFORE");
    action(id3, "FIELD", "START", Map.of()).andExpect(status().isOk());
    assertEquals(2, onHand(drill));
    UUID loan3 =
        (UUID)
            db.one(
                    "SELECT id FROM equipment_loan WHERE complaint_id=? AND returned_at IS NULL",
                    id3)
                .get("id");
    send(
            "OFFICER",
            () -> post("/api/stock/loans/" + loan3 + "/return"),
            Map.of("condition", "LOST", "note", "Gone"))
        .andExpect(status().isOk());
    assertEquals(2, onHand(drill));
    assertEquals(
        "LOST",
        db.one("SELECT return_condition FROM equipment_loan WHERE id=?", loan3)
            .get("return_condition"));
  }

  @Test
  void undoStartCancelsOpenLoans() throws Exception {
    UUID drill = equip("Drill", 1);
    UUID id = delegateAndApprove(drill, 1);
    assertEquals(0, onHand(drill));
    action(id, "FIELD", "UNDO_START", Map.of("reason", "Bad weather"))
        .andExpect(status().isOk());
    assertEquals(1, onHand(drill));
    assertEquals(
        "CANCELLED",
        db.one("SELECT return_condition FROM equipment_loan WHERE complaint_id=?", id)
            .get("return_condition"));
    assertNotNull(
        db.one("SELECT returned_at FROM equipment_loan WHERE complaint_id=?", id)
            .get("returned_at"));
  }

  @Test
  void overdueReminderFiresExactlyOnce() throws Exception {
    UUID drill = equip("Overdue Drill", 1);
    UUID loanId = UUID.randomUUID();
    db.run(
        "INSERT INTO equipment_loan(id,municipality_id,stock_item_id,borrower_id,quantity,reason,due_on)"
            + " VALUES(?,?,?,?,1,'',(now() AT TIME ZONE 'Asia/Bangkok')::date-1)",
        loanId,
        town,
        drill,
        users.get("FIELD"));
    // A loan due yesterday with no reminder yet → both borrower and keeper are notified.
    equipmentLoans.remindOverdue();
    assertEquals(1, notified("FIELD", "เกินกำหนดส่งคืน"));
    assertEquals(1, notified("OFFICER", "เกินกำหนดส่งคืน"));
    assertNotNull(
        db.one("SELECT reminded_at FROM equipment_loan WHERE id=?", loanId).get("reminded_at"));
    // A second call must not send another notification (reminded_at is now set).
    equipmentLoans.remindOverdue();
    assertEquals(1, notified("FIELD", "เกินกำหนดส่งคืน"));
    assertEquals(1, notified("OFFICER", "เกินกำหนดส่งคืน"));
  }

  @Test
  void aRequestNamesEachStockItemOnceAndNoMoreThanIsLeft() throws Exception {
    UUID cement = item("Cement", 5);
    UUID id = accepted();
    Map<String, Object> three =
        Map.of("stockItemId", cement, "name", "Cement", "unit", "bags", "quantity", 3);
    action(
            id,
            "FIELD",
            "REQUEST_RESOURCE",
            Map.of("reason", "Need", "items", List.of(three, three)))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.message").value("เลือกวัสดุจากคลังได้รายการละ 1 ครั้ง"));
    action(
            id,
            "FIELD",
            "REQUEST_RESOURCE",
            Map.of(
                "reason",
                "Need",
                "items",
                List.of(Map.of("stockItemId", cement, "name", "C", "unit", "bags", "quantity", 6))))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.message").value("จำนวนเกินคงคลัง: Cement เหลือ 5 bags"));
    action(
            id,
            "FIELD",
            "REQUEST_RESOURCE",
            Map.of(
                "reason",
                "Need",
                "items",
                List.of(
                    Map.of("stockItemId", cement, "name", "C", "unit", "bags", "quantity", 5),
                    Map.of("name", "Pipes", "unit", "pieces", "quantity", 100))))
        .andExpect(status().isOk());
  }
}
