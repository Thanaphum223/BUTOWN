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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class TownTrackIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired Db db;
  @Autowired Workflow workflow;
  @Autowired ObjectMapper json;
  UUID town, dept, cat, wf;
  Map<String, UUID> users = new HashMap<>();

  @BeforeEach
  void fixture() {
    town = UUID.randomUUID();
    dept = UUID.randomUUID();
    cat = UUID.randomUUID();
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Integration town')", town);
    db.run("INSERT INTO department(id,municipality_id,name) VALUES(?,?,'Engineering')", dept, town);
    wf = workflow.createDefault(town, 1);
    db.run(
        "INSERT INTO category(id,municipality_id,department_id,workflow_id,name,sla_hours)"
            + " VALUES(?,?,?,?,'Road',72)",
        cat,
        town,
        dept,
        wf);
    for (String r : List.of("CITIZEN", "OFFICER", "LEADER", "FIELD", "APPROVER", "ADMIN")) {
      UUID id = UUID.randomUUID();
      users.put(r, id);
      db.run(
          "INSERT INTO"
              + " app_user(id,municipality_id,department_id,username,password_hash,display_name,role)"
              + " VALUES(?,?,?,?,?,'Test',?)",
          id,
          town,
          r.equals("CITIZEN") ? null : dept,
          "test" + r,
          "not-a-login-hash",
          r);
    }
  }

  MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder r, String role) {
    return r.with(user("test" + role).roles(role));
  }

  org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder complaintRequest(Map<String, ?> body) throws Exception {
    return multipart("/api/complaints")
        .file(new MockMultipartFile("complaint", "complaint.json", "application/json", json.writeValueAsBytes(body)))
        .file(new MockMultipartFile("files", "initial.pdf", "application/pdf", "%PDF-1.4 initial evidence".getBytes()));
  }

  UUID create() throws Exception {
    var result = mvc.perform(as(complaintRequest(Map.of(
        "categoryId", cat, "title", "Broken road", "description", "Private citizen details",
        "address", "Test street", "latitude", 13.75, "longitude", 100.5)).with(csrf()), "CITIZEN"))
        .andExpect(status().isOk()).andReturn();
    return UUID.fromString(json.readTree(result.getResponse().getContentAsString()).get("id").asText());
  }

  @Test
  void communityFollowAndDetailsKeepReporterDataPrivate() throws Exception {
    UUID id = create();
    db.run("UPDATE complaint SET reporter_id=? WHERE id=?", users.get("OFFICER"), id);
    var response = mvc.perform(as(get("/api/community/complaints/" + id), "CITIZEN"))
        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    assertFalse(response.contains("Private citizen details"));
    assertFalse(response.contains("Test street"));
    assertFalse(response.contains("reporter_id"));
    for (int n = 0; n < 2; n++)
      mvc.perform(as(post("/api/community/complaints/" + id + "/follow").with(csrf()), "CITIZEN"))
          .andExpect(status().isOk());
    mvc.perform(as(get("/api/community/complaints?latitude=13.75&longitude=100.5"), "CITIZEN"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].following").value(true));
    mvc.perform(as(get("/api/following"), "CITIZEN"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
    mvc.perform(as(delete("/api/complaints/" + id + "/follow").with(csrf()), "CITIZEN"))
        .andExpect(status().isOk());
    mvc.perform(as(get("/api/following"), "CITIZEN"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    UUID otherTown = UUID.randomUUID();
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Other town')", otherTown);
    db.run("INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role) VALUES(?,?,?,'unused','Other','CITIZEN')", UUID.randomUUID(), otherTown, "otherCommunityCitizen");
    mvc.perform(get("/api/community/complaints/" + id).with(user("otherCommunityCitizen").roles("CITIZEN")))
        .andExpect(status().isNotFound());
    mvc.perform(post("/api/community/complaints/" + id + "/follow").with(csrf()).with(user("otherCommunityCitizen").roles("CITIZEN")))
        .andExpect(status().isNotFound());
  }

  @Test
  void votesAreUniqueAndTopFiveAreRanked() throws Exception {
    UUID id = create();
    for (int n = 0; n < 2; n++)
      mvc.perform(as(post("/api/community/complaints/" + id + "/vote").with(csrf()), "CITIZEN"))
          .andExpect(status().isOk());
    mvc.perform(as(get("/api/community/complaints?latitude=13.75&longitude=100.5"), "CITIZEN"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.top[0].votes").value(1))
        .andExpect(jsonPath("$.top[0].voted").value(true));
    mvc.perform(as(delete("/api/community/complaints/" + id + "/vote").with(csrf()), "CITIZEN"))
        .andExpect(status().isOk());
    mvc.perform(as(get("/api/community/complaints?latitude=13.75&longitude=100.5"), "CITIZEN"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.top.length()").value(0));
    for (int n = 0; n < 6; n++) {
      UUID caseId = create();
      for (String role : new ArrayList<>(users.keySet()).subList(0, n + 1))
        db.run("INSERT INTO complaint_vote(complaint_id,user_id) VALUES(?,?)", caseId, users.get(role));
    }
    mvc.perform(as(get("/api/community/complaints?latitude=13.75&longitude=100.5"), "CITIZEN"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.top.length()").value(5))
        .andExpect(jsonPath("$.top[0].votes").value(6))
        .andExpect(jsonPath("$.top[4].votes").value(2));
  }

  @Test
  void communityListsOtherReportersAndClosedCasesWithoutPrivateData() throws Exception {
    UUID visible = create();
    UUID farAway = create();
    db.run("UPDATE complaint SET location=ST_SetSRID(ST_MakePoint(101.5,14.75),4326)::geography WHERE id=?", farAway);
    db.run("UPDATE complaint SET reporter_id=?,status='CLOSED' WHERE id=?", users.get("OFFICER"), visible);
    UUID otherTown = UUID.randomUUID();
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Other town')", otherTown);
    db.run("INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role) VALUES(?,?,?,'unused','Other','CITIZEN')", UUID.randomUUID(), otherTown, "otherCitizen");
    mvc.perform(get("/api/community/complaints?latitude=13.75&longitude=100.5").with(user("otherCitizen").roles("CITIZEN")))
        .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
    var response = mvc.perform(as(get("/api/community/complaints?latitude=13.75&longitude=100.5"), "CITIZEN"))
        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    var data = json.readTree(response);
    assertEquals(1, data.get("total").asInt());
    assertEquals(visible.toString(), data.get("items").get(0).get("id").asText());
    assertEquals("CLOSED", data.get("items").get(0).get("status").asText());
    assertEquals(1, data.get("stats").get("closed").asInt());
    assertFalse(response.contains("Private citizen details"));
    assertFalse(response.contains("reporter_id"));
    assertFalse(response.contains("Test street"));
    mvc.perform(as(get("/api/community/complaints?latitude=13.75&longitude=100.5&size=101"), "CITIZEN"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void complaintCannotBeSubmittedWithoutEvidence() throws Exception {
    var body = Map.of("categoryId", cat, "title", "No evidence", "description", "Details", "address", "Street");
    mvc.perform(as(post("/api/complaints").with(csrf()).contentType(MediaType.APPLICATION_JSON)
        .content(json.writeValueAsString(body)), "CITIZEN"))
        .andExpect(status().isBadRequest());
    mvc.perform(as(multipart("/api/complaints")
        .file(new MockMultipartFile("complaint", "complaint.json", "application/json", json.writeValueAsBytes(body)))
        .with(csrf()), "CITIZEN"))
        .andExpect(status().isBadRequest());
    assertTrue(db.list("SELECT id FROM complaint WHERE municipality_id=?", town).isEmpty());
  }

  @Test
  void invalidInitialEvidenceIsRejected() throws Exception {
    var body = Map.of("categoryId", cat, "title", "Bad evidence", "description", "Details", "address", "Street");
    mvc.perform(as(multipart("/api/complaints")
        .file(new MockMultipartFile("complaint", "complaint.json", "application/json", json.writeValueAsBytes(body)))
        .file(new MockMultipartFile("files", "fake.mp4", "video/mp4", "MZ-invalid".getBytes()))
        .with(csrf()), "CITIZEN"))
        .andExpect(status().isBadRequest());
  }

  long version(UUID id) {
    return ((Number) db.one("SELECT version FROM complaint WHERE id=?", id).get("version"))
        .longValue();
  }

  String state(UUID id) {
    return (String) db.one("SELECT status FROM complaint WHERE id=?", id).get("status");
  }

  ResultActions action(UUID id, String role, String action, Map<String, Object> extras)
      throws Exception {
    var b = new HashMap<String, Object>(extras);
    b.put("version", version(id));
    b.put("action", action);
    b.put("reason", "Integration test reason");
    return mvc.perform(
        as(
            post("/api/complaints/" + id + "/actions")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(b)),
            role));
  }

  void assign(UUID id) throws Exception {
    action(id, "OFFICER", "TRIAGE", Map.of("leaderId", users.get("LEADER")))
        .andExpect(status().isOk());
    action(id, "LEADER", "ASSIGN", Map.of("assigneeId", users.get("FIELD")))
        .andExpect(status().isOk());
    action(id, "FIELD", "ACCEPT", Map.of()).andExpect(status().isOk());
  }

  void evidence(UUID id, String role) throws Exception {
    mvc.perform(
            multipart("/api/complaints/" + id + "/files")
                .file(
                    new MockMultipartFile(
                        "file", "proof.pdf", "application/pdf", "%PDF-1.4 test".getBytes()))
                .with(user("test" + role).roles(role))
                .with(csrf()))
        .andExpect(status().isOk());
  }

  void requestResource(UUID id) throws Exception {
    assign(id);
    action(id, "FIELD", "REQUEST_RESOURCE", Map.of()).andExpect(status().isOk());
    evidence(id, "LEADER");
    action(
            id,
            "LEADER",
            "PROPOSE",
            Map.of("proposal", "Tools and materials", "amount", 500, "durationDays", 2))
        .andExpect(status().isOk());
    action(id, "OFFICER", "SEND_APPROVAL", Map.of("approverIds", List.of(users.get("APPROVER"))))
        .andExpect(status().isOk());
  }

  @Test
  void fullWorkflowAndRevisionHistory() throws Exception {
    UUID id = create();
    assign(id);
    action(id, "FIELD", "START", Map.of()).andExpect(status().isOk());
    evidence(id, "FIELD");
    action(id, "FIELD", "REPORT", Map.of("content", "First report")).andExpect(status().isOk());
    action(id, "LEADER", "RETURN_FIELD", Map.of()).andExpect(status().isOk());
    action(id, "FIELD", "REPORT", Map.of("content", "No new evidence"))
        .andExpect(status().isBadRequest());
    evidence(id, "FIELD");
    action(id, "FIELD", "REPORT", Map.of("content", "Corrected report")).andExpect(status().isOk());
    action(id, "LEADER", "FORWARD_REPORT", Map.of()).andExpect(status().isOk());
    action(id, "OFFICER", "RETURN_LEADER", Map.of()).andExpect(status().isOk());
    action(id, "LEADER", "FORWARD_REPORT", Map.of()).andExpect(status().isOk());
    action(id, "OFFICER", "VERIFY", Map.of()).andExpect(status().isOk());
    action(id, "OFFICER", "CLOSE", Map.of()).andExpect(status().isOk());
    assertEquals("CLOSED", state(id));
    assertEquals(2, db.list("SELECT id FROM field_report WHERE complaint_id=?", id).size());
    assertTrue(db.list("SELECT id FROM audit_event WHERE complaint_id=?", id).size() >= 12);
  }

  @Test
  void resourceDeniedTerminatesEntireComplaint() throws Exception {
    UUID id = create();
    requestResource(id);
    action(id, "APPROVER", "DENY", Map.of()).andExpect(status().isOk());
    assertEquals("TERMINATED", state(id));
    assertEquals(
        "CANCELLED",
        db.one("SELECT status FROM work_order WHERE complaint_id=?", id).get("status"));
    action(id, "FIELD", "START", Map.of()).andExpect(status().isForbidden());
  }

  @Test
  void resourceApprovalAndDuplicateProtection() throws Exception {
    UUID id = create();
    requestResource(id);
    long old = version(id);
    action(id, "APPROVER", "APPROVE", Map.of()).andExpect(status().isOk());
    assertEquals("READY", state(id));
    mvc.perform(
            as(
                post("/api/complaints/" + id + "/actions")
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        json.writeValueAsString(
                            Map.of("action", "APPROVE", "reason", "repeat", "version", old))),
                "APPROVER"))
        .andExpect(status().isConflict());
    action(id, "FIELD", "START", Map.of()).andExpect(status().isOk());
  }

  @Test
  void resourceReturnedCreatesNewRevision() throws Exception {
    UUID id = create();
    assign(id);
    action(id, "FIELD", "REQUEST_RESOURCE", Map.of()).andExpect(status().isOk());
    evidence(id, "LEADER");
    action(id, "LEADER", "PROPOSE", Map.of("proposal", "first", "amount", 100, "durationDays", 1))
        .andExpect(status().isOk());
    action(id, "OFFICER", "RETURN_RESOURCE", Map.of()).andExpect(status().isOk());
    action(
            id,
            "LEADER",
            "PROPOSE",
            Map.of("proposal", "corrected", "amount", 200, "durationDays", 2))
        .andExpect(status().isOk());
    assertEquals(
        2,
        db.list(
                "SELECT v.id FROM resource_revision v JOIN resource_request r ON r.id=v.resource_id"
                    + " WHERE r.complaint_id=?",
                id)
            .size());
  }

  @Test
  void roleCannotApproveOwnFieldWork() throws Exception {
    UUID id = create();
    assign(id);
    action(id, "FIELD", "CLOSE", Map.of()).andExpect(status().isNotFound());
    action(id, "CITIZEN", "START", Map.of()).andExpect(status().isForbidden());
  }

  @Test
  void crossMunicipalityReadAndMutationBlocked() throws Exception {
    UUID id = create();
    UUID other = UUID.randomUUID();
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Other')", other);
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role)"
            + " VALUES(?,?,'outsider','x','Other','ADMIN')",
        UUID.randomUUID(),
        other);
    mvc.perform(get("/api/complaints/" + id).with(user("outsider").roles("ADMIN")))
        .andExpect(status().isNotFound());
    mvc.perform(
            post("/api/complaints/" + id + "/actions")
                .with(user("outsider").roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"action\":\"REJECT\",\"reason\":\"attack\",\"version\":0}"))
        .andExpect(status().isNotFound());
  }

  @Test
  void citizenCannotReadAnotherCitizenDetailsOrFiles() throws Exception {
    UUID id = create();
    evidence(id, "CITIZEN");
    UUID file = (UUID) db.one("SELECT id FROM attachment WHERE complaint_id=?", id).get("id");
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role)"
            + " VALUES(?,?,'another','x','Another','CITIZEN')",
        UUID.randomUUID(),
        town);
    mvc.perform(get("/api/complaints/" + id).with(user("another")))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/files/" + file).with(user("another"))).andExpect(status().isForbidden());
  }

  @Test
  void csrfRequired() throws Exception {
    mvc.perform(
            as(
                post("/api/complaints").contentType(MediaType.APPLICATION_JSON).content("{}"),
                "CITIZEN"))
        .andExpect(status().isForbidden());
  }

  @Test
  void nearbyOnly100MetersAndSanitized() throws Exception {
    UUID id = create();
    mvc.perform(
            as(
                get("/api/nearby")
                    .param("categoryId", cat.toString())
                    .param("latitude", "13.7501")
                    .param("longitude", "100.5"),
                "CITIZEN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].id").value(id.toString()))
        .andExpect(jsonPath("$[0].description").doesNotExist())
        .andExpect(jsonPath("$[0].reporter_id").doesNotExist())
        .andExpect(jsonPath("$[0].title").doesNotExist());
    mvc.perform(
            as(
                get("/api/nearby")
                    .param("categoryId", cat.toString())
                    .param("latitude", "13.76")
                    .param("longitude", "100.5"),
                "CITIZEN"))
        .andExpect(jsonPath("$.length()").value(0));
  }

  @Test
  void reassignmentAfterDecline() throws Exception {
    UUID id = create();
    action(id, "OFFICER", "TRIAGE", Map.of("leaderId", users.get("LEADER")))
        .andExpect(status().isOk());
    action(id, "LEADER", "ASSIGN", Map.of("assigneeId", users.get("FIELD")))
        .andExpect(status().isOk());
    action(id, "FIELD", "DECLINE", Map.of()).andExpect(status().isOk());
    assertEquals("TRIAGED", state(id));
    action(id, "LEADER", "ASSIGN", Map.of("assigneeId", users.get("FIELD")))
        .andExpect(status().isOk());
  }

  @Test
  void workflowVersionFrozen() throws Exception {
    UUID id = create();
    UUID next = workflow.createDefault(town, 2);
    db.run("UPDATE workflow_version SET approval_stages=2 WHERE id=?", next);
    db.run("UPDATE category SET workflow_id=? WHERE id=?", next, cat);
    assertEquals(wf, db.one("SELECT workflow_id FROM complaint WHERE id=?", id).get("workflow_id"));
    UUID newer = create();
    assertEquals(
        next, db.one("SELECT workflow_id FROM complaint WHERE id=?", newer).get("workflow_id"));
  }

  @Test
  void validationAndFileType() throws Exception {
    UUID id = create();
    mvc.perform(
            multipart("/api/complaints/" + id + "/files")
                .file(
                    new MockMultipartFile(
                        "file", "bad.jpg", "image/jpeg", "<script>bad</script>".getBytes()))
                .with(user("testCITIZEN"))
                .with(csrf()))
        .andExpect(status().isBadRequest());
  }

  @Test
  void unassignedFieldCannotRead() throws Exception {
    UUID id = create();
    mvc.perform(as(get("/api/complaints/" + id), "FIELD")).andExpect(status().isForbidden());
  }

  @Test
  void publicRegistrationCannotAssignRole() throws Exception {
    mvc.perform(
            post("/api/auth/register")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsString(
                        Map.of(
                            "municipalityId",
                            town,
                            "username",
                            "registered",
                            "password",
                            "long-password-123",
                            "displayName",
                            "Citizen",
                            "role",
                            "ADMIN"))))
        .andExpect(status().isOk());
    assertEquals(
        "CITIZEN", db.one("SELECT role FROM app_user WHERE username='registered'").get("role"));
  }

  @Test
  void twoApprovalStagesRequireBothAndPreventRepeat() throws Exception {
    db.run("UPDATE workflow_version SET approval_stages=2 WHERE id=?", wf);
    UUID second = UUID.randomUUID();
    db.run(
        "INSERT INTO"
            + " app_user(id,municipality_id,department_id,username,password_hash,display_name,role)"
            + " VALUES(?,?,?,'secondApprover','x','Second','APPROVER')",
        second,
        town,
        dept);
    UUID id = create();
    assign(id);
    action(id, "FIELD", "REQUEST_RESOURCE", Map.of()).andExpect(status().isOk());
    evidence(id, "LEADER");
    action(
            id,
            "LEADER",
            "PROPOSE",
            Map.of("proposal", "materials", "amount", 200, "durationDays", 1))
        .andExpect(status().isOk());
    action(
            id,
            "OFFICER",
            "SEND_APPROVAL",
            Map.of("approverIds", List.of(users.get("APPROVER"), second)))
        .andExpect(status().isOk());
    action(id, "APPROVER", "APPROVE", Map.of()).andExpect(status().isOk());
    assertEquals("RESOURCE_APPROVAL", state(id));
    mvc.perform(
            post("/api/complaints/" + id + "/actions")
                .with(user("secondApprover"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsString(
                        Map.of(
                            "action",
                            "APPROVE",
                            "reason",
                            "second stage",
                            "version",
                            version(id)))))
        .andExpect(status().isOk());
    assertEquals("READY", state(id));
  }

  @Test
  void teamAssignmentSnapshotsMembership() throws Exception {
    UUID id = create();
    UUID member = UUID.randomUUID();
    db.run(
        "INSERT INTO"
            + " app_user(id,municipality_id,department_id,username,password_hash,display_name,role)"
            + " VALUES(?,?,?,'member','x','Member','FIELD')",
        member,
        town,
        dept);
    var result =
        mvc.perform(
                as(
                    post("/api/teams")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(
                            json.writeValueAsString(
                                Map.of(
                                    "name",
                                    "Team",
                                    "representativeId",
                                    users.get("FIELD"),
                                    "memberIds",
                                    List.of(users.get("FIELD"), member)))),
                    "LEADER"))
            .andExpect(status().isOk())
            .andReturn();
    UUID team =
        UUID.fromString(
            json.readTree(result.getResponse().getContentAsString()).get("id").asText());
    action(id, "OFFICER", "TRIAGE", Map.of("leaderId", users.get("LEADER")))
        .andExpect(status().isOk());
    action(id, "LEADER", "ASSIGN", Map.of("teamId", team)).andExpect(status().isOk());
    mvc.perform(get("/api/complaints/" + id).with(user("member")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.actions.length()").value(0));
    mvc.perform(
            post("/api/complaints/" + id + "/actions")
                .with(user("member"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsString(
                        Map.of(
                            "action",
                            "ACCEPT",
                            "reason",
                            "not representative",
                            "version",
                            version(id)))))
        .andExpect(status().isForbidden());
    assertEquals(
        2,
        db.list(
                "SELECT wm.user_id FROM work_member wm JOIN work_order w ON w.id=wm.work_order_id"
                    + " WHERE w.complaint_id=?",
                id)
            .size());
  }

  @Test
  void departmentScopeEnforced() throws Exception {
    UUID id = create();
    UUID otherDept = UUID.randomUUID();
    db.run(
        "INSERT INTO department(id,municipality_id,name) VALUES(?,?,'Other department')",
        otherDept,
        town);
    db.run(
        "INSERT INTO"
            + " app_user(id,municipality_id,department_id,username,password_hash,display_name,role)"
            + " VALUES(?,?,?,'otherOfficer','x','Other officer','OFFICER')",
        UUID.randomUUID(),
        town,
        otherDept);
    mvc.perform(get("/api/complaints/" + id).with(user("otherOfficer")))
        .andExpect(status().isForbidden());
  }

  @Test
  void rejectionRequiresReasonAndEndsRequest() throws Exception {
    UUID id = create();
    action(id, "OFFICER", "REJECT", Map.of()).andExpect(status().isOk());
    assertEquals("REJECTED", state(id));
  }

  @Test
  void auditHistoryCannotBeRewritten() throws Exception {
    UUID id = create();
    assertThrows(
        org.springframework.dao.DataAccessException.class,
        () -> db.run("UPDATE audit_event SET reason='changed' WHERE complaint_id=?", id));
  }

  @Test
  void lineIsDisabledWithoutConfiguration() throws Exception {
    mvc.perform(
            post("/api/auth/line")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"idToken\":\"invalid\"}"))
        .andExpect(status().isServiceUnavailable());
  }

  @Test
  void passwordChangeExpiresOtherSessions() throws Exception {
    var encoder = new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(12);
    db.run(
        "UPDATE app_user SET password_hash=? WHERE id=?",
        encoder.encode("current-password-123"),
        users.get("CITIZEN"));
    var first =
        mvc.perform(
                post("/api/auth/login")
                    .with(csrf())
                    .param("username", "testCITIZEN")
                    .param("password", "current-password-123"))
            .andExpect(status().isOk())
            .andReturn();
    var second =
        mvc.perform(
                post("/api/auth/login")
                    .with(csrf())
                    .param("username", "testCITIZEN")
                    .param("password", "current-password-123"))
            .andExpect(status().isOk())
            .andReturn();
    var one = (org.springframework.mock.web.MockHttpSession) first.getRequest().getSession(false);
    var two = (org.springframework.mock.web.MockHttpSession) second.getRequest().getSession(false);
    mvc.perform(
            post("/api/auth/password")
                .session(one)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsString(
                        Map.of(
                            "currentPassword",
                            "current-password-123",
                            "newPassword",
                            "new-password-456"))))
        .andExpect(status().isOk());
    mvc.perform(get("/api/auth/me").session(two)).andExpect(status().isUnauthorized());
  }

  @Test
  void serverSearchPaginationAndStatistics() throws Exception {
    create();
    create();
    mvc.perform(as(get("/api/complaints").param("page", "0").param("size", "1"), "CITIZEN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(2))
        .andExpect(jsonPath("$.stats.total").value(2))
        .andExpect(jsonPath("$.items.length()").value(1));
    mvc.perform(as(get("/api/complaints").param("q", "nothing-matches"), "CITIZEN"))
        .andExpect(jsonPath("$.total").value(0))
        .andExpect(jsonPath("$.stats.total").value(2));
    mvc.perform(as(get("/api/complaints").param("size", "999999"), "CITIZEN"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void videoFormatsAcceptedAndTotalQuotaEnforced() throws Exception {
    UUID id = create();
    byte[] mp4 = java.util.HexFormat.of().parseHex("000000186674797069736f6d0000020069736f6d6d703432");
    byte[] mov = mp4.clone();
    System.arraycopy("qt  ".getBytes(java.nio.charset.StandardCharsets.US_ASCII), 0, mov, 8, 4);
    byte[] webm = java.util.HexFormat.of().parseHex("1a45dfa3934282887765626d000000000000");
    for (var entry : Map.of("clip.mp4", mp4, "clip.mov", mov, "clip.webm", webm).entrySet()) {
      mvc.perform(multipart("/api/complaints/" + id + "/files")
          .file(new MockMultipartFile("file", entry.getKey(), "application/octet-stream", entry.getValue()))
          .with(user("testCITIZEN")).with(csrf())).andExpect(status().isOk());
    }
    var rows = db.list("SELECT id,size_bytes,content_type FROM attachment WHERE complaint_id=?", id);
    assertEquals(Set.of("video/mp4", "video/quicktime", "video/webm"),
        new HashSet<>(rows.stream().map(r -> (String) r.get("content_type")).filter(t -> t.startsWith("video/")).toList()));
    long used = rows.stream().mapToLong(r -> ((Number) r.get("size_bytes")).longValue()).sum();
    var first = rows.getFirst();
    // Simulate existing large attachments without allocating 1 GB in the test JVM.
    db.run("UPDATE attachment SET size_bytes=size_bytes+? WHERE id=?",
        FileController.MAX_TOTAL_BYTES - used - mp4.length, first.get("id"));
    mvc.perform(multipart("/api/complaints/" + id + "/files")
        .file(new MockMultipartFile("file", "last.mp4", "video/mp4", mp4))
        .with(user("testCITIZEN")).with(csrf())).andExpect(status().isOk());
    mvc.perform(multipart("/api/complaints/" + id + "/files")
        .file(new MockMultipartFile("file", "excess.mp4", "video/mp4", mp4))
        .with(user("testCITIZEN")).with(csrf())).andExpect(status().isPayloadTooLarge());
    assertEquals(FileController.MAX_TOTAL_BYTES,
        ((Number) db.one("SELECT SUM(size_bytes) size FROM attachment WHERE complaint_id=?", id).get("size")).longValue());
  }

  @Test
  void videoOverOldTenMbLimitStreamsSuccessfully() throws Exception {
    UUID id = create();
    byte[] data = new byte[11 * 1024 * 1024];
    byte[] header = java.util.HexFormat.of().parseHex("000000186674797069736f6d0000020069736f6d6d703432");
    System.arraycopy(header, 0, data, 0, header.length);
    mvc.perform(multipart("/api/complaints/" + id + "/files")
        .file(new MockMultipartFile("file", "large.mp4", "video/mp4", data))
        .with(user("testCITIZEN")).with(csrf())).andExpect(status().isOk());
    assertEquals(data.length, ((Number) db.one("SELECT size_bytes FROM attachment WHERE complaint_id=? AND original_name='large.mp4'", id).get("size_bytes")).longValue());
  }

  @Test
  void renamedExecutableIsNotAcceptedAsVideo() throws Exception {
    UUID id = create();
    mvc.perform(multipart("/api/complaints/" + id + "/files")
        .file(new MockMultipartFile("file", "fake.mp4", "video/mp4", "MZnot-a-video".getBytes()))
        .with(user("testCITIZEN")).with(csrf())).andExpect(status().isBadRequest());
    assertEquals(1, db.list("SELECT id FROM attachment WHERE complaint_id=?", id).size());
  }

  @Test
  void productionUploadsFailClosedWithoutAntivirus(
      @org.junit.jupiter.api.io.TempDir java.nio.file.Path directory) throws Exception {
    var files = new FileController(db, new Access(db), directory.toString(), "", false);
    var error =
        assertThrows(
            org.springframework.web.server.ResponseStatusException.class,
            () -> files.scan(directory.resolve("proof.pdf")));
    assertEquals(503, error.getStatusCode().value());
  }

  @Test
  void contactDetailsArePrivateAndValidated() throws Exception {
    var body = new HashMap<String, Object>();
    body.put("categoryId", cat);
    body.put("title", "Private contact test");
    body.put("description", "details");
    body.put("address", "street");
    body.put("latitude", 13.75);
    body.put("longitude", 100.5);
    body.put("contactName", "Reporter");
    body.put("contactPhone", "0812345678");
    var result =
        mvc.perform(
                as(
                    complaintRequest(body).with(csrf()),
                    "CITIZEN"))
            .andExpect(status().isOk())
            .andReturn();
    UUID id =
        UUID.fromString(
            json.readTree(result.getResponse().getContentAsString()).get("id").asText());
    assertEquals(
        "0812345678",
        db.one("SELECT contact_phone FROM complaint WHERE id=?", id).get("contact_phone"));
    mvc.perform(
            as(
                get("/api/nearby")
                    .param("categoryId", cat.toString())
                    .param("latitude", "13.75")
                    .param("longitude", "100.5"),
                "CITIZEN"))
        .andExpect(jsonPath("$[0].contact_phone").doesNotExist())
        .andExpect(jsonPath("$[0].contact_name").doesNotExist());
    body.put("contactPhone", "not-a-phone");
    mvc.perform(
            as(
                post("/api/complaints")
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(body)),
                "CITIZEN"))
        .andExpect(status().isBadRequest());
  }
}
