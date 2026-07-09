import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { translations } from '../lib/translations'

const LanguageContext = createContext(null)

// Add a language here once its dictionary exists in src/lib/translations.js
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिंदी' },
]

const DEFAULT_LANGUAGE = 'en'

function resolve(dict, key) {
  return key.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), dict)
}

function interpolate(str, vars) {
  if (!vars) return str
  return Object.keys(vars).reduce((acc, k) => acc.replaceAll(`{{${k}}}`, vars[k]), str)
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_LANGUAGE
    const stored = localStorage.getItem('language')
    if (stored && translations[stored]) return stored
    const browserLang = window.navigator?.language?.slice(0, 2)
    return translations[browserLang] ? browserLang : DEFAULT_LANGUAGE
  })

  useEffect(() => {
    document.documentElement.setAttribute('lang', language)
    localStorage.setItem('language', language)
  }, [language])

  // t('sidebar.signOut') -> looks up translations[language].sidebar.signOut
  // t('dashboard.addedToInventory', { name: item.name }) -> fills in {{name}}
  // Falls back to English, then to the key itself, so a missing translation
  // never crashes the UI or renders blank.
  function t(key, vars) {
    const value =
      resolve(translations[language], key) ?? resolve(translations[DEFAULT_LANGUAGE], key) ?? key
    return typeof value === 'string' ? interpolate(value, vars) : value
  }

  function toggleLanguage() {
    setLanguage((l) => (l === 'en' ? 'hi' : 'en'))
  }

  const value = useMemo(() => ({ language, setLanguage, toggleLanguage, t }), [language])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  return useContext(LanguageContext)
}
