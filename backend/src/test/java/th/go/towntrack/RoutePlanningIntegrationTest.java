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
class RoutePlanningIntegrationTest {
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

  static final com.sun.net.httpserver.HttpServer provider = provider();

  static com.sun.net.httpserver.HttpServer provider() {
    try {
      var server =
          com.sun.net.httpserver.HttpServer.create(
              new java.net.InetSocketAddress("127.0.0.1", 0), 0);
      server.createContext(
          "/",
          e -> {
            String body =
                e.getRequestURI().getPath().contains("/table/")
                    ? "{\"code\":\"Ok\",\"durations\":[[0,12,20],[11,0,8],[25,10,0]]}"
                    : "{\"code\":\"Ok\",\"routes\":[{\"distance\":1200,\"duration\":300,\"geometry\":{\"type\":\"LineString\",\"coordinates\":[[100.5,13.75],[100.51,13.76],[100.52,13.77]]}}]}";
            var bytes = body.getBytes();
            e.sendResponseHeaders(200, bytes.length);
            e.getResponseBody().write(bytes);
            e.close();
          });
      server.start();
      return server;
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }

  @org.springframework.test.context.DynamicPropertySource
  static void properties(org.springframework.test.context.DynamicPropertyRegistry registry) {
    registry.add("ROUTING_BASE_URL", () -> "http://127.0.0.1:" + provider.getAddress().getPort());
  }

  @AfterAll
  static void stopProvider() {
    provider.stop(0);
  }

  List<UUID> cases() {
    var ids = List.of(complaint("TRIAGED"), complaint("TRIAGED"));
    for (int i = 0; i < ids.size(); i++)
      db.run(
          "UPDATE complaint SET location=ST_SetSRID(ST_MakePoint(?,?),4326)::geography WHERE id=?",
          100.51 + i * .01,
          13.76 + i * .01,
          ids.get(i));
    return ids;
  }

  ResultActions routePost(String path, String role, Map<String, ?> values) throws Exception {
    return mvc.perform(
        post("/api/route-plans" + path)
            .with(user(names.get(role)))
            .with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(values)));
  }

