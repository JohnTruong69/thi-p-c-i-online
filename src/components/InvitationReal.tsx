/** Phase 3 slice 3: persisted Đường Hẹn invitation (content, photos, 3 links, revisions, publish gate) + one shared renderer for preview and public page. */
import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Copy, ExternalLink, ImagePlus, Loader2, QrCode, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WriteButton, useReadOnly } from './AccessStateBanner';
import { eventsQuery, useMyWedding, type EventRow } from '@/lib/wedding-api';
import { currentSnapshot, eventToSnap, invitationError, invitationQuery, photoUrlsQuery, publishInvitation, publishedRevision, removePhoto, revisionSnapshot, saveRevision, setCover, updateContent, updateLink, uploadPhoto, type InvitationBundle, type LinkRow } from '@/lib/invitation-api';
import { LINK_LABEL, LINK_SIDES, MAX_MESSAGE, MAX_TITLE, diffInvitation, linkState, validateContent, type LinkSide, type SnapEvent } from '@/lib/invitation';
import { checkPhotos, MAX_PHOTOS } from '@/lib/phase2';
import { mapUrl } from '@/lib/phase2d';
import { getPublicInvitation } from '@/lib/invitation.functions';
import { GuestReceipt, GuestRsvpForm } from './RsvpReal';
import { Action, FormField, Header, InvitationTabs, Note, Panel, Row, SmallLabel, Status, fmtDate, inputCls } from './PhaseOne';
import { LoadError, Loading } from './PhaseThree';

/* ================= Shared renderer (owner preview = public page) ================= */
export type RenderProps = { title: string; message: string; side: LinkSide; events: SnapEvent[]; coverUrl?: string | null; photoUrls: string[]; compact?: boolean };
export function InvitationRenderer({ title, message, side, events, coverUrl, photoUrls, compact }: RenderProps) {
  return <div data-testid="invitation-render" className={`relative overflow-hidden rounded-lg border border-border bg-background ${compact ? 'p-6' : 'p-7 sm:p-10'}`}>
    <div className="border-b border-border pb-4 text-center text-[10px] font-bold uppercase text-primary">ĐƯỜNG HẸN · {LINK_LABEL[side]}</div>
    {coverUrl && <img src={coverUrl} alt="Ảnh bìa của hai bạn" className="mt-6 aspect-[4/3] w-full rounded-md object-cover" />}
    <div className="relative mt-7 h-8"><div className="absolute left-0 top-0 h-px w-1/2 origin-right rotate-[8deg] bg-primary" /><div className="absolute right-0 top-0 h-px w-1/2 origin-left -rotate-[8deg] bg-primary" /><div className="absolute left-1/2 top-4 size-1.5 -translate-x-1/2 rounded-full bg-foreground" /></div>
    <h2 className="mt-3 break-words text-center text-[36px] font-semibold leading-none">{title}</h2>
    <p className="mt-4 whitespace-pre-wrap break-words text-center text-sm leading-relaxed">{message}</p>
    {photoUrls.length > 0 && <ul className="mt-6 grid grid-cols-3 gap-2">{photoUrls.slice(0, 9).map((u, i) => <li key={u}><img src={u} alt={`Ảnh ${i + 1}`} loading="lazy" className="aspect-square w-full rounded-md object-cover" /></li>)}</ul>}
    <div className="mt-6"><SmallLabel>BUỔI LỄ CỦA CHÚNG MÌNH</SmallLabel>
      {events.length === 0 && <Note tone="warm">Chưa có buổi lễ cho link này.</Note>}
      {events.map(e => <Panel key={e.id} className="mb-2"><h3 className="text-2xl">{e.name}</h3>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-4 text-xs font-semibold"><span>{e.time || 'Chưa chốt giờ'}</span><span>·</span><span>{e.date ? `${fmtDate(e.date)}/${e.date.slice(0, 4)}` : 'Chưa chốt ngày'}</span></div>
        <p className="mt-2 text-xs">{e.venue || 'Chưa chốt nơi'}{e.address && <><br />{e.address}</>}</p>
        {e.address && <a className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary underline-offset-2 hover:underline" href={mapUrl(e.address)} target="_blank" rel="noreferrer">Xem đường đi <ExternalLink className="size-3" /></a>}
      </Panel>)}
    </div>
    <Note tone="copper">Có bạn, ngày vui thêm trọn vẹn.</Note>
  </div>;
}

/* ================= Data hook ================= */
function useInvitation() {
  const w = useMyWedding().data!;
  const iq = useQuery(invitationQuery(w.id)), eq = useQuery(eventsQuery(w.id));
  const paths = (iq.data?.photos ?? []).map(p => p.storage_path);
  const uq = useQuery(photoUrlsQuery(paths));
  return { w, iq, eq, b: iq.data, events: eq.data ?? [], urls: uq.data ?? {} };
}
function Gate({ iq, eq, children }: { iq: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown }; eq: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown }; children: React.ReactNode }) {
  if (iq.isPending || eq.isPending) return <Loading label="Đang mở thiệp của hai bạn…" />;
  if (iq.isError) return <LoadError error={iq.error} retry={() => iq.refetch()} />;
  if (eq.isError) return <LoadError error={eq.error} retry={() => eq.refetch()} />;
  return <>{children}</>;
}
const renderFor = (b: InvitationBundle, events: EventRow[], urls: Record<string, string>, side: LinkSide) => {
  const link = b.links.find(l => l.side === side);
  const cover = b.photos.find(p => p.id === b.invitation.cover_photo_id);
  return { title: b.invitation.title, message: b.invitation.message, side, events: events.filter(e => link?.event_ids.includes(e.id)).map(eventToSnap), coverUrl: cover ? urls[cover.storage_path] ?? null : null, photoUrls: b.photos.filter(p => p.id !== cover?.id).map(p => urls[p.storage_path]).filter((u): u is string => !!u) };
};
function SaveRevisionButton({ weddingId, variant = 'outline' }: { weddingId: string; variant?: 'default' | 'outline' }) {
  const qc = useQueryClient(); const [msg, setMsg] = useState('');
  const m = useMutation({ mutationFn: () => saveRevision(weddingId, ''), onSuccess: r => { setMsg(r.unchanged ? `Không có gì mới so với bản ${r.revision}.` : `Đã lưu thành bản ${r.revision}. Bản này chưa gửi cho khách.`); qc.invalidateQueries({ queryKey: ['invitation', weddingId] }); }, onError: e => setMsg(invitationError(e)) });
  return <div><WriteButton variant={variant} size="lg" className="min-h-11" disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending && <Loader2 className="animate-spin" />}Lưu thành một bản</WriteButton><p role="status" className="mt-1 text-xs font-semibold text-sage-strong">{msg}</p></div>;
}

