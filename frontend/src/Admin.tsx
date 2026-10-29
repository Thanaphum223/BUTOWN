import { useEffect, useState } from "react";
import {
  App,
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Typography,
} from "antd";
import { api, post, roleNames } from "./api";
type D = Record<string, any>;
const { Title, Text } = Typography;
export default function Admin() {
  const [data, setData] = useState<D>(),
    [error, setError] = useState(""),
    [kind, setKind] = useState(""),
    [busy, setBusy] = useState(false);
  const [form] = Form.useForm();
  const { message } = App.useApp();
  async function load() {
    try {
      setData(await api("/admin"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(v: D) {
    setBusy(true);
    try {
      if (kind === "categories") {
        try {
          v.fields =
            typeof v.fields === "string"
              ? JSON.parse(v.fields || "[]")
              : v.fields || [];
        } catch {
          throw new Error("รูปแบบ JSON ของช่องข้อมูลไม่ถูกต้อง");
        }
      }
      await post("/admin/" + kind, v);
      message.success("บันทึกแล้ว");
      setKind("");
      await load();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const create = (k: string) => {
    form.resetFields();
    form.setFieldsValue({ slaHours: 72, approvalStages: 1, fields: [] });
    setKind(k);
  };
  if (!data)
    return error ? <Alert type="error" message={error} /> : <Card loading />;
  const departments = data.departments.map((x: D) => ({
    value: x.id,
    label: x.name,
  }));
  return (
    <>
      <div className="page-heading">
        <div>
          <Text className="eyebrow">ADMINISTRATION</Text>
          <Title level={2}>จัดการระบบ</Title>
          <Text type="secondary">{data.municipality.name}</Text>
        </div>
        <Button
          onClick={() => {
            form.resetFields();
            form.setFieldValue("name", data.municipality.name);
            setKind("municipality");
          }}
        >
          แก้ชื่อเทศบาล
        </Button>
      </div>
      <Alert
        style={{ marginBottom: 20 }}
        type="info"
        showIcon
        message="Workflow ที่เผยแพร่แล้วจะไม่ถูกแก้ทับ เปลี่ยนค่าโดยสร้างเวอร์ชันใหม่ แล้วเลือกใช้ในประเภทปัญหา คำร้องเดิมยังใช้เวอร์ชันเดิม"
      />
      <Card>
        <Tabs
          items={[
            {
              key: "users",
              label: "บัญชีผู้ใช้",
              children: (
                <>
                  <Button type="primary" onClick={() => create("users")}>
                    เพิ่มบัญชีผู้ใช้
                  </Button>
                  <Table<D>
                    style={{ marginTop: 16 }}
                    rowKey="id"
                    dataSource={data.users}
                    scroll={{ x: 700 }}
                    columns={[
                      { title: "ชื่อผู้ใช้", dataIndex: "username" },
                      { title: "ชื่อ", dataIndex: "display_name" },
                      {
                        title: "บทบาท",
                        dataIndex: "role",
                        render: (v) => roleNames[v],
                      },
                      {
                        title: "เปิดใช้งาน",
                        dataIndex: "enabled",
                        render: (v, r) => (
                          <Switch
                            checked={v}
                            onChange={async (enabled) => {
                              try {
                                await post(
                                  "/admin/users/" + r.id + "/enabled",
                                  { enabled },
                                );
                                await load();
                              } catch (e) {
                                message.error((e as Error).message);
                              }
                            }}
                          />
                        ),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: "departments",
              label: "หน่วยงาน",
              children: (
                <>
                  <Button type="primary" onClick={() => create("departments")}>
                    เพิ่มหน่วยงาน
                  </Button>
                  <Table<D>
                    rowKey="id"
                    dataSource={data.departments}
                    columns={[{ title: "ชื่อหน่วยงาน", dataIndex: "name" }]}
                  />
                </>
              ),
            },
            {
              key: "categories",
              label: "ประเภทปัญหา / แบบฟอร์ม / SLA",
              children: (
                <>
                  <Button type="primary" onClick={() => create("categories")}>
                    เพิ่มประเภทปัญหา
                  </Button>
                  <Table<D>
                    rowKey="id"
                    dataSource={data.categories}
                    scroll={{ x: 650 }}
                    columns={[
                      { title: "ประเภท", dataIndex: "name" },
                      { title: "SLA (ชั่วโมง)", dataIndex: "sla_hours" },
                      {
                        title: "เปิดใช้งาน",
                        dataIndex: "active",
                        render: (v) => (v ? "เปิด" : "ปิด"),
                      },
                      {
                        title: "",
                        render: (_, r) => (
                          <Button
                            onClick={() => {
                              form.resetFields();
                              form.setFieldsValue({
                                id: r.id,
                                name: r.name,
                                departmentId: r.department_id,
                                workflowId: r.workflow_id,
                                slaHours: r.sla_hours,
                                fields: JSON.parse(r.field_schema),
                                active: r.active,
                              });
                              setKind("categories");
                            }}
                          >
                            แก้ไข
                          </Button>
                        ),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: "workflows",
              label: "Workflow",
              children: (
                <>
                  <Button type="primary" onClick={() => create("workflows")}>
                    เผยแพร่เวอร์ชันใหม่
                  </Button>
                  <Table<D>
                    rowKey="id"
                    dataSource={data.workflows}
                    columns={[
                      { title: "เวอร์ชัน", dataIndex: "version" },
                      { title: "ชื่อ", dataIndex: "name" },
                      {
                        title: "ลำดับอนุมัติทรัพยากร",
                        dataIndex: "approval_stages",
                      },
                    ]}
                  />
                  <Alert message="เส้นทางงานยึด Flow ที่ตกลงไว้ ขณะนี้ตั้งจำนวนผู้อนุมัติทรัพยากรได้ 1–5 ลำดับ" />
                </>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        open={!!kind}
        title="ตั้งค่าระบบ"
        onCancel={() => setKind("")}
        footer={null}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item name="id" hidden>
            <Input />
          </Form.Item>
          {kind === "users" ? (
            <>
              <Form.Item
                name="username"
                label="ชื่อผู้ใช้"
                rules={[{ required: true, pattern: /^[a-zA-Z0-9._-]{4,60}$/ }]}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="displayName"
                label="ชื่อที่แสดง"
                rules={[{ required: true, max: 200 }]}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="password"
                label="รหัสผ่านเริ่มต้น (อย่างน้อย 12 ตัวอักษร)"
                rules={[{ required: true, min: 12, max: 72 }]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <Form.Item name="role" label="บทบาท" rules={[{ required: true }]}>
                <Select
                  options={Object.entries(roleNames).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="departmentId"
                label="หน่วยงาน (จำเป็นสำหรับบุคลากร)"
              >
                <Select allowClear options={departments} />
              </Form.Item>
            </>
          ) : (
            <Form.Item
              name="name"
              label="ชื่อ"
              rules={[{ required: true, max: 200 }]}
            >
              <Input />
            </Form.Item>
          )}
          {kind === "workflows" && (
            <Form.Item
              name="approvalStages"
              label="จำนวนลำดับอนุมัติทรัพยากร"
              rules={[{ required: true }]}
            >
              <InputNumber min={1} max={5} precision={0} />
            </Form.Item>
          )}
          {kind === "categories" && (
            <>
              <Form.Item
                name="departmentId"
                label="หน่วยงานรับผิดชอบ"
                rules={[{ required: true }]}
              >
                <Select options={departments} />
              </Form.Item>
              <Form.Item
                name="workflowId"
                label="Workflow"
                rules={[{ required: true }]}
              >
                <Select
                  options={data.workflows.map((w: D) => ({
                    value: w.id,
                    label:
                      "รุ่น " +
                      w.version +
                      " • " +
                      w.name +
                      " • " +
                      w.approval_stages +
                      " ลำดับอนุมัติ",
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="slaHours"
                label="SLA (ชั่วโมง)"
                rules={[{ required: true }]}
              >
                <InputNumber min={1} max={87600} precision={0} />
              </Form.Item>
              <Typography.Title level={5}>ช่องข้อมูลเพิ่มเติม</Typography.Title>
              <Form.List name="fields">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field) => (
                      <Card
                        key={field.key}
                        size="small"
                        style={{ marginBottom: 12 }}
                      >
                        <Form.Item name={[field.name, "key"]} hidden>
                          <Input />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, "label"]}
                          label="ชื่อช่องข้อมูล"
                          rules={[{ required: true, max: 200 }]}
                        >
                          <Input />
                        </Form.Item>
                        <Space>
                          <Form.Item
                            name={[field.name, "required"]}
                            label="บังคับกรอก"
                            valuePropName="checked"
                          >
                            <Switch />
                          </Form.Item>
                          <Button danger onClick={() => remove(field.name)}>
                            ลบช่องนี้
                          </Button>
                        </Space>
                      </Card>
                    ))}
                    <Button
                      block
                      onClick={() =>
                        add({
                          key: "field_" + Date.now(),
                          label: "",
                          required: false,
                        })
                      }
                    >
                      เพิ่มช่องข้อมูล
                    </Button>
                  </>
                )}
              </Form.List>
              <Form.Item
                name="active"
                label="เปิดรับคำร้อง"
                valuePropName="checked"
                initialValue={true}
              >
                <Switch />
              </Form.Item>
            </>
          )}
          <Button type="primary" htmlType="submit" loading={busy} block>
            บันทึก
          </Button>
        </Form>
      </Modal>
    </>
  );
}
