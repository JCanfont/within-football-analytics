/** Contract types for Urbanismo Engine API v1 (platform consumer only). */

export type ParameterStatus =
  | "confirmed"
  | "interpreted"
  | "manual_validated"
  | "conflict"
  | "unknown"
  | "not_applicable";

export type UrbanismErrorCode =
  | "parcel_not_found"
  | "source_unavailable"
  | "analysis_incomplete"
  | "rate_limited"
  | "internal_error";

export type SourceRef = {
  source_id: string;
  title: string;
  organism?: string;
  document_url?: string | null;
  article?: string | null;
  consulted_at?: string;
};

export type UrbanParameter = {
  key: string;
  label?: string;
  value: string | number | boolean | null;
  unit?: string | null;
  status: ParameterStatus;
  confidence: number;
  extraction_method?: string | null;
  source_refs?: SourceRef[];
};

export type UrbanismConflict = {
  code: string;
  message: string;
  parameter_keys?: string[];
};

export type UrbanismAnalyzeRequest = {
  request_id: string;
  api_version: "v1";
  cadastral_reference?: string | null;
  geometry?: Record<string, unknown> | null;
  coordinates?: {
    lon: number;
    lat: number;
    srid?: number;
  } | null;
};

export type UrbanismAnalysis = {
  analysis_id: string;
  api_version: string;
  parcel?: {
    cadastral_reference?: string | null;
    area_m2?: number | null;
  };
  municipality: string;
  classification?: string | null;
  qualification?: string | null;
  allowed_uses?: string[];
  parameters: UrbanParameter[];
  instruments?: Array<Record<string, unknown>>;
  sources: SourceRef[];
  conflicts: UrbanismConflict[];
  requires_human_review: boolean;
  overall_confidence: number;
  generated_at: string;
};

export type UrbanismJobAccepted = {
  job_id: string;
  status: string;
  poll_url?: string;
};

export type UrbanismError = {
  code: UrbanismErrorCode;
  message: string;
  retryable: boolean;
  detail?: Record<string, unknown>;
};

/** Scenario-side override: never written back to the Engine. */
export type ScenarioUrbanOverride = {
  parameter_key: string;
  value: string | number | boolean | null;
  unit?: string | null;
  note?: string;
  created_at: string;
};

export type DesignScenarioUrbanLink = {
  urbanism_analysis_id: string;
  api_version: string;
  generated_at: string;
  parameters_snapshot: UrbanParameter[];
  parameters_hash: string;
  overrides: ScenarioUrbanOverride[];
  envelope_id?: string | null;
  massing_study_id?: string | null;
  massing_selected_key?: "A" | "B" | "C" | null;
  architectural_model_id?: string | null;
  plan_set_id?: string | null;
  optimization_id?: string | null;
  optimization_objective?: string | null;
  optimization_recommended_key?: "A" | "B" | "C" | null;
  render_job_id?: string | null;
  render_scene_id?: string | null;
  structural_model_id?: string | null;
};
