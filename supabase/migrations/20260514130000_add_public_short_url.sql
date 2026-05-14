-- Cache for shortened public order URLs (adurl.io or similar).
-- One short URL per order, generated on demand via POST /orders/{id}/short-link.
-- Reusing the same short URL across share clicks avoids burning API quota.

alter table orders
  add column if not exists public_short_url text;

comment on column orders.public_short_url is
  'Cached shortened URL pointing at /o/{public_token}. Populated on demand by '
  'the URL shortener service. Null if never shortened or service unavailable.';
