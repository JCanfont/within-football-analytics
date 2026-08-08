import type { Point2 } from "../types/envelope";
import type { RenderCamera, RenderPreset, RenderSolid, Vec3 } from "../types/render";
import { sceneCentroid, sceneExtent } from "./renderSceneBuilder";
import type { RenderScene } from "../types/render";

export type ProjectedPoint = { x: number; y: number; depth: number };

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function projectPoint(
  point: Vec3,
  camera: RenderCamera,
  width: number,
  height: number,
  extent: number,
): ProjectedPoint {
  const yaw = degToRad(camera.yaw_deg);
  const pitch = degToRad(camera.pitch_deg);
  const dx = point.x - camera.target.x;
  const dy = point.y - camera.target.y;
  const dz = point.z - camera.target.z;

  const x1 = dx * Math.cos(yaw) - dy * Math.sin(yaw);
  const y1 = dx * Math.sin(yaw) + dy * Math.cos(yaw);
  const z1 = dz;

  const y2 = y1 * Math.cos(pitch) - z1 * Math.sin(pitch);
  const z2 = y1 * Math.sin(pitch) + z1 * Math.cos(pitch);

  const distance = Math.max(camera.distance_m, extent * 0.8);
  let scale: number;
  if (camera.orthographic) {
    scale = Math.min(width, height) / (extent * 1.8);
  } else {
    const fov = degToRad(Math.max(20, Math.min(90, camera.fov_deg)));
    const perspective = distance / Math.max(distance - z2, distance * 0.35);
    scale = (Math.min(width, height) / (2 * Math.tan(fov / 2) * distance)) * perspective * extent * 0.55;
  }

  return {
    x: width / 2 + x1 * scale,
    y: height / 2 - y2 * scale,
    depth: z2,
  };
}

type Face = {
  points: ProjectedPoint[];
  depth: number;
  fill: string;
  stroke: string;
  opacity: number;
};

function extrudedFaces(solid: RenderSolid, camera: RenderCamera, width: number, height: number, extent: number, colors: RenderPreset): Face[] {
  const fill =
    solid.layer === "plot"
      ? colors.plot
      : solid.layer === "envelope"
        ? colors.envelope
        : solid.layer === "courtyard"
          ? colors.courtyard
          : solid.layer === "core"
            ? colors.core
            : solid.layer === "roof"
              ? colors.roof
              : colors.building;

  const opacity =
    solid.layer === "envelope" ? 0.22 : solid.layer === "plot" ? 0.55 : solid.layer === "courtyard" ? 0.45 : 0.92;

  const bottom = solid.polygon.map((p) =>
    projectPoint({ x: p.x, y: p.y, z: solid.z0_m }, camera, width, height, extent),
  );
  const top = solid.polygon.map((p) =>
    projectPoint({ x: p.x, y: p.y, z: solid.z1_m }, camera, width, height, extent),
  );

  const faces: Face[] = [];
  const avgDepth = (pts: ProjectedPoint[]) => pts.reduce((s, p) => s + p.depth, 0) / Math.max(pts.length, 1);

  faces.push({
    points: bottom,
    depth: avgDepth(bottom) - 0.01,
    fill,
    stroke: colors.stroke,
    opacity: opacity * 0.7,
  });
  faces.push({
    points: top,
    depth: avgDepth(top) + 0.01,
    fill,
    stroke: colors.stroke,
    opacity,
  });

  for (let i = 0; i < solid.polygon.length; i += 1) {
    const j = (i + 1) % solid.polygon.length;
    const wall = [bottom[i]!, bottom[j]!, top[j]!, top[i]!];
    faces.push({
      points: wall,
      depth: avgDepth(wall),
      fill,
      stroke: colors.stroke,
      opacity: opacity * 0.85,
    });
  }

  return faces;
}

export function collectProjectedFaces(
  scene: RenderScene,
  camera: RenderCamera,
  width: number,
  height: number,
  colors: RenderPreset,
  visibleLayers: Partial<Record<RenderSolid["layer"], boolean>> = {},
): Face[] {
  const extent = sceneExtent(scene);
  const faces: Face[] = [];
  for (const solid of scene.solids) {
    if (visibleLayers[solid.layer] === false) continue;
    faces.push(...extrudedFaces(solid, camera, width, height, extent, colors));
  }
  faces.sort((a, b) => a.depth - b.depth);
  return faces;
}

export function facesToSvgPath(points: ProjectedPoint[]): string {
  return points
    .map((p, index) => `${index === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ")
    .concat(" Z");
}

export function defaultCameraForScene(scene: RenderScene): RenderCamera {
  const center = sceneCentroid(scene);
  const extent = sceneExtent(scene);
  return {
    yaw_deg: 38,
    pitch_deg: 28,
    distance_m: extent * 2.4,
    target: center,
    fov_deg: 42,
    orthographic: false,
  };
}

export function polygonCentroid2(points: Point2[]): Point2 {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}
