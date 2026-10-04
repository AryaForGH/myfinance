import { useI18n } from '../context/I18nContext.js'

function DashboardSkeleton() {
  const { t } = useI18n()
  return (
    <div aria-label={t('common.loading')} className="dashboard-skeleton" role="status">
      <div className="skeleton-summary-grid">
        {Array.from({ length: 4 }, (_, index) => <div className="skeleton-block skeleton-summary" key={index} />)}
      </div>
      <div className="skeleton-analytics-grid">
        <div className="skeleton-block skeleton-chart" />
        <div className="skeleton-block skeleton-chart skeleton-donut" />
      </div>
      <div className="skeleton-block skeleton-transactions" />
    </div>
  )
}

export default DashboardSkeleton
