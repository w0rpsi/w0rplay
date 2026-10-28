# Building W0RPLAY 2.1.15

The repository root is the current source workspace. Requirements: Windows, the Rust toolchain, Node.js/npm and the native linker required by your Rust target.

```powershell
npm ci
npm --prefix ui ci
npm --prefix ui run build:release
cargo build --release --locked -p w0rplay-app -p w0rplay-plugin --features tauri/custom-protocol
```

Package `target/release/w0rplay.exe` as `W0RPLAY.exe`, `target/release/w0rplay.dll` as `w0rplay.dll`, and copy the complete `ui/dist` directory beside the EXE as `ui`. Keep the EXE, DLL and UI from the same build. Never replace a plugin DLL while its game process is running.

```powershell
npm --prefix ui test -- --reporter=dot
cargo test --locked -p w0rplay-host --lib
```

Integration tests marked ignored require their documented live environment. Successful compilation and unit tests do not establish real-game frame rate or every broadcaster's availability.

## Country catalogues

`ui/public/tv` contains flags and country playlist fallbacks. `tools/prepare-tv-countries.py` refreshes them from iptv-org and flag-icons; retain the included license and source notices. Runtime loads one country at a time and caches at most three lists.

## Optional curtain asset tooling

`tools/build-wolli-curtain-poses.py` and the related pack/validation tools require Blender, SCS tools, extracted cabin references and the user's own Wolli mod. These dependencies and derived Wolli assets are intentionally not redistributed. Set `W0RPLAY_WOLLI_MOD` to your local Wolli archive before running the Wolli packer. The native pose controller remains part of the source build.
