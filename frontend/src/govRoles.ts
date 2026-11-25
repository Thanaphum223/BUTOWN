import { roleNames } from "./api";

type Translate = (key: string, params?: Record<string, string | number>) => string;

export const govRoleNames: Record<string, string> = {
  MAYOR: "นายกเทศมนตรี",
  DEPUTY_MAYOR: "รองนายกเทศมนตรี",
  MUNICIPAL_CLERK: "ปลัดเทศบาล",
  DEPUTY_CLERK: "รองปลัดเทศบาล",
  FINANCE_DIRECTOR: "ผู้อำนวยการกองคลัง",
  SUPPLY_HEAD: "หัวหน้าเจ้าหน้าที่พัสดุ",
  CENTRAL_OFFICER: "เจ้าหน้าที่สำนักปลัดเทศบาล",
  SARABAN_OFFICER: "เจ้าหน้าที่สารบรรณ / ศูนย์รับเรื่อง",
  ENG_DIRECTOR: "ผู้อำนวยการกองช่าง",
  DEPT_HEAD: "ผู้อำนวยการกอง / หัวหน้าฝ่าย",
  ENG_HEAD: "หัวหน้าฝ่ายโยธา",
  HEALTH_HEAD: "ผู้อำนวยการกองสาธารณสุขฯ",
  ENG_FIELD: "นายช่าง / ผู้ปฏิบัติงานกองช่าง",
  HEALTH_FIELD: "เจ้าหน้าที่ภาคสนามกองสาธารณสุขฯ",
  FIELD_TECH: "นายช่าง / ผู้ลงพื้นที่",
  IT_ADMIN: "นักวิชาการคอมพิวเตอร์",
};
export const govRolesByRole: Record<string, string[]> = {
  APPROVER: [
    "MAYOR",
    "DEPUTY_MAYOR",
    "MUNICIPAL_CLERK",
    "DEPUTY_CLERK",
    "FINANCE_DIRECTOR",
    "SUPPLY_HEAD",
  ],
  OFFICER: ["CENTRAL_OFFICER", "SARABAN_OFFICER"],
  LEADER: ["ENG_DIRECTOR", "DEPT_HEAD", "ENG_HEAD", "HEALTH_HEAD"],
  FIELD: ["ENG_FIELD", "HEALTH_FIELD", "FIELD_TECH"],
  ADMIN: ["IT_ADMIN"],
};
// Must match the server's final-approval limit in Workflow.checkApprovalAuthority.
export const APPROVAL_LIMIT = 500_000;
export const SPECIFIC_METHOD_LIMIT = 50_000_000;
export const limitedApprover = (govRole?: string | null) =>
  ["FINANCE_DIRECTOR", "SUPPLY_HEAD"].includes(govRole || "");

// Must match the server's StaffPlacementController.placeable.
export function canPlaceStaff(user: Record<string, any>) {
  return (
    (user.role === "LEADER" && !!user.department_id) ||
    (user.role === "APPROVER" && ["MAYOR", "MUNICIPAL_CLERK"].includes(user.gov_role))
  );
}

const systemCodes = ["USER", "MEMBER", ...Object.keys(roleNames)];

/** The official position, or "" when the account only carries a TownTrack role. */
export function govTitle(govRole: string | null | undefined, t: Translate) {
  if (!govRole || systemCodes.includes(govRole)) return "";
  return t(govRoleNames[govRole] || govRole);
}
export function formatRoleTitle(role: string, govRole: string | null | undefined, t: Translate) {
  const title = govTitle(govRole, t);
  const name = t(roleNames[role] || role);
  return title ? `${title} (${name})` : name;
}
export function withTitle(
  name: string | null | undefined,
  govRole: string | null | undefined,
  t: Translate,
) {
  const title = govTitle(govRole, t);
  return name && title ? `${name} — ${title}` : name || "";
}
/** Position with its final-approval limit, for choosing people. */
export function govTitleWithLimit(govRole: string | null | undefined, t: Translate) {
  const title = govTitle(govRole, t);
  return title && limitedApprover(govRole)
    ? t("{{title}} (อนุมัติได้ ≤ 500,000 บาท)", { title })
    : title;
}
