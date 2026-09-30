import type { MoveKind, ParseResult, Segment, Vec3 } from "./types";

const INITIAL: Vec3 = { x: 0, y: 0, z: 0 };

function dist(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.hypot(dx, dy, dz);
}

function parseWords(line: string): Map<string, number> {
  const words = new Map<string, number>();
  const re = /([A-Za-z])\s*([-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    words.set(m[1].toUpperCase(), Number(m[2]));
  }
  return words;
}

function stripComment(raw: string): string {
  const semi = raw.indexOf(";");
  const paren = raw.indexOf("(");
  let cut = raw.length;
  if (semi >= 0) cut = Math.min(cut, semi);
  if (paren >= 0) cut = Math.min(cut, paren);
  return raw.slice(0, cut).trim();
}

export function parseGcode(source: string): ParseResult {
  const lines = source.split(/\r?\n/);
  const segments: Segment[] = [];
  const layerZs = new Set<number>();
  const warnings: string[] = [];

  let pos: Vec3 = { ...INITIAL };
  let e = 0;
  let absoluteExtrusion = true;
  let absoluteCoords = true;
  let feedrate = 1200;
  let currentLayerZ = 0;

  let min: Vec3 = { x: Infinity, y: Infinity, z: Infinity };
  let max: Vec3 = { x: -Infinity, y: -Infinity, z: -Infinity };
  let extrusionMm = 0;
  let travelMm = 0;

  const updateBounds = (p: Vec3) => {
    min.x = Math.min(min.x, p.x);
    min.y = Math.min(min.y, p.y);
    min.z = Math.min(min.z, p.z);
    max.x = Math.max(max.x, p.x);
    max.y = Math.max(max.y, p.y);
    max.z = Math.max(max.z, p.z);
  };

  updateBounds(pos);

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const stripped = stripComment(lines[i]);
    if (!stripped) continue;

    const words = parseWords(stripped);
    const g = words.has("G") ? Math.trunc(words.get("G")!) : undefined;

    if (g === 90) absoluteCoords = true;
    if (g === 91) absoluteCoords = false;
    if (g === 92) {
      if (words.has("X")) pos.x = words.get("X")!;
      if (words.has("Y")) pos.y = words.get("Y")!;
      if (words.has("Z")) pos.z = words.get("Z")!;
      if (words.has("E")) e = words.get("E")!;
      continue;
    }
    if (g === 28) {
      const from = { ...pos };
      if (words.has("X")) pos.x = 0;
      if (words.has("Y")) pos.y = 0;
      if (words.has("Z")) pos.z = 0;
      const d = dist(from, pos);
      if (d > 0) {
        segments.push({
          from,
          to: { ...pos },
          kind: "travel",
          line: lineNo,
          feedrate,
          layerZ: currentLayerZ,
        });
        travelMm += d;
        updateBounds(pos);
      }
      continue;
    }

    if (words.has("M")) {
      const mCode = Math.trunc(words.get("M")!);
      if (mCode === 82) absoluteExtrusion = true;
      if (mCode === 83) absoluteExtrusion = false;
      if (g === undefined) continue;
    }

    const isMove = g === 0 || g === 1;
    if (!isMove) continue;

    const target: Vec3 = { ...pos };
    for (const axis of ["X", "Y", "Z"] as const) {
      if (words.has(axis)) {
        const v = words.get(axis)!;
        target[axis.toLowerCase() as "x" | "y" | "z"] = absoluteCoords
          ? v
          : pos[axis.toLowerCase() as "x" | "y" | "z"] + v;
      }
    }

    if (words.has("F")) feedrate = words.get("F")!;

    let eDelta = 0;
    if (words.has("E")) {
      const eVal = words.get("E")!;
      const prevE = e;
      e = absoluteExtrusion ? eVal : e + eVal;
      eDelta = e - prevE;
    }

    if (target.z !== pos.z) {
      currentLayerZ = target.z;
      layerZs.add(Math.round(target.z * 1000) / 1000);
    }

    const from = { ...pos };
    const d = dist(from, target);
    if (d === 0 && eDelta === 0) {
      pos = target;
      continue;
    }

    let kind: MoveKind = g === 0 ? "travel" : "travel";
    if (g === 1) {
      if (eDelta > 0.00001) kind = "extrude";
      else if (eDelta < -0.00001) kind = "retract";
      else kind = "travel";
    }

    segments.push({
      from,
      to: { ...target },
      kind,
      line: lineNo,
      feedrate: feedrate || 1200,
      layerZ: currentLayerZ,
    });

    if (kind === "extrude") extrusionMm += d;
    else travelMm += d;

    pos = target;
    updateBounds(pos);
  }

  if (!Number.isFinite(min.x)) {
    min = { x: 0, y: 0, z: 0 };
    max = { x: 0, y: 0, z: 0 };
    warnings.push("No motion commands found in file.");
  }

  const layers = [...layerZs].sort((a, b) => a - b);
  let estimatedSeconds = 0;
  for (const seg of segments) {
    const d = dist(seg.from, seg.to);
    if (d <= 0) continue;
    const mmPerMin = seg.feedrate > 0 ? seg.feedrate : 1200;
    estimatedSeconds += (d / mmPerMin) * 60;
  }

  return {
    segments,
    layers,
    stats: {
      lineCount: lines.length,
      moveCount: segments.length,
      layerCount: layers.length,
      min,
      max,
      extrusionMm,
      travelMm,
      estimatedMinutes: estimatedSeconds / 60,
    },
    warnings,
  };
}
