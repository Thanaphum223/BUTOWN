import { useEffect, useState } from "react";
import {
  App,
  Alert,
  Button,
  Card,
  Form,
  Input,
  List,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import { api, post } from "./api";
type D = Record<string, any>;
export default function Teams() {
  const [teams, setTeams] = useState<D[]>([]),
    [people, setPeople] = useState<D[]>([]),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [form] = Form.useForm();
  const { message } = App.useApp();
  async function load() {
    try {
      setTeams(await api("/teams"));
      setPeople(await api("/people?role=FIELD"));
    } catch (e) {
      message.error((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <>
      <div className="page-heading">
        <div>
          <Typography.Title level={2}>ทีมลงพื้นที่</Typography.Title>
          <Typography.Text type="secondary">
            ตัวแทนทีมเป็นผู้รับงานและส่งรายงาน สมาชิกทีมดูรายละเอียดงานได้
          </Typography.Text>
        </div>
        <Button
          type="primary"
          onClick={() => {
            form.resetFields();
            setOpen(true);
          }}
        >
          สร้างทีม
        </Button>
      </div>
      <Card>
        <List
          dataSource={teams}
          locale={{ emptyText: "ยังไม่มีทีมลงพื้นที่" }}
          renderItem={(t) => (
            <List.Item
              actions={[
                <Button
                  key="retire"
                  onClick={async () => {
                    try {
                      await post("/teams/" + t.id + "/retire", {});
                      await load();
                    } catch (e) {
                      message.error((e as Error).message);
                    }
                  }}
                >
                  เลิกใช้ทีม
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={t.name}
                description={
                  <Space direction="vertical">
                    <span>ตัวแทน: {t.representative_name}</span>
                    <Space wrap>
                      {JSON.parse(t.members || "[]").map((m: D) => (
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
        title="สร้างทีมลงพื้นที่"
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
              await post("/teams", v);
              setOpen(false);
              await load();
            } catch (e) {
              message.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Form.Item
            name="name"
            label="ชื่อทีม"
            rules={[{ required: true, max: 200 }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="memberIds"
            label="สมาชิกทีม"
            rules={[{ required: true }]}
          >
            <Select
              mode="multiple"
              options={people.map((p) => ({
                value: p.id,
                label: p.display_name,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="representativeId"
            label="ตัวแทนทีม (ต้องเป็นสมาชิกที่เลือกไว้)"
            rules={[{ required: true }]}
          >
            <Select
              options={people.map((p) => ({
                value: p.id,
                label: p.display_name,
              }))}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={busy}>
            สร้างทีม
          </Button>
        </Form>
      </Modal>
    </>
  );
}
