import type { Point2 } from "../types/envelope";
import type { MepElement, MepModel } from "../types/mep";
import type { StructuralElement, StructuralModel } from "../types/structure";
import type {
  ClashIssue,
  ClashPairKind,
  ClashReport,
  ClashSeverity,
  ClashTolerances,
} from "../types/coordination";

const DEFAULT_TOLERANCES: ClashTolerances = {
  hard_m: 0.05,
  soft_m: 0.15,
  clearance_m: 0.35,
};

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function centroid(points: Point2[]): Point2 {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

function distPointPoint(a: Point2, b: Point2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Minimum distance between two polylines (segment-segment approx via dense sampling). */
function distPolyline(a: Point2[], b: Point2[]): number {
  if (a.length === 0 || b.length === 0) return Number.POSITIVE_INFINITY;
  if (a.length === 1 && b.length === 1) return distPointPoint(a[0]!, b[0]!);
  let min = Number.POSITIVE_INFINITY;
  const samplesA = samplePolyline(a, 6);
  const samplesB = samplePolyline(b, 6);
  for (const pa of samplesA) {
    for (const pb of samplesB) {
      min = Math.min(min, distPointPoint(pa, pb));
    }
  }
  return min;
}

function samplePolyline(points: Point2[], perSegment: number): Point2[] {
  if (points.length === 1) return points;
  const out: Point2[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    for (let s = 0; s <= perSegment; s += 1) {
      const t = s / perSegment;
      out.push({ x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t });
    }
  }
  return out;
}

function sameStorey(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return true;
  return a === b;
}

function severityForDistance(distance: number, tol: ClashTolerances): ClashSeverity | null {
  if (distance <= tol.hard_m) return "hard";
  if (distance <= tol.soft_m) return "soft";
  if (distance <= tol.clearance_m) return "clearance";
  return null;
}

function kindFor(structType: StructuralElement["type"], mepType: MepElement["type"]): ClashPairKind {
  if (mepType === "Pipe" && structType === "Beam") return "pipe_beam";
  if (mepType === "Duct" && structType === "Beam") return "duct_beam";
  if (mepType === "Pipe" && structType === "Column") return "pipe_column";
  if (mepType === "Duct" && structType === "Column") return "duct_column";
  if (mepType === "Pipe" && structType === "StructuralWall") return "pipe_structural_wall";
  if (mepType === "Duct" && structType === "StructuralWall") return "duct_structural_wall";
  return "mep_structure_generic";
}

function structFootprint(el: StructuralElement): Point2[] {
  if (el.polygon.length >= 2) return el.polygon;
  return [centroid(el.polygon)];
}

function mepFootprint(el: MepElement): Point2[] {
  if (el.path.length >= 1) return el.path;
  return [];
}

function effectiveRadius(struct: StructuralElement, mep: MepElement): number {
  const structR =
    struct.type === "Column"
      ? (struct.width_m ?? 0.4) / 2
      : struct.type === "Beam"
        ? (struct.width_m ?? 0.3) / 2
        : struct.type === "StructuralWall"
          ? (struct.thickness_m ?? 0.3) / 2
          : 0.2;
  const mepR =
    mep.diameter_mm != null
      ? mep.diameter_mm / 2000
      : mep.width_mm != null
        ? mep.width_mm / 2000
        : 0.1;
  return structR + mepR;
}

export function detectClashes(
  structuralModel: StructuralModel,
  mepModel: MepModel,
  tolerances?: Partial<ClashTolerances>,
): ClashReport {
  const tol: ClashTolerances = { ...DEFAULT_TOLERANCES, ...tolerances };
  const structCandidates = structuralModel.elements.filter((el) =>
    ["Beam", "Column", "StructuralWall"].includes(el.type),
  );
  const mepCandidates = mepModel.elements.filter((el) =>
    ["Pipe", "Duct", "CableTray", "Cable"].includes(el.type),
  );

  const issues: ClashIssue[] = [];
  let counter = 0;

  for (const struct of structCandidates) {
    for (const mep of mepCandidates) {
      if (!sameStorey(struct.storey_index, mep.storey_index)) continue;
      const clear = distPolyline(structFootprint(struct), mepFootprint(mep));
      const gap = clear - effectiveRadius(struct, mep);
      const severity = severityForDistance(gap, tol);
      if (!severity) continue;
      counter += 1;
      const kind = kindFor(struct.type, mep.type);
      issues.push({
        id: `clash-${counter}`,
        kind,
        severity,
        a_id: struct.id,
        a_discipline: "STRUCT",
        a_name: struct.name,
        b_id: mep.id,
        b_discipline: "MEP",
        b_name: mep.name,
        distance_m: round3(Math.max(0, gap)),
        tolerance_m: severity === "hard" ? tol.hard_m : severity === "soft" ? tol.soft_m : tol.clearance_m,
        message: `${mep.type} «${mep.name}» vs ${struct.type} «${struct.name}»: holgura ${round3(Math.max(0, gap))} m (${severity}).`,
      });
    }
  }

  const counts = {
    hard: issues.filter((i) => i.severity === "hard").length,
    soft: issues.filter((i) => i.severity === "soft").length,
    clearance: issues.filter((i) => i.severity === "clearance").length,
    total: issues.length,
  };

  return {
    clash_report_id: `clash-${structuralModel.structural_model_id}-${mepModel.mep_model_id}`,
    architectural_model_id: structuralModel.architectural_model_id,
    structural_model_id: structuralModel.structural_model_id,
    mep_model_id: mepModel.mep_model_id,
    generated_at: new Date().toISOString(),
    tolerances: tol,
    issues,
    counts,
    disclaimer:
      "Clash detection geométrica preliminar con tolerancias configurables. No sustituye coordinación BIM profesional ni revisión de obra.",
  };
}
