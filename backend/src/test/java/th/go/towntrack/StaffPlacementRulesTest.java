package th.go.towntrack;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class StaffPlacementRulesTest {
  final UUID town = UUID.randomUUID(), department = UUID.randomUUID();
  final Db db = mock(Db.class);
  final Access access = new Access(db);
  final Workflow workflow = mock(Workflow.class);
  final StaffPlacementController placement = new StaffPlacementController(db, access, workflow);

  Map<String, Object> user(String role, String govRole, UUID department) {
    var user = new HashMap<String, Object>();
    user.put("role", role);
    user.put("gov_role", govRole);
    user.put("department_id", department);
    return user;
  }

  @Test
  void onlyHeadsTheMayorAndTheClerkMayPlaceStaff() {
    assertEquals("FIELD", placement.placeable(user("LEADER", null, department)));
    assertEquals("LEADER", placement.placeable(user("APPROVER", "MAYOR", null)));
    assertEquals("LEADER", placement.placeable(user("APPROVER", "MUNICIPAL_CLERK", null)));
    for (var denied :
        List.of(
            user("APPROVER", null, null),
            user("APPROVER", "DEPUTY_MAYOR", null),
            user("LEADER", "MAYOR", null),
            user("CITIZEN", "MAYOR", null),
            user("FIELD", "MAYOR", department),
            user("OFFICER", "MAYOR", null),
            user("ADMIN", "MAYOR", null)))
      assertThrows(ResponseStatusException.class, () -> placement.placeable(denied));
  }

  @Test
  void pendingStaffAreDeniedEveryRoleAndComplaint() {
    var auth =
        org.springframework.security.authentication.UsernamePasswordAuthenticationToken
            .authenticated("someone", null, List.of());
    for (String role : List.of("LEADER", "FIELD")) {
      when(db.one(anyString(), any(Object[].class))).thenReturn(user(role, null, null));
      var pending = access.user(auth);
      assertTrue(Access.pendingDepartment(pending));
      assertThrows(ResponseStatusException.class, () -> access.role(pending, role));
      assertThrows(
          ResponseStatusException.class, () -> access.complaint(UUID.randomUUID(), pending, false));
      when(db.one(anyString(), any(Object[].class))).thenReturn(user(role, null, department));
      var placed = access.user(auth);
      assertFalse(Access.pendingDepartment(placed));
      access.role(placed, role);
    }
    for (String role : List.of("CITIZEN", "OFFICER", "APPROVER", "ADMIN")) {
      when(db.one(anyString(), any(Object[].class))).thenReturn(user(role, null, null));
      assertFalse(Access.pendingDepartment(access.user(auth)));
    }
  }

  @Test
  void administratorsHearAboutArrivalsOnlyWhenNobodyCanPlaceThem() {
    UUID head = UUID.randomUUID(), admin = UUID.randomUUID(), arrival = UUID.randomUUID();
    when(db.list(contains("role='ADMIN'"), any(Object[].class)))
        .thenReturn(List.of(Map.of("id", admin)));
    when(db.list(contains("role='LEADER'"), any(Object[].class)))
        .thenReturn(List.of(Map.of("id", head)));
    placement.notifyWaiting(town, arrival, "FIELD", "Worker");
    verify(workflow).notifyUser(eq(head), isNull(), anyString());
    placement.notifyWaiting(town, arrival, "LEADER", "Head");
    verify(workflow).notifyUser(eq(admin), isNull(), anyString());
    verifyNoMoreInteractions(workflow);
  }

  @Test
  void serverMunicipalityReplacesTheStoredOneAndRejectsMalformedValues() {
    var mapping = new GovRoleMapping(db, null, null, workflow);
    when(db.list(contains("gov_role_settings"), any(Object[].class)))
        .thenReturn(List.of(Map.of("gov_municipality_id", "stored", "gov_service_id", "")));
    mapping.checkServerMunicipality();
    assertEquals("stored", mapping.settings(town).municipalityId());
    mapping.serverMunicipality = " server-town ";
    mapping.checkServerMunicipality();
    assertEquals("server-town", mapping.settings(town).municipalityId());
    mapping.serverMunicipality = "not valid";
    assertThrows(IllegalArgumentException.class, mapping::checkServerMunicipality);
  }

  @Test
  void aStaffRoleWithoutADepartmentIsGrantedButAnotherTownIsNot() {
    var mapping =
        new GovRoleMapping(db, null, null, workflow) {
          @Override
          boolean thisService(com.fasterxml.jackson.databind.JsonNode ignored, Settings config) {
            return true;
          }
        };
    mapping.serverMunicipality = "gov-town";
    for (var expected :
        Map.of("DEPT_HEAD", "LEADER", "FIELD_TECH", "FIELD", "HEALTH_FIELD", "FIELD").entrySet()) {
      var initial = mapping.initial(town, member(expected.getKey(), "gov-town"));
      assertEquals(expected.getValue(), initial.role());
      assertNull(initial.department());
    }
    assertEquals("CITIZEN", mapping.initial(town, member("MAYOR", "another-town")).role());
  }

  com.fasterxml.jackson.databind.JsonNode member(String code, String municipality) {
    return new ObjectMapper()
        .valueToTree(
            Map.of(
                "memberships",
                List.of(
                    Map.of(
                        "isActive",
                        true,
                        "municipalityId",
                        municipality,
                        "serviceAccess",
                        List.of(Map.of("roleCode", code))))));
  }
}
