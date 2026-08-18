import { describe, expect, it } from "vitest";
import { URBANISM_ANALYSIS_FIXTURE_V1 } from "../fixtures/urbanismAnalysis.fixture";
import { generateArchitecturalModel } from "./architecturalModelGenerator";
import { generateBuildingEnvelope } from "./buildingEnvelopeGenerator";
import { detectClashes } from "./clashDetection";
import { generateCoordinationPack } from "./coordinationPack";
import { generateMassingStudy } from "./massingGenerator";
import { generateMepModel } from "./mepGenerator";
import { getDefaultPriceCatalog } from "./priceCatalog";
import { generateQuantityTakeoff } from "./quantityTakeoff";
import { generateStructuralModel } from "./structureGenerator";

describe("P10 coordination pack", () => {
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
  const structuralModel = generateStructuralModel({ architecturalModel });
  const mepModel = generateMepModel({ architecturalModel });

  it("detects clashes with configurable tolerances", () => {
    const loose = detectClashes(structuralModel, mepModel, {
      hard_m: 0.01,
      soft_m: 0.05,
      clearance_m: 0.1,
    });
    const tight = detectClashes(structuralModel, mepModel, {
      hard_m: 5,
      soft_m: 8,
      clearance_m: 12,
    });
    expect(loose.tolerances.clearance_m).toBe(0.1);
    expect(tight.counts.total).toBeGreaterThanOrEqual(loose.counts.total);
    expect(loose.disclaimer.toLowerCase()).toContain("clash");
  });

  it("computes quantity takeoff from ARCH/STRUCT/MEP", () => {
    const takeoff = generateQuantityTakeoff(architecturalModel, structuralModel, mepModel);
    expect(takeoff.lines.some((l) => l.code === "ARCH.WALL")).toBe(true);
    expect(takeoff.lines.some((l) => l.code === "STRUCT.COLUMN")).toBe(true);
    expect(takeoff.lines.some((l) => l.code === "MEP.PIPE")).toBe(true);
    expect(takeoff.lines.every((l) => l.quantity > 0)).toBe(true);
  });

  it("builds budget from versioned catalog and takeoff", () => {
    const pack = generateCoordinationPack({
      architecturalModel,
      structuralModel,
      mepModel,
      catalog: getDefaultPriceCatalog(),
    });
    expect(pack.budget.catalog_version).toBe("2026.08.1");
    expect(pack.budget.lines.length).toBeGreaterThan(0);
    expect(pack.budget.total_eur).toBeGreaterThan(0);
    expect(pack.budget.chapter_totals.length).toBeGreaterThan(0);
    expect(pack.clash.clash_report_id).toBeTruthy();
    expect(pack.takeoff.takeoff_id).toBeTruthy();
    expect(pack.coordination_id).toContain(architecturalModel.model_id);
  });
});
