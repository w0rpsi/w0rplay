import { useState } from 'react'
import { isInHost } from '../../../shared/host'
import { useLive } from '../../state/store'
import { useLanguage } from '../../state/text'
import { useCabinControl } from './cabinControl'
import './truck.css'

const copy = {
  tr: {
    title: 'Kabin Kontrolü',
    subtitle: 'Aydınlatma ve perde',
    light: 'İç aydınlatma',
    curtain: 'Perde',
    lightHelp:
      'Belka BC-Interior ana ışıkları tepe lambası hattını kullanır. İlgili ışık aksesuarı araca takılı olmalı.',
    curtainHelp:
      'Wolli yan perde için W0RPLAY uyumluluk modunu Wolli’nin üstüne koy ve Grey Danish Pluche perdesini tak. Eski W0RPLAY ön perdesini çıkar. Wolli TV ayrı yuvada kalır.',
    curtainMissing: 'W0RPLAY perdesi algılanmadı',
    openCurtain: 'Perdeyi aç',
    closeCurtain: 'Perdeyi kapat',
    moving: 'Perde hareket ediyor…',
    bind: 'Tuş ata',
    change: 'Tuşu değiştir',
    clear: 'Atamayı kaldır',
    done: 'Tamam',
    keyHelp:
      'Oyunda veya modda bu işlev için ayarladığın tuşu seç. Belka ana ışıklarında oyunun “Tepe lambası” tuşu kullanılır (varsayılan O). Aynı tuşa başka işlev atama.',
    send: 'Aç / kapat',
    unassigned: 'Tuş atanmadı',
    channel: 'Tepe lambası hattı',
    on: 'Açık',
    off: 'Kapalı',
    unknown: 'Oyun verisi bekleniyor',
    note: 'Işık için Alt’ı bırakınca oyun tuşu gönderilir; oyun önde ve sürüşte olmalı. Perde düğmesi W0RPLAY aksesuarını doğrudan kontrol eder.',
    preview: 'Önizlemede oyuna tuş gönderilmez.',
    statuses: {
      waiting: 'Alt ve diğer basılı tuşları bırak; komut bekliyor…',
      sent: 'Tuş oyuna gönderildi.',
      cancelled: 'Komut iptal edildi. Oyunun sürüş ekranına dönüp tekrar dene.',
      failed: 'Tuş gönderilemedi. Oyun ve uygulamanın aynı yetki düzeyinde çalıştığını kontrol et.',
      busy: 'Önceki komut hâlâ bekliyor.',
      unassigned: 'Önce işlevin tuşunu ata.',
    },
  },
  en: {
    title: 'Cabin Controls',
    subtitle: 'Lighting and curtains',
    light: 'Interior lighting',
    curtain: 'Curtain',
    lightHelp:
      'Belka BC-Interior main lights use the beacon channel. The corresponding lighting accessory must be fitted to the truck.',
    curtainHelp:
      'For Wolli side curtains, place the W0RPLAY compatibility mod above Wolli and fit Grey Danish Pluche. Remove the old W0RPLAY front curtain. The sleeper TV uses a separate slot.',
    curtainMissing: 'W0RPLAY curtain not detected',
    openCurtain: 'Open curtain',
    closeCurtain: 'Close curtain',
    moving: 'Curtain moving…',
    bind: 'Assign key',
    change: 'Change key',
    clear: 'Remove binding',
    done: 'Done',
    keyHelp:
      'Choose the key you assigned in the game or mod. Belka main lights use the game’s Beacon key (O by default). Avoid binding another function to the same key.',
    send: 'Toggle accessory',
    unassigned: 'No key assigned',
    channel: 'Beacon channel',
    on: 'On',
    off: 'Off',
    unknown: 'Waiting for game data',
    note: 'Release Alt to send the lighting key; the game must be in front and in driving view. The curtain button directly controls the W0RPLAY accessory.',
    preview: 'Preview does not send game input.',
    statuses: {
      waiting: 'Release Alt and other held keys; command waiting…',
      sent: 'Key sent to the game.',
      cancelled: 'Command cancelled. Return to driving view and try again.',
      failed: 'Input failed. Check that the game and app run at the same privilege level.',
      busy: 'The previous command is still waiting.',
      unassigned: 'Assign the function’s key first.',
    },
  },
}
const keys = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'].map((label) => ({ label, key: label.charCodeAt(0) }))

