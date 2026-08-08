import { describe, expect, it } from "vitest";
import { URBANISM_ANALYSIS_FIXTURE_V1 } from "../fixtures/urbanismAnalysis.fixture";
import { generateArchitecturalModel } from "./architecturalModelGenerator";
import { generateBuildingEnvelope } from "./buildingEnvelopeGenerator";
import { generateMassingStudy } from "./massingGenerator";
import { generatePlanSetFromModel } from "./modelPlanGenerator";
import { exportPlanSheetToDxf } from "./planSheetDxf";

describe("modelPlanGenerator", () => {
  const envelope = generateBuildingEnvelope({
    urbanism_analysis_id: URBANISM_ANALYSIS_FIXTURE_V1.analysis_id,
    api_version: URBANISM_ANALYSIS_FIXTURE_V1.api_version,
    parameters: URBANISM_ANALYSIS_FIXTURE_V1.parameters,
    plot_area_m2: URBANISM_ANALYSIS_FIXTURE_V1.parcel?.area_m2,
  });
  const massing = generateMassingStudy({ envelope }).alternatives[0]!;
  const model = generateArchitecturalModel({
    urbanism_analysis_id: envelope.urbanism_analysis_id,
    envelope_id: envelope.envelope_id,
    plot_polygon: envelope.plot_polygon,
    massing,
  });

  it("builds floor, roof, elevation and section sheets from the model", () => {
    const planSet = generatePlanSetFromModel(model);
    const kinds = planSet.sheets.map((sheet) => sheet.kind);
    expect(kinds).toContain("floor_plan");
    expect(kinds).toContain("roof_plan");
    expect(kinds).toContain("elevation");
    expect(kinds).toContain("section");
    expect(planSet.sheets.some((sheet) => sheet.primitives.some((p) => p.kind === "dim"))).toBe(true);
    expect(planSet.disclaimer.toLowerCase()).toContain("derivados del modelo");
  });

  it("exports DXF for a generated sheet", () => {
    const planSet = generatePlanSetFromModel(model);
    const dxf = exportPlanSheetToDxf(planSet.sheets[0]!);
    expect(dxf).toContain("AC1024");
    expect(dxf).toContain("LWPOLYLINE");
    expect(dxf.trim().endsWith("EOF")).toBe(true);
  });
});
