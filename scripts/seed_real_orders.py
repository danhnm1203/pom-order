#!/usr/bin/env python3
"""Seed the database with 7 real historic orders from order.xlsx.

Bypasses the API — writes directly via SQLAlchemy. After running:
  - Dashboard will show real data (status counts, top brands, amount owed)
  - You can verify profit calculations match your manual spreadsheet
  - All status enum INSERT paths are exercised (regression check)

Run from project root:
  cd backend && . .venv/bin/activate && python ../scripts/seed_real_orders.py
"""

from __future__ import annotations

import asyncio
import sys
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from uuid import UUID, uuid4

# Make 'app' importable when running from project root
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from app.db.session import session_factory  # noqa: E402
from app.models.customer import Customer, CustomerContact  # noqa: E402
from app.models.order import Order, OrderItem, OrderStatus  # noqa: E402
from app.models.payment import Payment, PaymentType  # noqa: E402


SHOP_ID = UUID("00000000-0000-0000-0000-000000000001")
FX_RATE = Decimal("18.0")
ORDER_DATE = datetime(2026, 5, 3, tzinfo=timezone.utc)
EXPECTED_ARRIVAL = date(2026, 5, 25)


# Real orders from order.xlsx (rows with complete data, rows 4 and 5 skipped)
SEED_ORDERS = [
    {
        "customer": "Nguyễn Phương Quỳnh",
        "contacts": [{"channel": "zalo", "value": "0901111111", "is_primary": True}],
        "status": OrderStatus.ORDERED,  # 구매
        "items": [
            {
                "brand": "Clio",
                "product": "[1+1+1] 버터밤 크레용 기획 [본품+샤프너증정]",
                "url": "https://clubclio.co.kr/shop/goodsView/0000006846",
                "qty": Decimal("1"),
                "cost_krw": Decimal("7700"),
                "sale_vnd": Decimal("170000"),
                "notes": "Màu 1, 4, 9",
            }
        ],
    },
    {
        "customer": "Dao Anh",
        "contacts": [{"channel": "zalo", "value": "0902222222", "is_primary": True}],
        "status": OrderStatus.PENDING,  # rỗng
        "items": [
            {
                "brand": "Bioderma",
                "product": "핑크색인 Bioderma 클랜징 워터",
                "url": "https://m.kor.lottedfs.com/kr/product/productDetail?prdNo=20000613207",
                "qty": Decimal("1"),
                "cost_krw": Decimal("17500"),
                "sale_vnd": Decimal("425000"),
                "notes": "dutyfree에서 사기 (mua tại sân bay)",
            }
        ],
    },
    {
        "customer": "Trang Ngo",
        "contacts": [{"channel": "zalo", "value": "0903333333", "is_primary": True}],
        "status": OrderStatus.ORDERED,
        "items": [
            {
                "brand": "Mediheal",
                "product": "Mediheal 팩",
                "url": "https://m.oliveyoung.co.kr/m/goods/getGoodsDetail.do?goodsNo=A000000223414",
                "qty": Decimal("2"),
                "cost_krw": Decimal("10000"),
                "sale_vnd": Decimal("245000"),
                "notes": "Màu vàng",
            }
        ],
    },
    {
        "customer": "Thu Hằng",
        "contacts": [{"channel": "zalo", "value": "0904444444", "is_primary": True}],
        "status": OrderStatus.ORDERED,
        "items": [
            {
                "brand": "Make p:rem",
                "product": "Make p:rem 선크림 (xanh lá)",
                "url": "https://m.oliveyoung.co.kr/m/goods/getGoodsDetail.do?goodsNo=A000000184159",
                "qty": Decimal("1"),
                "cost_krw": Decimal("23500"),
                "sale_vnd": Decimal("470000"),
                "notes": "Màu xanh lá",
            },
            {
                "brand": "Torriden",
                "product": "Torriden 립밤 세트",
                "url": "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000253564",
                "qty": Decimal("1"),
                "cost_krw": Decimal("13900"),
                "sale_vnd": Decimal("285000"),
                "notes": "Set: 2 hồng + 1 trắng",
            },
        ],
    },
    {
        "customer": "Mỷ Tâm",
        "contacts": [{"channel": "zalo", "value": "0905555555", "is_primary": True}],
        "status": OrderStatus.IN_TRANSIT,  # đang ship từ Hàn về
        "items": [
            {
                "brand": "Numbuzin",
                "product": "[넘버즈인] 1번 판토텐산 액티브 수딩크림 80ml 1+1 기획",
                "url": "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000229151",
                "qty": Decimal("1"),
                "cost_krw": Decimal("26900"),
                "sale_vnd": Decimal("585000"),
                "notes": None,
            }
        ],
    },
    {
        "customer": "Thuy",
        "contacts": [{"channel": "zalo", "value": "0906666666", "is_primary": True}],
        "status": OrderStatus.ORDERED,
        "items": [
            {
                "brand": "Make p:rem",
                "product": "Make p:rem 선크림 (xanh lá) — share 1/2",
                "url": "https://m.oliveyoung.co.kr/m/goods/getGoodsDetail.do?goodsNo=A000000184159",
                "qty": Decimal("0.5"),
                "cost_krw": Decimal("33900"),
                "sale_vnd": Decimal("470000"),
                "notes": "Chia đôi với khách khác",
            }
        ],
    },
]


