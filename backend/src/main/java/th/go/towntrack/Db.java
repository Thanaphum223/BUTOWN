package th.go.towntrack;

import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class Db {
  public final JdbcTemplate jdbc;

  public Db(JdbcTemplate j) {
    jdbc = j;
  }

  public List<Map<String, Object>> list(String sql, Object... args) {
    return jdbc.queryForList(sql, args);
  }

  public Map<String, Object> one(String sql, Object... args) {
    var rows = list(sql, args);
    if (rows.isEmpty())
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "ไม่พบข้อมูลหรือไม่มีสิทธิ์");
    return rows.getFirst();
  }

  public int run(String sql, Object... args) {
    return jdbc.update(sql, args);
  }

  public static UUID id(Object value) {
    try {
      return UUID.fromString(String.valueOf(value));
    } catch (Exception e) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "รหัสข้อมูลไม่ถูกต้อง");
    }
  }
}
