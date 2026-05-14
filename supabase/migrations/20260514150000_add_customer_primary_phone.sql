-- ============================================================
-- Denormalize customers.primary_phone
-- ============================================================
-- list_orders eagerly loads customer.contacts solely to show ONE phone in the
-- list view = 1 extra round trip every list call. Denormalizing avoids it.
--
-- Resolution rule (matches frontend getPrimaryContact):
--   1. is_primary=true AND channel='phone' wins
--   2. any channel='phone' wins
--   3. any is_primary=true wins
--   4. else: NULL
-- Triggers on customer_contacts INSERT/UPDATE/DELETE keep it in sync.
-- All idempotent. Safe to re-run.
-- ============================================================

alter table customers add column if not exists primary_phone text;

create or replace function recompute_customer_primary_phone(p_customer_id uuid)
returns void
language plpgsql
as $$
declare
  v_value text;
begin
  -- Preference order: primary phone > any phone > primary anything > null
  select value into v_value
  from customer_contacts
  where customer_id = p_customer_id
  order by
    (channel = 'phone' and is_primary) desc,
    (channel = 'phone') desc,
    is_primary desc,
    created_at asc
  limit 1;

  update customers set primary_phone = v_value where id = p_customer_id;
end;
$$;

create or replace function trg_customer_contacts_sync_primary_phone()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform recompute_customer_primary_phone(old.customer_id);
    return old;
  end if;

  -- For UPDATE that moves a contact between customers, sync both sides
  if tg_op = 'UPDATE' and old.customer_id is distinct from new.customer_id then
    perform recompute_customer_primary_phone(old.customer_id);
  end if;

  perform recompute_customer_primary_phone(new.customer_id);
  return new;
end;
$$;

drop trigger if exists trg_customer_contacts_sync_primary_phone on customer_contacts;
create trigger trg_customer_contacts_sync_primary_phone
  after insert or update or delete on customer_contacts
  for each row execute function trg_customer_contacts_sync_primary_phone();

-- Backfill existing rows
do $$
declare
  r record;
begin
  for r in select id from customers loop
    perform recompute_customer_primary_phone(r.id);
  end loop;
end;
$$;
