import type { ArchitecturalModel } from "./architecturalModel";
import type { BuildingEnvelope, Point2 } from "./envelope";

export type Vec3 = { x: number; y: number; z: number };

export type RenderLayer = "plot" | "envelope" | "building" | "courtyard" | "core" | "roof";

export type RenderSolid = {
  id: string;
  source_object_id: string | null;
  layer: RenderLayer;
  /** Footprint in local meters (Y north-up). */
  polygon: Point2[];
  z0_m: number;
  z1_m: number;
  label: string;
};

/** Derived visualization scene — never the source of truth. */
export type RenderScene = {
  scene_id: string;
  model_id: string;
  envelope_id: string;
  generated_at: string;
  solids: RenderSolid[];
  bounds: { min: Vec3; max: Vec3 };
  disclaimer: string;
};

export type RenderPresetId = "clay" | "daylight_concept" | "dusk_concept";

export type RenderPreset = {
  id: RenderPresetId;
  label: string;
  description: string;
  sky: string;
  ground: string;
  building: string;
  envelope: string;
  plot: string;
  courtyard: string;
  core: string;
  roof: string;
  stroke: string;
};

export type RenderResolutionId = "720p" | "1080p" | "2k";

export type RenderResolution = {
  id: RenderResolutionId;
  label: string;
  width: number;
  height: number;
};

export type RenderCamera = {
  yaw_deg: number;
  pitch_deg: number;
  distance_m: number;
  target: Vec3;
  fov_deg: number;
  orthographic: boolean;
};

export type RenderJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type RenderEngine = "local_preview_v1" | "blender_optional";

export type RenderJob = {
  job_id: string;
  model_id: string;
  scene_id: string;
  status: RenderJobStatus;
  preset: RenderPresetId;
  resolution: RenderResolution;
  camera: RenderCamera;
  engine: RenderEngine;
  progress: number;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  preview_svg?: string | null;
  output_asset_id?: string | null;
  error?: string | null;
  blender_payload_available: boolean;
  disclaimer: string;
};

export type CreateRenderJobInput = {
  model: ArchitecturalModel;
  envelope: BuildingEnvelope;
  preset?: RenderPresetId;
  resolution?: RenderResolutionId;
  camera?: Partial<RenderCamera>;
  /** Prefer local preview (default). Blender remains optional and off-core. */
  engine?: RenderEngine;
};

export type ViewerLayerVisibility = Record<RenderLayer, boolean>;