/* ================= Content + photos ================= */
export function RealContentScreen() {
  const { w, iq, eq, b, events, urls } = useInvitation();
  return <div><Header name="Nội dung thiệp" subtitle="LỜI MỜI / ĐƯỜNG HẸN" /><InvitationTabs active="content" />
    <p className="mb-6 text-muted-foreground">Một mẫu Đường Hẹn cố định. Nội dung và ảnh của hai bạn được lưu vào tài khoản; hai người quản lý cùng sửa được.</p>
    <Gate iq={iq} eq={eq}>{b && <ContentBody key={b.invitation.id} weddingId={w.id} b={b} events={events} urls={urls} />}</Gate>
  </div>;
}
function ContentBody({ weddingId, b, events, urls }: { weddingId: string; b: InvitationBundle; events: EventRow[]; urls: Record<string, string> }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(b.invitation.title); const [message, setMessage] = useState(b.invitation.message);
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  useEffect(() => { setTitle(b.invitation.title); setMessage(b.invitation.message); }, [b.invitation.title, b.invitation.message]);
  const dirty = title.trim() !== b.invitation.title || message.trim() !== b.invitation.message;
  const save = useMutation({ mutationFn: () => updateContent(b.invitation.id, title, message), onSuccess: () => { setOk('Đã lưu nội dung vào bản nháp.'); qc.invalidateQueries({ queryKey: ['invitation', weddingId] }); }, onError: e => setErr(invitationError(e)) });
  const firstEnabled = b.links.find(l => l.enabled)?.side as LinkSide | undefined;
  const side = firstEnabled ?? 'chung';
  return <div className="grid items-start gap-5 lg:grid-cols-[1fr_.85fr]">
    <div className="space-y-5"><Panel><h2 className="text-xl">Nội dung thiệp</h2>
      <form className="mt-4 space-y-5" onSubmit={e => { e.preventDefault(); setOk(''); const v = validateContent(title, message); setErr(v); if (!v) { if (!dirty) { setOk('Chưa có thay đổi.'); return; } save.mutate(); } }}>
        <FormField label={`Tên hiển thị (tối đa ${MAX_TITLE} ký tự)`} id="invite-title" error={err && !title.trim() ? err : undefined}><input id="invite-title" maxLength={MAX_TITLE} value={title} onChange={e => { setTitle(e.target.value); setErr(''); setOk(''); }} className={inputCls} /></FormField>
        <FormField label="Lời mời chung" id="invite-message"><textarea id="invite-message" maxLength={MAX_MESSAGE} value={message} onChange={e => { setMessage(e.target.value); setErr(''); setOk(''); }} rows={5} className="mt-2 w-full rounded-md border border-border bg-background p-3 text-sm" /></FormField>
        {err && <p role="alert" className="text-xs font-semibold text-destructive">{err}</p>}
        <p role="status" className="text-xs font-semibold text-sage-strong">{ok}</p>
        <div className="flex flex-wrap gap-2"><WriteButton type="submit" size="lg" className="min-h-11" disabled={save.isPending}>{save.isPending && <Loader2 className="animate-spin" />}Lưu nội dung</WriteButton>{dirty && <span className="self-center text-xs text-primary">Có thay đổi chưa lưu</span>}</div>
      </form></Panel>
      <Panel><PhotoPanel weddingId={weddingId} b={b} urls={urls} /></Panel>
      <Panel><h2 className="text-xl">Bản lưu</h2><p className="mt-1 text-xs text-muted-foreground">Lưu lại toàn bộ nội dung, ảnh, link và buổi lễ hiện tại thành một bản để xem lịch sử và so sánh. Lưu bản không gửi gì cho khách.</p><div className="mt-3"><SaveRevisionButton weddingId={weddingId} /></div></Panel>
    </div>
    <div className="lg:sticky lg:top-24"><div className="mb-3 text-xs font-semibold">Bản xem trước · {LINK_LABEL[side]} (theo nội dung đã lưu)</div><InvitationRenderer compact {...renderFor(b, events, urls, side)} /><div className="mt-3"><Action to="/invitation/preview" variant="outline">Xem từng link <ArrowRight /></Action></div></div>
  </div>;
}
function PhotoPanel({ weddingId, b, urls }: { weddingId: string; b: InvitationBundle; urls: Record<string, string> }) {
  const ro = useReadOnly();
  const qc = useQueryClient(); const [busy, setBusy] = useState(''); const [msg, setMsg] = useState<{ ok: string; bad: string[] }>({ ok: '', bad: [] });
  const refresh = () => qc.invalidateQueries({ queryKey: ['invitation', weddingId] });
  const add = async (files: FileList | null) => {
    if (!files?.length || busy) return;
    const arr = [...files]; const { accepted, rejected } = checkPhotos(arr, b.photos.length);
    const bad = rejected.map(r => `${r.name}: ${r.reason}`); let added = 0, dup = 0;
    const existing = b.photos.map(p => p.storage_path);
    for (const [n, i] of accepted.entries()) {
      const f = arr[i]!; setBusy(`Đang tải ảnh ${n + 1}/${accepted.length}…`);
      try { const r = await uploadPhoto(weddingId, f, existing); if (r === 'added') added++; else dup++; } catch (e) { bad.push(`${f.name}: ${invitationError(e)}`); }
    }
    setBusy(''); setMsg({ ok: [added && `Đã lưu ${added} ảnh.`, dup && `${dup} ảnh trùng với ảnh đã có nên không thêm lại.`].filter(Boolean).join(' '), bad }); refresh();
  };
  const del = async (id: string) => { setBusy('Đang bỏ ảnh…'); try { await removePhoto(id); setMsg({ ok: 'Đã bỏ ảnh.', bad: [] }); } catch (e) { setMsg({ ok: '', bad: [invitationError(e)] }); } setBusy(''); refresh(); };
  const cover = async (id: string | null) => { setBusy('Đang đặt ảnh bìa…'); try { await setCover(b.invitation.id, id); setMsg({ ok: id ? 'Đã đặt ảnh bìa.' : 'Đã bỏ ảnh bìa.', bad: [] }); } catch (e) { setMsg({ ok: '', bad: [invitationError(e)] }); } setBusy(''); refresh(); };
  const full = b.photos.length >= MAX_PHOTOS;
  return <div><div className="flex items-center justify-between"><h2 className="text-xl">Ảnh bìa và album</h2><span className="text-xs font-semibold">{b.photos.length}/{MAX_PHOTOS}</span></div>
    <label className={`mt-3 flex min-h-20 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background p-4 text-center text-sm focus-within:ring-2 focus-within:ring-ring ${full || busy || ro ? 'pointer-events-none opacity-50' : ''}`}><ImagePlus className="size-5 shrink-0 text-primary" />{full ? 'Đã đủ 50 ảnh' : 'Chọn ảnh (JPG, PNG, WEBP · tối đa 10 MB/ảnh)'}<input type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={full || !!busy || ro} onChange={e => { add(e.target.files); e.target.value = ''; }} /></label>
    <p className="mt-1 text-[11px] text-muted-foreground">Ảnh được lưu riêng tư trong tài khoản, chỉ hai người quản lý xem được. Tối đa 50 ảnh khác nhau cho một đám cưới, gồm cả ảnh bìa; ảnh giống hệt chỉ tính một lần.</p>
    <div role="status" aria-live="polite" className="mt-2 text-xs">{busy && <p className="flex items-center gap-1 font-semibold"><Loader2 className="size-3 animate-spin" />{busy}</p>}{msg.ok && <p className="font-semibold text-sage-strong">{msg.ok}</p>}{msg.bad.map(x => <p key={x} className="font-semibold text-destructive">{x}</p>)}</div>
    {b.photos.length > 0 && <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">{b.photos.map((p, i) => { const isCover = p.id === b.invitation.cover_photo_id; return <li key={p.id} className="relative">
      {urls[p.storage_path] ? <img src={urls[p.storage_path]} alt={`Ảnh ${i + 1}${isCover ? ' (ảnh bìa)' : ''}`} className={`aspect-square w-full rounded-md object-cover ${isCover ? 'ring-2 ring-primary' : ''}`} /> : <div className="aspect-square w-full rounded-md bg-muted" />}
      {isCover && <span className="absolute left-1 top-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">Ảnh bìa</span>}
      <div className="absolute bottom-1 right-1 flex gap-1">
        <button type="button" disabled={!!busy || ro} aria-label={isCover ? `Bỏ ảnh bìa (ảnh ${i + 1})` : `Đặt ảnh ${i + 1} làm ảnh bìa`} onClick={() => cover(isCover ? null : p.id)} className="grid size-9 place-items-center rounded-full bg-card/90 focus:outline-none focus:ring-2 focus:ring-ring"><Star className={`size-4 ${isCover ? 'fill-primary text-primary' : ''}`} /></button>
        <button type="button" disabled={!!busy || ro} aria-label={`Bỏ ảnh ${i + 1}`} onClick={() => del(p.id)} className="grid size-9 place-items-center rounded-full bg-card/90 focus:outline-none focus:ring-2 focus:ring-ring"><Trash2 className="size-4" /></button>
      </div></li>; })}</ul>}
  </div>;
}

