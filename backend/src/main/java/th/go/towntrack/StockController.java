package th.go.towntrack;

import java.math.BigDecimal;
import java.util.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/stock")
public class StockController {
  final Db db;
  final Access access;
  final Stock stock;

  public StockController(Db db, Access access, Stock stock) {
    this.db = db;
    this.access = access;
    this.stock = stock;
  }

  static final List<String> STAFF = List.of("OFFICER", "LEADER", "FIELD", "APPROVER", "ADMIN");

  @GetMapping
  public Object items(Authentication a) {
    var u = access.user(a);
    access.role(u, STAFF.toArray(String[]::new));
    return Map.of(
        "keeper",
        stock.keeper(u),
        "items",
        db.list(
            "SELECT i.id,i.name,i.unit,i.on_hand,i.active,(SELECT COALESCE(-SUM(m.delta),0) FROM"
                + " stock_movement m WHERE m.stock_item_id=i.id AND m.kind IN ('ISSUE','RETURN'))"
                + " in_use FROM stock_item i WHERE i.municipality_id=? ORDER BY i.active DESC,i.name",
            u.get("municipality_id")));
  }

  @PostMapping
  @Transactional
  public Object create(@RequestBody Map<String, Object> b, Authentication a) {
    var u = access.user(a);
    stock.requireKeeper(u);
    String name = Workflow.text(b, "name", 200), unit = Workflow.text(b, "unit", 50);
    if (!Workflow.UNIT.matcher(unit).matches())
      throw new IllegalArgumentException("หน่วยต้องเป็นคำ เช่น ถุง เมตร และห้ามมีตัวเลข");
    UUID id = UUID.randomUUID();
    try {
      db.run(
          "INSERT INTO stock_item(id,municipality_id,name,unit) VALUES(?,?,?,?)",
          id,
          u.get("municipality_id"),
          name,
          unit);
    } catch (DuplicateKeyException e) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "มีวัสดุชื่อและหน่วยนี้ในคลังแล้ว");
    }
    if (b.get("quantity") != null) {
      var quantity = Stock.positive(b.get("quantity"), "จำนวนรับเข้าต้องมากกว่า 0");
      stock.move(
          u, id, "RECEIVE", quantity, note(b, "ยอดยกมา / รับเข้าครั้งแรก"), null, null, null);
    }
    return Map.of("id", id);
  }

  @PostMapping("/{id}/movements")
  @Transactional
  public Object adjust(
      @PathVariable UUID id, @RequestBody Map<String, Object> b, Authentication a) {
    var u = access.user(a);
    stock.requireKeeper(u);
    String kind = String.valueOf(b.get("kind"));
    // Clause 203(1): every receipt needs evidence; adjustments need a reason.
    String note = Workflow.text(b, "note", 1000);
    BigDecimal delta;
    switch (kind) {
      case "RECEIVE" -> delta = Stock.positive(b.get("quantity"), "จำนวนรับเข้าต้องมากกว่า 0");
      case "ADJUST" -> {
        try {
          delta = new BigDecimal(String.valueOf(b.get("quantity")));
        } catch (NumberFormatException e) {
          throw new IllegalArgumentException("กรุณาระบุจำนวนที่ปรับเป็นตัวเลข");
        }
        if (delta.signum() == 0
            || delta.scale() > 2
            || delta.abs().compareTo(new BigDecimal("1000000000")) > 0)
          throw new IllegalArgumentException(
              "จำนวนที่ปรับต้องไม่เป็น 0 และมีทศนิยมไม่เกินสองตำแหน่ง");
      }
      default -> throw new IllegalArgumentException();
    }
    stock.move(u, id, kind, delta, note, null, null, null);
    return stock.item(id, u, false);
  }

  @PatchMapping("/{id}")
  @Transactional
  public Object update(
      @PathVariable UUID id, @RequestBody Map<String, Object> b, Authentication a) {
    var u = access.user(a);
    stock.requireKeeper(u);
    stock.item(id, u, true);
    if (!(b.get("active") instanceof Boolean active)) throw new IllegalArgumentException();
    db.run("UPDATE stock_item SET active=? WHERE id=?", active, id);
    return stock.item(id, u, false);
  }

  @GetMapping("/{id}/movements")
  public Object history(@PathVariable UUID id, Authentication a) {
    var u = access.user(a);
    access.role(u, STAFF.toArray(String[]::new));
    stock.item(id, u, false);
    return db.list(
        "SELECT m.id,m.kind,m.delta,m.balance_after,m.note,m.created_at,m.complaint_id,"
            + "p.display_name actor_name FROM stock_movement m JOIN app_user p ON p.id=m.actor_id"
            + " WHERE m.stock_item_id=? ORDER BY m.created_at DESC LIMIT 200",
        id);
  }

  @GetMapping("/keepers")
  public Object keepers(Authentication a) {
    var u = access.user(a);
    if (!"ADMIN".equals(u.get("account_role"))) Access.deny();
    return db.list(
        "SELECT id,display_name,role,stock_keeper FROM app_user WHERE municipality_id=? AND"
            + " enabled=true AND role IN ('OFFICER','LEADER','FIELD','APPROVER') ORDER BY"
            + " display_name",
        u.get("municipality_id"));
  }

  @PutMapping("/keepers/{userId}")
  @Transactional
  public Object setKeeper(
      @PathVariable UUID userId, @RequestBody Map<String, Object> b, Authentication a) {
    var u = access.user(a);
    if (!"ADMIN".equals(u.get("account_role"))) Access.deny();
    if (!(b.get("keeper") instanceof Boolean keeper)) throw new IllegalArgumentException();
    if (db.run(
            "UPDATE app_user SET stock_keeper=? WHERE id=? AND municipality_id=? AND role<>'CITIZEN'",
            keeper,
            userId,
            u.get("municipality_id"))
        == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    return Map.of("id", userId, "stock_keeper", keeper);
  }

  /** Items issued to and returned from this complaint's jobs. */
  @GetMapping("/complaints/{complaintId}")
  public Object complaint(@PathVariable UUID complaintId, Authentication a) {
    var u = access.user(a);
    access.role(u, STAFF.toArray(String[]::new));
    access.complaint(complaintId, u, false);
    return db.list(
        "SELECT i.id stock_item_id,i.name,i.unit,m.work_order_id,"
            + "-SUM(m.delta) FILTER(WHERE m.kind='ISSUE') issued,"
            + "COALESCE(SUM(m.delta) FILTER(WHERE m.kind='RETURN'),0) returned,"
            + "-SUM(m.delta) used FROM stock_movement m JOIN stock_item i ON i.id=m.stock_item_id"
            + " WHERE m.complaint_id=? AND m.kind IN ('ISSUE','RETURN') GROUP BY"
            + " i.id,i.name,i.unit,m.work_order_id ORDER BY i.name",
        complaintId);
  }

  static String note(Map<String, Object> b, String fallback) {
    Object note = b.get("note");
    if (note == null || (note instanceof String s && s.isBlank())) return fallback;
    if (!(note instanceof String s) || s.length() > 1000) throw new IllegalArgumentException();
    return s.trim();
  }
}
