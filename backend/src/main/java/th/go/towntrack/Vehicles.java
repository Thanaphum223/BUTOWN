package th.go.towntrack;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * Municipal vehicles (Ministry of Interior regulation on local government vehicles B.E. 2548,
 * amended B.E. 2563). A vehicle is equipment with a licence plate: it goes out on a written request
 * (form 3) and every trip is logged with its odometer readings (form 4).
 */
@Component
public class Vehicles {
  static final ZoneId BANGKOK = ZoneId.of("Asia/Bangkok");
  static final BigDecimal MAX_ODOMETER = new BigDecimal("9999999.9");
  static final String FORM_3 =
      "กรุณากรอกใบขออนุญาตใช้รถ (แบบ 3) ให้ครบ ได้แก่ สถานที่ไป วัตถุประสงค์ ผู้ขับ จำนวนผู้โดยสาร และช่วงเวลาใช้รถ";
  static final String PERIOD =
      "ช่วงเวลาใช้รถไม่ถูกต้อง เวลากลับต้องหลังเวลาออก และเริ่มใช้ได้ไม่เกิน 1 ปีข้างหน้า";

  final Db db;
  final ObjectMapper json;

  public Vehicles(Db db, ObjectMapper json) {
    this.db = db;
    this.json = json;
  }

  boolean anyVehicle(Collection<?> stockItemIds) {
    for (Object item : stockItemIds)
      if (item != null
          && !db.list(
                  "SELECT 1 FROM stock_item WHERE id=? AND vehicle_plate IS NOT NULL", Db.id(item))
              .isEmpty()) return true;
    return false;
  }

