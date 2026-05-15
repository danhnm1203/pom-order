"""Shilla Duty Free scraper — LOCAL ONLY, DO NOT COMMIT.

Shilla DFS's robots.txt explicitly disallows AI scrapers (`ClaudeBot:
Disallow: /`) and asserts copyright reservation under EU Directive 2019/790.
This module exists at the user's explicit request for personal use only,
and the file is gitignored to prevent accidental publication.

URL pattern: https://m.shilladfs.com/estore/kr/ko/p/{productId}
Example:     https://m.shilladfs.com/estore/kr/ko/p/5484165

Shilla ships TWO different product page layouts depending on whether the
brand has a dedicated "boutique" template:

REGULAR layout (e.g. GANNI shirt, most mid-tier brands)
  - strong.info_brand     → "가니 | GANNI"      (Korean | English)
  - p.info_name           → "#BLISSFUL BLUE ..." + nested review widget
  - div.price_box p.price → "$71.5\n(106,899원)" (sale price)
  - div.pro_price_wrap    → "$110\n(164,461원)"  (original, strikethrough)

BOUTIQUE layout (e.g. Dior, Hermès, Chanel; body class
                 `shilladfs{Brand}BoutiqueProductDetailPage`)
  - h4 > [text] + p.pro_tit → "DIOR " + "SHOW 5 COULEURS..." (brand + name)
  - span.basic_price       → "$64(95,686원)"        (no nested sale price)
  - p.info_name elements still exist but live inside `.pro_info`
    recommendation cards — must be filtered out.

Both layouts share image extraction: first <img> whose src matches
image\\d?.shilladfs.com/files/product.

KRW price is always extracted from the parenthesized number inside the price
DOM — Shilla displays USD up front (foreigner-targeted) with KRW conversion
in parentheses, which is the value that matches what the user is actually
charged at checkout in KRW.
"""

from __future__ import annotations

import asyncio
import re
from urllib.parse import urlparse

from app.exceptions import ApiError
from app.services.scraper.base import ScrapedProduct, browser_context


PRODUCT_PATH_RE = re.compile(r"/p/(\d{4,12})(?:/?$|[/?#])")
PRODUCT_URL = "https://m.shilladfs.com/estore/kr/ko/p/{product_id}"
KRW_IN_PARENS_RE = re.compile(r"\(([\d,]+)\s*원\)")


def _extract_product_id(url: str) -> str:
    path = urlparse(url).path
    m = PRODUCT_PATH_RE.search(path)
    if not m:
        raise ApiError(
            400,
            "invalid_shilla_url",
            "URL Shilla DFS không hợp lệ — cần dạng https://m.shilladfs.com/estore/kr/ko/p/{id}",
        )
    return m.group(1)


