# Pom Order — Feature Backlog & Competitive Advantage Ideas

> Brainstorm session 2026-05-14. Two angles considered:
> - **(A)** Personal-tool polish (Path A from CEO review) — make this app feel ahead of any alternative for the shop owner + their customers
> - **(B)** Commercial moat (if reconsidering Path B/C) — features that would make this worth paying for vs DIY
>
> Effort estimates: CC+gstack scale (most features fit in a weekend; a few are 1-2 day projects).

---

## TL;DR — Top 3 Recommendations

| # | Feature | Effort | Impact (A) | Impact (B) |
|---|---------|--------|------------|------------|
| 1 | Auto Zalo notification on status change | 3-4h | Save 5-15h/tháng on manual messaging | Killer VN-specific moat |
| 2 | Photo updates per status milestone | 2-3h | Customer trust, fewer DM questions | Trust moat for cross-border commerce |
| 3 | Bulk URL paste → auto-scrape product info | 4-6h | Save ~2h/tháng on order entry | Onboarding DX wow |

**If only build one → Zalo auto-notify.** It's the single feature competitors cannot clone in a week, because it requires both engineering AND Zalo OA business setup + local market knowledge. Every other feature is pure engineering.

---

## 1. Customer trust + automation (highest impact)

### 🥇 Auto-notify khách qua Zalo khi đổi status — **(A+B)** | ~3-4h
- **Current pain:** Manually messaging "hàng đã về VN nhé chị" for 30 customers/month = 5-15 hours/month of repetitive copy-paste work
- **Approach:** Webhook on status change → backend calls Zalo Official Account API (or SMS fallback for non-Zalo customers)
- **Why it wins:** No international SaaS competitor has Zalo integration. This is the single most VN-specific moat in this list.
- **Edge cases to handle:**
  - Customer opt-out preference (some prefer no auto-messages)
  - Rate limit / quota on Zalo OA API
  - Template messages per status (vi/ko) — must be pre-approved by Zalo
  - Idempotency: don't double-notify if status transitions rapidly
- **Tech:** Zalo OA Send Message API, template registration, async background task

### 🥈 Photo updates per status milestone — **(A+B)** | ~2-3h
- **Current pain:** Customer pays cọc (deposit) on faith. No proof anything is happening between "đã đặt" and "đã về VN".
- **Approach:** Shop owner uploads 1-3 photos at key transitions:
  1. Supplier giao box ở Hàn (after status='ordered')
  2. Box arrived ở kho VN (after status='arrived')
  3. Ready for pickup
  - Public order page shows gallery
- **Why it wins:** Trust signal for cross-border commerce is everything. Customers share photos back on Zalo → free word-of-mouth marketing.
- **Tech:** Supabase Storage bucket + signed URLs, multi-file upload component on OrderDetailPage, gallery on PublicOrderPage
- **Edge cases:**
  - Image compression before upload (Vietnam mobile networks)
  - HEIC → JPEG conversion (iPhone shop owners)
  - Photo privacy: customers shouldn't see other customers' photos (use public_token scoping)

### Customer self-service trên public order page — **(A)** | ~2h
- **Current pain:** Public page is read-only. Customer wants to specify pickup time / address → has to message owner on Zalo. Back-and-forth × 30 orders/month.
- **Approach:** Add small form on public page (still no login required, scoped to public_token):
  - Pickup time preference (today/tomorrow/specific date)
  - Address confirmation / edit
  - Note to shop owner
- **Why it matters (A):** Cuts 3-5 Zalo round-trips per order
- **Edge cases:**
  - Rate limit (don't let public token be DoS'd)
  - Audit log: customer-submitted edits are visible to owner before applying

### Auto Zalo broadcast — **(A+B)** | ~1h
- **Current pain:** When a shipment arrives, owner has 5-20 customers to notify. Each is a copy-paste.
- **Approach:** Shipment detail page → button "Notify all customers" → backend iterates orders in shipment, sends Zalo template per customer
- **Tech:** Builds on top of #1 (Auto Zalo notification)

---

## 2. Speed of order entry (operator efficiency)

