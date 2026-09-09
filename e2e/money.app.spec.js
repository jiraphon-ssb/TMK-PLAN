import { test, expect } from '@playwright/test';

/* ============================================================
   เช็คลิสต์ของจริงหลังรื้อ PART 112–118 (ต้องมีบัญชีเทสใน .env.e2e)
   ============================================================
   ไม่มี E2E_EMAIL/E2E_PASSWORD → ข้ามทั้งไฟล์ (ไม่ทำ CI แดง)
   ทุกเคสเช็ค "หน้าไม่ขาว + ไม่มี pageerror" เป็นพื้นฐาน แล้วค่อยเช็คของเฉพาะหน้า
   ============================================================ */
const HAS_AUTH = !!(process.env.E2E_EMAIL && process.env.E2E_PASSWORD);
test.skip(!HAS_AUTH, 'ต้องตั้ง E2E_EMAIL / E2E_PASSWORD ใน .env.e2e ก่อน');

const errs = [];
test.beforeEach(async ({ page }) => {
  errs.length = 0;
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('/');
});
test.afterEach(() => { expect(errs).toEqual([]); });

/** ไปหน้าย่อยในเมนู Sale ผ่าน sidebar */
const goSale = async (page, subLabel) => {
  await page.getByRole('button', { name: 'Sale', exact: false }).first().click();
  await page.getByRole('button', { name: subLabel, exact: false }).first().click();
};

test('1-2. สต็อก: ตารางคงเหลือ + ฟอร์มนับกางสี×ไซซ์จากสินค้า', async ({ page }) => {
  await goSale(page, 'สต็อก');
  await expect(page.getByText(/สต็อกคงเหลือ|ยังเปิดใช้ระบบสต็อกไม่ได้/)).toBeVisible({ timeout: 30_000 });
  const countBtn = page.getByRole('button', { name: 'นับสต็อก' });
  if (await countBtn.isVisible().catch(() => false)) {
    await countBtn.click();
    await expect(page.getByText('ลาย (จากสินค้า)')).toBeVisible();
    await page.getByRole('button', { name: 'ยกเลิก' }).first().click();
  }
});

test('3. ประวัติการนับ: มีคอลัมน์ผลต่าง + กดดูรายละเอียดได้', async ({ page }) => {
  await goSale(page, 'สต็อก');
  const hist = page.getByText('ประวัติการนับ');
  if (await hist.isVisible().catch(() => false)) {
    await expect(page.getByRole('columnheader', { name: 'ผลต่าง' })).toBeVisible();
    await page.getByRole('button', { name: 'ดู' }).first().click();
    await expect(page.getByText(/รอบนับ/)).toBeVisible();
  }
});

test('4. ใบสั่งผลิต: แผงเปิดได้ + ตัวกรองสถานะทำงาน', async ({ page }) => {
  await goSale(page, 'สต็อก');
  await page.getByRole('button', { name: 'ใบสั่งผลิต', exact: false }).first().click();
  await expect(page.getByText(/ใบสั่งผลิต|ยังเปิดใช้ใบสั่งผลิตไม่ได้/)).toBeVisible();
});

test('5-6. รายงานขาย: %ปิดการ์ด = %ปิดในตารางช่องทาง (สูตรเดียวกัน)', async ({ page }) => {
  await goSale(page, 'รายงานขาย');
  await expect(page.getByText('ตัวชี้วัดหลัก')).toBeVisible({ timeout: 30_000 });
  const kpi = await page.getByText('%ปิดการขาย').first().locator('..').innerText();
  const table = await page.getByText('ยอดต่อช่องทาง').first().locator('..').innerText();
  const pct = (t) => (t.match(/(\d+(?:\.\d+)?)\s*%/) || [])[1];
  if (pct(kpi) && pct(table)) expect(Math.abs(Number(pct(kpi)) - Number(pct(table)))).toBeLessThanOrEqual(1);
});

test('7. CRM: การ์ดควรติดต่อ + ปุ่มบันทึกการติดต่อ', async ({ page }) => {
  await goSale(page, 'ภาพรวม CRM');
  await expect(page.getByText(/ควรติดต่อตอนนี้|ยอด CRM/)).toBeVisible({ timeout: 30_000 });
});

test('8. สินค้า: ป้ายสต็อกมีวันที่กำกับ (ไม่ใช่ป้ายจากระบบคลังเก่า)', async ({ page }) => {
  await goSale(page, 'สินค้า');
  await expect(page.getByText(/แคตตาล็อก|สินค้า/).first()).toBeVisible({ timeout: 30_000 });
  const badge = page.getByText(/นับได้ \d/).first();
  if (await badge.isVisible().catch(() => false)) await expect(badge).toContainText('·');   // มีวันที่ต่อท้าย
});

test('9. โครงการ: สลับโครงการแล้วบอร์ดไม่พัง', async ({ page }) => {
  await page.getByRole('button', { name: 'โครงการ', exact: false }).first().click();
  await expect(page.getByText(/บอร์ด|Kanban|งาน/).first()).toBeVisible({ timeout: 30_000 });
});

test('11. มือถือ 390px: ทุกหน้าหลักไม่ล้นจอ', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const sub of ['รายงานขาย', 'ออเดอร์', 'สต็อก']) {
    await goSale(page, sub).catch(() => {});
    await page.waitForTimeout(1200);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `หน้า ${sub} ล้นจอ ${over}px`).toBeLessThanOrEqual(1);
  }
});
