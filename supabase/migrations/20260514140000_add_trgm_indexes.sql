-- ============================================================
-- pg_trgm + GIN indexes for case-insensitive partial-match search
-- ============================================================
-- Search queries in list_orders / list_customers use `ilike '%term%'`.
-- Leading wildcard prevents B-tree usage → seq scan.
-- pg_trgm + GIN index lets ilike use the index (~10-100x faster at scale).
-- All idempotent — safe to re-run.
-- ============================================================

create extension if not exists pg_trgm;

create index if not exists order_items_brand_trgm
  on order_items using gin (brand_name_snapshot gin_trgm_ops);

create index if not exists order_items_product_trgm
  on order_items using gin (product_name_snapshot gin_trgm_ops);

create index if not exists customers_name_trgm
  on customers using gin (name gin_trgm_ops);
