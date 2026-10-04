import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthProvider.jsx'
import { ThemeProvider } from './context/ThemeProvider.jsx'
import { PreferencesProvider } from './context/PreferencesProvider.jsx'
import { I18nProvider } from './context/I18nProvider.jsx'
import { ToastProvider } from './context/ToastContext.jsx'
import { isSupabaseConfigured } from './lib/supabase.js'

const root = createRoot(document.getElementById('root'))

if (!isSupabaseConfigured) {
  root.render(
    <main className="auth-shell">
      <section className="auth-card glass-panel" role="alert">
        <p className="eyebrow">MYFINANCE</p>
        <h1>Supabase belum dikonfigurasi</h1>
        <p className="auth-intro">
          Atur URL Supabase dan publishable key pada Environment Variables Vercel, lalu deploy ulang.
          Gunakan VITE_SUPABASE_URL serta VITE_SUPABASE_PUBLISHABLE_KEY atau nama NEXT_PUBLIC_ yang setara.
        </p>
      </section>
    </main>,
  )
} else {
  root.render(
    <StrictMode>
      <ThemeProvider>
        <AuthProvider>
          <PreferencesProvider>
            <I18nProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </I18nProvider>
          </PreferencesProvider>
        </AuthProvider>
      </ThemeProvider>
    </StrictMode>,
  )
}
