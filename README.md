# Circuit Tools

Free, local browser tools for **Novation Circuit Rhythm** and **Circuit Tracks**. Each tool is a single HTML file: open it in desktop Chrome or Edge. Nothing leaves your computer.

Herramientas gratuitas y locales para **Novation Circuit Rhythm** y **Circuit Tracks**. Cada una es un único archivo HTML: ábrelo en Chrome o Edge de escritorio. Nada sale de tu ordenador.

| Tool | Version | Download (ES · EN) |
|---|---|---|
| Circuit Rhythm · Sample Library / Pack Builder | 2.4.0 | [ES](circuit-rhythm/dist/Circuit_Rhythm_Sample_Library.html) · [EN](circuit-rhythm/dist/Circuit_Rhythm_Sample_Library_EN.html) |
| Circuit Tracks · Patch Library / Editor | 3.9.0 | [ES](circuit-tracks/dist/Circuit_Tracks_Patch_Library_Editor.html) · [EN](circuit-tracks/dist/Circuit_Tracks_Patch_Library_Editor_EN.html) |

Support the project / Apoya el proyecto: https://ko-fi.com/falsepositive

## Is my copy the original? / ¿Mi copia es la original?

`SHA256SUMS.txt` lists the checksum and fingerprint of every official build. The fingerprint is also shown in *About*. To inspect any copy: `node tools/marca.mjs file.html`.

## Build from source

Node 18+. In each tool folder: `npm test` and `npm run build` (outputs `dist/`). Builds are reproducible: the result matches `SHA256SUMS.txt`.

## Licence

© 2026 FalsePositive · GPL-3.0 (`LICENSE`). Modified versions must keep the authorship notice and publish their source under the same licence. Fonts: SIL OFL (`licenses/`). Circuit Rhythm project template from CircuitGM, MPL-2.0 (`circuit-rhythm/third_party/circuitgm/`).

Independent project, not affiliated with Novation or Focusrite. Novation, Circuit Tracks, Circuit Rhythm and Components are trademarks of Focusrite Audio Engineering Ltd.
