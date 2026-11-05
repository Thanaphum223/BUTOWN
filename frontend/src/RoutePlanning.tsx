import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Empty,
  Input,
  InputNumber,
  List,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  EnvironmentOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { api, date, roleNames, statusNames } from "./api";
import Detail from "./Detail";
import RoutePlanningMap from "./RoutePlanningMap";
type D = Record<string, any>;
const { Title, Text, Paragraph } = Typography;
const states: Record<string, string> = {
  DRAFT: "ร่างรอบงาน",
  PROPOSED: "รอหัวหน้ายืนยันทีม",
  DISPATCHED: "มอบหมายทีมแล้ว",
  DECLINED: "หัวหน้าส่งกลับรอบงาน",
  CANCELLED: "ยกเลิกรอบงาน",
};
export default function RoutePlanning({ user }: { user: D }) {
  const canPlan = ["OFFICER", "LEADER"].includes(user.role),
    prefKey = `towntrack-route-start:${user.id}`;
  const [candidates, setCandidates] = useState<D[]>([]),
    [plans, setPlans] = useState<D[]>([]),
    [active, setActive] = useState<D>(),
    [chosen, setChosen] = useState<string[]>([]),
    [leader, setLeader] = useState<string>();
  const [latitude, setLatitude] = useState<number | null>(null),
    [longitude, setLongitude] = useState<number | null>(null),
    [loop, setLoop] = useState(true),
    [optimize, setOptimize] = useState(true),
    [name, setName] = useState("");
  const [mode, setMode] = useState<"view" | "draw" | "start">("view"),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [teams, setTeams] = useState<D[]>([]),
    [team, setTeam] = useState<string>(),
    [caseId, setCaseId] = useState<string>(),
    [historyCase, setHistoryCase] = useState(false);
  const [decision, setDecision] = useState<"cancel" | "decline">(),
    [reason, setReason] = useState(""),
    [reasonError, setReasonError] = useState("");
  const { message } = App.useApp();
  const sending = useRef(false),
    operation = useRef(crypto.randomUUID());
  const activeGeneration = useRef(0);
  const builder = canPlan && (!active || active.status === "DRAFT");
  const start =
    latitude !== null &&
    longitude !== null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
      ? ([latitude, longitude] as [number, number])
      : undefined;
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(prefKey) || "null");
      if (
        p &&
        Number.isFinite(p.latitude) &&
        Math.abs(p.latitude) <= 90 &&
        Number.isFinite(p.longitude) &&
        Math.abs(p.longitude) <= 180
      ) {
        setLatitude(p.latitude);
        setLongitude(p.longitude);
        setLoop(p.loop !== false);
      }
    } catch {}
  }, [prefKey]);
  async function refresh() {
    const [rounds, jobs] = await Promise.all([
      api<D[]>("/route-plans"),
      canPlan ? api<D[]>("/route-plans/candidates") : Promise.resolve([]),
    ]);
    setPlans(rounds);
    setCandidates(jobs);
    if (jobs.length && !jobs.some((c) => c.leader_id === leader))
      setLeader(user.role === "LEADER" ? user.id : jobs[0].leader_id);
  }
  useEffect(() => {
    let alive = true;
    void refresh()
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [user.id, user.role]);
  useEffect(() => {
    if (user.role !== "LEADER") return;
    api<D[]>("/teams")
      .then(setTeams)
      .catch((e) => setError(e.message));
  }, [user.role]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible" || sending.current) return;
      const generation = activeGeneration.current;
      void refresh().catch(() => {});
      if (active?.id)
        void api<D>("/route-plans/" + active.id)
          .then((p) => {
            if (generation === activeGeneration.current && p.status !== "DRAFT") setActive(p);
          })
          .catch(() => {});
    }, 8000);
    return () => clearInterval(timer);
  }, [active?.id, leader, user.role]);
  const heads = useMemo(
    () =>
      Array.from(
        new Map(
          candidates.map((c) => [
            c.leader_id,
            { value: c.leader_id, label: c.department_name + " · " + c.leader_name },
          ]),
        ).values(),
      ),
    [candidates],
  );
  const available = useMemo(
    () => candidates.filter((c) => !leader || c.leader_id === leader),
    [candidates, leader],
  );
  const mapPoints = builder
    ? available.map((c) => ({
        id: c.id,
        latitude: Number(c.latitude),
        longitude: Number(c.longitude),
        title: c.title,
      }))
    : (active?.stops || []).map((s: D) => ({
        id: s.complaint_id,
        latitude: Number(s.latitude),
        longitude: Number(s.longitude),
        title: s.title,
      }));
  const displayChosen = active?.stops ? active.stops.map((s: D) => s.complaint_id) : chosen;
  function invalidate() {
    activeGeneration.current++;
    setActive(undefined);
    operation.current = crypto.randomUUID();
    setError("");
  }
  function select(ids: string[]) {
    if (sending.current) return;
    if (ids.length > 10) {
      setError("เลือกได้ไม่เกิน 10 จุดต่อรอบ กรุณาวาดพื้นที่ให้เล็กลง");
      setMode("view");
      return;
    }
    invalidate();
    setChosen(ids);
    setMode("view");
  }
  function toggle(id: string) {
    select(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  }
  function remember() {
    if (start)
      try {
        localStorage.setItem(
          prefKey,
          JSON.stringify({ latitude: start[0], longitude: start[1], loop }),
        );
      } catch {}
  }
  async function calculate() {
    if (sending.current) return;
    if (!start || chosen.length < 2 || chosen.length > 10) {
      setError("เลือกงาน 2–10 จุดและกำหนดจุดเริ่มเส้นทางก่อน");
      return;
    }
    sending.current = true;
    activeGeneration.current++;
    setBusy(true);
    setError("");
    remember();
    try {
      const result = await api<D>("/route-plans/calculate", {
        method: "POST",
        headers: { "Idempotency-Key": operation.current },
        body: JSON.stringify({
          complaintIds: chosen,
          startLatitude: start[0],
          startLongitude: start[1],
          returnToStart: loop,
          optimize,
        }),
      });
      setActive(result);
      setChosen(result.stops.map((s: D) => s.complaint_id));
      setName((previous) => previous || result.name);
      operation.current = crypto.randomUUID();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  async function change(action: string, values: D = {}) {
    if (!active || sending.current) return;
    if (action === "propose" && !name.trim()) {
      setError("กรุณาตั้งชื่อรอบงาน");
      return;
    }
    sending.current = true;
    activeGeneration.current++;
    setBusy(true);
    setError("");
    try {
      const result = await api<D>(`/route-plans/${active.id}/${action}`, {
        method: "POST",
        headers: { "Idempotency-Key": operation.current },
        body: JSON.stringify({ version: active.version, ...values }),
      });
      setActive(result);
      setDecision(undefined);
      operation.current = crypto.randomUUID();
      await refresh();
      message.success(
        action === "confirm"
          ? "มอบหมายงานทั้งรอบแล้ว"
          : action === "propose"
            ? "เสนอรอบให้หัวหน้าแล้ว"
            : "บันทึกรอบงานแล้ว",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  async function open(id: string) {
    const generation = ++activeGeneration.current;
    setError("");
    setLoading(true);
    try {
      const p = await api<D>("/route-plans/" + id);
      const currentTeams = user.role === "LEADER" ? await api<D[]>("/teams") : undefined;
      if (generation !== activeGeneration.current) return;
      if (currentTeams) setTeams(currentTeams);
      setActive(p);
      setTeam(undefined);
      operation.current = crypto.randomUUID();
      if (p.status === "DRAFT") {
        setChosen(p.stops.map((s: D) => s.complaint_id));
        setLatitude(Number(p.start_latitude));
        setLongitude(Number(p.start_longitude));
        setLoop(p.return_to_start);
        setOptimize(p.optimized);
        setName(p.name);
        setLeader(p.leader_id);
      }
    } catch (e) {
      if (generation === activeGeneration.current) setError((e as Error).message);
    } finally {
      if (generation === activeGeneration.current) setLoading(false);
    }
  }
  function reorder(index: number, delta: number) {
    const ids = [...displayChosen];
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    setChosen(ids);
    setOptimize(false);
    invalidate();
  }
  if (caseId)
    return (
      <Detail
        id={caseId}
        user={user}
        historyOnly={historyCase}
        back={() => {
          setCaseId(undefined);
          if (active) void open(active.id);
        }}
      />
    );
  const routeStart = builder
    ? start
    : active
      ? ([Number(active.start_latitude), Number(active.start_longitude)] as [number, number])
      : undefined;
  const stops =
    active?.stops ||
    chosen.map((id) => ({ ...candidates.find((c) => c.id === id), complaint_id: id }));
  return (
    <section className="route-planning">
      <div className="page-heading">
        <div>
          <Title level={2}>
            <EnvironmentOutlined />{" "}
            {user.role === "FIELD"
              ? "รอบงานของฉัน"
              : user.role === "ADMIN"
                ? "รอบงานลงพื้นที่"
                : "วางแผนเส้นทางลงพื้นที่"}
          </Title>
          <Paragraph type="secondary">
            {canPlan
              ? "รวมงานกองเดียวกันเป็นรอบ แล้วให้หัวหน้ายืนยันทีมลงพื้นที่"
              : "ดูจุดงานตามลำดับ โดยแต่ละเรื่องยังรับงานและส่งรายงานแยกกัน"}
          </Paragraph>
        </div>
        <Space wrap>
          <Button
            icon={<ReloadOutlined />}
            onClick={() =>
              void (async () => {
                await refresh();
                if (active) await open(active.id);
              })().catch((e) => setError(e.message))
            }
            disabled={busy}
          >
            โหลดใหม่
          </Button>
          {canPlan && (
            <Button
              onClick={() => {
                invalidate();
                setChosen([]);
                setCaseId(undefined);
              }}
              disabled={busy}
            >
              สร้างรอบใหม่
            </Button>
          )}
        </Space>
      </div>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      {loading && !active ? <Spin /> : null}
      {(builder || active) && (
        <div className="route-layout">
          <Card
            className="route-map-card"
            title={builder ? "เลือกงานและจุดเริ่ม" : active?.name}
            extra={active && <Tag color="green">{states[active.status]}</Tag>}
          >
            {builder && (
              <>
                <Space wrap style={{ marginBottom: 16 }}>
                  <Button
                    onClick={() => setMode(mode === "draw" ? "view" : "draw")}
                    type={mode === "draw" ? "primary" : "default"}
                    disabled={busy}
                  >
                    วาดพื้นที่เลือกงาน
                  </Button>
                  <Button
                    onClick={() => setMode(mode === "start" ? "view" : "start")}
                    type={mode === "start" ? "primary" : "default"}
                    disabled={busy}
                  >
                    เลือกจุดเริ่มบนแผนที่
                  </Button>
                  <Text>
                    {mode === "draw"
                      ? "ลากเส้นล้อมงานที่ต้องการ"
                      : mode === "start"
                        ? "แตะตำแหน่งเริ่มต้นบนแผนที่"
                        : `เลือกแล้ว ${chosen.length} / 10 จุด`}
                  </Text>
                </Space>
                {heads.length > 1 && (
                  <div className="route-head-select">
                    <Text>กองและหัวหน้าที่รับผิดชอบ</Text>
                    <Select
                      aria-label="กองและหัวหน้าสำหรับรอบงาน"
                      value={leader}
                      disabled={busy}
                      options={heads}
                      onChange={(id) => {
                        setLeader(id);
                        setChosen([]);
                        invalidate();
                      }}
                      style={{ width: "100%" }}
                    />
                  </div>
                )}
              </>
            )}
            <RoutePlanningMap
              points={mapPoints}
              selected={displayChosen}
              start={routeStart}
              geometry={active?.geometry}
              mode={builder && !busy ? mode : "view"}
              onSelect={select}
              onStart={(point) => {
                if (sending.current) return;
                setLatitude(point[0]);
                setLongitude(point[1]);
                invalidate();
                setMode("view");
              }}
              onToggle={builder && !busy ? toggle : undefined}
            />
            {builder && (
              <div className="route-origin">
                <label>
                  ละติจูดจุดเริ่ม
                  <InputNumber
                    aria-label="ละติจูดจุดเริ่ม"
                    disabled={busy}
                    min={-90}
                    max={90}
                    value={latitude}
                    onChange={(v) => {
                      setLatitude(v);
                      invalidate();
                    }}
                  />
                </label>
                <label>
                  ลองจิจูดจุดเริ่ม
                  <InputNumber
                    aria-label="ลองจิจูดจุดเริ่ม"
                    disabled={busy}
                    min={-180}
                    max={180}
                    value={longitude}
                    onChange={(v) => {
                      setLongitude(v);
                      invalidate();
                    }}
                  />
                </label>
                <Checkbox
                  disabled={busy}
                  checked={loop}
                  onChange={(e) => {
                    setLoop(e.target.checked);
                    invalidate();
                  }}
                >
                  กลับจุดเริ่มเมื่อเสร็จงาน
                </Checkbox>
                <Checkbox
                  disabled={busy}
                  checked={optimize}
                  onChange={(e) => {
                    setOptimize(e.target.checked);
                    invalidate();
                  }}
                >
                  จัดลำดับตามเวลาเดินทาง
                </Checkbox>
                <Button
                  type="primary"
                  aria-label="คำนวณเส้นทาง"
                  aria-busy={busy}
                  loading={busy}
                  disabled={!start || chosen.length < 2 || chosen.length > 10 || busy}
                  onClick={() => void calculate()}
                >
                  คำนวณเส้นทาง
                </Button>
              </div>
            )}
            {active && (
              <div className="route-metrics">
                <div>
                  <Text type="secondary">ระยะทางขับรถ</Text>
                  <Title level={3}>
                    {(Number(active.distance) / 1000).toLocaleString("th-TH", {
                      maximumFractionDigits: 1,
                    })}{" "}
                    กม.
                  </Title>
                </div>
                <div>
                  <Text type="secondary">เวลาเดินทางประมาณ</Text>
                  <Title level={3}>{Math.ceil(Number(active.duration) / 60)} นาที</Title>
                </div>
                <div>
                  <Text type="secondary">จุดงาน</Text>
                  <Title level={3}>{active.stops.length} จุด</Title>
                </div>
              </div>
            )}
            <Paragraph type="secondary" className="route-attribution">
              เวลาเดินทางไม่รวมเวลาทำงานและสภาพจราจร · เส้นทางจาก{" "}
              <a
                href="https://routing.openstreetmap.de/about.html"
                target="_blank"
                rel="noreferrer"
              >
                OSRM / FOSSGIS
              </a>{" "}
              และ OpenStreetMap ·{" "}
              <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">
                แก้ไขแผนที่
              </a>
            </Paragraph>
          </Card>
          <Card className="route-stops-card" title={builder ? "งานสำหรับรอบนี้" : "ลำดับลงพื้นที่"}>
            {builder && (
              <>
                <Text type="secondary">เลือกจากรายการได้เช่นเดียวกับการวาดบนแผนที่</Text>
                <div className="route-candidates">
                  {available.length ? (
                    available.map((c) => (
                      <label className="route-candidate" key={c.id}>
                        <Checkbox
                          aria-label={`เลือกงาน ${c.title}`}
                          checked={chosen.includes(c.id)}
                          disabled={busy || (!chosen.includes(c.id) && chosen.length >= 10)}
                          onChange={() => toggle(c.id)}
                        />
                        <span>
                          <Text strong>{c.title}</Text>
                          <Text type="secondary">{c.address}</Text>
                          <Text type="secondary">กำหนด {date(c.due_at)}</Text>
                        </span>
                      </label>
                    ))
                  ) : (
                    <Empty description="ไม่มีงานรอจัดทีมที่มีพิกัดในกองนี้" />
                  )}
                </div>
              </>
            )}
            {stops.length > 0 && (
              <List
                className="route-stop-order"
                dataSource={stops}
                renderItem={(s: D, index) => (
                  <List.Item>
                    <div className="route-stop-number">{index + 1}</div>
                    <div className="route-stop-info">
                      <Text strong>{s.title}</Text>
                      <Text type="secondary">{s.address}</Text>
                      {!builder && (
                        <Tag
                          color={
                            s.work_status === "COMPLETE"
                              ? "green"
                              : s.work_status === "DECLINED"
                                ? "orange"
                                : undefined
                          }
                        >
                          {s.work_status === "COMPLETE"
                            ? "ทีมทำงานเสร็จแล้ว"
                            : s.work_status === "DECLINED"
                              ? "ทีมส่งคืนงาน"
                              : s.work_status === "CANCELLED"
                                ? "ยกเลิกงานของทีม"
                                : statusNames[s.complaint_status] || "รอมอบหมาย"}
                        </Tag>
                      )}
                    </div>
                    <Space>
                      {builder ? (
                        <>
                          <Button
                            aria-label={`เลื่อนจุดที่ ${index + 1} ขึ้น`}
                            size="small"
                            icon={<ArrowUpOutlined />}
                            disabled={index === 0 || busy}
                            onClick={() => reorder(index, -1)}
                          />
                          <Button
                            aria-label={`เลื่อนจุดที่ ${index + 1} ลง`}
                            size="small"
                            icon={<ArrowDownOutlined />}
                            disabled={index === stops.length - 1 || busy}
                            onClick={() => reorder(index, 1)}
                          />
                        </>
                      ) : (
                        <>
                          <Button
                            aria-label={`เปิดงาน ${s.title}`}
                            onClick={() => {
                              setHistoryCase(
                                !!s.historical || ["DECLINED", "CANCELLED"].includes(s.work_status),
                              );
                              setCaseId(s.complaint_id);
                            }}
                          >
                            เปิดงาน
                          </Button>
                          {user.role === "FIELD" &&
                            !s.historical &&
                            !["DECLINED", "CANCELLED", "COMPLETE"].includes(s.work_status) && (
                              <Button
                                href={`https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}&travelmode=driving`}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`นำทางไป ${s.title}`}
                              >
                                นำทาง
                              </Button>
                            )}
                        </>
                      )}
                    </Space>
                  </List.Item>
                )}
              />
            )}
            {active?.status === "DRAFT" && canPlan && (
              <div className="route-actions">
                <label>
                  ชื่อรอบงาน
                  <Input
                    aria-label="ชื่อรอบงาน"
                    disabled={busy}
                    value={name}
                    maxLength={200}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <Button
                  type="primary"
                  block
                  loading={busy}
                  onClick={() => void change("propose", { name })}
                >
                  เสนอรอบให้หัวหน้า
                </Button>
                <Button block disabled={busy} onClick={() => void change("cancel")}>
                  ยกเลิกร่าง
                </Button>
              </div>
            )}
            {active?.status === "PROPOSED" &&
              user.role === "LEADER" &&
              active.leader_id === user.id && (
                <div className="route-actions">
                  <label>
                    ทีมลงพื้นที่สำหรับรอบนี้
                    <Select
                      aria-label="ทีมลงพื้นที่สำหรับรอบนี้"
                      disabled={busy}
                      value={team}
                      onChange={setTeam}
                      options={teams.map((t) => ({
                        value: t.id,
                        label:
                          t.name +
                          " · " +
                          t.representative_name +
                          " · งานค้าง " +
                          Number(t.active_work_count || 0),
                      }))}
                    />
                  </label>
                  <Button
                    type="primary"
                    block
                    disabled={!team || busy}
                    loading={busy}
                    onClick={() => void change("confirm", { teamId: team })}
                  >
                    ยืนยันมอบหมายทั้งรอบ
                  </Button>
                  <Button
                    block
                    disabled={busy}
                    onClick={() => {
                      setDecision("decline");
                      setReason("");
                      setReasonError("");
                      operation.current = crypto.randomUUID();
                    }}
                  >
                    ส่งกลับรอบงาน
                  </Button>
                </div>
              )}
            {active?.status === "PROPOSED" && user.role === "OFFICER" && (
              <Button
                block
                disabled={busy}
                onClick={() => {
                  setDecision("cancel");
                  setReason("");
                  setReasonError("");
                  operation.current = crypto.randomUUID();
                }}
              >
                ยกเลิกรอบงาน
              </Button>
            )}
            {active?.status === "DISPATCHED" && (
              <Paragraph className="route-progress">
                ทีมทำงานเสร็จแล้ว{" "}
                {active.stops.filter((s: D) => s.work_status === "COMPLETE").length} /{" "}
                {active.stops.length} จุด
              </Paragraph>
            )}
          </Card>
        </div>
      )}
      <Card title="รอบงานล่าสุด" className="route-rounds">
        <List
          dataSource={plans}
          locale={{ emptyText: "ยังไม่มีรอบงาน" }}
          renderItem={(p: D) => (
            <List.Item
              actions={[
                <Button
                  key="open"
                  aria-label={`เปิดรอบ ${p.name}`}
                  onClick={() => void open(p.id)}
                  disabled={busy}
                >
                  เปิดรอบ
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space wrap>
                    <Text strong>{p.name}</Text>
                    <Tag color="green">{states[p.status]}</Tag>
                  </Space>
                }
                description={`${p.department_name || ""} · ${p.leader_name || ""} · ${p.stop_count ?? p.stops?.length ?? 0} จุด${p.team_name ? " · " + p.team_name : ""}`}
              />
            </List.Item>
          )}
        />
      </Card>
      {active && active.history?.length > 0 && (
        <Card title="ประวัติรอบงาน">
          <List
            dataSource={active.history}
            renderItem={(h: D) => (
              <List.Item>
                <div>
                  <Text strong>
                    {h.actor_name} · {roleNames[h.actor_role] || h.actor_role}
                  </Text>
                  <Paragraph>
                    {(
                      {
                        ROUTE_CALCULATE: "คำนวณเส้นทาง",
                        ROUTE_PROPOSE: "เสนอรอบงาน",
                        ROUTE_CONFIRM: "ยืนยันทีม",
                        ROUTE_DECLINE: "ส่งกลับรอบงาน",
                        ROUTE_CANCEL: "ยกเลิกรอบงาน",
                      } as D
                    )[h.action] || h.action}{" "}
                    · {date(h.created_at)}
                  </Paragraph>
                  {h.reason && <Paragraph>{h.reason}</Paragraph>}
                </div>
              </List.Item>
            )}
          />
        </Card>
      )}
      <Modal
        open={!!decision}
        title={decision === "decline" ? "ส่งกลับรอบงาน" : "ยกเลิกรอบงาน"}
        onCancel={() => !busy && setDecision(undefined)}
        onOk={() => {
          if (!reason.trim()) {
            setReasonError("กรุณาระบุเหตุผล");
            return;
          }
          void change(decision!, { reason });
        }}
        okText="ยืนยัน"
        cancelText="กลับไปตรวจสอบ"
        confirmLoading={busy}
      >
        <label>
          เหตุผล
          <Input.TextArea
            aria-label="เหตุผลของรอบงาน"
            disabled={busy}
            rows={4}
            value={reason}
            maxLength={4000}
            onChange={(e) => {
              setReason(e.target.value);
              setReasonError("");
            }}
          />
        </label>
        {reasonError && <Alert type="error" message={reasonError} />}
      </Modal>
    </section>
  );
}
