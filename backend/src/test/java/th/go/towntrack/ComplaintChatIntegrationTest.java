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
class ComplaintChatIntegrationTest {
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
        List.of("CITIZEN", "OFFICER", "LEADER", "FIELD", "FIELD_2", "APPROVER", "CITIZEN_2")) {
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

  ResultActions say(String role, UUID id, String text) throws Exception {
    return mvc.perform(
        post("/api/complaints/" + id + "/messages")
            .with(user(names.get(role)))
            .with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("body", text))));
  }

  ResultActions read(String role, UUID id) throws Exception {
    return mvc.perform(get("/api/complaints/" + id + "/messages").with(user(names.get(role))));
  }

  UUID assign(UUID id) {
    UUID work = UUID.randomUUID();
    db.run(
        "INSERT INTO work_order(id,complaint_id,assignee_id,assigned_by,due_at,status)"
            + " VALUES(?,?,?,?,now(),'ACCEPTED')",
        work,
        id,
        users.get("FIELD"),
        users.get("LEADER"));
    return work;
  }

  int notified(String role, String text) {
    return db.list(
            "SELECT id FROM notification WHERE user_id=? AND message LIKE ?",
            users.get(role),
            "%" + text + "%")
        .size();
  }

  @Test
  void staffAskAndTheReporterAnswersWithNotifications() throws Exception {
    UUID id = complaint("IN_PROGRESS");
    assign(id);
    for (String role : List.of("OFFICER", "LEADER", "FIELD"))
      say(role, id, "Where exactly? " + role).andExpect(status().isOk());
    assertEquals(3, notified("CITIZEN", "มีคำถามเพิ่มเติม"));
    say("CITIZEN", id, "  By the school  ").andExpect(status().isOk());
    for (String role : List.of("OFFICER", "LEADER", "FIELD"))
      assertEquals(1, notified(role, "ผู้แจ้งตอบกลับ"));
    assertEquals(0, notified("FIELD_2", "ผู้แจ้งตอบกลับ"));
    read("CITIZEN", id)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(4))
        .andExpect(jsonPath("$[0].sender_role").value("OFFICER"))
        .andExpect(jsonPath("$[0].sender_name").value("เจ้าหน้าที่รับเรื่อง"))
        .andExpect(jsonPath("$[0].mine").value(false))
        .andExpect(jsonPath("$[3].body").value("By the school"))
        .andExpect(jsonPath("$[3].mine").value(true));
    read("LEADER", id).andExpect(jsonPath("$[3].sender_name").value("Test CITIZEN"));
    say("OFFICER", id, "   ").andExpect(status().isBadRequest());
    say("OFFICER", id, "x".repeat(2001)).andExpect(status().isBadRequest());
    say("OFFICER", id, "x".repeat(2000)).andExpect(status().isOk());
  }

  @Test
  void otherPeopleCannotReadOrWriteEvenWhenFollowing() throws Exception {
    UUID id = complaint("IN_PROGRESS");
    db.run("INSERT INTO follower(complaint_id,user_id) VALUES(?,?)", id, users.get("CITIZEN_2"));
    UUID work = assign(id);
    for (String role : List.of("CITIZEN_2", "FIELD_2", "APPROVER")) {
      read(role, id).andExpect(status().isForbidden());
      say(role, id, "Hello").andExpect(status().isForbidden());
    }
    // An approver deciding on extra time may read, but takes no part in the conversation.
    db.run(
        "INSERT INTO sla_extension(id,complaint_id,requested_by,reason,days,previous_due_at,"
            + "requested_due_at) VALUES(?,?,?,'x',1,now(),now())",
        UUID.randomUUID(),
        id,
        users.get("LEADER"));
    read("APPROVER", id).andExpect(status().isOk());
    say("APPROVER", id, "Hello").andExpect(status().isForbidden());
    db.run("UPDATE work_order SET status='COMPLETE' WHERE id=?", work);
    say("FIELD", id, "Hello").andExpect(status().isForbidden());
  }

  @Test
  void finishedReportsKeepTheHistoryReadOnly() throws Exception {
    for (String status : List.of("CLOSED", "REJECTED", "TERMINATED")) {
      UUID id = complaint("NEW");
      say("OFFICER", id, "Question").andExpect(status().isOk());
      db.run("UPDATE complaint SET status=? WHERE id=?", status, id);
      say("CITIZEN", id, "Answer").andExpect(status().isConflict());
      say("OFFICER", id, "Again").andExpect(status().isConflict());
      read("CITIZEN", id).andExpect(jsonPath("$.length()").value(1));
    }
  }
}
