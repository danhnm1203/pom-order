"""Olive Young product scraper — targets the Korean storefront directly.

Accepts URLs in any of these shapes:
  - https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=AXXX...
  - https://m.oliveyoung.co.kr/m/mtn/goods/getGoodsDetail.do?goodsNo=AXXX
  - https://global.oliveyoung.com/product/detail?prdtNo=AXXX

The Korean storefront sits behind Cloudflare's Managed Challenge. We pass it
by running a real Chromium with fingerprint stealth (see `base._STEALTH_JS`)
and waiting for the challenge JS to settle. Typical pass time on a clean IP
is 3-8 seconds; failures bubble up as `scrape_navigation_failed`.

If Cloudflare ever changes its detection signature and we start getting 403s
across the board, the fallback is to switch the `target_url` to
`global.oliveyoung.com/product/detail?prdtNo=...` — the global site uses the
SAME product ID and renders the same SKU.
"""

from __future__ import annotations

import asyncio
import re
from urllib.parse import parse_qs, urlparse

from app.exceptions import ApiError
from app.services.scraper.base import ScrapedProduct, browser_context


GOODS_NO_RE = re.compile(r"^A\d{8,12}$")
KOREAN_URL = "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo={goods_no}"


def _extract_goods_no(url: str) -> str:
    """Pull the product ID from any Olive Young URL variant."""
    qs = parse_qs(urlparse(url).query)
    for key in ("goodsNo", "prdtNo", "GoodsNo"):
        if key in qs and qs[key]:
            candidate = qs[key][0].strip()
            if GOODS_NO_RE.match(candidate):
                return candidate
    raise ApiError(
        400,
        "invalid_olive_young_url",
        "URL Olive Young không hợp lệ — không tìm thấy goodsNo hoặc prdtNo (vd: A000000231589)",
    )


class OliveYoungScraper:
    async def scrape(self, url: str) -> ScrapedProduct:
        goods_no = _extract_goods_no(url)
        target = KOREAN_URL.format(goods_no=goods_no)

        async with browser_context() as ctx:
            page = await ctx.new_page()
            try:
                # First load: domcontentloaded fires before Cloudflare challenge
                # completes. We then wait for the actual product DOM to appear.
                await page.goto(target, wait_until="domcontentloaded", timeout=15000)
            except Exception as exc:
                raise ApiError(
                    502,
                    "scrape_navigation_failed",
                    f"Không load được trang Olive Young: {exc}",
                ) from exc

            # Wait for the React product detail bundle to render. Olive Young uses
            # CSS Modules with hashed class names (e.g. GoodsDetailInfo_title__Vl_IP),
            # so we match by prefix via [class*=...] selectors. The Cloudflare
            # Managed Challenge auto-passes for a fingerprint-clean Chromium in
            # 3-8s; full timeout is 15s.
            try:
                await page.wait_for_selector(
                    'h3[class*="GoodsDetailInfo_title"]',
                    timeout=15000,
                    state="attached",
                )
            except Exception as exc:
                # Check if we're stuck on the challenge page.
                title = await page.title()
                if "잠시만" in title or "기다려" in title or "Just a moment" in title:
                    raise ApiError(
                        502,
                        "scrape_cloudflare_blocked",
                        "Olive Young Cloudflare challenge không pass được. "
                        "Có thể IP server bị flag — thử lại sau hoặc đổi mạng.",
                    ) from exc
                raise ApiError(
                    502,
                    "scrape_selector_timeout",
                    f"Trang load nhưng không thấy product element. goodsNo={goods_no}",
                ) from exc

            # Small settle delay — product price sometimes injected by inline script
            # right after .prd_name renders.
            await asyncio.sleep(0.3)

            data = await page.evaluate(
                """() => {
                    const text = (sels) => {
                        for (const s of sels) {
                            const el = document.querySelector(s);
                            if (el) {
                                const v = (el.getAttribute('content') || el.textContent || '').trim();
                                if (v) return v;
                            }
                        }
                        return null;
                    };
                    const attr = (sels, attrs) => {
                        for (const s of sels) {
                            const el = document.querySelector(s);
                            if (!el) continue;
                            for (const a of attrs) {
                                const v = el.getAttribute(a);
                                if (v) return v.startsWith('//') ? 'https:' + v : v;
                            }
                        }
                        return null;
                    };
                    // Selectors are based on Olive Young's React CSS Modules
                    // (verified 2026-05-14). Match by prefix to survive hash rotation.
                    return {
                        title: document.title,
                        brand: text([
                            'button[class*="TopUtils_btn-brand"]',
                            'a[class*="brand-name"]',
                            'a[class*="brandName"]',
                        ]),
                        name: text([
                            'h3[class*="GoodsDetailInfo_title"]',
                            'meta[property="og:title"]',
                        ]),
                        // Sale price: `GoodsDetailInfo_price__HASH` — the `_price__`
                        // double underscore differentiates from `_price-before__`,
                        // `_price-day__`, `_price-area__`, etc.
                        price_sale: text([
                            '[class*="GoodsDetailInfo_price__"]',
                        ]),
                        // Strikethrough original price (only present when item is on sale)
                        price_original: text([
                            '[class*="GoodsDetailInfo_price-before"]',
                        ]),
                        image: attr(
                            ['meta[property="og:image"]', '#mainImg', 'img[class*="prd_img"]'],
                            ['content', 'src', 'data-src'],
                        ),
                    };
                }"""
            )

            if not data.get("name"):
                raise ApiError(
                    502,
                    "scrape_no_data",
                    f"Trang load nhưng không trích xuất được tên sản phẩm. goodsNo={goods_no}",
                )

        # Price hierarchy: sale price if shown, else original. Both arrive as
        # "23,500" or "₩23,500" — strip non-digits.
        price_krw = _normalize_price(data.get("price_sale")) or _normalize_price(
            data.get("price_original")
        )

        return ScrapedProduct(
            source_url=url,
            brand=_clean(data.get("brand")),
            name=_clean(data.get("name")) or "(unknown)",
            price_krw=price_krw,
            image_url=data.get("image"),
            raw={
                "goods_no": goods_no,
                "target_url": target,
                "page_title": data.get("title") or "",
            },
        )


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    return " ".join(value.split())  # collapse whitespace


_PRICE_NON_DIGIT = re.compile(r"\D")


def _normalize_price(value: str | None) -> str | None:
    if not value:
        return None
    digits = _PRICE_NON_DIGIT.sub("", value)
    return digits or None
