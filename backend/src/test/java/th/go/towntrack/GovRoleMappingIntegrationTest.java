package th.go.towntrack;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class GovRoleMappingIntegrationTest {
  @DynamicPropertySource
  static void config(DynamicPropertyRegistry r) {
    r.add("E_SERVICE_CODE", () -> "towntrack-test");
  }

  @Autowired Db db;
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired GovIdentityService identities;
  UUID town, dept, admin;
  String adminName;

  @BeforeEach
  void setup() {
    town = UUID.randomUUID();
    dept = UUID.randomUUID();
    admin = UUID.randomUUID();
    adminName = "gov-role-admin-" + admin;
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Role mapping fixture')", town);
    db.run("INSERT INTO department(id,municipality_id,name) VALUES(?,?,'Engineering')", dept, town);
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role) VALUES(?,?,?,'unused','Mapping administrator','ADMIN')",
        admin,
        town,
        adminName);
  }

  Map<String, Object> rule(String code, String role, UUID department) {
    var result = new HashMap<String, Object>();
    result.put("govRole", code);
    result.put("role", role);
    result.put("departmentId", department);
    return result;
  }

  void configure(String serviceId, List<Map<String, Object>> mappings) throws Exception {
    mvc.perform(
            post("/api/admin/gov-roles")
                .with(user(adminName).roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsString(
                        Map.of(
                            "municipalityId",
                            "gov-town",
                            "serviceId",
                            serviceId,
                            "mappings",
                            mappings))))
        .andExpect(status().isOk());
    mvc.perform(get("/api/admin/gov-roles").with(user(adminName).roles("ADMIN")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.municipalityId").value("gov-town"))
        .andExpect(jsonPath("$.mappings.length()").value(mappings.size()));
  }

  JsonNode verified(
      String identity, String code, String service, String municipality, boolean active) {
    return json.valueToTree(
        Map.of(
            "user",
            Map.of(
                "id",
                identity,
                "name",
                "Gov role fixture",
                "systemRole",
                "SUPER_ADMIN",
                "role",
                "ADMIN",
                "memberships",
                List.of(
                    Map.of(
                        "municipalityId",
                        municipality,
                        "isActive",
                        active,
                        "role",
                        "OWNER",
                        "serviceAccess",
                        List.of(
                            Map.of(
                                "eService",
                                Map.of("code", service),
                                "role",
                                Map.of("code", code),
                                "isActive",
                                true)))))));
  }

  @ParameterizedTest
  @ValueSource(strings = {"CITIZEN", "OFFICER", "LEADER", "FIELD", "APPROVER", "ADMIN"})
  void newVerifiedServiceIdentityGetsItsMappedRoleAndDepartment(String role) throws Exception {
    UUID department = Access.departmentRole(role) ? dept : null;
    configure("", List.of(rule("CUSTOM_" + role, role, department)));
    var account =
        identities.sync(
            town,
            verified("new-" + role, "CUSTOM_" + role, "towntrack-test", "gov-town", true),
            null);
    assertEquals(role, account.get("role"));
    assertEquals(department, account.get("department_id"));
    mvc.perform(get("/api/auth/me").with(user(account.get("username").toString()).roles(role)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.role").value(role));
    var repeat =
        identities.sync(
            town,
            json.valueToTree(Map.of("user", Map.of("id", "new-" + role, "memberships", List.of()))),
            null);
    assertEquals(account.get("id"), repeat.get("id"));
    assertEquals(role, repeat.get("role"));
    assertEquals(department, repeat.get("department_id"));
  }

  @Test
  void signInKeepsAnAssignedPositionWhenGovSendsOnlyAGeneralRole() throws Exception {
    configure("", List.of(rule("APPROVER", "APPROVER", null), rule("MAYOR", "APPROVER", null)));
    var account =
        identities.sync(
            town, verified("kept", "APPROVER", "towntrack-test", "gov-town", true), null);
    db.run("UPDATE app_user SET gov_role='FINANCE_DIRECTOR' WHERE id=?", account.get("id"));
    identities.sync(town, verified("kept", "APPROVER", "towntrack-test", "gov-town", true), null);
    assertEquals(
        "FINANCE_DIRECTOR",
        db.one("SELECT gov_role FROM app_user WHERE id=?", account.get("id")).get("gov_role"));
    identities.sync(town, verified("kept", "MAYOR", "towntrack-test", "gov-town", true), null);
    assertEquals(
        "MAYOR",
        db.one("SELECT gov_role FROM app_user WHERE id=?", account.get("id")).get("gov_role"));
  }

  @Test
  void defaultsIncludeMunicipalPositions() throws Exception {
    mvc.perform(get("/api/admin/gov-roles").with(user(adminName).roles("ADMIN")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.mappings.length()").value(24))
        .andExpect(jsonPath("$.mappings[?(@.govRole=='MAYOR')].role").value("APPROVER"))
        .andExpect(jsonPath("$.mappings[?(@.govRole=='SARABAN_OFFICER')].role").value("OFFICER"))
        .andExpect(jsonPath("$.mappings[?(@.govRole=='IT_ADMIN')].role").value("ADMIN"));
  }

  @Test
  void defaultsDoNotTreatGlobalOrMunicipalAdminAsTownTrackAuthority() {
    var account =
        identities.sync(
            town,
            verified("no-service-role", "ADMIN", "unrelated-service", "gov-town", true),
            null);
    assertEquals("CITIZEN", account.get("role"));
    assertNull(account.get("department_id"));
  }

  @Test
  void inactiveAndForeignMunicipalityOrServiceRolesCannotGrantStaff() throws Exception {
    configure("", List.of(rule("REVIEWER", "OFFICER", null)));
    for (var data :
        List.of(
            verified("inactive", "REVIEWER", "towntrack-test", "gov-town", false),
            verified("wrong-town", "REVIEWER", "towntrack-test", "another-town", true),
            verified("wrong-service", "REVIEWER", "another-service", "gov-town", true)))
      assertEquals("CITIZEN", identities.sync(town, data, null).get("role"));
  }

  @Test
  void unknownStaffRoleFailsWithoutCreatingAccount() throws Exception {
    configure("", List.of(rule("LEADER", "LEADER", null)));
    var error =
        assertThrows(
            org.springframework.web.server.ResponseStatusException.class,
            () ->
                identities.sync(
                    town,
                    verified("unmapped", "UNMAPPED_REVIEWER", "towntrack-test", "gov-town", true),
                    null));
    assertEquals(503, error.getStatusCode().value());
    assertEquals(
        1L, db.one("SELECT count(*) n FROM app_user WHERE municipality_id=?", town).get("n"));
  }

  Map<String, Object> arrive(String role, String code) {
    return identities.sync(
        town, verified(code + role, code, "towntrack-test", "gov-town", true), null);
  }

  org.springframework.test.web.servlet.ResultActions place(
      Map<String, Object> actor, Object target, UUID department) throws Exception {
    return mvc.perform(
        post("/api/staff-placement/" + target)
            .with(user(actor.get("username").toString()))
            .with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("departmentId", department))));
  }

  long notices(Object account) {
    return (long)
        db.one(
                "SELECT count(*) n FROM notification WHERE user_id=? AND complaint_id IS NULL",
                account)
            .get("n");
  }

  @Test
  void staffWithoutADepartmentWaitUntilTheRightPersonPlacesThem() throws Exception {
    configure(
        "",
        List.of(
            rule("MAYOR", "APPROVER", null),
            rule("DEPUTY_MAYOR", "APPROVER", null),
            rule("DEPT_HEAD", "LEADER", null),
            rule("FIELD_TECH", "FIELD", null)));
    UUID other = UUID.randomUUID();
    db.run("INSERT INTO department(id,municipality_id,name) VALUES(?,?,'Health')", other, town);
    // Nobody can place a first head yet, so the administrator is told.
    var early = arrive("early", "DEPT_HEAD");
    assertEquals("LEADER", early.get("role"));
    assertNull(early.get("department_id"));
    assertEquals(1, notices(admin));
    var mayor = arrive("", "MAYOR");
    var deputy = arrive("", "DEPUTY_MAYOR");
    var head = arrive("", "DEPT_HEAD");
    assertEquals(1, notices(mayor.get("id")));
    assertEquals(1, notices(admin));
    arrive("", "DEPT_HEAD");
    assertEquals(1, notices(mayor.get("id")));

    var asHead = user(head.get("username").toString());
    mvc.perform(get("/api/auth/me").with(asHead))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.pending_department").value(true));
    mvc.perform(get("/api/notifications").with(asHead)).andExpect(status().isOk());
    mvc.perform(get("/api/complaints").with(asHead))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(0));
    for (String path : List.of("/api/people?role=FIELD", "/api/staff-placement", "/api/teams"))
      mvc.perform(get(path).with(asHead)).andExpect(status().isForbidden());

    place(deputy, head.get("id"), dept).andExpect(status().isForbidden());
    place(head, head.get("id"), dept).andExpect(status().isForbidden());
    place(mayor, deputy.get("id"), dept).andExpect(status().isForbidden());
    place(mayor, head.get("id"), UUID.randomUUID()).andExpect(status().isNotFound());
    place(mayor, head.get("id"), dept).andExpect(status().isOk());
    place(mayor, head.get("id"), other).andExpect(status().isConflict());
    assertEquals(1, notices(head.get("id")));
    assertEquals(
        1L,
        db.one(
                "SELECT count(*) n FROM audit_event WHERE actor_id=? AND action='USER_DEPARTMENT'",
                mayor.get("id"))
            .get("n"));
    mvc.perform(get("/api/auth/me").with(asHead))
        .andExpect(jsonPath("$.pending_department").doesNotExist())
        .andExpect(jsonPath("$.department_id").value(dept.toString()));

    var worker = arrive("", "FIELD_TECH");
    assertEquals(2, notices(head.get("id")));
    mvc.perform(get("/api/staff-placement").with(asHead))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.people.length()").value(1))
        .andExpect(jsonPath("$.departments.length()").value(1));
    place(mayor, worker.get("id"), dept).andExpect(status().isForbidden());
    place(head, worker.get("id"), other).andExpect(status().isForbidden());
    place(head, early.get("id"), dept).andExpect(status().isForbidden());
    place(head, worker.get("id"), dept).andExpect(status().isOk());
    assertEquals(
        "FIELD",
        db.one("SELECT role FROM app_user WHERE id=? AND department_id=?", worker.get("id"), dept)
            .get("role"));
  }

  @Test
  void placementCannotReachAnotherMunicipality() throws Exception {
    configure("", List.of(rule("MAYOR", "APPROVER", null)));
    var mayor = arrive("", "MAYOR");
    UUID foreignTown = UUID.randomUUID(), foreign = UUID.randomUUID();
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Elsewhere')", foreignTown);
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role)"
            + " VALUES(?,?,?,'unused','Elsewhere head','LEADER')",
        foreign,
        foreignTown,
        "foreign-" + foreign);
    place(mayor, foreign, dept).andExpect(status().isNotFound());
  }

  @Test
  void noConfiguredMunicipalityCannotImportStaffPermissions() {
    var error =
        assertThrows(
            org.springframework.web.server.ResponseStatusException.class,
            () ->
                identities.sync(
                    town, verified("unscoped", "ADMIN", "towntrack-test", "gov-town", true), null));
    assertEquals(503, error.getStatusCode().value());
    assertEquals(
        1L, db.one("SELECT count(*) n FROM app_user WHERE municipality_id=?", town).get("n"));
  }

  @Test
  void explicitServiceIdAndAliasCanBeChangedWithoutChangingExistingLocalOverride()
      throws Exception {
    configure("gov-service-id", List.of(rule("INSPECTOR_V2", "OFFICER", null)));
    var data = verified("mutable", "INSPECTOR_V2", "towntrack-test", "gov-town", true);
    var access =
        (com.fasterxml.jackson.databind.node.ObjectNode)
            data.path("user").path("memberships").get(0).path("serviceAccess").get(0);
    access.remove("eService");
    access.put("eServiceId", "gov-service-id");
    access.remove("role");
    access.put("roleCode", "INSPECTOR_V2");
    var original = identities.sync(town, data, null);
    assertEquals("OFFICER", original.get("role"));
    assertEquals(
        "INSPECTOR_V2",
        db.one("SELECT gov_role FROM app_user WHERE id=?", original.get("id")).get("gov_role"));
    mvc.perform(
            post("/api/admin/users/" + original.get("id") + "/role")
                .with(user(adminName).roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("role", "FIELD", "departmentId", dept))))
        .andExpect(status().isOk());
    configure("gov-service-id", List.of(rule("INSPECTOR_V2", "ADMIN", null)));
    var next = identities.sync(town, data, null);
    assertEquals(original.get("id"), next.get("id"));
    assertEquals("FIELD", next.get("role"));
    assertEquals(dept, next.get("department_id"));
    mvc.perform(
            delete("/api/admin/users/" + next.get("id"))
                .with(user(adminName).roles("ADMIN"))
                .with(csrf()))
        .andExpect(status().isNoContent());
    var fresh = identities.sync(town, data, null);
    assertNotEquals(next.get("id"), fresh.get("id"));
    assertEquals("ADMIN", fresh.get("role"));
    assertNull(fresh.get("department_id"));
  }

  @Test
  void conflictingServiceRoleCodesAreRejectedInsteadOfSelectingHigherPrivilege() throws Exception {
    configure("", List.of(rule("OFFICER", "OFFICER", null), rule("ADMIN", "ADMIN", null)));
    var data = verified("conflict", "OFFICER", "towntrack-test", "gov-town", true);
    ((com.fasterxml.jackson.databind.node.ArrayNode)
            data.path("user").path("memberships").get(0).path("serviceAccess"))
        .add(json.valueToTree(Map.of("serviceCode", "towntrack-test", "roleCode", "ADMIN")));
    assertThrows(
        org.springframework.web.server.ResponseStatusException.class,
        () -> identities.sync(town, data, null));
    assertEquals(
        1L, db.one("SELECT count(*) n FROM app_user WHERE municipality_id=?", town).get("n"));
  }

  @Test
  void settingsRequireAdminCsrfValidRoleAndSameTownDepartment() throws Exception {
    var body =
        Map.of(
            "municipalityId",
            "gov-town",
            "serviceId",
            "",
            "mappings",
            List.of(rule("STAFF", "FIELD", UUID.randomUUID())));
    String text = json.writeValueAsString(body);
    mvc.perform(get("/api/admin/gov-roles").with(user(adminName).roles("ADMIN")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.mappings").isArray());
    mvc.perform(
            post("/api/admin/gov-roles")
                .with(user(adminName).roles("ADMIN"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(text))
        .andExpect(status().isForbidden());
    String citizen = "map-citizen-" + UUID.randomUUID();
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role) VALUES(?,?,?,'unused','Citizen','CITIZEN')",
        UUID.randomUUID(),
        town,
        citizen);
    mvc.perform(get("/api/admin/gov-roles").with(user(citizen).roles("CITIZEN")))
        .andExpect(status().isForbidden());
    mvc.perform(
            post("/api/admin/gov-roles")
                .with(user(citizen).roles("CITIZEN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(text))
        .andExpect(status().isForbidden());
    mvc.perform(
            post("/api/admin/gov-roles")
                .with(user(adminName).roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(text))
        .andExpect(status().isNotFound());
    for (var mappings :
        List.of(
            List.of(rule("STAFF", "SUPER_ADMIN", null)),
            List.of(rule("STAFF", null, null)),
            List.of(rule("same", "OFFICER", null), rule("SAME", "ADMIN", null)))) {
      mvc.perform(
              post("/api/admin/gov-roles")
                  .with(user(adminName).roles("ADMIN"))
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(
                      json.writeValueAsString(
                          Map.of(
                              "municipalityId",
                              "gov-town",
                              "serviceId",
                              "",
                              "mappings",
                              mappings))))
          .andExpect(status().isBadRequest());
    }
  }

  @Test
  void recognizableStaffWithoutMunicipalityScopeCannotBecomePermanentCitizen() throws Exception {
    configure("", List.of(rule("REVIEWER", "OFFICER", null)));
    var data = verified("missing-town", "REVIEWER", "towntrack-test", "gov-town", true);
    var membership =
        (com.fasterxml.jackson.databind.node.ObjectNode)
            data.path("user").path("memberships").get(0);
    membership.remove("municipalityId");
    var error =
        assertThrows(
            org.springframework.web.server.ResponseStatusException.class,
            () -> identities.sync(town, data, null));
    assertEquals(503, error.getStatusCode().value());
    assertEquals(
        1L, db.one("SELECT count(*) n FROM app_user WHERE municipality_id=?", town).get("n"));
  }
}