### Bulk URL paste → auto-scrape product info — **(A+B)** | ~4-6h
- **Current pain:** Owner types brand/product/KRW price by hand from Olive Young / Coupang / Wholeysoo. ~60 seconds per item × 5 items × 30 orders = ~2.5 hours/month.
- **Approach:** Paste 5 URLs into a textarea → backend scrapes Open Graph + page metadata → returns brand/name/KRW price/thumbnail → auto-fill order item form
- **Why it wins:** Olive Young, 11st, Coupang all expose decent Open Graph tags. Brand name often in `og:site_name` or breadcrumb.
- **Edge cases:**
  - Sites with JS-rendered content (need headless browser fallback)
  - Rate limit / IP block from Korean sites
  - Pricing structure variations (sale price vs original)
  - Currency detection (some sites show USD/KRW/JPY)
- **Tech:** Python httpx + selectolax for HTML parsing, fallback to LLM extraction for tricky sites

### Voice input for order entry — **(A)** | ~3h
- **Use case:** Owner is shopping in Korea, walking the Olive Young aisles. Dictates: "Sulwhasoo cushion, hai trăm ba mươi nghìn won, hai cái" → Web Speech API + LLM extraction → creates order line.
- **Why it wins:** Magical. No competitor has this. Mobile-first VN behavior.
- **Edge cases:**
  - Vietnamese + Korean mixed speech (works with Whisper / Web Speech API set to vi-VN)
  - Numeric parsing ("hai trăm ba mươi nghìn" = 230,000)
  - Confirmation step before save (voice input is fuzzy)
- **Tech:** Web Speech API (free, browser-native) or Whisper API for higher accuracy, GPT-4o-mini for field extraction

### OCR receipt — **(A+B)** | ~4h
- **Use case:** Snap photo of Korean supplier invoice → auto-extract brand/product/KRW amount → create order
- **Tech:** Gemini 2.0 Flash Vision (free tier sufficient for 30 receipts/month) or GPT-4o Vision
- **Edge cases:**
  - Handwritten Korean (cosmetics packing slip often handwritten)
  - Multiple items per receipt (LLM extracts as array)
  - Owner manually corrects before save

### Auto FX rate fetch — **(A+B)** | ~1h
- **Current pain:** "Ơ quên update tỉ giá rồi" → orders created with stale rate → profit miscalc
- **Approach:** Daily cron job calls Wise API or Naver financial → upserts into fx_rates table with `source='api_wise'`
- **Edge cases:**
  - API downtime → fall back to last known rate, don't auto-overwrite
  - Source attribution in fx_rates table (manual vs auto, makes audit trail clearer)
- **Tech:** APScheduler / cron + httpx + existing fx_rate service

---

## 3. Business intelligence (decision-making impact)

### Profit by customer / by brand dashboard — **(A+B)** | ~2-3h
- **Current pain:** Data is in DB but no aggregated view. Owner doesn't know who their VIP customer is or which brand has best margin.
- **Approach:** 2 new dashboard sections:
  - Top 10 customers by VND profit (12-month window)
  - Top 10 brands by margin % (12-month window)
- **Why it matters:** Better quoting decisions. Excel can't do this dynamically.
- **Tech:** Pure SQL aggregation, existing dashboard endpoint extension

### Customer LTV + reactivation reminder — **(A+B)** | ~2h
- **Use case:** "Sarah chưa order 45 ngày — gửi tin nhắn restock brand cô ấy hay mua?" → 1-click opens Zalo deeplink with pre-filled template
- **Why it matters:** Owners often lose touch with lapsed customers. Re-engagement is much cheaper than acquisition.
- **Edge cases:**
  - Don't suggest reactivation for customers who explicitly churned (canceled order)
  - Customizable lapse threshold (default 30 days)

### Brand restock tracker — **(A+B)** | ~6-8h (requires scraper infrastructure)
- **Use case:** Track Olive Young / Sulwhasoo official / 11st pages. When brand X goes from out-of-stock → in-stock, alert owner: "Laneige cushion vừa back in stock, 3 khách đã order brand này tháng trước. Notify họ?"
- **Why it wins (B):** This is a *real* moat. No tool in VN does this. Requires scraping infra + brand database.
- **Risk:** Scraping is brittle; sites change layouts. Need monitoring + retry logic.
- **Tech:** Headless browser (Playwright in container), 1x/day cron, diff against last run

### Demand forecasting — **(A)** | ~1-2h (simple stats version)
- **Use case:** "Tháng 11 năm ngoái bạn bán 30 Sulwhasoo cushion, dự đoán tháng 11 này 35 cái" → helps with quote-before-order decisions
- **Approach:** Moving average from historical order data, grouped by month + brand
- **Tech:** SQL window functions, no ML needed for v1

---

