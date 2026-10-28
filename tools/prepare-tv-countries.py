"""Download public country playlists and MIT flag assets for the local TV catalogue."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import urllib.request,json,re,hashlib
ROOT=Path(__file__).resolve().parents[1]
CODES='tr de gb fr it es pt nl be at ch pl cz sk hu ro bg gr ua rs hr ba al mk me si se no dk fi is ie us ca mx br ar cl co pe ve uy ec au nz jp kr cn tw hk in pk bd id my sg th vn ph za eg ma dz tn sa ae qa kw il jo lb iq az ge kz uz'.split()
OUT=ROOT/'ui/public/tv';(OUT/'flags').mkdir(parents=True,exist_ok=True);(OUT/'playlists').mkdir(exist_ok=True)
def download(url):
 req=urllib.request.Request(url,headers={'User-Agent':'W0RPLAY-catalog-build'})
 with urllib.request.urlopen(req,timeout=30) as r:return r.read()
def build(code):
 try:
  playlist=download(f'https://iptv-org.github.io/iptv/countries/{"uk" if code=="gb" else code}.m3u')
  if not playlist.lstrip().startswith(b'#EXTM3U'):raise ValueError('Not a playlist')
  count=sum(1 for line in playlist.decode('utf-8-sig').splitlines() if line.strip().startswith('https://') and '.m3u8' in line.lower())
  if not count:return None
  flag=download(f'https://raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/{code}.svg')
  assert b'<svg' in flag and b'<script' not in flag.lower()
  (OUT/'flags'/f'{code}.svg').write_bytes(flag);(OUT/'playlists'/f'{code}.m3u').write_bytes(playlist)
  return {'code':code,'playlistCode':'uk' if code=='gb' else code,'availableStreamsAtBuild':count}
 except Exception as exc:print(code,str(exc),flush=True);return None
with ThreadPoolExecutor(max_workers=8) as pool:countries=[c for c in pool.map(build,CODES) if c]
assert len(countries)>=50,len(countries)
(ROOT/'ui/src/cabin/apps/tv/countries.json').write_text(json.dumps(countries,indent=2)+'\n')
license=download('https://raw.githubusercontent.com/lipis/flag-icons/main/LICENSE')
(OUT/'FLAG-ICONS-LICENSE.txt').write_bytes(license)
(OUT/'SOURCES.txt').write_text('Country playlists: https://github.com/iptv-org/iptv (Unlicense). Snapshot 2026-10-29.\nCountry flags: https://github.com/lipis/flag-icons (MIT; see FLAG-ICONS-LICENSE.txt).\nStream availability and geographic restrictions depend on each broadcaster.\n')
print(json.dumps({'countries':len(countries),'streams':sum(c['availableStreamsAtBuild'] for c in countries),'codes':[c['code'] for c in countries]}))