  /**
   * Form 3 for a resource request, as JSON, or null when no vehicle is asked for. Use within the
   * municipality's own area needs no form when the municipality has waived it.
   */
  String useRequest(Map<String, Object> b, Collection<?> stockItemIds, Map<String, Object> u) {
    if (!anyVehicle(stockItemIds)) return null;
    if (!(b.get("vehicleUse") instanceof Map<?, ?> raw))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, FORM_3);
    boolean local = Boolean.TRUE.equals(raw.get("local"));
    var use = new LinkedHashMap<String, Object>();
    use.put("local", local);
    boolean waived =
        local
            && Boolean.TRUE.equals(
                db.one(
                        "SELECT vehicle_local_exempt FROM municipality WHERE id=?",
                        u.get("municipality_id"))
                    .get("vehicle_local_exempt"));
    if (waived) {
      use.put("waived", true);
    } else {
      use.put("destination", required(raw, "destination", 300));
      use.put("purpose", required(raw, "purpose", 500));
      use.put("driverName", required(raw, "driverName", 200));
      if (!(raw.get("passengers") instanceof Number n)
          || n.doubleValue() != Math.rint(n.doubleValue())
          || n.intValue() < 1
          || n.intValue() > 100) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, FORM_3);
      use.put("passengers", n.intValue());
      LocalDateTime start = time(raw.get("startAt")), end = time(raw.get("endAt"));
      var now = LocalDateTime.now(BANGKOK);
      if (!end.isAfter(start)
          || start.isBefore(now.toLocalDate().atStartOfDay())
          || start.isAfter(now.plusYears(1)))
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, PERIOD);
      use.put("startAt", start.toString());
      use.put("endAt", end.toString());
    }
    try {
      return json.writeValueAsString(use);
    } catch (JsonProcessingException e) {
      throw new IllegalStateException(e);
    }
  }

  static String required(Map<?, ?> raw, String key, int max) {
    if (!(raw.get(key) instanceof String text) || text.isBlank() || text.strip().length() > max)
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, FORM_3);
    return text.strip();
  }

  static LocalDateTime time(Object value) {
    try {
      return LocalDateTime.parse(String.valueOf(value));
    } catch (DateTimeParseException e) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, PERIOD);
    }
  }

  /** Odometer readings sent with START or REPORT: [{stockItemId, odometer}]. */
  static Map<UUID, BigDecimal> readings(Object value) {
    var result = new HashMap<UUID, BigDecimal>();
    if (value == null) return result;
    if (!(value instanceof List<?> list) || list.size() > 50) throw new IllegalArgumentException();
    for (Object entry : list) {
      if (!(entry instanceof Map<?, ?> line)) throw new IllegalArgumentException();
      BigDecimal odometer;
      try {
        odometer = new BigDecimal(String.valueOf(line.get("odometer")));
      } catch (NumberFormatException e) {
        throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST, "กรุณาระบุเลขไมล์เป็นตัวเลข ทศนิยมไม่เกิน 1 ตำแหน่ง");
      }
      if (odometer.signum() < 0 || odometer.scale() > 1 || odometer.compareTo(MAX_ODOMETER) > 0)
        throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST, "กรุณาระบุเลขไมล์เป็นตัวเลข ทศนิยมไม่เกิน 1 ตำแหน่ง");
      result.put(Db.id(line.get("stockItemId")), odometer);
    }
    return result;
  }

  /** Approved vehicles leave on the start of a job, each with its odometer reading (form 4). */
  void depart(
      Map<String, Object> u,
      Object resourceId,
      Object complaintId,
      Object workOrderId,
      Collection<UUID> approved,
      Object odometers) {
    var readings = readings(odometers);
    for (UUID item : approved) {
      var vehicle =
          db.list(
              "SELECT name,vehicle_plate,(SELECT odometer_in FROM vehicle_trip WHERE"
                  + " stock_item_id=i.id AND arrived_at IS NOT NULL ORDER BY arrived_at DESC LIMIT"
                  + " 1) last FROM stock_item i WHERE id=? AND vehicle_plate IS NOT NULL",
              item);
      if (vehicle.isEmpty()) continue;
      var reading = readings.get(item);
      if (reading == null)
        throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "กรุณาบันทึกเลขไมล์ก่อนออกเดินทางของรถ " + vehicle.getFirst().get("vehicle_plate"));
      var last = (BigDecimal) vehicle.getFirst().get("last");
      if (last != null && reading.compareTo(last) < 0)
        throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "เลขไมล์ออกต้องไม่น้อยกว่าเลขไมล์กลับของเที่ยวก่อน ("
                + last.stripTrailingZeros().toPlainString()
                + ")");
      db.run(
          "INSERT INTO vehicle_trip(id,municipality_id,stock_item_id,complaint_id,resource_id,"
              + "work_order_id,user_id,driver_name,destination,purpose,local_use,odometer_out)"
              + " SELECT ?,?,?,?,r.id,?,?,COALESCE(r.vehicle_use->>'driverName',''),"
              + "COALESCE(r.vehicle_use->>'destination',''),COALESCE(r.vehicle_use->>'purpose',"
              + "r.necessity,''),COALESCE((r.vehicle_use->>'local')::boolean,false),? FROM"
              + " resource_request r WHERE r.id=?",
          UUID.randomUUID(),
          u.get("municipality_id"),
          item,
          complaintId,
          workOrderId,
          u.get("id"),
          reading,
          resourceId);
    }
  }

  /** The team reports the odometer reading for each vehicle trip still open on the job. */
  void arrive(Object workOrderId, Object odometers) {
    var readings = readings(odometers);
    for (var trip :
        db.list(
            "SELECT t.id,t.stock_item_id,t.odometer_out,i.vehicle_plate FROM vehicle_trip t JOIN"
                + " stock_item i ON i.id=t.stock_item_id WHERE t.work_order_id=? AND t.arrived_at"
                + " IS NULL AND t.cancelled_at IS NULL FOR UPDATE OF t",
            workOrderId)) {
      var reading = readings.get((UUID) trip.get("stock_item_id"));
      var out = (BigDecimal) trip.get("odometer_out");
      if (reading == null || reading.compareTo(out) < 0)
        throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "กรุณาบันทึกเลขไมล์กลับของรถ "
                + trip.get("vehicle_plate")
                + " ไม่น้อยกว่าเลขไมล์ออก ("
                + out.stripTrailingZeros().toPlainString()
                + ")");
      db.run(
          "UPDATE vehicle_trip SET arrived_at=now(),odometer_in=? WHERE id=?",
          reading,
          trip.get("id"));
    }
  }

  /** Undoing the start of a job means the vehicles never left. */
  void cancel(Object workOrderId) {
    db.run(
        "UPDATE vehicle_trip SET cancelled_at=now() WHERE work_order_id=? AND arrived_at IS NULL"
            + " AND cancelled_at IS NULL",
        workOrderId);
  }
}
