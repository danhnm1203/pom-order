import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { useNotify } from '@/components/Toast'
import { apiClient, ApiException } from '@/lib/api-client'
import type { LookupConfig } from '@/types/api'

/**
 * Admin-only settings page. Currently exposes the public-lookup pricing
 * formula + Zalo CTA fields. New config sections (notifications, branding,
 * etc.) get their own card here over time.
 */
export function SettingsPage() {
  const { t } = useTranslation()
  const notify = useNotify()
  const [config, setConfig] = useState<LookupConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiClient
      .get<LookupConfig>('/api/v1/shop-settings/lookup')
      .then((c) => {
        setConfig(c)
        setError(null)
      })
      .catch((err) =>
        setError(err instanceof ApiException ? err.message : t('settings.load_error')),
      )
      .finally(() => setLoading(false))
  }, [t])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!config) return
    setSaving(true)
    try {
      const updated = await apiClient.put<LookupConfig>(
        '/api/v1/shop-settings/lookup',
        config,
      )
      setConfig(updated)
      notify.success(t('settings.save_success'))
    } catch (err) {
      // Surface the real error (network/CORS/etc.) instead of a generic fallback.
      const msg =
        err instanceof ApiException
          ? err.message
          : err instanceof Error
            ? `${t('settings.save_error')}: ${err.message}`
            : t('settings.save_error')
      console.error('[settings] save failed:', err)
      notify.error(msg)
    } finally {
      setSaving(false)
    }
  }

  function update<K extends keyof LookupConfig>(key: K, value: LookupConfig[K]) {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight mb-6">{t('settings.title')}</h1>
        <div className="h-48 bg-surface border border-border rounded-lg animate-pulse" />
      </div>
    )
  }

  if (error || !config) {
    return (
      <div className="p-4 md:p-6 max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight mb-6">{t('settings.title')}</h1>
        <div className="bg-danger-bg border border-danger/20 text-danger rounded-md p-3 text-sm">
          {error ?? t('settings.load_error')}
        </div>
      </div>
    )
  }

  const markupPct = Number(config.markup_pct) || 0

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-2">{t('settings.title')}</h1>
      <p className="text-sm text-fg-muted mb-6">{t('settings.subtitle')}</p>

      <form onSubmit={save} className="space-y-6">
        {/* Pricing formula card */}
        <section className="bg-surface border border-border rounded-lg p-4 md:p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
              {t('settings.pricing_title')}
            </h2>
            <p className="text-xs text-fg-subtle mt-1">{t('settings.pricing_help')}</p>
          </div>

          <Field
            id="markup_pct"
            label={t('settings.markup_label')}
            help={t('settings.markup_help', { pct: Math.round(markupPct * 100) })}
          >
            <input
              id="markup_pct"
              type="number"
              step="0.01"
              min="0"
              max="2"
              value={config.markup_pct}
              onChange={(e) => update('markup_pct', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm tabular focus:outline-none focus:border-accent"
            />
          </Field>

          <Field id="buying_fee_vnd" label={t('settings.buying_fee_label')} help={t('settings.buying_fee_help')}>
            <input
              id="buying_fee_vnd"
              type="number"
              min="0"
              step="1000"
              value={config.buying_fee_vnd}
              onChange={(e) => update('buying_fee_vnd', Number(e.target.value))}
              className="w-full px-3 py-2 border border-border rounded-md text-sm tabular focus:outline-none focus:border-accent"
            />
          </Field>

          <Field id="weight_fee_vnd" label={t('settings.weight_fee_label')} help={t('settings.weight_fee_help')}>
            <input
              id="weight_fee_vnd"
              type="number"
              min="0"
              step="1000"
              value={config.weight_fee_vnd}
              onChange={(e) => update('weight_fee_vnd', Number(e.target.value))}
              className="w-full px-3 py-2 border border-border rounded-md text-sm tabular focus:outline-none focus:border-accent"
            />
          </Field>
        </section>

        {/* Zalo CTA card */}
        <section className="bg-surface border border-border rounded-lg p-4 md:p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
              {t('settings.zalo_title')}
            </h2>
            <p className="text-xs text-fg-subtle mt-1">{t('settings.zalo_help')}</p>
          </div>

          <Field id="zalo_phone" label={t('settings.zalo_phone_label')} help={t('settings.zalo_phone_help')}>
            <input
              id="zalo_phone"
              type="tel"
              placeholder="0987654321"
              value={config.zalo_phone}
              onChange={(e) => update('zalo_phone', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm tabular focus:outline-none focus:border-accent"
            />
          </Field>

          <Field
            id="zalo_template"
            label={t('settings.zalo_template_label')}
            help={t('settings.zalo_template_help')}
          >
            <textarea
              id="zalo_template"
              rows={3}
              value={config.zalo_message_template}
              onChange={(e) => update('zalo_message_template', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent"
            />
          </Field>
        </section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-accent text-accent-fg rounded-md font-semibold text-sm hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {saving ? t('common.loading') : t('common.save')}
          </button>
          <a
            href="/tra-cuu"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-accent hover:underline"
          >
            {t('settings.open_lookup')} →
          </a>
        </div>
      </form>
    </div>
  )
}

function Field({
  id,
  label,
  help,
  children,
}: {
  id: string
  label: string
  help?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1.5">
        {label}
      </label>
      {children}
      {help && <p className="text-xs text-fg-subtle mt-1">{help}</p>}
    </div>
  )
}
