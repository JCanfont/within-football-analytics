import type { BuildingEnvelope, Point2 } from "./envelope";

export type MassingStrategy = "full_fill" | "courtyard" | "compact_bar";

export type MassingViolation = {
  code: "exceeds_occupation" | "exceeds_buildability" | "exceeds_height" | "exceeds_floors" | "outside_envelope";
  message: string;
};

export type MassingMetrics = {
  floors: number;
  floor_to_floor_m: number;
  height_m: number;
  footprint_area_m2: number;
  courtyard_area_m2: number;
  gross_floor_area_m2: number;
  occupation_used: number | null;
  buildability_used_ratio: number | null;
  envelope_fill_ratio: number;
};

export type MassingAlternative = {
  id: string;
  key: "A" | "B" | "C";
  label: string;
  strategy: MassingStrategy;
  summary: string;
  /** Building mass footprint(s) inside the envelope. */
  mass_polygons: Point2[][];
  /** Optional courtyard / patio polygons. */
  courtyard_polygons: Point2[][];
  floors: number;
  floor_to_floor_m: number;
  height_m: number;
  metrics: MassingMetrics;
  violations: MassingViolation[];
  is_within_envelope: boolean;
};

export type MassingStudy = {
  study_id: string;
  envelope_id: string;
  urbanism_analysis_id: string;
  generated_at: string;
  alternatives: MassingAlternative[];
  selected_key: "A" | "B" | "C";
  disclaimer: string;
};

export type MassingGeneratorInput = {
  envelope: BuildingEnvelope;
  /** Target floor-to-floor height in meters. */
  floor_to_floor_m?: number;
};
