import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthProvider.jsx'
import { ThemeProvider } from './context/ThemeProvider.jsx'
import { PreferencesProvider } from './context/PreferencesProvider.jsx'
import { I18nProvider } from './context/I18nProvider.jsx'
import { ToastProvider } from './context/ToastContext.jsx'

createRoot(document.getElementById('root')).render(
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
