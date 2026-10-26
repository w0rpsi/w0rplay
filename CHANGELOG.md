# Changelog

What changed in each release of W0RPLAY. The newest release's notes are what the app shows when it offers the
update.

## 2.1.4 (2026-10-26)
- ETS2 tam ekrandayken kabin ekranının donması ve Alt-Tab yapınca düzelmesi çözüldü: Önceki sürümde pencere (20000, 20000) koordinatlarına taşınmıştı ancak bu koordinatlar Windows sanal ekran sınırları dışında kaldığı için oyun tam ekran/kenarlıksız moda geçtiğinde DWM (DirectFlip / Independent Flip) bu pencerenin çizimini tamamen durduruyordu. Host penceresi görünmez ve tıklama geçirgen (WS_EX_TRANSPARENT | WS_EX_LAYERED, alpha 1, HWND_BOTTOM) olarak ana ekranın (0, 0) koordinatlarına alındı. WinRT görsel ağacı CreateDesktopWindowTarget ile doğrudan masaüstü pencere hedefine bağlandı, böylece oyun odaktayken DWM kare akışını asla askıya almıyor.
- Tıklamalarda oyunun donması, DirectInput odak kaybı ve FPS çökmesi giderildi: Varsayılan pencere prosedürü WM_MOUSEACTIVATE mesajına MA_ACTIVATE döndüğü için fare tıklandığında Windows pasif durumdaki host penceresini öne getirmeye çalışıyor, bu da ETS2'nin fare odağını düşürerek anlık donmaya yol açıyordu. Özel w0rplay_offscreen_host sınıfı yazılarak WM_MOUSEACTIVATE mesajına doğrudan MA_NOACTIVATE (-3) ve WM_NCHITTEST mesajına HTTRANSPARENT dönüldü; oyun içi tıklamalarda odak kesinlikle bozulmuyor.
- WGC kare yakalama hattına DirectX 11 GPU Flush eklendi: Paylaşılan doku kilidi (shared.unlock) açıldıktan hemen sonra context.Flush() çağrılarak çizim komutlarının gecikmesiz şekilde GPU kuyruğuna iletilmesi ve ETS2 render motoruyla anlık senkronize olması sağlandı.
- YouTube Music arka plan kaynak tüketimi düşürüldü: Arka planda oynatılan müzik kliplerinin 1080p60 veya 4K çözünürlüğe çıkıp video dekoderini (NVDEC) meşgul etmesini önlemek amacıyla YouTube Music için de 720p (hd720) tavanı uygulandı.
- Kontak açılışındaki siyah ekran/takılma sorunu giderildi: Arka plan Chromium sürecinde occluded timer'lar yavaşlatıldığı için React tarafındaki açılış/splash zamanlayıcısı takılı kalabiliyordu; bu bekleme kaldırılarak kabin ekranının motor çalıştığında anında canlı yayına geçmesi sağlandı.
- Kod temizliği ve test uyumluluğu: TruckersMP başlık doğrulama testi güncellendi, harita okuyucu ve kurulum modüllerindeki tüm derleyici/clippy uyarıları ile emniyetsiz blok açıklamaları tamamlandı.

## 2.1.3 (2026-10-26)
- Kabin ekranının 2-3 FPS'e kilitlenmesi kesin olarak giderildi: Chromium, pencere koordinatları -32000 olduğunda Windows tarafından simge durumuna küçültülmüş (SW_SHOWMINIMIZED) sayıldığı için render döngüsünü 1-2 FPS'e kısıyordu. Host penceresi masaüstü dışı pozitif koordinatlara (20000, 20000) taşındı, SW_SHOWNA ve WS_POPUP | WS_VISIBLE aktif edildi. Fare tıklamasında oyunun odağını çalmasını engelleyen EnableWindow(false) yapısı da eksiksiz korundu.
- Arka plan video/medya ve timer kısıtlamaları kaldırıldı: Chromium başlatma parametrelerine --disable-background-media-suspend ve IntensiveWakeUpThrottling devre dışı bırakması eklendi.

