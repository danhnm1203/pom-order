-- ============================================================
-- Shop-level config for the public price-lookup tool (/tra-cuu).
-- ============================================================
-- A JSONB column keeps the schema flexible: today we ship markup_pct,
-- buying_fee_vnd, weight_fee_vnd, zalo_phone, zalo_message_template.
-- Adding new tunables later (per-brand markup, weight tiers, etc.) is a
-- one-line app-code change, no migration.
-- ============================================================

alter table shops
  add column if not exists lookup_config jsonb not null default jsonb_build_object(
    'markup_pct',             0.20,
    'buying_fee_vnd',         50000,
    'weight_fee_vnd',         30000,
    'zalo_phone',             '',
    'zalo_message_template',  'Em muốn order: {name}{br}Link: {url}{br}Giá tham khảo: {price_vnd} ₫'
  );
