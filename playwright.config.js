/* ============================================================
   playwright.config.js — เทส E2E ของจริง (PART 116)
   ============================================================
   เดิมมีแต่เทส unit/DOM (vitest) — ไม่มีเทสที่ "เดินทั้งเส้น" บนเบราว์เซอร์จริงเลย
   ชุดนี้แบ่ง 2 project:
     public — ไม่ต้องล็อกอิน (หน้าเข้าสู่ระบบ · กันหน้าขาว · service worker) → รันได้ทันที
     app    — ต้องล็อกอิน: ใส่บัญชีเทสไว้ใน .env.e2e (ดู .env.e2e.example) แล้วสั่ง npm run e2e
              ไม่มีไฟล์/ตัวแปร = ข้ามอัตโนมัติ (ไม่ทำ CI แดง)
   ============================================================ */
import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';

// อ่าน .env.e2e เอง (ไม่พึ่ง dotenv · ไฟล์นี้ไม่เข้า git)
if (fs.existsSync('.env.e2e')) {
  for (const line of fs.readFileSync('.env.e2e', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = Number(process.env.E2E_PORT || 5173);

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'th-TH',
  },
  projects: [
    { name: 'public', testMatch: /.*\.public\.spec\.js/, use: { ...devices['Desktop Chrome'] } },
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    { name: 'app', testMatch: /.*\.app\.spec\.js/, dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' } },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