## 2.1.2 (2026-10-25)
- Video oynatma ve fare etkileşiminde FPS çökmesi giderildi: 500-1000 Hz farelerin arka plan Chromium sürecini IPC/COM çağrılarıyla boğması engellendi; fare hareketleri 15 ms (~66 FPS) ile hız sınırlandırılmasına alındı, tıklamalar ise gecikmesiz olarak aktarılmaya devam ediyor.
- YouTube video kalitesi optimizasyonu: Otomatik kalitenin 1080p60/1440p seçerek GPU video kod çözücüsünü (NVDEC) ve VRAM bant genişliğini doyurması engellendi, kabin içi ekranlar için 720p (hd720) tavanı getirildi.
- Sıfır React render imleç mimarisi: Fare hareketinde tüm bileşeni yeniden render eden React state akışı kaldırıldı, imleç konumu doğrudan DOM üzerinde transform (translate3d) ve pasif event listener'lar ile güncelleniyor.
- Senkron layout reflow temizliği: Video oynarken her fare hareketinde 5 katmanlı elementsFromPoint ve getComputedStyle sorgulayan arka plan kontrast algılama kodu kaldırıldı; yerine tüm yüzeylerde net görünen yüksek kontrastlı ikili dış hat CSS eklendi.
- Akıcı sürükle-bırak kaydırma (drag-to-scroll): Tıklayıp sürükleme hareketleri requestAnimationFrame ile toplu işlenerek video oynatılırken yaşanan GPU/CPU takılmaları çözüldü.
- Chromium başlatma bayrakları güncellendi: --enable-gpu-rasterization, --enable-zero-copy ve gereksiz yardımcı sistemleri devre dışı bırakan bayraklar eklendi.

## 2.1.1 (2026-10-25)
- Mouse click & focus freeze fix: Restored disabled state on the offscreen host window to prevent WebView2 from stealing Windows mouse capture on click, eliminating the game stall and FPS drop when interacting with the cabin screen.
- Smooth 60 FPS cabin stream: Restored cabin capture back to native 60 FPS, eliminating cursor stutter and choppy movement.

## 2.1.0 (2026-10-25)
- Windows 11 off-screen throttling: Fixed an issue where the in-cabin display locked to 3 FPS. The off-screen host window was moved out of Windows minimized coordinates (-32000) so Chromium's compositor stays active at full framerate.
- Frame pacing & stutter fix: Capped in-cabin screen capture to 30 FPS. This reduces DirectX texture copy bandwidth and eliminates GPU queue stalls during in-game head rotation and heavy rendering passes.
- Memory management: Added a 128 MB V8 heap limit to Chromium to prevent RAM accumulation over long driving sessions.
- American Truck Simulator support: Added screen layouts and automatic mod generation for Volvo VNL (2018/2025), Freightliner Cascadia (2024/ICC5), Kenworth T680 (2022), and Western Star (5700XE/57X).
- Added live TV app and in-game Alt+1 / Alt+2 / Alt+3 media hotkeys.

## 2.0.1 (2026-10-23)
- W0RPLAY works on other versions of the game, not only the current Steam one: it now finds what it needs in
  the game itself, whatever its version. The VR version and older versions such as 1.60 included, and it should
  keep working through game updates.

## 2.0.0 (2026-10-22)
- TruckersMP: W0RPLAY works there, its screens brought into the game by its plugin as in single player.
  Maps uses TruckersMP's own map (its HQ and event cities), prepared as soon as TruckersMP is found.
- TruckersMP: the other players show on the map, live around you and further out every few seconds, and
  traffic on your route shows on the blue line in yellow and red where trucks are bunched up, as you choose
  a route and as you drive.
- Maps at night in Apple Maps' own dark colours: slate-blue ground, lighter buildings, deep blue water, teal
  parks, and roads as light lines further out and dark bands closer in.
- Maps by day in Apple Maps' own light colours: cream ground, white streets, grey motorways, sky-blue water;
  the 3D buildings in the colour of the flat ones, their walls softly shaded rather than near black.
- Maps shows the buildings in 3D as you drive, in their own shapes and heights from the game's models (a
  tower's pod, a roof over the pumps) and in the colour of the flat ones, as Apple Maps does. A filling
  station's or a border crossing's roof is left out while you're under it. Every map is prepared again once.
- Filling stations, garages, services, hotels, recruitment agencies and company depots stand in 3D too, their
  own buildings from the game's models, rather than lying flat.
- Warehouses and malls the game builds from walls stand as whole buildings, and the details on their roofs no
  longer stand in rows on the ground.
- Filling stations on Maps: no more white blobs where a station stands beside the road, and the roads through
  stations on the road join on at their own width instead of stopping short.