/* ================= Links ================= */
export function RealLinksScreen() {
  const { w, iq, eq, b, events } = useInvitation();
  return <div className="max-w-4xl"><Header name="Các phiên bản link" subtitle="LỜI MỜI" />
    <p className="-mt-3 mb-5 text-muted-foreground">Tối đa 3 link: chung, nhà gái, nhà trai. Mỗi link chỉ hiện những buổi hai bạn chọn. Cấu hình được lưu vào tài khoản.</p>
    <Gate iq={iq} eq={eq}>{b && <div className="space-y-3">{LINK_SIDES.map(s => { const l = b.links.find(x => x.side === s); return l ? <LinkPanel key={l.id} weddingId={w.id} link={l} events={events} /> : null; })}</div>}</Gate>
    <Note tone="warm">Bật link chỉ chọn link để công bố sau. Công bố cần gói thiệp cưới đã được xác minh thanh toán; hiện chưa có link nào mở cho khách.</Note>
    <Action to="/publish" className="mt-5 w-full">Xem lại trước khi công bố <ArrowRight /></Action>
  </div>;
}
function LinkPanel({ weddingId, link, events }: { weddingId: string; link: LinkRow; events: EventRow[] }) {
  const ro = useReadOnly();
  const qc = useQueryClient(); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const side = link.side as LinkSide; const snapEvents = events.map(eventToSnap);
  const r = linkState({ side, enabled: link.enabled, event_ids: link.event_ids }, snapEvents);
  const orphans = link.event_ids.filter(id => !events.some(e => e.id === id));
  const m = useMutation({ mutationFn: (p: { enabled?: boolean; event_ids?: string[]; done: string }) => updateLink(link.id, { ...(p.enabled !== undefined && { enabled: p.enabled }), ...(p.event_ids && { event_ids: p.event_ids }) }), onSuccess: (_d, p) => { setErr(''); setMsg(p.done); qc.invalidateQueries({ queryKey: ['invitation', weddingId] }); }, onError: e => { setMsg(''); setErr(invitationError(e)); } });
  return <Panel item={side}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl">{LINK_LABEL[side]}</h2><Status tone={r.readiness === 'ready' ? 'sage' : r.readiness === 'off' ? 'warm' : 'copper'}>{r.readiness === 'ready' ? 'Sẵn sàng' : r.readiness === 'off' ? 'Đang tắt' : 'Cần sửa'}</Status></div>
    <fieldset className="mt-3" disabled={m.isPending || ro}><legend className="text-xs font-semibold">Buổi có trong link</legend>
      {events.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Chưa có buổi lễ nào. <Link to="/wedding/events" className="font-semibold text-primary underline">Thêm buổi lễ</Link></p>}
      <div className="mt-1 grid gap-1 sm:grid-cols-2">{events.map(e => <label key={e.id} className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={link.event_ids.includes(e.id)} onChange={x => m.mutate({ event_ids: x.target.checked ? [...link.event_ids, e.id] : link.event_ids.filter(id => id !== e.id), done: `Đã ${x.target.checked ? 'thêm' : 'bỏ'} ${e.name}.` })} />{e.name}</label>)}</div>
    </fieldset>
    {r.missing.length > 0 && <p className="mt-2 text-xs font-semibold text-primary">Còn thiếu: {r.missing.join(', ')}</p>}
    {orphans.length > 0 && <div className="mt-2 rounded-md bg-copper-soft p-2 text-xs"><strong>{orphans.length} buổi trong link đã bị bỏ</strong> — cần chọn lại buổi thay thế rồi gỡ buổi cũ.<WriteButton variant="outline" size="sm" className="ml-2 min-h-9" disabled={m.isPending} onClick={() => m.mutate({ event_ids: link.event_ids.filter(id => !orphans.includes(id)), done: 'Đã gỡ buổi đã bị bỏ. Hãy chọn lại buổi nếu cần.' })}>Gỡ buổi đã bị bỏ</WriteButton></div>}
    {err && <p role="alert" className="mt-2 text-xs font-semibold text-destructive">{err}</p>}
    <p role="status" className="mt-2 text-xs font-semibold text-sage-strong">{msg}</p>
    <div className="mt-2 flex flex-wrap gap-2"><WriteButton variant="outline" size="lg" className="min-h-11" disabled={m.isPending} onClick={() => m.mutate({ enabled: !link.enabled, done: link.enabled ? 'Đã tắt link.' : 'Đã bật link (chưa công bố).' })}>{m.isPending && <Loader2 className="animate-spin" />}{link.enabled ? 'Tắt link' : 'Bật link'}</WriteButton>{r.missing.some(x => !x.startsWith('Buổi đã bị bỏ')) && <Action to="/invitation/check" variant="ghost">Xem thông tin còn thiếu <ArrowRight /></Action>}</div>
  </Panel>;
}

