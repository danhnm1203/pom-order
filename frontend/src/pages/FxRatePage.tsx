import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { apiClient, ApiException } from '@/lib/api-client'
import type { FxRate } from '@/types/api'

export function FxRatePage() {
  const { t, i18n } = useTranslation()
  const [current, setCurrent] = useState<FxRate | null>(null)
  const [history, setHistory] = useState<FxRate[]>([])
  const [loading, setLoading] = useState(true)
  const [newRate, setNewRate] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [cur, hist] = await Promise.allSettled([
        apiClient.get<FxRate>('/api/v1/fx-rates/current'),
        apiClient.get<FxRate[]>('/api/v1/fx-rates'),
      ])
      setCurrent(cur.status === 'fulfilled' ? cur.value : null)
      setHistory(hist.status === 'fulfilled' ? hist.value : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function setNewRateSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await apiClient.post('/api/v1/fx-rates', {
        base_currency: 'KRW',
        quote_currency: 'VND',
        rate: newRate,
        source: 'manual',
        notes: notes || null,
      })
      setNewRate('')
      setNotes('')
      await load()
    } catch (err) {
      setError(err instanceof ApiException ? err.message : t('fx.set_error'))
    } finally {
      setSubmitting(false)
    }
  }

  const dateLocale = i18n.resolvedLanguage === 'ko' ? 'ko-KR' : 'vi-VN'

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-semibold mb-6">{t('fx.title')}</h1>

      {/* Current rate */}
      <div className="bg-surface border border-border rounded-lg p-4 mb-6">
        <p className="text-xs text-fg-muted font-medium uppercase tracking-wide">
          {t('fx.current_label')}
        </p>
        {loading ? (
          <p className="text-fg-subtle text-sm mt-2">{t('common.loading')}</p>
        ) : current ? (
          <>
            <p className="text-3xl font-semibold mt-1 tabular">
              {t('fx.current_rate', { rate: Number(current.rate).toLocaleString(dateLocale) })}
            </p>
            <p className="text-xs text-fg-subtle mt-1">
              {t('fx.effective_from', {
                when: new Date(current.effective_from).toLocaleString(dateLocale),
              })}
              {current.source && ` · ${current.source}`}
              {current.notes && ` · ${current.notes}`}
            </p>
          </>
        ) : (
          <p className="text-fg-muted text-sm mt-2">{t('fx.no_rate_set')}</p>
        )}
      </div>

      {/* Set new rate */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted mb-2">
          {t('fx.set_new')}
        </h2>
        <form
          onSubmit={setNewRateSubmit}
          className="bg-surface border border-border rounded-lg p-4 flex flex-wrap gap-2 items-end"
        >
          <div className="flex-1 min-w-32">
            <label className="block text-xs text-fg-muted mb-1">{t('fx.new_rate_label')}</label>
            <input
              type="number"
              step="0.0001"
              required
              value={newRate}
              onChange={(e) => setNewRate(e.target.value)}
              placeholder="18.0"
              className="w-full px-3 py-1.5 border border-border rounded-md text-sm tabular"
            />
          </div>
          <div className="flex-1 min-w-32">
            <label className="block text-xs text-fg-muted mb-1">{t('customer.notes')}</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('common.optional')}
              className="w-full px-3 py-1.5 border border-border rounded-md text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !newRate}
            className="px-4 py-1.5 bg-accent text-accent-fg rounded-md font-semibold text-sm hover:bg-accent-hover disabled:opacity-50"
          >
            {submitting ? t('fx.saving') : t('fx.set')}
          </button>
        </form>
        {error && <p className="text-sm text-danger mt-2">{error}</p>}
      </section>

      {/* History */}
      {history.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted mb-2">
            {t('fx.history')}
          </h2>
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs font-semibold uppercase text-fg-muted">
                <tr>
                  <th className="text-right py-2 px-4">{t('fx.rate_column')}</th>
                  <th className="text-left py-2 px-4">{t('fx.from_column')}</th>
                  <th className="text-left py-2 px-4">{t('fx.to_column')}</th>
                  <th className="text-left py-2 px-4">{t('fx.source_column')}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-2 px-4 text-right tabular font-semibold">
                      {Number(r.rate).toLocaleString(dateLocale)}
                    </td>
                    <td className="py-2 px-4 text-xs text-fg-muted">
                      {new Date(r.effective_from).toLocaleString(dateLocale)}
                    </td>
                    <td className="py-2 px-4 text-xs text-fg-muted">
                      {r.effective_to
                        ? new Date(r.effective_to).toLocaleString(dateLocale)
                        : t('fx.to_now')}
                    </td>
                    <td className="py-2 px-4 text-xs text-fg-muted">{r.source ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
