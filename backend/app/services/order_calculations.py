"""Order financial calculations — SINGLE SOURCE OF TRUTH for money math.

Everything that involves totals, costs, profit, or amounts owed goes through here.
This module is consumed by:
  - GET /api/v1/orders/{id} response totals
  - GET /api/v1/dashboard aggregates
  - GET /api/v1/public/orders/{token} public summary

Decimal everywhere. Never float.

The 9-order regression fixture in tests/regression/test_profit_calc.py verifies
this module against actual data from order.xlsx. If you change formulas here,
the fixture WILL fail and you must update it deliberately.

Formula reference (from order.xlsx columns):
  total_vnd        = Σ(unit_sale_price_vnd × quantity)         — column 총
  cost_vnd         = Σ(unit_cost_krw × quantity × fx_rate)
                     + (korean_shipping_krw × fx_rate)
  profit_vnd       = total_vnd − cost_vnd − international_shipping_vnd
                                                                — column 이익
  total_paid_vnd   = Σ(deposit + balance) − Σ(refund)
  amount_owed_vnd  = total_vnd + international_shipping_vnd − total_paid_vnd
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Protocol


# Quantize targets (precision boundaries)
_VND_QUANT = Decimal("1")           # VND has no subunit (integer dong)
_KRW_QUANT = Decimal("0.01")        # KRW supports 2 decimals for completeness


class _ItemLike(Protocol):
    quantity: Decimal
    unit_cost_krw: Decimal
    unit_sale_price_vnd: Decimal


class _PaymentLike(Protocol):
    amount_vnd: Decimal
    type: object  # PaymentType enum — use .value comparison


@dataclass(frozen=True)
class OrderTotals:
    """Computed financial state for one order. All values in VND, Decimal."""

    total_vnd: Decimal              # = Σ(sale × qty)
    cost_vnd: Decimal               # = Σ(KRW cost × qty × fx) + korean_shipping × fx
    profit_vnd: Decimal             # = total − cost − international_shipping
    international_shipping_vnd: Decimal
    total_paid_vnd: Decimal         # net of refunds
    amount_owed_vnd: Decimal        # = total + intl_shipping − paid


def _round_vnd(value: Decimal) -> Decimal:
    """Round to whole VND (no subunit)."""
    return value.quantize(_VND_QUANT, rounding=ROUND_HALF_UP)


def compute_order_totals(
    items: list[_ItemLike],
    payments: list[_PaymentLike],
    fx_rate_krw_to_vnd: Decimal,
    korean_shipping_krw: Decimal,
    international_shipping_vnd: Decimal,
) -> OrderTotals:
    """Compute all derived financial values for an order.

    All inputs must be Decimal. Function does NOT mutate inputs. Pure & testable.

    Args:
        items: line items (must have quantity, unit_cost_krw, unit_sale_price_vnd).
        payments: payment records (must have amount_vnd and a type with .value).
        fx_rate_krw_to_vnd: snapshot at order creation time.
        korean_shipping_krw: domestic Korean shipping cost in KRW.
        international_shipping_vnd: Korea→VN shipping in VND.

    Returns:
        OrderTotals with rounded VND values.
    """
    # Defensive: coerce to Decimal in case caller passed int/str (tests sometimes do)
    fx = Decimal(fx_rate_krw_to_vnd)
    krw_ship = Decimal(korean_shipping_krw)
    intl_ship = Decimal(international_shipping_vnd)

    # total_vnd = Σ(sale × qty)
    total_vnd = sum(
        (Decimal(item.unit_sale_price_vnd) * Decimal(item.quantity) for item in items),
        Decimal("0"),
    )

    # cost_vnd = Σ(KRW × qty × fx) + (krw_ship × fx)
    items_cost_krw = sum(
        (Decimal(item.unit_cost_krw) * Decimal(item.quantity) for item in items),
        Decimal("0"),
    )
    cost_vnd = (items_cost_krw + krw_ship) * fx

    # profit_vnd = total − cost − intl_shipping
    profit_vnd = total_vnd - cost_vnd - intl_ship

    # Payment math: deposit + balance + adjustment count POSITIVE, refund counts NEGATIVE
    total_paid_vnd = Decimal("0")
    for p in payments:
        ptype = _payment_type_value(p.type)
        amount = Decimal(p.amount_vnd)
        if ptype == "refund":
            total_paid_vnd -= amount
        else:
            # deposit | balance | adjustment all increase paid amount
            total_paid_vnd += amount

    # amount_owed = total + intl_shipping − paid (can be negative = overpayment)
    amount_owed_vnd = total_vnd + intl_ship - total_paid_vnd

    return OrderTotals(
        total_vnd=_round_vnd(total_vnd),
        cost_vnd=_round_vnd(cost_vnd),
        profit_vnd=_round_vnd(profit_vnd),
        international_shipping_vnd=_round_vnd(intl_ship),
        total_paid_vnd=_round_vnd(total_paid_vnd),
        amount_owed_vnd=_round_vnd(amount_owed_vnd),
    )


def _payment_type_value(t: object) -> str:
    """Extract a string from a PaymentType enum or plain string."""
    if hasattr(t, "value"):
        return str(t.value)  # type: ignore[attr-defined]
    return str(t)


def allocate_international_shipping_proportional(
    shipment_total_vnd: Decimal,
    order_totals: list[Decimal],
) -> list[Decimal]:
    """Allocate a shipment's international shipping cost across orders by total weight.

    Used when multiple orders share a single Korea→VN shipment. Each order pays
    a share proportional to its total value (caller decides the basis — could
    also be by weight/count if known).

    Returns: list aligned with input, summing to shipment_total_vnd (rounded).
    """
    total = sum(order_totals, Decimal("0"))
    if total == 0:
        # No basis to allocate — split evenly
        n = len(order_totals)
        if n == 0:
            return []
        share = (shipment_total_vnd / n).quantize(_VND_QUANT, rounding=ROUND_HALF_UP)
        return [share] * n

    allocations = [
        _round_vnd(shipment_total_vnd * order_total / total) for order_total in order_totals
    ]
    # Reconcile rounding drift: dump any leftover into the last allocation
    drift = shipment_total_vnd - sum(allocations, Decimal("0"))
    if allocations and drift != 0:
        allocations[-1] += drift
    return allocations
