import { useI18n } from '../context/I18nContext.js'

function LoadingScreen({ exiting = false, onAnimationEnd }) {
  const { t } = useI18n()
  return (
    <main
      className={`initial-loading-screen${exiting ? ' is-exiting' : ''}`}
      onAnimationEnd={onAnimationEnd}
      role="status"
      aria-live="polite"
    >
      <div className="initial-loading-brand">
        <span className="brand-mark"><span /><span /><span /><span /></span>
        <strong>myfinance<span>.</span></strong>
      </div>
      <span className="loading-spinner" aria-hidden="true" />
      <p>{t('loading.preparing')}</p>
    </main>
  )
}

export default LoadingScreen
