import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { UserOutlined } from "@ant-design/icons";
import { api } from "./api";
import GovLogin from "./GovLogin";

type GovProfileData = {
  linked: boolean;
  profile?: { id: string; name?: string; email?: string; last_sso_at?: string };
  residences: {
    residenceId: string;
    address?: string;
    memberStatus: string;
    residenceStatus: string;
    canUseForOfficialTransaction: boolean;
  }[];
};

export default function GovProfile() {
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
      <Tooltip title="ข้อมูล Gov Center">
        <Button
          aria-label="ข้อมูล Gov Center"
          icon={<UserOutlined />}
          onClick={() => void load()}
        />
      </Tooltip>
      <Drawer title="ข้อมูล Gov Center" width={480} open={open} onClose={() => setOpen(false)}>
        {busy && <Spin aria-label="กำลังโหลดข้อมูลบัญชี" />}
        {error && (
          <Space direction="vertical">
            <Alert type="error" showIcon message={error} />
            <Button onClick={() => void load()}>ลองอีกครั้ง</Button>
          </Space>
        )}
        {data && !data.linked && (
          <Space direction="vertical" style={{ width: "100%" }}>
            <Alert
              type="info"
              showIcon
              message="ยังไม่ได้เชื่อมบัญชี Gov Center"
              description="เชื่อมกับบัญชีปัจจุบันเพื่อใช้ข้อมูลผู้ใช้จาก Gov Center โดยคงสิทธิ์ของบัญชี TownTrack เดิม"
            />
            <GovLogin link />
          </Space>
        )}
        {data?.linked && (
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <Descriptions
              column={1}
              title="ข้อมูลผู้ใช้"
              items={[
                {
                  key: "name",
                  label: "ชื่อจาก Gov Center",
                  children: data.profile?.name || "ไม่ระบุ",
                },
                { key: "email", label: "อีเมล", children: data.profile?.email || "ไม่ระบุ" },
                {
                  key: "synced",
                  label: "อัปเดตล่าสุด",
                  children: data.profile?.last_sso_at
                    ? new Date(data.profile.last_sso_at).toLocaleString("th-TH", {
                        timeZone: "Asia/Bangkok",
                      })
                    : "—",
                },
              ]}
            />
            <div>
              <Typography.Title level={5}>บ้านที่เชื่อมกับบัญชี</Typography.Title>
              {!data.residences.length && (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="ไม่มีข้อมูลบ้านที่เชื่อมไว้ หรือบริการยังไม่ได้รับสิทธิ์อ่านข้อมูลบ้าน"
                />
              )}
              <Space direction="vertical" style={{ width: "100%" }}>
                {data.residences.map((home) => (
                  <Card key={home.residenceId} size="small">
                    <Typography.Paragraph>{home.address || "ไม่ระบุที่อยู่"}</Typography.Paragraph>
                    <Tag color={home.canUseForOfficialTransaction ? "green" : "orange"}>
                      {home.canUseForOfficialTransaction
                        ? "ยืนยันข้อมูลแล้ว"
                        : "ยังไม่ผ่านการยืนยันครบถ้วน"}
                    </Tag>
                  </Card>
                ))}
              </Space>
            </div>
            <Typography.Text type="secondary">
              ข้อมูลอัปเดตเมื่อเข้าสู่ระบบผ่าน Gov Center ครั้งล่าสุด สิทธิ์ทำงานกำหนดโดยผู้ดูแล
              TownTrack
            </Typography.Text>
          </Space>
        )}
      </Drawer>
    </>
  );
}
