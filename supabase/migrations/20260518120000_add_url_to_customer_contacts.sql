-- ============================================================
-- Add url column to customer_contacts
-- ============================================================
-- A contact (e.g., zalo / haina_88) often has an associated deep-link URL
-- (https://zalo.me/...). Storing it on the same row keeps channel+value+url
-- together instead of abusing channel='url' as a pseudo-channel.
-- Idempotent.

alter table customer_contacts add column if not exists url text;
