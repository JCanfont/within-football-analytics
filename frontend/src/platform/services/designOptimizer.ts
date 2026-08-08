import type { MassingAlternative } from "../types/massing";
import type {
  DesignOptimizerInput,
  OptimizationResult,
  OptimizerCandidate,
  OptimizerObjective,
  OptimizerObjectiveMeta,
} from "../types/optimizer";

const OBJECTIVES: OptimizerObjectiveMeta[] = [
  {
    id: "maximize_gfa",
    label: "Maximizar edificabilidad",
    description: "Prioriza el aprovechamiento del techo edificable (GFA).",
  },
  {
    id: "maximize_courtyard",
    label: "Maximizar patio",
    description: "Prioriza tipologías con patio o menor ocupación en planta.",
  },
  {
    id: "minimize_height",
    label: "Minimizar altura",
    description: "Prioriza menor altura y menos plantas, manteniendo aprovechamiento razonable.",
  },
  {
    id: "maximize_compliance",
    label: "Maximizar cumplimiento",
    description: "Prioriza alternativas sin incumplimientos urbanísticos.",
  },
  {
    id: "balanced",
    label: "Equilibrio",
    description: "Compromiso entre GFA, patio, altura y cumplimiento.",
  },
];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function footprintPerimeter(alt: MassingAlternative): number {
  let total = 0;
  for (const poly of alt.mass_polygons) {
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      total += Math.hypot(b.x - a.x, b.y - a.y);
    }
  }
  return total;
}

/** Compacidad: 4πA / P² ≈ 1 para círculo; para rectángulos altos valores son mejores. */
function compactnessScore(alt: MassingAlternative): number {
  const area = Math.max(alt.metrics.footprint_area_m2, 1e-6);
  const perimeter = Math.max(footprintPerimeter(alt), 1e-6);
  return clamp01((4 * Math.PI * area) / (perimeter * perimeter) / 0.785); // normalize ~square≈1
}

function scoreDimensions(alt: MassingAlternative, maxGfa: number, maxHeight: number) {
  const gfa = clamp01(alt.metrics.gross_floor_area_m2 / Math.max(maxGfa, 1));
  const courtyard = clamp01(alt.metrics.courtyard_area_m2 / Math.max(alt.metrics.footprint_area_m2, 1));
  const heightInv = 1 - clamp01(alt.height_m / Math.max(maxHeight, 1));
  const compliance = alt.violations.length === 0 ? 1 : clamp01(1 - alt.violations.length * 0.35);
  const compact = compactnessScore(alt);
  const fill = clamp01(alt.metrics.envelope_fill_ratio);

  return {
    maximize_gfa: clamp01(gfa * 0.75 + fill * 0.25),
    maximize_courtyard: clamp01(courtyard * 0.7 + (1 - fill) * 0.15 + gfa * 0.15),
    minimize_height: clamp01(heightInv * 0.65 + gfa * 0.25 + compact * 0.1),
    maximize_compliance: clamp01(compliance * 0.8 + gfa * 0.2),
    balanced: clamp01(gfa * 0.35 + courtyard * 0.2 + heightInv * 0.15 + compliance * 0.2 + compact * 0.1),
  } satisfies Record<OptimizerObjective, number>;
}

function primaryScore(
  objectiveScores: Record<OptimizerObjective, number>,
  objective: OptimizerObjective,
  preferCompliant: boolean,
  violationCount: number,
): number {
  let score = objectiveScores[objective];
  if (preferCompliant && violationCount > 0) {
    score *= 0.2;
  }
  return Math.round(score * 1000) / 1000;
}

function buildNotes(
  alt: MassingAlternative,
  objective: OptimizerObjective,
  objectiveScores: Record<OptimizerObjective, number>,
): string[] {
  const notes: string[] = [
    `Puntuación objetivo (${objective}): ${(objectiveScores[objective] * 100).toFixed(1)}%.`,
    `GFA ${alt.metrics.gross_floor_area_m2.toFixed(1)} m² · patio ${alt.metrics.courtyard_area_m2.toFixed(1)} m² · altura ${alt.height_m.toFixed(1)} m.`,
  ];
  if (alt.violations.length === 0) {
    notes.push("Sin incumplimientos urbanísticos detectados.");
  } else {
    notes.push(`${alt.violations.length} incumplimiento(s): ${alt.violations.map((v) => v.code).join(", ")}.`);
  }
  if (alt.strategy === "courtyard") {
    notes.push("Tipología con patio interior.");
  }
  if (alt.strategy === "compact_bar") {
    notes.push("Barra compacta: menor envolvente relativa.");
  }
  return notes;
}

export function listOptimizerObjectives(): OptimizerObjectiveMeta[] {
  return OBJECTIVES.map((item) => ({ ...item }));
}

/**
 * DesignOptimizer: ranking matemático de alternativas de massing A/B/C.
 * No usa LLM como motor geométrico; opera solo sobre métricas ya validadas.
 */
export function optimizeDesign(input: DesignOptimizerInput): OptimizationResult {
  const objective = input.objective ?? "balanced";
  const preferCompliant = input.prefer_compliant ?? true;
  const { envelope, massingStudy } = input;

  if (massingStudy.alternatives.length === 0) {
    throw new Error("DesignOptimizer: no hay alternativas de massing para evaluar");
  }

  const maxGfa = Math.max(...massingStudy.alternatives.map((a) => a.metrics.gross_floor_area_m2), 1);
  const maxHeight = Math.max(
    ...massingStudy.alternatives.map((a) => a.height_m),
    envelope.metrics.max_height_m ?? 1,
    1,
  );

  const candidates: OptimizerCandidate[] = massingStudy.alternatives.map((alt) => {
    const objective_scores = scoreDimensions(alt, maxGfa, maxHeight);
    const score = primaryScore(objective_scores, objective, preferCompliant, alt.violations.length);
    return {
      id: `opt-cand-${alt.key}`,
      source_massing_key: alt.key,
      label: alt.label,
      massing: alt,
      score,
      objective_scores,
      hard_violation_count: alt.violations.length,
      violations: [...alt.violations],
      notes: buildNotes(alt, objective, objective_scores),
    };
  });

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.source_massing_key.localeCompare(b.source_massing_key);
  });

  const recommended = candidates[0]!;
  const meta = OBJECTIVES.find((o) => o.id === objective)!;

  return {
    optimization_id: `opt-${massingStudy.study_id}-${objective}`,
    envelope_id: envelope.envelope_id,
    urbanism_analysis_id: massingStudy.urbanism_analysis_id,
    massing_study_id: massingStudy.study_id,
    objective,
    generated_at: new Date().toISOString(),
    candidates,
    recommended_id: recommended.id,
    recommended_massing_key: recommended.source_massing_key,
    method: "weighted_scoring_v1",
    disclaimer: `DesignOptimizer (${meta.label}): ranking matemático ponderado; no sustituye el criterio del proyectista ni la validación normativa oficial.`,
  };
}
