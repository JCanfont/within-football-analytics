import { describe, expect, it } from "vitest";
import { URBANISM_ANALYSIS_FIXTURE_V1 } from "../fixtures/urbanismAnalysis.fixture";
import { generateBuildingEnvelope } from "./buildingEnvelopeGenerator";
import { listOptimizerObjectives, optimizeDesign } from "./designOptimizer";
import { generateMassingStudy } from "./massingGenerator";

describe("designOptimizer", () => {
  const envelope = generateBuildingEnvelope({
    urbanism_analysis_id: URBANISM_ANALYSIS_FIXTURE_V1.analysis_id,
    api_version: URBANISM_ANALYSIS_FIXTURE_V1.api_version,
    parameters: URBANISM_ANALYSIS_FIXTURE_V1.parameters,
    plot_area_m2: URBANISM_ANALYSIS_FIXTURE_V1.parcel?.area_m2,
  });
  const massingStudy = generateMassingStudy({ envelope });

  it("lists objectives for the UI", () => {
    const objectives = listOptimizerObjectives();
    expect(objectives.map((o) => o.id)).toContain("balanced");
    expect(objectives.map((o) => o.id)).toContain("maximize_gfa");
  });

  it("ranks A/B/C mathematically and returns a recommended key", () => {
    const result = optimizeDesign({ envelope, massingStudy, objective: "balanced" });
    expect(result.candidates).toHaveLength(3);
    expect(["A", "B", "C"]).toContain(result.recommended_massing_key);
    expect(result.method).toBe("weighted_scoring_v1");
    expect(result.optimization_id).toContain(massingStudy.study_id);
    // Scores are sorted descending
    for (let i = 1; i < result.candidates.length; i += 1) {
      expect(result.candidates[i - 1]!.score).toBeGreaterThanOrEqual(result.candidates[i]!.score);
    }
  });

  it("prefers courtyard strategy when maximizing courtyard", () => {
    const result = optimizeDesign({
      envelope,
      massingStudy,
      objective: "maximize_courtyard",
      prefer_compliant: false,
    });
    expect(result.recommended_massing_key).toBe("B");
  });

  it("prefers higher GFA when maximizing buildable area", () => {
    const result = optimizeDesign({
      envelope,
      massingStudy,
      objective: "maximize_gfa",
      prefer_compliant: false,
    });
    const recommended = result.candidates[0]!;
    const maxGfa = Math.max(...result.candidates.map((c) => c.massing.metrics.gross_floor_area_m2));
    expect(recommended.massing.metrics.gross_floor_area_m2).toBeCloseTo(maxGfa, 5);
  });
});
