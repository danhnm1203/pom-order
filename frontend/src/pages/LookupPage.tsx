import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { apiClient, ApiException } from '@/lib/api-client'
import { formatVnd } from '@/lib/utils'
import type { LookupResponse, PublicShopInfo } from '@/types/api'

/**
 * Public price-lookup page at `/tra-cuu`. NO auth required.
 *
 * Customer pastes a supported Korean URL (Olive Young, Shilla DFS), backend
 * scrapes it + applies the shop's markup formula + returns a Zalo deeplink.
 * No personal data captured.
 */
export function LookupPage() {
  const { t } = useTranslation()
  const [shopInfo, setShopInfo] = useState<PublicShopInfo | null>(null)
  const [url, setUrl] = useState('')
  const [result, setResult] = useState<LookupResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiClient
      .get<PublicShopInfo>('/api/v1/public/shop-info', { skipAuth: true })
      .then(setShopInfo)
      .catch(() => {
        // Non-fatal — the page still works without shop info
      })
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await apiClient.post<LookupResponse>(
        '/api/v1/public/lookup',
        { url: url.trim() },
        { skipAuth: true },
      )
      setResult(data)
    } catch (err) {
      setError(err instanceof ApiException ? err.message : t('lookup.error_unknown'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <header className="mb-8 flex items-start justify-between">
          <div>
            <p className="text-xs text-fg-subtle uppercase tracking-wide font-mono">
              {shopInfo?.name ?? 'POM ORDER'}
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">
              {t('lookup.title')}
            </h1>
            <p className="text-sm text-fg-muted mt-2">{t('lookup.subtitle')}</p>
          </div>
          <LanguageSwitcher compact className="text-xs flex-shrink-0" />
        </header>

        {/* Supported sites pills */}
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <span className="text-fg-subtle">{t('lookup.supported')}:</span>
          <span className="px-2 py-0.5 rounded-md bg-surface-2 text-fg-muted">Olive Young</span>
          <span className="px-2 py-0.5 rounded-md bg-surface-2 text-fg-muted">Shilla DFS</span>
        </div>

        {/* Input form */}
        <form
          onSubmit={submit}
          className="bg-surface border border-border rounded-lg p-4 space-y-3"
        >
          <div>
            <label htmlFor="lookup-url" className="block text-sm font-medium mb-1.5">
              {t('lookup.url_label')}
            </label>
            <input
              id="lookup-url"
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('lookup.url_placeholder')}
              disabled={loading}
              className="w-full px-3 py-2 border border-border rounded-md text-sm font-mono focus:outline-none focus:border-accent disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="w-full px-4 py-2.5 bg-accent text-accent-fg rounded-md font-semibold text-sm hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {loading ? t('lookup.loading') : t('lookup.action')}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div className="mt-4 bg-danger-bg border border-danger/20 text-danger rounded-md p-3 text-sm">
            {error}
          </div>
        )}

        {/* Result card */}
        {result && (
          <article className="mt-6 bg-surface border border-border rounded-lg overflow-hidden">
            {result.image_url && (
              <div className="aspect-square w-full bg-surface-2 overflow-hidden">
                {/* Korean shop image — alt is product name for screen readers */}
                <img
                  src={result.image_url}
                  alt={result.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            )}
            <div className="p-4 md:p-5 space-y-3">
              {result.brand && (
                <p className="text-xs uppercase tracking-wide text-fg-subtle font-semibold">
                  {result.brand}
                </p>
              )}
              <h2 className="text-base font-medium">{result.name}</h2>
              {result.price_krw && (
                <p className="text-sm text-fg-muted">
                  {t('lookup.korea_price')}:{' '}
                  <span className="tabular font-semibold">
                    {Number(result.price_krw).toLocaleString('ko-KR')} ₩
                  </span>
                </p>
              )}

              {result.breakdown ? (
                <div className="border-t border-border pt-3 space-y-1.5 text-sm">
                  <BreakdownRow
                    label={t('lookup.breakdown.product')}
                    value={result.breakdown.product_vnd}
                  />
                  <BreakdownRow
                    label={t('lookup.breakdown.markup')}
                    value={result.breakdown.markup_vnd}
                  />
                  <BreakdownRow
                    label={t('lookup.breakdown.buying_fee')}
                    value={result.breakdown.buying_fee_vnd}
                  />
                  <BreakdownRow
                    label={t('lookup.breakdown.weight_fee')}
                    value={result.breakdown.weight_fee_vnd}
                  />
                  <div className="border-t border-border pt-2 mt-1 flex items-baseline justify-between">
                    <span className="text-sm font-medium">{t('lookup.estimated_total')}</span>
                    <span className="text-xl font-bold tabular text-accent">
                      {formatVnd(result.breakdown.total_vnd)}
                    </span>
                  </div>
                  <p className="text-xs text-fg-subtle pt-1">
                    {t('lookup.disclaimer')}
                  </p>
                </div>
              ) : (
                <div className="border-t border-border pt-3 text-sm text-fg-muted">
                  {t('lookup.no_price_available')}
                </div>
              )}

              {/* CTA */}
              {result.zalo_url ? (
                <a
                  href={result.zalo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center px-4 py-2.5 bg-success text-white rounded-md font-semibold text-sm hover:opacity-90 transition-opacity"
                  style={{ background: 'var(--color-success)' }}
                >
                  {t('lookup.cta_zalo')}
                </a>
              ) : (
                <p className="text-xs text-fg-subtle text-center pt-1">
                  {t('lookup.no_zalo_configured')}
                </p>
              )}

              {/* View on supplier */}
              <a
                href={result.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-xs text-fg-subtle hover:text-fg underline"
              >
                {t('lookup.view_source')}
              </a>
            </div>
          </article>
        )}

        {/* Footer */}
        <footer className="mt-12 text-center text-xs text-fg-subtle">
          <p>{t('lookup.footer')}</p>
        </footer>
      </div>
    </div>
  )
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-fg-muted">
      <span>{label}</span>
      <span className="tabular">{formatVnd(value)}</span>
    </div>
  )
}
