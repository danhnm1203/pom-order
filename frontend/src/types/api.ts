/** API response types matching FastAPI backend Pydantic schemas. */

export type OrderStatus =
  | 'pending'
  | 'ordered'
  | 'in_transit'
  | 'arrived'
  | 'delivered'
  | 'completed'
  | 'problem'
  | 'cancelled'

export type PaymentType = 'deposit' | 'balance' | 'refund' | 'adjustment'

export interface OrderTotals {
  total_vnd: string
  cost_vnd: string
  profit_vnd: string
  international_shipping_vnd: string
  total_paid_vnd: string
  amount_owed_vnd: string
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string | null
  variant_id: string | null
  product_name_snapshot: string
  product_url_snapshot: string | null
  brand_name_snapshot: string | null
  quantity: string
  unit_cost_krw: string
  unit_sale_price_vnd: string
  notes: string | null
}

export interface CustomerListItem {
  id: string
  name: string
  /** Denormalized phone — populated for list views even when `contacts` is empty. */
  primary_phone: string | null
  contacts: CustomerContact[]
}

export interface Order {
  id: string
  shop_id: string
  public_token: string
  customer_id: string | null
  address_id: string | null
  shipment_id: string | null
  status: OrderStatus
  fx_rate_krw_to_vnd: string
  korean_shipping_krw: string
  international_shipping_vnd: string
  notes: string | null
  problem_reason: string | null
  ordered_at: string | null
  expected_arrival_date: string | null
  created_at: string
  updated_at: string
  items: OrderItem[]
  customer: CustomerListItem | null
  totals: OrderTotals | null
}

export interface OrderShortLink {
  long_url: string
  short_url: string | null
  is_cached: boolean
  error_reason: string | null
}

export type ProblemReason =
  | 'out_of_stock'
  | 'wrong_variant'
  | 'ship_delay'
  | 'customer_cancel'
  | 'damaged'
  | 'customs_hold'
  | 'other'

/** @deprecated — use t('problem_reason.out_of_stock') etc. */
export const PROBLEM_REASON_LABELS: Record<ProblemReason, string> = {
  out_of_stock: 'Hết hàng bên Hàn',
  wrong_variant: 'Sai màu/size',
  ship_delay: 'Ship trễ',
  customer_cancel: 'Khách hủy',
  damaged: 'Hư hỏng trong vận chuyển',
  customs_hold: 'Bị giữ ở hải quan',
  other: 'Khác',
}

export interface Payment {
  id: string
  order_id: string
  shop_id: string
  amount_vnd: string
  type: PaymentType
  method_id: string | null
  paid_at: string
  reference: string | null
  notes: string | null
  created_at: string
}

/** Free-text channel — common values: phone, zalo, facebook, instagram, kakao,
 *  line, email. Stored lowercased. */
export type ContactChannel = string

export interface CustomerContact {
  id: string
  channel: ContactChannel
  value: string
  /** Optional deep-link/profile URL associated with this contact
   *  (e.g. https://zalo.me/0987... for a zalo entry). */
  url: string | null
  is_primary: boolean
}

export interface CustomerAddress {
  id: string
  recipient_name: string | null
  street: string
  ward: string | null
  district: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  is_default: boolean
}

export interface Customer {
  id: string
  shop_id: string
  name: string
  notes: string | null
  primary_phone: string | null
  created_at: string
  updated_at: string
  contacts: CustomerContact[]
  addresses: CustomerAddress[]
}

export interface Product {
  id: string
  shop_id: string
  brand_id: string | null
  brand_name: string | null
  name: string
  name_kr: string | null
  url: string | null
  base_price_krw: string | null
  created_at: string
  updated_at: string
}

export interface ProductStats {
  total_qty: string
  ordered_qty: string
  delivered_qty: string
  pending_qty: string
}

export interface ProductWithStats extends Product {
  stats: ProductStats
}

export interface FxRate {
  id: string
  shop_id: string
  base_currency: string
  quote_currency: string
  rate: string
  effective_from: string
  effective_to: string | null
  source: string | null
  notes: string | null
  created_at: string
}

export interface StatusCount {
  status: OrderStatus
  count: number
}

export interface BrandSummary {
  brand_name: string
  order_count: number
  total_vnd: string
}

export interface DashboardData {
  status_counts: StatusCount[]
  total_amount_owed_vnd: string
  total_krw_ordered_this_month: string
  top_brands_this_month: BrandSummary[]
  active_orders_count: number
  fx_rate_age_days: number | null
  fx_rate_is_stale: boolean
}

export interface CustomerProfit {
  customer_id: string
  customer_name: string
  order_count: number
  revenue_vnd: string
  cost_vnd: string
  profit_vnd: string
}

export interface BrandProfit {
  brand_name: string
  order_count: number
  item_count: number
  revenue_vnd: string
  cost_vnd: string
  profit_vnd: string
  /** Percent (0-100) with 2 decimals; null when revenue is 0. */
  margin_pct: string | null
}

export interface ProfitDashboardData {
  window_months: number
  top_customers_by_profit: CustomerProfit[]
  top_brands_by_profit: BrandProfit[]
}

export interface PublicShopInfo {
  name: string
  zalo_phone: string
  has_zalo: boolean
}

export interface PriceBreakdown {
  product_vnd: number
  markup_vnd: number
  buying_fee_vnd: number
  weight_fee_vnd: number
  total_vnd: number
}

export interface LookupResponse {
  source_url: string
  brand: string | null
  name: string
  price_krw: string | null
  image_url: string | null
  fx_rate: string | null
  breakdown: PriceBreakdown | null
  zalo_url: string | null
}

export interface LookupConfig {
  markup_pct: string
  buying_fee_vnd: number
  weight_fee_vnd: number
  zalo_phone: string
  zalo_message_template: string
}

export interface PublicOrderResponse {
  status: OrderStatus
  created_at: string
  expected_arrival_date: string | null
  items: Array<{
    product_name: string
    brand: string | null
    quantity: string
    notes: string | null
  }>
  total_vnd: string
  international_shipping_vnd: string
  total_paid_vnd: string
  amount_owed_vnd: string
}

/**
 * @deprecated Use `useTranslation()` with `t('status.pending')` etc. instead.
 * Kept for non-React contexts (utilities, tests). Always Vietnamese.
 */
export const STATUS_LABELS_VI: Record<OrderStatus, string> = {
  pending: 'Đang quote',
  ordered: 'Đã đặt với Hàn',
  in_transit: 'Đang vận chuyển',
  arrived: 'Đã về VN',
  delivered: 'Đã giao khách',
  completed: 'Tất toán xong',
  problem: 'Có vấn đề',
  cancelled: 'Đã hủy',
}

/** @deprecated — use t() */
export const PAYMENT_TYPE_LABELS_VI: Record<PaymentType, string> = {
  deposit: 'Cọc',
  balance: 'Tất toán',
  refund: 'Hoàn tiền',
  adjustment: 'Điều chỉnh',
}

// Backwards-compat re-exports during refactor migration.
// Will be removed once all components use t() directly.
export const STATUS_LABELS = STATUS_LABELS_VI
export const PAYMENT_TYPE_LABELS = PAYMENT_TYPE_LABELS_VI
