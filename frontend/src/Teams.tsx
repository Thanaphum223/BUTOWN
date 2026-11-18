import { useLocalizedFormErrors } from "./i18n/useLocalizedFormErrors";
import { useI18n } from "./i18n/useI18n";
import { useEffect, useState } from "react";
import { App, Button, Card, Form, Input, List, Modal, Space, Tag, Typography } from "antd";
import { api, post } from "./api";
import MemberPicker from "./MemberPicker";
type D = Record<string, any>;
const members = (team: D): D[] => {
  try {
    return JSON.parse(team.members || "[]");
  } catch {
    return [];
  }
};
export default function Teams() {
  const { t } = useI18n();
  const [teams, setTeams] = useState<D[]>([]),
    [people, setPeople] = useState<D[]>([]),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    // The team being edited; undefined while creating a new one.
    [editing, setEditing] = useState<D>(),
    // Until the leader types a name, it follows the representative ("ทีม<name>").
    [nameTouched, setNameTouched] = useState(false);
  const [form] = Form.useForm();
  const representativeId: string | undefined = Form.useWatch("representativeId", form);
  function chooseRepresentative(id: string | undefined) {
    form.setFieldValue("representativeId", id);
    const person = people.find((p) => p.id === id);
    if (!nameTouched && !editing)
      form.setFieldValue("name", person ? t("ทีม{{name}}", { name: person.display_name }) : "");
  }
  function openEditor(team?: D) {
    form.resetFields();
    setEditing(team);
    setNameTouched(!!team);
    if (team)
      form.setFieldsValue({
        name: team.name,
        memberIds: members(team).map((m) => m.id),
        representativeId: team.representative_id,
      });
    setOpen(true);
  }
  useLocalizedFormErrors(form);
  const { message } = App.useApp();
  async function load() {
    try {
      setTeams(await api("/teams"));
      setPeople(await api("/people?role=FIELD"));
    } catch (e) {
      message.error(t((e as Error).message));
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <>
      <div className="page-heading">
        <div>
          <Typography.Title level={2}>{t("ทีมลงพื้นที่")}</Typography.Title>
          <Typography.Text type="secondary">
            {t("ตัวแทนทีมเป็นผู้รับงานและส่งรายงาน สมาชิกทีมดูรายละเอียดงานได้")}
          </Typography.Text>
        </div>
        <Button type="primary" onClick={() => openEditor()}>
          {t("สร้างทีม")}
        </Button>
      </div>
      <Card>
        <List
          dataSource={teams}
          locale={{ emptyText: t("ยังไม่มีทีมลงพื้นที่") }}
          renderItem={(team) => (
            <List.Item
              actions={[
                <Button key="edit" onClick={() => openEditor(team)}>
                  {t("แก้ไขทีม")}
                </Button>,
                <Button
                  key="retire"
                  onClick={async () => {
                    try {
                      await post("/teams/" + team.id + "/retire", {});
                      await load();
                    } catch (e) {
                      message.error(t((e as Error).message));
                    }
                  }}
                >
                  {t("เลิกใช้ทีม")}
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={team.name}
                description={
                  <Space direction="vertical">
                    <span>
                      {t("ตัวแทน:")}
                      {team.representative_name}
                    </span>
                    <Space wrap>
                      {members(team).map((m: D) => (
                        <Tag key={m.id}>{m.name}</Tag>
                      ))}
                    </Space>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Card>
      <Modal
        className="team-editor"
        width={720}
        title={editing ? t("แก้ไขทีมลงพื้นที่") : t("สร้างทีมลงพื้นที่")}
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (v) => {
            setBusy(true);
            try {
              if (editing)
                await api("/teams/" + editing.id, { method: "PUT", body: JSON.stringify(v) });
              else await post("/teams", v);
              setOpen(false);
              await load();
            } catch (e) {
              message.error(t((e as Error).message));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Form.Item
            name="memberIds"
            label={t("สมาชิกทีม")}
            rules={[{ required: true, message: t("กรุณาเลือกสมาชิกทีมอย่างน้อย 1 คน") }]}
          >
            <MemberPicker
              people={people}
              teams={teams.filter((team) => team.id !== editing?.id)}
              representative={representativeId}
              onRepresentativeChange={chooseRepresentative}
            />
          </Form.Item>
          <Form.Item name="representativeId" hidden rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name" label={t("ชื่อทีม")} rules={[{ required: true, max: 200 }]}>
            <Input onChange={() => setNameTouched(true)} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={busy}>
            {editing ? t("บันทึกทีม") : t("สร้างทีม")}
          </Button>
        </Form>
      </Modal>
    </>
  );
}
