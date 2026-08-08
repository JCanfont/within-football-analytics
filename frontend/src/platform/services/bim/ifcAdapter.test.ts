import { describe, expect, it } from "vitest";
import { URBANISM_ANALYSIS_FIXTURE_V1 } from "../../fixtures/urbanismAnalysis.fixture";
import { generateArchitecturalModel } from "../architecturalModelGenerator";
import { generateBuildingEnvelope } from "../buildingEnvelopeGenerator";
import { generateMassingStudy } from "../massingGenerator";
import { exportArchitecturalModelToIfc4 } from "./ifcAdapter";

describe("ifcAdapter", () => {
  it("exports a minimal IFC4 file with spatial structure and products", () => {
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

    const ifc = exportArchitecturalModelToIfc4(model);
    expect(ifc.startsWith("ISO-10303-21;")).toBe(true);
    expect(ifc).toContain("FILE_SCHEMA(('IFC4'))");
    expect(ifc).toContain("IFCPROJECT");
    expect(ifc).toContain("IFCSITE");
    expect(ifc).toContain("IFCBUILDING");
    expect(ifc).toContain("IFCBUILDINGSTOREY");
    expect(ifc).toContain("IFCWALL");
    expect(ifc).toContain("IFCSLAB");
    expect(ifc).toContain("Pset_PlatformIdentity");
    expect(ifc.trim().endsWith("END-ISO-10303-21;")).toBe(true);
  });
});
