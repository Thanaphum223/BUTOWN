package th.go.towntrack;

import java.math.BigDecimal;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * The equipment loan register (procurement regulation 2560, clauses 208–211): who has what, the
 * reason and the date it is due back, how it came back, and a reminder once it is overdue.
 */
@RestController
@RequestMapping("/api/stock")
public class EquipmentLoans {
  final Db db;
  final Access access;
  final Stock stock;
  final Workflow workflow;

  public EquipmentLoans(Db db, Access access, Stock stock, Workflow workflow) {
    this.db = db;
    this.access = access;
    this.stock = stock;
    this.workflow = workflow;
  }

  static final String TODAY = "(now() AT TIME ZONE 'Asia/Bangkok')::date";

  @GetMapping("/loans")
  public Object register(Authentication a) {
    var u = access.user(a);
    access.role(u, StockController.STAFF.toArray(String[]::new));
    return db.list(
        "SELECT l.id,l.stock_item_id,i.name,i.unit,l.complaint_id,l.quantity,l.reason,l.due_on,"
            + "l.borrowed_at,l.returned_at,l.return_condition,l.return_note,b.display_name"
            + " borrower_name,p.display_name approved_by_name,l.returned_at IS NULL AND l.due_on<"
            + TODAY
            + " overdue FROM equipment_loan l JOIN stock_item i ON i.id=l.stock_item_id JOIN"
            + " app_user b ON b.id=l.borrower_id LEFT JOIN app_user p ON p.id=l.approved_by WHERE"
            + " l.municipality_id=? ORDER BY l.returned_at IS NOT NULL,l.due_on,l.borrowed_at DESC"
            + " LIMIT 200",
        u.get("municipality_id"));
  }

  /**
   * A stock keeper records equipment coming back after the job report, or that it was lost (clause
   * 209). Lost equipment leaves the register with a recorded adjustment.
   */
  @PostMapping("/loans/{id}/return")
  @Transactional
  public Object giveBack(
      @PathVariable UUID id, @RequestBody Map<String, Object> b, Authentication a) {
    var u = access.user(a);
    stock.requireKeeper(u);
    var loan =
        db.one(
            "SELECT * FROM equipment_loan WHERE id=? AND municipality_id=? AND returned_at IS NULL"
                + " FOR UPDATE",
            id,
            u.get("municipality_id"));
    String condition = String.valueOf(b.get("condition"));
    if (!List.of("GOOD", "DAMAGED", "LOST").contains(condition))
      throw new IllegalArgumentException();
    String note = b.get("note") instanceof String text ? text.strip() : "";
    if (note.length() > 500 || (!"GOOD".equals(condition) && note.isEmpty()))
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "กรุณาระบุสภาพครุภัณฑ์ที่ชำรุดหรือสูญหายไม่เกิน 500 ตัวอักษร");
    Object item = loan.get("stock_item_id"), work = loan.get("work_order_id");
    BigDecimal held =
        work == null
            ? BigDecimal.ZERO
            : stock.outstanding(work).getOrDefault((UUID) item, BigDecimal.ZERO);
    if (held.signum() > 0) {
      stock.lock(u, List.of((UUID) item));
      String detail =
          switch (condition) {
            case "GOOD" -> "รับคืนครุภัณฑ์ตามใบยืม";
            case "DAMAGED" -> "รับคืนครุภัณฑ์ในสภาพชำรุด: " + note;
            default -> "ครุภัณฑ์สูญหาย: " + note;
          };
      stock.move(
          u, item, "RETURN", held, detail, loan.get("complaint_id"), loan.get("resource_id"), work);
      // Lost equipment comes back on paper only, then leaves the balance as a written-off item.
      if ("LOST".equals(condition))
        stock.move(u, item, "ADJUST", held.negate(), detail, loan.get("complaint_id"), null, null);
    }
    db.run(
        "UPDATE equipment_loan SET returned_at=now(),returned_by=?,return_condition=?,return_note=?"
            + " WHERE id=?",
        u.get("id"),
        condition,
        note,
        id);
    if (loan.get("complaint_id") != null) {
      String status =
          (String)
              db.one("SELECT status FROM complaint WHERE id=?", loan.get("complaint_id"))
                  .get("status");
      workflow.audit(
          u,
          (UUID) loan.get("complaint_id"),
          "RETURN_EQUIPMENT_LOAN",
          status,
          status,
          note,
          Map.of("loanId", id, "condition", condition));
    }
    return Map.of("id", id, "condition", condition);
  }

  /** Clause 211: an overdue loan is chased, once, from the day after it falls due. */
  @Scheduled(cron = "0 0 8 * * *", zone = "Asia/Bangkok")
  @Transactional
  public void remindOverdue() {
    for (var loan :
        db.list(
            "SELECT l.id,l.municipality_id,l.complaint_id,l.borrower_id,l.due_on,i.name,c.leader_id"
                + " FROM equipment_loan l JOIN stock_item i ON i.id=l.stock_item_id LEFT JOIN"
                + " complaint c ON c.id=l.complaint_id WHERE l.returned_at IS NULL AND"
                + " l.reminded_at IS NULL AND l.due_on<"
                + TODAY
                + " FOR UPDATE OF l SKIP LOCKED")) {
      var recipients = new LinkedHashSet<Object>();
      recipients.add(loan.get("borrower_id"));
      recipients.addAll(
          workflow.leaderAndKeepers(loan, Map.of("municipality_id", loan.get("municipality_id"))));
      String message =
          "ครุภัณฑ์ "
              + loan.get("name")
              + " ที่ยืมไปเกินกำหนดส่งคืน ("
              + loan.get("due_on")
              + ") กรุณาส่งคืนคลังหรือติดตามทวงคืนภายใน 7 วัน";
      for (Object recipient : recipients)
        workflow.notifyUser(recipient, (UUID) loan.get("complaint_id"), message);
      db.run("UPDATE equipment_loan SET reminded_at=now() WHERE id=?", loan.get("id"));
    }
  }

  /** Approvers the mayor has delegated, in writing, to approve equipment loans. */
  @PutMapping("/loan-approvers/{userId}")
  @Transactional
  public Object delegate(
      @PathVariable UUID userId, @RequestBody Map<String, Object> b, Authentication a) {
    var u = access.user(a);
    if (!"ADMIN".equals(u.get("account_role"))) Access.deny();
    if (!(b.get("approver") instanceof Boolean approver)) throw new IllegalArgumentException();
    String reference = b.get("reference") instanceof String text ? text.strip() : "";
    if (approver && (reference.isEmpty() || reference.length() > 200))
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "กรุณาระบุเลขที่หนังสือมอบอำนาจไม่เกิน 200 ตัวอักษร");
    if (db.run(
            "UPDATE app_user SET loan_approver=? WHERE id=? AND municipality_id=? AND"
                + " role='APPROVER'",
            approver,
            userId,
            u.get("municipality_id"))
        == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    workflow.audit(
        u,
        null,
        approver ? "DELEGATE_LOAN_APPROVAL" : "REVOKE_LOAN_APPROVAL",
        null,
        null,
        reference,
        Map.of("userId", userId));
    return Map.of("id", userId, "loan_approver", approver);
  }
}
