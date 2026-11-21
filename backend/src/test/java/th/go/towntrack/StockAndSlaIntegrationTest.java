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
    for (String role : List.of("CITIZEN", "OFFICER", "LEADER", "FIELD", "FIELD_2", "APPROVER")) {
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
  void leadersAskForMoreTimeAndOfficersDecide() throws Exception {
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
        .andExpect(status().isOk());
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
}
