package th.go.towntrack;

import java.util.*;
import org.springframework.stereotype.Component;

@Component
public class RoleQueues {
  record Group(String value, String label, List<String> statuses) {}

  List<Group> groups(String role) {
    return switch (role) {
      case "OFFICER" ->
          List.of(
              new Group("intake", "รอรับเรื่อง", List.of("NEW")),
              new Group(
                  "handoff",
                  "ส่งต่อ / จ่ายงานใหม่",
                  List.of("DEPARTMENT_RETURNED", "TRANSFER_PENDING")),
              new Group("resources", "ตรวจคำขอทรัพยากร", List.of("RESOURCE_CHECK")),
              new Group(
                  "reports", "ตรวจรายงาน / ปิดเรื่อง", List.of("OFFICER_REVIEW", "RESOLVED")));
      case "LEADER" ->
          List.of(
              new Group("dispatch", "รอจัดทีม", List.of("TRIAGED")),
              new Group(
                  "resources",
                  "จัดทำ / แก้ไขข้อเสนอ",
                  List.of("RESOURCE_DRAFT", "RESOURCE_REVISION")),
              new Group(
                  "reports", "ตรวจ / แก้ไขรายงาน", List.of("LEADER_REVIEW", "LEADER_REVISION")));
      case "FIELD" ->
          List.of(
              new Group("accept", "รอรับงาน", List.of("ASSIGNED")),
              new Group("start", "รอเริ่มงาน", List.of("ACCEPTED", "READY")),
              new Group(
                  "work", "ปฏิบัติงาน / แก้ไขรายงาน", List.of("IN_PROGRESS", "FIELD_REVISION")));
      case "APPROVER" ->
          List.of(new Group("decisions", "รอพิจารณาทรัพยากร", List.of("RESOURCE_APPROVAL")));
      case "ADMIN" ->
          List.of(
              new Group(
                  "intake",
                  "รับเรื่อง / จัดทีม",
                  List.of("NEW", "TRIAGED", "DEPARTMENT_RETURNED", "TRANSFER_PENDING")),
              new Group(
                  "resources",
                  "ทรัพยากร",
                  List.of(
                      "RESOURCE_DRAFT",
                      "RESOURCE_REVISION",
                      "RESOURCE_CHECK",
                      "RESOURCE_APPROVAL")),
              new Group(
                  "field",
                  "งานลงพื้นที่",
                  List.of("ASSIGNED", "ACCEPTED", "READY", "IN_PROGRESS", "FIELD_REVISION")),
              new Group(
                  "reports",
                  "ตรวจรายงาน / ปิดเรื่อง",
                  List.of("LEADER_REVIEW", "LEADER_REVISION", "OFFICER_REVIEW", "RESOLVED")));
      default -> List.of();
    };
  }

  List<Map<String, String>> options(String role) {
    return groups(role).stream().map(g -> Map.of("value", g.value, "label", g.label)).toList();
  }

  String predicate(String role, String queue) {
    var states = statuses(role, queue);
    String statuses =
        "c.status IN ("
            + String.join(",", states.stream().map(state -> "'" + state + "'").toList())
            + ")";
    return "OFFICER".equals(role) && "handoff".equals(queue)
        ? "(" + statuses + " OR " + WorkflowPolicy.RECOVERABLE_ASSIGNMENT + ")"
        : statuses;
  }

  String actionable(String role) {
    if (List.of("ADMIN", "CITIZEN").contains(role)) return "true";
    return "("
        + String.join(
            " OR ", groups(role).stream().map(group -> predicate(role, group.value())).toList())
        + ")";
  }

  List<String> statuses(String role, String queue) {
    return groups(role).stream()
        .filter(g -> g.value.equals(queue))
        .findFirst()
        .orElseThrow(() -> new IllegalArgumentException("ตัวกรองไม่ตรงกับบทบาทปัจจุบัน"))
        .statuses;
  }
}
