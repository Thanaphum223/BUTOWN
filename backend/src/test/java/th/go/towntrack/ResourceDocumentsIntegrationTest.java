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
class ResourceDocumentsIntegrationTest {
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
        "INSERT INTO category(id,municipality_id,department_id,workflow_id,name,sla_hours)"
            + " VALUES(?,?,?,?,'Road',72)",
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
          "INSERT INTO"
              + " app_user(id,municipality_id,department_id,username,password_hash,display_name,role)"
              + " VALUES(?,?,?,?,?,?,?)",
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
        "INSERT INTO"
            + " complaint(id,municipality_id,category_id,reporter_id,officer_id,leader_id,department_id,workflow_id,title,description,address,status,due_at)"
            + " VALUES(?,?,?,?,?,?,?,?,'Road case','Original report','Public"
            + " location',?,now()+interval '3 days')",
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
  void fieldNecessityIsAvailableOnTheDraftResourceBeforeProposal() throws Exception {
    UUID id = assigned();
    action(id, "FIELD", "ACCEPT", Map.of()).andExpect(status().isOk());
    action(id, "FIELD", "REQUEST_RESOURCE", Map.of("reason", "Need two drainage pumps"))
        .andExpect(status().isOk());
    mvc.perform(get("/api/complaints/" + id).with(user(names.get("LEADER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.resources[0].necessity").value("Need two drainage pumps"))
        .andExpect(jsonPath("$.resources[0].requested_by").value(users.get("FIELD").toString()))
        .andExpect(jsonPath("$.resources[0].revisions").value("[]"));
  }

  UUID resourceDraft() throws Exception {
    UUID id = assigned();
    action(id, "FIELD", "ACCEPT", Map.of()).andExpect(status().isOk());
    action(id, "FIELD", "REQUEST_RESOURCE", Map.of("reason", "Need materials"))
        .andExpect(status().isOk());
    return id;
  }

  void upload(UUID id, String name, String declaredType, byte[] data) throws Exception {
    mvc.perform(
            multipart("/api/complaints/" + id + "/files")
                .file(
                    new org.springframework.mock.web.MockMultipartFile(
                        "file", name, declaredType, data))
                .with(user(names.get("LEADER")))
                .with(csrf()))
        .andExpect(status().isOk());
  }

  ResultActions propose(UUID id) throws Exception {
    return action(
        id,
        "LEADER",
        "PROPOSE",
        Map.of(
            "proposal",
            "Drainage equipment",
            "durationDays",
            2,
            "lineItems",
            List.of(Map.of("name", "Pump", "amount", 100))));
  }

  @Test
  void jpegAndPngCanEachSatisfyProposalDocumentAndStayPrivateRevisionAttachments()
      throws Exception {
    for (byte[] image :
        List.of(
            new byte[] {(byte) 255, (byte) 216, (byte) 255, 1, 2, 3},
            new byte[] {(byte) 137, 80, 78, 71, 13, 10, 26, 10, 0})) {
      UUID id = resourceDraft();
      // Detection must follow bytes even when the browser supplies an incorrect name or MIME type.
      upload(id, "camera.pdf", "application/pdf", image);
      propose(id).andExpect(status().isOk());
      var file =
          db.one(
              "SELECT id,resource_id,resource_revision_id,content_type FROM attachment WHERE"
                  + " complaint_id=?",
              id);
      assertNotNull(file.get("resource_id"));
      assertNotNull(file.get("resource_revision_id"));
      assertTrue(file.get("content_type").toString().startsWith("image/"));
      mvc.perform(get("/api/files/" + file.get("id")).with(user(names.get("LEADER"))))
          .andExpect(status().isOk())
          .andExpect(content().bytes(image));
      mvc.perform(get("/api/files/" + file.get("id")).with(user(names.get("CITIZEN"))))
          .andExpect(status().isForbidden());
    }
  }

  @Test
  void proposalAcceptsExact15MbButRejectsAnOversizedAdditionalDocument() throws Exception {
    UUID id = resourceDraft();
    byte[] boundary = new byte[15_000_000];
    System.arraycopy("%PDF-1.4".getBytes(), 0, boundary, 0, 8);
    upload(id, "boundary.pdf", "application/pdf", boundary);
    propose(id).andExpect(status().isOk());

    UUID oversized = resourceDraft();
    upload(oversized, "small.pdf", "application/pdf", "%PDF-1.4 small".getBytes());
    byte[] large = new byte[15_000_001];
    System.arraycopy("%PDF-1.4".getBytes(), 0, large, 0, 8);
    upload(oversized, "large.pdf", "application/pdf", large);
    propose(oversized).andExpect(status().isBadRequest());
    assertEquals(
        "RESOURCE_DRAFT",
        db.one("SELECT status FROM complaint WHERE id=?", oversized).get("status"));
    assertEquals(
        0L,
        ((Number)
                db.one(
                        "SELECT count(*) n FROM resource_revision v JOIN resource_request r ON"
                            + " r.id=v.resource_id WHERE r.complaint_id=?",
                        oversized)
                    .get("n"))
            .longValue());
  }

  @Test
  void historicalNecessityBackfillRequiresOneExactRequestAndAuditPair() throws Exception {
    UUID exact = resourceDraft();
    UUID ambiguousRequest = resourceDraft();
    db.run(
        "INSERT INTO resource_request(id,complaint_id,requested_by) VALUES(?,?,?)",
        UUID.randomUUID(),
        ambiguousRequest,
        users.get("FIELD"));
    UUID ambiguousAudit = resourceDraft();
    workflow.audit(
        db.one("SELECT * FROM app_user WHERE id=?", users.get("FIELD")),
        ambiguousAudit,
        "REQUEST_RESOURCE",
        "ACCEPTED",
        "RESOURCE_DRAFT",
        "Different historical reason");
    UUID differentTime = resourceDraft();
    db.run(
        "UPDATE resource_request SET created_at=created_at-interval '1 microsecond' WHERE"
            + " complaint_id=?",
        differentTime);
    // Reapply just this migration against the pre-migration table shape inside the test
    // transaction.
    db.run("ALTER TABLE resource_request DROP COLUMN IF EXISTS necessity");
    try (var migration =
        getClass().getResourceAsStream("/db/migration/V28__resource_request_necessity.sql")) {
      assertNotNull(migration, "A migration must preserve only unambiguous historical necessity");
      db.run(new String(migration.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
    }
    assertEquals(
        "Need materials",
        db.one("SELECT necessity FROM resource_request WHERE complaint_id=?", exact)
            .get("necessity"));
    for (UUID complaint : List.of(ambiguousRequest, ambiguousAudit, differentTime)) {
      assertTrue(
          db.list("SELECT necessity FROM resource_request WHERE complaint_id=?", complaint).stream()
              .allMatch(row -> row.get("necessity") == null));
    }
  }
}
