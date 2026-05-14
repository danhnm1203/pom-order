-- ============================================================
-- Pom Order: Full schema v2 (post eng review 2026-05-12)
-- ============================================================
-- Apply by: supabase migration new "init_schema" then paste below
-- Order: extensions → enums → tables (shipments before orders) → indexes → RLS → triggers
-- Decisions applied:
--   1A) shop_members table with role enum
--   1B) RLS policies on all tenant tables
--   1C) idempotency_key on payments (unique per shop)
--   2A) computed values defer to backend service (compute_order_totals)
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
create type order_status as enum (
  'pending',      -- chưa đặt, đang quote
  'ordered',      -- đã đặt với supplier Hàn
  'in_transit',   -- đang ship Hàn → VN
  'arrived',      -- về VN
  'delivered',    -- đã giao khách
  'completed',    -- tất toán xong
  'problem',      -- có vấn đề (out of stock, sai màu, ship delay...)
  'cancelled'
);

create type shipment_status as enum (
  'preparing', 'shipped', 'in_transit', 'arrived', 'distributed'
);

create type payment_type as enum ('deposit', 'balance', 'refund', 'adjustment');

create type shop_role as enum ('owner', 'admin', 'staff');

-- ============================================================
-- TENANCY
-- ============================================================
create table shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table shop_members (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role shop_role not null default 'staff',
  created_at timestamptz default now(),
  unique (shop_id, user_id)
);

create index shop_members_user_id_idx on shop_members(user_id);

-- ============================================================
-- CATALOG
-- ============================================================
create table brands (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  name_kr text,
  origin_country text default 'KR',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (shop_id, name)
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  url text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  brand_id uuid references brands(id) on delete set null,
  supplier_id uuid references suppliers(id) on delete set null,
  name text not null,
  name_kr text,
  url text,
  base_price_krw numeric(18,2),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  variant_label text not null,
  sku text,
  created_at timestamptz default now()
);

-- ============================================================
-- CUSTOMERS
-- ============================================================
create table customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index customers_shop_id_idx on customers(shop_id) where deleted_at is null;

create table customer_contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  channel text not null,    -- 'phone', 'zalo', 'facebook', 'kakao', 'email'
  value text not null,
  is_primary boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index customer_contacts_customer_id_idx on customer_contacts(customer_id);

create table addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  recipient_name text,
  street text not null,
  ward text,
  district text,
  city text,
  province text,
  postal_code text,
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index addresses_customer_id_idx on addresses(customer_id);

-- ============================================================
-- FX RATES
-- ============================================================
create table fx_rates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  base_currency text not null,    -- 'KRW'
  quote_currency text not null,   -- 'VND'
  rate numeric(18,6) not null,
  effective_from timestamptz not null,
  effective_to timestamptz,        -- null = current
  source text,                     -- 'manual', 'api_xe', etc.
  notes text,
  created_at timestamptz default now()
);

create unique index fx_rates_current_per_pair
  on fx_rates (shop_id, base_currency, quote_currency)
  where effective_to is null;

-- ============================================================
-- SHIPMENTS  (defined BEFORE orders so orders.shipment_id FK is valid)
-- ============================================================
create table shipments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  label text,                      -- "Shipment 2026-05-15"
  status shipment_status default 'preparing',
  carrier text,
  tracking_number text,
  total_international_cost_vnd numeric(18,0),
  shipped_at timestamptz,
  arrived_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index shipments_shop_id_status_idx on shipments(shop_id, status);

-- ============================================================
-- ORDERS
-- ============================================================
create table orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  public_token uuid unique not null default gen_random_uuid(),
  customer_id uuid references customers(id) on delete restrict,
  address_id uuid references addresses(id),
  shipment_id uuid references shipments(id),
  status order_status default 'pending',
  fx_rate_krw_to_vnd numeric(18,6) not null,
  korean_shipping_krw numeric(18,2) default 0,
  international_shipping_vnd numeric(18,0) default 0,
  notes text,
  ordered_at timestamptz,
  expected_arrival_date date,
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index orders_shop_id_status_idx on orders(shop_id, status) where deleted_at is null;
create index orders_customer_id_idx on orders(customer_id) where deleted_at is null;
create index orders_shipment_id_idx on orders(shipment_id) where shipment_id is not null;
create index orders_created_at_desc_idx on orders(shop_id, created_at desc);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id),
  variant_id uuid references product_variants(id),
  product_name_snapshot text not null,
  product_url_snapshot text,
  brand_name_snapshot text,
  quantity numeric(10,2) not null check (quantity > 0),
  unit_cost_krw numeric(18,2) not null check (unit_cost_krw >= 0),
  unit_sale_price_vnd numeric(18,0) not null check (unit_sale_price_vnd >= 0),
  notes text,
  created_at timestamptz default now()
);

create index order_items_order_id_idx on order_items(order_id);

