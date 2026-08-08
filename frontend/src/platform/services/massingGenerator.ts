import type { BuildingEnvelope, Point2 } from "../types/envelope";
import type {
  MassingAlternative,
  MassingGeneratorInput,
  MassingMetrics,
  MassingStudy,
  MassingViolation,
} from "../types/massing";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function polygonArea(points: Point2[]): number {
  if (points.length < 3) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function bounds(points: Point2[]): { minX: number; minY: number; maxX: number; maxY: number; w: number; h: number } {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function rect(minX: number, minY: number, w: number, h: number): Point2[] {
  return [
    { x: round2(minX), y: round2(minY) },
    { x: round2(minX + w), y: round2(minY) },
    { x: round2(minX + w), y: round2(minY + h) },
    { x: round2(minX), y: round2(minY + h) },
  ];
}

function clonePoly(points: Point2[]): Point2[] {
  return points.map((p) => ({ x: round2(p.x), y: round2(p.y) }));
}

function scaleAboutCenter(points: Point2[], factor: number): Point2[] {
  const b = bounds(points);
  const cx = b.minX + b.w / 2;
  const cy = b.minY + b.h / 2;
  return points.map((p) => ({
    x: round2(cx + (p.x - cx) * factor),
    y: round2(cy + (p.y - cy) * factor),
  }));
}

function evaluateMetrics(
  envelope: BuildingEnvelope,
  massPolygons: Point2[][],
  courtyardPolygons: Point2[][],
  floors: number,
  floorToFloor: number,
): { metrics: MassingMetrics; violations: MassingViolation[]; within: boolean } {
  const footprint = round2(massPolygons.reduce((acc, poly) => acc + polygonArea(poly), 0));
  const courtyard = round2(courtyardPolygons.reduce((acc, poly) => acc + polygonArea(poly), 0));
  const gfa = round2(footprint * floors);
  const height = round2(floors * floorToFloor);
  const plot = envelope.metrics.plot_area_m2;
  const occUsed = plot > 0 ? round2(footprint / plot) : null;
  const buildAllowed = envelope.metrics.buildable_area_m2_allowed;
  const buildRatio = buildAllowed && buildAllowed > 0 ? round2(gfa / buildAllowed) : null;
  const envFoot = envelope.metrics.footprint_area_m2;
  const fill = envFoot > 0 ? round2(footprint / envFoot) : 0;

  const violations: MassingViolation[] = [];
  if (envelope.metrics.occupation_allowed !== null && occUsed !== null && occUsed > envelope.metrics.occupation_allowed + 0.001) {
    violations.push({
      code: "exceeds_occupation",
      message: `Ocupación ${(occUsed * 100).toFixed(1)}% > permitida ${((envelope.metrics.occupation_allowed ?? 0) * 100).toFixed(1)}%`,
    });
  }
  if (buildAllowed !== null && gfa > buildAllowed + 0.5) {
    violations.push({
      code: "exceeds_buildability",
      message: `m²t ${gfa.toFixed(1)} > permitidos ${buildAllowed.toFixed(1)}`,
    });
  }
  if (envelope.metrics.max_floors !== null && floors > envelope.metrics.max_floors) {
    violations.push({
      code: "exceeds_floors",
      message: `Plantas ${floors} > máximo ${envelope.metrics.max_floors}`,
    });
  }
  if (envelope.metrics.max_height_m !== null && height > envelope.metrics.max_height_m + 0.05) {
    violations.push({
      code: "exceeds_height",
      message: `Altura ${height.toFixed(2)} m > máxima ${envelope.metrics.max_height_m} m`,
    });
  }
  if (footprint > envFoot + 0.5) {
    violations.push({
      code: "outside_envelope",
      message: "La huella del massing supera la envolvente.",
    });
  }

  return {
    within: violations.length === 0,
    violations,
    metrics: {
      floors,
      floor_to_floor_m: floorToFloor,
      height_m: height,
      footprint_area_m2: footprint,
      courtyard_area_m2: courtyard,
      gross_floor_area_m2: gfa,
      occupation_used: occUsed,
      buildability_used_ratio: buildRatio,
      envelope_fill_ratio: fill,
    },
  };
}

function alternative(
  key: "A" | "B" | "C",
  label: string,
  strategy: MassingAlternative["strategy"],
  summary: string,
  envelope: BuildingEnvelope,
  massPolygons: Point2[][],
  courtyardPolygons: Point2[][],
  floors: number,
  floorToFloor: number,
): MassingAlternative {
  const { metrics, violations, within } = evaluateMetrics(
    envelope,
    massPolygons,
    courtyardPolygons,
    floors,
    floorToFloor,
  );
  return {
    id: `mass-${envelope.envelope_id}-${key}`,
    key,
    label,
    strategy,
    summary,
    mass_polygons: massPolygons,
    courtyard_polygons: courtyardPolygons,
    floors,
    floor_to_floor_m: floorToFloor,
    height_m: metrics.height_m,
    metrics,
    violations,
    is_within_envelope: within,
  };
}

function buildFullFill(envelope: BuildingEnvelope, floors: number, floorToFloor: number): MassingAlternative {
  return alternative(
    "A",
    "A · Máximo aprovechamiento",
    "full_fill",
    "Extrusión completa de la huella de envolvente a todas las plantas permitidas.",
    envelope,
    [clonePoly(envelope.footprint_polygon)],
    [],
    floors,
    floorToFloor,
  );
}

function buildCourtyard(envelope: BuildingEnvelope, floors: number, floorToFloor: number): MassingAlternative {
  const b = bounds(envelope.footprint_polygon);
  const ring = Math.min(b.w, b.h) * 0.18;
  const courtW = Math.max(2.5, b.w - ring * 2);
  const courtH = Math.max(2.5, b.h - ring * 2);
  const courtyard = rect(b.minX + (b.w - courtW) / 2, b.minY + (b.h - courtH) / 2, courtW, courtH);

  // Approximate hollow footprint as outer footprint minus courtyard area via U-shaped strips.
  const left = rect(b.minX, b.minY, ring, b.h);
  const right = rect(b.maxX - ring, b.minY, ring, b.h);
  const bottom = rect(b.minX + ring, b.minY, b.w - ring * 2, ring);
  const top = rect(b.minX + ring, b.maxY - ring, b.w - ring * 2, ring);

  return alternative(
    "B",
    "B · Patio interior",
    "courtyard",
    "Volumen en anillo con patio central para iluminación y ventilación.",
    envelope,
    [left, right, bottom, top],
    [courtyard],
    floors,
    floorToFloor,
  );
}

function buildCompactBar(envelope: BuildingEnvelope, floors: number, floorToFloor: number): MassingAlternative {
  const b = bounds(envelope.footprint_polygon);
  // Compact south-facing bar: 55% of envelope depth, full usable width, one fewer floor if possible.
  const barH = Math.max(6, b.h * 0.55);
  const bar = rect(b.minX, b.minY, b.w, barH);
  const compactFloors = Math.max(1, floors > 1 ? floors - 1 : floors);
  // If still over buildability, shrink width slightly.
  let mass = [bar];
  const probe = evaluateMetrics(envelope, mass, [], compactFloors, floorToFloor);
  if (probe.violations.some((v) => v.code === "exceeds_buildability")) {
    mass = [scaleAboutCenter(bar, 0.85)];
  }

  return alternative(
    "C",
    "C · Barra compacta",
    "compact_bar",
    "Barra más baja/estrecha: menos m²t, tipología lineal y patio/jardín residual al norte.",
    envelope,
    mass,
    [],
    compactFloors,
    floorToFloor,
  );
}

function resolveFloors(envelope: BuildingEnvelope, floorToFloor: number): number {
  if (envelope.metrics.max_floors !== null) {
    return Math.max(1, envelope.metrics.max_floors);
  }
  if (envelope.metrics.max_height_m !== null) {
    return Math.max(1, Math.floor(envelope.metrics.max_height_m / floorToFloor));
  }
  return 3;
}

export function generateMassingStudy(input: MassingGeneratorInput): MassingStudy {
  const floorToFloor = input.floor_to_floor_m ?? 3;
  const floors = resolveFloors(input.envelope, floorToFloor);
  const alternatives = [
    buildFullFill(input.envelope, floors, floorToFloor),
    buildCourtyard(input.envelope, floors, floorToFloor),
    buildCompactBar(input.envelope, floors, floorToFloor),
  ];

  // Prefer first fully compliant alternative; else A.
  const selected = alternatives.find((alt) => alt.is_within_envelope)?.key ?? "A";

  return {
    study_id: `mass-study-${input.envelope.envelope_id}`,
    envelope_id: input.envelope.envelope_id,
    urbanism_analysis_id: input.envelope.urbanism_analysis_id,
    generated_at: new Date().toISOString(),
    alternatives,
    selected_key: selected,
    disclaimer:
      "Massing paramétrico de comparación rápida. No es el modelo arquitectónico definitivo ni sustituye al BIM.",
  };
}

export function selectMassingAlternative(study: MassingStudy, key: "A" | "B" | "C"): MassingStudy {
  return { ...study, selected_key: key };
}
