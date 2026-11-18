package th.go.towntrack;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
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
class FieldTransparencyIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired Db db;
  @Autowired Workflow workflow;
  @Autowired ObjectMapper json;
  UUID town, dept, otherDept, category, definition;
  Map<String, UUID> users = new HashMap<>();
  Map<String, String> names = new HashMap<>();

  @BeforeEach
  void setup() {
    town = UUID.randomUUID();
    dept = UUID.randomUUID();
    otherDept = UUID.randomUUID();
    category = UUID.randomUUID();
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Transparency test town')", town);
    db.run("INSERT INTO department(id,municipality_id,name) VALUES(?,?,'Engineering')", dept, town);
    db.run("INSERT INTO department(id,municipality_id,name) VALUES(?,?,'Parks')", otherDept, town);
    definition = workflow.createDefault(town, 1);
    db.run(
        "INSERT INTO category(id,municipality_id,department_id,workflow_id,name,sla_hours) VALUES(?,?,?,?,'Road',72)",
        category,
        town,
        dept,
        definition);
    for (String role :
        List.of("CITIZEN", "OFFICER", "LEADER", "FIELD", "FIELD_2", "FIELD_OTHER", "APPROVER")) {
      UUID id = UUID.randomUUID();
      String name = "transparency_" + id;
      String stored = role.startsWith("FIELD") ? "FIELD" : role;
      users.put(role, id);
      names.put(role, name);
      db.run(
          "INSERT INTO app_user(id,municipality_id,department_id,username,password_hash,display_name,role) VALUES(?,?,?,?,?,?,?)",
          id,
          town,
          role.equals("FIELD_OTHER") ? otherDept : Access.departmentRole(stored) ? dept : null,
          name,
          "x",
          "Test " + role,
          stored);
    }
  }

  UUID complaint(String status) {
    UUID id = UUID.randomUUID();
    db.run(
        "INSERT INTO complaint(id,municipality_id,category_id,reporter_id,officer_id,leader_id,department_id,workflow_id,title,description,address,status,due_at) VALUES(?,?,?,?,?,?,?,?,'Road case','Original report','Public location',?,now()+interval '3 days')",
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

  ResultActions action(UUID id, String role, String action, Map<String, ?> values)
      throws Exception {
    Map<String, Object> body = new LinkedHashMap<>(values);
    body.put("action", action);
    body.put("version", db.one("SELECT version FROM complaint WHERE id=?", id).get("version"));
    return mvc.perform(
        post("/api/complaints/" + id + "/actions")
            .with(user(names.get(role)))
            .with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(body)));
  }

  ResultActions photo(UUID id, String role, String stage) throws Exception {
    var image = new java.awt.image.BufferedImage(2, 2, java.awt.image.BufferedImage.TYPE_INT_RGB);
    var bytes = new java.io.ByteArrayOutputStream();
    javax.imageio.ImageIO.write(image, "png", bytes);
    return mvc.perform(
        multipart("/api/complaints/" + id + "/files")
            .file(new MockMultipartFile("file", stage + ".png", "image/png", bytes.toByteArray()))
            .param("evidenceStage", stage)
            .with(user(names.get(role)))
            .with(csrf()));
  }

  UUID accepted() throws Exception {
    UUID id = complaint("TRIAGED");
    action(id, "LEADER", "ASSIGN", Map.of("assigneeId", users.get("FIELD")))
        .andExpect(status().isOk());
    action(id, "FIELD", "ACCEPT", Map.of()).andExpect(status().isOk());
    return id;
  }

  @Test
  void startNeedsASitePhotoThatStaysWithTheWorkOrder() throws Exception {
    UUID id = accepted();
    action(id, "FIELD", "START", Map.of()).andExpect(status().isBadRequest());
    photo(id, "FIELD", "AFTER").andExpect(status().isForbidden());
    photo(id, "FIELD_OTHER", "BEFORE").andExpect(status().is4xxClientError());
    photo(id, "FIELD", "BEFORE").andExpect(status().isOk());
    action(id, "FIELD", "START", Map.of()).andExpect(status().isOk());
    var work = workflow.active(id);
    assertEquals(
        1L,
        ((Number)
                db.one(
                        "SELECT count(*) n FROM attachment WHERE work_order_id=? AND evidence_stage='BEFORE'",
                        work.get("id"))
                    .get("n"))
            .longValue());

    photo(id, "FIELD", "AFTER").andExpect(status().isOk());
    action(id, "FIELD", "REPORT", Map.of("content", "Repaired with a start photo on record"))
        .andExpect(status().isOk());
    action(id, "LEADER", "FORWARD_REPORT", Map.of()).andExpect(status().isOk());
    assertNull(
        db.one("SELECT report_id FROM attachment WHERE work_order_id=?", work.get("id"))
            .get("report_id"));
  }

  @Test
  void startRecordsTheWorkerLocationAndDistanceFromTheReport() throws Exception {
    UUID id = accepted();
    db.run(
        "UPDATE complaint SET location=ST_SetSRID(ST_MakePoint(100.5,13.75),4326)::geography WHERE id=?",
        id);
    photo(id, "FIELD", "BEFORE").andExpect(status().isOk());
    action(id, "FIELD", "START", Map.of("latitude", 13.75)).andExpect(status().isBadRequest());
    action(id, "FIELD", "START", Map.of("latitude", 95, "longitude", 100.5))
        .andExpect(status().isBadRequest());
    action(id, "FIELD", "START", Map.of("latitude", 13.76, "longitude", 100.5))
        .andExpect(status().isOk());
    var work = workflow.active(id);
    double meters = ((Number) work.get("start_distance_m")).doubleValue();
    assertTrue(meters > 1000 && meters < 1200, "about 1.1 km, got " + meters);
    mvc.perform(get("/api/complaints/" + id).with(user(names.get("LEADER"))))
        .andExpect(jsonPath("$.workOrders[0].start_distance_m").isNumber());

    action(id, "FIELD", "UNDO_START", Map.of("reason", "Wrong site")).andExpect(status().isOk());
    assertNull(workflow.active(id).get("start_latitude"));
    action(id, "FIELD", "START", Map.of()).andExpect(status().isOk());
    assertNull(workflow.active(id).get("start_distance_m"));
  }

  @Test
  void peopleListIncludesGovRankForGrouping() throws Exception {
    db.run("UPDATE app_user SET gov_role='FIELD_SENIOR' WHERE id=?", users.get("FIELD"));
    mvc.perform(get("/api/people?role=FIELD").with(user(names.get("LEADER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[?(@.display_name=='Test FIELD')].gov_role").value("FIELD_SENIOR"));
  }

  @Test
  void fieldCanUndoStartOnlyBeforeReporting() throws Exception {
    UUID id = accepted();
    photo(id, "FIELD", "BEFORE").andExpect(status().isOk());
    action(id, "FIELD", "START", Map.of()).andExpect(status().isOk());
    mvc.perform(get("/api/complaints/" + id).with(user(names.get("FIELD"))))
        .andExpect(jsonPath("$.actions[?(@.action=='UNDO_START')]").isNotEmpty());
    action(id, "FIELD", "UNDO_START", Map.of()).andExpect(status().isBadRequest());
    action(id, "LEADER", "UNDO_START", Map.of("reason", "Not mine"))
        .andExpect(status().isForbidden());
    action(id, "FIELD", "UNDO_START", Map.of("reason", "Started by mistake"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("ACCEPTED"));
    assertEquals("ACCEPTED", workflow.active(id).get("status"));

    action(id, "FIELD", "START", Map.of()).andExpect(status().isOk());
    photo(id, "FIELD", "AFTER").andExpect(status().isOk());
    action(id, "FIELD", "REPORT", Map.of("content", "Done")).andExpect(status().isOk());
    db.run("UPDATE complaint SET status='IN_PROGRESS' WHERE id=?", id);
    action(id, "FIELD", "UNDO_START", Map.of("reason", "Too late"))
        .andExpect(status().isConflict());
  }

  @Test
  void requestedItemsReachTheLeaderAndCanBeWithdrawnBeforeAProposal() throws Exception {
    UUID id = accepted();
    action(id, "FIELD", "REQUEST_RESOURCE", Map.of("reason", "Need pipes"))
        .andExpect(status().isBadRequest());
    action(
            id,
            "FIELD",
            "REQUEST_RESOURCE",
            Map.of(
                "reason",
                "Need pipes",
                "items",
                List.of(Map.of("name", "PVC pipe", "quantity", 0, "unit", "pieces"))))
        .andExpect(status().isBadRequest());
    action(
            id,
            "FIELD",
            "REQUEST_RESOURCE",
            Map.of(
                "reason",
                "Need pipes",
                "items",
                List.of(Map.of("name", "PVC pipe", "quantity", 3, "unit", "pieces"))))
        .andExpect(status().isOk());
    mvc.perform(get("/api/complaints/" + id).with(user(names.get("LEADER"))))
        .andExpect(status().isOk())
        .andExpect(
            jsonPath("$.resources[0].requested_items")
                .value(org.hamcrest.Matchers.containsString("PVC pipe")));
    action(id, "LEADER", "WITHDRAW_RESOURCE_REQUEST", Map.of("reason", "Not mine"))
        .andExpect(status().isForbidden());
    action(id, "FIELD", "WITHDRAW_RESOURCE_REQUEST", Map.of("reason", "Normal stock is enough"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("ACCEPTED"));
    assertEquals("WITHDRAWN", workflow.resource(id).get("status"));
  }

  UUID resourceAt(String complaintStatus, String resourceStatus) {
    UUID id = complaint(complaintStatus);
    UUID resource = UUID.randomUUID();
    db.run(
        "INSERT INTO resource_request(id,complaint_id,requested_by,status,approver_id) VALUES(?,?,?,?,?)",
        resource,
        id,
        users.get("LEADER"),
        resourceStatus,
        resourceStatus.equals("PENDING") ? users.get("APPROVER") : null);
    if (resourceStatus.equals("PENDING"))
      db.run(
          "INSERT INTO approval_assignment(resource_id,step,approver_id) VALUES(?,1,?)",
          resource,
          users.get("APPROVER"));
    return id;
  }

  @Test
  void leaderAndOfficerCanWithdrawUntilTheNextPersonDecides() throws Exception {
    UUID proposal = resourceAt("RESOURCE_CHECK", "CHECK");
    action(proposal, "LEADER", "WITHDRAW_PROPOSAL", Map.of("reason", "Fix the quantities"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("RESOURCE_REVISION"));
    assertEquals("REVISION", workflow.resource(proposal).get("status"));

    UUID approval = resourceAt("RESOURCE_APPROVAL", "PENDING");
    action(approval, "OFFICER", "WITHDRAW_APPROVAL", Map.of("reason", "Wrong approver"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("RESOURCE_CHECK"));
    var resource = workflow.resource(approval);
    assertEquals("CHECK", resource.get("status"));
    assertNull(resource.get("approver_id"));
    assertTrue(
        db.list("SELECT step FROM approval_assignment WHERE resource_id=?", resource.get("id"))
            .isEmpty());

    UUID decided = resourceAt("RESOURCE_APPROVAL", "PENDING");
    db.run(
        "UPDATE approval_assignment SET decision='APPROVE',decided_at=now() WHERE resource_id=?",
        workflow.resource(decided).get("id"));
    action(decided, "OFFICER", "WITHDRAW_APPROVAL", Map.of("reason", "Too late"))
        .andExpect(status().isConflict());
  }

  @Test
  void leaderCanPickSeveralFieldWorkersAtomically() throws Exception {
    UUID rejected = complaint("TRIAGED");
    action(
            rejected,
            "LEADER",
            "ASSIGN",
            Map.of(
                "assigneeId",
                users.get("FIELD"),
                "memberIds",
                List.of(users.get("FIELD"), users.get("FIELD_OTHER"))))
        .andExpect(status().isForbidden());
    assertTrue(db.list("SELECT id FROM work_order WHERE complaint_id=?", rejected).isEmpty());
    action(
            rejected,
            "LEADER",
            "ASSIGN",
            Map.of(
                "assigneeId",
                users.get("FIELD"),
                "memberIds",
                List.of(users.get("FIELD_2"), users.get("FIELD_OTHER"))))
        .andExpect(status().isBadRequest());

    UUID id = complaint("TRIAGED");
    action(
            id,
            "LEADER",
            "ASSIGN",
            Map.of(
                "assigneeId",
                users.get("FIELD"),
                "memberIds",
                List.of(users.get("FIELD"), users.get("FIELD_2"))))
        .andExpect(status().isOk());
    var work = workflow.active(id);
    assertEquals(users.get("FIELD"), work.get("assignee_id"));
    assertEquals(
        Set.of(users.get("FIELD"), users.get("FIELD_2")),
        new HashSet<>(
            db
                .list("SELECT user_id FROM work_member WHERE work_order_id=?", work.get("id"))
                .stream()
                .map(row -> row.get("user_id"))
                .toList()));
    mvc.perform(get("/api/complaints/" + id).with(user(names.get("FIELD_2"))))
        .andExpect(status().isOk());
  }
}
