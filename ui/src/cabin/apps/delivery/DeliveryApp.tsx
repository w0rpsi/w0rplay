import { formatGameClock } from '../../../shared/format'
import { useLive } from '../../state/store'
import { useText } from '../../state/text'
import './delivery.css'

export function DeliveryApp() {
  const text = useText()
  const job = useLive((state) => state.job)

  const hasJob = Boolean(job && job.active)

  const massFormatted = job
    ? job.cargoMass >= 1000
      ? `${(job.cargoMass / 1000).toFixed(1)} t`
      : `${job.cargoMass} kg`
    : '0 t'

  const payoutFormatted = job ? `€ ${job.income.toLocaleString()}` : '€ 0'
  const deadlineFormatted = job ? formatGameClock(job.deliveryTime) : ''

  return (
    <section className="app-panel delivery-app" aria-label={text.deliveryApp.title}>
      {/* Header */}
      <header className="del-header">
        <div className="del-title-group">
          <div className="del-app-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </div>
          <span className="del-app-name">{text.deliveryApp.title}</span>
        </div>

        <div className="del-badges">
          {hasJob && job?.special && (
            <span className="del-badge special">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              {text.deliveryApp.specialTransport}
            </span>
          )}

          {hasJob && job?.cargoLoaded && (
            <span className="del-badge in-transit">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#30d158' }} />
              {text.deliveryApp.inTransit}
            </span>
          )}

          {hasJob && !job?.cargoLoaded && (
            <span className="del-badge to-pickup">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff9f0a' }} />
              {text.deliveryApp.toPickup}
            </span>
          )}

          {!hasJob && (
            <span className="del-badge idle">
              {text.deliveryApp.noJob}
            </span>
          )}
        </div>
      </header>

      {/* Main Content */}
      {hasJob && job ? (
        <div className="del-grid">
          {/* Left Card: Cargo & Route */}
          <div className="del-card">
            <span className="del-card-title">{text.deliveryApp.cargo}</span>

            {/* Cargo Hero */}
            <div className="del-cargo-hero">
              <div className="del-cargo-main">
                <span className="del-cargo-name">{job.cargo || 'General Cargo'}</span>
                <span className="del-cargo-meta">
                  {job.special ? text.deliveryApp.specialTransport : text.deliveryApp.activeJob}
                </span>
              </div>
              <div className="del-cargo-mass-badge">
                <span className="del-mass-val">{massFormatted}</span>
                <span className="del-mass-lbl">{text.deliveryApp.weight}</span>
              </div>
            </div>

            {/* Route Timeline */}
            <span className="del-card-title" style={{ marginTop: 8 }}>
              {text.deliveryApp.origin} &rarr; {text.deliveryApp.destination}
            </span>

            <div className="del-route-timeline">
              <div className="del-route-stop">
                <div className="del-stop-indicator origin" />
                <div className="del-stop-details">
                  <span className="del-stop-city">{job.sourceCity}</span>
                  <span className="del-stop-company">{job.sourceCompany}</span>
                </div>
              </div>

              <div className="del-route-connector">
                <span className="del-distance-pill">
                  {job.plannedDistanceKm} km
                </span>
              </div>

              <div className="del-route-stop">
                <div className="del-stop-indicator dest" />
                <div className="del-stop-details">
                  <span className="del-stop-city">{job.destinationCity}</span>
                  <span className="del-stop-company">{job.destinationCompany}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Earnings & Schedule */}
          <div className="del-col-right">
            {/* Payout Card */}
            <div className="del-card">
              <span className="del-card-title">{text.deliveryApp.payout}</span>
              <div className="del-payout-amount">{payoutFormatted}</div>

              <div className="del-info-box">
                <div className="del-info-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div className="del-info-text">
                  <span className="del-info-label">{text.deliveryApp.deadline}</span>
                  <span className="del-info-val">{deadlineFormatted}</span>
                </div>
              </div>
            </div>

            {/* Total Distance Card */}
            <div className="del-card">
              <span className="del-card-title">{text.deliveryApp.distance}</span>
              <div style={{ fontSize: 28, fontWeight: 800 }}>
                {job.plannedDistanceKm} <span style={{ fontSize: 16, color: 'var(--text-dim)' }}>KM</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Empty State */
        <div className="del-empty-card">
          <div className="del-empty-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="1" y="3" width="15" height="13" rx="2" />
              <polygon points="16 8 20 8 23 11 23 16 16 16 8" />
              <circle cx="5.5" cy="18.5" r="2.5" />
              <circle cx="18.5" cy="18.5" r="2.5" />
            </svg>
          </div>
          <span className="del-empty-title">{text.deliveryApp.noJob}</span>
          <span className="del-empty-desc">{text.deliveryApp.noJobDetail}</span>
        </div>
      )}
    </section>
  )
}
