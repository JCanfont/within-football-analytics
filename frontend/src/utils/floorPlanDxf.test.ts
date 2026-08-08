import { describe, expect, it } from "vitest";
import { buildFloorPlan, createDefaultAnswers } from "./floorPlanLayout";
import { buildFloorPlanDxf, floorPlanDxfFilename } from "./floorPlanDxf";

describe("buildFloorPlanDxf", () => {
  it("emits AutoCAD DXF with architectural layers and metric units", () => {
    const model = buildFloorPlan(createDefaultAnswers());
    const dxf = buildFloorPlanDxf(model);

    expect(dxf.startsWith("0\nSECTION\n")).toBe(true);
    expect(dxf).toContain("AC1024");
    expect(dxf).toContain("$INSUNITS");
    expect(dxf).toContain("A-WALL");
    expect(dxf).toContain("A-DOOR");
    expect(dxf).toContain("A-GLAZ");
    expect(dxf).toContain("A-FURN");
    expect(dxf).toContain("A-FLOR-APPL");
    expect(dxf).toContain("A-FLOR-SANR");
    expect(dxf).toContain("A-ANNO-DIMS");
    expect(dxf).toContain("LWPOLYLINE");
    expect(dxf).toContain("ENTRADA");
    expect(dxf).toContain("FRIGO");
    expect(dxf).toContain("DUCHA");
    expect(dxf).toContain("ESCALA");
    expect(dxf.trim().endsWith("EOF")).toBe(true);
    expect(floorPlanDxfFilename(model)).toMatch(/\.dxf$/);
  });

  it("includes duplex stair layer when applicable", () => {
    const answers = createDefaultAnswers();
    answers.floorLevels = "duplex";
    const dxf = buildFloorPlanDxf(buildFloorPlan(answers));
    expect(dxf).toContain("A-FLOR-STRS");
  });
});
