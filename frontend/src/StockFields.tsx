import { Alert, Button, Form, Input, InputNumber, Select, Typography } from "antd";
import { DeleteOutlined, PlusOutlined } from "./icons";
import { amount } from "./format";
import { useI18n } from "./i18n/useI18n";

type D = Record<string, any>;

export function stockOptions(items: D[], t: (key: string, params?: D) => string) {
  return items.map((item) => ({
    value: item.id,
    label: t("{{name}} · คงเหลือ {{left}} {{unit}}", {
      name: item.name,
      left: amount(item.available ?? item.on_hand),
      unit: item.unit,
    }),
    disabled: Number(item.available ?? item.on_hand) <= 0,
  }));
}

// Consumables taken from the store when work starts. Approved request items are issued
// automatically; equipment needs an approved request first (clause 208(2)).
export function StockTaken({ items, approved }: { items: D[]; approved: boolean }) {
  const { t } = useI18n();
  const consumables = items.filter((item) => item.item_type !== "EQUIPMENT");
  if (!consumables.length) return null;
  return (
    <section className="stock-fields">
      <Typography.Title level={5}>
        {t("วัสดุสิ้นเปลืองที่เบิกจากคลัง (ไม่บังคับ)")}
      </Typography.Title>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message={
          approved
            ? t(
                "วัสดุในคำขอที่อนุมัติแล้วจะถูกตัดจากคลังอัตโนมัติเมื่อเริ่มงาน เพิ่มได้ถ้าต้องใช้มากกว่านั้น",
              )
            : t(
                "ไม่ได้ขอใช้ทรัพยากรล่วงหน้า? เลือกวัสดุสิ้นเปลืองที่หยิบจากคลัง ระบบจะตัดยอดเป็นใบเบิกย้อนหลังให้หัวหน้างานและผู้ดูแลคลังรับรอง ครุภัณฑ์ต้องยื่นขอใช้ทรัพยากรก่อน",
              )
        }
      />
      <Form.List name="stockItems">
        {(fields, { add, remove }) => (
          <>
            {fields.map((field, index) => (
              <div className="stock-line" key={field.key}>
                <Form.Item
                  name={[field.name, "stockItemId"]}
                  rules={[{ required: true, message: t("กรุณาเลือกวัสดุ") }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    aria-label={t("วัสดุรายการที่ ") + (index + 1)}
                    placeholder={t("เลือกวัสดุ")}
                    options={stockOptions(consumables, t)}
                  />
                </Form.Item>
                <Form.Item
                  name={[field.name, "quantity"]}
                  rules={[{ required: true, type: "number", min: 0.01 }]}
                >
                  <InputNumber
                    aria-label={t("จำนวนที่เบิก ") + (index + 1)}
                    min={0.01}
                    precision={2}
                    inputMode="decimal"
                    placeholder={t("จำนวน")}
                  />
                </Form.Item>
                <Button
                  icon={<DeleteOutlined />}
                  danger
                  aria-label={t("ลบรายการ ") + (index + 1)}
                  onClick={() => remove(field.name)}
                />
              </div>
            ))}
            <Button icon={<PlusOutlined />} onClick={() => add({ quantity: 1 })}>
              {t("เพิ่มวัสดุจากคลัง")}
            </Button>
          </>
        )}
      </Form.List>
    </section>
  );
}

// With the report, the team says how much of each issued item comes back to the store.
export function StockReturns({ held }: { held: D[] }) {
  const { t } = useI18n();
  if (!held.length) return null;
  return (
    <section className="stock-fields">
      <Typography.Title level={5}>{t("คืนวัสดุที่เหลือเข้าคลัง")}</Typography.Title>
      <Typography.Paragraph type="secondary">
        {t("ระบุจำนวนที่เหลือนำกลับคืน ส่วนที่ไม่คืนจะนับเป็นวัสดุที่ใช้ไปในงานนี้")}
      </Typography.Paragraph>
      {held.some((line) => line.item_type === "EQUIPMENT") && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={t(
            "รายการครุภัณฑ์ต้องนำส่งคืนคลังให้ครบ หากชำรุด/สูญหายให้ระบุหมายเหตุและแจ้งผู้ดูแลคลัง",
          )}
        />
      )}
      <Form.List name="stockReturns">
        {(fields) =>
          fields.map((field, index) => {
            const line = held[index];
            if (!line) return null;
            return (
              <div className="stock-line" key={field.key}>
                <Form.Item name={[field.name, "stockItemId"]} hidden>
                  <input />
                </Form.Item>
                <Typography.Text className="stock-line-name">
                  {t("{{name}} · เบิกไป {{held}} {{unit}}", {
                    name: line.name,
                    held: amount(line.used),
                    unit: line.unit,
                  })}
                </Typography.Text>
                <Form.Item
                  name={[field.name, "quantity"]}
                  rules={[{ type: "number", min: 0, max: Number(line.used) }]}
                >
                  <InputNumber
                    aria-label={t("จำนวนที่คืน {{name}}", { name: line.name })}
                    min={0}
                    max={Number(line.used)}
                    precision={2}
                    inputMode="decimal"
                    addonAfter={line.unit}
                  />
                </Form.Item>
                {line.item_type === "EQUIPMENT" && (
                  <>
                    <Form.Item
                      name={[field.name, "condition"]}
                      initialValue="GOOD"
                      rules={[{ required: true }]}
                    >
                      <Select
                        aria-label={t("สภาพครุภัณฑ์ {{name}}", { name: line.name })}
                        options={[
                          { value: "GOOD", label: t("ปกติ") },
                          { value: "DAMAGED", label: t("ชำรุด") },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item shouldUpdate>
                      {({ getFieldValue }) =>
                        getFieldValue(["stockReturns", field.name, "condition"]) === "DAMAGED" ? (
                          <Form.Item
                            name={[field.name, "conditionNote"]}
                            rules={[
                              { required: true, whitespace: true, max: 500 },
                            ]}
                          >
                            <Input.TextArea
                              aria-label={t("หมายเหตุสภาพชำรุด {{name}}", { name: line.name })}
                              placeholder={t("ระบุสภาพความชำรุดของครุภัณฑ์")}
                              maxLength={500}
                              autoSize={{ minRows: 2 }}
                            />
                          </Form.Item>
                        ) : null
                      }
                    </Form.Item>
                  </>
                )}
              </div>
            );
          })
        }
      </Form.List>
    </section>
  );
}