  UUID calculate(List<UUID> ids, String role) throws Exception {
    var result =
        routePost(
                "/calculate",
                role,
                Map.of(
                    "complaintIds",
                    ids,
                    "startLatitude",
                    13.75,
                    "startLongitude",
                    100.5,
                    "returnToStart",
                    true,
                    "optimize",
                    true))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("DRAFT"))
            .andReturn();
    return UUID.fromString(
        json.readTree(result.getResponse().getContentAsString()).path("id").asText());
  }

  UUID team() throws Exception {
    var result =
        mvc.perform(
                post("/api/teams")
                    .with(user(names.get("LEADER")))
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        json.writeValueAsString(
                            Map.of(
                                "name",
                                "Route team",
                                "memberIds",
                                List.of(users.get("FIELD")),
                                "representativeId",
                                users.get("FIELD")))))
            .andExpect(status().isOk())
            .andReturn();
    return UUID.fromString(
        json.readTree(result.getResponse().getContentAsString()).path("id").asText());
  }

  long routeVersion(UUID id) {
    return ((Number) db.one("SELECT version FROM route_plan WHERE id=?", id).get("version"))
        .longValue();
  }

  @Test
  void officerProposesLeaderConfirmsAndFieldReceivesOrderedIndependentJobs() throws Exception {
    var ids = cases();
    UUID plan = calculate(ids, "OFFICER");
    UUID team = team();
    routePost(
            "/" + plan + "/propose",
            "OFFICER",
            Map.of("version", routeVersion(plan), "name", "Morning round"))
        .andExpect(status().isOk());
    action(ids.getFirst(), "LEADER", "ASSIGN", Map.of("assigneeId", users.get("FIELD")))
        .andExpect(status().isConflict());
    routePost(
            "/" + plan + "/confirm",
            "OFFICER",
            Map.of("version", routeVersion(plan), "teamId", team))
        .andExpect(status().isForbidden());
    routePost(
            "/" + plan + "/confirm",
            "LEADER",
            Map.of("version", routeVersion(plan), "teamId", team))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("DISPATCHED"));
    mvc.perform(get("/api/teams").with(user(names.get("LEADER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].active_work_count").value(2));
    mvc.perform(get("/api/route-plans/" + plan).with(user(names.get("FIELD"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.stops.length()").value(2))
        .andExpect(jsonPath("$.distance").value(1200));
    assertEquals(
        2,
        db.list("SELECT id FROM work_order WHERE complaint_id IN (?,?)", ids.get(0), ids.get(1))
            .size());
    action(ids.getFirst(), "FIELD", "ACCEPT", Map.of()).andExpect(status().isOk());
    assertEquals(
        "ASSIGNED", db.one("SELECT status FROM complaint WHERE id=?", ids.get(1)).get("status"));
  }

  @Test
  void staleJobOrWrongTeamRollsBackWholeRoundAndCancellationReleasesReservation() throws Exception {
    var ids = cases();
    UUID plan = calculate(ids, "OFFICER");
    db.run("UPDATE complaint SET version=version+1 WHERE id=?", ids.get(1));
    routePost(
            "/" + plan + "/propose",
            "OFFICER",
            Map.of("version", routeVersion(plan), "name", "Stale round"))
        .andExpect(status().isConflict());
    assertTrue(
        db.list("SELECT complaint_id FROM route_stop WHERE plan_id=? AND reserved", plan)
            .isEmpty());
    plan = calculate(ids, "OFFICER");
    routePost(
            "/" + plan + "/propose",
            "OFFICER",
            Map.of("version", routeVersion(plan), "name", "Current round"))
        .andExpect(status().isOk());
    routePost(
            "/" + plan + "/confirm",
            "LEADER",
            Map.of("version", routeVersion(plan), "teamId", UUID.randomUUID()))
        .andExpect(status().isNotFound());
    assertTrue(
        db.list("SELECT id FROM work_order WHERE complaint_id IN (?,?)", ids.get(0), ids.get(1))
            .isEmpty());
    routePost(
            "/" + plan + "/decline",
            "LEADER",
            Map.of("version", routeVersion(plan), "reason", "   "))
        .andExpect(status().isBadRequest());
    routePost(
            "/" + plan + "/decline",
            "LEADER",
            Map.of("version", routeVersion(plan), "reason", "Team unavailable today"))
        .andExpect(status().isOk());
    action(ids.getFirst(), "LEADER", "ASSIGN", Map.of("assigneeId", users.get("FIELD")))
        .andExpect(status().isOk());
  }

  @Test
  void routePlanningRejectsOtherRolesDifferentLeadersAndDuplicateJobs() throws Exception {
    var ids = cases();
    routePost(
            "/calculate",
            "FIELD",
            Map.of(
                "complaintIds",
                ids,
                "startLatitude",
                13.75,
                "startLongitude",
                100.5,
                "returnToStart",
                false))
        .andExpect(status().isForbidden());
    routePost(
            "/calculate",
            "OFFICER",
            Map.of(
                "complaintIds",
                List.of(ids.getFirst(), ids.getFirst()),
                "startLatitude",
                13.75,
                "startLongitude",
                100.5,
                "returnToStart",
                false))
        .andExpect(status().isBadRequest());
    db.run("UPDATE complaint SET leader_id=NULL WHERE id=?", ids.get(1));
    routePost(
            "/calculate",
            "OFFICER",
            Map.of(
                "complaintIds",
                ids,
                "startLatitude",
                13.75,
                "startLongitude",
                100.5,
                "returnToStart",
                false))
        .andExpect(status().isConflict());
  }

  @Test
  void calculateReplayRechecksRoleAndDraftVisibility() throws Exception {
    var body =
        Map.of(
            "complaintIds",
            cases(),
            "startLatitude",
            13.75,
            "startLongitude",
            100.5,
            "returnToStart",
            false);
    UUID key = UUID.randomUUID();
    var request =
        post("/api/route-plans/calculate")
            .with(user(names.get("OFFICER")))
            .with(csrf())
            .header("Idempotency-Key", key)
            .contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(body));
    String first =
        mvc.perform(request)
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    mvc.perform(request).andExpect(status().isOk()).andExpect(content().json(first));
    db.run(
        "UPDATE app_user SET role='FIELD',department_id=? WHERE id=?", dept, users.get("OFFICER"));
    mvc.perform(request).andExpect(status().isForbidden());
  }

  @Test
  void changeReplayRechecksCurrentPlanVisibility() throws Exception {
    UUID plan = calculate(cases(), "OFFICER");
    UUID key = UUID.randomUUID();
    var request =
        post("/api/route-plans/" + plan + "/propose")
            .with(user(names.get("OFFICER")))
            .with(csrf())
            .header("Idempotency-Key", key)
            .contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("version", 0, "name", "Saved round")));
    String first =
        mvc.perform(request)
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    mvc.perform(request).andExpect(status().isOk()).andExpect(content().json(first));
    db.run(
        "UPDATE app_user SET role='FIELD',department_id=? WHERE id=?", dept, users.get("OFFICER"));
    mvc.perform(request).andExpect(status().isForbidden());
  }

  @Test
  void draftCannotBeReadAfterCreatorLosesPlanningRole() throws Exception {
    UUID plan = calculate(cases(), "OFFICER");
    db.run(
        "UPDATE app_user SET role='FIELD',department_id=? WHERE id=?", dept, users.get("OFFICER"));
    mvc.perform(get("/api/route-plans/" + plan).with(user(names.get("OFFICER"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void overlappingProposalsReserveAllJobsAndCancelReleasesThem() throws Exception {
    var ids = cases();
    UUID first = calculate(ids, "OFFICER"), second = calculate(ids, "OFFICER");
    routePost("/" + first + "/propose", "OFFICER", Map.of("version", 0, "name", "First round"))
        .andExpect(status().isOk());
    routePost("/" + second + "/propose", "OFFICER", Map.of("version", 0, "name", "Second round"))
        .andExpect(status().isConflict());
    assertEquals(
        2,
        db.list("SELECT complaint_id FROM route_stop WHERE plan_id=? AND reserved", first).size());
    assertTrue(
        db.list("SELECT complaint_id FROM route_stop WHERE plan_id=? AND reserved", second)
            .isEmpty());
    routePost(
            "/" + first + "/cancel",
            "OFFICER",
            Map.of("version", routeVersion(first), "reason", "Reschedule round"))
        .andExpect(status().isOk());
    routePost("/" + second + "/propose", "OFFICER", Map.of("version", 0, "name", "Second round"))
        .andExpect(status().isOk());
  }

  @Test
  void changedSecondJobPreventsEveryAssignmentAndForeignOfficerCannotReadPlan() throws Exception {
    var ids = cases();
    UUID plan = calculate(ids, "OFFICER"), team = team();
    routePost("/" + plan + "/propose", "OFFICER", Map.of("version", 0, "name", "Round"))
        .andExpect(status().isOk());
    db.run("UPDATE complaint SET version=version+1 WHERE id=?", ids.get(1));
    routePost(
            "/" + plan + "/confirm",
            "LEADER",
            Map.of("version", routeVersion(plan), "teamId", team))
        .andExpect(status().isConflict());
    assertTrue(
        db.list("SELECT id FROM work_order WHERE complaint_id IN (?,?)", ids.get(0), ids.get(1))
            .isEmpty());
    UUID otherTown = UUID.randomUUID(), otherUser = UUID.randomUUID();
    String username = "route_other_" + otherUser;
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Other town')", otherTown);
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role) VALUES(?,?,?,'x','Other officer','OFFICER')",
        otherUser,
        otherTown,
        username);
    mvc.perform(get("/api/route-plans/" + plan).with(user(username)))
        .andExpect(status().isNotFound());
  }
}
