"""CRITICAL regression test — compute_order_totals parity with order.xlsx.

Fixture data is 9 orders extracted from order.xlsx (the shop owner's manual
spreadsheet). For each order with complete data, compute_order_totals MUST
produce a profit_vnd that exactly matches the 이익 (profit) column.

If this test fails after a change to order_calculations.py, the change is
breaking historical math. Either:
  (a) revert the change, or
  (b) update the fixture deliberately AND notify the user that historic
      profit numbers will now show differently.

Source: /Users/.../pom_order/order.xlsx (rows 1-9, sheet 'Trang tính1')
FX rate uniform 18.0 KRW→VND across all rows in this period.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

import pytest

from app.services.order_calculations import compute_order_totals


FX_RATE = Decimal("18.0")


@dataclass(frozen=True)
class ItemFixture:
    """Minimal item shape that compute_order_totals accepts via Protocol."""

    quantity: Decimal
    unit_cost_krw: Decimal
    unit_sale_price_vnd: Decimal


# fmt: off
# Format: (row#, description, items, expected_total, expected_cost, expected_profit, korean_shipping, intl_shipping)
ORDER_XLSX_FIXTURES = [
    # Row 1: Clio 버터밤 — qty 1, KRW 7700, VND cost 138600, sale 170000, profit 31400
    (
        1, "Clio 버터밤 — Nguyen Phuong Quynh",
        [ItemFixture(Decimal("1"), Decimal("7700"), Decimal("170000"))],
        Decimal("170000"),   # total = 170000 × 1
        Decimal("138600"),   # cost = 7700 × 1 × 18
        Decimal("31400"),    # profit = 170000 − 138600 − 0
        Decimal("0"),        # korean shipping (한국 내 배송비)
        Decimal("0"),        # international shipping (한베 배송비)
    ),
    # Row 2: Bioderma 클랜징 워터 — qty 1, KRW 17500, sale 425000, profit 110000
    (
        2, "Bioderma — Dao Anh",
        [ItemFixture(Decimal("1"), Decimal("17500"), Decimal("425000"))],
        Decimal("425000"),
        Decimal("315000"),   # 17500 × 1 × 18
        Decimal("110000"),
        Decimal("0"),
        Decimal("0"),
    ),
    # Row 3: Mediheal 팩 — qty 2, KRW 10000/unit, sale 245000/unit, total 490000, profit 130000
    (
        3, "Mediheal — Trang Ngo",
        [ItemFixture(Decimal("2"), Decimal("10000"), Decimal("245000"))],
        Decimal("490000"),   # 245000 × 2
        Decimal("360000"),   # 10000 × 2 × 18
        Decimal("130000"),
        Decimal("0"),
        Decimal("0"),
    ),
    # Row 5: Make p:rem 선크림 핑크 — qty 1, KRW 23500, sale 470000, profit 47000
    (
        5, "Make p:rem pink — (no customer name in source)",
        [ItemFixture(Decimal("1"), Decimal("23500"), Decimal("470000"))],
        Decimal("470000"),
        Decimal("423000"),   # 23500 × 1 × 18
        Decimal("47000"),
        Decimal("0"),
        Decimal("0"),
    ),
    # Row 6: Make p:rem 선크림 녹색 — qty 1, KRW 23500, sale 470000, profit 47000
    (
        6, "Make p:rem green — Thu Hằng",
        [ItemFixture(Decimal("1"), Decimal("23500"), Decimal("470000"))],
        Decimal("470000"),
        Decimal("423000"),
        Decimal("47000"),
        Decimal("0"),
        Decimal("0"),
    ),
    # Row 7: Torriden 립밤 세트 — qty 1, KRW 13900, sale 285000, profit 34800
    (
        7, "Torriden lip balm set — Thu Hằng",
        [ItemFixture(Decimal("1"), Decimal("13900"), Decimal("285000"))],
        Decimal("285000"),
        Decimal("250200"),   # 13900 × 1 × 18
        Decimal("34800"),
        Decimal("0"),
        Decimal("0"),
    ),
    # Row 8: Numbuzin 1번 판토텐산 — qty 1, KRW 26900, sale 585000, profit 100800
    (
        8, "Numbuzin No.1 — Mỷ Tâm",
        [ItemFixture(Decimal("1"), Decimal("26900"), Decimal("585000"))],
        Decimal("585000"),
        Decimal("484200"),   # 26900 × 1 × 18
        Decimal("100800"),
        Decimal("0"),
        Decimal("0"),
    ),
    # Row 9: Make p:rem 녹색 — qty 0.5, KRW 33900/unit, sale 470000/unit, total 235000
    # This is a LOSS case (split order, half quantity at full unit price).
    # cost = 33900 × 0.5 × 18 = 305100 ; total = 470000 × 0.5 = 235000 ; profit = -70100
    (
        9, "Make p:rem half — Thuy (split order, expected loss)",
        [ItemFixture(Decimal("0.5"), Decimal("33900"), Decimal("470000"))],
        Decimal("235000"),
        Decimal("305100"),
        Decimal("-70100"),   # negative profit OK — test handles loss correctly
        Decimal("0"),
        Decimal("0"),
    ),
]
# fmt: on

# Note: Row 4 (Dalba — Ngọc Thuý, status='문제'/problem) is excluded because the
# source had no KRW price (incomplete data). The application should NOT compute
# profit for incomplete orders.


@pytest.mark.parametrize(
    "row, description, items, expected_total, expected_cost, expected_profit, korean_ship, intl_ship",
    ORDER_XLSX_FIXTURES,
    ids=[f"xlsx_row_{r}" for r, *_ in ORDER_XLSX_FIXTURES],
)
def test_profit_matches_xlsx_column(
    row: int,
    description: str,
    items: list[ItemFixture],
    expected_total: Decimal,
    expected_cost: Decimal,
    expected_profit: Decimal,
    korean_ship: Decimal,
    intl_ship: Decimal,
) -> None:
    """compute_order_totals must match the manual profit column from order.xlsx exactly."""
    totals = compute_order_totals(
        items=items,
        payments=[],  # historic xlsx has no separate payment records yet
        fx_rate_krw_to_vnd=FX_RATE,
        korean_shipping_krw=korean_ship,
        international_shipping_vnd=intl_ship,
    )

    assert totals.total_vnd == expected_total, (
        f"Row {row} ({description}): total mismatch. "
        f"Expected {expected_total}, got {totals.total_vnd}"
    )
    assert totals.cost_vnd == expected_cost, (
        f"Row {row} ({description}): cost mismatch. "
        f"Expected {expected_cost}, got {totals.cost_vnd}"
    )
    assert totals.profit_vnd == expected_profit, (
        f"Row {row} ({description}): PROFIT MISMATCH (CRITICAL). "
        f"Expected {expected_profit}, got {totals.profit_vnd}. "
        f"This means historic profit numbers will display differently than the "
        f"shop owner's spreadsheet."
    )


def test_empty_order_returns_zero() -> None:
    """No items + no payments + zero shipping = all zeros."""
    totals = compute_order_totals(
        items=[],
        payments=[],
        fx_rate_krw_to_vnd=FX_RATE,
        korean_shipping_krw=Decimal("0"),
        international_shipping_vnd=Decimal("0"),
    )
    assert totals.total_vnd == Decimal("0")
    assert totals.cost_vnd == Decimal("0")
    assert totals.profit_vnd == Decimal("0")
    assert totals.amount_owed_vnd == Decimal("0")


def test_korean_shipping_added_to_cost() -> None:
    """Korean domestic shipping (한국 내 배송비) is part of cost, reducing profit.

    Scenario: order from Olive Young, 1 item KRW 10000, with 3000 KRW domestic shipping.
    Without korean_ship: cost = 180000 VND, sale 250000 → profit 70000
    With korean_ship 3000 KRW: cost = 180000 + 54000 = 234000 → profit 16000
    """
    item = ItemFixture(Decimal("1"), Decimal("10000"), Decimal("250000"))
    totals = compute_order_totals(
        items=[item],
        payments=[],
        fx_rate_krw_to_vnd=FX_RATE,
        korean_shipping_krw=Decimal("3000"),
        international_shipping_vnd=Decimal("0"),
    )
    assert totals.cost_vnd == Decimal("234000")  # (10000 + 3000) × 18
    assert totals.profit_vnd == Decimal("16000")  # 250000 − 234000


def test_international_shipping_reduces_profit_but_not_total() -> None:
    """한베 배송비 is separate from total; it reduces profit but doesn't change total."""
    item = ItemFixture(Decimal("1"), Decimal("10000"), Decimal("250000"))
    totals = compute_order_totals(
        items=[item],
        payments=[],
        fx_rate_krw_to_vnd=FX_RATE,
        korean_shipping_krw=Decimal("0"),
        international_shipping_vnd=Decimal("50000"),
    )
    assert totals.total_vnd == Decimal("250000")  # unchanged
    assert totals.cost_vnd == Decimal("180000")  # unchanged
    assert totals.profit_vnd == Decimal("20000")  # 250000 − 180000 − 50000


