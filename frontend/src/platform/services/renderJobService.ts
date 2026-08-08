import type {
  CreateRenderJobInput,
  RenderCamera,
  RenderJob,
  RenderJobStatus,
  RenderPresetId,
  RenderResolutionId,
} from "../types/render";
import { isBlenderAdapterAvailable, toBlenderScenePayload } from "./blenderAdapter";
import { defaultCameraForScene } from "./renderProjector";
import { RENDER_PRESETS, RENDER_RESOLUTIONS } from "./renderPresets";
import { renderSceneToSvg } from "./renderPreviewSvg";
import { buildRenderSceneFromModel } from "./renderSceneBuilder";

function nowIso(): string {
  return new Date().toISOString();
}

function mergeCamera(base: RenderCamera, patch?: Partial<RenderCamera>): RenderCamera {
  return { ...base, ...patch, target: { ...base.target, ...(patch?.target ?? {}) } };
}

export function createRenderJob(input: CreateRenderJobInput): RenderJob {
  const scene = buildRenderSceneFromModel(input.model, input.envelope);
  const preset: RenderPresetId = input.preset ?? "daylight_concept";
  const resolutionId: RenderResolutionId = input.resolution ?? "1080p";
  const resolution = RENDER_RESOLUTIONS[resolutionId];
  const camera = mergeCamera(defaultCameraForScene(scene), input.camera);
  const engine = input.engine ?? "local_preview_v1";
  const stamp = nowIso();

  if (!(preset in RENDER_PRESETS)) {
    throw new Error(`Render preset desconocido: ${preset}`);
  }

  return {
    job_id: `rj-${input.model.model_id}-${preset}-${resolutionId}`,
    model_id: input.model.model_id,
    scene_id: scene.scene_id,
    status: "queued",
    preset,
    resolution,
    camera,
    engine,
    progress: 0,
    created_at: stamp,
    updated_at: stamp,
    started_at: null,
    completed_at: null,
    preview_svg: null,
    output_asset_id: null,
    error: null,
    blender_payload_available: engine === "blender_optional",
    disclaimer:
      "RenderJob asíncrono. Preview local sin GPU cloud. Blender es adaptador opcional y no forma parte del núcleo BIM/planos.",
  };
}

function withStatus(job: RenderJob, status: RenderJobStatus, patch: Partial<RenderJob> = {}): RenderJob {
  return {
    ...job,
    ...patch,
    status,
    updated_at: nowIso(),
  };
}

/**
 * Executes a local preview render synchronously (no GPU cloud required).
 * For `blender_optional`, fails clearly unless a future worker is configured.
 */
export function runRenderJob(job: RenderJob, input: CreateRenderJobInput): RenderJob {
  const started = withStatus(job, "running", {
    started_at: nowIso(),
    progress: 0.35,
  });

  if (job.engine === "blender_optional" && !isBlenderAdapterAvailable()) {
    return withStatus(started, "failed", {
      progress: 1,
      completed_at: nowIso(),
      error:
        "Motor Blender no configurado. Use engine=local_preview_v1 o exporte el payload bridge para un worker externo.",
    });
  }

  try {
    const scene = buildRenderSceneFromModel(input.model, input.envelope);
    const svg = renderSceneToSvg(
      scene,
      job.camera,
      job.resolution.width,
      job.resolution.height,
      job.preset,
    );

    // Touch blender payload path to keep adapter wired without requiring Blender.
    if (job.engine === "blender_optional") {
      toBlenderScenePayload(scene, job.camera);
    }

    return withStatus(started, "completed", {
      progress: 1,
      completed_at: nowIso(),
      preview_svg: svg,
      output_asset_id: `asset-${job.job_id}`,
      error: null,
    });
  } catch (error) {
    return withStatus(started, "failed", {
      progress: 1,
      completed_at: nowIso(),
      error: error instanceof Error ? error.message : "Error desconocido en RenderJob",
    });
  }
}

export function createAndRunRenderJob(input: CreateRenderJobInput): RenderJob {
  return runRenderJob(createRenderJob(input), input);
}

export function cancelRenderJob(job: RenderJob): RenderJob {
  if (job.status === "completed" || job.status === "failed") {
    return job;
  }
  return withStatus(job, "cancelled", {
    progress: job.progress,
    completed_at: nowIso(),
    error: "Cancelado por el usuario",
  });
}
