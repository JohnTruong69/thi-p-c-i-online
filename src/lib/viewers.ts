/** Pure rules for read-only family viewers. The server re-validates everything; these only drive the UI. */
export const VIEWER_MODULES = ['events', 'tasks', 'budget', 'guests'] as const;
export const VIEWER_SIDES = ['chung', 'nha-trai', 'nha-gai'] as const;
export type ViewerModule = (typeof VIEWER_MODULES)[number];
export type ViewerSide = (typeof VIEWER_SIDES)[number];
export const MAX_VIEWERS = 2;

export const MODULE_TEXT: Record<ViewerModule, string> = {
  events: 'Buổi lễ', tasks: 'Việc cần làm', budget: 'Ngân sách', guests: 'Sổ khách (không có số điện thoại)',
};
export const SIDE_LABEL: Record<ViewerSide, string> = { chung: 'Chung', 'nha-trai': 'Nhà trai', 'nha-gai': 'Nhà gái' };

export type ViewerGrants = { modules: string[]; sides: string[] };
export function validateGrants(g: ViewerGrants): string {
  const mods = g.modules.filter(m => (VIEWER_MODULES as readonly string[]).includes(m));
  const sides = g.sides.filter(s => (VIEWER_SIDES as readonly string[]).includes(s));
  if (mods.length === 0) return 'Hãy chọn ít nhất một phần được xem.';
  if (sides.length === 0) return 'Hãy chọn ít nhất một bên (Chung, Nhà trai hoặc Nhà gái).';
  if (mods.length !== g.modules.length || sides.length !== g.sides.length) return 'Quyền xem chưa hợp lệ.';
  return '';
}
export const toggle = <T extends string>(list: T[], v: T): T[] => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

/** Active viewers + unexpired pending invites; a re-invite of the same email reuses its slot. */
export function viewerSlotsUsed(viewers: { email: string; revoked_at: string | null }[], invites: { email: string; status: string; expires_at: string }[], now = Date.now(), exceptEmail?: string) {
  const e = exceptEmail?.trim().toLowerCase();
  return viewers.filter(v => !v.revoked_at && v.email !== e).length
    + invites.filter(i => i.status === 'pending' && new Date(i.expires_at).getTime() > now && i.email !== e).length;
}
export const grantSummary = (g: ViewerGrants) =>
  `${g.modules.filter((m): m is ViewerModule => m in MODULE_TEXT).map(m => MODULE_TEXT[m].replace(/ \(.*\)/, '')).join(', ')} · ${g.sides.filter((s): s is ViewerSide => s in SIDE_LABEL).map(s => SIDE_LABEL[s]).join(', ')}`;
