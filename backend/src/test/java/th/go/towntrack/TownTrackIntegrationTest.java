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
  @Autowired GovIdentityService govIdentities;
  @Autowired FileController fileController;
  @Autowired VideoPreviews videoPreviews;
  @Autowired org.springframework.security.core.session.SessionRegistry loginSessions;
  UUID town, dept, cat, wf;
  Map<String, UUID> users = new HashMap<>();

  @Test
  void adminCanSwitchEveryRoleWithoutChangingAccountRole() throws Exception {
    var session = new org.springframework.mock.web.MockHttpSession();
    for (var role : List.of("CITIZEN", "OFFICER", "LEADER", "FIELD", "APPROVER", "ADMIN")) {
      mvc.perform(
              as(
                  post("/api/auth/admin-role")
                      .session(session)
                      .with(csrf())
                      .contentType(MediaType.APPLICATION_JSON)
                      .content(json.writeValueAsString(Map.of("role", role, "departmentId", dept))),
                  "ADMIN"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.role").value(role))
          .andExpect(jsonPath("$.account_role").value("ADMIN"));
      mvc.perform(as(get("/api/auth/me").session(session), "ADMIN"))
          .andExpect(jsonPath("$.role").value(role));
    }
    assertEquals(
        "ADMIN", db.one("SELECT role FROM app_user WHERE id=?", users.get("ADMIN")).get("role"));
    mvc.perform(
            as(
                post("/api/auth/admin-role")
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"role\":\"ADMIN\"}"),
                "CITIZEN"))
        .andExpect(status().isForbidden());
    var foreignDepartment = UUID.randomUUID();
    mvc.perform(
            as(
                post("/api/auth/admin-role")
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        json.writeValueAsString(
                            Map.of("role", "FIELD", "departmentId", foreignDepartment))),
                "ADMIN"))
        .andExpect(status().isNotFound());
  }

  @Test
  void adminRoleSwitchKeepsAccountDepartmentAndPassword() throws Exception {
    UUID other = UUID.randomUUID();
    db.run("INSERT INTO department(id,municipality_id,name) VALUES(?,?,'Temporary')", other, town);
    var session = new org.springframework.mock.web.MockHttpSession();
    mvc.perform(
            as(
                post("/api/auth/admin-role")
                    .session(session)
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        json.writeValueAsString(Map.of("role", "FIELD", "departmentId", other))),
                "ADMIN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.department_id").value(other.toString()));
    var account =
        db.one(
            "SELECT department_id,password_hash,role FROM app_user WHERE id=?", users.get("ADMIN"));
    assertEquals(dept, account.get("department_id"));
    assertEquals("not-a-login-hash", account.get("password_hash"));
    assertEquals("ADMIN", account.get("role"));
    mvc.perform(as(get("/api/auth/me"), "ADMIN"))
        .andExpect(jsonPath("$.department_id").value(dept.toString()));
  }

  @Test
  void approvalQueueKeepsRecipientIdentityWhenAdministratorsSwitchRoles() throws Exception {
    UUID recipient = UUID.randomUUID();
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role) VALUES(?,?,'approvalRecipient','x','Assigned administrator','ADMIN')",
        recipient,
        town);
    UUID id = create();
    action(id, "OFFICER", "TRIAGE", Map.of("leaderId", users.get("LEADER")))
        .andExpect(status().isOk());
    action(id, "LEADER", "ASSIGN", Map.of("assigneeId", users.get("FIELD")))
        .andExpect(status().isOk());
    action(id, "FIELD", "ACCEPT", Map.of()).andExpect(status().isOk());
    action(id, "FIELD", "REQUEST_RESOURCE", Map.of()).andExpect(status().isOk());
    evidence(id, "LEADER");
    action(
            id,
            "LEADER",
            "PROPOSE",
            Map.of("proposal", "Equipment", "amount", 100, "durationDays", 1))
        .andExpect(status().isOk());
    action(id, "OFFICER", "SEND_APPROVAL", Map.of("approverIds", List.of(recipient)))
        .andExpect(status().isOk());
    mvc.perform(as(get("/api/complaints/" + id), "OFFICER"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.resources[0].approver_id").value(recipient.toString()))
        .andExpect(jsonPath("$.resources[0].approver_name").value("Assigned administrator"));
    var otherSession = new org.springframework.mock.web.MockHttpSession();
    otherSession.setAttribute("admin_role", "APPROVER");
    mvc.perform(as(get("/api/complaints?activeOnly=true").session(otherSession), "ADMIN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].id").value(id.toString()));
    mvc.perform(as(get("/api/complaints/" + id).session(otherSession), "ADMIN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.actions").isEmpty());
    mvc.perform(
            as(
                post("/api/complaints/" + id + "/actions")
                    .session(otherSession)
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        json.writeValueAsString(
                            Map.of(
                                "action",
                                "APPROVE",
                                "reason",
                                "Not assigned",
                                "version",
                                version(id)))),
                "ADMIN"))
        .andExpect(status().isForbidden());
    mvc.perform(as(get("/api/complaints?activeOnly=true"), "APPROVER"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(0));
    mvc.perform(as(get("/api/complaints/" + id), "APPROVER")).andExpect(status().isForbidden());
    var citizenSession = new org.springframework.mock.web.MockHttpSession();
    citizenSession.setAttribute("admin_role", "CITIZEN");
    mvc.perform(as(get("/api/complaints/" + id).session(citizenSession), "ADMIN"))
        .andExpect(status().isForbidden());
    var recipientSession = new org.springframework.mock.web.MockHttpSession();
    recipientSession.setAttribute("admin_role", "APPROVER");
    mvc.perform(
            get("/api/complaints?activeOnly=true")
                .session(recipientSession)
                .with(user("approvalRecipient")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].id").value(id.toString()));
    mvc.perform(
            get("/api/complaints/" + id).session(recipientSession).with(user("approvalRecipient")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.actions[?(@.action == 'APPROVE')]").isNotEmpty());
    mvc.perform(
            post("/api/complaints/" + id + "/actions")
                .session(recipientSession)
                .with(user("approvalRecipient"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsString(
                        Map.of(
                            "action",
                            "APPROVE",
                            "reason",
                            "Assigned approval",
                            "version",
                            version(id)))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("READY"));
    UUID otherTown = UUID.randomUUID();
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Other approval town')", otherTown);
    db.run(
        "UPDATE app_user SET municipality_id=?,department_id=NULL WHERE id=?",
        otherTown,
        users.get("ADMIN"));
    mvc.perform(as(get("/api/complaints?activeOnly=true").session(otherSession), "ADMIN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(0));
    mvc.perform(as(get("/api/complaints/" + id).session(otherSession), "ADMIN"))
        .andExpect(status().isNotFound());
    assertEquals(
        1L,
        ((Number)
                db.one(
                        "SELECT count(*) n FROM notification WHERE user_id=? AND complaint_id=?",
                        recipient,
                        id)
                    .get("n"))
            .longValue());
  }

  @Test
  void preAssignmentResourceNeedsEveryApprovalBeforeAssignment() throws Exception {
    db.run("UPDATE workflow_version SET approval_stages=2 WHERE id=?", wf);
    UUID second = UUID.randomUUID();
    db.run(
        "INSERT INTO app_user(id,municipality_id,department_id,username,password_hash,display_name,role) VALUES(?,?,?,'preAssignmentSecond','x','Second','APPROVER')",
        second,
        town,
        null);
    UUID id = create();
    action(id, "OFFICER", "TRIAGE", Map.of("leaderId", users.get("LEADER")))
        .andExpect(status().isOk());
    legacyPreAssignmentResource(id);
    evidence(id, "LEADER");
    action(
            id,
            "LEADER",
            "PROPOSE",
            Map.of("proposal", "Equipment", "amount", 100, "durationDays", 1))
        .andExpect(status().isOk());
    action(
            id,
            "OFFICER",
            "SEND_APPROVAL",
            Map.of("approverIds", List.of(users.get("APPROVER"), second)))
        .andExpect(status().isOk());
    action(id, "APPROVER", "APPROVE", Map.of()).andExpect(status().isOk());
    assertEquals("RESOURCE_APPROVAL", state(id));
    assertEquals("PENDING", workflow.resource(id).get("status"));
    action(id, "LEADER", "ASSIGN", Map.of("assigneeId", users.get("FIELD")))
        .andExpect(status().is4xxClientError());
    mvc.perform(
            post("/api/complaints/" + id + "/actions")
                .with(user("preAssignmentSecond"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsString(
                        Map.of(
                            "action",
                            "APPROVE",
                            "reason",
                            "Second approval",
                            "version",
                            version(id)))))
        .andExpect(status().isOk());
    assertEquals("TRIAGED", state(id));
    assertEquals("APPROVED", workflow.resource(id).get("status"));
    action(id, "LEADER", "ASSIGN", Map.of("assigneeId", users.get("FIELD")))
        .andExpect(status().isOk());
  }

  @Test
  void addressOnlySubmissionPreservesAddressAndRejectsPartialCoordinates() throws Exception {
    var body =
        new HashMap<String, Object>(
            Map.of(
                "categoryId",
                cat,
                "title",
                "Manual location",
                "description",
                "Location supplied by citizen",
                "address",
                "Manually verified address"));
    var proof =
        new MockMultipartFile(
            "files", "proof.pdf", "application/pdf", "%PDF-1.4 evidence".getBytes());
    var result =
        mvc.perform(
                as(
                    multipart("/api/complaints")
                        .file(proof)
                        .file(
                            new MockMultipartFile(
                                "complaint", "", "application/json", json.writeValueAsBytes(body)))
                        .with(csrf()),
                    "CITIZEN"))
            .andExpect(status().isOk())
            .andReturn();
    UUID id =
        UUID.fromString(
            json.readTree(result.getResponse().getContentAsString()).path("id").asText());
    var saved = db.one("SELECT address,location FROM complaint WHERE id=?", id);
    assertEquals("Manually verified address", saved.get("address"));
    assertNull(saved.get("location"));
    body.put("latitude", 13.75);
    mvc.perform(
            as(
                multipart("/api/complaints")
                    .file(proof)
                    .file(
                        new MockMultipartFile(
                            "complaint", "", "application/json", json.writeValueAsBytes(body)))
                    .with(csrf()),
                "CITIZEN"))
        .andExpect(status().isBadRequest());
    body.put("longitude", 181);
    mvc.perform(
            as(
                multipart("/api/complaints")
                    .file(proof)
                    .file(
                        new MockMultipartFile(
                            "complaint", "", "application/json", json.writeValueAsBytes(body)))
                    .with(csrf()),
                "CITIZEN"))
        .andExpect(status().isBadRequest());
  }

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
          List.of("CITIZEN", "OFFICER", "APPROVER").contains(r) ? null : dept,
          "test" + r,
          "not-a-login-hash",
          r);
    }
  }

  MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder r, String role) {
    return r.with(user("test" + role).roles(role));
  }

  org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder
      complaintRequest(Map<String, ?> body) throws Exception {
    return multipart("/api/complaints")
        .file(
            new MockMultipartFile(
                "complaint", "complaint.json", "application/json", json.writeValueAsBytes(body)))
        .file(
            new MockMultipartFile(
                "files", "initial.pdf", "application/pdf", "%PDF-1.4 initial evidence".getBytes()));
  }

  UUID create() throws Exception {
    var result =
        mvc.perform(
                as(
                    complaintRequest(
                            Map.of(
                                "categoryId",
                                cat,
                                "title",
                                "Broken road",
                                "description",
                                "Private citizen details",
                                "address",
                                "Test street",
                                "latitude",
                                13.75,
                                "longitude",
                                100.5))
                        .with(csrf()),
                    "CITIZEN"))
            .andExpect(status().isOk())
            .andReturn();
    return UUID.fromString(
        json.readTree(result.getResponse().getContentAsString()).get("id").asText());
  }

  @Test
  void adminAssignsExistingAccountRoleWithoutChangingCredentials() throws Exception {
    UUID target = users.get("CITIZEN");
    String before =
        (String)
            db.one("SELECT password_hash FROM app_user WHERE id=?", target).get("password_hash");
    var body = json.writeValueAsString(Map.of("role", "OFFICER", "departmentId", dept));
    mvc.perform(
            as(
                post("/api/admin/users/" + target + "/role")
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(body),
                "ADMIN"))
        .andExpect(status().isOk());
    var changed =
        db.one("SELECT username,role,department_id,password_hash FROM app_user WHERE id=?", target);
    assertEquals("OFFICER", changed.get("role"));
    assertNull(changed.get("department_id"));
    assertEquals(before, changed.get("password_hash"));
    assertEquals("testCITIZEN", changed.get("username"));
    assertEquals(
        1L,
        ((Number)
                db.one(
                        "SELECT count(*) n FROM audit_event WHERE action='USER_ROLE' AND municipality_id=?",
                        town)
                    .get("n"))
            .longValue());
    mvc.perform(
            as(
                post("/api/admin/users/" + users.get("FIELD") + "/role")
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(body),
                "OFFICER"))
        .andExpect(status().isForbidden());
    mvc.perform(
            as(
                post("/api/admin/users/" + users.get("ADMIN") + "/role")
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(body),
                "ADMIN"))
        .andExpect(status().isBadRequest());
    mvc.perform(
            as(
                post("/api/admin/users/" + users.get("FIELD") + "/role")
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"role\":\"FIELD\"}"),
                "ADMIN"))
        .andExpect(status().isBadRequest());
    mvc.perform(
            as(
                post("/api/admin/users/" + UUID.randomUUID() + "/role")
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(body),
                "ADMIN"))
        .andExpect(status().isNotFound());
  }

  @Test
  void accountDeletionPreservesHistoryButGovRejoinStartsWithFreshIdentity() throws Exception {
    UUID target = users.get("CITIZEN");
    UUID complaint = create();
    var before = db.one("SELECT username,password_hash FROM app_user WHERE id=?", target);
    db.run(
        "INSERT INTO iam_user_profile(municipality_id,iam_user_id,local_user_id,email) VALUES(?,'gov-delete-test',?,'delete-test@example.invalid')",
        town,
        target);
    String sessionId = "delete-test-" + target;
    var principal =
        org.springframework.security.core.userdetails.User.withUsername("testCITIZEN")
            .password("not-a-login-hash")
            .roles("CITIZEN")
            .build();
    loginSessions.registerNewSession(sessionId, principal);
    try {
      mvc.perform(as(delete("/api/admin/users/" + target).with(csrf()), "ADMIN"))
          .andExpect(status().isNoContent());
      var archived =
          db.one(
              "SELECT username,password_hash,enabled,deleted_at FROM app_user WHERE id=?", target);
      assertEquals(before.get("username"), archived.get("username"));
      assertEquals(before.get("password_hash"), archived.get("password_hash"));
      assertEquals(false, archived.get("enabled"));
      assertNotNull(archived.get("deleted_at"));
      assertTrue(loginSessions.getSessionInformation(sessionId).isExpired());
      assertEquals(
          target,
          db.one("SELECT reporter_id FROM complaint WHERE id=?", complaint).get("reporter_id"));
      assertFalse(db.list("SELECT id FROM attachment WHERE complaint_id=?", complaint).isEmpty());
      assertEquals(
          target,
          db.one(
                  "SELECT local_user_id FROM iam_user_profile WHERE municipality_id=? AND iam_user_id='gov-delete-test'",
                  town)
              .get("local_user_id"));
      var config =
          mvc.perform(as(get("/api/admin"), "ADMIN")).andExpect(status().isOk()).andReturn();
      assertFalse(
          json.readTree(config.getResponse().getContentAsString())
              .path("users")
              .toString()
              .contains(target.toString()));
      mvc.perform(as(get("/api/auth/me"), "CITIZEN")).andExpect(status().is4xxClientError());
      mvc.perform(
              as(
                  post("/api/admin/users/" + target + "/enabled")
                      .with(csrf())
                      .contentType(MediaType.APPLICATION_JSON)
                      .content("{\"enabled\":true}"),
                  "ADMIN"))
          .andExpect(status().isNotFound());
      mvc.perform(
              as(
                  post("/api/admin/users/" + target + "/role")
                      .with(csrf())
                      .contentType(MediaType.APPLICATION_JSON)
                      .content(
                          json.writeValueAsString(Map.of("role", "LEADER", "departmentId", dept))),
                  "ADMIN"))
          .andExpect(status().isNotFound());
      mvc.perform(as(delete("/api/admin/users/" + target).with(csrf()), "ADMIN"))
          .andExpect(status().isNoContent());
      assertEquals(
          1L,
          ((Number)
                  db.one(
                          "SELECT count(*) n FROM audit_event WHERE municipality_id=? AND action='USER_DELETE'",
                          town)
                      .get("n"))
              .longValue());
      var verified =
          json.readTree("{\"user\":{\"id\":\"gov-delete-test\",\"name\":\"Existing person\"}}");
      var fresh = govIdentities.sync(town, verified, null);
      assertNotEquals(target, fresh.get("id"));
      assertNotEquals(before.get("username"), fresh.get("username"));
      assertEquals("CITIZEN", fresh.get("role"));
      assertNull(fresh.get("department_id"));
      assertEquals(fresh.get("id"), govIdentities.sync(town, verified, null).get("id"));
      var freshPrincipal = user(fresh.get("username").toString()).roles("CITIZEN");
      mvc.perform(get("/api/complaints").with(freshPrincipal))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.items").isEmpty());
      mvc.perform(get("/api/following").with(freshPrincipal))
          .andExpect(status().isOk())
          .andExpect(content().json("[]"));
      mvc.perform(get("/api/notifications").with(freshPrincipal))
          .andExpect(status().isOk())
          .andExpect(content().json("[]"));
      mvc.perform(get("/api/complaints/" + complaint).with(freshPrincipal))
          .andExpect(status().isForbidden());
      UUID oldFile =
          (UUID)
              db.one("SELECT id FROM attachment WHERE complaint_id=? LIMIT 1", complaint).get("id");
      mvc.perform(get("/api/files/" + oldFile).with(freshPrincipal))
          .andExpect(status().isForbidden());
      assertEquals(
          target,
          db.one("SELECT reporter_id FROM complaint WHERE id=?", complaint).get("reporter_id"));
      assertEquals(
          fresh.get("id"),
          db.one(
                  "SELECT local_user_id FROM iam_user_profile WHERE municipality_id=? AND iam_user_id='gov-delete-test'",
                  town)
              .get("local_user_id"));
      assertEquals(
          1L,
          ((Number)
                  db.one(
                          "SELECT count(*) n FROM iam_user_profile WHERE municipality_id=? AND iam_user_id='gov-delete-test'",
                          town)
                      .get("n"))
              .longValue());
    } finally {
      loginSessions.removeSessionInformation(sessionId);
    }
  }

  @Test
  void accountDeletionEnforcesActorCsrfSelfAndMunicipalityBoundaries() throws Exception {
    UUID target = users.get("FIELD");
    mvc.perform(as(delete("/api/admin/users/" + target).with(csrf()), "OFFICER"))
        .andExpect(status().isForbidden());
    mvc.perform(as(delete("/api/admin/users/" + target), "ADMIN"))
        .andExpect(status().isForbidden());
    mvc.perform(as(delete("/api/admin/users/" + users.get("ADMIN")).with(csrf()), "ADMIN"))
        .andExpect(status().isBadRequest());
    UUID foreignTown = UUID.randomUUID(), foreignUser = UUID.randomUUID();
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Foreign town')", foreignTown);
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role) VALUES(?,?,?,'unused','Foreign','CITIZEN')",
        foreignUser,
        foreignTown,
        "foreign-delete-" + foreignUser);
    mvc.perform(as(delete("/api/admin/users/" + foreignUser).with(csrf()), "ADMIN"))
        .andExpect(status().isNotFound());
    mvc.perform(as(delete("/api/admin/users/" + UUID.randomUUID()).with(csrf()), "ADMIN"))
        .andExpect(status().isNotFound());
    assertEquals(true, db.one("SELECT enabled FROM app_user WHERE id=?", target).get("enabled"));
    assertEquals(
        true, db.one("SELECT enabled FROM app_user WHERE id=?", foreignUser).get("enabled"));
    assertEquals(
        true, db.one("SELECT enabled FROM app_user WHERE id=?", users.get("ADMIN")).get("enabled"));
  }

  @Test
  void deletingAnotherAdministratorKeepsActingAdministratorAndBlocksDeletedActor()
      throws Exception {
    UUID other = UUID.randomUUID();
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role) VALUES(?,?,?,'unused','Other admin','ADMIN')",
        other,
        town,
        "other-delete-" + other);
    mvc.perform(as(delete("/api/admin/users/" + other).with(csrf()), "ADMIN"))
        .andExpect(status().isNoContent());
    mvc.perform(
            delete("/api/admin/users/" + users.get("ADMIN"))
                .with(user("other-delete-" + other).roles("ADMIN"))
                .with(csrf()))
        .andExpect(status().is4xxClientError());
    assertEquals(
        1L,
        ((Number)
                db.one(
                        "SELECT count(*) n FROM app_user WHERE municipality_id=? AND role='ADMIN' AND enabled=true",
                        town)
                    .get("n"))
            .longValue());
  }

  @Test
  void activeQueueExcludesFinishedCasesBeforeCountingAndPagination() throws Exception {
    for (String state : List.of("CLOSED", "REJECTED", "TERMINATED", "NEW")) {
      UUID id = create();
      db.run("UPDATE complaint SET status=? WHERE id=?", state, id);
    }
    mvc.perform(as(get("/api/complaints?activeOnly=true&size=1"), "ADMIN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(1))
        .andExpect(jsonPath("$.items.length()").value(1))
        .andExpect(jsonPath("$.items[0].status").value("NEW"));
    mvc.perform(as(get("/api/complaints?activeOnly=true&status=CLOSED"), "ADMIN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(0));
    mvc.perform(as(get("/api/complaints?completedOnly=true"), "ADMIN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(3));
    mvc.perform(as(get("/api/complaints?completedOnly=true&status=NEW"), "ADMIN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(0));
    mvc.perform(as(get("/api/complaints?completedOnly=true&size=1&page=1"), "OFFICER"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(3))
        .andExpect(jsonPath("$.items.length()").value(1));
    for (String role : List.of("LEADER", "FIELD", "APPROVER")) {
      mvc.perform(as(get("/api/complaints?completedOnly=true"), role))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.total").value(0));
    }
    mvc.perform(as(get("/api/complaints"), "ADMIN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(4));
  }

  @Test
  void reporterPhotosAreSharedWithNeighboursUnlessARedactedCopyReplacesThem() throws Exception {
    UUID complaint = create();
    var image = new java.awt.image.BufferedImage(8, 8, java.awt.image.BufferedImage.TYPE_INT_RGB);
    var bytes = new java.io.ByteArrayOutputStream();
    javax.imageio.ImageIO.write(image, "png", bytes);
    var response =
        mvc.perform(
                as(
                    multipart("/api/complaints/" + complaint + "/files")
                        .file(
                            new MockMultipartFile(
                                "file", "private.png", "image/png", bytes.toByteArray()))
                        .with(csrf()),
                    "CITIZEN"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    UUID file = UUID.fromString(json.readTree(response).get("id").asText());
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role) VALUES(?,?,?,'unused','Peer','CITIZEN')",
        UUID.randomUUID(),
        town,
        "mediaPeer");
    mvc.perform(as(get("/api/media/" + file).header("Range", "bytes=0-9"), "CITIZEN"))
        .andExpect(status().isPartialContent())
        .andExpect(header().string("Content-Type", "image/png"))
        .andExpect(
            header().string("Content-Range", org.hamcrest.Matchers.startsWith("bytes 0-9/")));
    mvc.perform(get("/api/media/" + file).with(user("mediaPeer").roles("CITIZEN")))
        .andExpect(status().isOk());
    mvc.perform(
            get("/api/community/complaints/" + complaint).with(user("mediaPeer").roles("CITIZEN")))
        .andExpect(jsonPath("$.media[?(@.id=='" + file + "')]").exists());
    mvc.perform(as(get("/api/media/" + file + "?thumbnail=true"), "CITIZEN"))
        .andExpect(status().isOk())
        .andExpect(header().string("Content-Type", "image/jpeg"));
    var publish =
        mvc.perform(
                as(
                    multipart("/api/complaints/" + complaint + "/shared-media")
                        .file(
                            new MockMultipartFile(
                                "file", "redacted.png", "image/png", bytes.toByteArray()))
                        .param("sourceId", file.toString())
                        .param("confirmedClean", "true")
                        .with(csrf()),
                    "OFFICER"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    UUID copy = UUID.fromString(json.readTree(publish).get("id").asText());
    assertNotEquals(copy, file);
    mvc.perform(get("/api/media/" + copy).with(user("mediaPeer").roles("CITIZEN")))
        .andExpect(status().isOk());
    mvc.perform(get("/api/media/" + file).with(user("mediaPeer").roles("CITIZEN")))
        .andExpect(status().isForbidden());
    mvc.perform(
            get("/api/community/complaints/" + complaint).with(user("mediaPeer").roles("CITIZEN")))
        .andExpect(jsonPath("$.media[?(@.id=='" + copy + "')]").exists())
        .andExpect(jsonPath("$.media[?(@.id=='" + file + "')]").doesNotExist());
    mvc.perform(
            as(
                delete("/api/complaints/" + complaint + "/shared-media/" + copy).with(csrf()),
                "OFFICER"))
        .andExpect(status().isOk());
    mvc.perform(get("/api/media/" + copy).with(user("mediaPeer").roles("CITIZEN")))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/media/" + file).with(user("mediaPeer").roles("CITIZEN")))
        .andExpect(status().isOk());
    UUID after = UUID.randomUUID(), internal = UUID.randomUUID();
    var staffFiles =
        List.of(
            List.of(after, users.get("FIELD"), "AFTER"),
            List.of(internal, users.get("OFFICER"), "GENERAL"));
    for (var row : staffFiles)
      db.run(
          "INSERT INTO"
              + " attachment(id,complaint_id,uploaded_by,original_name,content_type,size_bytes,sha256,storage_key,evidence_stage)"
              + " VALUES(?,?,?,'site.jpg','image/jpeg',1,'x',?,?)",
          row.get(0),
          complaint,
          row.get(1),
          row.get(0) + ".jpg",
          row.get(2));
    mvc.perform(
            get("/api/community/complaints/" + complaint).with(user("mediaPeer").roles("CITIZEN")))
        .andExpect(jsonPath("$.media[?(@.id=='" + after + "')].evidence_stage").value("AFTER"))
        .andExpect(jsonPath("$.media[?(@.id=='" + internal + "')]").doesNotExist());
  }

  @Test
  void pdfCommunityPreviewKeepsOwnershipApprovalAndTenantBoundaries() throws Exception {
    UUID complaint = create();
    UUID pdf = (UUID) db.one("SELECT id FROM attachment WHERE complaint_id=?", complaint).get("id");
    mvc.perform(as(get("/api/community/complaints?scope=municipality"), "CITIZEN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].media_count").value(1))
        .andExpect(jsonPath("$.items[0].cover.content_type").value("application/pdf"));
    mvc.perform(as(get("/api/community/complaints/" + complaint), "CITIZEN"))
        .andExpect(jsonPath("$.media[0].id").value(pdf.toString()));
    mvc.perform(as(get("/api/media/" + pdf), "CITIZEN"))
        .andExpect(status().isOk())
        .andExpect(header().string("Content-Type", "application/pdf"))
        .andExpect(header().string("Cache-Control", "private, no-store"))
        .andExpect(header().string("X-Content-Type-Options", "nosniff"))
        .andExpect(
            header().string("Content-Disposition", org.hamcrest.Matchers.startsWith("attachment")));
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role) VALUES(?,?,?,'unused','Peer','CITIZEN')",
        UUID.randomUUID(),
        town,
        "pdfPeer");
    mvc.perform(get("/api/media/" + pdf).with(user("pdfPeer"))).andExpect(status().isForbidden());
    mvc.perform(get("/api/community/complaints/" + complaint).with(user("pdfPeer")))
        .andExpect(jsonPath("$.media.length()").value(0));
    mvc.perform(get("/api/community/complaints?scope=municipality").with(user("pdfPeer")))
        .andExpect(jsonPath("$.items[0].media_count").value(0))
        .andExpect(jsonPath("$.items[0].cover").isEmpty());
    UUID otherTown = UUID.randomUUID();
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Other PDF town')", otherTown);
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role) VALUES(?,?,?,'unused','Other','CITIZEN')",
        UUID.randomUUID(),
        otherTown,
        "pdfOtherTown");
    mvc.perform(get("/api/media/" + pdf).with(user("pdfOtherTown")))
        .andExpect(status().isNotFound());
    var upload =
        mvc.perform(
                as(
                    multipart("/api/complaints/" + complaint + "/files")
                        .file(
                            new MockMultipartFile(
                                "file",
                                "approved.pdf",
                                "application/pdf",
                                "%PDF-1.4 approved copy".getBytes()))
                        .with(csrf()),
                    "OFFICER"))
            .andExpect(status().isOk())
            .andReturn();
    UUID copy =
        UUID.fromString(
            json.readTree(upload.getResponse().getContentAsString()).get("id").asText());
    db.run("UPDATE attachment SET public_approved=true,public_copy_of=? WHERE id=?", pdf, copy);
    mvc.perform(get("/api/community/complaints/" + complaint).with(user("pdfPeer")))
        .andExpect(jsonPath("$.media.length()").value(1))
        .andExpect(jsonPath("$.media[0].id").value(copy.toString()));
    mvc.perform(get("/api/media/" + copy).with(user("pdfPeer"))).andExpect(status().isOk());
    mvc.perform(get("/api/files/" + copy).with(user("pdfPeer"))).andExpect(status().isForbidden());
    mvc.perform(get("/api/media/" + copy).with(user("pdfOtherTown")))
        .andExpect(status().isNotFound());
    mvc.perform(
            as(
                delete("/api/complaints/" + complaint + "/shared-media/" + copy).with(csrf()),
                "OFFICER"))
        .andExpect(status().isOk());
    mvc.perform(get("/api/media/" + copy).with(user("pdfPeer"))).andExpect(status().isForbidden());
  }

  @Test
  void citizensCannotPublishOtherEvidence() throws Exception {
    UUID complaint = create();
    UUID source =
        (UUID) db.one("SELECT id FROM attachment WHERE complaint_id=?", complaint).get("id");
    mvc.perform(
            as(
                multipart("/api/complaints/" + complaint + "/shared-media")
                    .file(new MockMultipartFile("file", "copy.png", "image/png", new byte[] {1, 2}))
                    .param("sourceId", source.toString())
                    .param("confirmedClean", "true")
                    .with(csrf()),
                "CITIZEN"))
        .andExpect(status().isForbidden());
    mvc.perform(
            as(
                multipart("/api/complaints/" + complaint + "/shared-media")
                    .file(new MockMultipartFile("file", "copy.png", "image/png", new byte[] {1, 2}))
                    .param("sourceId", source.toString())
                    .param("confirmedClean", "false")
                    .with(csrf()),
                "OFFICER"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void decimalGigabyteLimitMatchesSrs() {
    assertEquals(1_000_000_000L, FileController.MAX_TOTAL_BYTES);
  }

  @Test
  void privacyAcknowledgementIsVersionedAndSeparateFromGps() throws Exception {
    mvc.perform(as(get("/api/privacy"), "CITIZEN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.acknowledged").value(false));
    for (int n = 0; n < 3; n++)
      mvc.perform(
              as(
                  post("/api/users/pdpa-consent")
                      .with(csrf())
                      .contentType(MediaType.APPLICATION_JSON)
                      .content("{\"version\":\"local-test-v1\"}"),
                  "CITIZEN"))
          .andExpect(status().isOk());
    mvc.perform(as(get("/api/privacy"), "CITIZEN"))
        .andExpect(jsonPath("$.acknowledged").value(true))
        .andExpect(jsonPath("$.consented").value(true));
    mvc.perform(
            as(
                post("/api/users/pdpa-consent")
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"version\":\"old\"}"),
                "CITIZEN"))
        .andExpect(status().isConflict());
  }

  @Test
  void decliningPrivacyNoticeIsRecordedAndCanBeChanged() throws Exception {
    mvc.perform(
            as(
                post("/api/users/pdpa-consent")
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"version\":\"local-test-v1\",\"consent\":false}"),
                "CITIZEN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.consented").value(false));
    mvc.perform(as(get("/api/privacy"), "CITIZEN"))
        .andExpect(jsonPath("$.acknowledged").value(true))
        .andExpect(jsonPath("$.consented").value(false));
    mvc.perform(
            as(
                post("/api/users/pdpa-consent")
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"version\":\"local-test-v1\",\"consent\":true}"),
                "CITIZEN"))
        .andExpect(status().isOk());
    mvc.perform(as(get("/api/privacy"), "CITIZEN")).andExpect(jsonPath("$.consented").value(true));
  }

  @Test
  void usersReadAndDeleteOnlyTheirOwnNotifications() throws Exception {
    UUID complaint = create(), mine = UUID.randomUUID(), other = UUID.randomUUID();
    db.run(
        "INSERT INTO notification(id,user_id,complaint_id,message)"
            + " VALUES(?,?,?,'mine'),(?,?,?,'other')",
        mine,
        users.get("OFFICER"),
        complaint,
        other,
        users.get("CITIZEN"),
        complaint);
    db.run(
        "INSERT INTO notification_delivery(notification_id,idempotency_key) VALUES(?,?)",
        mine,
        UUID.randomUUID());
    mvc.perform(as(post("/api/notifications/" + other + "/read").with(csrf()), "OFFICER"))
        .andExpect(status().isNotFound());
    mvc.perform(as(delete("/api/notifications/" + other).with(csrf()), "OFFICER"))
        .andExpect(status().isNotFound());
    mvc.perform(as(post("/api/notifications/" + mine + "/read"), "OFFICER"))
        .andExpect(status().isForbidden());
    mvc.perform(as(post("/api/notifications/" + mine + "/read").with(csrf()), "OFFICER"))
        .andExpect(status().isOk());
    assertNotNull(db.one("SELECT read_at FROM notification WHERE id=?", mine).get("read_at"));
    assertNull(db.one("SELECT read_at FROM notification WHERE id=?", other).get("read_at"));
    mvc.perform(as(delete("/api/notifications/" + mine).with(csrf()), "OFFICER"))
        .andExpect(status().isOk());
    assertTrue(db.list("SELECT id FROM notification WHERE id=?", mine).isEmpty());
    assertTrue(
        db.list("SELECT 1 FROM notification_delivery WHERE notification_id=?", mine).isEmpty());
    assertFalse(db.list("SELECT id FROM notification WHERE id=?", other).isEmpty());
  }

  @Test
  void communityMapPointsCoverEveryCaseBeyondTheListPageAndArea() throws Exception {
    for (int i = 0; i < 13; i++) create();
    mvc.perform(as(get("/api/community/complaints?scope=municipality&size=12"), "CITIZEN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items.length()").value(12))
        .andExpect(jsonPath("$.points.length()").value(13))
        .andExpect(jsonPath("$.points[0].latitude").exists())
        .andExpect(jsonPath("$.points[0].description").doesNotExist());
    mvc.perform(as(get("/api/community/complaints?latitude=0&longitude=0"), "CITIZEN"))
        .andExpect(jsonPath("$.items.length()").value(0))
        .andExpect(jsonPath("$.points.length()").value(13));
  }

  @Test
  void citizenTrackingUsesSixItemsPerPage() throws Exception {
    for (int i = 0; i < 11; i++) create();
    mvc.perform(as(get("/api/citizen/tracking?tab=mine&page=0"), "CITIZEN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items.length()").value(6))
        .andExpect(jsonPath("$.items[0].description").value("Private citizen details"))
        .andExpect(jsonPath("$.items[0].votes").value(0))
        .andExpect(jsonPath("$.total").value(11));
    mvc.perform(as(get("/api/citizen/tracking?tab=mine&page=1"), "CITIZEN"))
        .andExpect(jsonPath("$.items.length()").value(5));
    mvc.perform(as(get("/api/citizen/tracking?tab=mine&page=2"), "CITIZEN"))
        .andExpect(jsonPath("$.items.length()").value(0));
    // Reporters follow their own reports automatically.
    mvc.perform(as(get("/api/citizen/tracking?tab=following"), "CITIZEN"))
        .andExpect(jsonPath("$.items.length()").value(6))
        .andExpect(jsonPath("$.total").value(11));
    UUID neighbour = UUID.randomUUID();
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role)"
            + " VALUES(?,?,'testNEIGHBOUR','not-a-login-hash','Neighbour','CITIZEN')",
        neighbour,
        town);
    db.run(
        "INSERT INTO follower(complaint_id,user_id) SELECT id,? FROM complaint WHERE"
            + " reporter_id=? LIMIT 1",
        neighbour,
        users.get("CITIZEN"));
    mvc.perform(as(get("/api/citizen/tracking?tab=following"), "NEIGHBOUR"))
        .andExpect(jsonPath("$.items.length()").value(1))
        .andExpect(jsonPath("$.items[0].category_name").exists())
        .andExpect(jsonPath("$.items[0].description").value(org.hamcrest.Matchers.nullValue()))
        .andExpect(jsonPath("$.items[0].address").value(org.hamcrest.Matchers.nullValue()));
    mvc.perform(as(get("/api/citizen/tracking"), "OFFICER")).andExpect(status().isForbidden());
  }

  @Test
  void backfillMakesReportersOfOlderReportsFollowThem() throws Exception {
    UUID id = create();
    // A report filed before auto-follow existed has no follower row for its reporter.
    db.run("DELETE FROM follower WHERE complaint_id=?", id);
    db.run("INSERT INTO follower(complaint_id,user_id) VALUES(?,?)", id, users.get("OFFICER"));
    try (var script =
        getClass().getResourceAsStream("/db/migration/R__reporters_follow_their_reports.sql")) {
      assertNotNull(script);
      String sql = new String(script.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
      db.run(sql);
      db.run(sql);
    }
    assertEquals(
        Set.of(users.get("CITIZEN"), users.get("OFFICER")),
        new HashSet<>(
            db.list("SELECT user_id FROM follower WHERE complaint_id=?", id).stream()
                .map(row -> row.get("user_id"))
                .toList()));
  }

  @Test
  void complaintIdempotencyReturnsOriginalAndRejectsChangedPayload() throws Exception {
    var body = new HashMap<String, Object>();
    body.put("categoryId", cat);
    body.put("title", "Duplicate protected");
    body.put("description", "Details");
    body.put("address", "Street");
    body.put("latitude", 13.75);
    body.put("longitude", 100.5);
    String key = UUID.randomUUID().toString();
    String first = null;
    for (int i = 0; i < 3; i++) {
      var result =
          mvc.perform(
                  as(complaintRequest(body).header("Idempotency-Key", key).with(csrf()), "CITIZEN"))
              .andExpect(status().isOk())
              .andReturn()
              .getResponse()
              .getContentAsString();
      if (first == null) first = result;
      else assertEquals(json.readTree(first), json.readTree(result));
    }
    assertEquals(1, db.list("SELECT id FROM complaint WHERE municipality_id=?", town).size());
    body.put("title", "Changed");
    mvc.perform(as(complaintRequest(body).header("Idempotency-Key", key).with(csrf()), "CITIZEN"))
        .andExpect(status().isConflict());
  }

  @Test
  void reportRequiresBeforeAndAfterForLatestRevision() throws Exception {
    UUID id = create();
    assign(id);
    action(id, "FIELD", "START", Map.of()).andExpect(status().isOk());
    mvc.perform(
            multipart("/api/complaints/" + id + "/files")
                .file(
                    new MockMultipartFile(
                        "file", "proof.pdf", "application/pdf", "%PDF-1.4 proof".getBytes()))
                .with(user("testFIELD").roles("FIELD"))
                .with(csrf()))
        .andExpect(status().isOk());
    action(id, "FIELD", "REPORT", Map.of("content", "Missing photos"))
        .andExpect(status().isBadRequest());
    evidence(id, "FIELD");
    action(id, "FIELD", "REPORT", Map.of("content", "Complete")).andExpect(status().isOk());
    db.run(
        "UPDATE attachment SET evidence_stage='GENERAL' WHERE complaint_id=? AND evidence_stage='AFTER'",
        id);
    action(id, "LEADER", "FORWARD_REPORT", Map.of()).andExpect(status().isBadRequest());
  }

  @Test
  void preAssignmentResourceApprovalReturnsToTeamPlanning() throws Exception {
    UUID id = create();
    action(id, "OFFICER", "TRIAGE", Map.of("leaderId", users.get("LEADER")))
        .andExpect(status().isOk());
    legacyPreAssignmentResource(id);
    assertEquals("PRE_ASSIGN", workflow.resource(id).get("workflow_origin"));
    evidence(id, "LEADER");
    action(
            id,
            "LEADER",
            "PROPOSE",
            Map.of("proposal", "Equipment", "amount", 100, "durationDays", 1))
        .andExpect(status().isOk());
    action(id, "OFFICER", "SEND_APPROVAL", Map.of("approverIds", List.of(users.get("APPROVER"))))
        .andExpect(status().isOk());
    action(id, "APPROVER", "APPROVE", Map.of()).andExpect(status().isOk());
    assertEquals("TRIAGED", state(id));
    action(id, "LEADER", "ASSIGN", Map.of("assigneeId", users.get("FIELD")))
        .andExpect(status().isOk());
  }

  @Test
  void communityFollowAndDetailsKeepReporterDataPrivate() throws Exception {
    UUID id = create();
    db.run("UPDATE complaint SET reporter_id=? WHERE id=?", users.get("OFFICER"), id);
    var response =
        mvc.perform(as(get("/api/community/complaints/" + id), "CITIZEN"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertFalse(response.contains("Private citizen details"));
    assertFalse(response.contains("Test street"));
    assertFalse(response.contains("reporter_id"));
    for (int n = 0; n < 2; n++)
      mvc.perform(as(post("/api/community/complaints/" + id + "/follow").with(csrf()), "CITIZEN"))
          .andExpect(status().isOk());
    mvc.perform(as(get("/api/community/complaints?latitude=13.75&longitude=100.5"), "CITIZEN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].following").value(true));
    mvc.perform(as(get("/api/following"), "CITIZEN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1));
    mvc.perform(as(delete("/api/complaints/" + id + "/follow").with(csrf()), "CITIZEN"))
        .andExpect(status().isOk());
    mvc.perform(as(get("/api/following"), "CITIZEN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(0));
    UUID otherTown = UUID.randomUUID();
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Other town')", otherTown);
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role) VALUES(?,?,?,'unused','Other','CITIZEN')",
        UUID.randomUUID(),
        otherTown,
        "otherCommunityCitizen");
    mvc.perform(
            get("/api/community/complaints/" + id)
                .with(user("otherCommunityCitizen").roles("CITIZEN")))
        .andExpect(status().isNotFound());
    mvc.perform(
            post("/api/community/complaints/" + id + "/follow")
                .with(csrf())
                .with(user("otherCommunityCitizen").roles("CITIZEN")))
        .andExpect(status().isNotFound());
  }

  @Test
  void votesAreUniqueAndTopFiveAreRanked() throws Exception {
    UUID id = create();
    for (int n = 0; n < 2; n++)
      mvc.perform(as(post("/api/community/complaints/" + id + "/vote").with(csrf()), "CITIZEN"))
          .andExpect(status().isOk());
    mvc.perform(as(get("/api/community/complaints?latitude=13.75&longitude=100.5"), "CITIZEN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.top[0].votes").value(1))
        .andExpect(jsonPath("$.top[0].voted").value(true));
    mvc.perform(as(delete("/api/community/complaints/" + id + "/vote").with(csrf()), "CITIZEN"))
        .andExpect(status().isOk());
    mvc.perform(as(get("/api/community/complaints?latitude=13.75&longitude=100.5"), "CITIZEN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.top.length()").value(0));
    for (int n = 0; n < 6; n++) {
      UUID caseId = create();
      for (String role : new ArrayList<>(users.keySet()).subList(0, n + 1))
        db.run(
            "INSERT INTO complaint_vote(complaint_id,user_id) VALUES(?,?)",
            caseId,
            users.get(role));
    }
    mvc.perform(as(get("/api/community/complaints?latitude=13.75&longitude=100.5"), "CITIZEN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.top.length()").value(5))
        .andExpect(jsonPath("$.top[0].votes").value(6))
        .andExpect(jsonPath("$.top[4].votes").value(2));
  }

  @Test
  void communityListsOtherReportersAndClosedCasesWithoutPrivateData() throws Exception {
    UUID visible = create();
    UUID farAway = create();
    db.run(
        "UPDATE complaint SET location=ST_SetSRID(ST_MakePoint(101.5,14.75),4326)::geography WHERE id=?",
        farAway);
    db.run(
        "UPDATE complaint SET reporter_id=?,status='CLOSED' WHERE id=?",
        users.get("OFFICER"),
        visible);
    UUID otherTown = UUID.randomUUID();
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Other town')", otherTown);
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role) VALUES(?,?,?,'unused','Other','CITIZEN')",
        UUID.randomUUID(),
        otherTown,
        "otherCitizen");
    mvc.perform(
            get("/api/community/complaints?latitude=13.75&longitude=100.5")
                .with(user("otherCitizen").roles("CITIZEN")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(0));
    var response =
        mvc.perform(as(get("/api/community/complaints?latitude=13.75&longitude=100.5"), "CITIZEN"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    var data = json.readTree(response);
    assertEquals(1, data.get("total").asInt());
    assertEquals(visible.toString(), data.get("items").get(0).get("id").asText());
    assertEquals("CLOSED", data.get("items").get(0).get("status").asText());
    assertEquals(1, data.get("stats").get("closed").asInt());
    assertFalse(response.contains("Private citizen details"));
    assertFalse(response.contains("reporter_id"));
    assertFalse(response.contains("Test street"));
    mvc.perform(
            as(get("/api/community/complaints?latitude=13.75&longitude=100.5&size=101"), "CITIZEN"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void municipalityCommunityScopeFindsExistingDistantCasesWithoutWideningTenantOrPrivateAccess()
      throws Exception {
    create();
    UUID farAway = create();
    db.run(
        "UPDATE complaint SET location=ST_SetSRID(ST_MakePoint(101.5,14.75),4326)::geography,status='CLOSED',reporter_id=? WHERE id=?",
        users.get("OFFICER"),
        farAway);
    db.run(
        "INSERT INTO complaint_vote(complaint_id,user_id) VALUES(?,?)",
        farAway,
        users.get("CITIZEN"));
    mvc.perform(as(get("/api/community/complaints?latitude=13.75&longitude=100.5"), "CITIZEN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(1))
        .andExpect(jsonPath("$.municipalityTotal").value(2));
    var response =
        mvc.perform(as(get("/api/community/complaints?scope=municipality"), "CITIZEN"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(2))
            .andExpect(jsonPath("$.municipalityTotal").value(2))
            .andExpect(jsonPath("$.items.length()").value(2))
            .andExpect(jsonPath("$.stats.closed").value(1))
            .andExpect(jsonPath("$.top[0].id").value(farAway.toString()))
            .andExpect(jsonPath("$.top[0].votes").value(1))
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertFalse(response.contains("Private citizen details"));
    assertFalse(response.contains("reporter_id"));
    assertFalse(response.contains("Test street"));
    mvc.perform(as(get("/api/community/complaints?scope=municipality&page=1&size=1"), "CITIZEN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(2))
        .andExpect(jsonPath("$.items.length()").value(1));
    mvc.perform(
            as(
                get("/api/community/complaints?scope=municipality&categoryId=" + UUID.randomUUID()),
                "CITIZEN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(0))
        .andExpect(jsonPath("$.municipalityTotal").value(0))
        .andExpect(jsonPath("$.top.length()").value(0));
    UUID otherTown = UUID.randomUUID();
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Other town')", otherTown);
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role) VALUES(?,?,?,'unused','Other','CITIZEN')",
        UUID.randomUUID(),
        otherTown,
        "otherScopeCitizen");
    mvc.perform(
            get("/api/community/complaints?scope=municipality&municipalityId=" + town)
                .with(user("otherScopeCitizen").roles("CITIZEN")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(0))
        .andExpect(jsonPath("$.municipalityTotal").value(0))
        .andExpect(jsonPath("$.items.length()").value(0))
        .andExpect(jsonPath("$.top.length()").value(0));
    mvc.perform(as(get("/api/community/complaints?scope=municipality"), "OFFICER"))
        .andExpect(status().isForbidden());
  }

  @Test
  void communityScopeRejectsInvalidOrIncompleteSearchInputs() throws Exception {
    for (String query :
        List.of(
            "scope=all&latitude=13.75&longitude=100.5",
            "scope=nearby",
            "latitude=13.75",
            "latitude=NaN&longitude=100.5",
            "latitude=91&longitude=100.5",
            "scope=municipality&latitude=Infinity",
            "scope=municipality&size=101",
            "scope=municipality&page=-1"))
      mvc.perform(as(get("/api/community/complaints?" + query), "CITIZEN"))
          .andExpect(status().isBadRequest());
  }

  @Test
  void complaintCannotBeSubmittedWithoutEvidence() throws Exception {
    var body =
        Map.of(
            "categoryId",
            cat,
            "title",
            "No evidence",
            "description",
            "Details",
            "address",
            "Street");
    mvc.perform(
            as(
                post("/api/complaints")
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(body)),
                "CITIZEN"))
        .andExpect(status().isBadRequest());
    mvc.perform(
            as(
                multipart("/api/complaints")
                    .file(
                        new MockMultipartFile(
                            "complaint",
                            "complaint.json",
                            "application/json",
                            json.writeValueAsBytes(body)))
                    .with(csrf()),
                "CITIZEN"))
        .andExpect(status().isBadRequest());
    assertTrue(db.list("SELECT id FROM complaint WHERE municipality_id=?", town).isEmpty());
  }

  @Test
  void invalidInitialEvidenceIsRejected() throws Exception {
    var body =
        Map.of(
            "categoryId",
            cat,
            "title",
            "Bad evidence",
            "description",
            "Details",
            "address",
            "Street");
    mvc.perform(
            as(
                multipart("/api/complaints")
                    .file(
                        new MockMultipartFile(
                            "complaint",
                            "complaint.json",
                            "application/json",
                            json.writeValueAsBytes(body)))
                    .file(
                        new MockMultipartFile(
                            "files", "fake.mp4", "video/mp4", "MZ-invalid".getBytes()))
                    .with(csrf()),
                "CITIZEN"))
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
    if (action.equals("START")) mvc.perform(as(WorkflowTestData.startPhoto(id).with(csrf()), role));
    var b = new HashMap<String, Object>(WorkflowTestData.withDefaults(action, extras));
    if (action.equals("PROPOSE") && !b.containsKey("lineItems") && b.containsKey("amount"))
      b.put("lineItems", List.of(Map.of("name", "Test materials", "amount", b.get("amount"))));
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
    if (role.equals("FIELD")) {
      for (String stage : List.of("BEFORE", "AFTER")) {
        var image =
            new java.awt.image.BufferedImage(2, 2, java.awt.image.BufferedImage.TYPE_INT_RGB);
        var bytes = new java.io.ByteArrayOutputStream();
        javax.imageio.ImageIO.write(image, "png", bytes);
        mvc.perform(
                multipart("/api/complaints/" + id + "/files")
                    .file(
                        new MockMultipartFile(
                            "file", stage + ".png", "image/png", bytes.toByteArray()))
                    .param("evidenceStage", stage)
                    .with(user("test" + role).roles(role))
                    .with(csrf()))
            .andExpect(status().isOk());
      }
      return;
    }
    mvc.perform(
            multipart("/api/complaints/" + id + "/files")
                .file(
                    new MockMultipartFile(
                        "file", "proof.pdf", "application/pdf", "%PDF-1.4 test".getBytes()))
                .with(user("test" + role).roles(role))
                .with(csrf()))
        .andExpect(status().isOk());
  }

  void legacyPreAssignmentResource(UUID id) {
    // Existing open requests must still finish after FIELD-only initiation is enforced.
    db.run(
        "INSERT INTO resource_request(id,complaint_id,requested_by,workflow_origin) VALUES(?,?,?,'PRE_ASSIGN')",
        UUID.randomUUID(),
        id,
        users.get("LEADER"));
    db.run("UPDATE complaint SET status='RESOURCE_DRAFT',version=version+1 WHERE id=?", id);
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
    // An officer can also return the correction to the field through its leader.
    action(id, "OFFICER", "RETURN_LEADER", Map.of()).andExpect(status().isOk());
    action(id, "LEADER", "RETURN_FIELD", Map.of()).andExpect(status().isOk());
    action(id, "FIELD", "REPORT", Map.of("content", "Missing fresh evidence"))
        .andExpect(status().isBadRequest());
    evidence(id, "FIELD");
    action(id, "FIELD", "REPORT", Map.of("content", "Final corrected report"))
        .andExpect(status().isOk());
    action(id, "LEADER", "FORWARD_REPORT", Map.of()).andExpect(status().isOk());
    action(id, "OFFICER", "VERIFY", Map.of()).andExpect(status().isOk());
    action(id, "OFFICER", "CLOSE", Map.of()).andExpect(status().isOk());
    assertEquals("CLOSED", state(id));
    action(id, "OFFICER", "CLOSE", Map.of()).andExpect(status().is4xxClientError());
    assertEquals(3, db.list("SELECT id FROM field_report WHERE complaint_id=?", id).size());
    assertTrue(db.list("SELECT id FROM audit_event WHERE complaint_id=?", id).size() >= 12);
  }

  @Test
  void resourceLineItemsFollowTheFieldRequestAndTotalIsCalculatedOnServer() throws Exception {
    UUID id = create();
    assign(id);
    action(
            id,
            "FIELD",
            "REQUEST_RESOURCE",
            Map.of(
                "items",
                List.of(
                    Map.of("name", "Sand", "quantity", 2, "unit", "bags"),
                    Map.of("name", "Cement", "quantity", 1, "unit", "bags"))))
        .andExpect(status().isOk());
    evidence(id, "LEADER");
    action(
            id,
            "LEADER",
            "PROPOSE",
            Map.of(
                "proposal",
                "Materials",
                "durationDays",
                2,
                "lineItems",
                List.of(
                    Map.of("name", "Sand", "quantity", 2, "amount", "12.50"),
                    Map.of("name", "Cement", "quantity", 1, "amount", "11.25"),
                    Map.of("name", "Gravel", "quantity", 1, "amount", "5"))))
        .andExpect(status().isBadRequest());
    action(
            id,
            "LEADER",
            "PROPOSE",
            Map.of(
                "proposal",
                "Materials",
                "amount",
                999,
                "durationDays",
                2,
                "lineItems",
                List.of(
                    Map.of("name", "Renamed sand", "quantity", "3.5", "amount", "12.50"),
                    Map.of("name", "Cement", "quantity", 1, "amount", "11.25"))))
        .andExpect(status().isOk());
    var revision =
        db.one(
            "SELECT v.amount,v.line_items::text items FROM resource_revision v JOIN resource_request r ON r.id=v.resource_id WHERE r.complaint_id=?",
            id);
    assertEquals(new java.math.BigDecimal("23.75"), revision.get("amount"));
    var items = json.readTree((String) revision.get("items"));
    assertEquals(2, items.size());
    assertEquals("Sand", items.get(0).get("name").asText());
    assertEquals("bags", items.get(0).get("unit").asText());
    assertEquals(new java.math.BigDecimal("3.5"), items.get(0).get("quantity").decimalValue());
    assertEquals(
        new java.math.BigDecimal("12.50"), items.get(0).get("amount").decimalValue().setScale(2));
  }

  @Test
  void invalidResourceItemsCannotCreateRevision() throws Exception {
    UUID id = create();
    assign(id);
    action(id, "FIELD", "REQUEST_RESOURCE", Map.of()).andExpect(status().isOk());
    evidence(id, "LEADER");
    var invalid =
        List.of(
            List.of(),
            List.of(Map.of("name", " ", "amount", 1)),
            List.of(Map.of("name", "Sand", "amount", -1)),
            List.of(Map.of("name", "Sand", "amount", "0.001")),
            List.of(
                Map.of("name", "Sand", "amount", 600000000000L),
                Map.of("name", "Cement", "amount", 600000000000L)),
            java.util.Collections.nCopies(51, Map.of("name", "Sand", "amount", 1)));
    for (var items : invalid)
      action(
              id,
              "LEADER",
              "PROPOSE",
              Map.of("proposal", "Materials", "durationDays", 2, "lineItems", items))
          .andExpect(status().isBadRequest());
    assertEquals(
        0L,
        ((Number)
                db.one(
                        "SELECT count(*) n FROM resource_revision v JOIN resource_request r ON r.id=v.resource_id WHERE r.complaint_id=?",
                        id)
                    .get("n"))
            .longValue());
  }

  @Test
  void resourceDocumentsAreReadableByReviewerAndAssignedApproverOnly() throws Exception {
    UUID id = create();
    requestResource(id);
    var file =
        db.one(
            "SELECT id,resource_revision_id FROM attachment WHERE complaint_id=? AND resource_id IS NOT NULL",
            id);
    assertNotNull(file.get("resource_revision_id"));
    for (var role : List.of("LEADER", "OFFICER", "APPROVER", "ADMIN"))
      mvc.perform(as(get("/api/files/" + file.get("id")), role))
          .andExpect(status().isOk())
          .andExpect(content().contentType("application/pdf"))
          .andExpect(header().string("Cache-Control", "private, no-store"))
          .andExpect(content().bytes("%PDF-1.4 test".getBytes()));
    mvc.perform(as(get("/api/files/" + file.get("id")), "CITIZEN"))
        .andExpect(status().isForbidden());
    UUID other = UUID.randomUUID();
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Other town')", other);
    db.run(
        "UPDATE app_user SET department_id=NULL,municipality_id=? WHERE id=?",
        other,
        users.get("ADMIN"));
    mvc.perform(as(get("/api/files/" + file.get("id")), "ADMIN")).andExpect(status().isNotFound());
  }

  @Test
  void revisedResourceDocumentsStayLinkedToTheirSubmittedRevision() throws Exception {
    UUID id = create();
    assign(id);
    action(id, "FIELD", "REQUEST_RESOURCE", Map.of()).andExpect(status().isOk());
    evidence(id, "LEADER");
    action(id, "LEADER", "PROPOSE", Map.of("proposal", "First", "amount", 1, "durationDays", 1))
        .andExpect(status().isOk());
    var first =
        db.one(
            "SELECT id,resource_revision_id FROM attachment WHERE complaint_id=? AND resource_id IS NOT NULL",
            id);
    action(id, "OFFICER", "RETURN_RESOURCE", Map.of()).andExpect(status().isOk());
    evidence(id, "LEADER");
    action(id, "LEADER", "PROPOSE", Map.of("proposal", "Second", "amount", 2, "durationDays", 2))
        .andExpect(status().isOk());
    var files =
        db.list(
            "SELECT resource_revision_id FROM attachment WHERE complaint_id=? AND resource_id IS NOT NULL",
            id);
    assertEquals(2, files.size());
    assertEquals(2, files.stream().map(f -> f.get("resource_revision_id")).distinct().count());
    assertEquals(
        first.get("resource_revision_id"),
        db.one("SELECT resource_revision_id FROM attachment WHERE id=?", first.get("id"))
            .get("resource_revision_id"));
    var response =
        mvc.perform(as(get("/api/complaints/" + id), "OFFICER"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertTrue(
        json.readTree(response)
            .get("files")
            .toString()
            .contains(first.get("resource_revision_id").toString()));
  }

  @Test
  void missingPrivateDocumentReturnsNotFound() throws Exception {
    UUID id = create();
    var file = db.one("SELECT id FROM attachment WHERE complaint_id=? LIMIT 1", id);
    db.run(
        "UPDATE attachment SET storage_key=? WHERE id=?",
        UUID.randomUUID() + ".pdf",
        file.get("id"));
    mvc.perform(as(get("/api/files/" + file.get("id")), "OFFICER"))
        .andExpect(status().isNotFound());
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
    evidence(id, "LEADER");
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
  void everyWorkflowTransitionRejectsAllOtherRolesWithoutChangingData() throws Exception {
    UUID id = create();
    db.run(
        "UPDATE complaint SET leader_id=?,officer_id=? WHERE id=?",
        users.get("LEADER"),
        users.get("OFFICER"),
        id);
    db.run(
        "INSERT INTO work_order(id,complaint_id,assignee_id,assigned_by,due_at,status) VALUES(?,?,?,?,now()+interval '1 day','ACCEPTED')",
        UUID.randomUUID(),
        id,
        users.get("FIELD"),
        users.get("LEADER"));
    db.run(
        "INSERT INTO resource_request(id,complaint_id,status,approver_id,requested_by) VALUES(?,?,'PENDING',?,?)",
        UUID.randomUUID(),
        id,
        users.get("APPROVER"),
        users.get("FIELD"));
    Object originalAuditCount =
        db.one("SELECT count(*) n FROM audit_event WHERE complaint_id=?", id).get("n");
    for (String[] transition : Workflow.DEFAULT) {
      db.run("UPDATE complaint SET status=? WHERE id=?", transition[0], id);
      long before = version(id);
      for (String role : List.of("CITIZEN", "OFFICER", "LEADER", "FIELD", "APPROVER", "ADMIN")) {
        if (role.equals(transition[3])) continue;
        action(id, role, transition[1], Map.of()).andExpect(status().isForbidden());
        assertEquals(transition[0], state(id));
        assertEquals(before, version(id));
      }
    }
    assertEquals(
        originalAuditCount,
        db.one("SELECT count(*) n FROM audit_event WHERE complaint_id=?", id).get("n"));
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
  void sameCategoryNearbyFindsReportsWithin100Metres() throws Exception {
    UUID id = create();
    // About 50 m north of the report: inside the radius, so it is offered as a likely duplicate.
    mvc.perform(
            as(get("/api/nearby?latitude=13.7504&longitude=100.5&categoryId=" + cat), "CITIZEN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].id").value(id.toString()));
    mvc.perform(
            as(
                post("/api/complaints/" + id + "/follow")
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        json.writeValueAsString(
                            Map.of("categoryId", cat, "latitude", 13.7504, "longitude", 100.5))),
                "CITIZEN"))
        .andExpect(status().isOk());
    // About 200 m away: outside the radius even for the same category.
    mvc.perform(
            as(get("/api/nearby?latitude=13.7518&longitude=100.5&categoryId=" + cat), "CITIZEN"))
        .andExpect(jsonPath("$.length()").value(0));
  }

  @Test
  void nearbySharesCommunityVoteAndFollowStateWithoutPrivateFields() throws Exception {
    UUID id = create();
    String endpoint = "/api/nearby?latitude=13.75&longitude=100.5";
    // The reporter already follows their own report.
    mvc.perform(as(get(endpoint), "CITIZEN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].votes").value(0))
        .andExpect(jsonPath("$[0].voted").value(false))
        .andExpect(jsonPath("$[0].following").value(true));
    mvc.perform(as(post("/api/community/complaints/" + id + "/vote").with(csrf()), "CITIZEN"))
        .andExpect(status().isOk());
    mvc.perform(
            as(
                post("/api/complaints/" + id + "/follow")
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        json.writeValueAsString(
                            Map.of("categoryId", cat, "latitude", 13.75, "longitude", 100.5))),
                "CITIZEN"))
        .andExpect(status().isOk());
    mvc.perform(as(get(endpoint), "CITIZEN"))
        .andExpect(jsonPath("$[0].votes").value(1))
        .andExpect(jsonPath("$[0].voted").value(true))
        .andExpect(jsonPath("$[0].following").value(true))
        .andExpect(jsonPath("$[0].created_at").exists())
        .andExpect(jsonPath("$[0].description").doesNotExist())
        .andExpect(jsonPath("$[0].address").doesNotExist())
        .andExpect(jsonPath("$[0].reporter_id").doesNotExist())
        .andExpect(jsonPath("$[0].contact_phone").doesNotExist())
        .andExpect(jsonPath("$[0].media").doesNotExist());
    UUID other = UUID.randomUUID();
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role)"
            + " VALUES(?,?,'nearbyReader','x','Other','CITIZEN')",
        other,
        town);
    mvc.perform(get(endpoint).with(user("nearbyReader")))
        .andExpect(jsonPath("$[0].votes").value(1))
        .andExpect(jsonPath("$[0].voted").value(false))
        .andExpect(jsonPath("$[0].following").value(false));
    mvc.perform(as(delete("/api/community/complaints/" + id + "/vote").with(csrf()), "CITIZEN"))
        .andExpect(status().isOk());
    mvc.perform(as(delete("/api/complaints/" + id + "/follow").with(csrf()), "CITIZEN"))
        .andExpect(status().isOk());
    mvc.perform(as(get(endpoint), "CITIZEN"))
        .andExpect(jsonPath("$[0].votes").value(0))
        .andExpect(jsonPath("$[0].voted").value(false))
        .andExpect(jsonPath("$[0].following").value(false));
    mvc.perform(as(get(endpoint).param("categoryId", UUID.randomUUID().toString()), "CITIZEN"))
        .andExpect(jsonPath("$.length()").value(0));
    UUID foreign = UUID.randomUUID();
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Nearby other town')", foreign);
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role)"
            + " VALUES(?,?,'nearbyOutsider','x','Other','CITIZEN')",
        UUID.randomUUID(),
        foreign);
    mvc.perform(get(endpoint).with(user("nearbyOutsider")))
        .andExpect(jsonPath("$.length()").value(0));
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
  void legacyRegistrationCannotCreateAnAccount() throws Exception {
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
        .andExpect(status().isUnauthorized());
    assertTrue(db.list("SELECT id FROM app_user WHERE username='registered'").isEmpty());
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
        null);
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
  void leaderEditsTeamMembersAndRepresentativeForFutureAssignments() throws Exception {
    UUID member = UUID.randomUUID();
    db.run(
        "INSERT INTO"
            + " app_user(id,municipality_id,department_id,username,password_hash,display_name,role)"
            + " VALUES(?,?,?,'editMember','x','Edit member','FIELD')",
        member,
        town,
        dept);
    var created =
        mvc.perform(
                as(
                    post("/api/teams")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(
                            json.writeValueAsString(
                                Map.of(
                                    "name",
                                    "Before",
                                    "representativeId",
                                    users.get("FIELD"),
                                    "memberIds",
                                    List.of(users.get("FIELD"))))),
                    "LEADER"))
            .andExpect(status().isOk())
            .andReturn();
    UUID team =
        UUID.fromString(
            json.readTree(created.getResponse().getContentAsString()).get("id").asText());
    mvc.perform(
            as(
                put("/api/teams/" + team)
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        json.writeValueAsString(
                            Map.of(
                                "name",
                                "After",
                                "representativeId",
                                member,
                                "memberIds",
                                List.of(users.get("FIELD"), member)))),
                "LEADER"))
        .andExpect(status().isOk());
    assertEquals("After", db.one("SELECT name FROM field_team WHERE id=?", team).get("name"));
    assertEquals(
        member,
        db.one("SELECT representative_id FROM field_team WHERE id=?", team)
            .get("representative_id"));
    assertEquals(2, db.list("SELECT user_id FROM team_member WHERE team_id=?", team).size());
    // The representative must be one of the members; nothing changes when it is not.
    mvc.perform(
            as(
                put("/api/teams/" + team)
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        json.writeValueAsString(
                            Map.of(
                                "name",
                                "Broken",
                                "representativeId",
                                member,
                                "memberIds",
                                List.of(users.get("FIELD"))))),
                "LEADER"))
        .andExpect(status().is4xxClientError());
    assertEquals(2, db.list("SELECT user_id FROM team_member WHERE team_id=?", team).size());
    mvc.perform(as(post("/api/teams/" + team + "/retire").with(csrf()), "LEADER"))
        .andExpect(status().isOk());
    mvc.perform(
            as(
                put("/api/teams/" + team)
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        json.writeValueAsString(
                            Map.of(
                                "name",
                                "Retired",
                                "representativeId",
                                member,
                                "memberIds",
                                List.of(member)))),
                "LEADER"))
        .andExpect(status().is4xxClientError());
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
  void newTeamAssignmentRejectsMovedDisabledOrRepurposedMembers() throws Exception {
    UUID member = UUID.randomUUID(), other = UUID.randomUUID(), id = create();
    db.run(
        "INSERT INTO department(id,municipality_id,name) VALUES(?,?,'Another department')",
        other,
        town);
    db.run(
        "INSERT INTO app_user(id,municipality_id,department_id,username,password_hash,display_name,role) VALUES(?,?,?,'stale-member','unused','Saved team member','FIELD')",
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
                                    "Saved team",
                                    "representativeId",
                                    users.get("FIELD"),
                                    "memberIds",
                                    List.of(users.get("FIELD"), member)))),
                    "LEADER"))
            .andExpect(status().isOk())
            .andReturn();
    UUID team =
        UUID.fromString(
            json.readTree(result.getResponse().getContentAsString()).path("id").asText());
    action(id, "OFFICER", "TRIAGE", Map.of("leaderId", users.get("LEADER")))
        .andExpect(status().isOk());
    for (String invalid : List.of("MOVED", "DISABLED", "DELETED", "ROLE")) {
      db.run(
          "UPDATE app_user SET role=?,department_id=?,enabled=?,deleted_at=? WHERE id=?",
          invalid.equals("ROLE") ? "OFFICER" : "FIELD",
          invalid.equals("ROLE") ? null : invalid.equals("MOVED") ? other : dept,
          !List.of("DISABLED", "DELETED").contains(invalid),
          invalid.equals("DELETED") ? java.sql.Timestamp.from(java.time.Instant.now()) : null,
          member);
      action(id, "LEADER", "ASSIGN", Map.of("teamId", team)).andExpect(status().is4xxClientError());
      assertEquals("TRIAGED", state(id));
      assertTrue(db.list("SELECT id FROM work_order WHERE complaint_id=?", id).isEmpty());
    }
    db.run(
        "UPDATE app_user SET role='FIELD',department_id=?,enabled=true,deleted_at=NULL WHERE id=?",
        dept,
        member);
    action(id, "LEADER", "ASSIGN", Map.of("teamId", team)).andExpect(status().isOk());
    assertEquals(
        2,
        db.list(
                "SELECT wm.user_id FROM work_member wm JOIN work_order w ON w.id=wm.work_order_id WHERE w.complaint_id=?",
                id)
            .size());
  }

  @Test
  void municipalOfficerSeesEveryDepartmentButFieldRolesRemainAssignedAndScoped() throws Exception {
    UUID id = create();
    UUID otherDept = UUID.randomUUID();
    db.run(
        "INSERT INTO department(id,municipality_id,name) VALUES(?,?,'Other department')",
        otherDept,
        town);
    db.run("UPDATE complaint SET department_id=? WHERE id=?", otherDept, id);
    mvc.perform(as(get("/api/complaints/" + id), "OFFICER")).andExpect(status().isOk());
    mvc.perform(as(get("/api/complaints"), "OFFICER"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(1));
    action(id, "OFFICER", "TRIAGE", Map.of("leaderId", users.get("LEADER")))
        .andExpect(status().isForbidden());
    db.run("UPDATE app_user SET department_id=? WHERE id=?", otherDept, users.get("LEADER"));
    action(id, "OFFICER", "TRIAGE", Map.of("leaderId", users.get("LEADER")))
        .andExpect(status().isOk());
    action(id, "LEADER", "ASSIGN", Map.of("assigneeId", users.get("FIELD")))
        .andExpect(status().isForbidden());
    mvc.perform(as(get("/api/complaints/" + id), "FIELD")).andExpect(status().isForbidden());
  }

  @Test
  void municipalRolesNeverRequireOrKeepDepartmentWhileFieldRolesDo() throws Exception {
    UUID target = users.get("CITIZEN");
    for (String role : List.of("OFFICER", "APPROVER")) {
      for (Map<String, Object> body :
          List.of(
              Map.<String, Object>of("role", role),
              Map.<String, Object>of("role", role, "departmentId", dept))) {
        mvc.perform(
                as(
                    post("/api/admin/users/" + target + "/role")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)),
                    "ADMIN"))
            .andExpect(status().isOk());
        assertNull(
            db.one("SELECT department_id FROM app_user WHERE id=?", target).get("department_id"));
        var session = new org.springframework.mock.web.MockHttpSession();
        session.setAttribute("admin_role", "FIELD");
        session.setAttribute("admin_department", dept);
        mvc.perform(
                as(
                    post("/api/auth/admin-role")
                        .session(session)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)),
                    "ADMIN"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.role").value(role))
            .andExpect(jsonPath("$.department_id").doesNotExist());
        assertNull(session.getAttribute("admin_department"));
      }
    }
    for (String role : List.of("LEADER", "FIELD"))
      mvc.perform(
              as(
                  post("/api/auth/admin-role")
                      .with(csrf())
                      .contentType(MediaType.APPLICATION_JSON)
                      .content(json.writeValueAsString(Map.of("role", role))),
                  "ADMIN"))
          .andExpect(status().isBadRequest());
  }

  @Test
  void peoplePickerUsesCaseDepartmentForFieldRolesAndMunicipalityForApprovers() throws Exception {
    UUID other = UUID.randomUUID();
    db.run(
        "INSERT INTO department(id,municipality_id,name) VALUES(?,?,'Other department')",
        other,
        town);
    for (String role : List.of("LEADER", "FIELD")) {
      db.run(
          "INSERT INTO app_user(id,municipality_id,department_id,username,password_hash,display_name,role) VALUES(?,?,?,?,'unused','Other staff',?)",
          UUID.randomUUID(),
          town,
          other,
          "other-" + role,
          role);
      var people =
          mvc.perform(
                  as(
                      get("/api/people").param("role", role).param("departmentId", dept.toString()),
                      "OFFICER"))
              .andExpect(status().isOk())
              .andReturn();
      var names = json.readTree(people.getResponse().getContentAsString());
      assertTrue(names.toString().contains(users.get(role).toString()));
      assertFalse(names.toString().contains("Other staff"));
    }
    mvc.perform(as(get("/api/people").param("role", "APPROVER"), "OFFICER"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[?(@.id=='" + users.get("APPROVER") + "')]").isNotEmpty());
    mvc.perform(
            as(
                get("/api/people").param("role", "FIELD").param("departmentId", other.toString()),
                "LEADER"))
        .andExpect(status().isForbidden());
    mvc.perform(as(get("/api/people").param("role", "APPROVER"), "LEADER"))
        .andExpect(status().isForbidden());
    mvc.perform(as(get("/api/people").param("role", "ADMIN"), "OFFICER"))
        .andExpect(status().isBadRequest());
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
  void directLegacyLineEntryIsDisabled() throws Exception {
    mvc.perform(
            post("/api/auth/line")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"idToken\":\"invalid\"}"))
        .andExpect(status().isUnauthorized());
  }

  org.springframework.mock.web.MockHttpSession registeredSession(String username) {
    var principal =
        org.springframework.security.core.userdetails.User.withUsername(username)
            .password("unused-test-password")
            .roles("CITIZEN")
            .build();
    var authentication =
        org.springframework.security.authentication.UsernamePasswordAuthenticationToken
            .authenticated(principal, null, principal.getAuthorities());
    var request = new org.springframework.mock.web.MockHttpServletRequest();
    new ExternalLoginSessions(sessionRegistry)
        .authenticate(
            authentication, request, new org.springframework.mock.web.MockHttpServletResponse());
    var context =
        org.springframework.security.core.context.SecurityContextHolder.createEmptyContext();
    context.setAuthentication(authentication);
    request.getSession().setAttribute("SPRING_SECURITY_CONTEXT", context);
    return (org.springframework.mock.web.MockHttpSession) request.getSession();
  }

  @Autowired org.springframework.security.core.session.SessionRegistry sessionRegistry;

  @Test
  void passwordChangeExpiresOtherSessions() throws Exception {
    var encoder = new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(12);
    db.run(
        "UPDATE app_user SET password_hash=? WHERE id=?",
        encoder.encode("current-password-123"),
        users.get("CITIZEN"));
    var one = registeredSession("testCITIZEN");
    var two = registeredSession("testCITIZEN");
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

  UUID videoAttachment(UUID complaint, UUID file, String key, String preview) {
    db.run(
        "INSERT INTO"
            + " attachment(id,complaint_id,uploaded_by,original_name,content_type,size_bytes,sha256,storage_key,thumbnail_key,thumbnail_size)"
            + " VALUES(?,?,?,'clip.MOV','video/quicktime',1,'x',?,?,?)",
        file,
        complaint,
        users.get("CITIZEN"),
        key,
        preview,
        preview == null ? null : 14L);
    return file;
  }

  @Test
  void videoPlaysItsH264RenditionWhileDownloadsKeepTheOriginal() throws Exception {
    UUID file = UUID.randomUUID();
    var root = fileController.rootPath();
    var original = root.resolve(file + ".mov");
    var rendition = root.resolve(file + "-preview.mp4");
    java.nio.file.Files.writeString(original, "original-hevc");
    java.nio.file.Files.writeString(rendition, "h264-rendition");
    try {
      videoAttachment(create(), file, file + ".mov", file + "-preview.mp4");
      mvc.perform(as(get("/api/media/" + file), "CITIZEN"))
          .andExpect(status().isOk())
          .andExpect(header().string("Content-Type", "video/mp4"))
          .andExpect(content().string("h264-rendition"));
      mvc.perform(as(get("/api/files/" + file), "CITIZEN"))
          .andExpect(status().isOk())
          .andExpect(content().string("original-hevc"));
    } finally {
      java.nio.file.Files.deleteIfExists(original);
      java.nio.file.Files.deleteIfExists(rendition);
    }
  }

  @Test
  void onlyHevcClipsGetAnH264Rendition() throws Exception {
    org.junit.jupiter.api.Assumptions.assumeTrue(videoPreviews.available(), "ffmpeg not installed");
    UUID complaint = create();
    var root = fileController.rootPath();
    var created = new ArrayList<java.nio.file.Path>();
    try {
      for (String encoder : List.of("libx265", "libx264")) {
        UUID file = UUID.randomUUID();
        var source = root.resolve(file + ".mov");
        created.add(source);
        created.add(root.resolve(file + "-preview.mp4"));
        VideoPreviews.exec(
            120,
            videoPreviews.ffmpeg,
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=320x240:rate=10:duration=1",
            "-c:v",
            encoder,
            "-pix_fmt",
            "yuv420p",
            "-y",
            source.toString());
        videoAttachment(complaint, file, file + ".mov", null);
        videoPreviews.convert(file, source, null);
        Object key =
            db.one("SELECT thumbnail_key FROM attachment WHERE id=?", file).get("thumbnail_key");
        if (encoder.equals("libx264")) assertNull(key);
        else {
          assertEquals(file + "-preview.mp4", key);
          assertEquals("h264", videoPreviews.codec(root.resolve(file + "-preview.mp4")));
        }
      }
    } finally {
      for (var path : created) java.nio.file.Files.deleteIfExists(path);
    }
  }

  @Test
  void videoFormatsAcceptedAndTotalQuotaEnforced() throws Exception {
    UUID id = create();
    byte[] mp4 =
        java.util.HexFormat.of().parseHex("000000186674797069736f6d0000020069736f6d6d703432");
    byte[] mov = mp4.clone();
    System.arraycopy("qt  ".getBytes(java.nio.charset.StandardCharsets.US_ASCII), 0, mov, 8, 4);
    byte[] webm = java.util.HexFormat.of().parseHex("1a45dfa3934282887765626d000000000000");
    for (var entry : Map.of("clip.mp4", mp4, "clip.mov", mov, "clip.webm", webm).entrySet()) {
      mvc.perform(
              multipart("/api/complaints/" + id + "/files")
                  .file(
                      new MockMultipartFile(
                          "file", entry.getKey(), "application/octet-stream", entry.getValue()))
                  .with(user("testCITIZEN"))
                  .with(csrf()))
          .andExpect(status().isOk());
    }
    var rows =
        db.list("SELECT id,size_bytes,content_type FROM attachment WHERE complaint_id=?", id);
    assertEquals(
        Set.of("video/mp4", "video/quicktime", "video/webm"),
        new HashSet<>(
            rows.stream()
                .map(r -> (String) r.get("content_type"))
                .filter(t -> t.startsWith("video/"))
                .toList()));
    var movId =
        rows.stream()
            .filter(r -> "video/quicktime".equals(r.get("content_type")))
            .findFirst()
            .orElseThrow()
            .get("id");
    mvc.perform(get("/api/media/" + movId).with(user("testCITIZEN")))
        .andExpect(status().isOk())
        .andExpect(header().string("Content-Type", "video/mp4"))
        .andExpect(
            header().string("Content-Disposition", org.hamcrest.Matchers.startsWith("inline")));
    long used = rows.stream().mapToLong(r -> ((Number) r.get("size_bytes")).longValue()).sum();
    var first = rows.getFirst();
    // Simulate existing large attachments without allocating 300 MB in the test JVM.
    db.run(
        "UPDATE attachment SET size_bytes=size_bytes+? WHERE id=?",
        FileController.MAX_REPORT_BYTES - used - mp4.length,
        first.get("id"));
    mvc.perform(
            multipart("/api/complaints/" + id + "/files")
                .file(new MockMultipartFile("file", "last.mp4", "video/mp4", mp4))
                .with(user("testCITIZEN"))
                .with(csrf()))
        .andExpect(status().isOk());
    mvc.perform(
            multipart("/api/complaints/" + id + "/files")
                .file(new MockMultipartFile("file", "excess.mp4", "video/mp4", mp4))
                .with(user("testCITIZEN"))
                .with(csrf()))
        .andExpect(status().isPayloadTooLarge());
    assertEquals(
        FileController.MAX_REPORT_BYTES,
        ((Number)
                db.one("SELECT SUM(size_bytes) size FROM attachment WHERE complaint_id=?", id)
                    .get("size"))
            .longValue());
  }

  @Test
  void uploadQuotaIncludesEarlierRevisionsAndOtherUploaders() throws Exception {
    UUID id = create();
    requestResource(id);
    long used =
        ((Number)
                db.one("SELECT SUM(size_bytes) used FROM attachment WHERE complaint_id=?", id)
                    .get("used"))
            .longValue();
    var linked =
        db.one(
            "SELECT id FROM attachment WHERE complaint_id=? AND resource_id IS NOT NULL LIMIT 1",
            id);
    db.run(
        "UPDATE attachment SET size_bytes=size_bytes+? WHERE id=?",
        FileController.MAX_TOTAL_BYTES - used,
        linked.get("id"));
    mvc.perform(
            as(
                multipart("/api/complaints/" + id + "/files")
                    .file(
                        new MockMultipartFile(
                            "file", "extra.pdf", "application/pdf", "%PDF-1.4 test".getBytes()))
                    .with(csrf()),
                "ADMIN"))
        .andExpect(status().isPayloadTooLarge());
  }

  @Test
  void videoOverOldTenMbLimitStreamsSuccessfully() throws Exception {
    UUID id = create();
    byte[] data = new byte[11 * 1024 * 1024];
    byte[] header =
        java.util.HexFormat.of().parseHex("000000186674797069736f6d0000020069736f6d6d703432");
    System.arraycopy(header, 0, data, 0, header.length);
    mvc.perform(
            multipart("/api/complaints/" + id + "/files")
                .file(new MockMultipartFile("file", "large.mp4", "video/mp4", data))
                .with(user("testCITIZEN"))
                .with(csrf()))
        .andExpect(status().isOk());
    assertEquals(
        data.length,
        ((Number)
                db.one(
                        "SELECT size_bytes FROM attachment WHERE complaint_id=? AND original_name='large.mp4'",
                        id)
                    .get("size_bytes"))
            .longValue());
  }

  @Test
  void renamedExecutableIsNotAcceptedAsVideo() throws Exception {
    UUID id = create();
    mvc.perform(
            multipart("/api/complaints/" + id + "/files")
                .file(
                    new MockMultipartFile(
                        "file", "fake.mp4", "video/mp4", "MZnot-a-video".getBytes()))
                .with(user("testCITIZEN"))
                .with(csrf()))
        .andExpect(status().isBadRequest());
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
        mvc.perform(as(complaintRequest(body).with(csrf()), "CITIZEN"))
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
    for (String phone : List.of("08123456789", "081-234-5678", "812345678")) {
      body.put("contactPhone", phone);
      mvc.perform(as(complaintRequest(body).with(csrf()), "CITIZEN"))
          .andExpect(status().isBadRequest());
    }
    body.put("contactPhone", "021234567");
    mvc.perform(as(complaintRequest(body).with(csrf()), "CITIZEN")).andExpect(status().isOk());
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
