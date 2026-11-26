package th.go.towntrack;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Removes a complaint and everything recorded under it. Closed complaints go once the retention
 * period has passed since closing; an administrator may remove one earlier. Stock movements stay in
 * the ledger, unlinked, and one audit event records each removal without the complaint text.
 */
@RestController
@RequestMapping("/api/admin/complaints")
public class ComplaintRetention {
  static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(ComplaintRetention.class);
  static final int BATCH = 100;
  final Db db;
  final Access access;
  final Workflow workflow;
  final TransactionTemplate tx;
  final ObjectMapper json;
  final Path root;
  final int years;

  @Autowired(required = false)
  ObjectStorage objectStorage;

  public ComplaintRetention(
      Db db,
      Access access,
      Workflow workflow,
      TransactionTemplate tx,
      ObjectMapper json,
      FileController files,
      @Value("${COMPLAINT_RETENTION_YEARS:5}") int years) {
    if (years < 0 || years > 100)
      throw new IllegalArgumentException("COMPLAINT_RETENTION_YEARS must be between 0 and 100");
    this.db = db;
    this.access = access;
    this.workflow = workflow;
    this.tx = tx;
    this.json = json;
    this.root = files.rootPath();
    this.years = years;
  }

  /** The retention period and, once the complaint is closed, the day it will be removed. */
  public Map<String, Object> view(UUID id) {
    var result = new LinkedHashMap<String, Object>();
    result.put("years", years);
    result.put(
        "until",
        years == 0
            ? null
            : db.one(
                    "SELECT closed_at+make_interval(years=>?) until FROM complaint WHERE id=?",
                    years,
                    id)
                .get("until"));
    return result;
  }