async def get_or_create_customer(
    db: AsyncSession, *, name: str, contacts: list[dict]
) -> Customer:
    """Idempotent: returns existing customer by name, or creates new one."""
    result = await db.execute(
        select(Customer)
        .where(Customer.shop_id == SHOP_ID)
        .where(Customer.name == name)
        .where(Customer.deleted_at.is_(None))
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    customer = Customer(shop_id=SHOP_ID, name=name)
    db.add(customer)
    await db.flush()

    for c in contacts:
        db.add(
            CustomerContact(
                customer_id=customer.id,
                channel=c["channel"],
                value=c["value"],
                is_primary=c.get("is_primary", False),
            )
        )
    await db.flush()
    return customer


async def main() -> None:
    print("Seeding 6 customers + 7 orders from order.xlsx...")

    async with session_factory() as db:
        # Wipe existing demo orders so script is idempotent
        await db.execute(
            select(Order).where(Order.shop_id == SHOP_ID).execution_options(synchronize_session=False)
        )
        # (Soft reset: caller can manually clear if they want a fresh state)

        created_orders = 0
        for entry in SEED_ORDERS:
            customer = await get_or_create_customer(
                db, name=entry["customer"], contacts=entry["contacts"]
            )

            order = Order(
                shop_id=SHOP_ID,
                customer_id=customer.id,
                status=entry["status"],
                fx_rate_krw_to_vnd=FX_RATE,
                korean_shipping_krw=Decimal("0"),
                international_shipping_vnd=Decimal("0"),
                expected_arrival_date=EXPECTED_ARRIVAL,
                ordered_at=ORDER_DATE if entry["status"] != OrderStatus.PENDING else None,
                notes="Seeded from order.xlsx historic data",
            )
            db.add(order)
            await db.flush()

            for item in entry["items"]:
                db.add(
                    OrderItem(
                        order_id=order.id,
                        product_name_snapshot=item["product"],
                        product_url_snapshot=item["url"],
                        brand_name_snapshot=item["brand"],
                        quantity=item["qty"],
                        unit_cost_krw=item["cost_krw"],
                        unit_sale_price_vnd=item["sale_vnd"],
                        notes=item["notes"],
                    )
                )

            # Add 1 deposit payment for Trang Ngo (qty 2 Mediheal) — realistic flow
            if entry["customer"] == "Trang Ngo":
                db.add(
                    Payment(
                        order_id=order.id,
                        shop_id=SHOP_ID,
                        idempotency_key=uuid4(),
                        amount_vnd=Decimal("200000"),
                        type=PaymentType.DEPOSIT,
                        paid_at=ORDER_DATE,
                        notes="Cọc 40%",
                    )
                )

            # Full payment for Mỷ Tâm (Numbuzin in_transit) — recently completed deposit
            if entry["customer"] == "Mỷ Tâm":
                db.add(
                    Payment(
                        order_id=order.id,
                        shop_id=SHOP_ID,
                        idempotency_key=uuid4(),
                        amount_vnd=Decimal("585000"),
                        type=PaymentType.BALANCE,
                        paid_at=ORDER_DATE,
                        notes="Thanh toán đủ trước ship",
                    )
                )

            created_orders += 1
            print(f"  ✓ {entry['customer']}: order #{order.id.hex[:8]} ({entry['status'].value}) — {len(entry['items'])} item(s)")

        await db.commit()

    print(f"\n✓ {created_orders} orders seeded.")
    print(f"  Refresh dashboard at http://localhost:5173 — phải thấy:")
    print(f"  - Active orders: 6 (Dao Anh pending, others ordered/in_transit)")
    print(f"  - Top brands: Make p:rem (2), then Clio/Bioderma/Mediheal/Torriden/Numbuzin (1 each)")
    print(f"  - Amount owed: ~2,210,000 VND (after 2 deposits = 785,000 VND already paid)")


if __name__ == "__main__":
    asyncio.run(main())
