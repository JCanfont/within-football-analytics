import { describe, expect, it } from "vitest";
import { analyzeParcel, numericParameterOrNull } from "../services/urbanismClient";
import { URBANISM_ANALYSIS_FIXTURE_V1 } from "../fixtures/urbanismAnalysis.fixture";

/**
 * Boundary guardrails for this repository:
 * - We only consume Urbanismo Engine via API/fixtures.
 * - We never invent defaults for unknown parameters.
 */
describe("platform/engine boundary", () => {
  it("exposes only consumer entrypoints (no local MUC/RPUC engine API)", async () => {
    const consumerApi = await import("../services/urbanismClient");
    expect(typeof consumerApi.analyzeParcel).toBe("function");
    expect(typeof consumerApi.linkScenarioToUrbanism).toBe("function");
    expect("parseMuc" in consumerApi).toBe(false);
    expect("extractRpuc" in consumerApi).toBe(false);
    expect("resolvePlanningHierarchy" in consumerApi).toBe(false);
  });

  it("keeps fixture responses on contract vocabulary", async () => {
    const analysis = await analyzeParcel({
      request_id: "boundary-1",
      cadastral_reference: URBANISM_ANALYSIS_FIXTURE_V1.parcel?.cadastral_reference,
    });
    const statuses = new Set(analysis.parameters.map((parameter) => parameter.status));
    for (const status of statuses) {
      expect([
        "confirmed",
        "interpreted",
        "manual_validated",
        "conflict",
        "unknown",
        "not_applicable",
      ]).toContain(status);
    }
    expect(numericParameterOrNull(analysis, "min_plot_m2")).toBeNull();
  });
});
