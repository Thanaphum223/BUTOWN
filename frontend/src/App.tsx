import GovAuthBadge from "./GovAuthBadge";
import { AuthUnavailableError } from "./api";
import LanguageSwitcher from "./LanguageSwitcher";
import { useI18n } from "./i18n/useI18n";
import { MenuOutlined } from "@ant-design/icons";
import GovAuthPage from "./GovAuthPage";
import GovProfile from "./GovProfile";
import GovCallback from "./GovCallback";
import type { GovCallbackReturn } from "./govCallbackReturn";
import CitizenTracking from "./CitizenTracking";
import PrivacyGate from "./PrivacyGate";
import CommunityDetail from "./CommunityDetail";
import NewCase from "./NewCase";
import { lazy } from "react";
const EmergencyContacts = lazy(() => import("./EmergencyContacts"));
const Teams = lazy(() => import("./Teams"));
const Admin = lazy(() => import("./Admin"));
const Detail = lazy(() => import("./Detail"));
const CitizenHome = lazy(() => import("./CitizenHome"));
const StaffWorkspace = lazy(() => import("./StaffWorkspace"));
const ApproverOverview = lazy(() => import("./ApproverOverview"));
import { useEffect, useState } from "react";
import {
  App as AntApp,
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Grid,
  Empty,
  Form,
  Input,
  InputNumber,
  Layout,
  List,
  Menu,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Steps,
  Table,
  Tag,
  Timeline,
  Typography,
  Upload,
  Switch,
} from "antd";
import {
  EnvironmentOutlined,
  HomeOutlined,
  AlertOutlined,
  DashboardOutlined,
  FileTextOutlined,
  HistoryOutlined,
  PlusOutlined,
  BellOutlined,
  SettingOutlined,
  LogoutOutlined,
  ReloadOutlined,
  ArrowLeftOutlined,
  UploadOutlined,
  TeamOutlined,
  LockOutlined,
} from "@ant-design/icons";
import { api, post, refreshCsrf, statusNames, actionNames, roleNames, date } from "./api";
import LocationMap from "./LocationMap";
const { Title, Text, Paragraph } = Typography;
type RowData = Record<string, any>;
function StateTag({ value }: { value: string }) {
  const { t } = useI18n();
  return (
    <Tag
      color={
        ["CLOSED", "RESOLVED"].includes(value)
          ? "success"
          : ["REJECTED", "TERMINATED"].includes(value)
            ? "error"
            : value.includes("REVISION")
              ? "warning"
              : "processing"
      }
    >
      {t(statusNames[value] || value)}
    </Tag>
  );
}
function useData<T>(url: string, refresh = 0) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setError("");
    api<T>(url)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [url, refresh]);
  return { data, error };
}
function ErrorBox({ error }: { error: string }) {
  const { t } = useI18n();
  return error ? (
    <Alert type="error" showIcon message={t(error)} style={{ marginBottom: 16 }} />
  ) : null;
}
export default function App({ govReturn }: { govReturn: GovCallbackReturn | null }) {
  return govReturn ? <GovCallback returned={govReturn} /> : <TownTrackApp />;
}
function TownTrackApp() {
  const { t } = useI18n();
  const screens = Grid.useBreakpoint();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [showRoleControls, setShowRoleControls] = useState(false);
  const [adminDepartments, setAdminDepartments] = useState<RowData[]>([]);
  const [switchingRole, setSwitchingRole] = useState(false);
  const [pendingAdminRole, setPendingAdminRole] = useState<string | null>(null);
  const [pendingDepartment, setPendingDepartment] = useState<string>();
  const [departmentError, setDepartmentError] = useState(false);
  const [fontLarge, setFontLarge] = useState(false);
  const [user, setUser] = useState<RowData | null>(),
    [view, setView] = useState("dashboard"),
    [selected, setSelected] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [selectedPublic, setSelectedPublic] = useState(false);
  const { message } = AntApp.useApp();
  const [authError, setAuthError] = useState("");
  const [authErrorDetail, setAuthErrorDetail] = useState("");
  const load = () =>
    api<RowData>("/auth/me")
      .then((next) => {
        setAuthError("");
        setAuthErrorDetail("");
        setUser(next);
      })
      .catch((error) => {
        setAuthError(error instanceof AuthUnavailableError ? error.message : "");
        setAuthErrorDetail(error instanceof AuthUnavailableError ? error.detail : "");
        setUser(null);
      });
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (user && (user.account_role === "ADMIN" || user.role === "ADMIN"))
      api<RowData>("/catalog")
        .then((data) => {
          setAdminDepartments(data.departments);
          setDepartmentError(false);
        })
        .catch(() => {
          setDepartmentError(true);
          message.error(t("โหลดหน่วยงานไม่สำเร็จ กรุณารีเฟรชหน้า"));
        });
  }, [user]);
  const switchAdminRole = async (role: string, departmentId = user?.department_id) => {
    setSwitchingRole(true);
    try {
      const next = await api<RowData>("/auth/admin-role", {
        method: "POST",
        body: JSON.stringify({
          role,
          departmentId: ["LEADER", "FIELD"].includes(role) ? departmentId : null,
        }),
      });
      setUser(next);
      setPendingAdminRole(null);
      setView("dashboard");
      setSelected("");
      setRefresh((x) => x + 1);
    } catch (e) {
      message.error(t((e as Error).message));
    } finally {
      setSwitchingRole(false);
    }
  };
  const open = (id: string, publicView = false) => {
    setSelectedPublic(publicView);
    setSelected(id);
    setView("detail");
  };
  if (user === undefined)
    return (
      <div className="loading">
        <Spin size="large" />
      </div>
    );
  if (!user)
    return (
      <GovAuthPage
        authError={authError}
        authErrorDetail={authErrorDetail}
        onLogin={() => {
          void load();
          setView("dashboard");
        }}
      />
    );
  const items = [
    { key: "dashboard", icon: <DashboardOutlined />, label: t("ภาพรวม") },
    {
      key: "cases",
      icon: <FileTextOutlined />,
      label: user.role === "CITIZEN" ? t("ติดตามสถานะ") : t("คิวงาน"),
    },
    ...(user.role !== "CITIZEN"
      ? [{ key: "history", icon: <HistoryOutlined />, label: t("ประวัติงาน") }]
      : []),
    ...(user.role === "CITIZEN"
      ? [
          { key: "new", icon: <PlusOutlined />, label: t("แจ้งปัญหา") },
          {
            key: "following",
            icon: <EnvironmentOutlined />,
            label: t("เรื่องที่ติดตาม"),
          },
        ]
      : []),
    ...(user.role === "LEADER"
      ? [{ key: "teams", icon: <TeamOutlined />, label: t("ทีมลงพื้นที่") }]
      : []),
    { key: "notifications", icon: <BellOutlined />, label: t("การแจ้งเตือน") },
    ...(user.role === "ADMIN"
      ? [{ key: "admin", icon: <SettingOutlined />, label: t("จัดการระบบ") }]
      : []),
    { key: "password", icon: <LockOutlined />, label: t("เปลี่ยนรหัสผ่าน") },
  ];
  return (
    <PrivacyGate key={user.id} user={user}>
      <Modal
        title={t("เลือกหน่วยงานสำหรับ{{role}}", {
          role: pendingAdminRole ? t(roleNames[pendingAdminRole]) : t("บทบาท"),
        })}
        open={pendingAdminRole !== null}
        onCancel={() => setPendingAdminRole(null)}
        okText={t("เริ่มใช้บทบาทนี้")}
        cancelText={t("ยกเลิก")}
        confirmLoading={switchingRole}
        okButtonProps={{ disabled: !pendingDepartment || departmentError }}
        onOk={() =>
          pendingAdminRole &&
          pendingDepartment &&
          void switchAdminRole(pendingAdminRole, pendingDepartment)
        }
      >
        <p>
          {t(
            "เลือกหน่วยงานเพื่อแสดงงานและสิทธิ์ที่ตรงกับบทบาท คุณสามารถสลับกลับผู้ดูแลระบบได้ทุกเมื่อ",
          )}
        </p>
        {departmentError ? (
          <Alert type="error" message={t("โหลดหน่วยงานไม่สำเร็จ กรุณารีเฟรชหน้า")} />
        ) : (
          <Select
            aria-label={t("เลือกหน่วยงานเพื่อเริ่มบทบาท")}
            style={{ width: "100%" }}
            placeholder={t("เลือกหน่วยงาน")}
            value={pendingDepartment}
            onChange={setPendingDepartment}
            options={adminDepartments.map((d) => ({ value: d.id, label: d.name }))}
            notFoundContent={t("ยังไม่มีหน่วยงาน กรุณาเพิ่มในเมนูจัดการระบบ")}
          />
        )}
      </Modal>
      <Layout
        className={
          "shell " +
          (user.role === "CITIZEN" ? "citizen-shell" : "staff-shell") +
          (fontLarge ? " font-large" : "")
        }
      >
        {user.role !== "CITIZEN" && (
          <Layout.Sider
            breakpoint="lg"
            collapsedWidth={0}
            collapsed={!screens.lg}
            trigger={null}
            width={232}
            theme="light"
            className="sidebar"
          >
            <div className="brand">
              <EnvironmentOutlined /> TownTrack
            </div>
            <div className="nav-label">{t("บริการเทศบาล")}</div>
            <Menu
              mode="inline"
              selectedKeys={[view === "detail" ? "cases" : view]}
              items={items}
              onClick={({ key }) => {
                setView(key);
                window.scrollTo({ top: 0 });
              }}
            />
            <div className="sidebar-bottom">
              <Tag color="green">{t(roleNames[user.role])}</Tag>
              <p>
                {t("ประสานงานอย่างเป็นระบบ")}
                <br />
                {t("ติดตามผลอย่างโปร่งใส")}
              </p>
            </div>
          </Layout.Sider>
        )}
        <Drawer
          title={t("เมนู TownTrack")}
          placement="left"
          width="min(320px, 90vw)"
          open={mobileMenu}
          onClose={() => setMobileMenu(false)}
        >
          <Menu
            mode="inline"
            selectedKeys={[view === "detail" ? "cases" : view]}
            items={items}
            onClick={({ key }) => {
              setView(key);
              setMobileMenu(false);
              window.scrollTo({ top: 0 });
            }}
          />
        </Drawer>
        <Layout>
          <Layout.Header className="topbar">
            {user.role !== "CITIZEN" && !screens.lg && (
              <Button
                icon={<MenuOutlined />}
                aria-label={t("เปิดเมนูหลัก")}
                onClick={() => setMobileMenu(true)}
              />
            )}
            <div className="header-identity">
              {user.role === "CITIZEN" ? (
                <Avatar className="citizen-profile-avatar">{user.display_name?.[0]}</Avatar>
              ) : (
                <span className="municipal-mark">{t("ท")}</span>
              )}
              <div>
                <strong title={user.role === "CITIZEN" ? user.display_name : undefined}>
                  {user.role === "CITIZEN"
                    ? t("สวัสดี, {{name}}", { name: user.display_name })
                    : t("ศูนย์รับเรื่องเทศบาล")}
                </strong>
                <small>
                  {user.role === "CITIZEN"
                    ? t("บริการประชาชน · TownTrack")
                    : t("งานบริการประชาชน · {{role}}", { role: t(roleNames[user.role]) })}
                </small>
              </div>
            </div>
            <Space className="account-controls" wrap>
              <LanguageSwitcher />
              {(user.account_role === "ADMIN" || user.role === "ADMIN") && (
                <>
                  {!screens.lg && (
                    <Button
                      aria-expanded={showRoleControls}
                      onClick={() => setShowRoleControls((v) => !v)}
                    >
                      {t("สลับบทบาท")}
                    </Button>
                  )}
                  <div
                    className={
                      "admin-role-controls" + (!screens.lg && !showRoleControls ? " is-hidden" : "")
                    }
                  >
                    {["LEADER", "FIELD"].includes(user.role) && (
                      <Select
                        aria-label={t("หน่วยงานสำหรับบทบาท")}
                        placeholder={t("เลือกหน่วยงาน")}
                        style={{ minWidth: 150 }}
                        value={user.department_id || undefined}
                        disabled={switchingRole}
                        options={adminDepartments.map((d) => ({ value: d.id, label: d.name }))}
                        onChange={(department) => void switchAdminRole(user.role, department)}
                      />
                    )}
                    <Select
                      aria-label={t("สลับบทบาทผู้ดูแลระบบ")}
                      className="admin-role-select"
                      popupClassName="admin-role-options"
                      style={{ minWidth: 150 }}
                      value={user.role}
                      loading={switchingRole}
                      disabled={switchingRole}
                      options={Object.entries(roleNames).map(([value, label]) => ({
                        value,
                        label: t(label),
                      }))}
                      onChange={(role) => {
                        if (["LEADER", "FIELD"].includes(role) && !user.department_id) {
                          setPendingDepartment(
                            adminDepartments.length === 1 ? adminDepartments[0].id : undefined,
                          );
                          setPendingAdminRole(role);
                        } else void switchAdminRole(role);
                      }}
                    />
                  </div>
                </>
              )}
              {user.role === "CITIZEN" && (
                <Button
                  className="font-size-toggle"
                  aria-label={fontLarge ? t("ย่อขนาดตัวอักษร") : t("ขยายขนาดตัวอักษร")}
                  aria-pressed={fontLarge}
                  onClick={() => setFontLarge((v) => !v)}
                >
                  <span aria-hidden="true">{fontLarge ? t("ก−") : t("ก+")}</span>
                  <span className="font-toggle-label">{fontLarge ? t("ย่อ") : t("ขยาย")}</span>
                </Button>
              )}
              <GovProfile />
              <Avatar className="account-avatar">{user.display_name?.[0]}</Avatar>
              <span className="account-name">{user.display_name}</span>
              <Button
                aria-label={t("ออกจากระบบ")}
                icon={<LogoutOutlined />}
                onClick={async () => {
                  try {
                    await api("/auth/logout", { method: "POST" });
                    setUser(null);
                  } catch (e) {
                    message.error(t((e as Error).message));
                  }
                }}
              />
            </Space>
          </Layout.Header>
          <GovAuthBadge signedIn />
          <Layout.Content className="content">
            {view === "dashboard" && user.role === "CITIZEN" ? (
              <CitizenHome onFollowing={() => setView("following")} />
            ) : view === "dashboard" && user.role === "APPROVER" ? (
              <ApproverOverview key={user.id} onQueue={() => setView("cases")} />
            ) : (view === "dashboard" || view === "cases" || view === "history") &&
              user.role !== "CITIZEN" ? (
              <StaffWorkspace
                key={`${user.role}:${user.department_id}:${view === "history"}`}
                user={user}
                dashboard={view === "dashboard"}
                history={view === "history"}
              />
            ) : view === "cases" && user.role === "CITIZEN" ? (
              <CitizenTracking key="mine" open={open} />
            ) : view === "dashboard" || view === "cases" ? (
              <CaseList
                user={user}
                dashboard={view === "dashboard"}
                refresh={refresh}
                open={open}
                onNew={() => setView("new")}
                reload={() => setRefresh((x) => x + 1)}
              />
            ) : view === "new" ? (
              <NewCase
                onDone={(id) => {
                  setRefresh((x) => x + 1);
                  open(id);
                }}
              />
            ) : view === "detail" ? (
              <div className={user.role === "CITIZEN" ? "citizen-case-detail" : undefined}>
                <Detail
                  id={selected}
                  user={user}
                  publicView={user.role === "CITIZEN" && selectedPublic}
                  back={() => setView(selectedPublic ? "following" : "cases")}
                />
              </div>
            ) : view === "following" ? (
              <CitizenTracking key="following" initialTab="following" open={open} />
            ) : view === "notifications" ? (
              <Notifications open={open} citizen={user.role === "CITIZEN"} />
            ) : view === "emergency" ? (
              <EmergencyContacts />
            ) : view === "teams" ? (
              <Teams />
            ) : view === "admin" ? (
              <Admin />
            ) : (
              <Password
                onDone={() => {
                  setUser(null);
                }}
              />
            )}
          </Layout.Content>
          <Layout.Footer className="footer">
            {t("TownTrack • ระบบรับเรื่องและบริหารงานลงพื้นที่")}
          </Layout.Footer>
        </Layout>
        {user.role === "CITIZEN" && (
          <nav className="citizen-bottom-nav" aria-label={t("เมนูประชาชน")}>
            {[
              { key: "dashboard", icon: <HomeOutlined />, label: t("หน้าหลัก") },
              { key: "new", icon: <PlusOutlined />, label: t("แจ้งปัญหา") },
              { key: "cases", icon: <FileTextOutlined />, label: t("ติดตามสถานะ") },
              {
                key: "notifications",
                icon: <BellOutlined />,
                label: t("แจ้งเตือน"),
              },
              { key: "emergency", icon: <AlertOutlined />, label: t("เหตุฉุกเฉิน") },
            ].map((item) => (
              <a
                key={item.key}
                href={"#" + item.key}
                aria-current={
                  (["detail", "following"].includes(view) ? "cases" : view) === item.key
                    ? "page"
                    : undefined
                }
                onClick={(e) => {
                  e.preventDefault();
                  setView(item.key);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </a>
            ))}
          </nav>
        )}
      </Layout>
    </PrivacyGate>
  );
}
function CaseList({
  user,
  dashboard,
  refresh,
  open,
  onNew,
  reload,
}: {
  user: RowData;
  dashboard: boolean;
  refresh: number;
  open: (id: string) => void;
  onNew: () => void;
  reload: () => void;
}) {
  const { t } = useI18n();
  const [page, setPage] = useState(1),
    [size, setSize] = useState(10);
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState<string>();
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const { data, error } = useData<RowData>(
    "/complaints?page=" +
      (page - 1) +
      "&size=" +
      size +
      "&q=" +
      encodeURIComponent(query) +
      "&status=" +
      encodeURIComponent(status || ""),
    refresh,
  );
  const rows: RowData[] = data?.items || [];
  const terminal = ["CLOSED", "TERMINATED", "REJECTED"];
  return (
    <>
      <div className="page-heading">
        <div>
          <Text className="eyebrow">TOWNTRACK / WORKSPACE</Text>
          <Title level={2}>{dashboard ? t("ภาพรวมการดำเนินงาน") : t("งานและคำร้อง")}</Title>
          <Text type="secondary">
            {user.role === "CITIZEN"
              ? t("ติดตามปัญหาที่คุณแจ้งและดูความคืบหน้า")
              : t("ติดตามคำร้องและงานที่อยู่ในขอบเขตความรับผิดชอบ")}
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={reload}>
            {t("โหลดใหม่")}
          </Button>
          {user.role === "CITIZEN" && (
            <Button type="primary" icon={<PlusOutlined />} onClick={onNew}>
              {t("แจ้งปัญหา")}
            </Button>
          )}
        </Space>
      </div>
      <ErrorBox error={error} />
      {dashboard && (
        <Row gutter={[16, 16]} className="stats">
          {[
            [t("คำร้องทั้งหมด"), data?.stats.total || 0],
            [t("กำลังดำเนินการ"), data?.stats.in_progress || 0],
            [t("ปิดเรื่องสำเร็จ"), data?.stats.closed || 0],
            [t("เกินกำหนด"), data?.stats.overdue || 0],
          ].map(([label, n], i) => (
            <Col xs={12} xl={6} key={i}>
              <Card>
                <div className={"stat-icon stat-" + i}>
                  <FileTextOutlined />
                </div>
                <Statistic title={label} value={n} />
              </Card>
            </Col>
          ))}
        </Row>
      )}
      <Card
        title={t("รายการคำร้อง")}
        extra={
          <Text type="secondary">{t("พบ {{count}} รายการ", { count: data?.total || 0 })}</Text>
        }
      >
        <Space wrap className="filters">
          <Input.Search
            placeholder={t("ค้นหาหัวข้อหรือเลขคำร้อง")}
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 280 }}
          />
          <Select
            placeholder={t("ทุกสถานะ")}
            allowClear
            style={{ width: 230 }}
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={Object.entries(statusNames).map(([value, label]) => ({
              value,
              label: t(label),
            }))}
          />
        </Space>
        <Table
          rowKey="id"
          loading={!data && !error}
          dataSource={rows}
          scroll={{ x: 850 }}
          pagination={{
            current: page,
            pageSize: size,
            total: data?.total || 0,
            showSizeChanger: true,
            onChange: (p, s) => {
              setPage(p);
              setSize(s);
            },
          }}
          columns={[
            {
              title: t("คำร้อง"),
              dataIndex: "title",
              render: (v, r) => (
                <>
                  <Button type="link" className="case-link" onClick={() => open(r.id)}>
                    {v}
                  </Button>
                  <div>
                    <Text type="secondary" className="small">
                      #{r.id.slice(0, 8).toUpperCase()}
                    </Text>
                  </div>
                </>
              ),
            },
            { title: t("ประเภท"), dataIndex: "category_name" },
            {
              title: t("สถานะ"),
              dataIndex: "status",
              render: (v) => <StateTag value={v} />,
            },
            { title: t("วันที่แจ้ง"), dataIndex: "created_at", render: date },
            {
              title: t("กำหนดเสร็จ"),
              dataIndex: "due_at",
              render: (v, r) => (
                <Text
                  type={
                    !terminal.includes(r.status) && new Date(v) < new Date() ? "danger" : undefined
                  }
                >
                  {date(v)}
                </Text>
              ),
            },
            {
              title: "",
              render: (_, r) => <Button onClick={() => open(r.id)}>{t("ดูรายละเอียด")}</Button>,
            },
          ]}
        />
      </Card>
    </>
  );
}
function Following({ open }: { open: (id: string) => void }) {
  const { t } = useI18n();
  const [detailId, setDetailId] = useState<string>();
  const [refresh, setRefresh] = useState(0);
  const { data, error } = useData<RowData[]>("/following", refresh);
  const { message } = AntApp.useApp();
  return (
    <>
      <CommunityDetail id={detailId} onClose={() => setDetailId(undefined)} />
      <Title level={2}>{t("เรื่องที่ติดตาม")}</Title>
      <ErrorBox error={error} />
      <Card>
        <Alert
          style={{ marginBottom: 16 }}
          type="info"
          message={t("แสดงเฉพาะประเภทปัญหาและสถานะของเรื่องที่ติดตาม เพื่อรักษาข้อมูลผู้แจ้ง")}
        />
        <List
          dataSource={data}
          locale={{ emptyText: t("ยังไม่มีเรื่องที่ติดตาม") }}
          renderItem={(r) => (
            <List.Item
              actions={[
                <Button key="detail" onClick={() => setDetailId(r.id)}>
                  {t("ดูรายละเอียด")}
                </Button>,
                <Button
                  key="unfollow"
                  onClick={async () => {
                    try {
                      await api("/complaints/" + r.id + "/follow", {
                        method: "DELETE",
                      });
                      setRefresh((x) => x + 1);
                    } catch (e) {
                      message.error(t((e as Error).message));
                    }
                  }}
                >
                  {t("เลิกติดตาม")}
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={r.category_name + " • #" + r.id.slice(0, 8)}
                description={
                  <Space wrap>
                    <StateTag value={r.status} />
                    <Text type="secondary">{date(r.updated_at)}</Text>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Card>
    </>
  );
}
function Notifications({ open, citizen }: { open: (id: string) => void; citizen: boolean }) {
  const { t } = useI18n();
  const [communityId, setCommunityId] = useState<string>();
  const [refresh, setRefresh] = useState(0);
  const { data, error } = useData<RowData[]>("/notifications", refresh);
  const { message } = AntApp.useApp();
  return (
    <>
      <div className="page-heading">
        <Title level={2}>{t("การแจ้งเตือน")}</Title>
        <Button
          onClick={async () => {
            try {
              await post("/notifications/read", {});
              setRefresh((x) => x + 1);
            } catch (e) {
              message.error(t((e as Error).message));
            }
          }}
        >
          {t("อ่านทั้งหมดแล้ว")}
        </Button>
      </div>
      <ErrorBox error={error} />
      <Card>
        <List
          dataSource={data}
          locale={{ emptyText: t("ยังไม่มีการแจ้งเตือน") }}
          renderItem={(r) => (
            <List.Item
              className="notification-item"
              actions={
                r.complaint_id
                  ? [
                      <Button
                        key="open"
                        onClick={() =>
                          citizen ? setCommunityId(r.complaint_id) : open(r.complaint_id)
                        }
                      >
                        {t("ดูคำร้อง")}
                      </Button>,
                    ]
                  : undefined
              }
            >
              <List.Item.Meta
                avatar={
                  <Badge dot={!r.read_at}>
                    <Avatar icon={<BellOutlined />} />
                  </Badge>
                }
                title={String(r.message).replace(/\b[A-Z][A-Z_]+\b/g, (code) =>
                  t(statusNames[code] || actionNames[code] || code),
                )}
                description={
                  date(r.created_at) + (r.complaint_id ? " • #" + r.complaint_id.slice(0, 8) : "")
                }
              />
            </List.Item>
          )}
        />
      </Card>
      {citizen && <CommunityDetail id={communityId} onClose={() => setCommunityId(undefined)} />}
    </>
  );
}
function Password({ onDone }: { onDone: () => void }) {
  const { language, t } = useI18n();
  const [form] = Form.useForm();
  useEffect(() => {
    const invalid = form.getFieldsError().filter((field) => field.errors.length);
    if (invalid.length)
      void form.validateFields(invalid.map((field) => field.name)).catch(() => {});
  }, [form, language]);
  const { message } = AntApp.useApp();
  return (
    <>
      <Title level={2}>{t("เปลี่ยนรหัสผ่าน")}</Title>
      <Card style={{ maxWidth: 520 }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={async (v) => {
            try {
              await post("/auth/password", v);
              message.success(t("เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบใหม่"));
              onDone();
            } catch (e) {
              message.error(t((e as Error).message));
            }
          }}
        >
          <Form.Item name="currentPassword" label={t("รหัสผ่านเดิม")} rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label={t("รหัสผ่านใหม่ (อย่างน้อย 12 ตัวอักษร)")}
            rules={[{ required: true, min: 12, max: 72 }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            {t("บันทึกรหัสผ่านใหม่")}
          </Button>
        </Form>
      </Card>
    </>
  );
}
