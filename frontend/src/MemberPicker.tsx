import { useState } from "react";
import { Button, Checkbox, Empty, Input, Tag, Typography } from "antd";
import { CloseOutlined, StarFilled, StarOutlined } from "@ant-design/icons";
import { useI18n } from "./i18n/useI18n";

type D = Record<string, any>;

// Field staff grouped by Gov rank, ticked by row or a whole rank at once. Picked people sit in
// a bar on top where a star marks the team representative, so it can only be a member.
export default function MemberPicker({
  people,
  teams = [],
  value = [],
  onChange,
  representative,
  onRepresentativeChange,
}: {
  people: D[];
  teams?: D[];
  value?: string[];
  onChange?: (ids: string[]) => void;
  representative?: string;
  onRepresentativeChange: (id: string | undefined) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const byId = new Map(people.map((person) => [person.id, person]));
  const teamsOf = (id: string) =>
    teams
      .filter((team) => {
        try {
          return (JSON.parse(team.members || "[]") as D[]).some((m) => m.id === id);
        } catch {
          return false;
        }
      })
      .map((team) => team.name as string);
  const set = (ids: string[]) => {
    onChange?.(ids);
    if (!representative || !ids.includes(representative)) onRepresentativeChange(ids[0]);
  };
  const shown = people.filter(
    (person) =>
      !q ||
      person.display_name?.toLowerCase().includes(q) ||
      person.gov_role?.toLowerCase().includes(q),
  );
  // "" collects people without a Gov rank; it is listed last.
  const ranks = [...new Set(shown.map((person) => person.gov_role || ""))].sort((a, b) =>
    a === "" ? 1 : b === "" ? -1 : a.localeCompare(b),
  );
  return (
    <div className="member-picker">
      <div className="member-picked" aria-live="polite">
        <Typography.Text strong>
          {t("เลือกแล้ว {{count}} คน", { count: value.length })}
        </Typography.Text>
        {value.length > 0 && (
          <Typography.Text type="secondary" className="member-hint">
            {t("แตะดาวเพื่อเลือกตัวแทนทีม")}
          </Typography.Text>
        )}
        <div className="member-chips">
          {value.map((id) => {
            const name = byId.get(id)?.display_name ?? id;
            const lead = id === representative;
            return (
              <span key={id} className={lead ? "member-chip member-chip-lead" : "member-chip"}>
                <Button
                  type="text"
                  size="small"
                  aria-pressed={lead}
                  aria-label={t("ตั้ง {{name}} เป็นตัวแทนทีม", { name })}
                  icon={lead ? <StarFilled /> : <StarOutlined />}
                  onClick={() => onRepresentativeChange(id)}
                />
                <span>{name}</span>
                <Button
                  type="text"
                  size="small"
                  aria-label={t("เอา {{name}} ออก", { name })}
                  icon={<CloseOutlined />}
                  onClick={() => set(value.filter((x) => x !== id))}
                />
              </span>
            );
          })}
        </div>
      </div>
      <Input.Search
        allowClear
        aria-label={t("ค้นหาชื่อหรือยศ")}
        placeholder={t("ค้นหาชื่อหรือยศ")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {ranks.map((rank) => {
        const group = shown.filter((person) => (person.gov_role || "") === rank);
        const ids = group.map((person) => person.id as string);
        const all = ids.every((id) => value.includes(id));
        const label = rank || t("ไม่ระบุยศ");
        return (
          <section key={rank || "-"} className="member-rank" aria-label={label}>
            <div className="member-rank-heading">
              <Typography.Text strong>
                {label} · {group.length}
              </Typography.Text>
              <Button
                size="small"
                aria-label={
                  all
                    ? t("ยกเลิกทั้งยศ {{rank}}", { rank: label })
                    : t("เลือกทั้งยศ {{rank}}", { rank: label })
                }
                onClick={() =>
                  set(
                    all
                      ? value.filter((id) => !ids.includes(id))
                      : [...value, ...ids.filter((id) => !value.includes(id))],
                  )
                }
              >
                {all ? t("ยกเลิกทั้งยศ") : t("เลือกทั้งยศ")}
              </Button>
            </div>
            <div className="member-rows">
              {group.map((person) => {
                const others = teamsOf(person.id);
                return (
                  <Checkbox
                    key={person.id}
                    checked={value.includes(person.id)}
                    onChange={(e) =>
                      set(
                        e.target.checked
                          ? [...value, person.id]
                          : value.filter((id) => id !== person.id),
                      )
                    }
                  >
                    <span className="member-name">{person.display_name}</span>
                    {person.gov_role && <Tag>{person.gov_role}</Tag>}
                    {others.map((name) => (
                      <Tag key={name} color="orange">
                        {t("อยู่ทีม {{name}} แล้ว", { name })}
                      </Tag>
                    ))}
                  </Checkbox>
                );
              })}
            </div>
          </section>
        );
      })}
      {!shown.length && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("ไม่พบผู้ลงพื้นที่ที่ค้นหา")} />
      )}
    </div>
  );
}
