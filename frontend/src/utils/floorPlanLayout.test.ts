import { describe, expect, it } from "vitest";
import { buildFloorPlan, createDefaultAnswers } from "./floorPlanLayout";
import { chooseScale, metersToPaperMm, orientationToNorthAngle } from "./floorPlanScale";

describe("floorPlanScale", () => {
  it("uses 1:50 for compact dwellings and 1:100 for larger footprints", () => {
    expect(chooseScale(90, 12)).toBe("1:50");
    expect(chooseScale(220, 20)).toBe("1:100");
  });

  it("converts meters to paper millimetres at architectural scales", () => {
    expect(metersToPaperMm(1, "1:50")).toBe(20);
    expect(metersToPaperMm(1, "1:100")).toBe(10);
    expect(metersToPaperMm(5, "1:50")).toBe(100);
  });

  it("maps orientation to a north-arrow angle", () => {
    expect(orientationToNorthAngle("sur")).toBe(0);
    expect(orientationToNorthAngle("norte")).toBe(180);
  });
});

describe("buildFloorPlan", () => {
  it("builds a descriptive technical plan with rooms, entrance and scale", () => {
    const model = buildFloorPlan(createDefaultAnswers());

    expect(model.scale).toBe("1:50");
    expect(model.widthM * model.depthM).toBeGreaterThan(80);
    expect(model.rooms.some((room) => room.kind === "salon")).toBe(true);
    expect(model.rooms.some((room) => room.kind === "bano")).toBe(true);
    expect(model.rooms.filter((room) => room.kind === "dormitorio")).toHaveLength(2);
    expect(model.openings.some((opening) => opening.type === "puerta" && opening.label === "ENTRADA")).toBe(true);
    expect(model.openings.some((opening) => opening.type === "ventana")).toBe(true);
    expect(model.description.length).toBeGreaterThan(3);
    expect(model.title).toContain("Finca urbana");
  });

  it("marks stair core for duplex dwellings", () => {
    const answers = createDefaultAnswers();
    answers.floorLevels = "duplex";
    const model = buildFloorPlan(answers);
    expect(model.rooms.some((room) => room.kind === "escalera")).toBe(true);
    expect(model.description.some((line) => line.toLowerCase().includes("dúplex"))).toBe(true);
  });

  it("adds terrace strip for rustic / detached homes", () => {
    const answers = createDefaultAnswers();
    answers.estateType = "rustica";
    answers.dwellingKind = "vivienda_aislada";
    const model = buildFloorPlan(answers);
    expect(model.rooms.some((room) => room.kind === "terraza")).toBe(true);
  });
});