/* ================= Preview (+ diff vs published) ================= */
export function RealPreviewScreen() {
  const { w, iq, eq, b, events, urls } = useInvitation(); const [side, setSide] = useState<LinkSide>('chung');
  return <div><Header name="Xem trước thiệp" subtitle="BẢN THỬ RIÊNG" /><InvitationTabs active="preview" />
    <Gate iq={iq} eq={eq}>{b && (() => {
      const l = b.links.find(x => x.side === side)!; const r = linkState({ side, enabled: l.enabled, event_ids: l.event_ids }, events.map(eventToSnap));
      const pub = revisionSnapshot(publishedRevision(b)); const changes = pub ? diffInvitation(pub, currentSnapshot(b, events)) : [];
      return <>
        <p className="-mt-1 mb-5 text-muted-foreground">Bản nháp đã lưu, hiển thị bằng đúng mẫu khách sẽ thấy khi link được công bố · chỉ hai bạn nhìn thấy.</p>
        <div className="mb-5 flex gap-2" role="group" aria-label="Chọn link">{LINK_SIDES.map(x => <Button key={x} aria-pressed={side === x} onClick={() => setSide(x)} variant={side === x ? 'default' : 'outline'} size="lg" className="min-h-11 flex-1 px-2 text-xs">{LINK_LABEL[x]}</Button>)}</div>
        <div className="grid gap-5 lg:grid-cols-[1fr_.9fr]"><div className="space-y-4">
          <Note tone={r.readiness === 'ready' ? 'sage' : 'warm'}>{r.readiness === 'off' ? `${LINK_LABEL[side]} đang tắt. Khách mở link sẽ thấy trang đóng.` : r.readiness === 'ready' ? `${LINK_LABEL[side]} · đủ thông tin để công bố.` : `${LINK_LABEL[side]} · cần sửa: ${r.missing.join(', ')}.`}</Note>
          <Panel><SmallLabel>SO VỚI BẢN CÔNG BỐ GẦN NHẤT</SmallLabel>{!pub ? <p className="text-sm text-muted-foreground">Chưa có bản công bố nào. Khách chưa thấy thiệp; mọi thay đổi hiện chỉ nằm trong bản nháp.</p> : changes.length === 0 ? <p className="text-sm">Bản nháp giống bản đang công bố.</p> : <ChangeList changes={changes} />}<Action to="/invitation/changes" variant="ghost" className="mt-2">Xem so sánh chi tiết <ArrowRight /></Action></Panel>
          <SaveRevisionButton weddingId={w.id} />
          <div className="grid gap-2"><Action to="/invitation/variants" variant="outline">Sửa bật/tắt và buổi của link <ArrowRight /></Action><Action to="/publish">Xem lại trước khi công bố <ArrowRight /></Action></div>
        </div>
        <div><InvitationRenderer compact {...renderFor(b, events, urls, side)} /></div></div>
      </>;
    })()}</Gate>
  </div>;
}
function ChangeList({ changes }: { changes: { field: string; before: string; after: string }[] }) {
  return <ul className="space-y-3">{changes.map((c, i) => <li key={i} className="border-b border-border pb-2 text-sm last:border-0"><div className="font-semibold">{c.field}</div><div className="break-words text-xs">Trước: <span className="line-through">{c.before}</span></div><div className="break-words text-xs text-primary">Sau: <strong>{c.after}</strong></div></li>)}</ul>;
}

