import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';

const FILE = 'e2e/.auth/user.json';

/* ล็อกอินครั้งเดียว เก็บ session ไว้ให้ทุกเทสในโปรเจกต์ app ใช้ต่อ
   ไม่มีบัญชีเทสใน .env.e2e → เขียน state ว่างไว้ แล้วเทส app จะ skip เอง */
setup('ล็อกอินด้วยบัญชีเทส', async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    fs.mkdirSync('e2e/.auth', { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ cookies: [], origins: [] }));
    setup.skip(true, 'ยังไม่ได้ตั้ง E2E_EMAIL / E2E_PASSWORD ใน .env.e2e');
    return;
  }
  await page.goto('/');
  await page.getByLabel('อีเมล').fill(email);
  await page.getByLabel('รหัสผ่าน').fill(password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page.getByRole('heading', { name: 'เข้าสู่ระบบ' })).toBeHidden({ timeout: 20_000 });
  await page.context().storageState({ path: FILE });
});
