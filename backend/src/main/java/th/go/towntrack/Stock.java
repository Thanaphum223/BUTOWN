package th.go.towntrack;

import java.math.BigDecimal;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Stock balances change only through recorded movements, and never below zero. */
@Service
public class Stock {
  final Db db;

  public Stock(Db db) {
    this.db = db;
  }

  public boolean keeper(Map<String, Object> u) {
    if ("ADMIN".equals(u.get("account_role")) || "ADMIN".equals(u.get("role"))) return true;
    return Boolean.TRUE.equals(
        db.one("SELECT stock_keeper FROM app_user WHERE id=?", u.get("id")).get("stock_keeper"));
  }

  public void requireKeeper(Map<String, Object> u) {
    if (!keeper(u)) Access.deny();
  }

  public Map<String, Object> item(Object id, Map<String, Object> u, boolean lock) {
    return db.one(
        "SELECT * FROM stock_item WHERE id=? AND municipality_id=?" + (lock ? " FOR UPDATE" : ""),
        Db.id(id),
        u.get("municipality_id"));
  }

  /** Locks items in one global order so concurrent jobs cannot deadlock. */
  public void lock(Map<String, Object> u, Collection<UUID> items) {
    for (UUID id : new TreeSet<>(items)) item(id, u, true);
  }

  /** Quantity held for approved requests that have not started. */
  public BigDecimal reserved(Object itemId) {
    return (BigDecimal)
        db.one(
                "SELECT COALESCE(SUM(quantity),0) reserved FROM stock_reservation WHERE"
                    + " stock_item_id=? AND status='ACTIVE'",
                itemId)
            .get("reserved");
  }

  public BigDecimal available(Map<String, Object> item) {
    return ((BigDecimal) item.get("on_hand")).subtract(reserved(item.get("id")));
  }

  /** Refuses to take more than what other approved jobs have left unreserved. */
  public void requireAvailable(Map<String, Object> u, Object itemId, BigDecimal quantity) {
    var item = item(itemId, u, true);
    var available = available(item);
    if (available.compareTo(quantity) < 0)
      throw new ResponseStatusException(
          HttpStatus.CONFLICT,
          "คงคลังไม่พอ: "
              + item.get("name")
              + " เหลือ "
              + available.max(BigDecimal.ZERO).stripTrailingZeros().toPlainString()
              + " "
              + item.get("unit"));
  }

  public void reserve(Map<String, Object> u, Object resourceId, Map<UUID, BigDecimal> lines) {
    lock(u, lines.keySet());
    for (var line : lines.entrySet()) {
      requireAvailable(u, line.getKey(), line.getValue());
      db.run(
          "INSERT INTO stock_reservation(id,resource_id,stock_item_id,municipality_id,quantity)"
              + " VALUES(?,?,?,?,?)",
          UUID.randomUUID(),
          resourceId,
          line.getKey(),
          u.get("municipality_id"),
          line.getValue());
    }
  }

  public void release(Object complaintId) {
    db.run(
        "UPDATE stock_reservation SET status='RELEASED',resolved_at=now() WHERE status='ACTIVE' AND"
            + " resource_id IN (SELECT id FROM resource_request WHERE complaint_id=?)",
        complaintId);
  }

  /** Puts back everything a job still holds, keeping each request's share separate. */
  public void returnAll(
      Map<String, Object> u, Object complaintId, Object workOrderId, String note) {
    lock(u, outstanding(workOrderId).keySet());
    for (var row :
        db.list(
            "SELECT stock_item_id,resource_id,-SUM(delta) net FROM stock_movement WHERE"
                + " work_order_id=? AND kind IN ('ISSUE','RETURN') GROUP BY"
                + " stock_item_id,resource_id HAVING -SUM(delta)>0",
            workOrderId)) {
      move(
          u,
          row.get("stock_item_id"),
          "RETURN",
          (BigDecimal) row.get("net"),
          note,
          complaintId,
          row.get("resource_id"),
          workOrderId);
      if (row.get("resource_id") != null)
        db.run(
            "UPDATE stock_reservation s SET status='ACTIVE',resolved_at=NULL WHERE s.resource_id=?"
                + " AND s.stock_item_id=? AND s.status='FULFILLED' AND EXISTS(SELECT 1 FROM"
                + " resource_request r WHERE r.id=s.resource_id AND r.status='APPROVED' AND NOT"
                + " r.handed_off)",
            row.get("resource_id"),
            row.get("stock_item_id"));
    }
  }

