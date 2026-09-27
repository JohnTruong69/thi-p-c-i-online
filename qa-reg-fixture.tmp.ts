import { createClient } from '@supabase/supabase-js';
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const mode = process.argv[2]; const TS = 'qa-reg-ui'; const T = 'c0ffee'.padEnd(64, 'e'); const ACC = '9990004445';
if (mode === 'up') {
  const s = await admin.from('billing_settings').select('*', { count: 'exact', head: true }); if (s.count) throw new Error('real settings exist');
  const now = new Date().toISOString();
  await admin.from('billing_settings').insert({ offer_version: 'qa', price_vnd: 199000, terms_url: 'https://example.test/t', terms_version: 'qa-terms', terms_approved_at: now, terms_approved_by: 'qa', bank_gateway: 'QA', bank_account_number: ACC, bank_account_name: 'QA', account_enabled: true, sandbox_verified_at: now, live_enabled: true } as never);
  const o = await admin.rpc('create_presale_order', { p_email: `${TS}@example.test`, p_terms_version: 'qa-terms', p_ip_hash: 'qa-reg', p_token: T }); if (o.error) { console.log('ORDER', o.error.message); await admin.from('billing_settings').delete().eq('id', true); process.exit(1); }
  const code = (await admin.from('presale_orders').select('code').eq('email', `${TS}@example.test`).single()).data!.code;
  const r = await admin.rpc('record_sepay_transaction', { p: { id: 8_999_999_001, gateway: 'QA', transactionDate: '2026-09-27 10:00:00', accountNumber: ACC, code: null, content: `CK ${code}`, transferType: 'in', transferAmount: 199000, referenceCode: 'QA' } });
  await admin.from('billing_settings').delete().eq('id', true);
  console.log(JSON.stringify(r.data), T);
} else {
  await admin.from('presale_orders').update({ sepay_transaction_id: null, status: 'expired', paid_at: null, claim_expires_at: null } as never).eq('email', `${TS}@example.test`);
  await admin.from('sepay_transactions').delete().eq('sepay_id', 8_999_999_001);
  await admin.from('presale_orders').delete().eq('email', `${TS}@example.test`);
  await admin.from('billing_settings').delete().eq('id', true);
  for (const t of ['presale_orders', 'sepay_transactions', 'billing_settings']) console.log(t, (await admin.from(t as never).select('*', { count: 'exact', head: true })).count);
}