- One-way service roads in the Balkans join their forks and stations smoothly on Maps, without a step at each join.
- Tunnels on Maps: roads through tunnels are drawn as a faint band, as Apple Maps draws them.
- Text Size in Settings › Appearance, as on iPhone: seven steps from smaller to larger, for the text in every
  app and the names on the map, the icons and artwork as they are.
- An equalizer in Settings › Sound, as on iPhone: Recommended or Custom, Low, Mid and High dragged up or down
  (up to 6 dB each way) for every player and every truck, with the song playing and its waveform moving under
  the curve as you set it.
- The Volvo FH's own speakers: music plays from the woofers low in its doors, with the bass from the panels on
  its back wall.
- With head tracking, the truck's speakers no longer crackle as the tracker's small wobbles turn the sound:
  it follows your head only as it really moves.
- A truck mod is no longer taken for a map mod, so it doesn't get a map of its own prepared for nothing.
- The Companion's Map page shows one progress number in its bar and its sidebar, never running ahead of the
  map being prepared.
- W0RPLAY removes the maps no profile plays any more (a profile deleted, its map mods changed), freeing their
  space.
- Handing a route to the game's GPS: W0RPLAY's hidden waypoints go only on real road pieces, never on a
  junction or a border crossing's lanes, and at border crossings and toll plazas the game picks the lane trucks
  use. Before, the screen could flash several times and the game end up on its own way.
- Maps offers routes again where it found none, such as on a toll plaza's approach.
- Routes never go along roads no vehicle may drive.
- With the game's Time zones option on (Only time or Full info), the clock shows the time where you are, as
  the game's clock does: it was an hour early in Finland, the Baltics, Romania, Bulgaria, Greece and Turkey,
  and an hour late in the UK and Portugal. With it off, the clock stays the game's time. Every map is prepared
  again once.
- Pausing the game (its menu, its map) gives the mouse back to the game, also with "Press once instead of
  holding" on: the menu couldn't be used. Back in the game, press W0RPLAY's key again to use the screen.
- A stop you add goes where it fits along the way, as the game's own map puts one: from A to F, adding D and
  then B gives A, B, D, F. Without a job, a stop no longer becomes the end of the route.
- With stops on the route, the arrival pill shows the time to the next stop beside the time to the end
  ("30 min | 3 h 5 min"); once you reach it, the time to the one after.
- Closing the game's menu, the music comes back as the game's picture does, not 1.5 seconds later when the
  truck moves on.
- "Press once instead of holding" works: once on, pressing W0RPLAY's key again didn't turn it off.
- Apple Music's lyrics no longer pile up: each song's words stayed on the screen under the next song's. Spotify's
  home no longer risks showing a shelf twice or leaving one out when several share a title.
- Apple Music's synced lyrics follow every song: on songs whose times Apple writes in seconds, the last line had
  always shown as the one sung.
- Back in the game, the music fades in as it starts playing again, instead of staying silent for two seconds
  first (Spotify, Apple Music and YouTube Music).
- Apple Music's lyrics follow the song again, and a song from your Library no longer shows "couldn't load" over
  its own lyrics part way through.
- In Maps, pressing Go no longer makes the search panel jump from side to side while the game takes the route.
- Desktop icons can be clicked again while W0RPLAY runs: an invisible window of its truck screen covered the top
  left of the main screen and took the clicks there.
- W0RPLAY in the Volvo FH (2021 and 2024, their DLCs): the real FH has CarPlay with its INFOHIGH package.
- On the Scania S and R's 7" screen, W0RPLAY shows whole and sharp: its bottom was cut off, everything was
  drawn too tall, and the game drew the screen at a quarter of its resolution. Its sidebar shows two recent
  apps; the Dashboard's arrival time goes to the top of its map, clear of the speed and zoom buttons, and its
  next turn fits its column; Spotify's shortcuts show two across, with their names whole.
- A search box's hint too long for it shows its start, not its end. In Spotify, nothing shows under the player
  bar at the foot.
- The Dashboard's map has zoom buttons, as Maps does. They fade away after 15 seconds without using the map,
  and come back as you point at it.
- Keybinds: the music's volume up and down (5% a press) and play/pause, from the game. By default, hold
  W0RPLAY's key and press 1 (volume down), 2 (play/pause) or 3 (volume up); any of them can be any key, alone or with W0RPLAY's key, in the
  Companion's Controls. The volume shows at the top of the screen as it changes, as CarPlay shows it. A key
  bound to W0RPLAY no longer does anything in the game while it's W0RPLAY's.
