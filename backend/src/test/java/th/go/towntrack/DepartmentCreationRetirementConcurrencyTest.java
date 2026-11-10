package th.go.towntrack;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest
@AutoConfigureMockMvc
class DepartmentCreationRetirementConcurrencyTest {
  @Autowired Db db;
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired AdminController admin;
  @Autowired PlatformTransactionManager transactions;

  @Test
  void concurrentCategoryMoveAndRetirementCannotCreateComplaintInRetiredDepartment()
      throws Exception {
    // Reuse the bootstrap municipality so this committed concurrency fixture does not
    // introduce another tenant into Gov SSO's single-municipality discovery tests.
    UUID town = (UUID) db.one("SELECT id FROM municipality ORDER BY id LIMIT 1").get("id"),
        source = UUID.randomUUID(),
        target = UUID.randomUUID(),
        category = UUID.randomUUID(),
        administrator = UUID.randomUUID(),
        citizen = UUID.randomUUID();
    UUID definition =
        (UUID)
            db.one(
                    "SELECT id FROM workflow_version WHERE municipality_id=? AND published=true ORDER BY version DESC LIMIT 1",
                    town)
                .get("id");
    String adminName = "routing-admin-" + administrator, citizenName = "routing-citizen-" + citizen;
    db.run(
        "INSERT INTO department(id,municipality_id,name) VALUES(?,?,'Source routing fixture'),(?,?,'Target routing fixture')",
        source,
        town,
        target,
        town);
    db.run(
        "INSERT INTO category(id,municipality_id,department_id,workflow_id,name,sla_hours) VALUES(?,?,?,?,'Concurrent routing fixture',24)",
        category,
        town,
        source,
        definition);
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role) VALUES(?,?,?,'unused','Routing administrator','ADMIN'),(?,?,?,'unused','Routing citizen','CITIZEN')",
        administrator,
        town,
        adminName,
        citizen,
        town,
        citizenName);
    var executor = Executors.newSingleThreadExecutor();
    var submission = new AtomicReference<Future<Integer>>();
    try {
      new TransactionTemplate(transactions)
          .executeWithoutResult(
              transaction -> {
                db.one("SELECT id FROM municipality WHERE id=? FOR UPDATE", town);
                db.one(
                    "SELECT id FROM department WHERE id=? AND municipality_id=? FOR UPDATE",
                    source,
                    town);
                submission.set(
                    executor.submit(
                        () ->
                            mvc.perform(
                                    multipart("/api/complaints")
                                        .file(
                                            new MockMultipartFile(
                                                "complaint",
                                                "complaint.json",
                                                "application/json",
                                                json.writeValueAsBytes(
                                                    Map.of(
                                                        "categoryId",
                                                        category,
                                                        "title",
                                                        "Concurrent submission",
                                                        "description",
                                                        "Test complaint",
                                                        "address",
                                                        "Test address"))))
                                        .file(
                                            new MockMultipartFile(
                                                "files",
                                                "evidence.pdf",
                                                "application/pdf",
                                                "%PDF-1.4 concurrency evidence"
                                                    .getBytes(StandardCharsets.UTF_8)))
                                        .with(user(citizenName).roles("CITIZEN"))
                                        .with(csrf()))
                                .andReturn()
                                .getResponse()
                                .getStatus()));
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(8);
                boolean waiting = false;
                while (System.nanoTime() < deadline) {
                  db.one("SELECT pg_stat_clear_snapshot() cleared");
                  waiting =
                      !db.list(
                              "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND (query LIKE 'SELECT id FROM municipality WHERE id=%FOR KEY SHARE%' OR query LIKE 'SELECT id FROM department WHERE id=%FOR SHARE%' OR query LIKE 'INSERT INTO complaint(%')")
                          .isEmpty();
                  if (waiting) break;
                  try {
                    Thread.sleep(25);
                  } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new AssertionError(e);
                  }
                }
                if (!waiting && submission.get().isDone()) {
                  try {
                    fail(
                        "Submission finished before lock boundary: status "
                            + submission.get().get());
                  } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new AssertionError(e);
                  } catch (ExecutionException e) {
                    throw new AssertionError(e);
                  }
                }
                assertTrue(
                    waiting, "Submission must reach the locked routing boundary before retirement");
                var authentication =
                    UsernamePasswordAuthenticationToken.authenticated(adminName, null, List.of());
                try {
                  admin.category(
                      Map.of(
                          "id",
                          category,
                          "departmentId",
                          target,
                          "workflowId",
                          definition,
                          "name",
                          "Moved routing fixture",
                          "slaHours",
                          24,
                          "active",
                          false),
                      authentication);
                  admin.deleteDepartment(source, authentication);
                } catch (Exception e) {
                  throw new CompletionException(e);
                }
              });
      assertEquals(
          404,
          submission.get().get(10, TimeUnit.SECONDS),
          "Submission must recheck routing after concurrent department retirement");
      assertNotNull(
          db.one("SELECT deleted_at FROM department WHERE id=?", source).get("deleted_at"));
      assertTrue(db.list("SELECT id FROM complaint WHERE category_id=?", category).isEmpty());
    } finally {
      executor.shutdownNow();
      assertTrue(executor.awaitTermination(10, TimeUnit.SECONDS));
    }
  }
}
