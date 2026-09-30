# PathForge

Browser-based **G-code processor** for 3D printing: parse sliced files locally, summarize print stats, and preview extrusion vs travel moves in 3D. No server — ideal for [GitHub Pages](https://pages.github.com/).

## Features

- **Client-side parsing** — G0/G1 moves, absolute/relative coords (G90/G91), extrusion modes (M82/M83), comments stripped
- **Print summary** — layers, bounds, extrusion/travel distance, rough time estimate from feedrates
- **3D toolpath view** — color-coded segments (Three.js), orbit controls, layer slider
- **Privacy** — files never leave your machine

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Try **Nested squares** or **Benchy** under the drop zone, or load your own export from Cura / PrusaSlicer.

## Deploy to GitHub Pages

1. Push the repo to GitHub.
2. If the site URL is `https://<user>.github.io/<repo>/`, set `base` in `vite.config.ts` to `"/<repo>/"` (for a user site at `username.github.io` with no repo path, use `"./"`).
3. Publish:

   ```bash
   npm run deploy
   ```

4. In **Settings → Pages**, choose **Deploy from a branch**, branch **`gh-pages`**, folder **`/ (root)`**.

## Talking points (job fair)

- Implemented a **lexer-style G-code parser** with machine state (position, E, feedrate, coordinate modes).
- **Performance**: line-by-line parse; visualization batches line segments by move type.
- **UX**: drag-and-drop, layer scrubbing, estimated print time from F words.
- Possible extensions: arc moves (G2/G3), filament weight from filament diameter, G-code diff, anomaly detection (cold extrusion).

## Tech

- TypeScript, Vite, Three.js
