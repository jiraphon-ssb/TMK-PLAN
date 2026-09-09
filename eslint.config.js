import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // dist = build output · .claude = worktrees/สคริปต์ผู้ช่วย (ไม่ใช่ซอร์สจริง — อย่า lint ซ้ำ)
  globalIgnores(['dist', '.claude']),

  // ไฟล์ config รันบน Node (require/module/process) — ให้ node globals กัน no-undef
  {
    files: ['*.config.js', 'tailwind.config.js', 'postcss.config.js', 'vite.config.js', 'vitest.config.js', 'playwright.config.js', 'e2e/**/*.js'],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // ตัวแปร/อาร์กิวเมนต์ที่ขึ้นต้นด้วย _ = ตั้งใจทิ้ง (เช่น destructure เพื่อตัดคีย์ออก) — ไม่ต้องเตือน
      'no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],

      // ── noise: ไฟล์นี้ export component + helper ปนกัน (ตั้งใจ) → ปิดทิ้ง ไม่ใช่บั๊ก ──
      'react-refresh/only-export-components': 'off',

      // ── กฎแนว React Compiler (v6) — โปรเจคยังไม่เปิด compiler → ลดเป็น "warn" ให้เห็นแนวโน้ม ──
      //    ไม่บล็อก CI (การแก้ทั้งหมดพร้อมกัน = เสี่ยง regression) · ค่อยๆ เก็บทีละส่วน
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },

  // parser ใบเสร็จ/ข้อความไทย: ใช้ \0 มาร์ควรรณยุกต์ + ช่วง unicode ไทย + mask โดยตั้งใจ
  // → ปิดกฎ regex ที่จับ pattern พวกนี้เฉพาะไฟล์ (ไม่ใช่บั๊ก เป็น domain logic)
  {
    files: ['src/lib/receiptParse.js', 'src/lib/mpReport.js'],
    rules: {
      'no-control-regex': 'off',
      'no-misleading-character-class': 'off',
      'no-irregular-whitespace': 'off',
    },
  },
])
