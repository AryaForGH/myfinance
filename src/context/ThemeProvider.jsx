import { useEffect, useMemo, useState } from 'react'
import { ThemeContext } from './ThemeContext.js'

const STORAGE_KEY = 'myfinance-theme'
const validThemes = ['light', 'dark', 'system']

function getSavedTheme() {
  try {
    const savedTheme = window.localStorage.getItem(STORAGE_KEY)
    return validThemes.includes(savedTheme) ? savedTheme : 'system'
  } catch {
    return 'system'
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getSavedTheme)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      const resolvedTheme =
        theme === 'system' ? (mediaQuery.matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = resolvedTheme
      document.documentElement.dataset.themePreference = theme
    }

    applyTheme()
    mediaQuery.addEventListener('change', applyTheme)

    return () => mediaQuery.removeEventListener('change', applyTheme)
  }, [theme])

  const value = useMemo(() => {
    function changeTheme(nextTheme) {
      if (!validThemes.includes(nextTheme)) return
      setTheme(nextTheme)
      try {
        window.localStorage.setItem(STORAGE_KEY, nextTheme)
      } catch {
        // The selected theme remains active for this session if storage is unavailable.
      }
    }

    return { theme, setTheme: changeTheme }
  }, [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
