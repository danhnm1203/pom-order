/**
 * i18next config for Pom Order.
 *
 * Default language: Vietnamese (vi).
 * Supported: Vietnamese (vi), Korean (ko).
 *
 * Language detection order:
 *   1. localStorage['pom-order-lang']
 *   2. navigator.language (e.g., browser is Korean → ko)
 *   3. Fallback: vi
 *
 * Switching language is via `useTranslation().i18n.changeLanguage('ko' | 'vi')`.
 * That call persists to localStorage automatically (via LanguageDetector caches).
 */

import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import ko from '@/locales/ko.json'
import vi from '@/locales/vi.json'

export const SUPPORTED_LANGUAGES = ['vi', 'ko'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  vi: 'Tiếng Việt',
  ko: '한국어',
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      vi: { translation: vi },
      ko: { translation: ko },
    },
    fallbackLng: 'vi',
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: {
      escapeValue: false, // React auto-escapes
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'pom-order-lang',
    },
  })

export default i18n
