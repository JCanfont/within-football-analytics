import { describe, expect, it } from "vitest";
import { buildFloorPlan, createDefaultAnswers } from "./floorPlanLayout";
import { fixtureCadLayer, placeFixtures } from "./floorPlanFixtures";

describe("placeFixtures", () => {
  it("adds beds, kitchen appliances and sanitary blocks", () => {
    const model = buildFloorPlan(createDefaultAnswers());
    const kinds = new Set(model.fixtures.map((fixture) => fixture.kind));

    expect(kinds.has("cama")).toBe(true);
    expect(kinds.has("encimera")).toBe(true);
    expect(kinds.has("frigorifico")).toBe(true);
    expect(kinds.has("fregadero")).toBe(true);
    expect(kinds.has("placa")).toBe(true);
    expect(kinds.has("inodoro")).toBe(true);
    expect(kinds.has("lavabo")).toBe(true);
    expect(kinds.has("ducha")).toBe(true);
    expect(kinds.has("sofa")).toBe(true);
    expect(fixtureCadLayer("cama")).toBe("A-FURN");
    expect(fixtureCadLayer("frigorifico")).toBe("A-FLOR-APPL");
    expect(fixtureCadLayer("ducha")).toBe("A-FLOR-SANR");
  });

  it("keeps fixtures inside their rooms", () => {
    const model = buildFloorPlan(createDefaultAnswers());
    for (const fixture of placeFixtures(model.rooms, model.answers)) {
      const room = model.rooms.find((item) => item.id === fixture.roomId);
      expect(room).toBeTruthy();
      if (!room) {
        continue;
      }
      expect(fixture.rect.x).toBeGreaterThanOrEqual(room.rect.x - 0.01);
      expect(fixture.rect.y).toBeGreaterThanOrEqual(room.rect.y - 0.01);
      expect(fixture.rect.x + fixture.rect.w).toBeLessThanOrEqual(room.rect.x + room.rect.w + 0.01);
      expect(fixture.rect.y + fixture.rect.h).toBeLessThanOrEqual(room.rect.y + room.rect.h + 0.01);
    }
  });
});
