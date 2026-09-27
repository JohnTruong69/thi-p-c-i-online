import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { AccessStateBanner, WriteButton, ReadOnlyContext, parseAccessState } from './AccessStateBanner';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) =>
    React.createElement('a', { href: to, ...props }, children),
}));

const weddingId = 'qa-wedding';
const trialEnd = '2026-10-04T00:00:00Z';
const paidEnd = '2029-09-27T00:00:00Z';

function renderState(state: string, extra: Record<string, unknown> = {}) {
  const client = new QueryClient();
  client.setQueryData(['wedding-access', weddingId], {
    state,
    trial_ends_at: trialEnd,
    paid_expires_at: paidEnd,
    ...extra,
  });
  return renderToStaticMarkup(
    React.createElement(QueryClientProvider, { client },
      React.createElement(AccessStateBanner, { weddingId })),
  );
}

describe('access status shown to a couple', () => {
  it('keeps the screen quiet before the trial begins', () => {
    expect(renderState('trial_not_started')).toBe('');
  });

  it.each([
    ['trial_active', 'dùng thử Planner', '04/10/2026 07:00'],
    ['paid_active', 'Đã thanh toán', '27/09/2029 07:00'],
    ['legacy_paid_active', 'Gói thiệp cũ còn hạn', '27/09/2029 07:00'],
  ])('shows %s with its relevant Vietnam-time deadline', (state, copy, date) => {
    const html = renderState(state);
    expect(html).toContain(copy);
    expect(html).toContain(date);
    expect(html).not.toContain('Tải dữ liệu');
  });

  it.each([
    ['trial_expired_read_only', 'Thời gian dùng thử đã kết thúc'],
    ['paid_expired_read_only', 'Thời hạn gói đã kết thúc'],
    ['legacy_paid_expired', 'Gói thiệp cũ đã hết hạn'],
  ])('offers data export after %s', (state, copy) => {
    const html = renderState(state);
    expect(html).toContain(copy);
    expect(html).toContain('href="/settings/data"');
    expect(html).toContain('Tải dữ liệu');
    expect(html).toContain('bg-warm');
  });
});

describe('staged write gate (read-only)', () => {
  it('treats missing writable as writable (gate OFF / older server)', () => {
    expect(parseAccessState({ state: 'trial_not_started' }).writable).toBe(true);
    expect(parseAccessState({ state: 'trial_expired_read_only', writable: false, write_gate_enabled: true }).writable).toBe(false);
  });
  it('shows read-only explanation, export and plan links only when the server says not writable', () => {
    const off = renderState('trial_expired_read_only');
    expect(off).not.toContain('Chế độ chỉ xem');
    const on = renderState('trial_expired_read_only', { writable: false, write_gate_enabled: true });
    expect(on).toContain('Chế độ chỉ xem');
    expect(on).not.toContain('/checkout');
    expect(on).not.toMatch(/149\.000|199\.000|24 tháng|36 tháng/);
    expect(on).toContain('href="/settings/data"');
    expect(on).toContain('chưa mở bán');
    expect(on).toContain('chưa thể thanh toán');
    const failClosed = renderState('trial_not_started', { writable: false, write_gate_enabled: true });
    expect(failClosed).toContain('Chế độ chỉ xem');
    expect(renderState('paid_active', { writable: true, write_gate_enabled: true })).not.toContain('Chế độ chỉ xem');
  });
  it('disables write buttons with a reason in read-only mode', () => {
    const html = (ro: boolean) => renderToStaticMarkup(React.createElement(ReadOnlyContext.Provider, { value: ro }, React.createElement(WriteButton, null, 'Lưu')));
    expect(html(true)).toContain('disabled=""');
    expect(html(true)).toContain('chế độ chỉ xem');
    expect(html(false)).not.toContain('disabled=""');
  });
});
