import type {
  BuildingEnvelope,
  EnvelopeConstraint,
  EnvelopeGeneratorInput,
  Point2,
} from "../types/envelope";
import type { UrbanParameter } from "../types/urbanismContract";

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

function rectPolygon(width: number, depth: number): Point2[] {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: depth },
    { x: 0, y: depth },
  ];
}

function insetRect(width: number, depth: number, front: number, rear: number, side: number): Point2[] | null {
  const x0 = side;
  const x1 = width - side;
  const y0 = rear;
  const y1 = depth - front;
  if (x1 - x0 <= 0.2 || y1 - y0 <= 0.2) {
    return null;
  }
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

function scalePolygonAroundCentroid(points: Point2[], factor: number): Point2[] {
  if (points.length === 0 || factor >= 0.999) {
    return points.map((p) => ({ ...p }));
  }
  const cx = points.reduce((acc, p) => acc + p.x, 0) / points.length;
  const cy = points.reduce((acc, p) => acc + p.y, 0) / points.length;
  return points.map((p) => ({
    x: cx + (p.x - cx) * factor,
    y: cy + (p.y - cy) * factor,
  }));
}

function findParam(parameters: UrbanParameter[], key: string): UrbanParameter | undefined {
  return parameters.find((parameter) => parameter.key === key);
}

function usableNumber(parameter: UrbanParameter | undefined): number | null {
  if (!parameter) {
    return null;
  }
  if (
    parameter.status === "unknown" ||
    parameter.status === "not_applicable" ||
    parameter.status === "conflict" ||
    parameter.value === null ||
    parameter.value === undefined
  ) {
    return null;
  }
  if (typeof parameter.value === "number" && Number.isFinite(parameter.value)) {
    return parameter.value;
  }
  if (typeof parameter.value === "string") {
    const parsed = Number(parameter.value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Parse values like "PB+4", "PB+3", "5" into storey count. */
export function parseMaxFloors(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.round(value));
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().toUpperCase();
  const pbPlus = trimmed.match(/^PB\s*\+\s*(\d+)$/);
  if (pbPlus) {
    return 1 + Number(pbPlus[1]);
  }
  const plain = trimmed.match(/^\d+$/);
  if (plain) {
    return Number(plain[0]);
  }
  return null;
}

function constraintFromParam(
  id: string,
  kind: EnvelopeConstraint["kind"],
  label: string,
  applied: number | string | null,
  unit: string | null | undefined,
  parameter: UrbanParameter | undefined,
  isLimiting: boolean,
  note?: string,
): EnvelopeConstraint {
  return {
    id,
    kind,
    label,
    applied_value: applied,
    unit,
    is_limiting: isLimiting,
    urban_parameter_key: parameter?.key ?? null,
    urban_parameter: parameter ?? null,
    source_refs: parameter?.source_refs ?? [],
    note,
  };
}

export function generateBuildingEnvelope(input: EnvelopeGeneratorInput): BuildingEnvelope {
  const warnings: string[] = [];
  const constraints: EnvelopeConstraint[] = [];
  const params = input.parameters;

  const occupationParam = findParam(params, "occupation");
  const buildabilityParam = findParam(params, "buildability");
  const heightParam = findParam(params, "max_height_m");
  const floorsParam = findParam(params, "max_floors");
  const frontParam = findParam(params, "setback_front_m");
  const sideParam = findParam(params, "setback_side_m") ?? frontParam;
  const rearParam = findParam(params, "setback_rear_m") ?? frontParam;

  const occupation = usableNumber(occupationParam);
  const buildability = usableNumber(buildabilityParam);
  const maxHeight = usableNumber(heightParam);
  const maxFloors =
    floorsParam && floorsParam.status !== "unknown" && floorsParam.status !== "conflict"
      ? parseMaxFloors(floorsParam.value)
      : null;
  const setbackFront = usableNumber(frontParam);
  const setbackSide = usableNumber(sideParam);
  const setbackRear = usableNumber(rearParam);

  if (!occupationParam || occupationParam.status === "unknown") {
    warnings.push("Ocupación unknown: no se aplica ratio de ocupación (no se convierte a 0).");
  }
  if (!buildabilityParam || buildabilityParam.status === "unknown") {
    warnings.push("Edificabilidad unknown: no se fuerza un techo de m²t.");
  }
  if (heightParam?.status === "conflict" || floorsParam?.status === "conflict") {
    warnings.push("Hay conflicto en altura/plantas: la extrusión se marca provisional.");
  }

  let plot = input.plot_polygon?.map((p) => ({ ...p }));
  let plotArea = input.plot_area_m2 ?? (plot ? polygonArea(plot) : null);

  if (!plot) {
    const area = plotArea && plotArea > 10 ? plotArea : 400;
    const ratio = input.plot_aspect_ratio ?? 1.35;
    const depth = Math.sqrt(area / ratio);
    const width = area / depth;
    plot = rectPolygon(round2(width), round2(depth));
    plotArea = round2(polygonArea(plot));
    constraints.push(
      constraintFromParam(
        "c-plot-synth",
        "plot_geometry",
        "Geometría de parcela sintetizada",
        round2(area),
        "m2",
        undefined,
        true,
        "Sin polígono catastral: rectángulo derivado del área (provisional).",
      ),
    );
    warnings.push("Parcela rectangular sintetizada: sustituir por geometría catastral real cuando exista.");
  } else {
    plotArea = round2(polygonArea(plot));
    constraints.push(
      constraintFromParam(
        "c-plot-input",
        "plot_geometry",
        "Geometría de parcela de entrada",
        plotArea,
        "m2",
        undefined,
        false,
      ),
    );
  }

  const width = Math.max(...plot.map((p) => p.x)) - Math.min(...plot.map((p) => p.x));
  const depth = Math.max(...plot.map((p) => p.y)) - Math.min(...plot.map((p) => p.y));

  const front = setbackFront ?? 0;
  const side = setbackSide ?? 0;
  const rear = setbackRear ?? 0;

  let footprint = insetRect(width, depth, front, rear, side);
  const setbacksApplied = setbackFront !== null || setbackSide !== null || setbackRear !== null;
  if (!footprint) {
    warnings.push("Los retranqueos dejan la huella inviables; se usa un núcleo mínimo de comprobación.");
    footprint = insetRect(width, depth, Math.min(front, depth * 0.2), Math.min(rear, depth * 0.2), Math.min(side, width * 0.2)) ??
      rectPolygon(Math.max(2, width * 0.3), Math.max(2, depth * 0.3));
  }

  let footprintArea = round2(polygonArea(footprint));
  const areaAfterSetbacks = footprintArea;

  let occupationLimiting = false;
  if (occupation !== null && plotArea && occupation > 0) {
    const maxFootprint = plotArea * occupation;
    if (footprintArea > maxFootprint + 0.01) {
      const factor = Math.sqrt(maxFootprint / footprintArea);
      footprint = scalePolygonAroundCentroid(footprint, factor);
      footprintArea = round2(polygonArea(footprint));
      occupationLimiting = true;
    }
  }

  constraints.push(
    constraintFromParam(
      "c-setback-front",
      "setback_front",
      "Retranqueo frontal",
      setbackFront,
      "m",
      frontParam,
      setbacksApplied && setbackFront !== null,
      setbackFront === null ? "No aplicado: parámetro ausente/unknown/conflict." : undefined,
    ),
    constraintFromParam(
      "c-setback-side",
      "setback_side",
      "Retranqueo lateral",
      setbackSide,
      "m",
      sideParam,
      setbacksApplied && setbackSide !== null,
      !findParam(params, "setback_side_m") && setbackSide !== null
        ? "Lateral no declarado: se reutiliza setback_front_m como hipótesis de escenario."
        : undefined,
    ),
    constraintFromParam(
      "c-setback-rear",
      "setback_rear",
      "Retranqueo posterior",
      setbackRear,
      "m",
      rearParam,
      setbacksApplied && setbackRear !== null,
      !findParam(params, "setback_rear_m") && setbackRear !== null
        ? "Posterior no declarado: se reutiliza setback_front_m como hipótesis de escenario."
        : undefined,
    ),
    constraintFromParam(
      "c-occupation",
      "occupation",
      "Ocupación máxima",
      occupation,
      "ratio",
      occupationParam,
      occupationLimiting,
    ),
  );

  const floorsForCap = maxFloors;
  const buildableFromFootprint =
    floorsForCap !== null ? round2(footprintArea * floorsForCap) : null;
  const buildableAllowed =
    buildability !== null && plotArea !== null ? round2(plotArea * buildability) : null;

  let buildabilityLimiting = false;
  if (
    buildableAllowed !== null &&
    buildableFromFootprint !== null &&
    buildableFromFootprint > buildableAllowed + 0.01 &&
    floorsForCap &&
    floorsForCap > 0
  ) {
    // Reduce footprint so footprint * floors <= buildability cap.
    const targetFootprint = buildableAllowed / floorsForCap;
    if (targetFootprint < footprintArea) {
      const factor = Math.sqrt(targetFootprint / footprintArea);
      footprint = scalePolygonAroundCentroid(footprint, factor);
      footprintArea = round2(polygonArea(footprint));
      buildabilityLimiting = true;
    }
  }

  constraints.push(
    constraintFromParam(
      "c-buildability",
      "buildability",
      "Edificabilidad",
      buildability,
      "m2t/m2s",
      buildabilityParam,
      buildabilityLimiting,
    ),
    constraintFromParam(
      "c-max-floors",
      "max_floors",
      "Plantas máximas",
      maxFloors,
      "plantas",
      floorsParam,
      maxFloors !== null,
    ),
    constraintFromParam(
      "c-max-height",
      "max_height",
      "Altura máxima",
      maxHeight,
      "m",
      heightParam,
      maxHeight !== null,
    ),
  );

  const limiting = constraints.filter((constraint) => constraint.is_limiting).map((c) => c.id);
  const extrudeHeight =
    maxHeight !== null
      ? maxHeight
      : maxFloors !== null
        ? round2(maxFloors * 3.0)
        : null;

  const metricsBuildableFromFootprint =
    maxFloors !== null ? round2(footprintArea * maxFloors) : null;

  return {
    envelope_id: `env-${input.urbanism_analysis_id}`,
    urbanism_analysis_id: input.urbanism_analysis_id,
    api_version: input.api_version,
    generated_at: new Date().toISOString(),
    plot_polygon: plot.map((p) => ({ x: round2(p.x), y: round2(p.y) })),
    footprint_polygon: footprint.map((p) => ({ x: round2(p.x), y: round2(p.y) })),
    extrude_height_m: extrudeHeight,
    metrics: {
      plot_area_m2: round2(plotArea ?? 0),
      setback_area_m2: round2((plotArea ?? 0) - areaAfterSetbacks),
      footprint_area_m2: footprintArea,
      occupation_used: plotArea ? round2(footprintArea / plotArea) : null,
      occupation_allowed: occupation,
      buildable_area_m2_allowed: buildableAllowed,
      buildable_area_m2_from_footprint_x_floors: metricsBuildableFromFootprint,
      max_height_m: maxHeight,
      max_floors: maxFloors,
      limiting_rule_ids: limiting,
    },
    constraints,
    warnings,
    disclaimer:
      "La envolvente no es el edificio definitivo: es el volumen/huella máximo derivado de parámetros urbanísticos trazables.",
  };
}