- W0RPLAY's key can be any key now, not only the four offered, and it can be pressed once to use the screen
  and again to stop, instead of held (Controls, "Press once instead of holding").
- Leaving the game (its pause menu, the map, another window), the music fades out over half a second instead
  of cutting off, and fades back in as you return. Pausing it yourself still stops it at once.
- Spotify starts at the volume you last set, instead of its own every time (YouTube, YouTube Music and Apple
  Music already did).
- After switching from a truck W0RPLAY supports to one it doesn't, holding W0RPLAY's key no longer takes
  the mouse from the game.
- Maps shows the rest areas made without a rest area's own building block, where the game offers sleep by the
  road: over a thousand more on the base map, about 1,800 more with ProMods, as the game's own map shows them.
  Every map is prepared again once.
- W0RPLAY finds your game's folder when the game is started with `-homedir` in its Steam launch options, so
  it reads your own profiles and their mods (ProMods and others) instead of an old folder in Documents.
- In Light mode, the other routes Go offers are drawn pale, as Apple's are, instead of staying dark.
- Maps has a compass right over its zoom buttons, as CarPlay's Maps does: its red mark and N turn with the
  map, always pointing north. Tap it and the map turns north up, seen from above, still following your
  truck; the arrow then brings the view from behind the truck back.
- At toll plazas, the route on the map goes through a booth trucks may use, as the game's GPS sends you (often
  the right-hand ones), instead of straight through a booth for cars only.
- One player at a time, as on a phone: starting music or a video in Apple Music, Spotify, YouTube Music or
  YouTube pauses whichever of them was playing, instead of both playing over each other.
- When W0RPLAY offers an update, each change in its notes shows whole, instead of being cut off after its
  first line.
- A wallpaper of your own that's a single picture works in Light and Dark mode alike. It had kept the screen
  (and its icons) in one look, dark or light by the picture's brightness, with no way to switch.
- A map mod W0RPLAY can't read no longer stops a profile's map: the map is made without it, and the Map page
  names it on the profile. Mods whose archives give wrong sizes for their files (a trick of protected mods,
  which the game reads anyway) are read in full.
- On a route, Maps' search and Find nearby offer only places along the rest of the route, nearest along it
  first, with how far along the route each is and what stopping there adds ("+5 min"): no more stops
  behind you. Adding one says what it added, in the game's own distance and time.
- Go offers the routes to a place first, as Apple Maps does: the fastest, the shortest, one on small roads or
  another way, each with its time and distance, drawn on the map. The one you pick is handed to the game's
  GPS, which follows it, held to it by as few waypoints as it needs (up to nine, in the middle of roads); if
  it won't follow, it takes its own way, with none of them left behind. Every map is prepared again once, for
  its routes. The routes show whole, beside the card; a route can be picked on the map too, by tapping it; Go
  sits in the picked route's row. After Go, the map is back on the truck at the zoom it had before. Another
  way no longer leaves a motorway at an interchange only to come straight back onto it.
- W0RPLAY's truck screens no longer need turning on in Mod Manager, for each profile: W0RPLAY's plugin
  brings them into the game itself, in every profile and in Convoy, and they're not in your mod list at all.
  The old W0RPLAY mod is taken out of the game's mod folder and out of your profiles when W0RPLAY updates
  (with the game closed); uninstalling W0RPLAY still takes everything out.
