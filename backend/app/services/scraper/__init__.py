"""Product URL scraper — extracts brand/name/price from supplier product pages.

Dispatcher pattern: detect domain → route to site-specific extractor. Adding a
new site is one new module + one entry in `EXTRACTORS`.

Why Playwright instead of httpx: Korean e-commerce sites (Olive Young, Coupang,
11st, Sulwhasoo) all gate their product pages behind Cloudflare or render via
SPAs that need JS execution. A real headless browser is the only reliable
single-implementation strategy.
"""

from __future__ import annotations

from urllib.parse import urlparse

from app.exceptions import ApiError
from app.services.scraper.base import ScrapedProduct, Scraper
from app.services.scraper.oliveyoung import OliveYoungScraper

# Domain → scraper map. Subdomains are normalized via _norm_host below.
EXTRACTORS: dict[str, type[Scraper]] = {
    "oliveyoung.co.kr": OliveYoungScraper,
    "oliveyoung.com": OliveYoungScraper,
}


def _norm_host(url: str) -> str:
    """Return the registrable domain (drops www/m subdomains)."""
    host = (urlparse(url).hostname or "").lower()
    # Drop common front-end subdomains. For oliveyoung specifically, both
    # www.oliveyoung.co.kr and global.oliveyoung.com route to OliveYoungScraper.
    parts = host.split(".")
    if len(parts) > 2:
        host = ".".join(parts[-2:]) if parts[-2] not in ("co", "com") else ".".join(parts[-3:])
    return host


async def scrape_product(url: str) -> ScrapedProduct:
    """Look up the right scraper for `url` and run it.

    Raises ApiError(400) if domain not supported, ApiError(502) if scrape fails.
    """
    host = _norm_host(url)
    scraper_cls = EXTRACTORS.get(host)
    if scraper_cls is None:
        raise ApiError(
            400,
            "unsupported_domain",
            f"Chưa hỗ trợ scrape từ domain {host}. Hỗ trợ: {', '.join(sorted(set(EXTRACTORS)))}",
        )
    scraper = scraper_cls()
    return await scraper.scrape(url)


__all__ = ["ScrapedProduct", "scrape_product"]
