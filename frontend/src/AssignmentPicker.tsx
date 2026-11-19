import { useState } from "react";
import {
  Checkbox,
  Empty,
  Form,
  Input,
  Radio,
  Segmented,
  Tag,
  Typography,
  type FormInstance,
} from "antd";
import { useI18n } from "./i18n/useI18n";

type D = Record<string, any>;

function memberNames(team: D): string[] {
  try {
    return (JSON.parse(team.members || "[]") as D[]).map((m) => m.name);
  } catch {
    return [];
  }
}

// Tap-to-choose lists replace long dropdowns. The form submits teamId, or assigneeId plus
// memberIds when several individuals are ticked.
export default function AssignmentPicker({
  form,
  teams,
  people,
}: {
  form: FormInstance;
  teams: D[];
  people: D[];
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  // Gov Center role codes act as ranks; "" groups people without one.
  const [rank, setRank] = useState<string>();
  const ranks = [...new Set(people.map((person) => person.gov_role || ""))].sort((a, b) =>
    a === "" ? 1 : b === "" ? -1 : a.localeCompare(b),
  );
  const teamId = Form.useWatch("teamId", form);
  const assigneeId = Form.useWatch("assigneeId", form);
  const memberIds: string[] | undefined = Form.useWatch("memberIds", form);
  const picked = memberIds ?? (assigneeId && !teamId ? [assigneeId] : []);
  const q = query.trim().toLowerCase();
  const matches = (...names: (string | undefined)[]) =>
    !q || names.some((name) => name?.toLowerCase().includes(q));
  const shownTeams = teams.filter((team) =>
    matches(team.name, team.representative_name, ...memberNames(team)),
  );
  const shownPeople = people.filter(
    (person) =>
      matches(person.display_name, person.gov_role) &&
      (rank === undefined || (person.gov_role || "") === rank),
  );
  const pick = (chosen: string[]) => {
    const ids = people.map((person) => person.id).filter((id) => chosen.includes(id));
    const representative = ids.includes(assigneeId) ? assigneeId : ids[0];
    form.setFieldsValue({
      teamId: undefined,
      assigneeId: representative,
      memberIds: ids.length > 1 ? ids : undefined,
    });
  };
  return (
    <div className="assignment-picker">
      <Form.Item name="teamId" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="assigneeId" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="memberIds" hidden>
        <Input />
      </Form.Item>
      <Input.Search
        allowClear
        aria-label={t("ค้นหาทีมหรือผู้ลงพื้นที่")}
        placeholder={t("ค้นหาทีมหรือผู้ลงพื้นที่")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {teams.length > 0 && (
        <section>
          <Typography.Title level={5}>{t("เลือกทีม")}</Typography.Title>
          <Radio.Group
            aria-label={t("เลือกทีม")}
            className="assignment-options"
            value={teamId}
            onChange={(e) =>
              form.setFieldsValue({
                teamId: e.target.value,
                assigneeId: undefined,
                memberIds: undefined,
              })
            }
          >
            {shownTeams.map((team) => (
              <Radio key={team.id} value={team.id}>
                <strong>{team.name}</strong>
                <Typography.Text type="secondary" className="assignment-members">
                  {t("ผู้แทนทีม")}: {team.representative_name}
                  {memberNames(team).length > 0 && " · " + memberNames(team).join(", ")}
                </Typography.Text>
              </Radio>
            ))}
          </Radio.Group>
          {!shownTeams.length && (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("ไม่พบทีมที่ค้นหา")} />
          )}
        </section>
      )}
      <section>
        <Typography.Title level={5}>{t("เลือกผู้ลงพื้นที่ (เลือกได้หลายคน)")}</Typography.Title>
        {ranks.length > 1 && (
          <Segmented
            aria-label={t("กรองตามยศ")}
            className="assignment-ranks"
            value={rank ?? "*"}
            onChange={(value) => setRank(value === "*" ? undefined : String(value))}
            options={[
              { value: "*", label: t("ทุกยศ") },
              ...ranks.map((code) => ({
                value: code,
                label: code || t("ไม่ระบุยศ"),
              })),
            ]}
          />
        )}
        {/* Standalone checkboxes: a controlled Checkbox.Group syncs its value in an effect, so a
            tick shows the old selection right after each tap. */}
        <div
          role="group"
          aria-label={t("ผู้ลงพื้นที่")}
          className="ant-checkbox-group assignment-options"
        >
          {shownPeople.map((person) => (
            <Checkbox
              key={person.id}
              value={person.id}
              checked={!teamId && picked.includes(person.id)}
              onChange={(e) =>
                pick(
                  e.target.checked
                    ? [...(teamId ? [] : picked), person.id]
                    : picked.filter((id) => id !== person.id),
                )
              }
            >
              {person.display_name}
              {person.gov_role && <Tag className="assignment-rank">{person.gov_role}</Tag>}
            </Checkbox>
          ))}
        </div>
        {!shownPeople.length && (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t("ไม่พบผู้ลงพื้นที่ที่ค้นหา")}
          />
        )}
      </section>
      {!teamId && picked.length > 1 && (
        <section>
          <Typography.Title level={5}>{t("ผู้แทนทีม (ผู้รับงานหลัก)")}</Typography.Title>
          <Radio.Group
            aria-label={t("ผู้แทนทีม (ผู้รับงานหลัก)")}
            className="assignment-options"
            value={assigneeId}
            onChange={(e) => form.setFieldsValue({ assigneeId: e.target.value })}
          >
            {people
              .filter((person) => picked.includes(person.id))
              .map((person) => (
                <Radio key={person.id} value={person.id}>
                  {person.display_name}
                </Radio>
              ))}
          </Radio.Group>
        </section>
      )}
    </div>
  );
}
