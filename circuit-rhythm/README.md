# Circuit Rhythm · Sample Library / Pack Builder

Free, local, browser-based tool for the **Novation Circuit Rhythm**: measure and sort your samples, build 128-slot packs within the 228-second limit, and load them with Novation Components or straight onto the microSD card. Also: pattern generator for the 8 tracks, **full-song generator** (arrangement strategies, 8 patterns per track, a scene plan that matches how the Rhythm really plays scenes — up to 16 scenes, copies for long sections and a scene clock — written as a Rhythm project inside the pack, song .mid, WAV mix and stems), recording into the Rhythm over MIDI, collection map, editable folders and subfolders with suggestions from the name and the sound, tags with a quick palette and detected effects, filters by words in the file name, category by similarity (nearest neighbours among the samples you decided), a “current sample” dock (`.`), a command palette (Ctrl K) and organised export to disk.

*Herramienta gratuita y local para la Circuit Rhythm. Interfaz en español e inglés.*

> Independent project, not affiliated with Novation or Focusrite. Novation, Circuit Rhythm, Circuit Tracks and Components are trademarks of Focusrite Audio Engineering Ltd.

## Use it
- Open `dist/Circuit_Rhythm_Sample_Library_EN.html` (English) or `dist/Circuit_Rhythm_Sample_Library.html` (Spanish) in **desktop Chrome or Edge**. Web MIDI and folder access need a secure context (HTTPS or a local file).
- While listening, **Del** deletes a sample (to a bin, **Ctrl Z** undoes; deleted files are ignored when the folder is rescanned, and emptying the bin can also delete them from disk), **Alt 1–9** toggles quick tags and **?** lists every shortcut.
- **Shorten loops** (*01 Library → Shorten loops*, or *04 Packs → ✂*): finds loops whose halves or bars repeat and keeps one part (or bar 1 + the final fill), with click-free crossfades at joins and at the loop point. Preview in a loop before applying; non-destructive.
- Nothing is uploaded anywhere: your library lives in your browser (IndexedDB). Download backups from *08 Data*.

## Build and test
- `npm test` — core tests (Node 18+)
- `npm run build` — writes both HTML files to `dist/`. Fonts are embedded when Python `fontTools` and the Google Fonts `ofl/` folder (env `GF_OFL`) are available; otherwise system fonts are used.
- `python3 tests/make_fixture.py /tmp/crsl_fixture` then `python3 tests/browser_test.py dist/Circuit_Rhythm_Sample_Library_EN.html /tmp/crsl_fixture` — browser tests (Playwright + Chrome)
- `tests/org_ui.py` (folders, tags, reanalysis, dock, Ctrl K, song scenes), `tests/short_ui.py dist/….html` (shortening loops), `tests/trash_ui.py` (bin), `tests/monkey_ui.py` (clicks every control), `tests/i18n_scan.py` (no Spanish left in the English build)

## Configure for your website
Edit `src/site.json` and rebuild: brand name, site URL, Ko-fi, GitHub and issues links (empty links are hidden), licence, and the file names used by the language switch.

## Not verified on hardware yet
Manual SD-card packs, `.circuitrhythmpack` in Components, sample selection by CC 8, pattern recording by MIDI clock and song projects (`.ncs`) written by *06 Songs* (including the scene clock: pattern 8 at 1/8 or 1/4) and shortened loops looping seamlessly on the device are based on Novation's and the community's documentation. Reports welcome.

## Credits
Pack and project format notes: the open-source CircuitGM project; the empty project template in `third_party/circuitgm/` comes from it under the Mozilla Public License 2.0. Fonts: Archivo, Barlow Condensed, JetBrains Mono (SIL OFL, see `licenses/`). Design notes: `DISENO_Sample_Library_Pack_Builder.md` (Spanish).
