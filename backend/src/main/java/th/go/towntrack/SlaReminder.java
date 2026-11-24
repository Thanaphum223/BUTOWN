package th.go.towntrack;

import java.util.UUID;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class SlaReminder {
  final Db db;
  final Workflow workflow;

  public SlaReminder(Db d, Workflow w) {
    db = d;
    workflow = w;
  }

  @Scheduled(fixedDelay = 60000, initialDelay = 60000)
  @Transactional
  public void remind() {
    var jobs =
        db.list(
            "SELECT DISTINCT c.id,u.id user_id FROM complaint c JOIN app_user u ON"
                + " u.id=c.officer_id OR u.id=c.leader_id OR u.id IN (SELECT w.assignee_id FROM"
                + " work_order w WHERE w.complaint_id=c.id AND w.status NOT IN"
                + " ('DECLINED','CANCELLED','COMPLETE')) WHERE c.due_at<now() AND c.status NOT IN"
                + " ('CLOSED','REJECTED','TERMINATED') AND u.enabled=true AND NOT EXISTS(SELECT 1"
                + " FROM sla_reminder s WHERE s.complaint_id=c.id AND s.user_id=u.id AND"
                + " s.reminder_type='RESOLUTION') LIMIT 100");
    for (var job : jobs)
      if (db.run(
              "INSERT INTO sla_reminder(complaint_id,user_id,reminder_type) VALUES(?,?,'RESOLUTION')"
                  + " ON CONFLICT DO NOTHING",
              job.get("id"),
              job.get("user_id"))
          == 1)
        workflow.notifyUser(
            job.get("user_id"),
            (UUID) job.get("id"),
            "คำร้องเกินระยะเวลาดำเนินการ กรุณาตรวจสอบงาน");
    remindProgress();
  }

  static final int PROGRESS_WARNING_DAYS = 12;

  void remindProgress() {
    // New activity restarts the clock, so the next quiet period may be reminded again.
    db.run(
        "DELETE FROM sla_reminder s WHERE s.reminder_type='PROGRESS' AND s.created_at<(SELECT"
            + " max(e.created_at) FROM audit_event e WHERE e.complaint_id=s.complaint_id)");
    var jobs =
        db.list(
            "SELECT DISTINCT c.id,u.id user_id FROM complaint c JOIN app_user u ON"
                + " u.id=c.officer_id OR u.id=c.leader_id WHERE c.status NOT IN"
                + " ('CLOSED','REJECTED','TERMINATED') AND u.enabled=true AND (SELECT"
                + " max(e.created_at) FROM audit_event e WHERE e.complaint_id=c.id)"
                + "<=now()-make_interval(days=>?) AND NOT EXISTS(SELECT 1 FROM sla_reminder s WHERE"
                + " s.complaint_id=c.id AND s.user_id=u.id AND s.reminder_type='PROGRESS') LIMIT 100",
            PROGRESS_WARNING_DAYS);
    for (var job : jobs)
      if (db.run(
              "INSERT INTO sla_reminder(complaint_id,user_id,reminder_type) VALUES(?,?,'PROGRESS')"
                  + " ON CONFLICT DO NOTHING",
              job.get("id"),
              job.get("user_id"))
          == 1)
        workflow.notifyUser(
            job.get("user_id"),
            (UUID) job.get("id"),
            "ใกล้ครบ 15 วันที่ต้องแจ้งความคืบหน้าให้ผู้แจ้งทราบ กรุณาอัปเดตคำร้อง");
  }
}
