import { describe, expect, it } from "vitest";
import { URBANISM_ANALYSIS_FIXTURE_V1 } from "../fixtures/urbanismAnalysis.fixture";
import { generateArchitecturalModel } from "./architecturalModelGenerator";
import { isBlenderAdapterAvailable, toBlenderScenePayload } from "./blenderAdapter";
import { generateBuildingEnvelope } from "./buildingEnvelopeGenerator";
import { generateMassingStudy } from "./massingGenerator";
import { cancelRenderJob, createAndRunRenderJob, createRenderJob, runRenderJob } from "./renderJobService";
import { buildRenderSceneFromModel } from "./renderSceneBuilder";

describe("P7 render pipeline", () => {
  const envelope = generateBuildingEnvelope({
    urbanism_analysis_id: URBANISM_ANALYSIS_FIXTURE_V1.analysis_id,
    api_version: URBANISM_ANALYSIS_FIXTURE_V1.api_version,
    parameters: URBANISM_ANALYSIS_FIXTURE_V1.parameters,
    plot_area_m2: URBANISM_ANALYSIS_FIXTURE_V1.parcel?.area_m2,
  });
  const massing = generateMassingStudy({ envelope }).alternatives[0]!;
  const model = generateArchitecturalModel({
    urbanism_analysis_id: URBANISM_ANALYSIS_FIXTURE_V1.analysis_id,
    envelope_id: envelope.envelope_id,
    plot_polygon: envelope.plot_polygon,
    massing,
  });

  it("builds a derived scene from the architectural model", () => {
    const scene = buildRenderSceneFromModel(model, envelope);
    expect(scene.model_id).toBe(model.model_id);
    expect(scene.solids.some((s) => s.layer === "plot")).toBe(true);
    expect(scene.solids.some((s) => s.layer === "building")).toBe(true);
    expect(scene.disclaimer.toLowerCase()).toContain("derivad");
  });

  it("runs a local RenderJob with camera/preset/resolution and SVG preview", () => {
    const job = createAndRunRenderJob({
      model,
      envelope,
      preset: "clay",
      resolution: "720p",
      engine: "local_preview_v1",
    });
    expect(job.status).toBe("completed");
    expect(job.progress).toBe(1);
    expect(job.resolution.width).toBe(1280);
    expect(job.preview_svg).toContain("<svg");
    expect(job.preview_svg).toContain("clay");
    expect(job.output_asset_id).toBeTruthy();
  });

  it("fails blender_optional clearly when Blender is not configured", () => {
    expect(isBlenderAdapterAvailable()).toBe(false);
    const queued = createRenderJob({
      model,
      envelope,
      engine: "blender_optional",
      preset: "dusk_concept",
    });
    const failed = runRenderJob(queued, { model, envelope, engine: "blender_optional" });
    expect(failed.status).toBe("failed");
    expect(failed.error?.toLowerCase()).toContain("blender");
  });

  it("exports blender bridge payload without requiring Blender runtime", () => {
    const scene = buildRenderSceneFromModel(model, envelope);
    const payload = toBlenderScenePayload(scene, {
      yaw_deg: 30,
      pitch_deg: 25,
      distance_m: 40,
      target: { x: 0, y: 0, z: 5 },
      fov_deg: 40,
      orthographic: false,
    });
    expect(payload.schema).toBe("platform-blender-bridge-v1");
    expect(payload.meshes.length).toBeGreaterThan(0);
  });

  it("can cancel a queued job", () => {
    const queued = createRenderJob({ model, envelope });
    const cancelled = cancelRenderJob(queued);
    expect(cancelled.status).toBe("cancelled");
  });
});