  /** Records one movement; a negative delta that exceeds the balance is refused. */
  public Map<String, Object> move(
      Map<String, Object> u,
      Object itemId,
      String kind,
      BigDecimal delta,
      String note,
      Object complaintId,
      Object resourceId,
      Object workOrderId) {
    var item = item(itemId, u, true);
    var balance = ((BigDecimal) item.get("on_hand")).add(delta);
    if (balance.signum() < 0)
      throw new ResponseStatusException(
          HttpStatus.CONFLICT,
          "คงคลังไม่พอ: "
              + item.get("name")
              + " เหลือ "
              + ((BigDecimal) item.get("on_hand")).stripTrailingZeros().toPlainString()
              + " "
              + item.get("unit"));
    db.run("UPDATE stock_item SET on_hand=? WHERE id=?", balance, item.get("id"));
    db.run(
        "INSERT INTO stock_movement(id,stock_item_id,municipality_id,kind,delta,balance_after,"
            + "complaint_id,resource_id,work_order_id,actor_id,note) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        UUID.randomUUID(),
        item.get("id"),
        u.get("municipality_id"),
        kind,
        delta,
        balance,
        complaintId,
        resourceId,
        workOrderId,
        u.get("id"),
        note == null ? "" : note);
    return item;
  }

  static BigDecimal positive(Object value, String message) {
    BigDecimal quantity;
    try {
      quantity = new BigDecimal(String.valueOf(value));
    } catch (NumberFormatException e) {
      throw new IllegalArgumentException(message);
    }
    if (quantity.signum() <= 0
        || quantity.scale() > 2
        || quantity.compareTo(new BigDecimal("1000000000")) > 0)
      throw new IllegalArgumentException(message);
    return quantity;
  }

  /** Items taken from stock for a job: [{stockItemId, quantity}], each item listed once. */
  static List<Map<String, Object>> lines(Object value) {
    if (value == null) return List.of();
    if (!(value instanceof List<?> list) || list.size() > 50)
      throw new IllegalArgumentException("รายการวัสดุจากคลังไม่ถูกต้อง");
    var seen = new HashSet<UUID>();
    var result = new ArrayList<Map<String, Object>>();
    for (Object entry : list) {
      if (!(entry instanceof Map<?, ?> line)) throw new IllegalArgumentException();
      UUID id = Db.id(line.get("stockItemId"));
      if (!seen.add(id))
        throw new IllegalArgumentException("เลือกวัสดุซ้ำกัน กรุณารวมเป็นรายการเดียว");
      result.add(
          Map.of(
              "stockItemId",
              id,
              "quantity",
              positive(
                  line.get("quantity"), "จำนวนวัสดุต้องมากกว่า 0 และมีทศนิยมไม่เกินสองตำแหน่ง")));
    }
    return result;
  }

  /** Net quantity per stock item issued to a work order and not yet returned. */
  public Map<UUID, BigDecimal> outstanding(Object workOrderId) {
    var result = new LinkedHashMap<UUID, BigDecimal>();
    for (var row :
        db.list(
            "SELECT stock_item_id,-SUM(delta) net FROM stock_movement WHERE work_order_id=? AND"
                + " kind IN ('ISSUE','RETURN') GROUP BY stock_item_id HAVING -SUM(delta)>0",
            workOrderId)) result.put((UUID) row.get("stock_item_id"), (BigDecimal) row.get("net"));
    return result;
  }
}