- On the Scania Smart Dash Advanced (12.9"), W0RPLAY is laid out for its own screen: everything is smaller
  than on the 10.1", so it no longer looks too large, with text a little larger than the 10.1"'s so Maps'
  small print stays easy to read. W0RPLAY's
  screens mod now carries its own copies of those interiors' definitions to tell the two apart. Its taller
  sidebar shows five recent apps.
- Apple Music, Spotify and YouTube Music open smoothly the first time after the screen comes on: their window
  grows out of the icon showing a saved copy of how the app first looks (its own loading screens, signed
  in), and the app takes its place once open, its content loading as usual.
- Closing the game (or the game crashing) stops the music: Apple Music, Spotify, YouTube Music and YouTube
  are closed with it, instead of playing on, unseen, through the truck's speakers with no game. The screen
  starts afresh with the next game.
- When W0RPLAY's app and its game plugin are of different versions (one updated, the other not yet), they
  no longer try to work together: they had misread each other, and typing could take the truck's driving
  keys.

## 1.2.0 (2026-10-19)
- With map mods (ProMods, Türkiye maps and others), the route follows the mod's own junctions and the
  Maps app gives its turns there, instead of only where the mod left the game's roads as they were.
- W0RPLAY's screen is drawn on the same graphics card as the game, not on whichever card Windows lists
  first (the slow built-in one on many laptops). If it picks the wrong one, choose another under Truck
  Screen › Graphics Card. About shows W0RPLAY's card and the game's.
- ProMods maps show all their junctions: about 16,000 were missing, leaving roads cut short (most visible
  with ProMods Maghreb). ProMods players' maps are prepared again once, after the update.
- Maps with ProMods' Middle East add-on can be prepared: one of its roads was taken for a road 116 km away,
  and preparing the map ran out of memory.
- Preparing a map takes about half the memory (ProMods: 4 GB down to 2.2 GB) and runs faster on PCs with
  more cores. A map that would need more memory than the PC can spare is stopped, and the Map page says why.
- A filling station two fuel companies stand by is always named after the nearer one.
- Map mods are layered on the map as the game layers them: the one higher in the Mod Manager wins where two
  change the same thing (W0RPLAY had them the other way round). Every map is prepared again once.
- The Maps app shows the map of the profile you've loaded, as soon as you load it. It had followed the profile
  with the newest save, so a profile not saved for a while showed another profile's map (and garages).
- After Prepare Maps Again, the Map page's progress bar is all the maps being prepared, each profile an equal
  share (ten profiles: 10% each), instead of saying it's done once yours is. Each profile's row shows its own.

## 1.1.3 (2026-10-18)
- In a convoy, W0RPLAY's clock, day and night, weather times and arrival times follow the convoy's time,
  as the cab's own clock does, instead of your own game's.
- Preparing a map shows how far it is all the way through, not only at a few points.

## 1.1.2 (2026-10-18)
- ProMods 2.84's map can now be prepared: its older parts, which 1.1.1 still couldn't read, are read too
  (checked against ProMods' own map, all 1,247 of its parts).
- If the screen mod can't be installed, the message says which step failed and where.

## 1.1.1 (2026-10-18)
- Maps from map mods made with an older version of the game's editor, ProMods 2.84 among them, can be
  prepared. Water painted by those mods may be missing for now.
- W0RPLAY finds the game's folder when it's in OneDrive but Windows' Documents points elsewhere (or the
  other way round), so the screen mod installs and your profiles and maps are found.

## 1.1.0 (2026-10-18)
- W0RPLAY now appears only in the trucks it's made for: the DAF XF and XG 2021, the Scania S and R, the
  Iveco S-Way and the Renault T 2024. Other trucks (the Mercedes-Benz Actros MP4, say) keep their own screen,
  and holding the key no longer takes their mouse. More trucks come with the tablet.
- W0RPLAY prepares a map for every profile, one after another, starting with the one you play. A profile
  whose map can't be prepared no longer leaves your other profiles without one, and the Map page shows each
  profile's map: ready, being prepared, or why it couldn't be.
- The Map page has a Prepare Maps Again button: every profile's map is made anew, one by one, failed ones
  included. The cab keeps showing your map until the new one is ready.
- Maps by HVT are recognised whatever they're called, so W0RPLAY says they aren't allowed instead of failing
  to prepare the map.

## 1.0.4 (2026-10-18)
- Setup no longer counts the Feldbinder and Krone trailer packs as map DLCs.
- The tutorial at the end of setup reads better: rewritten in Turkish, and clearer in English and every
  other language.

## 1.0.3 (2026-10-18)
- Spotify no longer goes silent after a pause, or by itself between songs, when it plays through the truck's
  speakers.
- Uninstalling removes everything you asked it to, your maps and sign-ins included, and no window flashes up.
- Signing out of a service finishes properly, without the button spinning on.
- A truck from a mod (Jasper's DAF 2021, say) counts as installed even when no profile uses the mod yet.

## 1.0.2 (2026-10-17)
- You can join a friend's convoy, or have them join yours, when only one of you has W0RPLAY: its mod is
  marked as optional in convoys.

## 1.0.1 (2026-10-17)
- A new version of W0RPLAY is offered as soon as you open it, whichever page it opens on.
- If W0RPLAY can't check for updates (no internet, say), it tries again in half an hour instead of six hours.

## 1.0.0 (2026-10-17)
- First release.
