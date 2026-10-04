import { useEffect, useMemo } from 'react'
import { usePreferences } from './PreferencesContext.js'
import { I18nContext } from './I18nContext.js'
import { LANGUAGES } from '../lib/preferences.js'
import id from '../locales/id/translation.json'
import en from '../locales/en/translation.json'
import ms from '../locales/ms/translation.json'
import ja from '../locales/ja/translation.json'
import zh from '../locales/zh/translation.json'

const translations = { id, en, ms, ja, zh }

export function I18nProvider({ children }) {
  const { preferences } = usePreferences()
  const language = LANGUAGES.some((item) => item.code === preferences.language)
    ? preferences.language
    : 'id'
  const locale = LANGUAGES.find((item) => item.code === language).locale

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const value = useMemo(() => ({
    language,
    locale,
    t(key, variables = {}) {
      const template = translations[language][key] || translations.en[key] || key
      return template.replace(/\{(\w+)\}/g, (match, name) => variables[name] ?? match)
    },
  }), [language, locale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
