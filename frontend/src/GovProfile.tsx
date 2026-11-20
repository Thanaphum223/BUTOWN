import { useI18n } from "./i18n/useI18n";
import { useState } from "react";
import { Alert, Button, Descriptions, Drawer, Space, Spin, Tooltip } from "antd";
import { UserOutlined } from "./icons";
import { api, date } from "./api";
import GovLogin from "./GovLogin";

type GovProfileData = {
  linked: boolean;
  profile?: { id: string; name?: string; email?: string; last_sso_at?: string };
};

export default function GovProfile() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [data, setData] = useState<GovProfileData>(),
    [error, setError] = useState("");
  async function load() {
    setOpen(true);
    setBusy(true);
    setError("");
    setData(undefined);
    try {
      setData(await api<GovProfileData>("/auth/gov-profile"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Tooltip title={t("ข้อมูล Gov Center")}>
        <Button
          aria-label={t("ข้อมูล Gov Center")}
          icon={<UserOutlined />}
          onClick={() => void load()}
        />
      </Tooltip>
      <Drawer title={t("ข้อมูล Gov Center")} width={480} open={open} onClose={() => setOpen(false)}>
        {busy && <Spin aria-label={t("กำลังโหลดข้อมูลบัญชี")} />}
        {error && (
          <Space direction="vertical">
            <Alert type="error" showIcon message={t(error)} />
            <Button onClick={() => void load()}>{t("ลองอีกครั้ง")}</Button>
          </Space>
        )}
        {data && !data.linked && (
          <Space direction="vertical" style={{ width: "100%" }}>
            <Alert
              type="info"
              showIcon
              message={t("ยังไม่ได้เชื่อมบัญชี Gov Center")}
              description={t(
                "เชื่อมกับบัญชีปัจจุบันเพื่อใช้ข้อมูลผู้ใช้จาก Gov Center โดยคงสิทธิ์ของบัญชี TownTrack เดิม",
              )}
            />
            <GovLogin link />
          </Space>
        )}
        {data?.linked && (
          <Descriptions
            column={1}
            title={t("ข้อมูลผู้ใช้")}
            items={[
              {
                key: "name",
                label: t("ชื่อจาก Gov Center"),
                children: data.profile?.name || t("ไม่ระบุ"),
              },
              { key: "email", label: t("อีเมล"), children: data.profile?.email || t("ไม่ระบุ") },
              {
                key: "synced",
                label: t("อัปเดตล่าสุด"),
                children: data.profile?.last_sso_at ? date(data.profile.last_sso_at) : "—",
              },
            ]}
          />
        )}
      </Drawer>
    </>
  );
}
