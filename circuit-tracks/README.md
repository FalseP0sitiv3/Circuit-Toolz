# Circuit Tracks · Patch Library / Editor

Free, local, browser-based tool for the **Novation Circuit Tracks**: understand how each patch is built, listen to it and measure it on the device, edit macros with templates, sort your synth collection into your own folders and subfolders (Bass → Subs, Drones, Groovy…, with proposals read from each patch's name and settings), build packs, generate patterns and record them into the sequencer, and turn them into **full songs** (arrangement strategies, 8 patterns per track, guided recording, scene road map and song .mid).

*Herramienta gratuita y local para el Circuit Tracks. Interfaz en español e inglés.*

> Independent project, not affiliated with Novation or Focusrite. Novation, Circuit Tracks, Circuit Rhythm and Components are trademarks of Focusrite Audio Engineering Ltd.

## Use it
- Open `dist/Circuit_Tracks_Patch_Library_Editor_EN.html` (English) or `dist/Circuit_Tracks_Patch_Library_Editor.html` (Spanish) in **desktop Chrome or Edge**. Web MIDI (with SysEx) and folder access need a secure context (HTTPS or a local file).
- Import .syx, .zip, folders or a JSON backup, connect the Circuit Tracks by USB in *Device*.
- While listening, **Del** deletes a patch (to a bin, **Ctrl Z** undoes), **Alt 1–9** toggles quick tags and **?** lists every shortcut.
- Nothing is uploaded anywhere: your library lives in your browser (IndexedDB). Patches are only ever sent to the device's RAM, never to its flash. Download backups from *Data*.

## Build and test
- `npm test` — core tests (Node 20+)
- `npm run build` — writes both HTML files to `dist/` and checks that every Spanish string has an English translation (`tools/i18n/en.json`)
- `node tests/make-fixtures.mjs` — synthetic fixtures in `tests/out`
- `python3 tests/browser_test.py`, `python3 tests/song_ui.py [file]`, `python3 tests/flows_ui.py tests/out`, `python3 tests/monkey_ui.py tests/out` — browser tests with a simulated Circuit Tracks (Playwright + Chrome)

## Configure for your website
Edit `src/site.json` and rebuild: brand name, site URL, Ko-fi, GitHub and issues links (empty links are hidden), licence, and the file names used by the language switch.

## Hardware notes
Pattern and song recording by MIDI clock and Drum/MIDI track recording over USB follow Novation's Programmer's Reference. If something behaves differently on your unit, please open an issue.

## Credits
Protocol per Novation's Circuit Tracks Programmer's Reference. Fonts: Archivo, Barlow Condensed, JetBrains Mono (SIL OFL, see `licenses/`).
