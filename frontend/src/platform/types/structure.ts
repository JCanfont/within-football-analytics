import type { ArchitecturalModel } from "./architecturalModel";
import type { Point2 } from "./envelope";

/** Preliminary structural geometry — not a signed calculation. */
export type StructuralElementType =
  | "Column"
  | "Beam"
  | "StructuralWall"
  | "StructuralSlab"
  | "Foundation"
  | "Opening";

export type StructuralElement = {
  id: string;
  type: StructuralElementType;
  discipline: "STRUCT";
  name: string;
  /** Coordinated link to ARCH semantic object when applicable. */
  host_arch_object_id: string | null;
  storey_index: number | null;
  /** Axis or footprint in local meters. */
  polygon: Point2[];
  level_elevation_m: number;
  height_m: number | null;
  thickness_m: number | null;
  width_m: number | null;
  depth_m: number | null;
  length_m: number | null;
  material_hint: "reinforced_concrete_prelim" | "unknown";
  properties: Record<string, string | number | boolean | null>;
};

export type StructuralModel = {
  structural_model_id: string;
  schema: "platform-struct-v1";
  architectural_model_id: string;
  urbanism_analysis_id: string;
  generated_at: string;
  units: "meters";
  grid_spacing_m: number;
  elements: StructuralElement[];
  counts: Record<StructuralElementType, number>;
  /** Explicit non-claim: geometry only. */
  is_preliminary: true;
  is_signed_calculation: false;
  disclaimer: string;
};

export type StructureGeneratorInput = {
  architecturalModel: ArchitecturalModel;
  /** Target bay spacing for preliminary column grid. */
  grid_spacing_m?: number;
  column_section_m?: number;
  beam_width_m?: number;
  beam_depth_m?: number;
  foundation_pad_m?: number;
};
