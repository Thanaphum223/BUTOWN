import { Alert } from "antd";
type D = Record<string, any>;
export default function CitizenOutcome({ status, history }: { status: string; history: D[] }) {
  if (!["CLOSED", "REJECTED", "TERMINATED"].includes(status)) return null;
  const action = status === "CLOSED" ? "CLOSE" : status === "REJECTED" ? "REJECT" : "DENY";
  const decision = [...history]
    .reverse()
    .find(
      (h) =>
        h.action === action &&
        h.to_status === status &&
        typeof h.reason === "string" &&
        h.reason.trim(),
    );
  return (
    <Alert
      className="citizen-outcome"
      showIcon
      type={status === "CLOSED" ? "success" : "error"}
      message={
        status === "CLOSED"
          ? "ผลการดำเนินงาน"
          : status === "REJECTED"
            ? "เหตุผลที่ไม่รับเรื่อง"
            : "เหตุผลที่ไม่อนุมัติและยุติเรื่อง"
      }
      description={
        <div className="citizen-outcome-reason">
          {decision?.reason || "ไม่มีเหตุผลบันทึกไว้ในระบบ"}
        </div>
      }
    />
  );
}
