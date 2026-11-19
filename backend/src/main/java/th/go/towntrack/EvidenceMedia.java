package th.go.towntrack;

import java.util.*;
import org.springframework.stereotype.Service;

@Service
public class EvidenceMedia {
  final Db db;

  EvidenceMedia(Db db) {
    this.db = db;
  }

  // Citizens see their own files, officer-approved public copies, and every photo or video the
  // reporter attached or field staff took before/after the work. An original is hidden once an
  // approved public copy replaces it.
  static final String CITIZEN_VISIBLE =
      " (a.uploaded_by=? OR (a.public_approved AND (a.public_copy_of IS NOT NULL OR c.external_id"
          + " LIKE 'mock-community-v1:%')) OR ((a.content_type LIKE 'image/%' OR a.content_type"
          + " LIKE 'video/%') AND a.public_copy_of IS NULL AND (a.uploaded_by=c.reporter_id OR"
          + " a.evidence_stage IN ('BEFORE','AFTER')) AND NOT EXISTS(SELECT 1 FROM attachment p"
          + " WHERE p.public_copy_of=a.id AND p.public_approved)))";

  public List<Map<String, Object>> visible(UUID complaint, Map<String, Object> user) {
    return db.list(
        "SELECT a.id,a.original_name,a.content_type,a.size_bytes,a.evidence_stage,"
            + "a.public_approved,a.thumbnail_key IS NOT NULL has_thumbnail"
            + " FROM attachment a JOIN complaint c ON c.id=a.complaint_id"
            + " WHERE c.id=? AND c.municipality_id=? AND"
            + CITIZEN_VISIBLE
            + " AND (a.content_type LIKE 'image/%' OR a.content_type LIKE 'video/%' OR"
            + " a.content_type='application/pdf') ORDER BY a.created_at,a.id",
        complaint,
        user.get("municipality_id"),
        user.get("id"));
  }

  public boolean citizenCanView(UUID attachment, Map<String, Object> user) {
    var rows =
        db.list(
            "SELECT a.id FROM attachment a JOIN complaint c ON c.id=a.complaint_id WHERE a.id=? AND"
                + " c.municipality_id=? AND"
                + CITIZEN_VISIBLE,
            attachment,
            user.get("municipality_id"),
            user.get("id"));
    return !rows.isEmpty();
  }

  public void decorate(List<Map<String, Object>> items, Map<String, Object> user) {
    for (var item : items) {
      var media = visible((UUID) item.get("id"), user);
      item.put("media_count", media.size());
      item.put("cover", media.isEmpty() ? null : media.getFirst());
    }
  }
}
