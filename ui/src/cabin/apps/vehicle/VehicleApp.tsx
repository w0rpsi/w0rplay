import { formatGear, speedKmh } from '../../../shared/format'
import { useLive } from '../../state/store'
import { useText } from '../../state/text'
import './vehicle.css'

export function VehicleApp() {
  const text = useText()
  const truck = useLive((state) => state.truck)

  const speed = useLive((state) => (state.telemetry ? speedKmh(state.telemetry.speed) : 0))
  const gear = useLive((state) => (state.telemetry ? formatGear(state.telemetry.displayedGear) : 'N'))
  const isReverse = useLive((state) => (state.telemetry?.gear ?? 0) < 0)
  const isNeutral = useLive((state) => (state.telemetry?.gear ?? 0) === 0)

  const rpm = useLive((state) => (state.telemetry ? Math.round(state.telemetry.engineRpm) : 0))
  const rpmPercent = Math.min(100, Math.max(0, (rpm / 2500) * 100))
  const rpmColor = rpm > 2000 ? '#ff453a' : rpm > 1500 ? '#ff9f0a' : '#30d158'

  const fuel = useLive((state) => (state.telemetry ? Math.round(state.telemetry.fuel) : 0))
  const fuelRange = useLive((state) => (state.telemetry ? Math.round(state.telemetry.fuelRange) : 0))
  const fuelPercent = Math.min(100, Math.max(8, (fuelRange / 2400) * 100))
  const fuelColor = fuelPercent < 15 ? '#ff453a' : fuelPercent < 30 ? '#ff9f0a' : '#30d158'

  const speedLimit = useLive((state) =>
    state.telemetry && state.telemetry.navigationSpeedLimit > 0
      ? Math.round(state.telemetry.navigationSpeedLimit * 3.6)
      : null,
  )

  const cruiseSpeed = useLive((state) =>
    state.telemetry && state.telemetry.cruiseControlSpeed > 0
      ? Math.round(state.telemetry.cruiseControlSpeed * 3.6)
      : 0,
  )

  const engineEnabled = useLive((state) => state.telemetry?.engineEnabled ?? false)
  const parkingBrake = useLive((state) => state.telemetry?.parkingBrake ?? false)
  const leftBlinker = useLive((state) => state.telemetry?.leftBlinker ?? false)
  const rightBlinker = useLive((state) => state.telemetry?.rightBlinker ?? false)
  const lowBeam = useLive((state) => state.telemetry?.lowBeam ?? false)
  const highBeam = useLive((state) => state.telemetry?.highBeam ?? false)

  const brand = truck?.brand || 'TRUCK'
  const model = truck?.name || 'W0RPLAY CABIN'

  return (
    <section className="app-panel vehicle-app" aria-label={text.vehicleApp.title}>
      {/* Header Bar */}
      <header className="veh-header">
        <div className="veh-truck-info">
          <div className="veh-truck-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="1" y="3" width="15" height="13" rx="2" />
              <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
              <circle cx="5.5" cy="18.5" r="2.5" />
              <circle cx="18.5" cy="18.5" r="2.5" />
            </svg>
          </div>
          <div className="veh-truck-titles">
            <span className="veh-truck-brand">{brand}</span>
            <span className="veh-truck-model">{model}</span>
          </div>
        </div>

        <div className="veh-status-pills">
          {leftBlinker && (
            <span className="veh-pill blinker">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="11 5 3 12 11 19 11 14 21 14 21 10 11 10 11 5" />
              </svg>
            </span>
          )}

          {rightBlinker && (
            <span className="veh-pill blinker">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="13 5 21 12 13 19 13 14 3 14 3 10 13 10 13 5" />
              </svg>
            </span>
          )}

          {parkingBrake && (
            <span className="veh-pill active-brake">
              (P) {text.vehicleApp.parkBrake}
            </span>
          )}

          <span className={`veh-pill ${engineEnabled ? 'active-engine' : 'inactive-engine'}`}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: engineEnabled ? '#30d158' : '#ff453a',
              }}
            />
            {engineEnabled ? text.vehicleApp.running : text.vehicleApp.off}
          </span>
        </div>
      </header>

      {/* Main Grid */}
      <div className="veh-grid">
        {/* Left Column: Speed, Gear, Tachometer */}
        <div className="veh-col">
          <div className="veh-card">
            <div className="veh-card-title">
              <span>{text.vehicleApp.speed} & {text.vehicleApp.gear}</span>
              {speedLimit !== null && (
                <div className="veh-speed-limit" title={text.vehicleApp.speedLimit}>
                  {speedLimit}
                </div>
              )}
            </div>

            <div className="veh-speed-hero">
              <span className="veh-speed-num">{speed}</span>
              <span className="veh-speed-unit">KM/H</span>
            </div>

            <div className="veh-speed-meta">
              <span className="veh-assist-label">{text.vehicleApp.gear}</span>
              <div
                className={`veh-gear-badge ${isReverse ? 'reverse' : isNeutral ? 'neutral' : ''}`}
              >
                {gear}
              </div>
            </div>

            {/* Tachometer RPM Bar */}
            <div className="veh-rpm-container">
              <div className="veh-rpm-header">
                <span>{text.vehicleApp.rpm}</span>
                <span>{rpm} RPM</span>
              </div>
              <div className="veh-rpm-track">
                <div
                  className="veh-rpm-fill"
                  style={{
                    width: `${rpmPercent}%`,
                    backgroundColor: rpmColor,
                  }}
                />
              </div>
              <div className="veh-rpm-ticks">
                <span>0</span>
                <span>1000</span>
                <span>1500</span>
                <span>2000</span>
                <span>2500</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Fuel & Driving Assists */}
        <div className="veh-col">
          {/* Fuel & Range */}
          <div className="veh-card">
            <div className="veh-card-title">
              <span>{text.vehicleApp.fuel}</span>
              <span>{text.vehicleApp.range}</span>
            </div>

            <div className="veh-fuel-main">
              <span className="veh-fuel-litres">{fuel}</span>
              <span className="veh-fuel-unit">L</span>
            </div>

            <div className="veh-meter-track">
              <div
                className="veh-meter-fill"
                style={{
                  width: `${fuelPercent}%`,
                  backgroundColor: fuelColor,
                }}
              />
            </div>

            <div className="veh-fuel-range">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 22h12M4 9h10M4 22V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v18" />
                <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5" />
              </svg>
              <span>{fuelRange} km</span>
            </div>
          </div>

          {/* Assists & Lights */}
          <div className="veh-card">
            <div className="veh-card-title">
              <span>{text.vehicleApp.cruise} & {text.vehicleApp.lights}</span>
            </div>

            <div className="veh-assists-grid">
              {/* Cruise Control */}
              <div className="veh-assist-item">
                <span className="veh-assist-label">{text.vehicleApp.cruise}</span>
                <span className={`veh-assist-val ${cruiseSpeed > 0 ? 'active-cruise' : ''}`}>
                  {cruiseSpeed > 0 ? `${cruiseSpeed} km/h` : text.vehicleApp.off}
                </span>
              </div>

              {/* Lights */}
              <div className="veh-assist-item">
                <span className="veh-assist-label">{text.vehicleApp.lights}</span>
                <div className="veh-lights-row">
                  <div
                    className={`veh-light-icon ${lowBeam ? 'active-low' : ''}`}
                    title={text.vehicleApp.lowBeam}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="5" />
                      <line x1="3" y1="12" x2="6" y2="12" />
                      <line x1="4.2" y1="17.8" x2="6.5" y2="15.5" />
                      <line x1="4.2" y1="6.2" x2="6.5" y2="8.5" />
                    </svg>
                  </div>
                  <div
                    className={`veh-light-icon ${highBeam ? 'active-high' : ''}`}
                    title={text.vehicleApp.highBeam}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="5" fill="currentColor" />
                      <line x1="2" y1="9" x2="7" y2="9" />
                      <line x1="2" y1="12" x2="7" y2="12" />
                      <line x1="2" y1="15" x2="7" y2="15" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
