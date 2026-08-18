import { describe, expect, it } from "vitest";
import { URBANISM_ANALYSIS_FIXTURE_V1 } from "../fixtures/urbanismAnalysis.fixture";
import { generateArchitecturalModel } from "./architecturalModelGenerator";
import { generateBuildingEnvelope } from "./buildingEnvelopeGenerator";
import { generateMassingStudy } from "./massingGenerator";
import { generateStructuralModel, listStructuralElementsByType } from "./structureGenerator";

describe("structureGenerator", () => {
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

  it("creates preliminary STRUCT elements coordinated with ARCH", () => {
    const structural = generateStructuralModel({ architecturalModel });
    expect(structural.schema).toBe("platform-struct-v1");
    expect(structural.architectural_model_id).toBe(architecturalModel.model_id);
    expect(structural.is_preliminary).toBe(true);
    expect(structural.is_signed_calculation).toBe(false);
    expect(structural.counts.Column).toBeGreaterThan(0);
    expect(structural.counts.Beam).toBeGreaterThan(0);
    expect(structural.counts.StructuralSlab).toBeGreaterThan(0);
    expect(structural.counts.Foundation).toBeGreaterThan(0);
    expect(structural.counts.Opening).toBeGreaterThan(0);
    expect(structural.disclaimer.toLowerCase()).toContain("no constituye cálculo");
  });

  it("marks every element as STRUCT and links hosts", () => {
    const structural = generateStructuralModel({ architecturalModel });
    expect(structural.elements.every((el) => el.discipline === "STRUCT")).toBe(true);
    const columns = listStructuralElementsByType(structural, "Column");
    expect(columns.every((col) => col.host_arch_object_id)).toBe(true);
    const foundations = listStructuralElementsByType(structural, "Foundation");
    expect(foundations.length).toBe(columns.filter((c) => c.storey_index === 0).length);
  });
});
