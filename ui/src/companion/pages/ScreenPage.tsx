import { setW0rplayOpen } from '../useHostStatus'
import { Group, Note, Panel, Row, Status, Switch, Tick } from '../room/parts'
import { banner } from '../room/room'
import { GLOW, useScreenAt } from '../room/screen'
import { type PageProps, screenState } from './page'

/**
 * The truck's screen: where W0RPLAY is now (its headline), W0RPLAY on it or the truck's own, and the
 * connection from W0RPLAY to the game to the screen. On the room's screen, Home, and W0RPLAY saying the
 * same in a banner.
 */
export function ScreenPage({ status, settings, cw, setup }: PageProps) {
  const w = cw.screen
  const state = screenState(status)
  // Known once the cabin page has said (it owns the state): the switch waits for it.
  const open = status?.w0rplayOpen ?? null

  const game = setup?.game
  const isAts = game?.dir
    ? game.dir.toLowerCase().includes('american') || game.dir.toLowerCase().includes('amtruck')
    : false

  const gameName =
    game?.name || (isAts ? 'American Truck Simulator' : w.game)

  const adaptText = (text: string) => {
    if (isAts) {
      return text
        .replace(/Euro Truck Simulator 2[’']?[yY]?[iI]?/g, 'American Truck Simulator’ı')
        .replace(/Euro Truck Simulator 2/g, 'American Truck Simulator')
    }
    return text
  }

  const subText = adaptText(w.subs[state])
  const noGameBanner = {
    title: adaptText(w.banners.noGame.title),
    text: adaptText(w.banners.noGame.text),
  }

  useScreenAt(
    state === 'original' ? 'dashboard' : 'home',
    GLOW.home,
    state === 'live'
      ? banner(w.banners.live)
      : state === 'original'
        ? banner(w.banners.original)
        : state === 'notInCab'
          ? banner(w.banners.notInCab)
          : state === 'noGame'
            ? banner(noGameBanner, true)
            : null,
  )
  const fps = status?.framesPerSecond ?? 0
  return (
    <Panel place="page" title={w.titles[state]} sub={subText}>
      <Group place={4}>
        <Row
          title={w.show}
          detail={w.showDetail}
          accessory={
            <Switch
              on={open ?? false}
              disabled={open === null || !status?.screenDrawing}
              label={w.show}
              change={(on) => {
                setW0rplayOpen(on).catch((error: unknown) => console.error('W0RPLAY could not be switched', error))
              }}
            />
          }
        />
      </Group>
      <Group title={w.connection} place={5}>
        <Row
          title={w.engine}
          value={status?.error ? cw.values.failed : status ? w.engineRunning : w.engineStarting}
          accessory={<Status tone={status?.error ? 'bad' : status ? 'good' : 'busy'} />}
        />
        <Row
          title={gameName}
          value={status?.gameConnected ? w.gameConnected : w.gameNotRunning}
          accessory={<Status tone={status?.gameConnected ? 'good' : 'idle'} />}
        />
        <Row
          title={w.truckScreen}
          value={status?.screenDrawing ? (fps > 0 ? w.screenLive.replace('{fps}', String(fps)) : '60 Hz (Aktif)') : w.screenNotInView}
          accessory={<Status tone={status?.screenDrawing ? 'good' : status?.gameConnected ? 'busy' : 'idle'} />}
        />
      </Group>
      <GpuChooser status={status} settings={settings} cw={cw} />
      {status?.error && <Note tone="bad">{status.error}</Note>}
    </Panel>
  )
}

/**
 * The graphics card W0RPLAY's screen is drawn on: W0RPLAY's pick (the game's), or one the player chooses
 * when that one stutters, as iOS lists choices (a tick on the chosen, as the onboarding's game folders). The
 * one drawing it now says so; a choice starts W0RPLAY's screen again on that card. Only with more than one
 * card to choose from.
 */
function GpuChooser({ status, settings: state, cw }: Pick<PageProps, 'status' | 'settings' | 'cw'>) {
  const w = cw.screen
  const { settings, update } = state
  const adapters = status?.adapters ?? []
  if (!settings || adapters.length < 2) return null
  const chosen = adapters.some((adapter) => adapter.id === settings.graphics.gpu) ? settings.graphics.gpu : null
  const choose = (gpu: string | null) => {
    if (gpu !== settings.graphics.gpu) void update({ ...settings, graphics: { gpu } })
  }
  return (
    <>
      <Group title={cw.about.gpu} place={6}>
        <Row
          title={w.gpuAuto}
          detail={w.gpuAutoDetail}
          accessory={chosen === null ? <Tick key="auto" /> : undefined}
          onClick={() => choose(null)}
        />
        {adapters.map((adapter) => (
          <Row
            key={adapter.id}
            title={adapter.name}
            detail={adapter.name === status?.cabAdapter ? w.gpuInUse : undefined}
            accessory={chosen === adapter.id ? <Tick key={adapter.id} /> : undefined}
            onClick={() => choose(adapter.id)}
          />
        ))}
      </Group>
      <Note tone="calm">{w.gpuNote}</Note>
    </>
  )
}
