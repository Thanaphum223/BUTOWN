import errors from "./locales/errors.en";
import shared from "./locales/shared.en";
import auth from "./locales/auth.en";
import citizen from "./locales/citizen.en";
import staff from "./locales/staff.en";
import admin from "./locales/admin.en";
export const englishMessages: Record<string, string> = {
  "เซสชันหมดอายุหรือออกจากระบบแล้ว กรุณาเข้าสู่ระบบอีกครั้ง":
    "Your session has expired or you have signed out. Please sign in again.",
  ...errors,
  ...shared,
  ...auth,
  ...citizen,
  ...staff,
  ...admin,
};
