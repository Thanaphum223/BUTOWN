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
