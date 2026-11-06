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
class CitizenTrackingPrivacyIntegrationTest {
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

  void audit(UUID id, String action, String target, String reason, int minutes) {
    db.run(
        "INSERT INTO audit_event(id,complaint_id,municipality_id,actor_id,action,to_status,reason,created_at) VALUES(?,?,?,?,?,?,?,now()-(?*interval '1 minute'))",
        UUID.randomUUID(),
        id,
        town,
        users.get("OFFICER"),
        action,
        target,
        reason,
        minutes);
  }

  @Test
  void reporterAndCommunitySeeOnlyTheFinalDecisionReason() throws Exception {
    for (String state : List.of("REJECTED", "TERMINATED", "CLOSED")) {
      UUID id = complaint(state);
      String action =
          state.equals("REJECTED") ? "REJECT" : state.equals("TERMINATED") ? "DENY" : "CLOSE";
      audit(id, "TRIAGE", "TRIAGED", "PRIVATE_INTERNAL_NOTE", 3);
      audit(id, action, state, "Public final decision " + state, 2);
      audit(id, "INTERNAL_NOTE", null, "PRIVATE_AFTER_DECISION_NOTE", 1);
      for (String prefix : List.of("/api/complaints/", "/api/community/complaints/")) {
        var result =
            mvc.perform(get(prefix + id).with(user(names.get("CITIZEN"))))
                .andExpect(status().isOk())
                .andReturn();
        var body = json.readTree(result.getResponse().getContentAsString());
        var reasons = new ArrayList<String>();
        body.path("history")
            .forEach(
                row -> {
                  if (row.hasNonNull("reason")) reasons.add(row.path("reason").asText());
                });
        assertEquals(List.of("Public final decision " + state), reasons);
        assertFalse(body.toString().contains("PRIVATE_"));
        body.path("history")
            .forEach(
                row -> {
                  assertFalse(row.has("actor_id"));
                  assertFalse(row.has("actor_name"));
                  assertFalse(row.has("details"));
                });
      }
    }
  }

  @Test
  void activeComplaintsDoNotPublishPastDecisionOrInternalReasons() throws Exception {
    UUID id = complaint("IN_PROGRESS");
    audit(id, "DENY", "TERMINATED", "PRIVATE_OLD_DECISION", 2);
    audit(id, "START", "IN_PROGRESS", "PRIVATE_CURRENT_NOTE", 1);
    for (String prefix : List.of("/api/complaints/", "/api/community/complaints/")) {
      var result =
          mvc.perform(get(prefix + id).with(user(names.get("CITIZEN"))))
              .andExpect(status().isOk())
              .andReturn();
      assertFalse(result.getResponse().getContentAsString().contains("PRIVATE_"));
    }
  }

  @Test
  void publicDetailKeepsOriginalLocationContactsAndReporterAccessPrivate() throws Exception {
    UUID id = complaint("REJECTED");
    db.run(
        "UPDATE complaint SET contact_name='PRIVATE_CONTACT',contact_phone='0891234567',description='PRIVATE_DESCRIPTION',address='PRIVATE_ADDRESS',location=ST_SetSRID(ST_MakePoint(100.543219,13.754321),4326)::geography WHERE id=?",
        id);
    audit(id, "REJECT", "REJECTED", "Outside municipal responsibility", 1);
    UUID other = UUID.randomUUID();
    String otherName = "other_" + other;
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role) VALUES(?,?,?,'x','Other citizen','CITIZEN')",
        other,
        town,
        otherName);
    mvc.perform(get("/api/complaints/" + id).with(user(otherName)))
        .andExpect(status().isForbidden());
    var result =
        mvc.perform(get("/api/community/complaints/" + id).with(user(otherName)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.complaint.latitude").value(13.754))
            .andExpect(jsonPath("$.complaint.longitude").value(100.543))
            .andReturn();
    String body = result.getResponse().getContentAsString();
    assertTrue(body.contains("Outside municipal responsibility"));
    assertFalse(body.contains("PRIVATE_"));
    assertFalse(body.contains("0891234567"));
    assertFalse(body.contains("13.754321"));
    UUID otherTown = UUID.randomUUID();
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Other town')", otherTown);
    db.run("UPDATE app_user SET municipality_id=? WHERE id=?", otherTown, other);
    mvc.perform(get("/api/community/complaints/" + id).with(user(otherName)))
        .andExpect(status().isNotFound());
  }
}
