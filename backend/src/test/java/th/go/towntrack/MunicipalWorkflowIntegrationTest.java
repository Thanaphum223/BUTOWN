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
class MunicipalWorkflowIntegrationTest {
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

  @Test
  void officerCanRecoverAnUndispatchedCaseWithADisabledHead() throws Exception {
    UUID id = complaint("TRIAGED");
    UUID formerHead = users.get("LEADER");
    db.run("UPDATE app_user SET enabled=false WHERE id=?", formerHead);
    db.run("UPDATE app_user SET department_id=? WHERE id=?", dept, users.get("ADMIN"));
    mvc.perform(get("/api/complaints/" + id).with(user(names.get("OFFICER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.actions[?(@.action=='REASSIGN_LEADER')]").isNotEmpty());
    mvc.perform(get("/api/complaints?queue=handoff").with(user(names.get("OFFICER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].id").value(id.toString()));
    action(id, "OFFICER", "REASSIGN_LEADER", Map.of("leaderId", users.get("ADMIN")))
        .andExpect(status().isBadRequest());
    action(
            id,
            "OFFICER",
            "REASSIGN_LEADER",
            Map.of("leaderId", users.get("ADMIN"), "reason", "Replace unavailable head"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("TRIAGED"));
    assertEquals(
        users.get("ADMIN"),
        db.one("SELECT leader_id FROM complaint WHERE id=?", id).get("leader_id"));
    var audit =
        db.one(
            "SELECT reason,details::text details FROM audit_event WHERE complaint_id=? AND action='REASSIGN_LEADER'",
            id);
    assertEquals("Replace unavailable head", audit.get("reason"));
    assertTrue(audit.get("details").toString().contains(formerHead.toString()));
    assertTrue(audit.get("details").toString().contains(users.get("ADMIN").toString()));
    action(id, "ADMIN", "ASSIGN", Map.of("assigneeId", users.get("FIELD")))
        .andExpect(status().isForbidden());
    // An administrator must use the LEADER view, rather than bypassing the operational role.
    db.run("UPDATE app_user SET role='LEADER' WHERE id=?", users.get("ADMIN"));
    action(id, "ADMIN", "ASSIGN", Map.of("assigneeId", users.get("FIELD")))
        .andExpect(status().isOk());
    action(id, "FIELD", "ACCEPT", Map.of()).andExpect(status().isOk());
  }

  @Test
  void recoveryCannotTakeOverValidAssignmentsOrPreviouslyDispatchedWork() throws Exception {
    UUID id = complaint("TRIAGED");
    action(
            id,
            "OFFICER",
            "REASSIGN_LEADER",
            Map.of("leaderId", users.get("LEADER"), "reason", "Attempt takeover"))
        .andExpect(status().isConflict());
    mvc.perform(get("/api/complaints?queue=handoff").with(user(names.get("OFFICER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(0));
    UUID dispatched = assigned();
    action(dispatched, "FIELD", "DECLINE", Map.of("reason", "Vehicle unavailable"))
        .andExpect(status().isOk());
    db.run("UPDATE app_user SET enabled=false WHERE id=?", users.get("LEADER"));
    action(
            dispatched,
            "OFFICER",
            "REASSIGN_LEADER",
            Map.of("leaderId", users.get("ADMIN"), "reason", "Already dispatched"))
        .andExpect(status().isConflict());
  }

  @Test
  void missingOrChangedHeadCanBeReplacedButTargetsRemainScoped() throws Exception {
    UUID id = complaint("TRIAGED");
    db.run("UPDATE complaint SET leader_id=NULL WHERE id=?", id);
    action(
            id,
            "OFFICER",
            "REASSIGN_LEADER",
            Map.of("leaderId", users.get("FIELD"), "reason", "Wrong target role"))
        .andExpect(status().isNotFound());
    db.run("UPDATE complaint SET leader_id=? WHERE id=?", users.get("CITIZEN"), id);
    mvc.perform(get("/api/complaints/" + id).with(user(names.get("OFFICER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.actions[?(@.action=='REASSIGN_LEADER')]").isNotEmpty());
    action(
            id,
            "OFFICER",
            "REASSIGN_LEADER",
            Map.of("leaderId", users.get("ADMIN"), "reason", "Wrong department"))
        .andExpect(status().isForbidden());
    action(
            id,
            "CITIZEN",
            "REASSIGN_LEADER",
            Map.of("leaderId", users.get("LEADER"), "reason", "Wrong actor"))
        .andExpect(status().isForbidden());
  }

  @Test
  void activeQueuesOnlyContainTheCurrentRolesActionableStages() throws Exception {
    UUID fresh = complaint("NEW");
    UUID triaged = complaint("TRIAGED");
    UUID resource = complaint("RESOURCE_DRAFT");
    UUID review = complaint("OFFICER_REVIEW");
    UUID assigned = complaint("ASSIGNED");
    UUID pendingApproval = complaint("RESOURCE_APPROVAL");
    for (UUID caseId : List.of(assigned, pendingApproval, review))
      db.run(
          "INSERT INTO work_order(id,complaint_id,assignee_id,assigned_by,due_at) VALUES(?,?,?,?,now()+interval '3 days')",
          UUID.randomUUID(),
          caseId,
          users.get("FIELD"),
          users.get("LEADER"));
    for (UUID caseId : List.of(pendingApproval, review))
      db.run(
          "INSERT INTO resource_request(id,complaint_id,requested_by,approver_id) VALUES(?,?,?,?)",
          UUID.randomUUID(),
          caseId,
          users.get("FIELD"),
          users.get("APPROVER"));
    var expected =
        Map.of(
            "OFFICER", Set.of(fresh.toString(), review.toString()),
            "LEADER", Set.of(triaged.toString(), resource.toString()),
            "FIELD", Set.of(assigned.toString()),
            "APPROVER", Set.of(pendingApproval.toString()));
    for (String role : expected.keySet()) {
      var result =
          json.readTree(
              mvc.perform(get("/api/complaints?activeOnly=true").with(user(names.get(role))))
                  .andExpect(status().isOk())
                  .andReturn()
                  .getResponse()
                  .getContentAsString());
      var ids = new HashSet<String>();
      result.path("items").forEach(item -> ids.add(item.path("id").asText()));
      assertEquals(expected.get(role), ids, role);
    }
  }

  @Test
  void leaderCannotInitiateResourceRequestEvenWhenStoredWorkflowAllowsIt() throws Exception {
    UUID id = complaint("TRIAGED");
    // Old published definitions remain unchanged; current role policy must still enforce FIELD-only
    // initiation.
    db.run(
        "INSERT INTO workflow_transition VALUES(?,'TRIAGED','REQUEST_RESOURCE','RESOURCE_DRAFT','LEADER') ON CONFLICT DO NOTHING",
        definition);
    mvc.perform(get("/api/complaints/" + id).with(user(names.get("LEADER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.actions[?(@.action=='REQUEST_RESOURCE')]").isEmpty());
    action(id, "LEADER", "REQUEST_RESOURCE", Map.of("reason", "Materials required"))
        .andExpect(status().isForbidden());
    assertEquals("TRIAGED", db.one("SELECT status FROM complaint WHERE id=?", id).get("status"));
  }

  @Test
  void acceptingAndStartingWorkDoNotRequireAnExplanation() throws Exception {
    UUID id = assigned();
    action(id, "FIELD", "ACCEPT", Map.of()).andExpect(status().isOk());
    action(id, "FIELD", "START", Map.of()).andExpect(status().isOk());
    assertEquals(
        "IN_PROGRESS", db.one("SELECT status FROM complaint WHERE id=?", id).get("status"));
    assertEquals(
        2L,
        ((Number)
                db.one(
                        "SELECT count(*) n FROM audit_event WHERE complaint_id=? AND actor_id=? AND action IN ('ACCEPT','START')",
                        id,
                        users.get("FIELD"))
                    .get("n"))
            .longValue());
  }

  @Test
  void leaderReturnsWrongAssignmentBeforeDispatchAndKeepsOwnReadOnlyHistory() throws Exception {
    UUID id = complaint("TRIAGED");
    action(
            id,
            "LEADER",
            "RETURN_ASSIGNMENT",
            Map.of("reason", "Wrong department; drainage belongs to another department"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("DEPARTMENT_RETURNED"));
    mvc.perform(get("/api/complaints?historyOnly=true").with(user(names.get("LEADER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].id").value(id.toString()));
    mvc.perform(get("/api/complaints/" + id + "?historyOnly=true").with(user(names.get("LEADER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.readOnlyHistory").value(true))
        .andExpect(
            jsonPath("$.history[0].reason")
                .value("Wrong department; drainage belongs to another department"))
        .andExpect(jsonPath("$.actions").isEmpty())
        .andExpect(jsonPath("$.files").isEmpty());
    action(
            id,
            "LEADER",
            "ASSIGN",
            Map.of("assigneeId", users.get("FIELD"), "reason", "Cannot dispatch returned work"))
        .andExpect(status().isForbidden());
  }

  @Test
  void leaderCannotReturnPreviouslyDispatchedCaseEvenAfterFieldDeclinesIt() throws Exception {
    UUID id = assigned();
    action(id, "FIELD", "DECLINE", Map.of("reason", "Vehicle unavailable"))
        .andExpect(status().isOk());
    action(
            id,
            "LEADER",
            "RETURN_ASSIGNMENT",
            Map.of("reason", "Too late to treat as never dispatched"))
        .andExpect(status().isConflict());
  }

  @Test
  void declinedFieldAssignmentRemainsInOwnHistoryWithoutFuturePrivateDataOrActions()
      throws Exception {
    UUID id = assigned();
    action(id, "FIELD", "DECLINE", Map.of("reason", "Equipment unavailable"))
        .andExpect(status().isOk());
    mvc.perform(get("/api/complaints?historyOnly=true").with(user(names.get("FIELD"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].id").value(id.toString()));
    mvc.perform(get("/api/complaints/" + id + "?historyOnly=true").with(user(names.get("FIELD"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.readOnlyHistory").value(true))
        .andExpect(jsonPath("$.history[0].reason").value("Equipment unavailable"))
        .andExpect(jsonPath("$.actions").isEmpty())
        .andExpect(jsonPath("$.resources").isEmpty())
        .andExpect(jsonPath("$.reports").isEmpty())
        .andExpect(jsonPath("$.files").isEmpty());
    mvc.perform(get("/api/complaints/" + id).with(user(names.get("FIELD"))))
        .andExpect(status().isForbidden());
    action(id, "FIELD", "START", Map.of()).andExpect(status().isForbidden());
    mvc.perform(
            get("/api/complaints/" + id + "?historyOnly=true").with(user(names.get("APPROVER"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void declineRequiresRealReasonAndAuditRecordsRoleAtTheTime() throws Exception {
    UUID id = assigned();
    action(id, "FIELD", "DECLINE", Map.of("reason", "   ")).andExpect(status().isBadRequest());
    action(id, "FIELD", "DECLINE", Map.of("reason", "Vehicle unavailable"))
        .andExpect(status().isOk());
    var detail =
        json.readTree(
            db.one(
                    "SELECT details::text d FROM audit_event WHERE complaint_id=? AND action='DECLINE'",
                    id)
                .get("d")
                .toString());
    assertEquals("FIELD", detail.path("actorRole").asText());
    assertEquals(dept.toString(), detail.path("actorDepartmentId").asText());
  }

  @Test
  void resourceProposalRequiresLineItemsEvenWhenLegacyAmountIsProvided() throws Exception {
    UUID id = assigned();
    action(id, "FIELD", "ACCEPT", Map.of()).andExpect(status().isOk());
    action(id, "FIELD", "REQUEST_RESOURCE", Map.of("reason", "Need materials"))
        .andExpect(status().isOk());
    db.run(
        "INSERT INTO attachment(id,complaint_id,uploaded_by,original_name,content_type,size_bytes,sha256,storage_key) VALUES(?,?,?,'request.pdf','application/pdf',10,?,?)",
        UUID.randomUUID(),
        id,
        users.get("LEADER"),
        "0".repeat(64),
        UUID.randomUUID().toString());
    action(
            id,
            "LEADER",
            "PROPOSE",
            Map.of("proposal", "Materials", "amount", 100, "durationDays", 1))
        .andExpect(status().isBadRequest());
    assertEquals(
        "RESOURCE_DRAFT", db.one("SELECT status FROM complaint WHERE id=?", id).get("status"));
  }

  @Test
  void roleQueuesGroupOnlyActionsThatRoleMustPerform() throws Exception {
    complaint("NEW");
    UUID transfer = complaint("TRANSFER_PENDING");
    complaint("ASSIGNED");
    complaint("OFFICER_REVIEW");
    mvc.perform(
            get("/api/complaints?activeOnly=true&queue=handoff").with(user(names.get("OFFICER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(1))
        .andExpect(jsonPath("$.items[0].id").value(transfer.toString()));
    mvc.perform(get("/api/complaints?queue=handoff").with(user(names.get("LEADER"))))
        .andExpect(status().isBadRequest());
    mvc.perform(get("/api/catalog").with(user(names.get("FIELD"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.queues[0].value").value("accept"));
  }

  @Test
  void fieldReportPersistsSupplementaryPdfAndVideoWithBeforeAfterPhotos() throws Exception {
    UUID id = assigned();
    action(id, "FIELD", "ACCEPT", Map.of()).andExpect(status().isOk());
    action(id, "FIELD", "START", Map.of()).andExpect(status().isOk());
    for (String stage : List.of("BEFORE", "AFTER")) {
      var image = new java.awt.image.BufferedImage(2, 2, java.awt.image.BufferedImage.TYPE_INT_RGB);
      var bytes = new java.io.ByteArrayOutputStream();
      javax.imageio.ImageIO.write(image, "png", bytes);
      mvc.perform(
              multipart("/api/complaints/" + id + "/files")
                  .file(
                      new org.springframework.mock.web.MockMultipartFile(
                          "file", stage + ".png", "image/png", bytes.toByteArray()))
                  .param("evidenceStage", stage)
                  .with(user(names.get("FIELD")))
                  .with(csrf()))
          .andExpect(status().isOk());
    }
    for (var file :
        List.of(
            new org.springframework.mock.web.MockMultipartFile(
                "file", "extra.pdf", "application/pdf", "%PDF-1.4 supplementary".getBytes()),
            new org.springframework.mock.web.MockMultipartFile(
                "file",
                "extra.mp4",
                "video/mp4",
                new byte[] {0, 0, 0, 24, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0, 0, 0, 0}))) {
      mvc.perform(
              multipart("/api/complaints/" + id + "/files")
                  .file(file)
                  .with(user(names.get("FIELD")))
                  .with(csrf()))
          .andExpect(status().isOk());
    }
    action(id, "FIELD", "REPORT", Map.of("content", "Completed work with supplementary evidence"))
        .andExpect(status().isOk());
    assertEquals(
        4,
        db.list("SELECT id FROM attachment WHERE complaint_id=? AND report_id IS NOT NULL", id)
            .size());
    mvc.perform(get("/api/complaints/" + id).with(user(names.get("LEADER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.files[?(@.content_type=='video/mp4')]").isNotEmpty())
        .andExpect(jsonPath("$.files[?(@.content_type=='application/pdf')]").isNotEmpty());
  }

  @Test
  void teamMemberRetainsOwnDeclinedAssignmentHistoryWithoutNewPrivateData() throws Exception {
    UUID member = UUID.randomUUID();
    String username = "history_member_" + member;
    db.run(
        "INSERT INTO app_user(id,municipality_id,department_id,username,password_hash,display_name,role) VALUES(?,?,?,?,'x','Field team member','FIELD')",
        member,
        town,
        dept,
        username);
    var team =
        mvc.perform(
                post("/api/teams")
                    .with(user(names.get("LEADER")))
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        json.writeValueAsString(
                            Map.of(
                                "name",
                                "History team",
                                "representativeId",
                                users.get("FIELD"),
                                "memberIds",
                                List.of(users.get("FIELD"), member)))))
            .andExpect(status().isOk())
            .andReturn();
    UUID teamId =
        UUID.fromString(json.readTree(team.getResponse().getContentAsString()).path("id").asText());
    UUID id = complaint("TRIAGED");
    action(id, "LEADER", "ASSIGN", Map.of("teamId", teamId)).andExpect(status().isOk());
    action(id, "FIELD", "DECLINE", Map.of("reason", "Team vehicle unavailable"))
        .andExpect(status().isOk());
    mvc.perform(get("/api/complaints?historyOnly=true").with(user(username)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].id").value(id.toString()));
    mvc.perform(get("/api/complaints/" + id + "?historyOnly=true").with(user(username)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.workOrders[0].reason").value("Team vehicle unavailable"))
        .andExpect(jsonPath("$.actions").isEmpty())
        .andExpect(jsonPath("$.files").isEmpty());
    mvc.perform(get("/api/complaints/" + id).with(user(username)))
        .andExpect(status().isForbidden());
  }

  @Test
  void currentApproverKeepsItsResourceDocumentsInReadOnlyDecisionHistory() throws Exception {
    UUID id = complaint("TERMINATED"), resource = UUID.randomUUID();
    db.run(
        "INSERT INTO resource_request(id,complaint_id,requested_by,approver_id,status,workflow_origin) VALUES(?,?,?,?,'DENIED','PRE_ASSIGN')",
        resource,
        id,
        users.get("LEADER"),
        users.get("APPROVER"));
    db.run(
        "INSERT INTO resource_revision(id,resource_id,revision,proposal,amount,duration_days,submitted_by) VALUES(?,?,1,'Original reviewed proposal',100,1,?)",
        UUID.randomUUID(),
        resource,
        users.get("LEADER"));
    workflow.audit(
        Map.of(
            "id",
            users.get("APPROVER"),
            "role",
            "APPROVER",
            "display_name",
            "Test approver",
            "municipality_id",
            town),
        id,
        "DENY",
        "RESOURCE_APPROVAL",
        "TERMINATED",
        "Budget unavailable");
    mvc.perform(
            get("/api/complaints/" + id + "?historyOnly=true").with(user(names.get("APPROVER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.resources[0].id").value(resource.toString()))
        .andExpect(jsonPath("$.readOnlyHistory").value(true))
        .andExpect(jsonPath("$.actions").isEmpty());
  }
}
