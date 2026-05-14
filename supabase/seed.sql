-- Pom Order — Seed data for local development
-- Run after migrations. Idempotent.

-- ============================================================
-- 1. Create a dev shop
-- ============================================================
insert into shops (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'Pom K-Beauty Shop', 'pom-kbeauty')
on conflict (slug) do nothing;

-- ============================================================
-- 2. Seed payment methods for the shop
-- ============================================================
insert into payment_methods (shop_id, code, display_name) values
  ('00000000-0000-0000-0000-000000000001', 'cash', 'Tiền mặt'),
  ('00000000-0000-0000-0000-000000000001', 'bank_vcb', 'Vietcombank'),
  ('00000000-0000-0000-0000-000000000001', 'bank_tcb', 'Techcombank'),
  ('00000000-0000-0000-0000-000000000001', 'momo', 'MoMo'),
  ('00000000-0000-0000-0000-000000000001', 'zalopay', 'ZaloPay')
on conflict (shop_id, code) do nothing;

-- ============================================================
-- 3. Seed FX rate (KRW → VND = 18.0 per order.xlsx)
-- ============================================================
insert into fx_rates (shop_id, base_currency, quote_currency, rate, effective_from, source, notes)
values (
  '00000000-0000-0000-0000-000000000001',
  'KRW', 'VND', 18.000000, now(), 'manual', 'Initial seed rate from order.xlsx reference period'
)
on conflict do nothing;

-- ============================================================
-- 4. Seed brands from order.xlsx reference data
-- ============================================================
insert into brands (shop_id, name, name_kr, origin_country) values
  ('00000000-0000-0000-0000-000000000001', 'Clio', 'Clio', 'KR'),
  ('00000000-0000-0000-0000-000000000001', 'Bioderma', 'Bioderma', 'FR'),
  ('00000000-0000-0000-0000-000000000001', 'Mediheal', '메디힐', 'KR'),
  ('00000000-0000-0000-0000-000000000001', 'Dalba', '달바', 'KR'),
  ('00000000-0000-0000-0000-000000000001', 'Make p:rem', '메이크프렘', 'KR'),
  ('00000000-0000-0000-0000-000000000001', 'Torriden', '토리든', 'KR'),
  ('00000000-0000-0000-0000-000000000001', 'Numbuzin', '넘버즈인', 'KR')
on conflict (shop_id, name) do nothing;

-- ============================================================
-- 5. Seed suppliers from order.xlsx reference data
-- ============================================================
insert into suppliers (shop_id, name, url) values
  ('00000000-0000-0000-0000-000000000001', 'Olive Young', 'https://www.oliveyoung.co.kr'),
  ('00000000-0000-0000-0000-000000000001', 'Lotte Duty Free', 'https://kor.lottedfs.com'),
  ('00000000-0000-0000-0000-000000000001', 'Clio Direct', 'https://clubclio.co.kr')
on conflict do nothing;

-- ============================================================
-- 6. NOTE — Adding yourself as shop owner
-- ============================================================
-- After creating your Supabase Auth account, run this manually:
--
--   insert into shop_members (shop_id, user_id, role)
--   values (
--     '00000000-0000-0000-0000-000000000001',
--     '<your-auth-user-id>',
--     'owner'
--   );
--
-- Get your user_id from Supabase Studio > Authentication > Users.
