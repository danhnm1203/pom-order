-- ============================================================
-- Add notes column to products
-- ============================================================
-- Operator stores variant info (color code, size) inline on the product row.
-- Surfaced in the catalog table + search. Free-text, no validation.
-- Idempotent.

alter table products add column if not exists notes text;
