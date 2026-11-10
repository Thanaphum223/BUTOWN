package th.go.towntrack;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.http.*;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

class RetiredDepartmentGuardsTest {
  final UUID town = UUID.randomUUID(), department = UUID.randomUUID(), userId = UUID.randomUUID();
  final Map<String, Object> actor = Map.of("id", userId, "municipality_id", town, "role", "ADMIN");
  final Authentication auth =
      UsernamePasswordAuthenticationToken.authenticated("admin", null, List.of());
  final Db db = mock(Db.class);
  final Access access = mock(Access.class);
  final Workflow workflow = mock(Workflow.class);
  final ObjectMapper json = new ObjectMapper();
  AdminController admin;
  MockMvc mvc;

  @BeforeEach
  void setup() {
    when(access.user(auth)).thenReturn(actor);
    when(db.one(anyString(), any(Object[].class)))
        .thenAnswer(
            call -> {
              String sql = call.getArgument(0);
              if (sql.contains("FROM department") && sql.contains("deleted_at IS NULL"))
                throw new ResponseStatusException(HttpStatus.NOT_FOUND);
              if (sql.contains("FROM app_user"))
                return Map.of(
                    "id",
                    userId,
                    "role",
                    "ADMIN",
                    "municipality_id",
                    town,
                    "username",
                    "admin",
                    "department_id",
                    department);
              return Map.of("id", department, "name", "Retired department");
            });
    when(db.list(anyString(), any(Object[].class)))
        .thenAnswer(
            call -> {
              String sql = call.getArgument(0);
              if (sql.contains("FROM department") && !sql.contains("deleted_at IS NULL"))
                return List.of(Map.of("id", department, "name", "Retired department"));
              return List.of();
            });
    admin =
        new AdminController(
            db,
            access,
            workflow,
            mock(PasswordEncoder.class),
            json,
            mock(ExternalLoginSessions.class));
    var complaints = new ComplaintController(db, access, workflow, json, null);
    complaints.queues = mock(RoleQueues.class);
    when(complaints.queues.options(anyString())).thenReturn(List.of());
    mvc =
        MockMvcBuilders.standaloneSetup(admin, complaints)
            .setControllerAdvice(new Errors())
            .build();
  }

  @Test
  void adminCatalogOmitsRetiredDepartments() throws Exception {
    mvc.perform(get("/api/admin").principal(auth))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.departments").isEmpty());
  }

  @Test
  void complaintCatalogOmitsRetiredDepartments() throws Exception {
    mvc.perform(get("/api/catalog").principal(auth))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.departments").isEmpty());
  }

  @Test
  void roleAssignmentRejectsRetiredDepartment() throws Exception {
    mvc.perform(
            post("/api/admin/users/" + UUID.randomUUID() + "/role")
                .principal(auth)
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsString(Map.of("role", "FIELD", "departmentId", department))))
        .andExpect(status().isNotFound());
  }

  @Test
  void accountCreationRejectsRetiredDepartment() throws Exception {
    mvc.perform(
            post("/api/admin/users")
                .principal(auth)
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsString(
                        Map.of(
                            "role",
                            "FIELD",
                            "departmentId",
                            department,
                            "username",
                            "new-user",
                            "password",
                            "test-password-123",
                            "displayName",
                            "Test"))))
        .andExpect(status().isNotFound());
  }

  @Test
  void categoryEditsRejectRetiredDepartment() throws Exception {
    mvc.perform(
            post("/api/admin/categories")
                .principal(auth)
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsString(
                        Map.of(
                            "departmentId",
                            department,
                            "workflowId",
                            UUID.randomUUID(),
                            "name",
                            "Category",
                            "slaHours",
                            24))))
        .andExpect(status().isNotFound());
  }

  @Test
  void peopleCatalogRejectsRetiredDepartment() throws Exception {
    mvc.perform(
            get("/api/people")
                .param("role", "FIELD")
                .param("departmentId", department.toString())
                .principal(auth))
        .andExpect(status().isNotFound());
  }

  @Test
  void transferTargetsRejectRetiredDepartment() {
    var transfers = new DepartmentTransfers(db, access);
    assertThrows(ResponseStatusException.class, () -> transfers.department(department, actor));
  }

  @Test
  void govMappingSaveRejectsRetiredDepartment() {
    var mappings = new GovRoleMapping(db, admin, null, workflow);
    assertThrows(
        ResponseStatusException.class,
        () ->
            mappings.save(
                new GovRoleMapping.Settings(
                    "town",
                    "service",
                    List.of(new GovRoleMapping.Mapping("FIELD", "FIELD", department))),
                auth));
  }

  @Test
  void govInitialRoleRejectsRetiredDepartment() {
    var mappings =
        new GovRoleMapping(db, admin, null, workflow) {
          @Override
          Settings settings(UUID ignored) {
            return new Settings(
                "town", "service", List.of(new Mapping("FIELD", "FIELD", department)));
          }

          @Override
          boolean thisService(com.fasterxml.jackson.databind.JsonNode ignored, Settings config) {
            return true;
          }
        };
    var verifiedUser =
        json.valueToTree(
            Map.of(
                "memberships",
                List.of(
                    Map.of(
                        "isActive",
                        true,
                        "municipalityId",
                        "town",
                        "serviceAccess",
                        List.of(Map.of("roleCode", "FIELD"))))));
    assertThrows(ResponseStatusException.class, () -> mappings.initial(town, verifiedUser));
  }

  @Test
  void administratorCannotSwitchIntoRetiredDepartment() {
    var controller = new AuthController(db, access, null);
    assertThrows(
        ResponseStatusException.class,
        () ->
            controller.adminRole(
                new AuthController.AdminRole("FIELD", department),
                auth,
                new MockHttpServletRequest()));
  }

  @Test
  void workAssignmentRejectsRetiredDepartment() {
    var realAccess = new Access(db);
    assertThrows(
        ResponseStatusException.class, () -> realAccess.target(userId, actor, "FIELD", department));
  }
}
