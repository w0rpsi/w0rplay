import { useState } from 'react'
import { useLive } from '../../state/store'
import { useLanguage } from '../../state/text'
import { jobKey, useDispatch, type Goal, type DriverStatus } from './dispatch'
import './truck.css'

const labels = {
  tr: {
    title: 'Sevkiyat Merkezi',
    tabs: ['Sefer', 'Merkez', 'Geçmiş'],
    company: 'W0RPLAY Lojistik · Sanal şirket',
    empty: 'Henüz bir sevkiyat yok',
    help: 'ETS2 İş Piyasası’ndan bir iş al. Yük ve teslimat bilgileri burada otomatik görünür.',
    target: 'Sefer hedefi',
    goals: ['Hassas taşıma', 'Ekspres hat', 'Profesyonel teslimat'],
    descriptions: [
      'Yük hasarı %0: 100 puan. Her %1 hasar için 10 puan düşer.',
      'Oyun teslim süresinde bitir: 100 puan. Gecikme: 0 puan.',
      'Yük: 50 puan · zamanında teslim: 30 · elle park: 20',
    ],
    pickup: 'Yükü almaya gidiyorsun',
    transit: 'Yük alındı · Teslimata gidiyorsun',
    deadline: 'Teslim için kalan',
    hours: 'sa',
    late: 'Teslim süresi geçti',
    unknown: 'Bilinmiyor',
    km: 'Planlanan mesafe',
    income: 'Oyunun teklif ettiği ücret',
    mass: 'Yük ağırlığı',
    local: 'Hedefler ve merkez mesajları bu cihazdaki sanal şirkete aittir. Oyun ekonomisini değiştirmez.',
    statuses: ['Yola çıktım', 'Mola veriyorum', 'Gecikme var'],
    replies: [
      'Anlaşıldı. Güvenli yolculuklar.',
      'Mola kaydedildi. Hazır olduğunda yola devam et.',
      'Gecikme kaydedildi. Oyundaki teslim süresi değişmez.',
    ],
    you: 'Sen',
    auto: 'Merkez · Otomatik yanıt',
    welcome: 'Merkez hazır. Sefer durumunu bildir; mesajların bu cihazda saklanır.',
    noHistory: 'İlk teslimatın burada görünecek',
    historyHelp: 'Oyunun onayladığı teslimatlar, iptaller ve cezalar kaydedilir. Son 50 kayıt tutulur.',
    delivered: 'Teslim edildi',
    cancelled: 'İş iptal edildi',
    fine: 'Trafik cezası',
    points: 'puan',
    noScore: 'Puan için yeterli veri yok',
    damage: 'Yük hasarı',
    result: 'Oyun tutarı',
    xp: 'Oyun XP',
    partial: 'SDK verisi bulunamadığında sonuç tahmin edilmez.',
  },
  en: {
    title: 'Dispatch',
    tabs: ['Trip', 'Dispatch', 'History'],
    company: 'W0RPLAY Logistics · Virtual company',
    empty: 'No active delivery',
    help: 'Accept a job in the ETS2 Job Market. Its cargo and delivery details appear here automatically.',
    target: 'Trip target',
    goals: ['Careful transport', 'Express route', 'Professional delivery'],
    descriptions: [
      'No cargo damage: 100 points. Lose 10 points per 1% damage.',
      'Deliver by the game deadline: 100 points. Late: 0 points.',
      'Cargo: 50 points · on time: 30 · manual parking: 20',
    ],
    pickup: 'Heading to pickup',
    transit: 'Cargo loaded · Heading to delivery',
    deadline: 'Delivery time remaining',
    hours: 'h',
    late: 'Delivery deadline passed',
    unknown: 'Unknown',
    km: 'Planned distance',
    income: 'Game job offer',
    mass: 'Cargo weight',
    local:
      'Targets and dispatch messages belong to a virtual company on this device. They do not change the game economy.',
    statuses: ['Departed', 'Taking a break', 'Running late'],
    replies: [
      'Understood. Have a safe trip.',
      'Break recorded. Continue when you are ready.',
      'Delay recorded. The game deadline stays the same.',
    ],
    you: 'You',
    auto: 'Dispatch · Automatic reply',
    welcome: 'Dispatch is ready. Report your trip status; messages stay on this device.',
    noHistory: 'Your first delivery will appear here',
    historyHelp: 'Game-confirmed deliveries, cancellations and fines are recorded. The last 50 records are kept.',
    delivered: 'Delivered',
    cancelled: 'Job cancelled',
    fine: 'Traffic fine',
    points: 'points',
    noScore: 'Insufficient data to score',
    damage: 'Cargo damage',
    result: 'Game amount',
    xp: 'Game XP',
    partial: 'Missing SDK results are never estimated.',
  },
}
const goals: Goal[] = ['careful', 'express', 'professional']
const statuses: DriverStatus[] = ['departed', 'break', 'delay']