class _PaymentFixture:
    def __init__(self, amount: Decimal, type_str: str) -> None:
        self.amount_vnd = amount
        self.type = type_str


def test_payment_lifecycle_deposit_then_balance() -> None:
    """Cọc → tất toán: total_paid sums positive amounts."""
    item = ItemFixture(Decimal("1"), Decimal("10000"), Decimal("250000"))
    payments = [
        _PaymentFixture(Decimal("100000"), "deposit"),
        _PaymentFixture(Decimal("150000"), "balance"),
    ]
    totals = compute_order_totals(
        items=[item],
        payments=payments,
        fx_rate_krw_to_vnd=FX_RATE,
        korean_shipping_krw=Decimal("0"),
        international_shipping_vnd=Decimal("0"),
    )
    assert totals.total_paid_vnd == Decimal("250000")
    assert totals.amount_owed_vnd == Decimal("0")


def test_refund_subtracts_from_total_paid() -> None:
    """Hoàn tiền: refund counts negative."""
    item = ItemFixture(Decimal("1"), Decimal("10000"), Decimal("250000"))
    payments = [
        _PaymentFixture(Decimal("250000"), "balance"),
        _PaymentFixture(Decimal("50000"), "refund"),
    ]
    totals = compute_order_totals(
        items=[item],
        payments=payments,
        fx_rate_krw_to_vnd=FX_RATE,
        korean_shipping_krw=Decimal("0"),
        international_shipping_vnd=Decimal("0"),
    )
    assert totals.total_paid_vnd == Decimal("200000")
    assert totals.amount_owed_vnd == Decimal("50000")
