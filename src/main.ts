import "./style.css";
import { parseGcode } from "./gcode/parser";
import type { ParseResult } from "./gcode/types";
import { ToolpathViewer } from "./viewer/toolpathViewer";

const SAMPLES = [
  { file: "nested-squares.gcode", label: "Nested squares" },
  { file: "benchy.gcode", label: "Benchy" },
] as const;

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <header class="header">
    <div class="brand">
      <span class="logo" aria-hidden="true">⎔</span>
      <div>
        <h1>PathForge</h1>
        <p class="tagline">Parse G-code, summarize the print, preview moves in 3D — all client-side</p>
      </div>
    </div>
  </header>
  <main class="layout">
    <aside class="panel">
      <section class="dropzone" id="dropzone" tabindex="0">
        <input type="file" id="file-input" accept=".gcode,.gco,.nc,.txt" hidden />
        <p class="drop-title">Drop a G-code file</p>
        <p class="drop-hint">or click to browse · nothing is uploaded</p>
        <div class="sample-buttons" id="sample-buttons">
          ${SAMPLES.map(
            (s) =>
              `<button type="button" class="sample-btn" data-sample="${s.file}">${s.label}</button>`,
          ).join("")}
        </div>
        <p class="file-name" id="file-name"></p>
      </section>
      <section class="stats" id="stats" hidden>
        <h2>Print summary</h2>
        <dl id="stats-grid"></dl>
        <div class="layer-control" id="layer-control" hidden>
          <label for="layer-slider">Show up to layer Z</label>
          <input type="range" id="layer-slider" min="0" max="0" step="0.001" value="0" />
          <output id="layer-value">—</output>
        </div>
        <div class="legend">
          <span><i class="swatch extrude"></i> Extrusion</span>
          <span><i class="swatch travel"></i> Travel</span>
          <span><i class="swatch retract"></i> Retract</span>
        </div>
        <ul class="warnings" id="warnings"></ul>
      </section>
    </aside>
    <div class="viewport-wrap">
      <div id="viewport" class="viewport"></div>
      <p class="viewport-empty" id="viewport-empty">Load a sliced G-code file to visualize the toolpath.</p>
    </div>
  </main>
`;

const dropzone = document.getElementById("dropzone")!;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const fileNameEl = document.getElementById("file-name")!;
const statsSection = document.getElementById("stats")!;
const statsGrid = document.getElementById("stats-grid")!;
const warningsEl = document.getElementById("warnings")!;
const layerControl = document.getElementById("layer-control")!;
const layerSlider = document.getElementById("layer-slider") as HTMLInputElement;
const layerValue = document.getElementById("layer-value")!;
const viewportEmpty = document.getElementById("viewport-empty")!;
const viewportEl = document.getElementById("viewport")!;

const sampleButtons = document.getElementById("sample-buttons")!;
const viewer = new ToolpathViewer(viewportEl);
let currentResult: ParseResult | null = null;

function formatMm(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(2)} m` : `${n.toFixed(1)} mm`;
}

function formatMinutes(m: number): string {
  if (m < 1) return `${Math.round(m * 60)} sec (est.)`;
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return h > 0 ? `${h}h ${min}m (est.)` : `${Math.round(m)} min (est.)`;
}

function renderStats(result: ParseResult) {
  const s = result.stats;
  statsGrid.innerHTML = `
    <dt>Lines</dt><dd>${s.lineCount.toLocaleString()}</dd>
    <dt>Moves</dt><dd>${s.moveCount.toLocaleString()}</dd>
    <dt>Layers</dt><dd>${s.layerCount.toLocaleString()}</dd>
    <dt>Extrusion</dt><dd>${formatMm(s.extrusionMm)}</dd>
    <dt>Travel</dt><dd>${formatMm(s.travelMm)}</dd>
    <dt>Bounds (mm)</dt><dd>${s.min.x.toFixed(1)}×${s.min.y.toFixed(1)}×${s.min.z.toFixed(1)} → ${s.max.x.toFixed(1)}×${s.max.y.toFixed(1)}×${s.max.z.toFixed(1)}</dd>
    <dt>Time</dt><dd>${formatMinutes(s.estimatedMinutes)}</dd>
  `;

  warningsEl.innerHTML = result.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("");

  if (result.layers.length > 1) {
    layerControl.hidden = false;
    const maxZ = result.layers[result.layers.length - 1];
    layerSlider.min = String(result.layers[0]);
    layerSlider.max = String(maxZ);
    layerSlider.step = "any";
    layerSlider.value = String(maxZ);
    layerValue.textContent = `${maxZ.toFixed(3)} mm`;
  } else {
    layerControl.hidden = true;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** @param resetCamera true when opening a new file; false when scrubbing layers only */
function applyLayerPreview(resetCamera = false) {
  if (!currentResult) return;
  const z = layerControl.hidden ? null : Number(layerSlider.value);
  viewer.load(currentResult, z, resetCamera);
}

function handleFile(file: File) {
  fileNameEl.textContent = file.name;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result ?? "");
    currentResult = parseGcode(text);
    statsSection.hidden = false;
    viewportEmpty.hidden = true;
    renderStats(currentResult);
    applyLayerPreview(true);
  };
  reader.readAsText(file);
}

async function loadSample(file: string) {
  viewportEmpty.hidden = true;
  fileNameEl.textContent = `Loading samples/${file}…`;
  const res = await fetch(`${import.meta.env.BASE_URL}samples/${file}`);
  const text = await res.text();
  fileNameEl.textContent = `samples/${file}`;
  currentResult = parseGcode(text);
  statsSection.hidden = false;
  viewportEmpty.hidden = true;
  renderStats(currentResult);
  applyLayerPreview(true);
}

dropzone.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).closest(".sample-btn")) return;
  fileInput.click();
});

sampleButtons.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-sample]");
  if (!btn) return;
  e.stopPropagation();
  void loadSample(btn.dataset.sample!);
});

fileInput.addEventListener("change", () => {
  const f = fileInput.files?.[0];
  if (f) handleFile(f);
});

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  const f = e.dataTransfer?.files[0];
  if (f) handleFile(f);
});

dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});

layerSlider.addEventListener("input", () => {
  layerValue.textContent = `${Number(layerSlider.value).toFixed(3)} mm`;
  applyLayerPreview();
});
