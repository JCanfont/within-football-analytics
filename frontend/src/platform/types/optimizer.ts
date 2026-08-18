import type { BuildingEnvelope } from "./envelope";
import type { MassingAlternative, MassingStudy, MassingViolation } from "./massing";

export type OptimizerObjective =
  | "maximize_gfa"
  | "maximize_courtyard"
  | "minimize_height"
  | "maximize_compliance"
  | "balanced";

export type OptimizerObjectiveMeta = {
  id: OptimizerObjective;
  label: string;
  description: string;
};

export type OptimizerCandidate = {
  id: string;
  source_massing_key: "A" | "B" | "C";
  label: string;
  massing: MassingAlternative;
  score: number;
  objective_scores: Record<OptimizerObjective, number>;
  hard_violation_count: number;
  violations: MassingViolation[];
  notes: string[];
};

export type OptimizationResult = {
  optimization_id: string;
  envelope_id: string;
  urbanism_analysis_id: string;
  massing_study_id: string;
  objective: OptimizerObjective;
  generated_at: string;
  candidates: OptimizerCandidate[];
  recommended_id: string;
  recommended_massing_key: "A" | "B" | "C";
  method: "weighted_scoring_v1";
  disclaimer: string;
};

export type DesignOptimizerInput = {
  envelope: BuildingEnvelope;
  massingStudy: MassingStudy;
  objective?: OptimizerObjective;
  /** When true, candidates with hard urbanistic violations are heavily penalized. */
  prefer_compliant?: boolean;
};
