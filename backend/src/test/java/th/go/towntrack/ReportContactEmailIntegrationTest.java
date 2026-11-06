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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ReportContactEmailIntegrationTest {
  @Autowired org.springframework.test.web.servlet.MockMvc mvc;
  @Autowired Db db;
  @Autowired Workflow workflow;
  @Autowired ObjectMapper json;
  UUID town, reporter, other, category;
  String reporterName, officerName, otherName;

  @BeforeEach
  void setup() {
    town = UUID.randomUUID();
    UUID dept = UUID.randomUUID();
    category = UUID.randomUUID();
    db.run("INSERT INTO municipality(id,name) VALUES(?,'Email test town')", town);
    db.run("INSERT INTO department(id,municipality_id,name) VALUES(?,?,'Engineering')", dept, town);
    UUID wf = workflow.createDefault(town, 1);
    db.run(
        "INSERT INTO category(id,municipality_id,department_id,workflow_id,name,sla_hours) VALUES(?,?,?,?,'Road',72)",
        category,
        town,
        dept,
        wf);
    reporter = account("CITIZEN");
    other = account("CITIZEN");
    UUID officer = account("OFFICER");
    reporterName = "email_" + reporter;
    otherName = "email_" + other;
    officerName = "email_" + officer;
    profile(reporter, "reporter@example.test");
    profile(other, "other@example.test");
  }

  UUID account(String role) {
    UUID id = UUID.randomUUID();
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role) VALUES(?,?,?,'x','Test account',?)",
        id,
        town,
        "email_" + id,
        role);
    return id;
  }

  void profile(UUID id, String email) {
    db.run(
        "INSERT INTO iam_user_profile(municipality_id,iam_user_id,local_user_id,email) VALUES(?,?,?,?)",
        town,
        "gov_" + id,
        id,
        email);
  }

  UUID submit() throws Exception {
    var body =
        Map.of(
            "categoryId",
            category,
            "title",
            "Test report",
            "description",
            "Report details",
            "address",
            "Test street",
            "latitude",
            13.75,
            "longitude",
            100.5,
            "contactEmail",
            "spoofed@example.test");
    byte[] png =
        Base64.getDecoder()
            .decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=");
    var response =
        mvc.perform(
                multipart("/api/complaints")
                    .file(
                        new MockMultipartFile(
                            "complaint",
                            "complaint.json",
                            "application/json",
                            json.writeValueAsBytes(body)))
                    .file(new MockMultipartFile("files", "proof.png", "image/png", png))
                    .with(user(reporterName))
                    .with(csrf()))
            .andExpect(status().isOk())
            .andReturn();
    return UUID.fromString(
        json.readTree(response.getResponse().getContentAsByteArray()).get("id").asText());
  }

  @Test
  void snapshotsOnlyTheAuthenticatedGovEmailAndKeepsItPrivate() throws Exception {
    UUID id = submit();
    mvc.perform(get("/api/complaints/" + id).with(user(officerName)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.complaint.contact_email").value("reporter@example.test"));
    db.run(
        "UPDATE iam_user_profile SET email='changed@example.test' WHERE local_user_id=?", reporter);
    mvc.perform(get("/api/complaints/" + id).with(user(officerName)))
        .andExpect(jsonPath("$.complaint.contact_email").value("reporter@example.test"));
    mvc.perform(get("/api/community/complaints/" + id).with(user(otherName)))
        .andExpect(jsonPath("$.complaint.contact_email").doesNotExist());
    mvc.perform(
            get("/api/community/complaints").param("scope", "municipality").with(user(otherName)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].id").value(id.toString()))
        .andExpect(
            content()
                .string(
                    org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("reporter@example.test"))));
    mvc.perform(
            get("/api/nearby")
                .param("latitude", "13.75")
                .param("longitude", "100.5")
                .with(user(otherName)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].id").value(id.toString()))
        .andExpect(
            content()
                .string(
                    org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("reporter@example.test"))));
    mvc.perform(get("/api/complaints/" + id).with(user(otherName)))
        .andExpect(status().isForbidden());
  }

  @Test
  void missingGovEmailDoesNotUseAnotherAccountOrClientSuppliedEmail() throws Exception {
    db.run("UPDATE iam_user_profile SET email=NULL WHERE local_user_id=?", reporter);
    UUID id = submit();
    assertNull(db.one("SELECT contact_email FROM complaint WHERE id=?", id).get("contact_email"));
  }

  @Test
  void absentGovProfileDoesNotPreventReportingOrAcceptClientEmail() throws Exception {
    db.run("DELETE FROM iam_user_profile WHERE local_user_id=?", reporter);
    UUID id = submit();
    assertNull(db.one("SELECT contact_email FROM complaint WHERE id=?", id).get("contact_email"));
  }
}
