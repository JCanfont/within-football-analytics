import { beforeEach, describe, expect, it } from "vitest";
import { URBANISM_ANALYSIS_FIXTURE_V1 } from "../fixtures/urbanismAnalysis.fixture";
import {
  analyzeParcel,
  linkScenarioToUrbanism,
  numericParameterOrNull,
  readCachedUrbanismAnalysis,
} from "../services/urbanismClient";
import { hashUrbanParameters } from "../services/urbanismHash";

describe("urbanismClient (platform consumer)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns fixture analysis when engine URL is not configured", async () => {
    const analysis = await analyzeParcel({
      request_id: "req-test-1",
      cadastral_reference: "1234501VH1234S0001AB",
    });

    expect(analysis.api_version).toBe("v1");
    expect(analysis.analysis_id).toBeTruthy();
    expect(analysis.parameters.length).toBeGreaterThan(0);
    expect(readCachedUrbanismAnalysis()?.analysis_id).toBe(analysis.analysis_id);
  });

  it("never coerces unknown parameters to zero", () => {
    const value = numericParameterOrNull(URBANISM_ANALYSIS_FIXTURE_V1, "min_plot_m2");
    expect(value).toBeNull();
  });

  it("links scenarios with reproducible parameter hash", () => {
    const link = linkScenarioToUrbanism(URBANISM_ANALYSIS_FIXTURE_V1);
    expect(link.urbanism_analysis_id).toBe(URBANISM_ANALYSIS_FIXTURE_V1.analysis_id);
    expect(link.parameters_hash).toBe(hashUrbanParameters(URBANISM_ANALYSIS_FIXTURE_V1.parameters));
    expect(link.overrides).toEqual([]);
  });

  it("uses conflict fixture for marked cadastral references", async () => {
    const analysis = await analyzeParcel({
      request_id: "req-conflict",
      cadastral_reference: "REF-CONFLICT-01",
    });
    expect(analysis.requires_human_review).toBe(true);
    expect(analysis.conflicts.length).toBeGreaterThan(0);
  });
});
