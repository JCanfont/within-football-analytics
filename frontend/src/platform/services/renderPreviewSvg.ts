import type { RenderCamera, RenderPresetId, RenderScene } from "../types/render";
import { collectProjectedFaces, facesToSvgPath } from "./renderProjector";
import { RENDER_PRESETS } from "./renderPresets";

export function renderSceneToSvg(
  scene: RenderScene,
  camera: RenderCamera,
  width: number,
  height: number,
  presetId: RenderPresetId,
): string {
  const colors = RENDER_PRESETS[presetId];
  const faces = collectProjectedFaces(scene, camera, width, height, colors);

  const paths = faces
    .map(
      (face) =>
        `<path d="${facesToSvgPath(face.points)}" fill="${face.fill}" fill-opacity="${face.opacity.toFixed(2)}" stroke="${face.stroke}" stroke-opacity="0.55" stroke-width="0.8" />`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Render preview">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${colors.sky}"/>
      <stop offset="100%" stop-color="${colors.ground}"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#sky)"/>
  ${paths}
  <text x="24" y="${height - 24}" fill="${colors.stroke}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="18" opacity="0.75">
    Preview local · ${presetId} · no fotorrealismo
  </text>
</svg>`;
}
