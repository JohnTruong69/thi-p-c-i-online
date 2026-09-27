import { describe, expect, it } from 'vitest';
import { diffInvitation, isPhotoPath, linkState, sniffImage, toSnapshot, validateContent, type InvitationSnapshot } from './invitation';

const ev = (id: string, o = {}) => ({ id, name: `Buổi ${id}`, side: 'chung', date: '2027-10-18', time: '18:00', venue: 'Nhà hàng', address: '1 Lê Lợi', ...o });
const snap = (o: Partial<InvitationSnapshot> = {}): InvitationSnapshot => ({ title: 'Lan & Minh', message: 'Mời', cover: null, photos: [], links: [{ side: 'chung', enabled: true, event_ids: ['a'] }], events: [ev('a')], ...o });

describe('invitation rules', () => {
  it('readiness needs date, time, venue, address', () => {
    expect(linkState({ side: 'chung', enabled: true, event_ids: ['a'] }, [ev('a')]).readiness).toBe('ready');
    expect(linkState({ side: 'chung', enabled: true, event_ids: ['a'] }, [ev('a', { address: ' ' })]).missing).toEqual(['Buổi a: địa chỉ']);
    expect(linkState({ side: 'chung', enabled: false, event_ids: [] }, []).readiness).toBe('off');
  });
  it('removed Event stays visible as needs-fix', () => {
    const r = linkState({ side: 'chung', enabled: true, event_ids: ['a', 'gone'] }, [ev('a')]);
    expect(r.readiness).toBe('needs-fix');
    expect(r.missing).toContain('Buổi đã bị bỏ — cần chọn lại');
  });
  it('validates content', () => {
    expect(validateContent('', 'x')).toMatch(/tên/);
    expect(validateContent('a'.repeat(81), 'x')).toMatch(/80/);
    expect(validateContent('a', 'x')).toBe('');
  });
  it('sniffs image magic bytes', () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffImage(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffImage(new TextEncoder().encode('<svg onload=x>'))).toBeNull();
  });
  it('photo path must be in the wedding folder', () => {
    const w = '11111111-1111-1111-1111-111111111111';
    expect(isPhotoPath(w, `${w}/${'a'.repeat(64)}.jpg`)).toBe(true);
    expect(isPhotoPath(w, `../${w}/${'a'.repeat(64)}.jpg`)).toBe(false);
    expect(isPhotoPath(w, `${w}/${'a'.repeat(64)}.svg`)).toBe(false);
  });
  it('diffs draft vs published', () => {
    const d = diffInvitation(snap(), snap({ title: 'Mới', events: [ev('a', { time: '19:00' })], links: [{ side: 'chung', enabled: false, event_ids: ['a'] }], photos: ['p1'] }));
    expect(d.map(c => c.field)).toEqual(['Tên hiển thị', 'Album ảnh', 'Buổi a · Giờ', 'Link chung']);
    expect(diffInvitation(snap(), snap({ events: [] }))[0]).toMatchObject({ after: 'Buổi đã bị bỏ' });
    expect(toSnapshot({ nope: 1 })).toBeNull();
  });
});
