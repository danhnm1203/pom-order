#!/usr/bin/env python3
"""End-to-end demo of the Pom Order backend API.

Walks through the critical user flow:
  1. Set FX rate (KRW→VND = 18.0)
  2. Create a customer with Zalo contact
  3. Create an order with 2 line items (Olive Young Korean cosmetics)
  4. Record a 30% deposit
  5. Transition status: pending → ordered → in_transit → arrived → delivered
  6. Record balance payment
  7. Transition to completed
  8. Fetch dashboard
  9. Fetch public order page

Requirements:
  - Local Supabase running (`make migrate`)
  - Backend running (`make dev-backend`)
  - A Supabase Auth user added as shop_member (see supabase/seed.sql NOTE)
  - Edit DEMO_JWT below with your Supabase access token

Usage:
  cd backend && . .venv/bin/activate
  pip install httpx
  python ../scripts/demo.py
"""

from __future__ import annotations

import sys
import uuid
from decimal import Decimal

import httpx


API_BASE = "http://localhost:8000"
DEMO_JWT = "REPLACE_ME"  # paste your Supabase access token here


def section(title: str) -> None:
    print(f"\n{'=' * 70}\n{title}\n{'=' * 70}")


def main() -> int:
    if DEMO_JWT == "REPLACE_ME":
        print(
            "ERROR: edit scripts/demo.py and paste your Supabase JWT into DEMO_JWT.\n"
            "Get it from Studio > Authentication > Users > [user] > 'Generate access token',\n"
            "or use a frontend sign-in to capture the token from localStorage."
        )
        return 1

    client = httpx.Client(
        base_url=API_BASE,
        headers={"Authorization": f"Bearer {DEMO_JWT}"},
        timeout=10.0,
    )

    section("1. Health check (no auth)")
    r = httpx.get(f"{API_BASE}/health/")
    print(f"  GET /health/ → {r.status_code} {r.json()}")

    section("2. Set FX rate KRW→VND = 18.0")
    r = client.post(
        "/api/v1/fx-rates",
        json={"base_currency": "KRW", "quote_currency": "VND", "rate": "18.0", "source": "demo"},
    )
    print(f"  POST /api/v1/fx-rates → {r.status_code}")
    if r.is_success:
        print(f"    rate id = {r.json()['id']}")
    else:
        print(f"    error: {r.text}")
        return 1

    section("3. Create customer 'Nguyễn Phương Quỳnh'")
    r = client.post(
        "/api/v1/customers",
        json={
            "name": "Nguyễn Phương Quỳnh",
            "notes": "Demo customer",
            "contacts": [
                {"channel": "zalo", "value": "0901234567", "is_primary": True},
                {"channel": "facebook", "value": "nguyen.phuong.quynh", "is_primary": False},
            ],
        },
    )
    print(f"  POST /api/v1/customers → {r.status_code}")
    if not r.is_success:
        print(f"    error: {r.text}")
        return 1
    customer_id = r.json()["id"]
    print(f"    customer_id = {customer_id}")

    section("4. Create order: Clio + Mediheal, KRW prices")
    r = client.post(
        "/api/v1/orders",
        json={
            "customer_id": customer_id,
            "fx_rate_krw_to_vnd": "18.0",
            "korean_shipping_krw": "0",
            "international_shipping_vnd": "50000",
            "expected_arrival_date": "2026-05-25",
            "notes": "Demo đơn — gồm 2 món",
            "items": [
                {
                    "product_name_snapshot": "[1+1+1] 버터밤 크레용 기획",
                    "product_url_snapshot": "https://clubclio.co.kr/shop/goodsView/0000006846",
                    "brand_name_snapshot": "Clio",
                    "quantity": "1",
                    "unit_cost_krw": "7700",
                    "unit_sale_price_vnd": "170000",
                    "notes": "Màu 1, 4, 9",
                },
                {
                    "product_name_snapshot": "Mediheal 팩 노란색",
                    "product_url_snapshot": "https://m.oliveyoung.co.kr/m/goods/getGoodsDetail.do?goodsNo=A000000223414",
                    "brand_name_snapshot": "Mediheal",
                    "quantity": "2",
                    "unit_cost_krw": "10000",
                    "unit_sale_price_vnd": "245000",
                    "notes": None,
                },
            ],
        },
    )
    print(f"  POST /api/v1/orders → {r.status_code}")
    if not r.is_success:
        print(f"    error: {r.text}")
        return 1
    order = r.json()
    order_id = order["id"]
    public_token = order["public_token"]
    totals = order["totals"]
    print(f"    order_id     = {order_id}")
    print(f"    public_token = {public_token}")
    print(f"    total_vnd    = {totals['total_vnd']}  (expect 170000 + 490000 = 660000)")
    print(f"    cost_vnd     = {totals['cost_vnd']}  (expect 138600 + 360000 = 498600)")
    print(f"    profit_vnd   = {totals['profit_vnd']} (expect 660000-498600-50000 = 111400)")

    section("5. Record 30% deposit")
    idempotency_key = str(uuid.uuid4())
    r = client.post(
        f"/api/v1/orders/{order_id}/payments",
        headers={"Idempotency-Key": idempotency_key},
        json={
            "amount_vnd": "200000",
            "type": "deposit",
            "notes": "Cọc 30% (demo)",
        },
    )
    print(f"  POST /api/v1/orders/.../payments [first request] → {r.status_code}")
    if r.is_success:
        print(f"    payment_id = {r.json()['id']}")
    else:
        print(f"    error: {r.text}")

    section("5b. Replay same Idempotency-Key (should NOT create duplicate)")
    r2 = client.post(
        f"/api/v1/orders/{order_id}/payments",
        headers={"Idempotency-Key": idempotency_key},
        json={
            "amount_vnd": "999999",  # different body — but same key, so existing record returned
            "type": "deposit",
            "notes": "should be ignored",
        },
    )
    print(f"  POST same Idempotency-Key → {r2.status_code} (expect 200, not 201)")
    if r2.is_success:
        print(f"    payment_id = {r2.json()['id']} (should match {r.json()['id']})")
        print(f"    amount = {r2.json()['amount_vnd']} (should be 200000, not 999999)")

    section("6. Status transitions: pending → ordered → in_transit → arrived → delivered")
    for next_status in ["ordered", "in_transit", "arrived", "delivered"]:
        r = client.patch(
            f"/api/v1/orders/{order_id}/status",
            json={"status": next_status},
        )
        print(f"  PATCH /status → {next_status}: {r.status_code}")
        if not r.is_success:
            print(f"    error: {r.text}")
            break

    section("7. Record balance payment")
    r = client.post(
        f"/api/v1/orders/{order_id}/payments",
        headers={"Idempotency-Key": str(uuid.uuid4())},
        json={
            "amount_vnd": "510000",  # 660000 + 50000 intl ship - 200000 deposit
            "type": "balance",
            "notes": "Tất toán",
        },
    )
    print(f"  POST balance → {r.status_code}")

    section("8. Transition to completed")
    r = client.patch(
        f"/api/v1/orders/{order_id}/status",
        json={"status": "completed"},
    )
    print(f"  PATCH /status → completed: {r.status_code}")

    section("9. Fetch order detail (verify amount_owed should be 0)")
    r = client.get(f"/api/v1/orders/{order_id}")
    if r.is_success:
        totals = r.json()["totals"]
        print(f"  total_paid_vnd  = {totals['total_paid_vnd']}  (expect 710000)")
        print(f"  amount_owed_vnd = {totals['amount_owed_vnd']} (expect 0)")

    section("10. Dashboard")
    r = client.get("/api/v1/dashboard")
    if r.is_success:
        dash = r.json()
        print(f"  status_counts = {dash['status_counts']}")
        print(f"  active_orders_count = {dash['active_orders_count']}")
        print(f"  total_amount_owed_vnd = {dash['total_amount_owed_vnd']}")
        print(f"  top_brands_this_month = {dash['top_brands_this_month']}")

    section("11. Public order page (NO auth)")
    r = httpx.get(f"{API_BASE}/api/v1/public/orders/{public_token}")
    if r.is_success:
        pub = r.json()
        print(f"  status = {pub['status']}")
        print(f"  items = {len(pub['items'])} items")
        print(f"  total_vnd = {pub['total_vnd']}")
        print(f"  amount_owed_vnd = {pub['amount_owed_vnd']}")
        # Verify NO PII leakage
        forbidden = ["customer_id", "cost_vnd", "profit_vnd", "phone", "address"]
        leaks = [k for k in forbidden if k in str(pub)]
        if leaks:
            print(f"  ⚠️  POTENTIAL LEAK: {leaks}")
        else:
            print("  ✓ No PII/financial leak detected")

    section("DONE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
