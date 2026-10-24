# W0RPLAY

> **CarPlay-Style Cockpit Screen for Euro Truck Simulator 2 & American Truck Simulator**

W0RPLAY brings a high-end, futuristic infotainment screen right onto your truck's physical dashboard in both **Euro Truck Simulator 2 (ETS2)** and **American Truck Simulator (ATS)**.

---

## 🚀 Features

- **ETS2 & ATS Dual Support:** Full compatibility with both games, Steam libraries, and documents folders.
- **Truck Roster Support:**
  - **ETS2:** DAF 2021 (XF/XG/XG+), Scania S/R (7" & Smart Dash), Iveco S-Way, Renault T 2024, Volvo FH (2021/2024).
  - **ATS:** Kenworth W900, T680 & T680 Next Gen, Peterbilt 579 & 389, Freightliner Cascadia (2019/2024), Western Star (49X, 57X, 5700XE), International (LoneStar, LT, 9900i), Mack (Anthem, Pinnacle), Volvo VNL.
- **In-Game Navigation & Live Maps:** Vector map drawn directly from your game base and map mods (ProMods, etc.) with turn-by-turn guidance and route planning.
- **Music & Media Integration:** Spotify, YouTube, YouTube Music, and Apple Music right inside your truck's cabin.
- **Dynamic Lighting & Wallpapers:** Automatically switches between Light and Dark themes based on in-game headlights / time of day.
- **High-Performance DirectX 11 Hook:** Renders directly into the truck screen texture with zero FPS drop.

---

## 🛠️ Development & Building

### 1. UI Development (Browser Preview)
```bash
cd ui
npm install
npm run dev
```
Open `http://localhost:5173/cabin.html?demo` to test the in-cabin CarPlay interface, or `http://localhost:5173/` for the companion desktop manager.

### 2. Full Native Application Build
Requirements:
- **Rust (Stable):** Install via [rustup.rs](https://rustup.rs/) (with MSVC C++ Build Tools).
- **Node.js 22+**: Already installed on your machine.

Build command:
```bash
cargo build --release
npm run build
```
The compiled plugin DLL (`w0rplay.dll` / `w0rplay.dll`) goes into `<Game Folder>/bin/win_x64/plugins/`.
