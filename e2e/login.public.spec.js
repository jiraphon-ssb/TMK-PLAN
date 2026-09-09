import { test, expect } from '@playwright/test';

/* หน้าเข้าสู่ระบบ — ด่านแรกของทุกคน ถ้าหน้านี้พังคือใช้งานไม่ได้ทั้งระบบ */
test.describe('หน้าเข้าสู่ระบบ (ไม่ต้องล็อกอิน)', () => {
  test('เปิดแล้วเห็นฟอร์มครบ ไม่ขาว ไม่มี error ใน console', async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e)));

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'เข้าสู่ระบบ' })).toBeVisible();
    await expect(page.getByLabel('อีเมล')).toBeVisible();
    await expect(page.getByLabel('รหัสผ่าน')).toBeVisible();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();

    // กันหน้าขาว: body ต้องมีข้อความจริง
    expect((await page.locator('body').innerText()).length).toBeGreaterThan(20);
    // error ที่ยอมได้: ไม่มี
    expect(errors.filter(e => !/favicon|manifest/i.test(e))).toEqual([]);
  });

  test('ปุ่มเข้าสู่ระบบล็อกไว้จนกว่าจะกรอกครบ + ยอมรับข้อตกลง', async ({ page }) => {
    await page.goto('/');
    const submit = page.getByRole('button', { name: 'เข้าสู่ระบบ' });
    await expect(submit).toBeDisabled();                       // ยังไม่กรอกอะไรเลย
    await page.getByLabel('อีเมล').fill('someone@example.com');
    await page.getByLabel('รหัสผ่าน').fill('placeholder');
    await expect(submit).toBeDisabled();                       // ยังไม่ติ๊กยอมรับข้อตกลง
    // ติ๊ก "ยอมรับข้อตกลง" → เด้ง popup ข้อตกลง ต้องกดยอมรับก่อน (ดีไซน์ตั้งใจ)
    await page.locator('#terms').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'ยอมรับและดำเนินการต่อ' }).click();
    await expect(submit).toBeEnabled();
  });

  test('มือถือ 390px: ไม่มีการเลื่อนแนวนอน', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'เข้าสู่ระบบ' })).toBeVisible();
    const { scroll, client } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth,
    }));
    expect(scroll).toBeLessThanOrEqual(client + 1);
  });
});
