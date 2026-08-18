import type { ArchitecturalModel, ModelDiscipline } from "./architecturalModel";
import type { Point2 } from "./envelope";

export type MepSystem =
  | "electrical"
  | "lighting"
  | "plumbing"
  | "drainage"
  | "dhw"
  | "hvac_heating"
  | "hvac_cooling"
  | "ventilation"
  | "gas"
  | "telecom"
  | "fire";

export type MepElementType =
  | "Equipment"
  | "Terminal"
  | "Pipe"
  | "Duct"
  | "CableTray"
  | "Cable"
  | "Connection"
  | "Circuit"
  | "Shaft";

export type MepElement = {
  id: string;
  type: MepElementType;
  system: MepSystem;
  discipline: Extract<
    ModelDiscipline,
    | "MEP_ELECTRICAL"
    | "MEP_LIGHTING"
    | "MEP_PLUMBING"
    | "MEP_DRAINAGE"
    | "MEP_DHW"
    | "MEP_HVAC_HEATING"
    | "MEP_HVAC_COOLING"
    | "MEP_VENTILATION"
    | "MEP_GAS"
    | "MEP_TELECOM"
    | "MEP_FIRE"
  >;
  name: string;
  host_arch_object_id: string | null;
  storey_index: number | null;
  /** Route / footprint in local meters. */
  path: Point2[];
  level_elevation_m: number;
  diameter_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  length_m: number | null;
  circuit_id: string | null;
  properties: Record<string, string | number | boolean | null>;
};

export type MepModel = {
  mep_model_id: string;
  schema: "platform-mep-v1";
  architectural_model_id: string;
  urbanism_analysis_id: string;
  generated_at: string;
  units: "meters";
  elements: MepElement[];
  counts: Record<MepElementType, number>;
  systems_present: MepSystem[];
  is_preliminary: true;
  is_sized_design: false;
  disclaimer: string;
};

export type MepGeneratorInput = {
  architecturalModel: ArchitecturalModel;
};
