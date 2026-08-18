import type { RenderPreset, RenderPresetId, RenderResolution, RenderResolutionId } from "../types/render";

export const RENDER_PRESETS: Record<RenderPresetId, RenderPreset> = {
  clay: {
    id: "clay",
    label: "Clay",
    description: "Volumen neutro para lectura tipológica.",
    sky: "#e8eef5",
    ground: "#d7d2c8",
    building: "#c4b8a8",
    envelope: "#94a3b8",
    plot: "#cbd5e1",
    courtyard: "#d9e7c2",
    core: "#a89888",
    roof: "#b0a090",
    stroke: "#4b5563",
  },
  daylight_concept: {
    id: "daylight_concept",
    label: "Daylight concept",
    description: "Concepto diurno (preview local, no fotorrealismo).",
    sky: "#cfe4f7",
    ground: "#c5d4b0",
    building: "#8fa9b5",
    envelope: "#64748b",
    plot: "#b7c4a1",
    courtyard: "#e5f0c8",
    core: "#6f8794",
    roof: "#6d8490",
    stroke: "#334155",
  },
  dusk_concept: {
    id: "dusk_concept",
    label: "Dusk concept",
    description: "Concepto atardecer (preview local, no fotorrealismo).",
    sky: "#f0c9a8",
    ground: "#8a7a68",
    building: "#5c6d7a",
    envelope: "#475569",
    plot: "#6b6358",
    courtyard: "#7f8f5d",
    core: "#3f4f5a",
    roof: "#364652",
    stroke: "#1f2937",
  },
};

export const RENDER_RESOLUTIONS: Record<RenderResolutionId, RenderResolution> = {
  "720p": { id: "720p", label: "720p", width: 1280, height: 720 },
  "1080p": { id: "1080p", label: "1080p", width: 1920, height: 1080 },
  "2k": { id: "2k", label: "2K", width: 2560, height: 1440 },
};

export function listRenderPresets(): RenderPreset[] {
  return Object.values(RENDER_PRESETS);
}

export function listRenderResolutions(): RenderResolution[] {
  return Object.values(RENDER_RESOLUTIONS);
}
