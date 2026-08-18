import { describe, expect, it } from "vitest";
import { URBANISM_ANALYSIS_FIXTURE_V1 } from "../fixtures/urbanismAnalysis.fixture";
import { generateBuildingEnvelope } from "./buildingEnvelopeGenerator";
import { generateMassingStudy, selectMassingAlternative } from "./massingGenerator";

describe("massingGenerator", () => {
  const envelope = generateBuildingEnvelope({
    urbanism_analysis_id: URBANISM_ANALYSIS_FIXTURE_V1.analysis_id,
    api_version: URBANISM_ANALYSIS_FIXTURE_V1.api_version,
    parameters: URBANISM_ANALYSIS_FIXTURE_V1.parameters,
    plot_area_m2: URBANISM_ANALYSIS_FIXTURE_V1.parcel?.area_m2,
  });

  it("creates three comparable alternatives inside the envelope study", () => {
    const study = generateMassingStudy({ envelope });
    expect(study.alternatives).toHaveLength(3);
    expect(study.alternatives.map((alt) => alt.key)).toEqual(["A", "B", "C"]);
    expect(study.alternatives[0]?.strategy).toBe("full_fill");
    expect(study.alternatives[1]?.strategy).toBe("courtyard");
    expect(study.alternatives[1]?.courtyard_polygons.length).toBeGreaterThan(0);
    expect(study.alternatives[2]?.strategy).toBe("compact_bar");
    expect(study.disclaimer.toLowerCase()).toContain("massing");
  });

  it("reports metrics and allows selecting an alternative", () => {
    const study = generateMassingStudy({ envelope });
    const selected = selectMassingAlternative(study, "B");
    expect(selected.selected_key).toBe("B");
    const courtyard = selected.alternatives.find((alt) => alt.key === "B");
    expect(courtyard?.metrics.courtyard_area_m2).toBeGreaterThan(0);
    expect(courtyard?.metrics.gross_floor_area_m2).toBeGreaterThan(0);
    expect(courtyard?.floors).toBeGreaterThan(0);
  });

  it("keeps compact bar with fewer or equal floors than full fill", () => {
    const study = generateMassingStudy({ envelope });
    const full = study.alternatives.find((alt) => alt.key === "A");
    const compact = study.alternatives.find((alt) => alt.key === "C");
    expect(compact?.floors).toBeLessThanOrEqual(full?.floors ?? 0);
    expect(compact?.metrics.footprint_area_m2).toBeLessThanOrEqual((full?.metrics.footprint_area_m2 ?? 0) + 0.01);
  });
});
