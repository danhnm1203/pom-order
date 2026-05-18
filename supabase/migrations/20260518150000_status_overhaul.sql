-- ============================================================
-- Order status overhaul: rebuild enum + add tracking_number
-- ============================================================
-- Operator's mental model is more granular than the original 8 statuses.
-- New lifecycle: chatting → order_placed → purchased → at_kr_warehouse →
-- at_vn_warehouse → received_by_owner → shipping_to_customer →
-- customer_received. Plus problem / cancelled (off-lifecycle).
--
-- Existing 7 orders are auto-mapped:
--   pending     → order_placed   (customer already has a record in the system)
--   ordered     → purchased       (placed with Korea)
--   in_transit  → at_kr_warehouse (left supplier, en route to VN warehouse)
--   arrived     → at_vn_warehouse (VN warehouse received)
--   delivered   → shipping_to_customer
--   completed   → customer_received
--   problem     → problem
--   cancelled   → cancelled
--
-- `tracking_number` column added on orders for the "shipping to customer"
-- phase. Shown on admin detail + public page so customer can self-track.
--
-- Postgres caveat: cannot drop enum values in use; must rebuild the type.
-- Idempotent guards on column adds.
-- ============================================================

-- 1. New enum type with full lifecycle.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_status_v2') then
    create type order_status_v2 as enum (
      'chatting',
      'order_placed',
      'purchased',
      'at_kr_warehouse',
      'at_vn_warehouse',
      'received_by_owner',
      'shipping_to_customer',
      'customer_received',
      'problem',
      'cancelled'
    );
  end if;
end $$;

-- 2. Drop default temporarily so the column type swap doesn't fail validation.
alter table orders alter column status drop default;

-- 3. Convert old → new using CASE mapping. USING clause coerces each row.
alter table orders
  alter column status type order_status_v2
  using (case status::text
    when 'pending'    then 'order_placed'
    when 'ordered'    then 'purchased'
    when 'in_transit' then 'at_kr_warehouse'
    when 'arrived'    then 'at_vn_warehouse'
    when 'delivered'  then 'shipping_to_customer'
    when 'completed'  then 'customer_received'
    when 'problem'    then 'problem'
    when 'cancelled'  then 'cancelled'
    else 'order_placed'  -- defensive fallback for any unexpected value
  end)::order_status_v2;

-- 4. New default for fresh orders: chatting (earliest stage in the new flow).
alter table orders alter column status set default 'chatting';

-- 5. Retire the old enum and promote v2 to the canonical name.
drop type if exists order_status;
alter type order_status_v2 rename to order_status;

-- 6. Tracking number column for the shipping-to-customer leg.
alter table orders add column if not exists tracking_number text;
