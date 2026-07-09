import { createContext, useContext, useEffect } from 'react'

const ThemeContext = createContext(null)

// DR Telecommunication ships a single, deliberate white canvas — no dark mode.
// This provider is kept as a no-op shell so existing imports don't break,
// and so a theme could be reintroduced later without touching call sites.
export function ThemeProvider({ children }) {
  useEffect(() => {
    document.documentElement.classList.remove('dark')
    localStorage.removeItem('theme')
  }, [])

  return (
    <ThemeContext.Provider value={{ theme: 'light' }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
