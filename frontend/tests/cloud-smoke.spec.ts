import { test, expect, type Page } from '@playwright/test';
const adminPassword = process.env.TT_BOOTSTRAP_PASSWORD;
const demoPassword = process.env.TT_DEMO_PASSWORD;
test.skip(!adminPassword || !demoPassword, 'Requires isolated CI demo accounts');
async function login(page: Page, role: string) {
  await page.goto('/');
  await page.getByLabel('ชื่อผู้ใช้', { exact: true }).fill(role);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill((role === 'admin' ? adminPassword : demoPassword)!);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  if (role === 'citizen') {
    await page.getByRole('button', { name: 'รับทราบประกาศ', exact: true }).click();
    await expect(page.getByRole('button', { name: 'ออกจากระบบ', exact: true })).toBeVisible();
  } else {
    await expect(page.getByRole('heading', { name: role === 'field' ? 'งานลงพื้นที่ของฉัน' : 'ภาพรวมการดำเนินงาน', exact: true })).toBeVisible();
  }
}
for (const role of ['officer', 'leader', 'field', 'approver', 'admin']) {
  test(`${role}: queue and completed history remain accessible`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await login(page, role);
    await page.getByRole('menuitem', { name: /คิวงาน/ }).click();
    await expect(page.getByRole('searchbox', { name: 'ค้นหาเลขเรื่อง / หัวข้อ' })).toBeVisible();
    await page.getByRole('button', { name: 'รอรับเรื่อง', exact: true }).click();
    await expect(page.getByRole('button', { name: 'รอรับเรื่อง', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('menuitem', { name: /ประวัติงาน/ }).click();
    await expect(page.getByRole('heading', { name: 'ประวัติงาน', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ปิดเรื่อง', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
test('field worker can use mobile menu without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'field');
  await page.getByRole('button', { name: 'เปิดเมนูหลัก' }).click();
  await page.getByRole('menuitem', { name: /ประวัติงาน/ }).click();
  await expect(page.getByRole('heading', { name: 'ประวัติงาน', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
test('citizen privacy notice and report location confirmation work', async ({ page }) => {
  await login(page, 'citizen');
  await page.getByRole('link', { name: /แจ้งปัญหา/ }).click();
  await page.getByLabel('สถานที่ / จุดสังเกต', { exact: true }).fill('สถานที่ทดสอบ CI');
  await page.getByRole('button', { name: 'ถัดไป', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'ยืนยันตำแหน่งจุดเกิดเหตุ' });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText('สถานที่ทดสอบ CI');
  await confirmation.getByRole('button', { name: 'ยืนยันตำแหน่ง', exact: true }).click();
  await expect(page.getByLabel('หัวข้อปัญหา', { exact: true })).toBeVisible();
});
test('admin selects a registered account to assign a role without password entry', async ({ page }) => {
  await login(page, 'admin');
  await page.getByRole('menuitem', { name: /จัดการระบบ/ }).click();
  await page.getByRole('button', { name: 'กำหนดบทบาทให้บัญชีที่มีอยู่', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'กำหนดบทบาทให้บัญชีที่มีอยู่' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input[type=password]')).toHaveCount(0);
  const account = dialog.getByRole('combobox', { name: 'ค้นหาบัญชีที่สมัครไว้แล้ว' });
  await account.fill('citizen');
  await page.getByText('citizen — บัญชีทดสอบ CITIZEN', { exact: true }).click();
  await expect(dialog).toContainText('บทบาทปัจจุบัน: ประชาชน');
  await expect(dialog.getByRole('combobox', { name: 'บทบาทที่ต้องการ' })).toBeVisible();
});
test('new citizen registration appears to admin and keeps password after promotion', async ({ page, playwright, baseURL }) => {
  await login(page, 'admin');
  await page.getByRole('menuitem', { name: /จัดการระบบ/ }).click();
  await expect(page.getByRole('button', { name: 'กำหนดบทบาทให้บัญชีที่มีอยู่', exact: true })).toBeVisible();
  const newcomer = await playwright.request.newContext({ baseURL });
  try {
    const towns = await (await newcomer.get('/api/public/municipalities')).json();
    const csrf = await (await newcomer.get('/api/auth/csrf')).json();
    const username = `newcitizen_${Date.now()}`;
    const password = `Citizen-test-${Date.now()}-A1`;
    const created = await newcomer.post('/api/auth/register', { headers: { [csrf.headerName]: csrf.token }, data: { municipalityId: towns[0].id, username, displayName: 'New citizen test', password } });
    expect(created.ok()).toBeTruthy();
    await page.getByRole('button', { name: 'กำหนดบทบาทให้บัญชีที่มีอยู่', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'กำหนดบทบาทให้บัญชีที่มีอยู่' });
    await dialog.getByRole('combobox', { name: 'ค้นหาบัญชีที่สมัครไว้แล้ว' }).fill(username);
    await page.getByText(`${username} — New citizen test`, { exact: true }).click();
    await expect(dialog).toContainText('บทบาทปัจจุบัน: ประชาชน');
    await dialog.getByRole('combobox', { name: 'บทบาทที่ต้องการ' }).press('ArrowDown');
    await page.getByText('เจ้าหน้าที่', { exact: true }).last().click();
    await dialog.getByRole('combobox', { name: 'หน่วยงาน', exact: true }).press('ArrowDown');
    await page.getByText('กองช่าง', { exact: true }).last().click();
    await dialog.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const freshCsrf = await (await newcomer.get('/api/auth/csrf')).json();
    const signedIn = await newcomer.post('/api/auth/login', { headers: { [freshCsrf.headerName]: freshCsrf.token }, form: { username, password } });
    expect(signedIn.ok()).toBeTruthy();
    const user = await (await newcomer.get('/api/auth/me')).json();
    expect(user.role).toBe('OFFICER');
    expect(user.username).toBe(username);
  } finally { await newcomer.dispose(); }
});
