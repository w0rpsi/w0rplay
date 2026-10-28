type TVGlyphName =
  | 'channels'
  | 'plus'
  | 'expand'
  | 'collapse'
  | 'close'
  | 'warning'
  | 'previous'
  | 'next'
  | 'play'
  | 'pause'
  | 'volume'
  | 'muted'

const PATHS: Record<TVGlyphName, string> = {
  channels: 'M3 5h18v14H3z M8 5v14 M11 9h7 M11 14h7',
  plus: 'M12 4v16 M4 12h16',
  expand: 'M9 3H3v6 M15 3h6v6 M3 15v6h6 M21 15v6h-6',
  collapse: 'M3 9h6V3 M15 3v6h6 M9 21v-6H3 M21 15h-6v6',
  close: 'M5 5l14 14 M19 5L5 19',
  warning: 'M12 3L2 21h20z M12 9v5 M12 17h.01',
  previous: 'M5 5v14 M19 5L7 12l12 7z',
  next: 'M19 5v14 M5 5l12 7-12 7z',
  play: 'M7 4l14 8-14 8z',
  pause: 'M6 4h4v16H6z M14 4h4v16h-4z',
  volume: 'M3 9h4l5-5v16l-5-5H3z M16 8a6 6 0 0 1 0 8 M19 5a10 10 0 0 1 0 14',
  muted: 'M3 9h4l5-5v16l-5-5H3z M16 9l6 6 M22 9l-6 6',
}

export function TVGlyph({ name }: { name: TVGlyphName }) {
  return (
    <svg
      className="tv-glyph"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
