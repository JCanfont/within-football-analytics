import { describe, expect, it } from "vitest";
import { URBANISM_ANALYSIS_FIXTURE_V1 } from "../fixtures/urbanismAnalysis.fixture";
import { generateArchitecturalModel } from "./architecturalModelGenerator";
import { generateBuildingEnvelope } from "./buildingEnvelopeGenerator";
import { generateMassingStudy } from "./massingGenerator";
import { filterMepByDiscipline, filterMepBySystem, generateMepModel } from "./mepGenerator";

describe("mepGenerator", () => {
  const envelope = generateBuildingEnvelope({
    urbanism_analysis_id: URBANISM_ANALYSIS_FIXTURE_V1.analysis_id,
    api_version: URBANISM_ANALYSIS_FIXTURE_V1.api_version,
    parameters: URBANISM_ANALYSIS_FIXTURE_V1.parameters,
    plot_area_m2: URBANISM_ANALYSIS_FIXTURE_V1.parcel?.area_m2,
  });
  const massing = generateMassingStudy({ envelope }).alternatives[0]!;
  const architecturalModel = generateArchitecturalModel({
    urbanism_analysis_id: URBANISM_ANALYSIS_FIXTURE_V1.analysis_id,
    envelope_id: envelope.envelope_id,
    plot_polygon: envelope.plot_polygon,
    massing,
  });

  it("creates preliminary MEP elements coordinated with ARCH", () => {
    const mep = generateMepModel({ architecturalModel });
    expect(mep.schema).toBe("platform-mep-v1");
    expect(mep.architectural_model_id).toBe(architecturalModel.model_id);
    expect(mep.is_preliminary).toBe(true);
    expect(mep.is_sized_design).toBe(false);
    expect(mep.counts.Equipment).toBeGreaterThan(0);
    expect(mep.counts.Terminal).toBeGreaterThan(0);
    expect(mep.counts.Pipe).toBeGreaterThan(0);
    expect(mep.counts.Duct).toBeGreaterThan(0);
    expect(mep.counts.CableTray).toBeGreaterThan(0);
    expect(mep.counts.Cable).toBeGreaterThan(0);
    expect(mep.counts.Connection).toBeGreaterThan(0);
    expect(mep.counts.Circuit).toBeGreaterThan(0);
    expect(mep.counts.Shaft).toBeGreaterThan(0);
    expect(mep.systems_present.length).toBeGreaterThan(3);
  });

  it("supports filtered views by system and discipline", () => {
    const mep = generateMepModel({ architecturalModel });
    const lighting = filterMepBySystem(mep, "lighting");
    expect(lighting.length).toBeGreaterThan(0);
    expect(lighting.every((e) => e.system === "lighting")).toBe(true);
    const electrical = filterMepByDiscipline(mep, "MEP_ELECTRICAL");
    expect(electrical.every((e) => e.discipline === "MEP_ELECTRICAL")).toBe(true);
  });
});
