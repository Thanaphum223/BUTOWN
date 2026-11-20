import { getLanguage } from "./core";

// Names of the default municipal categories (MunicipalCategories.java). Category names are
// municipal data, so only these exact names are translated; custom ones stay as written.
const english: Record<string, string> = {
  ถนนและทางเท้า: "Roads and footpaths",
  "ท่อระบายน้ำ / น้ำท่วมขัง": "Drains / standing floodwater",
  ไฟส่องสว่างสาธารณะ: "Street lighting",
  "ขยะตกค้าง / ลักลอบทิ้งขยะ": "Uncollected rubbish / illegal dumping",
  "น้ำเสีย / กลิ่นเหม็น": "Wastewater / bad smells",
  "เสียงดัง / ฝุ่นควัน / เหตุรำคาญ": "Noise / dust and smoke / nuisance",
  "ต้นไม้ / กิ่งไม้รบกวนทางสาธารณะ": "Trees / branches blocking public ways",
  "ต้นไม้ล้ม / กิ่งไม้เสี่ยงอันตราย": "Fallen trees / dangerous branches",
  "ประปาเทศบาล / น้ำไม่ไหล / ท่อแตก": "Municipal water supply / no water / burst pipes",
  สิ่งกีดขวางทางสาธารณะ: "Obstructions on public ways",
  "ป้ายจราจร / สัญญาณไฟในความดูแลเทศบาล": "Municipal traffic signs / signals",
  "สัตว์จรจัด / สัตว์ก่อเหตุเดือดร้อน": "Stray animals / animal nuisance",
  "ยุงลาย / แหล่งเพาะโรค": "Mosquitoes / disease breeding sites",
  "สุขาภิบาลตลาด / อาหาร / สถานประกอบการ": "Market, food and business hygiene",
  "อาคาร / การก่อสร้างผิดข้อบัญญัติ": "Buildings / construction breaching bylaws",
  "อาคารเสี่ยงอันตราย / ก่อสร้างผิดข้อบัญญัติ":
    "Dangerous buildings / construction breaching bylaws",
  "สวนสาธารณะ / สนามเด็กเล่น / ลานกีฬา": "Parks / playgrounds / sports grounds",
  "คลอง / ทางน้ำสาธารณะ": "Canals / public waterways",
  "โรงเรียน / ศูนย์พัฒนาเด็กเล็กของเทศบาล": "Municipal schools / childcare centres",
  "สวัสดิการเด็ก / ผู้สูงอายุ / ผู้พิการ":
    "Welfare for children / older people / people with disabilities",
  "พื้นที่สาธารณะ / ทรัพย์สินเทศบาลชำรุด": "Damaged public spaces / municipal property",
  "สุสาน / ฌาปนสถานในความดูแลเทศบาล": "Municipal cemeteries / crematoria",
  "บริการเทศบาล / การปฏิบัติงานเจ้าหน้าที่": "Municipal services / staff conduct",
  "อื่น ๆ (ในอำนาจหน้าที่เทศบาล)": "Other (within municipal duties)",
};

export function categoryLabel(name: string): string {
  return getLanguage() === "en" && Object.prototype.hasOwnProperty.call(english, name)
    ? english[name]
    : name;
}
