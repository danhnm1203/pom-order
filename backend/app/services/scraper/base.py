"""Shared types + Playwright lifecycle helper for scrapers."""

from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Protocol

from playwright.async_api import Browser, BrowserContext, async_playwright


# JS payload injected into every new context to mask common automation fingerprints
# that Cloudflare's bot detection checks. Updated for 2026; if it stops working,
# next thing to try is the `tf-playwright-stealth` package or a real-Chrome
# `playwright_stealth` library.
_STEALTH_JS = """
// 1) navigator.webdriver — the big tell
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

// 2) chrome runtime — Headless Chromium has no `chrome` object
window.chrome = window.chrome || { runtime: {}, app: {}, csi: () => {}, loadTimes: () => {} };

// 3) Languages must match the Accept-Language header. Korean storefront expects ko.
Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });

// 4) Plugins: bots typically report empty; real Chrome reports >=1.
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });

// 5) Permissions API can be probed; make it look normal.
const originalQuery = navigator.permissions && navigator.permissions.query;
if (originalQuery) {
  navigator.permissions.query = (params) =>
    params && params.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : originalQuery(params);
}

// 6) WebGL vendor / renderer — bots often leak SwiftShader.
const getParameter = WebGLRenderingContext.prototype.getParameter;
WebGLRenderingContext.prototype.getParameter = function (param) {
  if (param === 37445) return 'Intel Inc.';           // UNMASKED_VENDOR_WEBGL
  if (param === 37446) return 'Intel Iris OpenGL Engine'; // UNMASKED_RENDERER_WEBGL
  return getParameter.call(this, param);
};
"""


@dataclass(frozen=True)
class ScrapedProduct:
    """Normalized product info returned to the API layer.

    `price_krw` is a string to preserve precision through the API boundary —
    the order schema accepts strings for Decimal fields.
    """

    source_url: str
    brand: str | None
    name: str
    price_krw: str | None
    image_url: str | None
    raw: dict[str, str] | None = None  # debug metadata, not shown to user


class Scraper(Protocol):
    async def scrape(self, url: str) -> ScrapedProduct: ...


@asynccontextmanager
async def browser_context(stealth: bool = True):
    """Single-use Playwright context. Each scrape spins up + tears down.

    For 30 orders/month with ~5 items each, that's ~150 invocations/month.
    Per-call startup cost (~1s) is acceptable. If volume grows 10x, switch
    to a long-lived browser instance owned at app lifespan.

    `stealth=True` injects fingerprint-spoofing JS to pass Cloudflare Managed
    Challenge on sites like www.oliveyoung.co.kr.
    """
    async with async_playwright() as p:
        browser: Browser = await p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",  # required if running inside docker as non-root
                "--disable-features=IsolateOrigins,site-per-process",
                "--disable-dev-shm-usage",
            ],
        )
        context: BrowserContext = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            locale="ko-KR",
            timezone_id="Asia/Seoul",
            viewport={"width": 1366, "height": 900},
            extra_http_headers={
                "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
            },
        )
        if stealth:
            await context.add_init_script(_STEALTH_JS)
        try:
            yield context
        finally:
            await context.close()
            await browser.close()