  @PostMapping("/{id}/purge")
  public void purge(@PathVariable UUID id, @RequestBody Map<String, Object> b, Authentication a) {
    String reason = b.get("reason") instanceof String s ? s.strip() : "";
    if (reason.isEmpty() || reason.length() > 500)
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "กรุณาระบุเหตุผลการลบไม่เกิน 500 ตัวอักษร");
    tx.executeWithoutResult(
        status -> {
          var u = access.user(a);
          // Administrators keep this right while working in another role.
          if (!"ADMIN".equals(u.get("account_role"))) Access.deny();
          var c =
              db.one(
                  "SELECT id,municipality_id,closed_at FROM complaint WHERE id=? AND"
                      + " municipality_id=? FOR UPDATE",
                  id,
                  u.get("municipality_id"));
          if (holdsStock(id))
            throw new ResponseStatusException(
                HttpStatus.CONFLICT, "คำร้องนี้ยังมีอุปกรณ์ที่เบิกออกและยังไม่คืน กรุณาคืนก่อนลบ");
          remove(id, "ผู้ดูแลระบบได้ลบคำร้อง #" + ref(id) + " ออกจากระบบแล้ว");
          workflow.audit(
              u,
              null,
              "COMPLAINT_PURGED",
              null,
              null,
              "ลบคำร้องถาวร: " + reason,
              details(id, c.get("closed_at"), "ADMIN"));
        });
  }

  @Scheduled(fixedDelay = 6 * 3600_000L, initialDelay = 600_000L)
  public void purgeExpired() {
    if (years == 0) return;
    // Complaints that cannot go yet are passed over so they never hold back newer ones.
    var skipped = new ArrayList<String>();
    for (int round = 0; round < 50; round++) {
      var due =
          db.list(
              "SELECT id FROM complaint WHERE closed_at<now()-make_interval(years=>?) AND status IN"
                  + " ('CLOSED','REJECTED','TERMINATED') AND NOT (id::text=ANY(?::text[])) ORDER"
                  + " BY closed_at LIMIT ?",
              years,
              "{" + String.join(",", skipped) + "}",
              BATCH);
      if (due.isEmpty()) return;
      for (var row : due) {
        UUID id = (UUID) row.get("id");
        try {
          if (!Boolean.TRUE.equals(tx.execute(status -> expire(id)))) skipped.add(id.toString());
        } catch (RuntimeException e) {
          skipped.add(id.toString());
          log.warn("Retention purge failed for complaint {}: {}", id, e.getMessage());
        }
      }
    }
  }

  boolean expire(UUID id) {
    var rows =
        db.list(
            "SELECT municipality_id,closed_at FROM complaint WHERE id=? AND"
                + " closed_at<now()-make_interval(years=>?) AND status IN"
                + " ('CLOSED','REJECTED','TERMINATED') FOR UPDATE SKIP LOCKED",
            id,
            years);
    if (rows.isEmpty()) return false;
    if (holdsStock(id)) {
      log.warn("Complaint {} is past retention but still holds issued equipment", id);
      return false;
    }
    remove(id, "คำร้อง #" + ref(id) + " ครบระยะเวลาเก็บ " + years + " ปี ระบบจึงลบออกจากระบบแล้ว");
    db.run(
        "INSERT INTO audit_event(id,complaint_id,municipality_id,actor_id,action,reason,details)"
            + " VALUES(?,NULL,?,NULL,'COMPLAINT_PURGED',?,?::jsonb)",
        UUID.randomUUID(),
        rows.getFirst().get("municipality_id"),
        "ลบคำร้องที่ครบระยะเวลาเก็บ " + years + " ปี",
        json.valueToTree(details(id, rows.getFirst().get("closed_at"), "RETENTION")).toString());
    return true;
  }

  static Map<String, Object> details(UUID id, Object closedAt, String mode) {
    var details = new LinkedHashMap<String, Object>();
    details.put("complaintId", id.toString());
    details.put("closedAt", closedAt == null ? null : closedAt.toString());
    details.put("mode", mode);
    return details;
  }

  boolean holdsStock(UUID id) {
    return !db.list(
            "SELECT 1 FROM stock_movement m JOIN stock_item i ON i.id=m.stock_item_id WHERE"
                + " i.item_type='EQUIPMENT' AND m.work_order_id IN (SELECT id FROM work_order"
                + " WHERE complaint_id=?) AND m.kind IN ('ISSUE','RETURN') GROUP BY"
                + " m.work_order_id,m.stock_item_id HAVING -SUM(m.delta)>0",
            id)
        .isEmpty();
  }

  /** The short number people see on a report, such as #E00864A8. */
  static String ref(UUID id) {
    return id.toString().substring(0, 8).toUpperCase();
  }

  /**
   * Deletes the complaint's rows in dependency order and tells its reporter and followers why;
   * stored files go once the delete commits.
   */
  void remove(UUID id, String notice) {
    var told =
        db.list(
            "SELECT u.id FROM app_user u WHERE u.enabled=true AND u.deleted_at IS NULL AND u.id IN"
                + " (SELECT reporter_id FROM complaint WHERE id=? UNION SELECT user_id FROM"
                + " follower WHERE complaint_id=?)",
            id,
            id);
    var stored =
        db.list(
            "SELECT storage_key,thumbnail_key,storage_provider FROM attachment WHERE complaint_id=?",
            id);
    db.run("SET LOCAL towntrack.purge = 'on'");
    String resources = "(SELECT id FROM resource_request WHERE complaint_id=?)";
    String works = "(SELECT id FROM work_order WHERE complaint_id=?)";
    db.run(
        "UPDATE stock_movement SET complaint_id=NULL,resource_id=NULL,work_order_id=NULL WHERE"
            + " complaint_id=? OR resource_id IN "
            + resources
            + " OR work_order_id IN "
            + works,
        id,
        id,
        id);
    // The equipment loan register outlives the complaint, like the stock ledger.
    db.run(
        "UPDATE equipment_loan SET complaint_id=NULL,resource_id=NULL,work_order_id=NULL WHERE"
            + " complaint_id=? OR resource_id IN "
            + resources
            + " OR work_order_id IN "
            + works,
        id,
        id,
        id);
    db.run(
        "DELETE FROM notification_delivery WHERE notification_id IN (SELECT id FROM notification"
            + " WHERE complaint_id=?)",
        id);
    for (String table :
        List.of(
            "notification",
            "follower",
            "complaint_vote",
            "sla_reminder",
            "sla_extension",
            "complaint_message",
            "route_stop",
            "department_transfer",
            "review")) db.run("DELETE FROM " + table + " WHERE complaint_id=?", id);
    db.run("DELETE FROM attachment WHERE complaint_id=? AND public_copy_of IS NOT NULL", id);
    db.run("DELETE FROM attachment WHERE complaint_id=?", id);
    for (String table : List.of("stock_reservation", "approval_assignment", "resource_revision"))
      db.run("DELETE FROM " + table + " WHERE resource_id IN " + resources, id);
    db.run("DELETE FROM resource_request WHERE complaint_id=?", id);
    db.run("DELETE FROM field_report WHERE complaint_id=?", id);
    db.run("DELETE FROM work_member WHERE work_order_id IN " + works, id);
    db.run("DELETE FROM work_order WHERE complaint_id=?", id);
    db.run("DELETE FROM audit_event WHERE complaint_id=?", id);
    db.run("DELETE FROM integration_reference WHERE local_id=?", id);
    db.run("DELETE FROM submission_key WHERE response->>'id'=?", id.toString());
    db.run("DELETE FROM complaint WHERE id=?", id);
    db.run("SET LOCAL towntrack.purge = 'off'");
    for (var person : told) workflow.notifyUser(person.get("id"), null, notice);
    TransactionSynchronizationManager.registerSynchronization(
        new TransactionSynchronization() {
          @Override
          public void afterCommit() {
            for (var file : stored) deleteStored(file);
          }
        });
  }

  void deleteStored(Map<String, Object> file) {
    for (Object key : new Object[] {file.get("storage_key"), file.get("thumbnail_key")}) {
      if (key == null) continue;
      try {
        Path local = root.resolve(key.toString()).normalize();
        if (local.startsWith(root)) Files.deleteIfExists(local);
        if ("s3".equals(file.get("storage_provider"))
            && objectStorage != null
            && objectStorage.enabled()) objectStorage.delete(key.toString());
      } catch (Exception e) {
        log.warn("Could not delete stored file {}: {}", key, e.getMessage());
      }
    }
  }
}
