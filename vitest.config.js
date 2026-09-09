import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// default = node (pure logic tests · เร็วสุด · ไม่แตะ DOM/Supabase)
// component/DOM tests = ไฟล์ .test.jsx ที่ประกาศ `// @vitest-environment jsdom` ที่หัวไฟล์ (TEST-1 E2E env · RTL)
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }, // ให้ตรงกับ vite.config.js (component test ต้อง resolve '@/components/ui/*')
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'src/**/*.test.jsx'],
    /* เครื่อง CI (2 core, แชร์กับงานอื่น) ช้ากว่าเครื่อง dev หลายเท่า
       ดีฟอลต์ 5 วิ ทำให้เทส DOM ที่รอ state async ตายก่อน waitFor จะยอมแพ้ด้วยซ้ำ
       → CI แดงเป็นครั้งคราวทั้งที่โค้ดถูก (เจอจริง 9 ก.ย. 69 บน commit bdd3ab1)
       เทสพวกนี้รอ "ค่าโผล่บนจอ" ไม่ได้วัดความเร็ว จึงยืดได้ปลอดภัย */
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
