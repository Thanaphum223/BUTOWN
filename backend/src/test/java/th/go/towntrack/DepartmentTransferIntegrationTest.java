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
import org.springframework.test.web.servlet.*;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class DepartmentTransferIntegrationTest {
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
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Workflow test town')", town);
    db.run("INSERT INTO department(id,municipality_id,name) VALUES(?,?,'Engineering')", dept, town);
    definition = workflow.createDefault(town, 1);
    db.run(
        "INSERT INTO category(id,municipality_id,department_id,workflow_id,name,sla_hours) VALUES(?,?,?,?,'Road',72)",
        category,
        town,
        dept,
        definition);
    for (String role : List.of("CITIZEN", "OFFICER", "LEADER", "FIELD", "APPROVER", "ADMIN")) {
      UUID id = UUID.randomUUID();
      String name = "municipal_" + id;
      users.put(role, id);
      names.put(role, name);
      db.run(
          "INSERT INTO app_user(id,municipality_id,department_id,username,password_hash,display_name,role) VALUES(?,?,?,?,?,?,?)",
          id,
          town,
          Access.departmentRole(role) ? dept : null,
          name,
          "x",
          "Test " + role,
          role);
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
    if (action.equals("START"))
      mvc.perform(WorkflowTestData.startPhoto(id).with(user(names.get(role))).with(csrf()));
    Map<String, Object> body = WorkflowTestData.withDefaults(action, values);
    body.put("action", action);
    body.put("version", db.one("SELECT version FROM complaint WHERE id=?", id).get("version"));
    return mvc.perform(
        post("/api/complaints/" + id + "/actions")
            .with(user(names.get(role)))
            .with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(body)));
  }

  UUID assigned() throws Exception {
    UUID id = complaint("TRIAGED");
    action(
            id,
            "LEADER",
            "ASSIGN",
            Map.of("assigneeId", users.get("FIELD"), "reason", "Dispatch field team"))
        .andExpect(status().isOk());
    return id;
  }

  UUID departmentB, leaderB, fieldB;

  void secondDepartment() {
    departmentB = UUID.randomUUID();
    leaderB = UUID.randomUUID();
    fieldB = UUID.randomUUID();
    db.run(
        "INSERT INTO department(id,municipality_id,name) VALUES(?,?,'Drainage')",
        departmentB,
        town);
    for (String role : List.of("LEADER_B", "FIELD_B")) {
      UUID id = role.equals("LEADER_B") ? leaderB : fieldB;
      String username = "transfer_" + id;
      users.put(role, id);
      names.put(role, username);
      db.run(
          "INSERT INTO app_user(id,municipality_id,department_id,username,password_hash,display_name,role) VALUES(?,?,?,?,'x',?,?)",
          id,
          town,
          departmentB,
          username,
          role,
          role.split("_")[0]);
    }
  }

  void photos(UUID id, String role) {
    for (String stage : List.of("BEFORE", "AFTER"))
      db.run(
          "INSERT INTO attachment(id,complaint_id,uploaded_by,original_name,content_type,size_bytes,sha256,storage_key,evidence_stage) VALUES(?,?,?,?,'image/png',10,?,?,?)",
          UUID.randomUUID(),
          id,
          users.get(role),
          stage + ".png",
          "0".repeat(64),
          UUID.randomUUID().toString(),
          stage);
  }

  UUID reported() throws Exception {
    UUID id = assigned();
    action(id, "FIELD", "ACCEPT", Map.of()).andExpect(status().isOk());
    action(id, "FIELD", "START", Map.of()).andExpect(status().isOk());
    photos(id, "FIELD");
    action(
            id,
            "FIELD",
            "REPORT",
            Map.of("content", "Engineering work finished; drainage requires next department"))
        .andExpect(status().isOk());
    return id;
  }

  @Test
  void sequentialHandoffPreservesCaseDeadlineEvidenceAndClosesOnlyAfterSecondReport()
      throws Exception {
    secondDepartment();
    UUID id = reported();
    Object due = db.one("SELECT due_at FROM complaint WHERE id=?", id).get("due_at");
    action(
            id,
            "LEADER",
            "REQUEST_TRANSFER",
            Map.of(
                "targetDepartmentId",
                departmentB,
                "reason",
                "Engineering completed; drainage must clear the culvert"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("TRANSFER_PENDING"));
    mvc.perform(
            get("/api/complaints?status=TRANSFER_PENDING&activeOnly=true")
                .with(user(names.get("OFFICER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].id").value(id.toString()));
    mvc.perform(get("/api/complaints/" + id).with(user(names.get("CITIZEN"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.complaint.transfer_department_name").value("Drainage"))
        .andExpect(jsonPath("$.transfers").doesNotExist());
    action(
            id,
            "OFFICER",
            "TRANSFER_DEPARTMENT",
            Map.of("leaderId", leaderB, "reason", "Confirmed receiving department"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("TRIAGED"));
    assertEquals(due, db.one("SELECT due_at FROM complaint WHERE id=?", id).get("due_at"));
    assertEquals(
        "COMPLETE", db.one("SELECT status FROM work_order WHERE complaint_id=?", id).get("status"));
    mvc.perform(get("/api/complaints/" + id).with(user(names.get("FIELD"))))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/complaints/" + id + "?historyOnly=true").with(user(names.get("FIELD"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.actions").isEmpty());
    // The second leader must not validate or transfer the previous team's old report.
    action(id, "LEADER_B", "FORWARD_REPORT", Map.of()).andExpect(status().is4xxClientError());
    action(id, "LEADER_B", "ASSIGN", Map.of("assigneeId", fieldB)).andExpect(status().isOk());
    action(id, "FIELD_B", "ACCEPT", Map.of()).andExpect(status().isOk());
    action(id, "FIELD_B", "START", Map.of()).andExpect(status().isOk());
    photos(id, "FIELD_B");
    action(id, "FIELD_B", "REPORT", Map.of("content", "Drainage work finished"))
        .andExpect(status().isOk());
    action(id, "LEADER_B", "FORWARD_REPORT", Map.of()).andExpect(status().isOk());
    action(id, "OFFICER", "VERIFY", Map.of()).andExpect(status().isOk());
    action(id, "OFFICER", "CLOSE", Map.of("reason", "Both departments completed and verified"))
        .andExpect(status().isOk());
    assertEquals(2, db.list("SELECT id FROM field_report WHERE complaint_id=?", id).size());
    assertEquals(
        4,
        db.list("SELECT id FROM attachment WHERE complaint_id=? AND report_id IS NOT NULL", id)
            .size());
    assertEquals(
        2,
        db.list("SELECT id FROM attachment WHERE complaint_id=? AND work_order_id IS NOT NULL", id)
            .size());
    assertEquals(
        1,
        db.list("SELECT id FROM department_transfer WHERE complaint_id=? AND state='ACCEPTED'", id)
            .size());
  }

  @Test
  void declinedOrderFromPreviousDepartmentDoesNotBlockReceivingLeaderReturn() throws Exception {
    secondDepartment();
    UUID id = assigned();
    UUID declined = (UUID) db.one("SELECT id FROM work_order WHERE complaint_id=?", id).get("id");
    action(id, "FIELD", "DECLINE", Map.of("reason", "First team unavailable"))
        .andExpect(status().isOk());
    action(id, "LEADER", "ASSIGN", Map.of("assigneeId", users.get("FIELD")))
        .andExpect(status().isOk());
    action(id, "FIELD", "ACCEPT", Map.of()).andExpect(status().isOk());
    action(id, "FIELD", "START", Map.of()).andExpect(status().isOk());
    photos(id, "FIELD");
    action(id, "FIELD", "REPORT", Map.of("content", "Engineering completed"))
        .andExpect(status().isOk());
    action(
            id,
            "LEADER",
            "REQUEST_TRANSFER",
            Map.of("targetDepartmentId", departmentB, "reason", "Drainage must continue"))
        .andExpect(status().isOk());
    action(
            id,
            "OFFICER",
            "TRANSFER_DEPARTMENT",
            Map.of("leaderId", leaderB, "reason", "Dispatch next department"))
        .andExpect(status().isOk());
    action(id, "LEADER_B", "RETURN_ASSIGNMENT", Map.of("reason", "Wrong receiving department"))
        .andExpect(status().isOk());
    var old = db.one("SELECT status,handed_off FROM work_order WHERE id=?", declined);
    assertEquals("DECLINED", old.get("status"));
    assertEquals(true, old.get("handed_off"));
  }

  @Test
  void citizenTrackingIncludesReceivingDepartmentBeforeAndAfterHandoff() throws Exception {
    secondDepartment();
    UUID id = reported();
    db.run("INSERT INTO follower(complaint_id,user_id) VALUES(?,?)", id, users.get("CITIZEN"));
    action(
            id,
            "LEADER",
            "REQUEST_TRANSFER",
            Map.of("targetDepartmentId", departmentB, "reason", "Internal private handoff note"))
        .andExpect(status().isOk());
    for (String tab : List.of("mine", "following"))
      mvc.perform(get("/api/citizen/tracking?tab=" + tab).with(user(names.get("CITIZEN"))))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.items[0].transfer_department_name").value("Drainage"))
          .andExpect(jsonPath("$.items[0].reason").doesNotExist());
    action(
            id,
            "OFFICER",
            "TRANSFER_DEPARTMENT",
            Map.of("leaderId", leaderB, "reason", "Confirmed next department"))
        .andExpect(status().isOk());
    for (String tab : List.of("mine", "following"))
      mvc.perform(get("/api/citizen/tracking?tab=" + tab).with(user(names.get("CITIZEN"))))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.items[0].transfer_department_name").value("Drainage"));
  }

  @Test
  void officerCanReturnTransferWithReasonAndLeaderCanCorrectRequest() throws Exception {
    secondDepartment();
    UUID id = reported();
    action(
            id,
            "LEADER",
            "REQUEST_TRANSFER",
            Map.of("targetDepartmentId", departmentB, "reason", "Please continue drainage work"))
        .andExpect(status().isOk());
    action(id, "OFFICER", "RETURN_TRANSFER", Map.of("reason", "   "))
        .andExpect(status().isBadRequest());
    action(id, "OFFICER", "RETURN_TRANSFER", Map.of("reason", "Clarify remaining work scope"))
        .andExpect(status().isOk());
    assertEquals(
        "RETURNED",
        db.one("SELECT state FROM department_transfer WHERE complaint_id=?", id).get("state"));
    action(
            id,
            "LEADER",
            "REQUEST_TRANSFER",
            Map.of("targetDepartmentId", departmentB, "reason", "Clear the culvert only"))
        .andExpect(status().isOk());
    assertEquals(2, db.list("SELECT id FROM department_transfer WHERE complaint_id=?", id).size());
  }

  @Test
  void wrongAssignmentReturnsToOfficerForAnotherDepartmentWithoutResettingDeadline()
      throws Exception {
    secondDepartment();
    UUID id = complaint("TRIAGED");
    action(id, "LEADER", "RETURN_ASSIGNMENT", Map.of("reason", "Wrong department"))
        .andExpect(status().isOk());
    action(
            id,
            "OFFICER",
            "TRANSFER_DEPARTMENT",
            Map.of(
                "targetDepartmentId",
                departmentB,
                "leaderId",
                leaderB,
                "reason",
                "Correct receiving department"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("TRIAGED"));
    assertEquals(
        leaderB, db.one("SELECT leader_id FROM complaint WHERE id=?", id).get("leader_id"));
  }

  @Test
  void transferRejectsMissingEvidenceSelfForeignDepartmentAndWrongLeaderWithoutPartialWrites()
      throws Exception {
    secondDepartment();
    UUID id = reported();
    action(
            id,
            "LEADER",
            "REQUEST_TRANSFER",
            Map.of("targetDepartmentId", dept, "reason", "Cannot self transfer"))
        .andExpect(status().isBadRequest());
    action(
            id,
            "LEADER",
            "REQUEST_TRANSFER",
            Map.of("targetDepartmentId", UUID.randomUUID(), "reason", "No foreign department"))
        .andExpect(status().isNotFound());
    db.run(
        "UPDATE attachment SET evidence_stage='GENERAL' WHERE complaint_id=? AND evidence_stage='AFTER'",
        id);
    action(
            id,
            "LEADER",
            "REQUEST_TRANSFER",
            Map.of("targetDepartmentId", departmentB, "reason", "Missing evidence"))
        .andExpect(status().isBadRequest());
    assertEquals(
        "LEADER_REVIEW", db.one("SELECT status FROM complaint WHERE id=?", id).get("status"));
    db.run(
        "UPDATE attachment SET evidence_stage='AFTER' WHERE complaint_id=? AND original_name='AFTER.png'",
        id);
    action(
            id,
            "LEADER",
            "REQUEST_TRANSFER",
            Map.of("targetDepartmentId", departmentB, "reason", "Valid transfer"))
        .andExpect(status().isOk());
    action(
            id,
            "OFFICER",
            "TRANSFER_DEPARTMENT",
            Map.of("leaderId", users.get("LEADER"), "reason", "Wrong leader"))
        .andExpect(status().isForbidden());
    assertEquals(
        "PENDING",
        db.one("SELECT state FROM department_transfer WHERE complaint_id=?", id).get("state"));
    assertEquals("IN_PROGRESS", workflow.active(id).get("status"));
  }

  @Test
  void formerFieldCannotReadUnrelatedCaseThroughHistoryOrRepeatStaleTransfer() throws Exception {
    secondDepartment();
    UUID id = reported();
    action(
            id,
            "LEADER",
            "REQUEST_TRANSFER",
            Map.of("targetDepartmentId", departmentB, "reason", "Continue with drainage"))
        .andExpect(status().isOk());
    var version = db.one("SELECT version FROM complaint WHERE id=?", id).get("version");
    action(
            id,
            "OFFICER",
            "TRANSFER_DEPARTMENT",
            Map.of("leaderId", leaderB, "reason", "Reviewed scope"))
        .andExpect(status().isOk());
    UUID unrelated = complaint("NEW");
    mvc.perform(
            get("/api/complaints/" + unrelated + "?historyOnly=true")
                .with(user(names.get("FIELD"))))
        .andExpect(status().isForbidden());
    mvc.perform(
            post("/api/complaints/" + id + "/actions")
                .with(user(names.get("OFFICER")))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsString(
                        Map.of(
                            "action",
                            "TRANSFER_DEPARTMENT",
                            "leaderId",
                            leaderB,
                            "version",
                            version,
                            "reason",
                            "Duplicate"))))
        .andExpect(status().isConflict());
    assertEquals(1, db.list("SELECT id FROM department_transfer WHERE complaint_id=?", id).size());
  }
}
