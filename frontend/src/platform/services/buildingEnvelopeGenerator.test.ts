import { describe, expect, it } from "vitest";
import { URBANISM_ANALYSIS_FIXTURE_V1 } from "../fixtures/urbanismAnalysis.fixture";
import { generateBuildingEnvelope, parseMaxFloors } from "./buildingEnvelopeGenerator";

describe("buildingEnvelopeGenerator", () => {
  it("parses PB+N floor strings", () => {
    expect(parseMaxFloors("PB+4")).toBe(5);
    expect(parseMaxFloors("pb + 3")).toBe(4);
    expect(parseMaxFloors(6)).toBe(6);
    expect(parseMaxFloors("n/a")).toBeNull();
  });

  it("builds a traceable envelope from urbanism parameters", () => {
    const envelope = generateBuildingEnvelope({
      urbanism_analysis_id: URBANISM_ANALYSIS_FIXTURE_V1.analysis_id,
      api_version: URBANISM_ANALYSIS_FIXTURE_V1.api_version,
      parameters: URBANISM_ANALYSIS_FIXTURE_V1.parameters,
      plot_area_m2: URBANISM_ANALYSIS_FIXTURE_V1.parcel?.area_m2,
    });

    expect(envelope.plot_polygon.length).toBeGreaterThanOrEqual(4);
    expect(envelope.footprint_polygon.length).toBeGreaterThanOrEqual(4);
    expect(envelope.metrics.plot_area_m2).toBeGreaterThan(100);
    expect(envelope.metrics.footprint_area_m2).toBeLessThan(envelope.metrics.plot_area_m2);
    expect(envelope.metrics.max_floors).toBe(5);
    expect(envelope.constraints.some((c) => c.kind === "setback_front" && c.urban_parameter_key === "setback_front_m")).toBe(true);
    expect(envelope.constraints.some((c) => c.urban_parameter_key === "occupation" && c.source_refs.length > 0)).toBe(true);
    expect(envelope.disclaimer.toLowerCase()).toContain("no es el edificio definitivo");
  });

  it("does not coerce unknown occupation/min plot into zeros", () => {
    const parameters = URBANISM_ANALYSIS_FIXTURE_V1.parameters.map((parameter) =>
      parameter.key === "occupation"
        ? { ...parameter, status: "unknown" as const, value: null, confidence: 0.1 }
        : parameter,
    );
    const envelope = generateBuildingEnvelope({
      urbanism_analysis_id: "ua-unknown-occ",
      api_version: "v1",
      parameters,
      plot_area_m2: 400,
    });
    expect(envelope.metrics.occupation_allowed).toBeNull();
    expect(envelope.warnings.some((warning) => warning.toLowerCase().includes("ocupación unknown"))).toBe(true);
  });
});
