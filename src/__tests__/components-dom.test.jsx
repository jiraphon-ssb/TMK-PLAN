// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SourceBadge, InfoTip } from '../components.jsx';

// TEST-1 — smoke component/DOM test (พิสูจน์ jsdom + RTL ทำงาน) · ครอบ SourceBadge (KPI-1) + InfoTip tooltip
afterEach(cleanup);

describe('SourceBadge (component · KPI-1)', () => {
  it('kind=truth → ป้าย "ยอดจริง (การเงิน)"', () => {
    const { container } = render(<SourceBadge kind="truth" />);
    expect(container.textContent).toContain('ยอดจริง (การเงิน)');
    expect(container.textContent).toContain('แหล่ง');
  });
  it('kind=analytics → ป้าย "วิเคราะห์จากออเดอร์"', () => {
    const { container } = render(<SourceBadge kind="analytics" />);
    expect(container.textContent).toContain('วิเคราะห์จากออเดอร์');
  });
});

describe('InfoTip (component · tooltip toggle)', () => {
  it('คลิก ⓘ → แสดง tooltip · คลิกซ้ำ → ซ่อน', () => {
    render(<InfoTip text="คำอธิบายทดสอบ" label="ทดสอบ" />);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /คำอธิบาย/ });
    fireEvent.click(btn);
    expect(screen.getByRole('tooltip')).toHaveTextContent('คำอธิบายทดสอบ');
    fireEvent.click(btn);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
  it('ไม่มี text → ไม่ render อะไร', () => {
    const { container } = render(<InfoTip text="" />);
    expect(container).toBeEmptyDOMElement();
  });
});

/* PART 116 — แถบเตือนเน็ตหลุด */
describe('OfflineBar', () => {
  it('ออนไลน์ = ไม่โผล่ · ออฟไลน์ = เตือนว่าบันทึกไม่ได้', async () => {
    const { OfflineBar } = await import('../components/OfflineBar.jsx');
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const { container, unmount } = render(<OfflineBar />);
    expect(container.innerHTML).toBe('');
    unmount();

    spy.mockReturnValue(false);
    render(<OfflineBar />);
    expect(screen.getByText(/เน็ตหลุด/)).toBeInTheDocument();
    spy.mockRestore();
  });
});
