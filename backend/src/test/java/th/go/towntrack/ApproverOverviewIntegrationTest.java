package th.go.towntrack;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ApproverOverviewIntegrationTest {
  @Autowired org.springframework.test.web.servlet.MockMvc mvc;
  @Autowired Db db;
  @Autowired Workflow workflow;
  @Autowired ObjectMapper json;
  UUID town, category, workflowId, reporter, approver, otherApprover;
  Map<String, UUID> cases = new LinkedHashMap<>();

  @BeforeEach
  void fixture() {
    town = UUID.randomUUID();
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Overview town')", town);
    workflowId = workflow.createDefault(town, 1);
    category = UUID.randomUUID();
    db.run(
        "INSERT INTO category(id,municipality_id,workflow_id,name,sla_hours)"
            + " VALUES(?,?,?,'Road',72)",
        category,
        town,
        workflowId);
    for (var role : List.of("CITIZEN", "OFFICER", "LEADER", "FIELD", "APPROVER", "ADMIN")) {
      UUID id = UUID.randomUUID();
      db.run(
          "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role)"
              + " VALUES(?,?,?,'x','Overview user',?)",
          id,
          town,
          "overview" + role,
          role);
      if (role.equals("CITIZEN")) reporter = id;
      if (role.equals("APPROVER")) approver = id;
    }
    otherApprover = UUID.randomUUID();
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role)"
            + " VALUES(?,?,'overviewOther','x','Other','APPROVER')",
        otherApprover,
        town);
    for (var entry :
        Map.of(
                "assigned",
                "RESOURCE_APPROVAL",
                "other",
                "RESOURCE_APPROVAL",
                "unassigned",
                "RESOURCE_DRAFT",
                "unrouted",
                "NEW",
                "closed",
                "CLOSED",
                "rejected",
                "REJECTED",
                "terminated",
                "TERMINATED")
            .entrySet()) {
      UUID id = UUID.randomUUID();
      cases.put(entry.getKey(), id);
      db.run(
          "INSERT INTO"
              + " complaint(id,municipality_id,category_id,reporter_id,workflow_id,title,description,address,status,due_at,contact_name,contact_phone,contact_email)"
              + " VALUES(?,?,?,?,?,?,'Private description','Original address',?,now()-interval '1"
              + " day','Private name','0999999999','private@example.invalid')",
          id,
          town,
          category,
          reporter,
          workflowId,
          entry.getKey(),
          entry.getValue());
    }
    for (var name : List.of("assigned", "other", "unassigned"))
      db.run(
          "INSERT INTO resource_request(id,complaint_id,requested_by,approver_id,status)"
              + " VALUES(?,?,?,?,'PENDING')",
          UUID.randomUUID(),
          cases.get(name),
          reporter,
          name.equals("assigned") ? approver : name.equals("other") ? otherApprover : null);
  }

  JsonNode list(String query) throws Exception {
    return json.readTree(
        mvc.perform(get("/api/complaints" + query).with(user("overviewAPPROVER")))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString());
  }

  @Test
  void overviewIncludesEveryMunicipalStatusWithoutPrivateDetailFieldsOrForeignCases()
      throws Exception {
    UUID foreign = UUID.randomUUID(), foreignCategory = UUID.randomUUID();
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Foreign')", foreign);
    UUID foreignWorkflow = workflow.createDefault(foreign, 1);
    db.run(
        "INSERT INTO category(id,municipality_id,workflow_id,name,sla_hours) VALUES(?,?,?,'Foreign"
            + " category',72)",
        foreignCategory,
        foreign,
        foreignWorkflow);
    db.run(
        "INSERT INTO"
            + " complaint(id,municipality_id,category_id,reporter_id,workflow_id,title,description,address,due_at)"
            + " VALUES(?,?,?,?,?,'Foreign case','Secret','Secret',now())",
        UUID.randomUUID(),
        foreign,
        foreignCategory,
        reporter,
        foreignWorkflow);
    var result = list("?overview=true");
    assertEquals(7, result.path("total").asInt());
    assertEquals(0, result.path("page").asInt());
    assertEquals(10, result.path("size").asInt());
    assertEquals(7, result.path("stats").path("total").asInt());
    assertEquals(4, result.path("stats").path("in_progress").asInt());
    assertEquals(1, result.path("stats").path("closed").asInt());
    assertEquals(4, result.path("stats").path("overdue").asInt());
    Set<String> ids = new HashSet<>();
    for (var item : result.path("items")) {
      ids.add(item.path("id").asText());
      Set<String> fields = new HashSet<>();
      item.fieldNames().forEachRemaining(fields::add);
      assertEquals(
          Set.of(
              "id",
              "title",
              "address",
              "status",
              "created_at",
              "due_at",
              "version",
              "category_name",
              "votes",
              "can_open"),
          fields);
    }
    assertEquals(new HashSet<>(cases.values().stream().map(UUID::toString).toList()), ids);
  }

  @Test
  void overviewOpeningRequiresCurrentAccountRecipientAndExcludesHandedOffRequests()
      throws Exception {
    db.run(
        "UPDATE resource_request SET approver_id=?,handed_off=true WHERE complaint_id=?",
        approver,
        cases.get("unassigned"));
    var result = list("?overview=true");
    assertEquals(7, result.path("total").asInt());
    for (var item : result.path("items")) {
      assertTrue(item.path("can_open").isBoolean(), "Overview needs explicit opening eligibility");
      assertEquals(
          cases.get("assigned").toString().equals(item.path("id").asText()),
          item.path("can_open").asBoolean(),
          item.path("title").asText());
    }
    mvc.perform(get("/api/complaints/" + cases.get("unassigned")).with(user("overviewAPPROVER")))
        .andExpect(status().isForbidden());
    var other =
        json.readTree(
            mvc.perform(get("/api/complaints?overview=true").with(user("overviewOther")))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
    for (var item : other.path("items"))
      assertEquals(
          cases.get("other").toString().equals(item.path("id").asText()),
          item.path("can_open").asBoolean(),
          item.path("title").asText());
  }

  @Test
  void filtersAndPaginationKeepUnfilteredGlobalStatsAndUseBoundValues() throws Exception {
    assertEquals(4, list("?overview=true&activeOnly=true").path("total").asInt());
    assertEquals(3, list("?overview=true&completedOnly=true").path("total").asInt());
    var result =
        list(
            "?overview=true&completedOnly=true&status=CLOSED&categoryId="
                + category
                + "&area=Original&q=closed&sort=oldest&size=1");
    assertEquals(1, result.path("total").asInt());
    assertEquals("closed", result.path("items").get(0).path("title").asText());
    assertEquals(7, result.path("stats").path("total").asInt());
    assertEquals(3, list("?overview=true&page=1&size=4&sort=votes").path("items").size());
    assertEquals(0, list("?overview=true&q=%27%20OR%201%3D1--").path("total").asInt());
    assertEquals(0, list("?overview=true&area=%27%20OR%201%3D1--").path("total").asInt());
  }

  @Test
  void overviewIsForbiddenForEveryOtherEffectiveRole() throws Exception {
    for (var role : List.of("CITIZEN", "OFFICER", "LEADER", "FIELD", "ADMIN"))
      mvc.perform(get("/api/complaints?overview=true").with(user("overview" + role)))
          .andExpect(status().isForbidden());
    var session = new MockHttpSession();
    session.setAttribute("admin_role", "APPROVER");
    mvc.perform(get("/api/complaints?overview=true").session(session).with(user("overviewADMIN")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(7));
  }

  @Test
  void overviewRejectsHistoryAndQueueCombinations() throws Exception {
    for (var query :
        List.of("historyOnly=true", "queue=decisions", "historyOnly=true&activeOnly=true"))
      mvc.perform(get("/api/complaints?overview=true&" + query).with(user("overviewAPPROVER")))
          .andExpect(status().isBadRequest());
  }

  @Test
  void assignedEvidenceRemainsAvailableAfterOpeningOverview() throws Exception {
    list("?overview=true");
    byte[] evidence = "%PDF-1.4\nAssigned evidence\n%%EOF".getBytes();
    var uploaded =
        mvc.perform(
                multipart("/api/complaints/" + cases.get("assigned") + "/files")
                    .file(
                        new MockMultipartFile("file", "assigned.pdf", "application/pdf", evidence))
                    .with(user("overviewOFFICER"))
                    .with(csrf()))
            .andExpect(status().isOk())
            .andReturn();
    String fileId = json.readTree(uploaded.getResponse().getContentAsString()).path("id").asText();
    mvc.perform(get("/api/files/" + fileId).with(user("overviewAPPROVER")))
        .andExpect(status().isOk())
        .andExpect(content().bytes(evidence));
    assertEquals(0, list("?historyOnly=true").path("total").asInt());
  }

  @Test
  void summaryAccessCannotBroadenDefaultQueueDetailsFilesOrDecisions() throws Exception {
    assertEquals(7, list("?overview=true").path("total").asInt());
    for (var query :
        List.of("", "?overview=false", "?activeOnly=true", "?activeOnly=true&queue=decisions")) {
      var result = list(query);
      assertEquals(1, result.path("total").asInt());
      assertEquals(
          cases.get("assigned").toString(), result.path("items").get(0).path("id").asText());
    }
    mvc.perform(get("/api/complaints/" + cases.get("assigned")).with(user("overviewAPPROVER")))
        .andExpect(status().isOk());
    for (var name :
        List.of("other", "unassigned", "unrouted", "closed", "rejected", "terminated")) {
      UUID id = cases.get(name);
      mvc.perform(get("/api/complaints/" + id + "?overview=true").with(user("overviewAPPROVER")))
          .andExpect(status().isForbidden());
      var uploaded =
          mvc.perform(
                  multipart("/api/complaints/" + id + "/files")
                      .file(
                          new MockMultipartFile(
                              "file",
                              "evidence.pdf",
                              "application/pdf",
                              "%PDF-1.4\nEvidence\n%%EOF".getBytes()))
                      .with(user("overviewOFFICER"))
                      .with(csrf()))
              .andExpect(status().isOk())
              .andReturn();
      String fileId =
          json.readTree(uploaded.getResponse().getContentAsString()).path("id").asText();
      mvc.perform(get("/api/files/" + fileId + "?overview=true").with(user("overviewAPPROVER")))
          .andExpect(status().isForbidden());
      mvc.perform(
              post("/api/complaints/" + id + "/actions?overview=true")
                  .with(user("overviewAPPROVER"))
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"action\":\"APPROVE\",\"reason\":\"Unassigned\",\"version\":0}"))
          .andExpect(status().isForbidden());
    }
    assertEquals(
        0,
        ((Number)
                db.one("SELECT count(*) n FROM audit_event WHERE municipality_id=?", town).get("n"))
            .intValue());
    assertEquals(
        "RESOURCE_APPROVAL",
        db.one("SELECT status FROM complaint WHERE id=?", cases.get("other")).get("status"));
  }
}
