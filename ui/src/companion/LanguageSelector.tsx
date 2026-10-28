import { Group, Row, Note } from './room/parts'
import type { SettingsState } from './useSettings'

export function LanguageSelector({ state }: { state: SettingsState }) {
  const { settings, update, error } = state
  const tr = settings?.language === 'tr'
  return (
    <Group place={4} title={tr ? 'Dil' : 'Language'}>
      <Row
        title={tr ? 'Uygulama ve CarPlay dili' : 'App and CarPlay language'}
        detail={tr ? 'Her iki ekrana birlikte uygulanır.' : 'Applies to both screens.'}
        accessory={
          <select
            className="language-select"
            aria-label={tr ? 'Dil' : 'Language'}
            value={tr ? 'tr' : 'en'}
            disabled={!settings}
            onChange={(event) =>
              settings && void update({ ...settings, language: event.target.value === 'tr' ? 'tr' : 'en' })
            }
          >
            <option value="en">English</option>
            <option value="tr">Türkçe</option>
          </select>
        }
      />
      {error && <Note tone="bad">{error}</Note>}
    </Group>
  )
}