export function CabinControlApp() {
  const language = useLanguage(),
    t = copy[language]
  const { bindings, pending, bind, press, curtain, setCurtain } = useCabinControl()
  const [editing, setEditing] = useState<'light' | 'curtain' | null>(null)
  const telemetry = useLive((s) => s.telemetry),
    focused = useLive((s) => s.gameFocused)
  const usable = isInHost() && !!telemetry && !telemetry.paused && focused
  const waiting = pending?.state === 'waiting'
  return (
    <section className="app-panel truck-app cabin-control-app" aria-label={t.title}>
      <header className="truck-heading">
        <div>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
      </header>
      <div className="truck-scroll">
        <div className="cabin-control-list">
          {(['light', 'curtain'] as const).map((control) => {
            if (control === 'curtain') {
              const moving = curtain.progress > 0 && curtain.progress < 1
              return (
                <section className="cabin-control" key={control} aria-labelledby="control-curtain">
                  <div className="cabin-control-title">
                    <ControlGlyph curtain />
                    <div>
                      <h2 id="control-curtain">{t.curtain}</h2>
                      <span>
                        {!curtain.available
                          ? t.curtainMissing
                          : moving
                            ? t.moving
                            : curtain.progress === 1
                              ? t.off
                              : t.on}
                      </span>
                    </div>
                  </div>
                  <p className="truck-description">{t.curtainHelp}</p>
                  <button
                    className="truck-primary"
                    type="button"
                    disabled={!isInHost() || !curtain.available || moving}
                    onClick={() => setCurtain(curtain.progress === 0)}
                  >
                    {curtain.progress === 0 ? t.closeCurtain : t.openCurtain}
                  </button>
                  <p className="cabin-feedback" role="status" aria-live="polite">
                    {moving ? t.moving : ''}
                  </p>
                </section>
              )
            }
            const key = bindings.lightKey
            return (
              <section className="cabin-control" key={control} aria-labelledby={`control-${control}`}>
                <div className="cabin-control-title">
                  <ControlGlyph curtain={false} />
                  <div>
                    <h2 id={`control-${control}`}>{t[control]}</h2>
                    <span>{key === null ? t.unassigned : String.fromCharCode(key)}</span>
                  </div>
                </div>
                <p className="truck-description">{t.lightHelp}</p>
                {control === 'light' && (
                  <p className="cabin-channel">
                    {t.channel}
                    <strong>{telemetry?.beacon === undefined ? t.unknown : telemetry.beacon ? t.on : t.off}</strong>
                  </p>
                )}
                <div className="cabin-actions">
                  <button
                    className="truck-primary"
                    type="button"
                    disabled={!usable || key === null || waiting}
                    onClick={() => press(control)}
                  >
                    {t.send}
                  </button>
                  <button
                    type="button"
                    aria-expanded={editing === control}
                    onClick={() => setEditing(editing === control ? null : control)}
                  >
                    {key === null ? t.bind : t.change}
                  </button>
                </div>
                <p className="cabin-feedback" role="status" aria-live="polite">
                  {pending?.control === control ? t.statuses[pending.state] : ''}
                </p>
                {editing === control && (
                  <div className="cabin-key-picker">
                    <p>{t.keyHelp}</p>
                    <div className="cabin-keys" aria-label={t.bind}>
                      {keys.map((item) => (
                        <button
                          type="button"
                          key={item.key}
                          aria-pressed={key === item.key}
                          onClick={() => bind(control, item.key)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <div className="cabin-actions">
                      <button type="button" onClick={() => bind(control, null)}>
                        {t.clear}
                      </button>
                      <button type="button" onClick={() => setEditing(null)}>
                        {t.done}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )
          })}
        </div>
        <p className="truck-note">{t.note}</p>
        {!isInHost() && <p className="truck-note">{t.preview}</p>}
      </div>
    </section>
  )
}
function ControlGlyph({ curtain }: { curtain: boolean }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {curtain ? (
        <>
          <path d="M6 9h36M9 9v30l10-8V9M39 9v30l-10-8V9M9 27h10M29 27h10" />
        </>
      ) : (
        <>
          <path d="M15 32h18M19 38h10M14 18a10 10 0 1 1 20 0c0 6-5 7-5 14H19c0-7-5-8-5-14Z" />
          <path d="M24 2v3M6 19H3M45 19h-3M8 5l4 4M40 5l-4 4" />
        </>
      )}
    </svg>
  )
}
