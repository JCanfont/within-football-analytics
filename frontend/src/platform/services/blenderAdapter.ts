import type { RenderCamera, RenderScene } from "../types/render";

/**
 * Optional Blender integration payload.
 * Blender is NOT a dependency of BIM/IFC/planos core.
 * This adapter only serializes a transferable scene description for a future worker.
 */
export type BlenderScenePayload = {
  schema: "platform-blender-bridge-v1";
  scene_id: string;
  model_id: string;
  units: "meters";
  camera: RenderCamera;
  meshes: Array<{
    name: string;
    layer: string;
    extrude: { z0: number; z1: number };
    vertices_xy: Array<[number, number]>;
  }>;
  notes: string[];
};

export function isBlenderAdapterAvailable(): boolean {
  // No Blender binary / GPU worker configured in this environment.
  return false;
}

export function toBlenderScenePayload(scene: RenderScene, camera: RenderCamera): BlenderScenePayload {
  return {
    schema: "platform-blender-bridge-v1",
    scene_id: scene.scene_id,
    model_id: scene.model_id,
    units: "meters",
    camera,
    meshes: scene.solids.map((solid) => ({
      name: solid.label,
      layer: solid.layer,
      extrude: { z0: solid.z0_m, z1: solid.z1_m },
      vertices_xy: solid.polygon.map((p) => [p.x, p.y] as [number, number]),
    })),
    notes: [
      "Payload opcional para worker Blender futuro.",
      "No ejecutar Blender en el núcleo BIM/planos.",
      scene.disclaimer,
    ],
  };
}

export function downloadBlenderPayload(payload: BlenderScenePayload, filename?: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename ?? `${payload.scene_id}.blender-bridge.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
