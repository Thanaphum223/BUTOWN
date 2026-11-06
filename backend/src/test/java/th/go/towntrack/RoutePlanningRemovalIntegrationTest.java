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
class RoutePlanningRemovalIntegrationTest {
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

  UUID legacyPlan(UUID complaintId, String state, boolean reserved, Object workOrder) {
    UUID plan = UUID.randomUUID();
    db.run(
        "INSERT INTO route_plan(id,municipality_id,department_id,leader_id,created_by,name,status,start_latitude,start_longitude,return_to_start,optimized,distance,duration,geometry) VALUES(?,?,?,?,?,'Legacy round',?,13.75,100.5,true,true,100,60,'{}'::jsonb)",
        plan,
        town,
        dept,
        users.get("LEADER"),
        users.get("OFFICER"),
        state);
    db.run(
        "INSERT INTO route_stop(plan_id,complaint_id,stop_order,complaint_version,title,address,latitude,longitude,reserved,work_order_id) VALUES(?,?,1,0,'Legacy stop','Public location',13.75,100.5,?,?)",
        plan,
        complaintId,
        reserved,
        workOrder);
    return plan;
  }

  @Test
  void formerRouteEndpointsAreUnavailableToAuthenticatedStaff() throws Exception {
    for (String path : List.of("", "/candidates", "/" + UUID.randomUUID()))
      mvc.perform(get("/api/route-plans" + path).with(user(names.get("OFFICER"))))
          .andExpect(status().isNotFound());
    for (String path :
        List.of(
            "/calculate",
            "/" + UUID.randomUUID() + "/propose",
            "/" + UUID.randomUUID() + "/confirm",
            "/" + UUID.randomUUID() + "/decline",
            "/" + UUID.randomUUID() + "/cancel"))
      mvc.perform(
              post("/api/route-plans" + path)
                  .with(user(names.get("LEADER")))
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{}"))
          .andExpect(status().isNotFound());
  }

  @Test
  void legacyReservationDoesNotHideOrBlockOrdinaryAssignment() throws Exception {
    UUID id = complaint("TRIAGED");
    legacyPlan(id, "PROPOSED", true, null);
    mvc.perform(get("/api/complaints/" + id).with(user(names.get("LEADER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.actions[?(@.action=='ASSIGN')]").isNotEmpty())
        .andExpect(jsonPath("$.routeReservation").doesNotExist());
    action(id, "LEADER", "ASSIGN", Map.of("assigneeId", users.get("FIELD")))
        .andExpect(status().isOk());
    action(id, "FIELD", "ACCEPT", Map.of()).andExpect(status().isOk());
    action(id, "FIELD", "START", Map.of()).andExpect(status().isOk());
  }

  @Test
  void retirementMigrationReleasesPendingRoundsAndPreservesDispatchedWork() throws Exception {
    UUID draftCase = complaint("TRIAGED"),
        pendingCase = complaint("TRIAGED"),
        dispatchedCase = assigned();
    Object workOrder =
        db.one("SELECT id FROM work_order WHERE complaint_id=?", dispatchedCase).get("id");
    Object due = db.one("SELECT due_at FROM complaint WHERE id=?", dispatchedCase).get("due_at");
    var history =
        db.list(
            "SELECT * FROM audit_event WHERE complaint_id=? ORDER BY created_at,id",
            dispatchedCase);
    UUID draft = legacyPlan(draftCase, "DRAFT", false, null),
        pending = legacyPlan(pendingCase, "PROPOSED", true, null),
        dispatched = legacyPlan(dispatchedCase, "DISPATCHED", false, workOrder);
    var migration =
        new org.springframework.core.io.ClassPathResource(
            "db/migration/V26__retire_task_route_planning.sql");
    assertTrue(migration.exists(), "Retirement migration must release pending reservations");
    db.jdbc.execute(
        (org.springframework.jdbc.core.ConnectionCallback<Void>)
            connection -> {
              org.springframework.jdbc.datasource.init.ScriptUtils.executeSqlScript(
                  connection, migration);
              return null;
            });
    for (UUID plan : List.of(draft, pending)) {
      var row = db.one("SELECT status,version FROM route_plan WHERE id=?", plan);
      assertEquals("CANCELLED", row.get("status"));
      assertEquals(1L, ((Number) row.get("version")).longValue());
    }
    assertEquals(
        "DISPATCHED", db.one("SELECT status FROM route_plan WHERE id=?", dispatched).get("status"));
    assertEquals(
        workOrder,
        db.one("SELECT work_order_id FROM route_stop WHERE plan_id=?", dispatched)
            .get("work_order_id"));
    assertEquals(
        0L,
        ((Number)
                db.one(
                        "SELECT count(*) n FROM route_stop WHERE plan_id IN (?,?,?) AND reserved",
                        draft,
                        pending,
                        dispatched)
                    .get("n"))
            .longValue());
    assertEquals(
        history,
        db.list(
            "SELECT * FROM audit_event WHERE complaint_id=? ORDER BY created_at,id",
            dispatchedCase));
    assertEquals(
        due, db.one("SELECT due_at FROM complaint WHERE id=?", dispatchedCase).get("due_at"));
    action(pendingCase, "LEADER", "ASSIGN", Map.of("assigneeId", users.get("FIELD")))
        .andExpect(status().isOk());
    action(dispatchedCase, "FIELD", "ACCEPT", Map.of()).andExpect(status().isOk());
    action(dispatchedCase, "FIELD", "START", Map.of()).andExpect(status().isOk());
  }
}
