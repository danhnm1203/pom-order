import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { CustomerQuickAdd } from '@/components/CustomerQuickAdd'
import { apiClient, ApiException } from '@/lib/api-client'
import { formatVnd } from '@/lib/utils'
import type { Customer, FxRate, Order } from '@/types/api'

interface DraftItem {
  product_name_snapshot: string
  product_url_snapshot: string
  brand_name_snapshot: string
  quantity: string
  unit_cost_krw: string
  unit_sale_price_vnd: string
  notes: string
}

const EMPTY_ITEM: DraftItem = {
  product_name_snapshot: '',
  product_url_snapshot: '',
  brand_name_snapshot: '',
  quantity: '1',
  unit_cost_krw: '',
  unit_sale_price_vnd: '',
  notes: '',
}

export function NewOrderPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [fx, setFx] = useState<FxRate | null>(null)
  const [customerId, setCustomerId] = useState<string>('')
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [fxRate, setFxRate] = useState<string>('')
  const [koreanShipping, setKoreanShipping] = useState<string>('0')
  const [intlShipping, setIntlShipping] = useState<string>('0')
  const [notes, setNotes] = useState<string>('')
  const [items, setItems] = useState<DraftItem[]>([{ ...EMPTY_ITEM }])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void apiClient.get<Customer[]>('/api/v1/customers?limit=100').then(setCustomers)
    apiClient
      .get<FxRate>('/api/v1/fx-rates/current')
      .then((r) => {
        setFx(r)
        setFxRate(r.rate)
      })
      .catch(() => {
        setError(t('fx.no_rate_set'))
      })
  }, [t])

  const totalKrw = items.reduce(
    (sum, i) => sum + Number(i.unit_cost_krw || 0) * Number(i.quantity || 0),
    0,
  )
  const totalVnd = items.reduce(
    (sum, i) => sum + Number(i.unit_sale_price_vnd || 0) * Number(i.quantity || 0),
    0,
  )
  const costVnd = totalKrw * Number(fxRate || 0) + Number(koreanShipping) * Number(fxRate || 0)
  const profitVnd = totalVnd - costVnd - Number(intlShipping)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const validItems = items.filter(
        (i) => i.product_name_snapshot && i.unit_cost_krw && i.unit_sale_price_vnd,
      )
      if (validItems.length === 0) {
        throw new Error(t('order.must_have_item'))
      }
      const order = await apiClient.post<Order>('/api/v1/orders', {
        customer_id: customerId || null,
        fx_rate_krw_to_vnd: fxRate,
        korean_shipping_krw: koreanShipping,
        international_shipping_vnd: intlShipping,
        notes: notes || null,
        items: validItems.map((i) => ({
          product_name_snapshot: i.product_name_snapshot,
          product_url_snapshot: i.product_url_snapshot || null,
          brand_name_snapshot: i.brand_name_snapshot || null,
          quantity: i.quantity,
          unit_cost_krw: i.unit_cost_krw,
          unit_sale_price_vnd: i.unit_sale_price_vnd,
          notes: i.notes || null,
        })),
      })
      navigate(`/orders/${order.id}`)
    } catch (err) {
      setError(
        err instanceof ApiException
          ? err.message
          : err instanceof Error
            ? err.message
            : t('order.create_error'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  function updateItem(idx: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-xl font-semibold mb-6">{t('order.create_title')}</h1>

      {error && (
        <div className="bg-danger-bg border border-danger/20 text-danger rounded-md p-3 text-sm mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Customer + FX */}
        <section className="bg-surface border border-border rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium">{t('order.customer')}</label>
              {!showQuickAdd && (
                <button
                  type="button"
                  onClick={() => setShowQuickAdd(true)}
                  className="text-xs text-accent hover:underline"
                >
                  {t('order.add_customer_inline')}
                </button>
              )}
            </div>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              disabled={showQuickAdd}
              className="w-full px-3 py-2 border border-border rounded-md text-sm disabled:opacity-50"
            >
              <option value="">{t('order.customer_pick')}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {showQuickAdd && (
              <CustomerQuickAdd
                onCreated={(c) => {
                  setCustomers((prev) => [c, ...prev])
                  setCustomerId(c.id)
                  setShowQuickAdd(false)
                }}
                onCancel={() => setShowQuickAdd(false)}
              />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">
              {t('order.fx_rate')}{' '}
              {fx && (
                <span className="text-xs text-fg-subtle">
                  {t('order.fx_rate_current', { rate: fx.rate })}
                </span>
              )}
            </label>
            <input
              type="number"
              step="0.0001"
              required
              value={fxRate}
              onChange={(e) => setFxRate(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm tabular"
            />
          </div>
        </section>

        {/* Items */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
              {t('order.items')}
            </h2>
            <button
              type="button"
              onClick={() => setItems((prev) => [...prev, { ...EMPTY_ITEM }])}
              className="text-sm text-accent hover:underline"
            >
              {t('order.add_item')}
            </button>
          </div>
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div
                key={idx}
                className="bg-surface border border-border rounded-lg p-3 grid grid-cols-1 md:grid-cols-6 gap-2"
              >
                <input
                  type="text"
                  placeholder={t('order.items_table.brand')}
                  value={item.brand_name_snapshot}
                  onChange={(e) => updateItem(idx, { brand_name_snapshot: e.target.value })}
                  className="px-2 py-1.5 border border-border rounded-md text-sm"
                />
                <input
                  type="text"
                  placeholder={t('order.items_table.product')}
                  required
                  value={item.product_name_snapshot}
                  onChange={(e) => updateItem(idx, { product_name_snapshot: e.target.value })}
                  className="md:col-span-2 px-2 py-1.5 border border-border rounded-md text-sm"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder={t('order.items_table.qty')}
                  required
                  value={item.quantity}
                  onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                  className="px-2 py-1.5 border border-border rounded-md text-sm tabular"
                />
                <input
                  type="number"
                  placeholder={t('order.items_table.krw_cost')}
                  required
                  value={item.unit_cost_krw}
                  onChange={(e) => updateItem(idx, { unit_cost_krw: e.target.value })}
                  className="px-2 py-1.5 border border-border rounded-md text-sm tabular"
                />
                <input
                  type="number"
                  placeholder={t('order.items_table.vnd_sale_per_unit')}
                  required
                  value={item.unit_sale_price_vnd}
                  onChange={(e) => updateItem(idx, { unit_sale_price_vnd: e.target.value })}
                  className="px-2 py-1.5 border border-border rounded-md text-sm tabular"
                />
                <input
                  type="url"
                  placeholder={t('order.items_table.korean_url')}
                  value={item.product_url_snapshot}
                  onChange={(e) => updateItem(idx, { product_url_snapshot: e.target.value })}
                  className="md:col-span-4 px-2 py-1.5 border border-border rounded-md text-sm"
                />
                <input
                  type="text"
                  placeholder={t('order.items_table.variant_notes')}
                  value={item.notes}
                  onChange={(e) => updateItem(idx, { notes: e.target.value })}
                  className="md:col-span-2 px-2 py-1.5 border border-border rounded-md text-sm"
                />
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                    className="md:col-span-6 text-xs text-fg-subtle hover:text-danger justify-self-end"
                  >
                    {t('order.remove_item')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Shipping + notes */}
        <section className="bg-surface border border-border rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('order.korean_shipping')}</label>
            <input
              type="number"
              value={koreanShipping}
              onChange={(e) => setKoreanShipping(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm tabular"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('order.intl_shipping')}</label>
            <input
              type="number"
              value={intlShipping}
              onChange={(e) => setIntlShipping(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm tabular"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1.5">{t('order.notes')}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-border rounded-md text-sm"
            />
          </div>
        </section>

        {/* Live totals */}
        <section className="bg-surface-2 border border-border rounded-lg p-4 text-sm space-y-1.5">
          <Row label={t('order.totals.preview_total_krw')} value={`${totalKrw.toLocaleString('ko-KR')} ₩`} hint />
          <Row label={t('order.totals.preview_total_vnd')} value={formatVnd(totalVnd)} bold />
          <Row label={t('order.totals.cost')} value={formatVnd(costVnd)} hint />
          <Row label={t('order.totals.preview_profit')} value={formatVnd(profitVnd)} highlight />
        </section>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting || !fxRate}
            className="px-6 py-2 bg-accent text-accent-fg rounded-md font-semibold text-sm hover:bg-accent-hover disabled:opacity-50"
          >
            {submitting ? t('order.creating') : t('order.create_new')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/orders')}
            className="px-6 py-2 bg-surface-2 text-fg rounded-md font-semibold text-sm hover:bg-border"
          >
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </div>
  )
}

function Row({
  label,
  value,
  bold,
  hint,
  highlight,
}: {
  label: string
  value: string
  bold?: boolean
  hint?: boolean
  highlight?: boolean
}) {
  return (
    <div className="flex justify-between">
      <span className={hint ? 'text-fg-subtle' : 'text-fg-muted'}>{label}</span>
      <span
        className={`tabular ${bold ? 'font-semibold' : ''} ${
          highlight ? 'text-success font-semibold' : ''
        }`}
      >
        {value}
      </span>
    </div>
  )
}
