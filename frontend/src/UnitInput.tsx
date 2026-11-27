import { AutoComplete, Input } from "antd";
import { useI18n } from "./i18n/useI18n";

// Units are stored in Thai as entered; the English name is only a hint in the list.
const GROUPS: { label: string; units: [string, string][] }[] = [
  {
    label: "หน่วยนับทั่วไป",
    units: [
      ["ชิ้น", "piece"],
      ["อัน", "item"],
      ["ตัว", "unit"],
      ["ลูก", "ball / bulb"],
      ["ใบ", "sheet / blade"],
      ["แผ่น", "panel / sheet"],
      ["ท่อน", "length"],
      ["เส้น", "line / strand"],
      ["แท่ง", "rod / bar"],
      ["ก้อน", "block / brick"],
      ["ดวง", "lamp"],
      ["หลอด", "tube"],
      ["ต้น", "pole / tree"],
      ["ด้าม", "handle / tool"],
      ["เล่ม", "book / blade"],
      ["เม็ด", "pellet / tablet"],
      ["ซี่", "spoke / tine"],
      ["ข้อ", "joint / fitting"],
      ["หัว", "head / nozzle"],
      ["แผง", "panel / board"],
      ["บาน", "door / window"],
      ["ป้าย", "sign"],
      ["ราง", "rail / gutter"],
      ["วง", "ring"],
      ["คู่", "pair"],
      ["ชุด", "set"],
      ["โหล", "dozen"],
      ["รายการ", "item / line"],
    ],
  },
  {
    label: "หน่วยบรรจุภัณฑ์",
    units: [
      ["ถุง", "bag"],
      ["กระสอบ", "sack"],
      ["กล่อง", "box"],
      ["ลัง", "crate"],
      ["แพ็ค", "pack"],
      ["ห่อ", "wrap"],
      ["มัด", "bundle"],
      ["ม้วน", "roll"],
      ["ขด", "coil"],
      ["ถัง", "bucket / drum"],
      ["แกลลอน", "gallon"],
      ["ขวด", "bottle"],
      ["กระป๋อง", "can"],
      ["กระปุก", "jar"],
      ["ปี๊บ", "tin (20 L)"],
      ["ซอง", "sachet / envelope"],
      ["ตลับ", "cartridge / reel"],
      ["กระบอก", "cylinder / tube"],
      ["หีบ", "chest"],
      ["ถาด", "tray"],
      ["กระถาง", "pot"],
      ["เข่ง", "basket"],
      ["พาเลท", "pallet"],
      ["รีม", "ream"],
    ],
  },
  {
    label: "หน่วยวัด ความยาว พื้นที่ ปริมาตร น้ำหนัก",
    units: [
      ["มิลลิเมตร", "millimetre"],
      ["เซนติเมตร", "centimetre"],
      ["เมตร", "metre"],
      ["กิโลเมตร", "kilometre"],
      ["นิ้ว", "inch"],
      ["ฟุต", "foot"],
      ["หลา", "yard"],
      ["วา", "wa (2 m)"],
      ["ตารางเมตร", "square metre"],
      ["ตารางฟุต", "square foot"],
      ["ตารางวา", "square wa (4 m²)"],
      ["งาน", "ngan (400 m²) / job"],
      ["ไร่", "rai (1,600 m²)"],
      ["ลูกบาศก์เมตร", "cubic metre"],
      ["คิว", "cubic metre (cue)"],
      ["มิลลิลิตร", "millilitre"],
      ["ลิตร", "litre"],
      ["กรัม", "gram"],
      ["ขีด", "100 grams"],
      ["กิโลกรัม", "kilogram"],
      ["ตัน", "tonne"],
    ],
  },
  {
    label: "ครุภัณฑ์และยานพาหนะ",
    units: [
      ["เครื่อง", "machine"],
      ["คัน", "vehicle"],
      ["ลำ", "boat"],
      ["ตู้", "cabinet"],
      ["หลัง", "building / tent"],
      ["ระบบ", "system"],
      ["จุด", "point / installation"],
    ],
  },
  {
    label: "บริการ จ้างเหมา และค่าแรง",
    units: [
      ["ครั้ง", "time / visit"],
      ["เที่ยว", "trip / load"],
      ["ชั่วโมง", "hour"],
      ["วัน", "day"],
      ["เดือน", "month"],
      ["ปี", "year"],
      ["คน", "person"],
      ["แรง", "labourer-day"],
      ["เหมา", "lump sum"],
      ["ล็อต", "lot"],
    ],
  },
];

/** A unit box that suggests the units municipal works use, plus those already in the register. */
export default function UnitInput({
  value,
  onChange,
  known = [],
  readOnly,
  ariaLabel,
  id,
}: {
  id?: string;
  value?: string;
  onChange?: (value: string) => void;
  known?: (string | undefined | null)[];
  readOnly?: boolean;
  ariaLabel?: string;
}) {
  const { t, language } = useI18n();
  const label = (th: string, en: string) => (language === "en" ? `${th} · ${en}` : th);
  const inUse = [...new Set(known.filter((u): u is string => !!u?.trim()).map((u) => u.trim()))];
  const options = [
    ...(inUse.length
      ? [
          {
            label: t("หน่วยที่ใช้ในคลัง"),
            options: inUse.map((u) => ({ value: u, label: u })),
          },
        ]
      : []),
    ...GROUPS.map((group) => ({
      label: t(group.label),
      options: group.units
        .filter(([th]) => !inUse.includes(th))
        .map(([th, en]) => ({ value: th, label: label(th, en) })),
    })),
  ];
  return (
    <AutoComplete
      id={id}
      value={value}
      onChange={onChange}
      options={options}
      open={readOnly ? false : undefined}
      filterOption={(input, option) => {
        const text = input.trim().toLowerCase();
        const entry = option as { value?: string; label?: string } | undefined;
        return !text || `${entry?.value ?? ""} ${entry?.label ?? ""}`.toLowerCase().includes(text);
      }}
    >
      <Input
        aria-label={ariaLabel}
        placeholder={t("เลือกหรือพิมพ์หน่วย เช่น ถุง ท่อน เมตร")}
        maxLength={50}
        readOnly={readOnly}
      />
    </AutoComplete>
  );
}