## 4. Magical / 10x ideas (creative, higher risk)

### AI assistant on public page — **(A+B)** | ~3-4h
- **Use case:** Customer visits public page, asks: "Tháng sau em order Sulwhasoo có còn deal không?" → AI bot responds based on FX rate trend + customer's order history + current brand availability
- **Why it wins:** Personal touch at scale. Public-facing AI assistants are still rare in VN K-beauty space.
- **Tech:** GPT-4o-mini, RAG over order history, public-token scoped context

### Zalo chatbot creates draft orders — **(A+B)** | ~1-2 days
- **Use case:** Customer messages Zalo: "em muốn order Laneige cushion 23N" → bot looks up current KRW price, applies FX rate, creates draft order, pings owner to approve
- **Why it wins:** Sells while you sleep. Owners with this feature could double order volume without doubling work.
- **Edge cases:**
  - Hand-off to human for ambiguous requests
  - Spam / abuse protection (limit drafts per customer per day)
  - Owner approval before order is "real"
- **Tech:** Zalo OA Webhook → backend NLU (GPT-4o-mini) → draft order creation → push notification to owner

### "Suggest order timing" — **(A)** | ~2h
- **Use case:** Dashboard widget: "Hôm nay KRW/VND xuống 0.5%. Đặt đơn hôm nay rẻ hơn ~1.2% so với trung bình tuần. Có 3 đơn pending — proceed?"
- **Why it matters:** Tỉ giá biến động đáng kể qua tuần. Owner thường không tracking, đặt đại lúc cảm thấy cần.
- **Tech:** Rolling 7-day average from fx_rates table, threshold-based alert

### Group buy / referral loop — **(A+B)** | ~3h
- **Use case:** Customer shares public order link → friend orders via link → friend gets -5% discount, original customer gets store credit
- **Why it wins:** Vietnamese commerce culture is heavily referral-driven (Zalo group chats, Facebook groups). Built-in viral loop.
- **Edge cases:**
  - Anti-fraud (same household sharing links)
  - Credit redemption mechanics
  - Tracking link attribution
- **Tech:** Add referral_code + referred_by columns to orders, simple discount calc

### Customs declaration auto-fill — **(A+B)** | ~4h
- **Use case:** VN requires customs declaration for personal imports > 1M VND. Auto-fill the form from order data → generate PDF → owner signs.
- **Why it matters:** Real operational pain. Many shop owners avoid declaring → risk of seizure.
- **Tech:** PDF generation (reportlab or pdfkit), form field mapping

---

## Top 3 Recommendation Summary

If you build only **one** in the next month, build **Auto Zalo Notification (#1)**. Reasons:
1. Direct competitive moat — competitors cannot clone in a week
2. Saves 5-15 hours/month of repetitive work
3. Reduces customer anxiety → better reviews → more referrals
4. Foundation for #4 (broadcast) and the chatbot future

If you build **three**: add Photo Updates (#2) and Bulk URL Paste (#3). All three ship in a single weekend with CC+gstack.

---

## Forcing Questions Before Building

**Path A check:** In the last 30 days, how many Zalo messages did you send per order on average? Count actual messages, not estimate. If > 5/order → build Zalo auto-notify FIRST.

**Path B check:** Can you name ONE other VN K-beauty importer struggling with the same Excel + Zalo workflow? Just one name. If yes → meet them this week, show the app, ask "would you pay $20/month for this?" If no → market pull isn't proven yet; stay on Path A.

---

## Out of scope (intentionally deferred)

- **Mobile native app (iOS/Android):** Current responsive web works. Native is months of work for ~5% UX improvement. Revisit at year 2.
- **Multi-shop SaaS infrastructure:** Already designed (shop_members table + RLS exists), but onboarding/billing/admin UI is its own quarter of work. Don't build until at least 3 paying interested shops named.
- **Inventory management:** Pom Order is order-tracking, not inventory. Different problem, different tool. Avoid scope creep.
- **Multi-currency beyond KRW/VND:** Adding USD/JPY/CNY = 80% of the work for 10% of the value. Defer until a customer explicitly asks.
- **Real-time collaboration (multiple users editing same order):** Single-operator pattern works. Adds CRDTs/locking complexity for zero current pain.

---

## How to use this doc

- Each idea has effort estimate + edge cases. Pick one, copy the section into a new branch, implement.
- When done, delete the section from this file (idea.md = backlog, not history).
- Add new ideas to the bottom as they come up; bump priority by moving up.
