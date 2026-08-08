import { describe, expect, it } from "vitest";
import { URBANISM_ANALYSIS_FIXTURE_V1 } from "../fixtures/urbanismAnalysis.fixture";
import { generateArchitecturalModel, countObjectsByType } from "./architecturalModelGenerator";
import { generateBuildingEnvelope } from "./buildingEnvelopeGenerator";
import { generateMassingStudy } from "./massingGenerator";

describe("architecturalModelGenerator", () => {
  const envelope = generateBuildingEnvelope({
    urbanism_analysis_id: URBANISM_ANALYSIS_FIXTURE_V1.analysis_id,
    api_version: URBANISM_ANALYSIS_FIXTURE_V1.api_version,
    parameters: URBANISM_ANALYSIS_FIXTURE_V1.parameters,
    plot_area_m2: URBANISM_ANALYSIS_FIXTURE_V1.parcel?.area_m2,
  });
  const massing = generateMassingStudy({ envelope }).alternatives[0]!;

  it("creates semantic ARCH objects from selected massing", () => {
    const model = generateArchitecturalModel({
      urbanism_analysis_id: envelope.urbanism_analysis_id,
      envelope_id: envelope.envelope_id,
      plot_polygon: envelope.plot_polygon,
      massing,
    });

    const counts = countObjectsByType(model);
    expect(model.schema).toBe("platform-arch-v1");
    expect(counts.Site).toBe(1);
    expect(counts.Building).toBe(1);
    expect(counts.Storey).toBe(massing.floors);
    expect(counts.Wall).toBeGreaterThan(0);
    expect(counts.Slab).toBeGreaterThan(0);
    expect(counts.Space).toBeGreaterThan(0);
    expect(counts.Roof).toBeGreaterThan(0);
    expect(counts.Core).toBeGreaterThan(0);
    expect(counts.Stair).toBeGreaterThan(0);
    expect(counts.Shaft).toBeGreaterThan(0);
    expect(model.objects.every((object) => object.discipline === "ARCH" || object.type === "ParkingSpace")).toBe(true);
  });
});
