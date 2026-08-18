import type { Point2 } from "./envelope";
import type { MassingAlternative } from "./massing";

/** Future-ready discipline tags (P4 Architecture only for now). */
export type ModelDiscipline =
  | "ARCH"
  | "STRUCT"
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
  | "MEP_FIRE";

export type SemanticObjectType =
  | "Site"
  | "Building"
  | "Storey"
  | "Space"
  | "Wall"
  | "Slab"
  | "Roof"
  | "Door"
  | "Window"
  | "Stair"
  | "Core"
  | "Terrace"
  | "ParkingSpace"
  | "Shaft";

export type SemanticObject = {
  id: string;
  type: SemanticObjectType;
  name: string;
  discipline: ModelDiscipline;
  parent_id: string | null;
  storey_index?: number | null;
  /** Footprint / axis polyline in meters (local CRS). */
  polygon?: Point2[];
  /** Extrusion / thickness in meters when applicable. */
  height_m?: number | null;
  thickness_m?: number | null;
  area_m2?: number | null;
  level_elevation_m?: number | null;
  properties: Record<string, string | number | boolean | null>;
};

export type ArchitecturalModel = {
  model_id: string;
  schema: "platform-arch-v1";
  urbanism_analysis_id: string;
  envelope_id: string;
  massing_alternative_id: string;
  massing_key: "A" | "B" | "C";
  generated_at: string;
  units: "meters";
  /** Semantic source of truth (mesh/viewer are derivatives). */
  objects: SemanticObject[];
  storey_count: number;
  gross_floor_area_m2: number;
  disclaimer: string;
};

export type ArchitecturalModelInput = {
  urbanism_analysis_id: string;
  envelope_id: string;
  plot_polygon: Point2[];
  massing: MassingAlternative;
  wall_thickness_m?: number;
  slab_thickness_m?: number;
};
