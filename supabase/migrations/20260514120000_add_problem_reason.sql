-- Pom Order — Add problem_reason field to orders
-- Captures WHY an order is in 'problem' status. Set when transitioning to problem,
-- cleared (or kept for history) when transitioning out.
-- Allowed values are application-enforced (not a DB enum) so adding new categories
-- doesn't require a migration.

alter table orders
  add column if not exists problem_reason text;

comment on column orders.problem_reason is
  'Why this order is in problem status. App expects one of: '
  'out_of_stock, wrong_variant, ship_delay, customer_cancel, damaged, customs_hold, other. '
  'Null when status != problem.';