class ShillaDFSScraper:
    async def scrape(self, url: str) -> ScrapedProduct:
        product_id = _extract_product_id(url)
        target = PRODUCT_URL.format(product_id=product_id)

        async with browser_context() as ctx:
            page = await ctx.new_page()
            try:
                await page.goto(target, wait_until="domcontentloaded", timeout=20000)
            except Exception as exc:
                raise ApiError(
                    502,
                    "scrape_navigation_failed",
                    f"Không load được trang Shilla DFS: {exc}",
                ) from exc

            # Wait for either layout to mount — info_brand (regular) or pro_tit
            # (boutique). Whichever appears first wins.
            try:
                await page.wait_for_selector(
                    "strong.info_brand, p.pro_tit",
                    timeout=15000,
                    state="attached",
                )
            except Exception as exc:
                raise ApiError(
                    502,
                    "scrape_selector_timeout",
                    f"Trang load nhưng không thấy product element. productId={product_id}",
                ) from exc

            await asyncio.sleep(0.5)

            data = await page.evaluate(
                """() => {
                    const text = (sels) => {
                        for (const s of sels) {
                            const el = document.querySelector(s);
                            if (el) {
                                const v = (el.textContent || '').trim();
                                if (v) return v;
                            }
                        }
                        return null;
                    };

                    // ===== NAME + BRAND =====
                    // Boutique layout: <h4>DIOR <p class="pro_tit">SHOW 5 COULEURS...</p></h4>
                    // Regular layout : <strong class="info_brand">가니 | GANNI</strong> + <p class="info_name">...</p>
                    let name = null;
                    let brand_combined = null;

                    const proTit = document.querySelector('p.pro_tit');
                    if (proTit) {
                        // BOUTIQUE
                        name = proTit.textContent.trim();
                        const h4 = proTit.closest('h4');
                        if (h4) {
                            // Take h4 full text minus the pro_tit text → the brand string.
                            const full = h4.textContent.trim();
                            const nameTxt = proTit.textContent.trim();
                            brand_combined = full.replace(nameTxt, '').trim();
                        }
                    } else {
                        // REGULAR layout — the main product's `p.info_name` carries
                        // the modifier class `line_feed` (recommendation cards have
                        // plain `info_name`). Target it explicitly; fall back to the
                        // first `p.info_name` if `line_feed` isn't present.
                        const nameEl =
                            document.querySelector('p.info_name.line_feed') ||
                            document.querySelector('p.info_name');
                        if (nameEl) {
                            const parts = [];
                            for (const n of nameEl.childNodes) {
                                if (n.nodeType === Node.TEXT_NODE) {
                                    const t = n.textContent.trim();
                                    if (t) parts.push(t);
                                }
                                if (n.nodeType === Node.ELEMENT_NODE) break;
                            }
                            name = parts.join(' ').trim();
                        }
                        brand_combined = text(['strong.info_brand']);
                    }

                    // ===== PRICE =====
                    // Prefer sale price (regular layout with discount), fall back to
                    // basic_price (boutique fixed pricing), then strikethrough original.
                    const price_sale_text = text([
                        'div.price_box p.price',
                        'div.price_box',
                    ]);
                    const price_basic_text = text(['span.basic_price']);
                    const price_orig_text = text([
                        'div.pro_price_wrap',
                        'div.pro_price_offer',
                    ]);

                    // ===== IMAGE =====
                    const imgEl = Array.from(document.querySelectorAll('img'))
                        .find(img => /image\\d?\\.shilladfs\\.com\\/files\\/product/.test(img.src));

                    return {
                        title: document.title,
                        brand_combined,
                        name,
                        price_sale_text,
                        price_basic_text,
                        price_orig_text,
                        image: imgEl ? imgEl.src : null,
                    };
                }"""
            )

            if not data.get("name"):
                raise ApiError(
                    502,
                    "scrape_no_data",
                    f"Trang load nhưng không trích xuất được tên sản phẩm. productId={product_id}",
                )

        # Brand: "가니 | GANNI" → pick the English half (after " | ") if present,
        # else the whole string.
        brand_combined = (data.get("brand_combined") or "").strip()
        brand: str | None
        if " | " in brand_combined:
            _, _, english = brand_combined.partition(" | ")
            brand = english.strip() or brand_combined
        else:
            brand = brand_combined or None

        # Price chain: sale (regular) → basic (boutique fixed) → strikethrough original.
        price_krw = (
            _extract_krw(data.get("price_sale_text"))
            or _extract_krw(data.get("price_basic_text"))
            or _extract_krw(data.get("price_orig_text"))
        )

        return ScrapedProduct(
            source_url=url,
            brand=brand,
            name=_clean(data.get("name")) or "(unknown)",
            price_krw=price_krw,
            image_url=data.get("image"),
            raw={
                "product_id": product_id,
                "target_url": target,
                "brand_combined": brand_combined,
                "page_title": data.get("title") or "",
            },
        )


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    return " ".join(value.split())


def _extract_krw(text: str | None) -> str | None:
    if not text:
        return None
    m = KRW_IN_PARENS_RE.search(text)
    if not m:
        return None
    return re.sub(r"\D", "", m.group(1)) or None
