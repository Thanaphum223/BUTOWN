import { useRef, useState } from "react";
import { Alert, App, Button, Form, Modal, Select, Space, Table, Typography } from "antd";
import { ReloadOutlined, UserAddOutlined } from "@ant-design/icons";
import { post, roleNames } from "./api";

type Department = { id: string; name: string };
type Person = {
  id: string;
  username: string;
  display_name: string;
  role: string;
  department_id: string | null;
  enabled: boolean;
};
type Assignment = { department: Department; role: "LEADER" | "APPROVER" };

export default function DepartmentPeople({
  departments,
  users,
  refreshing,
  onRefresh,
}: {
  departments: Department[];
  users: Person[];
  refreshing: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [assignment, setAssignment] = useState<Assignment>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const [form] = Form.useForm<{ userId: string }>();
  const selectedId = Form.useWatch("userId", form);
  const selected = users.find((user) => user.id === selectedId);
  const { message } = App.useApp();
  const candidates = users.filter(
    (user) =>
      user.enabled &&
      user.role !== "ADMIN" &&
      !(user.role === assignment?.role && user.department_id === assignment.department.id),
  );

  function open(department: Department, role: Assignment["role"]) {
    form.resetFields();
    setError("");
    setAssignment({ department, role });
    void onRefresh();
  }
  async function save({ userId }: { userId: string }) {
    if (submitting.current || !assignment) return;
    if (!candidates.some((user) => user.id === userId)) {
      setError("บัญชีนี้ไม่อยู่ในรายชื่อที่เลือกได้ กรุณาเลือกบัญชีใหม่");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await post(`/admin/users/${userId}/role`, {
        role: assignment.role,
        departmentId: assignment.department.id,
      });
      await onRefresh();
      setAssignment(undefined);
      message.success("บันทึกแล้ว ให้ผู้ใช้เข้าสู่ระบบใหม่เพื่อเริ่มใช้บทบาทนี้");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  function roster(department: Department, role: Assignment["role"]) {
    const people = users.filter(
      (user) => user.enabled && user.department_id === department.id && user.role === role,
    );
    return people.length ? (
      <Space direction="vertical" size={4}>
        {people.map((user) => (
          <Typography.Text key={user.id}>{user.display_name}</Typography.Text>
        ))}
      </Space>
    ) : (
      <Typography.Text type="secondary">ยังไม่ได้กำหนด</Typography.Text>
    );
  }
  return (
    <>
      <Space wrap style={{ display: "flex", margin: "12px 0" }}>
        <Typography.Text type="secondary">
          เลือกบัญชีที่เคยเข้าสู่ระบบผ่าน Gov Center เพื่อเพิ่มหัวหน้าหรือผู้อนุมัติประจำหน่วยงาน
        </Typography.Text>
        <Button icon={<ReloadOutlined />} loading={refreshing} onClick={() => void onRefresh()}>
          โหลดรายชื่อใหม่
        </Button>
      </Space>
      <Table<Department>
        rowKey="id"
        dataSource={departments}
        scroll={{ x: 850 }}
        columns={[
          { title: "ชื่อหน่วยงาน", dataIndex: "name", width: 180 },
          { title: "หัวหน้าทีมลงพื้นที่", render: (_, department) => roster(department, "LEADER") },
          { title: "ผู้อนุมัติ", render: (_, department) => roster(department, "APPROVER") },
          {
            title: "จัดการ",
            width: 310,
            render: (_, department) => (
              <Space wrap>
                <Button
                  icon={<UserAddOutlined aria-hidden="true" />}
                  onClick={() => open(department, "LEADER")}
                >
                  เพิ่มหัวหน้า
                </Button>
                <Button
                  icon={<UserAddOutlined aria-hidden="true" />}
                  onClick={() => open(department, "APPROVER")}
                >
                  เพิ่มผู้อนุมัติ
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        open={!!assignment}
        title={assignment?.role === "LEADER" ? "เพิ่มหัวหน้า" : "เพิ่มผู้อนุมัติ"}
        footer={null}
        onCancel={() => {
          if (!submitting.current) setAssignment(undefined);
        }}
        closable={!busy}
        maskClosable={!busy}
        keyboard={!busy}
        destroyOnHidden
      >
        <Space direction="vertical" style={{ width: "100%", marginBottom: 20 }}>
          <Typography.Text>
            หน่วยงาน: <strong>{assignment?.department.name}</strong>
          </Typography.Text>
          <Typography.Text>
            บทบาท: <strong>{assignment && roleNames[assignment.role]}</strong>
          </Typography.Text>
        </Space>
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item
            name="userId"
            label="บัญชีผู้ใช้"
            rules={[{ required: true, message: "กรุณาเลือกบัญชีผู้ใช้" }]}
          >
            <Select
              aria-label="บัญชีผู้ใช้"
              showSearch
              disabled={busy}
              loading={refreshing}
              optionFilterProp="label"
              placeholder="ค้นหาชื่อหรือชื่อผู้ใช้"
              notFoundContent={refreshing ? "กำลังโหลดรายชื่อ…" : "ไม่พบบัญชีที่เลือกได้"}
              onOpenChange={(isOpen) => {
                if (isOpen) void onRefresh();
              }}
              onChange={() => setError("")}
              options={candidates.map((user) => ({
                value: user.id,
                label: `${user.display_name} — ${user.username}`,
              }))}
            />
          </Form.Item>
          {selected && assignment && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 20 }}
              message={`บทบาทปัจจุบัน: ${roleNames[selected.role]}`}
              description={
                <>
                  <div>
                    หน่วยงานปัจจุบัน:{" "}
                    {departments.find((department) => department.id === selected.department_id)
                      ?.name || "ไม่ได้สังกัดหน่วยงาน"}
                  </div>
                  <div>
                    บันทึกแล้วบัญชีนี้จะใช้บทบาท{roleNames[assignment.role]} ประจำ
                    {assignment.department.name}แทนบทบาทเดิม ผู้ใช้ต้องเข้าสู่ระบบใหม่
                  </div>
                </>
              }
            />
          )}
          {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 20 }} />}
          <Typography.Paragraph type="secondary">
            ถ้าไม่พบรายชื่อ ให้ผู้ใช้เข้าสู่ TownTrack ผ่าน Gov Center ก่อน แล้วกด “โหลดรายชื่อใหม่”
          </Typography.Paragraph>
          <Space style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button disabled={busy} onClick={() => setAssignment(undefined)}>
              ยกเลิก
            </Button>
            <Button
              aria-label="บันทึก"
              type="primary"
              htmlType="submit"
              loading={busy}
              disabled={busy || refreshing}
            >
              บันทึก
            </Button>
          </Space>
        </Form>
      </Modal>
    </>
  );
}