/* ================= Check ================= */
export function RealCheckScreen() {
  const { iq, eq, b, events } = useInvitation();
  return <div className="max-w-3xl"><Header name="Kiểm tra thiệp" subtitle="THIỆP · THÔNG TIN CÒN THIẾU" />
    <p className="-mt-3 mb-5 text-muted-foreground">Mỗi buổi trong một link cần ngày, giờ, nơi tổ chức và địa chỉ. Kiểm tra từ dữ liệu đã lưu.</p>
    <Gate iq={iq} eq={eq}>{b && <>
      <SmallLabel>THEO TỪNG LINK</SmallLabel>
      <Panel>{LINK_SIDES.map(s => { const l = b.links.find(x => x.side === s)!; const r = linkState({ side: s, enabled: l.enabled, event_ids: l.event_ids }, events.map(eventToSnap)); return <Row key={s} title={LINK_LABEL[s]} detail={r.readiness === 'ready' ? 'Đủ thông tin' : r.readiness === 'off' ? 'Đang tắt — không công bố' : `Còn thiếu: ${r.missing.join(', ')}`} right={<Status tone={r.readiness === 'ready' ? 'sage' : r.readiness === 'off' ? 'warm' : 'copper'}>{r.readiness === 'ready' ? 'Sẵn sàng' : r.readiness === 'off' ? 'Đang tắt' : 'Cần sửa'}</Status>} to="/invitation/variants" />; })}</Panel>
      <div className="mt-5"><SmallLabel>THEO TỪNG BUỔI LỄ</SmallLabel></div>
      <Panel>{(() => { const gaps = events.map(e => ({ e, g: [!e.event_date && 'ngày', !e.event_time && 'giờ', !e.venue?.trim() && 'nơi tổ chức', !e.address?.trim() && 'địa chỉ'].filter(Boolean) as string[] })).filter(x => x.g.length); return gaps.length ? gaps.map(({ e, g }) => <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-3 last:border-0"><div><strong>{e.name}</strong><p className="text-xs text-muted-foreground">Thiếu {g.join(', ')}</p></div><Action to="/wedding/events/$id" params={{ id: e.id }} variant="outline">Sửa buổi này</Action></div>) : <p className="text-sm">Mọi buổi lễ đã có ngày, giờ, nơi và địa chỉ.</p>; })()}</Panel>
      <Action to="/invitation/preview" variant="outline" className="mt-5 w-full">Xem trước thiệp</Action>
    </>}</Gate>
  </div>;
}

/* ================= History (revisions + links) ================= */
export function RealHistoryScreen() {
  const { w, iq, eq, b } = useInvitation();
  return <div className="max-w-3xl"><Header name="Chia sẻ và lịch sử thiệp" subtitle="THIỆP · CHIA SẺ" />
    <Gate iq={iq} eq={eq}>{b && <>
      <Note tone="warm">{b.invitation.published_revision_id ? 'Thiệp đã có bản công bố.' : 'Chưa có link nào được công bố, nên chưa sao chép link hay tải mã QR được. Hai việc này chỉ mở sau khi gói thiệp cưới được xác minh thanh toán và hai bạn công bố.'}</Note>
      <div className="mt-5"><SmallLabel>CÁC LINK</SmallLabel></div>
      <Panel>{LINK_SIDES.map(s => { const l = b.links.find(x => x.side === s)!; return <div key={s} className="border-b border-border py-3 last:border-0">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong>{LINK_LABEL[s]}</strong><Status tone="warm">{l.enabled ? 'Chưa công bố' : 'Đang tắt'}</Status></div>
        <div className="mt-2 flex flex-wrap gap-2"><Button variant="outline" size="lg" className="min-h-11" disabled><Copy /> Sao chép link</Button><Button variant="outline" size="lg" className="min-h-11" disabled><QrCode /> Tải mã QR</Button></div>
        <p className="mt-1 text-xs text-muted-foreground">Không bấm được: link chưa công bố. Địa chỉ link đã được tạo cố định và không đổi khi hai bạn sửa thiệp.</p>
      </div>; })}</Panel>
      <div className="mt-5 flex items-center justify-between"><SmallLabel>LỊCH SỬ CÁC BẢN</SmallLabel></div>
      <Panel>{b.revisions.length === 0 ? <p className="text-sm text-muted-foreground">Chưa lưu bản nào.</p> : b.revisions.map(r => <Row key={r.id} title={`Bản ${r.revision}${r.kind === 'published' ? ' · đã công bố' : ''}`} detail={`${r.kind === 'published' ? 'Bản công bố' : 'Bản lưu, chưa gửi khách'} · ${new Date(r.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`} />)}</Panel>
      <div className="mt-3"><SaveRevisionButton weddingId={w.id} /></div>
      <Action to="/publish" className="mt-5 w-full">Xem lại trước khi công bố</Action>
    </>}</Gate>
  </div>;
}

/* ================= Changes: draft vs latest published (or last saved) ================= */
export function RealChangesScreen() {
  const { iq, eq, b, events } = useInvitation();
  return <div className="max-w-3xl"><Header name="Thay đổi so với bản công bố" subtitle="LỜI MỜI" />
    <p className="-mt-3 mb-5 text-muted-foreground">So sánh bản nháp hiện tại với bản công bố gần nhất. Không có gì tự cập nhật cho khách.</p>
    <Gate iq={iq} eq={eq}>{b && (() => {
      const cur = currentSnapshot(b, events); const pubRow = publishedRevision(b); const pub = revisionSnapshot(pubRow);
      const lastRow = b.revisions[0]; const last = revisionSnapshot(lastRow);
      const base = pub ?? last; const changes = base ? diffInvitation(base, cur) : [];
      return <>
        {!pub && <Note tone="warm">Chưa có bản công bố nào.{last ? ` Đang so với bản lưu gần nhất (bản ${lastRow!.revision}).` : ' Hãy lưu một bản để có mốc so sánh.'}</Note>}
        {base && <Panel className="mt-4"><SmallLabel>{pub ? `BẢN CÔNG BỐ ${pubRow!.revision}` : `BẢN LƯU ${lastRow!.revision}`} → BẢN NHÁP HIỆN TẠI</SmallLabel>{changes.length ? <ChangeList changes={changes} /> : <p className="text-sm text-muted-foreground">Chưa có thay đổi nào.</p>}</Panel>}
        <Action to="/invitation/preview" variant="ghost" className="mt-3 w-full">Xem bản thử</Action>
      </>;
    })()}</Gate>
  </div>;
}

/* ================= Publish review: server refuses without entitlement ================= */
export function RealPublishReviewScreen() {
  const { w, iq, eq, b, events } = useInvitation(); const qc = useQueryClient(); const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  const m = useMutation({ mutationFn: () => publishInvitation(w.id), onSuccess: () => { setRes({ ok: true, text: 'Đã công bố.' }); qc.invalidateQueries({ queryKey: ['invitation', w.id] }); }, onError: e => setRes({ ok: false, text: invitationError(e) }) });
  return <div className="max-w-3xl"><Header name="Xem lại trước khi công bố" subtitle="CÔNG BỐ THIỆP" />
    <Gate iq={iq} eq={eq}>{b && (() => {
      const rs = LINK_SIDES.map(s => { const l = b.links.find(x => x.side === s)!; return { s, l, r: linkState({ side: s, enabled: l.enabled, event_ids: l.event_ids }, events.map(eventToSnap)) }; });
      const ready = rs.filter(x => x.r.readiness === 'ready');
      return <>
        <Note tone="warm"><strong>{b.entitled ? 'Gói thiệp cưới đã được xác minh.' : 'Chưa có gói thiệp cưới được xác minh.'}</strong><br />Chỉ khi thanh toán thật được máy chủ xác minh, link sẵn sàng mới công bố được. Trang này không tự bật đã trả hay đã công bố.</Note>
        <div className="mt-4"><SmallLabel>ĐỦ THÔNG TIN · {ready.length}</SmallLabel></div>
        <Panel>{ready.length ? ready.map(({ s, l }) => <Row key={s} title={LINK_LABEL[s]} detail={l.event_ids.map(id => events.find(e => e.id === id)?.name).filter(Boolean).join(' / ')} right={<Status>Sẵn sàng</Status>} />) : <p className="text-sm text-muted-foreground">Chưa có link nào đủ thông tin.</p>}</Panel>
        <div className="mt-4"><SmallLabel>CHƯA CÔNG BỐ ĐƯỢC</SmallLabel></div>
        <Panel>{rs.filter(x => x.r.readiness !== 'ready').map(({ s, r }) => <Row key={s} title={LINK_LABEL[s]} detail={r.readiness === 'off' ? 'Đang tắt' : `Thiếu: ${r.missing.join(', ')}`} to="/invitation/variants" />)}</Panel>
        <WriteButton size="lg" className="mt-5 min-h-11 w-full" disabled={m.isPending || ready.length === 0} onClick={() => { setRes(null); m.mutate(); }}>{m.isPending && <Loader2 className="animate-spin" />}Công bố thiệp</WriteButton>
        {ready.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Chưa bấm được: cần ít nhất một link đang bật và đủ thông tin.</p>}
        {res && <p role={res.ok ? 'status' : 'alert'} className={`mt-2 text-sm font-semibold ${res.ok ? 'text-sage-strong' : 'text-destructive'}`}>{res.text}</p>}
        <Action to="/plans" variant="outline" className="mt-3 w-full">Xem gói thiệp cưới</Action>
        <Action to="/invitation/variants" variant="ghost" className="mt-2 w-full">Sửa các link</Action>
        <Action to="/invitation/history" variant="ghost" className="mt-2 w-full">Chia sẻ và lịch sử</Action>
      </>;
    })()}</Gate>
  </div>;
}

/* ================= Public guest page ================= */
export function PublicInvitationPage({ token, mode }: { token: string; mode: 'view' | 'rsvp' | 'receipt' }) {
  const q = useQuery({ queryKey: ['public-invitation', token], queryFn: () => getPublicInvitation({ data: { token } }), retry: 1, staleTime: 60_000 });
  if (q.isPending) return <div className="pt-16"><Loading label="Đang mở thiệp…" /></div>;
  const v = q.data;
  if (q.isError || !v || !v.open) return <div className="mx-auto max-w-lg pt-16 text-center" data-testid="guest-closed"><h1 className="text-4xl">Thiệp chưa mở</h1><p className="mt-4 text-muted-foreground">Lời mời này hiện không hiển thị. Nếu cần biết thêm thông tin, xin liên hệ trực tiếp với gia đình.</p></div>;
  if (mode === 'rsvp') return <GuestRsvpForm token={token} events={v.events} />;
  if (mode === 'receipt') return <GuestReceipt token={token} />;
  return <div className="pt-8"><InvitationRenderer title={v.title} message={v.message} side={v.side as LinkSide} events={v.events} coverUrl={v.coverUrl} photoUrls={v.photoUrls} />
    <div className="mx-auto mt-6 max-w-lg"><Button asChild size="lg" className="min-h-11 w-full"><Link to="/i/$token/rsvp" params={{ token }}>Xác nhận tham dự</Link></Button></div></div>;
}
