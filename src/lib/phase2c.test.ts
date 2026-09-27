import { describe, expect, it } from 'vitest';
import { guestsToCsv, validateLogin, validateEmail } from './phase2c';
import { parseCsv } from './phase2';

describe('phase2c', () => {
  it('validates email and login', () => {
    expect(validateEmail('')).toHaveProperty('email');
    expect(validateEmail('abc')).toHaveProperty('email');
    expect(validateEmail('a@b.vn')).toEqual({});
    expect(validateLogin({ name: '', email: 'a@b.vn', password: '123' }, true)).toMatchObject({ name: expect.any(String), password: expect.any(String) });
    expect(validateLogin({ name: '', email: 'a@b.vn', password: '123' }, false)).toEqual({});
  });
  it('exports CSV keeping leading zero and quoting commas', () => {
    const csv = guestsToCsv([{ name: 'Mai, Nguyễn', phone: '0912345678', side: 'Nhà gái', events: ['e1', 'x'], party: 2, state: 'Chưa trả lời' }], id => (id === 'e1' ? 'Lễ gia tiên' : ''));
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const { rows } = parseCsv(csv.slice(1));
    expect(rows[0]).toEqual(['Mai, Nguyễn', '0912345678', 'Nhà gái', 'Lễ gia tiên', '2', 'Chưa trả lời']);
  });
});
