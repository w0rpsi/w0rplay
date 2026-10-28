# W0RPLAY Scania Smart Curtain — 0.1.0 prototype

Original front curtain for Scania S/R 2016 Smart Dash, controlled from W0RPLAY 2.1.12+ > Cabin.

## Use

1. Enable **W0RPLAY - Scania Smart Curtain** in ETS2's Mod Manager.
2. Visit a service shop and choose **W0RPLAY - Smart Curtain** in the front-curtain (`curtain_f`) slot. It replaces the selected front curtain only; the sleeper TV uses another slot.
3. Open CarPlay > Kabin > Perde. The control becomes available after the private accessory texture is actually drawn and identified. Open/close does not send any game key.

The mesh has 4,400 exported vertices. The opening is a 600 ms alpha-clip reveal across original pleated panels, with gathered side cloth. It has no cloth physics and no exterior model. The default texture is open when the app/plugin is absent; a stopped host also returns it to open after the heartbeat timeout. The runtime writes only the private signed texture. A delayed-upload texture must pass a bounded two-pixel signature probe before any writes.

The package's material/model/texture references and DDS contract are checked by `tools/pack-curtain-mod.py`. A real Direct3D11 software-device test verifies opening/closing and that unrelated textures are unchanged. The user confirmed opening/closing, then requested a redesign matching the Wolli side curtains. This front prototype is superseded by the separate local Wolli compatibility patch. See build-report.json for the validated archive hash.

## Reproduce

Use portable Blender 3.6.23 with SCS Blender Tools 2.4.1, and official SCS Conversion Tools 2.21. Local tools and reference assets live under the ignored `tools/vendor/`; none is shipped in the mod. Set `BLENDER_USER_CONFIG=tools/vendor/blender-profile` and `BLENDER_USER_SCRIPTS=tools/vendor/blender-scripts` to absolute paths.

- Run Blender with `--background --factory-startup --python tools/build-curtain-model.py` from the project root.
- Copy the generated `source/` tree to Conversion Tools' `base/`, then run `resconvert.exe -update -root base` from `bin/win_x64/tools` (no new console wrapper).
- Run `python tools/pack-curtain-mod.py` with Pillow installed.

Only original geometry is packed. The stock curtain locator and an installed accessory's bounding dimensions were inspected locally for fit; no personal game/mod geometry or textures are included. License: GPL-3.0-or-later, as the parent project.

Tool sources: https://download.blender.org/release/Blender3.6/ ; https://github.com/SCSSoftware/BlenderTools/releases/tag/v2.4.1 ; https://modding.scssoft.com/wiki/Documentation/Tools/Conversion_Tools .