-- ============================================================
-- PAYMENTS
-- ============================================================
create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  code text not null,              -- 'cash', 'bank_vcb', 'momo', 'zalopay', 'kakao'
  display_name text not null,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique (shop_id, code)
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  shop_id uuid not null references shops(id) on delete cascade,  -- denormalized for RLS
  idempotency_key uuid not null,
  amount_vnd numeric(18,0) not null,
  type payment_type not null,
  method_id uuid references payment_methods(id),
  paid_at timestamptz default now(),
  reference text,                  -- bank ref, momo txn id, etc.
  notes text,
  created_at timestamptz default now(),
  unique (shop_id, idempotency_key)
);

create index payments_order_id_idx on payments(order_id);
create index payments_shop_paid_at_idx on payments(shop_id, paid_at desc);

-- ============================================================
-- AUDIT LOG
-- ============================================================
create table audit_log (
  id bigserial primary key,
  shop_id uuid not null references shops(id) on delete cascade,
  entity_type text not null,       -- 'order', 'payment', 'customer'
  entity_id uuid not null,
  action text not null,            -- 'created', 'status_changed', 'updated', 'deleted'
  actor_id uuid references auth.users(id),
  changes jsonb,                   -- {from: {...}, to: {...}}
  created_at timestamptz default now()
);

create index audit_log_entity_idx on audit_log(entity_type, entity_id);
create index audit_log_shop_created_idx on audit_log(shop_id, created_at desc);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Helper: shops the current user belongs to
create or replace function user_shop_ids() returns setof uuid
language sql stable security invoker
as $$
  select shop_id from shop_members where user_id = auth.uid()
$$;

-- Enable RLS
alter table shops enable row level security;
alter table shop_members enable row level security;
alter table brands enable row level security;
alter table suppliers enable row level security;
alter table products enable row level security;
alter table product_variants enable row level security;
alter table customers enable row level security;
alter table customer_contacts enable row level security;
alter table addresses enable row level security;
alter table fx_rates enable row level security;
alter table shipments enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payment_methods enable row level security;
alter table payments enable row level security;
alter table audit_log enable row level security;

-- Policies
create policy "members_select_their_shops" on shops
  for select using (id in (select user_shop_ids()));

create policy "members_select_own_memberships" on shop_members
  for select using (user_id = auth.uid());

create policy "members_full_access_brands" on brands
  for all using (shop_id in (select user_shop_ids()))
  with check (shop_id in (select user_shop_ids()));

create policy "members_full_access_suppliers" on suppliers
  for all using (shop_id in (select user_shop_ids()))
  with check (shop_id in (select user_shop_ids()));

create policy "members_full_access_products" on products
  for all using (shop_id in (select user_shop_ids()))
  with check (shop_id in (select user_shop_ids()));

create policy "members_full_access_product_variants" on product_variants
  for all using (product_id in (select id from products));

create policy "members_full_access_customers" on customers
  for all using (shop_id in (select user_shop_ids()))
  with check (shop_id in (select user_shop_ids()));

create policy "members_full_access_customer_contacts" on customer_contacts
  for all using (customer_id in (select id from customers));

create policy "members_full_access_addresses" on addresses
  for all using (customer_id in (select id from customers));

create policy "members_full_access_fx_rates" on fx_rates
  for all using (shop_id in (select user_shop_ids()))
  with check (shop_id in (select user_shop_ids()));

create policy "members_full_access_shipments" on shipments
  for all using (shop_id in (select user_shop_ids()))
  with check (shop_id in (select user_shop_ids()));

create policy "members_full_access_orders" on orders
  for all using (shop_id in (select user_shop_ids()))
  with check (shop_id in (select user_shop_ids()));

create policy "members_full_access_order_items" on order_items
  for all using (order_id in (select id from orders));

create policy "members_full_access_payment_methods" on payment_methods
  for all using (shop_id in (select user_shop_ids()))
  with check (shop_id in (select user_shop_ids()));

create policy "members_full_access_payments" on payments
  for all using (shop_id in (select user_shop_ids()))
  with check (shop_id in (select user_shop_ids()));

create policy "members_select_audit_log" on audit_log
  for select using (shop_id in (select user_shop_ids()));
-- audit_log INSERTs happen via service_role from backend (bypasses RLS)

-- ============================================================
-- updated_at triggers
-- ============================================================
create or replace function set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_shops_updated_at before update on shops
  for each row execute function set_updated_at();
create trigger trg_brands_updated_at before update on brands
  for each row execute function set_updated_at();
create trigger trg_suppliers_updated_at before update on suppliers
  for each row execute function set_updated_at();
create trigger trg_products_updated_at before update on products
  for each row execute function set_updated_at();
create trigger trg_customers_updated_at before update on customers
  for each row execute function set_updated_at();
create trigger trg_customer_contacts_updated_at before update on customer_contacts
  for each row execute function set_updated_at();
create trigger trg_addresses_updated_at before update on addresses
  for each row execute function set_updated_at();
create trigger trg_shipments_updated_at before update on shipments
  for each row execute function set_updated_at();
create trigger trg_orders_updated_at before update on orders
  for each row execute function set_updated_at();
