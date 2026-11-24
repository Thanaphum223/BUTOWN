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
class ApprovalAuthorityIntegrationTest {
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
        List.of(
            "CITIZEN",
            "OFFICER",
            "LEADER",
            "FIELD",
            "FIELD_2",
            "APPROVER",
            "APPROVER_2",
            "ADMIN")) {
      UUID id = UUID.randomUUID();
      String name = "stock_" + id;
      String stored = role.replace("_2", "");
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

  ResultActions send(String role, String path, Object body) throws Exception {
    var account = user(names.get(role));
    return mvc.perform(
        post(path)
            .with("ADMIN".equals(role) ? account.roles("ADMIN") : account)
            .with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(body)));
  }

  ResultActions position(String person, String govRole) throws Exception {
    return send(
        "ADMIN",
        "/api/admin/users/" + users.get(person) + "/role",
        Map.of("role", "APPROVER", "govRole", govRole));
  }

  void holds(String person, String govRole) {
    db.run("UPDATE app_user SET gov_role=? WHERE id=?", govRole, users.get(person));
  }

  UUID request(String amount) {
    UUID id = complaint("RESOURCE_CHECK"), resource = UUID.randomUUID();
    db.run(
        "INSERT INTO resource_request(id,complaint_id,requested_by,status) VALUES(?,?,?,'CHECK')",
        resource,
        id,
        users.get("LEADER"));
    db.run(
        "INSERT INTO resource_revision(id,resource_id,revision,proposal,amount,duration_days,"
            + "submitted_by) VALUES(?,?,1,'Repair',?::numeric,1,?)",
        UUID.randomUUID(),
        resource,
        amount,
        users.get("LEADER"));
    return id;
  }

  ResultActions act(UUID id, String role, String action, Map<String, ?> values) throws Exception {
    var body = new LinkedHashMap<String, Object>(values);
    body.put("action", action);
    body.put("reason", "Checked");
    body.put("version", db.one("SELECT version FROM complaint WHERE id=?", id).get("version"));
    return send(role, "/api/complaints/" + id + "/actions", body);
  }

  ResultActions submit(UUID id, String... people) throws Exception {
    return act(
        id,
        "OFFICER",
        "SEND_APPROVAL",
        Map.of("approverIds", Arrays.stream(people).map(users::get).toList()));
  }

  @Test
  void administratorsAssignPositionsWithAnAuditTrail() throws Exception {
    position("APPROVER", "finance_director").andExpect(status().isOk());
    position("APPROVER", "MAYOR").andExpect(status().isOk());
    assertFalse(
        db.list(
                "SELECT id FROM audit_event WHERE municipality_id=? AND action='USER_ROLE' AND reason"
                    + " LIKE '%govRole=FINANCE_DIRECTOR->MAYOR'",
                town)
            .isEmpty());
    mvc.perform(get("/api/admin").with(user(names.get("ADMIN")).roles("ADMIN")))
        .andExpect(status().isOk())
        .andExpect(
            jsonPath("$.users[?(@.id=='" + users.get("APPROVER") + "')].gov_role").value("MAYOR"));
    mvc.perform(get("/api/auth/me").with(user(names.get("APPROVER"))))
        .andExpect(jsonPath("$.gov_role").value("MAYOR"));
    // Leaving the field out keeps the position; a bad code changes nothing; citizens hold none.
    String path = "/api/admin/users/" + users.get("APPROVER") + "/role";
    send("ADMIN", path, Map.of("role", "APPROVER")).andExpect(status().isOk());
    position("APPROVER", "<b>").andExpect(status().isBadRequest());
    assertEquals(
        "MAYOR",
        db.one("SELECT gov_role FROM app_user WHERE id=?", users.get("APPROVER")).get("gov_role"));
    send("ADMIN", path, Map.of("role", "CITIZEN", "govRole", "MAYOR")).andExpect(status().isOk());
    assertNull(
        db.one("SELECT gov_role FROM app_user WHERE id=?", users.get("APPROVER")).get("gov_role"));
  }

  @Test
  void limitedPositionsApproveUpToTheLimit() throws Exception {
    for (String role : List.of("FINANCE_DIRECTOR", "SUPPLY_HEAD")) {
      holds("APPROVER", role);
      UUID id = request("500000.00");
      submit(id, "APPROVER").andExpect(status().isOk());
      mvc.perform(get("/api/complaints/" + id).with(user(names.get("OFFICER"))))
          .andExpect(jsonPath("$.resources[0].approver_gov_role").value(role))
          .andExpect(jsonPath("$.approvals[0].approver_gov_role").value(role));
      act(id, "APPROVER", "APPROVE", Map.of()).andExpect(status().isOk());
      UUID over = request("500000.01");
      submit(over, "APPROVER")
          .andExpect(status().isBadRequest())
          .andExpect(
              jsonPath("$.message")
                  .value(org.hamcrest.Matchers.startsWith("วงเงินเกิน 500,000 บาท")));
    }
  }

  @Test
  void limitedPositionsMayScreenBeforeAHigherFinalApprover() throws Exception {
    db.run("UPDATE workflow_version SET approval_stages=2 WHERE id=?", definition);
    holds("APPROVER", "FINANCE_DIRECTOR");
    for (String higher : List.of("MAYOR", "MUNICIPAL_CLERK")) {
      holds("APPROVER_2", higher);
      UUID id = request("500000.01");
      submit(id, "APPROVER", "APPROVER_2").andExpect(status().isOk());
      act(id, "APPROVER", "APPROVE", Map.of()).andExpect(status().isOk());
      act(id, "APPROVER_2", "APPROVE", Map.of()).andExpect(status().isOk());
      assertEquals("APPROVED", workflow.resource(id).get("status"));
    }
  }

  @Test
  void theLimitIsCheckedAgainAtFinalApproval() throws Exception {
    holds("APPROVER", "MAYOR");
    UUID id = request("500000.01");
    submit(id, "APPROVER").andExpect(status().isOk());
    holds("APPROVER", "FINANCE_DIRECTOR");
    act(id, "APPROVER", "APPROVE", Map.of()).andExpect(status().isBadRequest());
  }

  @Test
  void accountsWithoutAPositionApproveAsBefore() throws Exception {
    for (String role : Arrays.asList(null, "APPROVER")) {
      holds("APPROVER", role);
      UUID id = request("900000000.00");
      submit(id, "APPROVER").andExpect(status().isOk());
      act(id, "APPROVER", "APPROVE", Map.of()).andExpect(status().isOk());
    }
  }
}
