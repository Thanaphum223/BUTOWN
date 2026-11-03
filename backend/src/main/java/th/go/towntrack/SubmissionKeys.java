package th.go.towntrack;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.security.MessageDigest;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class SubmissionKeys {
  final Db db;
  final ObjectMapper json;

  SubmissionKeys(Db db, ObjectMapper json) {
    this.db = db;
    this.json = json;
  }

  String hash(Object body) throws Exception {
    return HexFormat.of()
        .formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(body)));
  }

  Object find(Object user, String operation, UUID key, String hash) throws Exception {
    if (key == null) return null;
    db.one(
        "SELECT pg_advisory_xact_lock(hashtextextended(?,0)) locked",
        user + ":" + operation + ":" + key);
    var rows =
        db.list(
            "SELECT request_hash,response FROM submission_key WHERE user_id=? AND operation=? AND request_key=?",
            user,
            operation,
            key);
    if (rows.isEmpty()) return null;
    if (!hash.equals(rows.getFirst().get("request_hash")))
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "รหัสส่งซ้ำถูกใช้กับข้อมูลคนละชุด กรุณาเริ่มรายการใหม่");
    return json.readValue(rows.getFirst().get("response").toString(), Object.class);
  }

  void save(Object user, String operation, UUID key, String hash, Object response)
      throws Exception {
    if (key != null)
      db.run(
          "INSERT INTO submission_key(user_id,operation,request_key,request_hash,response) VALUES(?,?,?,?,?::jsonb)",
          user,
          operation,
          key,
          hash,
          json.writeValueAsString(response));
  }
}
