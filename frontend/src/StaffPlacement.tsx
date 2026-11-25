import { useState } from "react";
import { Alert, App, Button, Card, List, Select, Space, Typography } from "antd";
import { date, post } from "./api";
import { formatRoleTitle } from "./govRoles";
import { useI18n } from "./i18n/useI18n";
import { useLiveQuery } from "./useLiveQuery";

type Waiting = {
  role: "FIELD" | "LEADER";
  people: {
    id: string;
    display_name: string;
    role: string;
    gov_role: string | null;
    created_at: string;
  }[];
  departments: { id: string; name: string }[];
};

export default function StaffPlacement() {
  const { t } = useI18n();
  const { message } = App.useApp();
  const { data, error, loading, reload } = useLiveQuery<Waiting>("/staff-placement");
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const own = data?.role === "FIELD" ? data.departments[0] : undefined;

  async function place(id: string, departmentId: string) {
    setBusy(id);
    try {
      await post(`/staff-placement/${id}`, { departmentId });
      message.success(t("กำหนดกองแล้ว"));
    } catch (e) {
      message.error(t((e as Error).message));
    } finally {
      await reload();
      setBusy("");
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <Typography.Title level={2}>{t("รอกำหนดกอง")}</Typography.Title>
          <Typography.Text type="secondary">
            {data?.role === "FIELD"
              ? t("รับผู้ลงพื้นที่เข้ากองของคุณ: {{name}}", { name: own?.name || "" })
              : t("เลือกกองให้หัวหน้าผู้ลงพื้นที่ที่เข้าสู่ระบบครั้งแรก")}
          </Typography.Text>
        </div>
      </div>
      {error && <Alert type="error" showIcon message={t(error)} style={{ marginBottom: 16 }} />}
      <Card loading={loading && !data && !error}>
        <List
          dataSource={data?.people || []}
          locale={{ emptyText: t("ไม่มีผู้รอกำหนดกอง") }}
          renderItem={(person) => {
            const department = own?.id || chosen[person.id];
            return (
              <List.Item>
                <Space wrap style={{ width: "100%", justifyContent: "space-between" }}>
                  <List.Item.Meta
                    title={person.display_name}
                    description={
                      formatRoleTitle(person.role, person.gov_role, t) +
                      " • " +
                      date(person.created_at)
                    }
                  />
                  <Space wrap>
                    {data?.role === "LEADER" && (
                      <Select
                        aria-label={t("เลือกกองให้ {{name}}", { name: person.display_name })}
                        placeholder={t("เลือกหน่วยงาน")}
                        style={{ minWidth: 200 }}
                        value={chosen[person.id]}
                        onChange={(value) =>
                          setChosen((previous) => ({ ...previous, [person.id]: value }))
                        }
                        options={data.departments.map((d) => ({ value: d.id, label: d.name }))}
                      />
                    )}
                    <Button
                      type="primary"
                      disabled={!department || (!!busy && busy !== person.id)}
                      loading={busy === person.id}
                      onClick={() => void place(person.id, department)}
                    >
                      {own ? t("รับเข้ากอง") : t("กำหนดกอง")}
                    </Button>
                  </Space>
                </Space>
              </List.Item>
            );
          }}
        />
      </Card>
    </>
  );
}
