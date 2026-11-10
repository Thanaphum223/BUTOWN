package th.go.towntrack;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.session.SessionRegistryImpl;
import org.springframework.security.core.userdetails.User;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

class AdminDepartmentManagementTest {
  final UUID town = UUID.randomUUID(), department = UUID.randomUUID(), actorId = UUID.randomUUID();
  final Authentication auth =
      UsernamePasswordAuthenticationToken.authenticated("admin", null, List.of());
  final Map<String, Object> actor = Map.of("id", actorId, "municipality_id", town, "role", "ADMIN");
  final Db db = mock(Db.class);
  final Access access = mock(Access.class);
  final Workflow workflow = mock(Workflow.class);
  final ObjectMapper json = new ObjectMapper();
  final SessionRegistryImpl registry = new SessionRegistryImpl();
  final Map<UUID, Map<String, Object>> users = new HashMap<>();
  final Map<UUID, Map<String, Object>> changed = new HashMap<>();
  final Map<String, Object> storedDepartment = new HashMap<>();
  MockMvc mvc;
  AdminController controller;

  @BeforeEach
  void setup() {
    storedDepartment.put("id", department);
    storedDepartment.put("name", "Engineering");
    when(access.user(auth)).thenReturn(actor);
    when(db.one(anyString(), any(Object[].class)))
        .thenAnswer(
            call -> {
              String sql = call.getArgument(0);
              Object[] args =
                  Arrays.copyOfRange(call.getArguments(), 1, call.getArguments().length);
              if (sql.contains("FROM municipality")) return Map.of("id", town);
              if (sql.contains("FROM department")) {
                if (!department.equals(args[0])
                    || !town.equals(args[1])
                    || sql.contains("deleted_at IS NULL")
                        && storedDepartment.get("deleted_at") != null)
                  throw new ResponseStatusException(HttpStatus.NOT_FOUND);
                return new HashMap<>(storedDepartment);
              }
              if (sql.contains("FROM app_user")) {
                var target = users.get(args[0]);
                if (target == null
                    || !town.equals(target.get("municipality_id"))
                    || target.get("deleted_at") != null)
                  throw new ResponseStatusException(HttpStatus.NOT_FOUND);
                return new HashMap<>(target);
              }
              throw new AssertionError("Unexpected read: " + sql);
            });
    when(db.run(anyString(), any(Object[].class)))
        .thenAnswer(
            call -> {
              String sql = call.getArgument(0);
              if (sql.startsWith("UPDATE app_user")) {
                Object[] args =
                    Arrays.copyOfRange(call.getArguments(), 1, call.getArguments().length);
                UUID id = (UUID) args[args.length - 2];
                var row = new HashMap<>(users.get(id));
                row.put("role", args[0]);
                row.put("department_id", args[1]);
                changed.put(id, row);
              }
              if (sql.startsWith("UPDATE department SET name="))
                storedDepartment.put("name", call.getArgument(1));
              if (sql.startsWith("UPDATE department SET deleted_at="))
                storedDepartment.put("deleted_at", "retired");
              return 1;
            });
    controller =
        new AdminController(db, access, workflow, null, json, new ExternalLoginSessions(registry));
    mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new Errors()).build();
  }

  UUID account(String role, boolean enabled) {
    UUID id = UUID.randomUUID();
    users.put(
        id,
        new HashMap<>(
            Map.of(
                "id",
                id,
                "username",
                "user-" + id,
                "municipality_id",
                town,
                "role",
                role,
                "enabled",
                enabled,
                "department_id",
                UUID.randomUUID())));
    registry.registerNewSession(
        "session-" + id, User.withUsername("user-" + id).password("unused").roles(role).build());
    return id;
  }

  ResultActions batch(Object ids) throws Exception {
    return mvc.perform(
        post("/api/admin/departments/" + department + "/field-users")
            .principal(auth)
            .contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("userIds", ids))));
  }

  @Test
  void renameTrimsNameAndAuditsOldAndNewNames() throws Exception {
    mvc.perform(
            post("/api/admin/departments/" + department)
                .principal(auth)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"  Public works  \"}"))
        .andExpect(status().isOk());
    assertEquals("Public works", storedDepartment.get("name"));
    verify(workflow)
        .audit(
            eq(actor),
            isNull(),
            eq("DEPARTMENT_RENAME"),
            isNull(),
            isNull(),
            contains("Engineering -> Public works"));
  }

  @Test
  void renameCannotReachAnotherMunicipality() throws Exception {
    mvc.perform(
            post("/api/admin/departments/" + UUID.randomUUID())
                .principal(auth)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Other\"}"))
        .andExpect(status().isNotFound());
    assertEquals("Engineering", storedDepartment.get("name"));
    verifyNoInteractions(workflow);
  }

  @Test
  void renameValidatesNameBeforeWriting() throws Exception {
    mvc.perform(
            post("/api/admin/departments/" + department)
                .principal(auth)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"   \"}"))
        .andExpect(status().isBadRequest());
    assertEquals("Engineering", storedDepartment.get("name"));
  }

  @Test
  void removingUnusedDepartmentRetiresItAndKeepsItsName() throws Exception {
    mvc.perform(delete("/api/admin/departments/" + department).principal(auth))
        .andExpect(status().isNoContent());
    assertNotNull(storedDepartment.get("deleted_at"));
    assertEquals("Engineering", storedDepartment.get("name"));
    verify(workflow)
        .audit(
            eq(actor),
            isNull(),
            eq("DEPARTMENT_DELETE"),
            isNull(),
            isNull(),
            contains("Engineering"));
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "staff",
        "categories",
        "complaints",
        "transfers",
        "teams",
        "govMappings",
        "routes"
      })
  void dependencyPreventsRetirementWithoutChangingHistory(String dependency) throws Exception {
    when(db.list(anyString(), any(Object[].class)))
        .thenReturn(List.of(Map.of("dependency", dependency)));
    mvc.perform(delete("/api/admin/departments/" + department).principal(auth))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.message").isNotEmpty());
    assertNull(storedDepartment.get("deleted_at"));
    verifyNoInteractions(workflow);
  }

  @Test
  void removingRetiredDepartmentIsIdempotent() throws Exception {
    storedDepartment.put("deleted_at", "retired");
    mvc.perform(delete("/api/admin/departments/" + department).principal(auth))
        .andExpect(status().isNoContent());
    verifyNoInteractions(workflow);
  }

  @Test
  void batchAssignsEveryAccountAndExpiresItsSessions() throws Exception {
    UUID first = account("CITIZEN", true), second = account("FIELD", true);
    batch(List.of(first.toString(), second.toString())).andExpect(status().isOk());
    assertEquals(Set.of(first, second), changed.keySet());
    for (UUID id : List.of(first, second)) {
      assertEquals("FIELD", changed.get(id).get("role"));
      assertEquals(department, changed.get(id).get("department_id"));
      assertTrue(registry.getSessionInformation("session-" + id).isExpired());
    }
    verify(workflow, times(2))
        .audit(eq(actor), isNull(), eq("USER_ROLE"), isNull(), isNull(), contains("->FIELD"));
  }

  @ParameterizedTest
  @ValueSource(strings = {"ADMIN", "DISABLED", "DELETED", "OTHER_TOWN", "MISSING"})
  void invalidLaterAccountPreventsAllUpdatesAndSessionRevocations(String invalid) throws Exception {
    UUID first = account("CITIZEN", true),
        second = account(invalid.equals("ADMIN") ? "ADMIN" : "FIELD", !invalid.equals("DISABLED"));
    if (invalid.equals("DELETED")) users.get(second).put("deleted_at", "archived");
    if (invalid.equals("OTHER_TOWN")) users.get(second).put("municipality_id", UUID.randomUUID());
    if (invalid.equals("MISSING")) users.remove(second);
    batch(List.of(first.toString(), second.toString())).andExpect(status().is4xxClientError());
    assertTrue(changed.isEmpty());
    assertFalse(registry.getSessionInformation("session-" + first).isExpired());
    verifyNoInteractions(workflow);
  }

  @Test
  void batchRejectsEmptyDuplicateMalformedAndOversizedSelections() throws Exception {
    String id = account("FIELD", true).toString();
    for (Object ids :
        List.of(
            List.of(),
            List.of(id, id),
            List.of("not-a-uuid"),
            Collections.nCopies(101, id),
            "not-a-list")) batch(ids).andExpect(status().isBadRequest());
    assertTrue(changed.isEmpty());
  }

  @Test
  void retiredDepartmentCannotReceiveAssignmentsOrRenames() throws Exception {
    storedDepartment.put("deleted_at", "retired");
    batch(List.of(account("FIELD", true).toString())).andExpect(status().isNotFound());
    mvc.perform(
            post("/api/admin/departments/" + department)
                .principal(auth)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Retired\"}"))
        .andExpect(status().isNotFound());
    assertTrue(changed.isEmpty());
    assertEquals("Engineering", storedDepartment.get("name"));
  }

  @Test
  void nonAdministratorCannotMutateDepartments() throws Exception {
    doAnswer(
            call -> {
              Access.deny();
              return null;
            })
        .when(access)
        .role(actor, "ADMIN");
    batch(List.of(account("FIELD", true).toString())).andExpect(status().isForbidden());
    mvc.perform(delete("/api/admin/departments/" + department).principal(auth))
        .andExpect(status().isForbidden());
    assertTrue(changed.isEmpty());
  }
}
