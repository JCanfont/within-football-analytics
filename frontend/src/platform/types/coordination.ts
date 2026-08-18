import type { ArchitecturalModel } from "./architecturalModel";
import type { MepModel } from "./mep";
import type { StructuralModel } from "./structure";

export type ClashSeverity = "hard" | "soft" | "clearance";

export type ClashPairKind =
  | "pipe_beam"
  | "duct_beam"
  | "pipe_column"
  | "duct_column"
  | "pipe_structural_wall"
  | "duct_structural_wall"
  | "mep_structure_generic";

export type ClashIssue = {
  id: string;
  kind: ClashPairKind;
  severity: ClashSeverity;
  a_id: string;
  a_discipline: "STRUCT" | "MEP";
  a_name: string;
  b_id: string;
  b_discipline: "STRUCT" | "MEP";
  b_name: string;
  distance_m: number;
  tolerance_m: number;
  message: string;
};

export type ClashReport = {
  clash_report_id: string;
  architectural_model_id: string;
  structural_model_id: string;
  mep_model_id: string;
  generated_at: string;
  tolerances: ClashTolerances;
  issues: ClashIssue[];
  counts: { hard: number; soft: number; clearance: number; total: number };
  disclaimer: string;
};

export type ClashTolerances = {
  hard_m: number;
  soft_m: number;
  clearance_m: number;
};

export type QuantityUnit = "m" | "m2" | "m3" | "ud";

export type QuantityLine = {
  id: string;
  code: string;
  classification: string;
  description: string;
  source_discipline: "ARCH" | "STRUCT" | "MEP";
  unit: QuantityUnit;
  quantity: number;
  material?: string | null;
  source_object_ids: string[];
};

export type QuantityTakeoff = {
  takeoff_id: string;
  architectural_model_id: string;
  structural_model_id: string;
  mep_model_id: string;
  generated_at: string;
  lines: QuantityLine[];
  disclaimer: string;
};

export type PriceCatalogItem = {
  code: string;
  description: string;
  unit: QuantityUnit;
  unit_price_eur: number;
  chapter: string;
};

export type PriceCatalog = {
  catalog_id: string;
  version: string;
  currency: "EUR";
  items: PriceCatalogItem[];
};

export type BudgetLine = {
  id: string;
  code: string;
  chapter: string;
  description: string;
  unit: QuantityUnit;
  quantity: number;
  unit_price_eur: number;
  total_eur: number;
  quantity_line_id: string;
};

export type BudgetEstimate = {
  budget_id: string;
  catalog_id: string;
  catalog_version: string;
  currency: "EUR";
  generated_at: string;
  lines: BudgetLine[];
  chapter_totals: Array<{ chapter: string; total_eur: number }>;
  total_eur: number;
  disclaimer: string;
};

export type CoordinationPack = {
  coordination_id: string;
  architectural_model_id: string;
  structural_model_id: string;
  mep_model_id: string;
  generated_at: string;
  clash: ClashReport;
  takeoff: QuantityTakeoff;
  budget: BudgetEstimate;
  disclaimer: string;
};

export type CoordinationInput = {
  architecturalModel: ArchitecturalModel;
  structuralModel: StructuralModel;
  mepModel: MepModel;
  tolerances?: Partial<ClashTolerances>;
  catalog?: PriceCatalog;
};
