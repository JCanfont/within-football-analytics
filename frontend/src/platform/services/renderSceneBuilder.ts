import type { ArchitecturalModel, SemanticObject } from "../types/architecturalModel";
import type { BuildingEnvelope, Point2 } from "../types/envelope";
import type { RenderScene, RenderSolid, Vec3 } from "../types/render";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function solidFromObject(
  object: SemanticObject,
  layer: RenderSolid["layer"],
  z0: number,
  z1: number,
): RenderSolid | null {
  if (!object.polygon || object.polygon.length < 3) {
    return null;
  }
  return {
    id: `solid-${object.id}`,
    source_object_id: object.id,
    layer,
    polygon: object.polygon,
    z0_m: round2(z0),
    z1_m: round2(Math.max(z1, z0 + 0.05)),
    label: object.name,
  };
}

function computeBounds(solids: RenderSolid[]): { min: Vec3; max: Vec3 } {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const solid of solids) {
    minZ = Math.min(minZ, solid.z0_m);
    maxZ = Math.max(maxZ, solid.z1_m);
    for (const point of solid.polygon) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
  }

  if (!Number.isFinite(minX)) {
    return { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } };
  }

  return {
    min: { x: round2(minX), y: round2(minY), z: round2(minZ) },
    max: { x: round2(maxX), y: round2(maxY), z: round2(maxZ) },
  };
}

/**
 * Builds a derived render/viewer scene from the parametric ARCH model.
 * The semantic model remains the source of truth; this mesh is disposable.
 */
export function buildRenderSceneFromModel(
  model: ArchitecturalModel,
  envelope: BuildingEnvelope,
): RenderScene {
  const solids: RenderSolid[] = [];

  solids.push({
    id: "solid-plot",
    source_object_id: null,
    layer: "plot",
    polygon: envelope.plot_polygon,
    z0_m: -0.05,
    z1_m: 0,
    label: "Parcela",
  });

  solids.push({
    id: "solid-envelope",
    source_object_id: null,
    layer: "envelope",
    polygon: envelope.footprint_polygon,
    z0_m: 0,
    z1_m: Math.max(0.15, (envelope.extrude_height_m ?? 0.15) * 0.02),
    label: "Huella envolvente",
  });

  for (const object of model.objects) {
    const elevation = object.level_elevation_m ?? 0;
    if (object.type === "Space" && object.polygon) {
      const height = object.height_m ?? 2.7;
      const solid = solidFromObject(object, "building", elevation, elevation + height);
      if (solid) solids.push(solid);
    } else if (object.type === "Core" && object.polygon) {
      const height = object.height_m ?? 2.7;
      const solid = solidFromObject(object, "core", elevation, elevation + height);
      if (solid) solids.push(solid);
    } else if (object.type === "Terrace" && object.polygon && object.properties.is_courtyard) {
      const solid = solidFromObject(object, "courtyard", elevation, elevation + 0.08);
      if (solid) solids.push(solid);
    } else if (object.type === "Roof" && object.polygon) {
      const thickness = object.thickness_m ?? 0.3;
      const solid = solidFromObject(object, "roof", elevation, elevation + thickness);
      if (solid) solids.push(solid);
    }
  }

  // Fallback massing extrusion if model has no spaces (defensive).
  if (!solids.some((s) => s.layer === "building")) {
    const storeys = Math.max(1, model.storey_count);
    const height = storeys * 3;
    const mass = model.objects.find((o) => o.type === "Building");
    const poly: Point2[] = envelope.footprint_polygon;
    solids.push({
      id: "solid-building-fallback",
      source_object_id: mass?.id ?? null,
      layer: "building",
      polygon: poly,
      z0_m: 0,
      z1_m: height,
      label: "Volumen (fallback)",
    });
  }

  return {
    scene_id: `scene-${model.model_id}`,
    model_id: model.model_id,
    envelope_id: envelope.envelope_id,
    generated_at: new Date().toISOString(),
    solids,
    bounds: computeBounds(solids),
    disclaimer:
      "Escena 3D/render derivada del modelo ARCH. No es fuente de verdad; regenerar si cambia el modelo.",
  };
}

export function sceneCentroid(scene: RenderScene): Vec3 {
  const { min, max } = scene.bounds;
  return {
    x: round2((min.x + max.x) / 2),
    y: round2((min.y + max.y) / 2),
    z: round2((min.z + max.z) / 2),
  };
}

export function sceneExtent(scene: RenderScene): number {
  const { min, max } = scene.bounds;
  return Math.max(max.x - min.x, max.y - min.y, max.z - min.z, 1);
}