export function DispatchApp() {
  const language = useLanguage(),
    t = labels[language]
  const [tab, setTab] = useState(0)
  const job = useLive((s) => s.job),
    time = useLive((s) => s.telemetry?.gameTime)
  const { history, messages, goals: selected, choose, report } = useDispatch()
  const goal = job ? (selected[jobKey(job)] ?? 'careful') : 'careful'
  const locale = language === 'tr' ? 'tr-TR' : 'en-GB'
  const number = (n: number) => (Number.isFinite(n) ? n.toLocaleString(locale, { maximumFractionDigits: 1 }) : '—')
  const remaining = job?.deliveryTime && time ? job.deliveryTime - time : null
  return (
    <section className="app-panel truck-app dispatch-app" aria-label={t.title}>
      <header className="truck-heading">
        <div>
          <h1>{t.title}</h1>
          <p>{t.company}</p>
        </div>
      </header>
      <div className="truck-tabs" role="tablist" aria-label={t.title}>
        {t.tabs.map((name, i) => (
          <button
            key={name}
            id={`dispatch-tab-${i}`}
            type="button"
            role="tab"
            aria-selected={tab === i}
            aria-controls="dispatch-panel"
            onClick={() => setTab(i)}
          >
            {name}
            {i === 2 && history.length > 0 ? ` (${history.length})` : ''}
          </button>
        ))}
      </div>
      <div className="truck-scroll" id="dispatch-panel" role="tabpanel" aria-labelledby={`dispatch-tab-${tab}`}>
        {tab === 0 &&
          (job ? (
            <>
              <p className="truck-status">{job.cargoLoaded ? t.transit : t.pickup}</p>
              <h2 className="dispatch-route">
                {job.sourceCity || '—'}
                <span aria-hidden="true">→</span>
                {job.destinationCity || '—'}
              </h2>
              <p className="dispatch-cargo">
                {job.cargo} · {number(job.cargoMass / 1000)} t
              </p>
              <dl className="truck-facts">
                <div>
                  <dt>{t.deadline}</dt>
                  <dd>
                    {remaining === null
                      ? t.unknown
                      : remaining < 0
                        ? t.late
                        : `${Math.floor(remaining / 60)} ${t.hours} ${remaining % 60} min`}
                  </dd>
                </div>
                <div>
                  <dt>{t.km}</dt>
                  <dd>{job.plannedDistanceKm ? `${number(job.plannedDistanceKm)} km` : '—'}</dd>
                </div>
                <div>
                  <dt>{t.income}</dt>
                  <dd>{job.income ? number(job.income) : '—'}</dd>
                </div>
              </dl>
              <h3>{t.target}</h3>
              <div className="truck-options">
                {goals.map((g, i) => (
                  <button type="button" key={g} aria-pressed={goal === g} onClick={() => choose(job, g)}>
                    {t.goals[i]}
                  </button>
                ))}
              </div>
              <p className="truck-description">{t.descriptions[goals.indexOf(goal)]}</p>
              <p className="truck-note">{t.local}</p>
            </>
          ) : (
            <div className="truck-empty">
              <FreightGlyph />
              <h2>{t.empty}</h2>
              <p>{t.help}</p>
              <p className="truck-note">{t.local}</p>
            </div>
          ))}
        {tab === 1 && (
          <>
            <p className="truck-description">{t.welcome}</p>
            <div className="truck-options">
              {statuses.map((status, i) => (
                <button type="button" key={status} onClick={() => report(status)}>
                  {t.statuses[i]}
                </button>
              ))}
            </div>
            <ol className="dispatch-messages">
              {[...messages].reverse().map((message, index) => (
                <li key={`${message.id}-${index}`}>
                  <p>
                    <strong>{t.you}</strong>
                    {t.statuses[statuses.indexOf(message.status)]}
                  </p>
                  <p>
                    <strong>{t.auto}</strong>
                    {t.replies[statuses.indexOf(message.status)]}
                  </p>
                </li>
              ))}
            </ol>
          </>
        )}
        {tab === 2 &&
          (history.length ? (
            <>
              <p className="truck-note">
                {t.historyHelp} {t.partial}
              </p>
              <ol className="dispatch-history">
                {history.map((record) => (
                  <li key={record.id}>
                    <div>
                      <strong>
                        {record.event.kind === 1 ? t.delivered : record.event.kind === 2 ? t.cancelled : t.fine}
                      </strong>
                      <span className="dispatch-score">
                        {record.event.kind === 1
                          ? record.score === null
                            ? t.noScore
                            : `${record.score}/100 ${t.points}`
                          : ''}
                      </span>
                    </div>
                    <h3>{record.event.job.cargo || '—'}</h3>
                    <p>
                      {record.event.job.sourceCity} → {record.event.job.destinationCity}
                    </p>
                    <dl className="truck-facts">
                      {(record.event.provided & 1) !== 0 && (
                        <div>
                          <dt>{t.result}</dt>
                          <dd>{number(record.event.amount)}</dd>
                        </div>
                      )}
                      {record.event.kind === 1 && (record.event.provided & 2) !== 0 && (
                        <div>
                          <dt>{t.damage}</dt>
                          <dd>{number(record.event.damage * 100)}%</dd>
                        </div>
                      )}
                      {record.event.kind === 1 && (record.event.provided & 8) !== 0 && (
                        <div>
                          <dt>{t.xp}</dt>
                          <dd>{number(record.event.xp)}</dd>
                        </div>
                      )}
                    </dl>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <div className="truck-empty">
              <FreightGlyph />
              <h2>{t.noHistory}</h2>
              <p>{t.historyHelp}</p>
            </div>
          ))}
      </div>
    </section>
  )
}
function FreightGlyph() {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
      <path d="M9 18h30v28H9zM39 29h10l8 9v8H39M19 18v10h10V18" />
      <circle cx="20" cy="47" r="5" />
      <circle cx="48" cy="47" r="5" />
    </svg>
  )
}
