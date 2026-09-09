/* ============================================================
   lazyRetry — React.lazy ที่ทน dynamic-import (chunk) ล้มเหลว
   ------------------------------------------------------------
   ปัญหาที่แก้: "error loading dynamically imported module" / "Failed to
   fetch dynamically imported module" ทำให้ทั้ง section crash

   เกิดได้ 2 กรณี:
   - DEV: Vite re-optimize deps กลางคัน → import ที่ค้างอยู่ล้มพร้อมกัน
   - PROD: deploy เวอร์ชันใหม่ → chunk hash เปลี่ยน → หน้าที่เปิดค้างโหลด
     chunk เก่าไม่เจอ (404)

   กลยุทธ์: retry สั้นๆ 2 ครั้ง (กัน dev re-optimize/เน็ตกระตุก) →
   ถ้ายังไม่ได้ เดาว่า deploy ใหม่ → reload ทั้งหน้า "ครั้งเดียว"
   (มี sessionStorage guard กัน loop) → ถ้า reload แล้วยังพัง ปล่อยให้
   ErrorBoundary จับตามเดิม
   ============================================================ */
import { lazy } from 'react';

// ตรวจว่าเป็น error โหลด chunk จริง (ไม่ใช่ error ใน component เอง)
export function isChunkLoadError(err) {
    const msg = String((err && err.message) || err || '');
    return /dynamically imported module|Failed to fetch dynamically|Importing a module script failed|error loading dynamically|ChunkLoadError|Loading chunk .* failed|Loading CSS chunk/i.test(msg);
}

function flagKey(key) { return `tmk-chunkreload:${key}`; }
const reloadedKeys = new Set();   // กันลูปเมื่อ sessionStorage ใช้ไม่ได้

// export เพื่อให้เทสยิงตรงได้ (เทสที่ไปแหย่ internals ของ React.lazy = เปราะ พิสูจน์อะไรไม่ได้)
export async function attemptImport(factory, key, attempt = 0) {
    try {
        const mod = await factory();
        // โหลดสำเร็จ → เคลียร์ guard เผื่อรอบหน้ามี deploy ใหม่จะ reload ได้อีก
        reloadedKeys.delete(key);
        try { sessionStorage.removeItem(flagKey(key)); } catch { /* ignore */ }
        return mod;
    } catch (err) {
        if (!isChunkLoadError(err)) throw err; // error จริงใน module → ส่งต่อ ErrorBoundary
        if (attempt < 2) {
            await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
            return attemptImport(factory, key, attempt + 1);
        }
        // retry หมดแล้ว → น่าจะ chunk เก่าหาย (deploy ใหม่) → reload ครั้งเดียว
        // ออฟไลน์ → reload ไม่ช่วย (chunk เดิมก็ยังโหลดไม่ได้) แต่ล้างฟอร์มที่พิมพ์ค้างทิ้งแน่ ๆ
        if (navigator.onLine === false) throw err;
        /* guard ในหน่วยความจำ — sessionStorage อาจโยน (Safari private) แล้ว flag เขียนไม่ติด = reload วน */
        let reloaded = reloadedKeys.has(key);
        if (!reloaded) { try { reloaded = !!sessionStorage.getItem(flagKey(key)); } catch { /* ignore */ } }
        if (!reloaded) {
          reloadedKeys.add(key);
            try { sessionStorage.setItem(flagKey(key), '1'); } catch { /* ignore */ }
            try { location.reload(); } catch { /* ignore */ }
            return { default: () => null }; // กัน render error ระหว่างรอ reload
        }
        throw err; // reload แล้วยังพัง → ให้ ErrorBoundary แสดงการ์ด
    }
}

/**
 * ใช้แทน React.lazy สำหรับ view/route/modal ที่ import แบบ dynamic
 * @param {() => Promise<any>} factory  ฟังก์ชัน () => import('./x.jsx').then(...)
 * @param {string} key  คีย์คงที่ต่อโมดูล (ใช้กัน reload loop) — ใส่ path โมดูล
 */
export function lazyRetry(factory, key) {
    return lazy(() => attemptImport(factory, key || ''));
}
