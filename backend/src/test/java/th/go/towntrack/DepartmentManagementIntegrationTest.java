package th.go.towntrack;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** PostgreSQL policy coverage. Run only against the task's isolated test database. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class DepartmentManagementIntegrationTest {
  @Autowired Db db;
  @Autowired MockMvc mvc;
  @Autowired Workflow workflow;
  @Autowired ObjectMapper json;
  UUID town, department, otherDepartment, actor, category, definition;
  String adminName;

  @BeforeEach
  void setup() {
    town = UUID.randomUUID();
    department = UUID.randomUUID();
    otherDepartment = UUID.randomUUID();
    actor = UUID.randomUUID();
    category = UUID.randomUUID();
    adminName = "department-admin-" + actor;
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Department fixture')", town);
    db.run(
        "INSERT INTO department(id,municipality_id,name) VALUES(?,?,'Engineering'),(?,?,'Environment')",
        department,
        town,
        otherDepartment,
        town);
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role) VALUES(?,?,?,'unused','Department administrator','ADMIN')",
        actor,
        town,
        adminName);
    definition = workflow.createDefault(town, 1);
    db.run(
        "INSERT INTO category(id,municipality_id,department_id,workflow_id,name,sla_hours,active) VALUES(?,?,?,?,'Historical category',24,false)",
        category,
        town,
        department,
        definition);
  }

  UUID account(String role, boolean enabled, boolean archived, UUID municipality, UUID dept) {
    UUID id = UUID.randomUUID();
    db.run(
        "INSERT INTO app_user(id,municipality_id,department_id,username,password_hash,display_name,role,enabled,deleted_at) VALUES(?,?,?,?,'unused','Department account',?,?,CASE WHEN ? THEN now() ELSE NULL END)",
        id,
        municipality,
        dept,
        "department-user-" + id,
        role,
        enabled,
        archived);
    return id;
  }

  UUID complaint(String status) {
    UUID id = UUID.randomUUID();
    db.run(
        "INSERT INTO complaint(id,municipality_id,category_id,reporter_id,department_id,workflow_id,title,description,address,due_at,status) VALUES(?,?,?,?,?,?,'Historical issue','Description','Address',now(),?)",
        id,
        town,
        category,
        actor,
        department,
        definition,
        status);
    return id;
  }

  UUID team(boolean active) {
    UUID head = account("LEADER", false, true, town, department),
        field = account("FIELD", false, true, town, department),
        id = UUID.randomUUID();
    db.run(
        "INSERT INTO field_team(id,municipality_id,department_id,leader_id,representative_id,name,active) VALUES(?,?,?,?,?,'Historical team',?)",
        id,
        town,
        department,
        head,
        field,
        active);
    db.run("INSERT INTO team_member(team_id,user_id) VALUES(?,?)", id, field);
    return id;
  }

  UUID route(String status, boolean reserved) {
    UUID id = UUID.randomUUID();
    db.run(
        "INSERT INTO route_plan(id,municipality_id,department_id,leader_id,created_by,name,status,start_latitude,start_longitude,return_to_start,optimized,distance,duration,geometry) VALUES(?,?,?,?,?,'Historical round',?,13,100,false,false,0,0,'{}')",
        id,
        town,
        department,
        actor,
        actor,
        status);
    if (reserved) {
      UUID issue = complaint("CLOSED");
      db.run(
          "INSERT INTO route_stop(plan_id,complaint_id,stop_order,complaint_version,title,address,latitude,longitude,reserved) VALUES(?,?,1,0,'Stop','Address',13,100,true)",
          id,
          issue);
    }
    return id;
  }

  void removal(int expectedStatus) throws Exception {
    mvc.perform(
            delete("/api/admin/departments/" + department)
                .with(user(adminName).roles("ADMIN"))
                .with(csrf()))
        .andExpect(status().is(expectedStatus));
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "staff",
        "disabledStaff",
        "activeCategory",
        "unfinishedComplaint",
        "pendingIncoming",
        "pendingOutgoing",
        "activeTeam",
        "govMapping",
        "draftRoute",
        "reservedRoute"
      })
  void currentDependencyBlocksRetirement(String dependency) throws Exception {
    switch (dependency) {
      case "staff" -> account("FIELD", true, false, town, department);
      case "disabledStaff" -> account("LEADER", false, false, town, department);
      case "activeCategory" -> db.run("UPDATE category SET active=true WHERE id=?", category);
      case "unfinishedComplaint" -> complaint("RESOLVED");
      case "pendingIncoming", "pendingOutgoing" ->
          db.run(
              "INSERT INTO department_transfer(id,complaint_id,municipality_id,source_department_id,target_department_id,requested_by,reason,state) VALUES(?,?,?,?,?,?,'Pending transfer','PENDING')",
              UUID.randomUUID(),
              complaint("CLOSED"),
              town,
              dependency.equals("pendingIncoming") ? otherDepartment : department,
              dependency.equals("pendingIncoming") ? department : otherDepartment,
              actor);
      case "activeTeam" -> team(true);
      case "govMapping" -> {
        db.run("INSERT INTO gov_role_settings(municipality_id) VALUES(?)", town);
        db.run(
            "INSERT INTO gov_role_mapping(municipality_id,gov_role,local_role,department_id) VALUES(?,'FIELD','FIELD',?)",
            town,
            department);
      }
      case "draftRoute" -> route("DRAFT", false);
      case "reservedRoute" -> route("CANCELLED", true);
      default -> fail("Unknown fixture");
    }
    removal(409);
    assertNull(
        db.one("SELECT deleted_at FROM department WHERE id=?", department).get("deleted_at"));
    assertTrue(
        db.list(
                "SELECT id FROM audit_event WHERE municipality_id=? AND action='DEPARTMENT_DELETE'",
                town)
            .isEmpty());
  }

  @ParameterizedTest
  @ValueSource(strings = {"CLOSED", "REJECTED", "TERMINATED"})
  void removalPreservesHistoricalReferencesAndOmitsDepartmentFromCatalogs(String terminalStatus)
      throws Exception {
    UUID issue = complaint(terminalStatus),
        historicalTeam = team(false),
        historicalRoute = route("DISPATCHED", false);
    UUID transfer = UUID.randomUUID();
    db.run(
        "INSERT INTO department_transfer(id,complaint_id,municipality_id,source_department_id,target_department_id,requested_by,reason,state) VALUES(?,?,?,?,?,?,'Historical transfer','RETURNED')",
        transfer,
        issue,
        town,
        otherDepartment,
        department,
        actor);
    removal(204);
    var retired = db.one("SELECT * FROM department WHERE id=?", department);
    assertNotNull(retired.get("deleted_at"));
    assertEquals("Engineering", retired.get("name"));
    assertEquals(
        department,
        db.one("SELECT department_id FROM complaint WHERE id=?", issue).get("department_id"));
    assertEquals(
        department,
        db.one("SELECT department_id FROM category WHERE id=?", category).get("department_id"));
    assertEquals(
        department,
        db.one("SELECT department_id FROM field_team WHERE id=?", historicalTeam)
            .get("department_id"));
    assertEquals(
        department,
        db.one("SELECT department_id FROM route_plan WHERE id=?", historicalRoute)
            .get("department_id"));
    assertEquals(
        department,
        db.one("SELECT target_department_id FROM department_transfer WHERE id=?", transfer)
            .get("target_department_id"));
    for (String path : List.of("/api/admin", "/api/catalog"))
      mvc.perform(get(path).with(user(adminName).roles("ADMIN")))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.departments.length()").value(1))
          .andExpect(jsonPath("$.departments[0].id").value(otherDepartment.toString()));
    removal(204);
    assertEquals(
        1,
        db.list(
                "SELECT id FROM audit_event WHERE municipality_id=? AND action='DEPARTMENT_DELETE'",
                town)
            .size());
  }

  @Test
  void renameIsScopedAndKeepsHistoricalComplaintReference() throws Exception {
    UUID issue = complaint("CLOSED");
    mvc.perform(
            post("/api/admin/departments/" + department)
                .with(user(adminName).roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"  Public works  \"}"))
        .andExpect(status().isOk());
    assertEquals(
        "Public works", db.one("SELECT name FROM department WHERE id=?", department).get("name"));
    assertEquals(
        department,
        db.one("SELECT department_id FROM complaint WHERE id=?", issue).get("department_id"));
    assertEquals(
        1,
        db.list(
                "SELECT id FROM audit_event WHERE municipality_id=? AND action='DEPARTMENT_RENAME'",
                town)
            .size());
  }

  @ParameterizedTest
  @ValueSource(strings = {"ADMIN", "DISABLED", "DELETED", "OTHER_TOWN", "MISSING"})
  void batchWithInvalidLaterAccountChangesNoAccountsOrAuditRows(String invalid) throws Exception {
    UUID first = account("CITIZEN", true, false, town, null), second;
    if (invalid.equals("OTHER_TOWN")) {
      UUID otherTown = UUID.randomUUID();
      db.run("INSERT INTO municipality(id,name) VALUES(?,'Other town')", otherTown);
      second = account("CITIZEN", true, false, otherTown, null);
    } else if (invalid.equals("MISSING")) second = UUID.randomUUID();
    else
      second =
          account(
              invalid.equals("ADMIN") ? "ADMIN" : "CITIZEN",
              !List.of("DISABLED", "DELETED").contains(invalid),
              invalid.equals("DELETED"),
              town,
              null);
    mvc.perform(
            post("/api/admin/departments/" + department + "/field-users")
                .with(user(adminName).roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("userIds", List.of(first, second)))))
        .andExpect(status().is4xxClientError());
    var unchanged = db.one("SELECT role,department_id FROM app_user WHERE id=?", first);
    assertEquals("CITIZEN", unchanged.get("role"));
    assertNull(unchanged.get("department_id"));
    assertTrue(
        db.list("SELECT id FROM audit_event WHERE municipality_id=? AND action='USER_ROLE'", town)
            .isEmpty());
  }

  @Test
  void departmentManagementCannotReachAnotherMunicipality() throws Exception {
    UUID otherTown = UUID.randomUUID(), foreignDepartment = UUID.randomUUID();
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Foreign municipality')", otherTown);
    db.run(
        "INSERT INTO department(id,municipality_id,name) VALUES(?,?,'Foreign department')",
        foreignDepartment,
        otherTown);
    String path = "/api/admin/departments/" + foreignDepartment;
    mvc.perform(
            post(path)
                .with(user(adminName).roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Changed\"}"))
        .andExpect(status().isNotFound());
    mvc.perform(delete(path).with(user(adminName).roles("ADMIN")).with(csrf()))
        .andExpect(status().isNotFound());
    mvc.perform(
            post(path + "/field-users")
                .with(user(adminName).roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("userIds", List.of(actor)))))
        .andExpect(status().isNotFound());
    var untouched = db.one("SELECT name,deleted_at FROM department WHERE id=?", foreignDepartment);
    assertEquals("Foreign department", untouched.get("name"));
    assertNull(untouched.get("deleted_at"));
  }

  @Test
  void retiredDepartmentCannotReceiveNewAccountsCategoriesOrRoles() throws Exception {
    UUID candidate = account("CITIZEN", true, false, town, null);
    removal(204);
    var requests = new LinkedHashMap<String, Map<String, Object>>();
    requests.put("/api/admin/departments/" + department, Map.of("name", "Reused"));
    requests.put(
        "/api/admin/departments/" + department + "/field-users",
        Map.of("userIds", List.of(candidate)));
    requests.put(
        "/api/admin/users/" + candidate + "/role",
        Map.of("role", "FIELD", "departmentId", department));
    requests.put(
        "/api/admin/users",
        Map.of(
            "username",
            "retired-new-user",
            "password",
            "Local-test-password-123",
            "displayName",
            "New account",
            "role",
            "FIELD",
            "departmentId",
            department));
    requests.put(
        "/api/admin/categories",
        Map.of(
            "name",
            "New category",
            "departmentId",
            department,
            "workflowId",
            definition,
            "slaHours",
            24));
    requests.put(
        "/api/admin/gov-roles",
        Map.of(
            "municipalityId",
            "town",
            "serviceId",
            "service",
            "mappings",
            List.of(Map.of("govRole", "FIELD", "role", "FIELD", "departmentId", department))));
    requests.put("/api/auth/admin-role", Map.of("role", "FIELD", "departmentId", department));
    for (var request : requests.entrySet())
      mvc.perform(
              post(request.getKey())
                  .with(user(adminName).roles("ADMIN"))
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(json.writeValueAsString(request.getValue())))
          .andExpect(status().isNotFound());
    mvc.perform(
            get("/api/people")
                .param("role", "FIELD")
                .param("departmentId", department.toString())
                .with(user(adminName).roles("ADMIN")))
        .andExpect(status().isNotFound());
    var stillCitizen = db.one("SELECT role,department_id FROM app_user WHERE id=?", candidate);
    assertEquals("CITIZEN", stillCitizen.get("role"));
    assertNull(stillCitizen.get("department_id"));
  }

  @Test
  void complaintCreationRejectsCategoryWhoseDepartmentHasRetired() throws Exception {
    UUID citizen = account("CITIZEN", true, false, town, null);
    db.run("UPDATE category SET active=true WHERE id=?", category);
    db.run("UPDATE department SET deleted_at=now() WHERE id=?", department);
    mvc.perform(
            multipart("/api/complaints")
                .file(
                    new org.springframework.mock.web.MockMultipartFile(
                        "complaint",
                        "complaint.json",
                        "application/json",
                        json.writeValueAsBytes(
                            Map.of(
                                "categoryId",
                                category,
                                "title",
                                "Stale routing",
                                "description",
                                "Test complaint",
                                "address",
                                "Test address"))))
                .file(
                    new org.springframework.mock.web.MockMultipartFile(
                        "files",
                        "evidence.pdf",
                        "application/pdf",
                        "%PDF-1.4 test evidence".getBytes(java.nio.charset.StandardCharsets.UTF_8)))
                .with(user("department-user-" + citizen).roles("CITIZEN"))
                .with(csrf()))
        .andExpect(status().isNotFound());
    assertTrue(db.list("SELECT id FROM complaint WHERE municipality_id=?", town).isEmpty());
    assertTrue(
        db.list("SELECT id FROM audit_event WHERE municipality_id=? AND action='CREATE'", town)
            .isEmpty());
  }

  @Test
  void batchAssignsEverySelectedAccountAndAuditsEachChange() throws Exception {
    UUID first = account("CITIZEN", true, false, town, null),
        second = account("LEADER", true, false, town, otherDepartment);
    mvc.perform(
            post("/api/admin/departments/" + department + "/field-users")
                .with(user(adminName).roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("userIds", List.of(first, second)))))
        .andExpect(status().isOk());
    for (UUID id : List.of(first, second)) {
      var assigned = db.one("SELECT role,department_id FROM app_user WHERE id=?", id);
      assertEquals("FIELD", assigned.get("role"));
      assertEquals(department, assigned.get("department_id"));
    }
    assertEquals(
        2,
        db.list("SELECT id FROM audit_event WHERE municipality_id=? AND action='USER_ROLE'", town)
            .size());
  }
}
