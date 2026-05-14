import { useTranslation } from 'react-i18next'

import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/lib/i18n'

interface LanguageSwitcherProps {
  className?: string
  compact?: boolean
}

export function LanguageSwitcher({ className, compact = false }: LanguageSwitcherProps) {
  const { i18n } = useTranslation()
  const current = (i18n.resolvedLanguage ?? 'vi') as SupportedLanguage

  function handleChange(lang: SupportedLanguage) {
    void i18n.changeLanguage(lang)
  }

  if (compact) {
    return (
      <div className={className}>
        {SUPPORTED_LANGUAGES.map((lang, i) => (
          <span key={lang}>
            <button
              type="button"
              onClick={() => handleChange(lang)}
              className={
                lang === current
                  ? 'text-fg font-semibold'
                  : 'text-fg-subtle hover:text-fg transition-colors'
              }
            >
              {lang === 'vi' ? 'VI' : 'KO'}
            </button>
            {i < SUPPORTED_LANGUAGES.length - 1 && (
              <span className="text-fg-subtle mx-1">·</span>
            )}
          </span>
        ))}
      </div>
    )
  }

  return (
    <select
      value={current}
      onChange={(e) => handleChange(e.target.value as SupportedLanguage)}
      className={`px-2 py-1 text-sm bg-surface border border-border rounded-md ${className ?? ''}`}
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <option key={lang} value={lang}>
          {LANGUAGE_LABELS[lang]}
        </option>
      ))}
    </select>
  )
}
