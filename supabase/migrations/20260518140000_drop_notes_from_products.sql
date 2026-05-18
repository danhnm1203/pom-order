-- ============================================================
-- Drop notes column from products
-- ============================================================
-- Per-product notes turned out wrong: variant info (color, size) belongs to
-- the order_item snapshot (it varies per customer order), not the product
-- catalog row. Reverting commit 20260518130000_add_notes_to_products.
-- Idempotent.

alter table products drop column if exists notes;
