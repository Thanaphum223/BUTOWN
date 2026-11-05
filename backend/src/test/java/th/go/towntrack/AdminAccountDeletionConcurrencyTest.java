package th.go.towntrack;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class AdminAccountDeletionConcurrencyTest {
  @Autowired Db db;
  @Autowired MockMvc mvc;
  @Autowired GovIdentityService identities;
  @Autowired com.fasterxml.jackson.databind.ObjectMapper json;

  @ParameterizedTest
  @ValueSource(strings = {"DELETE", "DISABLE", "DEMOTE"})
  void concurrentAdministratorsCannotRemoveEachOtherAndLeaveNoAdministrator(String mutation)
      throws Exception {
    UUID town = (UUID) db.one("SELECT id FROM municipality ORDER BY id LIMIT 1").get("id"),
        first = UUID.randomUUID(),
        second = UUID.randomUUID();
    String firstName = "delete-race-" + first, secondName = "delete-race-" + second;
    for (var entry : Map.of(first, firstName, second, secondName).entrySet())
      db.run(
          "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role) VALUES(?,?,?,'unused','Concurrency fixture','ADMIN')",
          entry.getKey(),
          town,
          entry.getValue());
    var workers = Executors.newFixedThreadPool(2);
    try (var gate = db.jdbc.getDataSource().getConnection()) {
      gate.setAutoCommit(false);
      try (var lock = gate.prepareStatement("SELECT id FROM municipality WHERE id=? FOR UPDATE")) {
        lock.setObject(1, town);
        lock.executeQuery().close();
      }
      var a =
          workers.submit(
              () ->
                  mvc.perform(
                          delete("/api/admin/users/" + second)
                              .with(user(firstName).roles("ADMIN"))
                              .with(csrf()))
                      .andReturn()
                      .getResponse()
                      .getStatus());
      var b =
          workers.submit(
              () ->
                  mvc.perform(
                          (mutation.equals("DELETE")
                                  ? delete("/api/admin/users/" + first)
                                  : post("/api/admin/users/"
                                          + first
                                          + (mutation.equals("DISABLE") ? "/enabled" : "/role"))
                                      .contentType(MediaType.APPLICATION_JSON)
                                      .content(
                                          mutation.equals("DISABLE")
                                              ? "{\"enabled\":false}"
                                              : "{\"role\":\"CITIZEN\"}"))
                              .with(user(secondName).roles("ADMIN"))
                              .with(csrf()))
                      .andReturn()
                      .getResponse()
                      .getStatus());
      long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(8);
      long blocked;
      do {
        blocked =
            ((Number)
                    db.one(
                            "SELECT count(*) n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM municipality WHERE id=%FOR UPDATE%'")
                        .get("n"))
                .longValue();
        if (blocked == 2) break;
        Thread.sleep(25);
      } while (System.nanoTime() < deadline);
      assertEquals(
          2, blocked, "Both deletes must wait at the municipality boundary before either proceeds");
      gate.commit();
      var outcomes =
          new ArrayList<>(List.of(a.get(10, TimeUnit.SECONDS), b.get(10, TimeUnit.SECONDS)));
      Collections.sort(outcomes);
      assertEquals(1, outcomes.stream().filter(code -> code >= 200 && code < 300).count());
      assertEquals(1, outcomes.stream().filter(code -> code == 403 || code == 404).count());
      assertEquals(
          1L,
          ((Number)
                  db.one(
                          "SELECT count(*) n FROM app_user WHERE id IN (?,?) AND role='ADMIN' AND enabled=true",
                          first,
                          second)
                      .get("n"))
              .longValue());
      assertEquals(
          1L,
          ((Number)
                  db.one(
                          "SELECT count(*) n FROM audit_event WHERE actor_id IN (?,?) AND action IN ('USER_DELETE','USER_ENABLED','USER_ROLE')",
                          first,
                          second)
                      .get("n"))
              .longValue());
    } finally {
      workers.shutdownNow();
      assertTrue(workers.awaitTermination(10, TimeUnit.SECONDS));
    }
    // Reuse the bootstrap municipality so SSO single-tenant discovery remains isolated.
  }

  @Test
  void simultaneousGovRejoinsCreateOneFreshIdentityWithoutRestoringArchivedStaffRole()
      throws Exception {
    UUID town = (UUID) db.one("SELECT id FROM municipality ORDER BY id LIMIT 1").get("id");
    UUID old = UUID.randomUUID();
    String iam = "rejoin-race-" + old;
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role,enabled,deleted_at) VALUES(?,?,?,'unused','Archived staff','ADMIN',false,now())",
        old,
        town,
        iam);
    db.run(
        "INSERT INTO iam_user_profile(municipality_id,iam_user_id,local_user_id) VALUES(?,?,?)",
        town,
        iam,
        old);
    var data = json.valueToTree(Map.of("user", Map.of("id", iam, "memberships", List.of())));
    var pool = Executors.newFixedThreadPool(2);
    var start = new CountDownLatch(1);
    try {
      var first =
          pool.submit(
              () -> {
                start.await();
                return identities.sync(town, data, null);
              });
      var second =
          pool.submit(
              () -> {
                start.await();
                return identities.sync(town, data, null);
              });
      start.countDown();
      var a = first.get(15, TimeUnit.SECONDS);
      var b = second.get(15, TimeUnit.SECONDS);
      assertNotEquals(old, a.get("id"));
      assertEquals(a.get("id"), b.get("id"));
      assertEquals("CITIZEN", a.get("role"));
      assertNull(a.get("department_id"));
      assertEquals(false, db.one("SELECT enabled FROM app_user WHERE id=?", old).get("enabled"));
      assertEquals(
          a.get("id"),
          db.one(
                  "SELECT local_user_id FROM iam_user_profile WHERE municipality_id=? AND iam_user_id=?",
                  town,
                  iam)
              .get("local_user_id"));
      assertEquals(
          1L,
          db.one(
                  "SELECT count(DISTINCT actor_id) n FROM audit_event WHERE municipality_id=? AND action='IAM_LOGIN' AND actor_id IN (?,?)",
                  town,
                  a.get("id"),
                  b.get("id"))
              .get("n"));
    } finally {
      pool.shutdownNow();
      assertTrue(pool.awaitTermination(10, TimeUnit.SECONDS));
      removeIdentityBindingFixture(town, iam);
    }
  }

  @Test
  void boundGovSignInAndDeletionUseOneMunicipalityBeforeUserLockOrder() throws Exception {
    UUID town = (UUID) db.one("SELECT id FROM municipality ORDER BY id LIMIT 1").get("id");
    UUID target = UUID.randomUUID(), actor = UUID.randomUUID();
    String iam = "login-delete-race-" + target, actorName = "login-delete-admin-" + actor;
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role) VALUES(?,?,?,'unused','Sign-in fixture','CITIZEN')",
        target,
        town,
        iam);
    db.run(
        "INSERT INTO app_user(id,municipality_id,username,password_hash,display_name,role) VALUES(?,?,?,'unused','Administrator fixture','ADMIN')",
        actor,
        town,
        actorName);
    db.run(
        "INSERT INTO iam_user_profile(municipality_id,iam_user_id,local_user_id) VALUES(?,?,?)",
        town,
        iam,
        target);
    var data = json.valueToTree(Map.of("user", Map.of("id", iam, "memberships", List.of())));
    var pool = Executors.newFixedThreadPool(2);
    try (var gate = db.jdbc.getDataSource().getConnection()) {
      gate.setAutoCommit(false);
      try (var q = gate.prepareStatement("SELECT id FROM app_user WHERE id=? FOR UPDATE")) {
        q.setObject(1, target);
        q.executeQuery().close();
      }
      var login = pool.submit(() -> identities.sync(town, data, null));
      awaitDatabaseWaiters(1);
      var deletion =
          pool.submit(
              () ->
                  mvc.perform(
                          delete("/api/admin/users/" + target)
                              .with(user(actorName).roles("ADMIN"))
                              .with(csrf()))
                      .andReturn()
                      .getResponse()
                      .getStatus());
      awaitDatabaseWaiters(2);
      gate.commit();
      assertEquals(target, login.get(15, TimeUnit.SECONDS).get("id"));
      assertEquals(204, deletion.get(15, TimeUnit.SECONDS));
      assertEquals(false, db.one("SELECT enabled FROM app_user WHERE id=?", target).get("enabled"));
    } finally {
      pool.shutdownNow();
      assertTrue(pool.awaitTermination(10, TimeUnit.SECONDS));
      removeIdentityBindingFixture(town, iam);
    }
  }

  void awaitDatabaseWaiters(int wanted) throws Exception {
    long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(8), count;
    do {
      count =
          ((Number)
                  db.one(
                          "SELECT count(*) n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock'")
                      .get("n"))
              .longValue();
      if (count >= wanted) return;
      Thread.sleep(25);
    } while (System.nanoTime() < deadline);
    fail("Expected " + wanted + " real database lock waiters, got " + count);
  }

  void removeIdentityBindingFixture(UUID town, String iam) {
    db.run("DELETE FROM iam_user_residence WHERE municipality_id=? AND iam_user_id=?", town, iam);
    db.run("DELETE FROM iam_user_profile WHERE municipality_id=? AND iam_user_id=?", town, iam);
    // Preserve append-only audit rows and their user references; only the test SSO binding is
    // temporary.
  }
}
