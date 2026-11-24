package th.go.towntrack;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
  final Workflow workflow;

  public StockController(Db db, Access access, Stock stock, Workflow workflow) {
    this.workflow = workflow;
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
            "SELECT b.*,GREATEST(b.on_hand-b.reserved,0) available FROM ("
                + BALANCES
                + ") b ORDER BY b.active DESC,b.name",
            u.get("municipality_id")),
        "canVerify",
        "LEADER".equals(u.get("role")) || stock.keeper(u));
  }

  // Items on finished jobs are used up, so only open jobs count as in use.
  static final String BALANCES =
      "SELECT i.id,i.name,i.unit,i.on_hand,i.active,i.item_type,(SELECT COALESCE(SUM(r.quantity),0)"
          + " FROM stock_reservation r WHERE r.stock_item_id=i.id AND r.status='ACTIVE') reserved,"
          + "(SELECT COALESCE(-SUM(m.delta),0) FROM stock_movement m JOIN work_order w ON"
          + " w.id=m.work_order_id WHERE m.stock_item_id=i.id AND m.kind IN ('ISSUE','RETURN') AND"
          + " w.status NOT IN ('COMPLETE','CANCELLED','DECLINED')) in_use FROM stock_item i WHERE"
          + " i.municipality_id=?";

  // Taken on site without an approved request, so the paperwork follows afterwards.
  static final String ISSUES =
      "SELECT m.id,m.stock_item_id,m.complaint_id,m.work_order_id,i.name,i.unit,-m.delta quantity,"
          + "m.created_at,p.display_name actor_name,c.leader_id,l.verified_at leader_verified_at,"
          + "lu.display_name leader_verified_by,l.note leader_note,k.verified_at keeper_verified_at,"
          + "ku.display_name keeper_verified_by,k.note keeper_note FROM stock_movement m JOIN"
          + " stock_item i ON i.id=m.stock_item_id JOIN complaint c ON c.id=m.complaint_id JOIN"
          + " app_user p ON p.id=m.actor_id LEFT JOIN stock_issue_verification l ON"
          + " l.movement_id=m.id AND l.verifier_role='LEADER' LEFT JOIN app_user lu ON"
          + " lu.id=l.verified_by LEFT JOIN stock_issue_verification k ON k.movement_id=m.id AND"
          + " k.verifier_role='KEEPER' LEFT JOIN app_user ku ON ku.id=k.verified_by WHERE"
          + " m.municipality_id=? AND m.kind='ISSUE' AND m.work_order_id IS NOT NULL AND"
          + " m.resource_id IS NULL";

  /** The capacity this user can still confirm in, or null. */
  static String verifierRole(Map<String, Object> issue, Map<String, Object> u, boolean keeper) {
    if ("LEADER".equals(u.get("role"))
        && u.get("id").equals(issue.get("leader_id"))
        && issue.get("leader_verified_at") == null) return "LEADER";
    return keeper && issue.get("keeper_verified_at") == null ? "KEEPER" : null;
  }

  List<Map<String, Object>> withVerifier(
      List<Map<String, Object>> issues, Map<String, Object> u, boolean keeper) {
    var result = new ArrayList<Map<String, Object>>();
    for (var issue : issues) {
      var row = new LinkedHashMap<String, Object>(issue);
      row.remove("leader_id");
      row.put("verify_as", verifierRole(issue, u, keeper));
      result.add(row);
    }
    return result;
  }

  @GetMapping("/pending-verifications")
  public Object pendingVerifications(Authentication a) {
    var u = access.user(a);
    boolean keeper = stock.keeper(u);
    if (!keeper) access.role(u, "LEADER");
    var args = new ArrayList<Object>(List.of(u.get("municipality_id")));
    if (!keeper) args.add(u.get("id"));
    return withVerifier(
        db.list(
            ISSUES
                + " AND (l.movement_id IS NULL OR k.movement_id IS NULL)"
                + (keeper ? "" : " AND c.leader_id=?")
                + " ORDER BY m.created_at,m.id LIMIT 200",
            args.toArray()),
        u,
        keeper);
  }

  @GetMapping("/complaints/{complaintId}/verifications")
  public Object complaintVerifications(@PathVariable UUID complaintId, Authentication a) {
    var u = access.user(a);
    access.role(u, STAFF.toArray(String[]::new));
    access.complaint(complaintId, u, false);
    return withVerifier(
        db.list(
            ISSUES + " AND m.complaint_id=? ORDER BY m.created_at,m.id",
            u.get("municipality_id"),
            complaintId),
        u,
        stock.keeper(u));
  }

  @PostMapping("/movements/{movementId}/verify")
  @Transactional
  public Object verify(
      @PathVariable UUID movementId,
      @RequestBody(required = false) Map<String, Object> b,
      Authentication a) {
    var u = access.user(a);
    boolean keeper = stock.keeper(u);
    if (!keeper) access.role(u, "LEADER");
    var issue = db.one(ISSUES + " AND m.id=?", u.get("municipality_id"), movementId);
    if (!keeper && !u.get("id").equals(issue.get("leader_id"))) Access.deny();
    String role = verifierRole(issue, u, keeper);
    String note = b == null ? "" : note(b, "");
    if (role == null
        || db.run(
                "INSERT INTO stock_issue_verification(movement_id,verifier_role,verified_by,note)"
                    + " VALUES(?,?,?,?) ON CONFLICT DO NOTHING",
                movementId,
                role,
                u.get("id"),
                note)
            == 0) throw new ResponseStatusException(HttpStatus.CONFLICT, "รับรองใบเบิกนี้ไปแล้ว");
    UUID complaintId = (UUID) issue.get("complaint_id");
    String status =
        (String) db.one("SELECT status FROM complaint WHERE id=?", complaintId).get("status");
    workflow.audit(
        u,
        complaintId,
        "VERIFY_STOCK_ISSUE",
        status,
        status,
        note,
        Map.of("movementId", movementId, "verifierRole", role));
    return Map.of("id", movementId, "verifierRole", role);
  }

  /** Annual stock report (clause 213): current balances with totals for the chosen dates. */
  @GetMapping("/export.csv")
  public ResponseEntity<byte[]> export(
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      Authentication a) {
    var u = access.user(a);
    if (!stock.keeper(u)) access.role(u, STAFF.toArray(String[]::new));
    if (from != null && to != null && from.isAfter(to))
      throw new IllegalArgumentException("ช่วงวันที่ไม่ถูกต้อง");
    var zone = ZoneId.of("Asia/Bangkok");
    var start = from == null ? null : java.sql.Timestamp.from(from.atStartOfDay(zone).toInstant());
    var end =
        to == null ? null : java.sql.Timestamp.from(to.plusDays(1).atStartOfDay(zone).toInstant());
    var csv =
        new StringBuilder(
            "\uFEFFชื่อวัสดุ,ประเภท,หน่วย,สถานะ,คงเหลือในคลัง,จองรอเบิก,พร้อมเบิก,กำลังใช้งานหน้างาน,"
                + "รับเข้าสะสม,เบิกจ่ายสะสม,คืนคลังสะสม,ใช้ไปสุทธิ\r\n");
    for (var r :
        db.list(
            "SELECT b.*,GREATEST(b.on_hand-b.reserved,0) available,COALESCE(t.received,0) received,"
                + "COALESCE(t.issued,0) issued,COALESCE(t.returned,0) returned FROM ("
                + BALANCES
                + ") b LEFT JOIN (SELECT stock_item_id,SUM(delta) FILTER(WHERE kind='RECEIVE')"
                + " received,-SUM(delta) FILTER(WHERE kind='ISSUE') issued,SUM(delta)"
                + " FILTER(WHERE kind='RETURN') returned FROM stock_movement WHERE"
                + " (?::timestamptz IS NULL OR created_at>=?::timestamptz) AND (?::timestamptz IS"
                + " NULL OR created_at<?::timestamptz) GROUP BY stock_item_id) t ON"
                + " t.stock_item_id=b.id ORDER BY b.active DESC,b.name",
            u.get("municipality_id"),
            start,
            start,
            end,
            end)) {
      var issued = (BigDecimal) r.get("issued");
      var returned = (BigDecimal) r.get("returned");
      csv.append(
              String.join(
                  ",",
                  cell(r.get("name")),
                  "EQUIPMENT".equals(r.get("item_type")) ? "ครุภัณฑ์" : "วัสดุสิ้นเปลือง",
                  cell(r.get("unit")),
                  Boolean.TRUE.equals(r.get("active")) ? "ใช้งาน" : "ปิดใช้งาน",
                  number(r.get("on_hand")),
                  number(r.get("reserved")),
                  number(r.get("available")),
                  number(r.get("in_use")),
                  number(r.get("received")),
                  number(issued),
                  number(returned),
                  number(issued.subtract(returned))))
          .append("\r\n");
    }
    return ResponseEntity.ok()
        .header("Content-Type", "text/csv; charset=UTF-8")
        .header("Content-Disposition", "attachment; filename=\"stock-report.csv\"")
        .header("Cache-Control", "no-store")
        .body(csv.toString().getBytes(StandardCharsets.UTF_8));
  }

  static String number(Object value) {
    return ((BigDecimal) value).stripTrailingZeros().toPlainString();
  }

  // Spreadsheets run text starting with these characters as formulas.
  static String cell(Object value) {
    String text = String.valueOf(value);
    if (text.matches("(?s)\\s*[=+\\-@].*")) text = "'" + text;
    return '"' + text.replace("\"", "\"\"") + '"';
  }

  @PostMapping
  @Transactional
  public Object create(@RequestBody Map<String, Object> b, Authentication a) {
    var u = access.user(a);
    stock.requireKeeper(u);
    String name = Workflow.text(b, "name", 200), unit = Workflow.text(b, "unit", 50);
    if (!Workflow.UNIT.matcher(unit).matches())
      throw new IllegalArgumentException("หน่วยต้องเป็นคำ เช่น ถุง เมตร และห้ามมีตัวเลข");
    Object type = b.get("itemType") == null ? "CONSUMABLE" : b.get("itemType");
    if (!List.of("CONSUMABLE", "EQUIPMENT").contains(type))
      throw new IllegalArgumentException("ประเภทวัสดุไม่ถูกต้อง");
    UUID id = UUID.randomUUID();
    try {
      db.run(
          "INSERT INTO stock_item(id,municipality_id,name,unit,item_type) VALUES(?,?,?,?,?)",
          id,
          u.get("municipality_id"),
          name,
          unit,
          type);
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
        if (delta.signum() < 0) stock.requireAvailable(u, id, delta.negate());
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
        "SELECT i.id stock_item_id,i.name,i.unit,i.item_type,m.work_order_id,"
            + "-SUM(m.delta) FILTER(WHERE m.kind='ISSUE') issued,"
            + "COALESCE(SUM(m.delta) FILTER(WHERE m.kind='RETURN'),0) returned,"
            + "-SUM(m.delta) used FROM stock_movement m JOIN stock_item i ON i.id=m.stock_item_id"
            + " WHERE m.complaint_id=? AND m.kind IN ('ISSUE','RETURN') GROUP BY"
            + " i.id,i.name,i.unit,i.item_type,m.work_order_id ORDER BY i.name",
        complaintId);
  }

  static String note(Map<String, Object> b, String fallback) {
    Object note = b.get("note");
    if (note == null || (note instanceof String s && s.isBlank())) return fallback;
    if (!(note instanceof String s) || s.length() > 1000) throw new IllegalArgumentException();
    return s.trim();
  }
}
