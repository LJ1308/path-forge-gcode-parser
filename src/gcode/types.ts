export type Vec3 = { x: number; y: number; z: number };

export type MoveKind = "travel" | "extrude" | "retract" | "unretract";

export type Segment = {
  from: Vec3;
  to: Vec3;
  kind: MoveKind;
  line: number;
  feedrate: number;
  layerZ: number;
};

export type ParseStats = {
  lineCount: number;
  moveCount: number;
  layerCount: number;
  min: Vec3;
  max: Vec3;
  extrusionMm: number;
  travelMm: number;
  estimatedMinutes: number;
};

export type ParseResult = {
  segments: Segment[];
  layers: number[];
  stats: ParseStats;
  warnings: string[];
};
