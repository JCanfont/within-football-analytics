import type { SourceRef, UrbanParameter } from "./urbanismContract";

export type Point2 = { x: number; y: number };

export type EnvelopeConstraint = {
  id: string;
  kind:
    | "setback_front"
    | "setback_side"
    | "setback_rear"
    | "occupation"
    | "buildability"
    | "max_height"
    | "max_floors"
    | "plot_geometry";
  label: string;
  applied_value: number | string | null;
  unit?: string | null;
  /** True when the constraint limited the resulting geometry/metrics. */
  is_limiting: boolean;
  urban_parameter_key: string | null;
  urban_parameter?: UrbanParameter | null;
  source_refs: SourceRef[];
  note?: string;
};

export type EnvelopeMetrics = {
  plot_area_m2: number;
  setback_area_m2: number;
  footprint_area_m2: number;
  occupation_used: number | null;
  occupation_allowed: number | null;
  buildable_area_m2_allowed: number | null;
  buildable_area_m2_from_footprint_x_floors: number | null;
  max_height_m: number | null;
  max_floors: number | null;
  limiting_rule_ids: string[];
};

export type BuildingEnvelope = {
  envelope_id: string;
  urbanism_analysis_id: string;
  api_version: string;
  generated_at: string;
  /** Plot polygon in local meters (Y north-up). */
  plot_polygon: Point2[];
  /** Buildable footprint after setbacks + occupation. */
  footprint_polygon: Point2[];
  extrude_height_m: number | null;
  metrics: EnvelopeMetrics;
  constraints: EnvelopeConstraint[];
  warnings: string[];
  /** Envelope is not the final building. */
  disclaimer: string;
};

export type EnvelopeGeneratorInput = {
  urbanism_analysis_id: string;
  api_version: string;
  parameters: UrbanParameter[];
  /** Optional cadastral/plot polygon in meters. If omitted, a rectangle is derived from area. */
  plot_polygon?: Point2[];
  plot_area_m2?: number | null;
  /** Aspect ratio width/depth when synthesizing a rectangular plot. */
  plot_aspect_ratio?: number;
};
