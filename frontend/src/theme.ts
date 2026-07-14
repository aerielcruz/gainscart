// Shared between App.tsx and Survey.tsx, which are genuinely separate page
// loads (the survey opens in its own tab, not a client-side route) -- both
// need to independently read/apply the same stored preference on mount.
export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'gainscart-theme'

export function getInitialTheme(): Theme {
  return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
}

export function applyTheme(theme: Theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
  window.localStorage.setItem(STORAGE_KEY, theme)
}
