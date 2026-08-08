import type {
  BathroomSpec,
  FloorPlanAnswers,
  PlannedFixture,
  PlannedRoom,
  Rect,
} from "../types/floorPlan";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function inset(rect: Rect, pad: number): Rect {
  return {
    x: rect.x + pad,
    y: rect.y + pad,
    w: Math.max(0.2, rect.w - pad * 2),
    h: Math.max(0.2, rect.h - pad * 2),
  };
}

function placeBed(room: PlannedRoom, index: number): PlannedFixture[] {
  const zone = inset(room.rect, 0.25);
  const doubleBed = zone.w >= 2.2 && zone.h >= 2.2;
  const bedW = doubleBed ? Math.min(1.5, zone.w * 0.55) : Math.min(0.9, zone.w * 0.45);
  const bedH = Math.min(2.0, zone.h * 0.62);
  const bed: Rect = {
    x: zone.x + 0.15,
    y: zone.y + (zone.h - bedH) / 2,
    w: bedW,
    h: bedH,
  };
  const fixtures: PlannedFixture[] = [
    {
      id: `${room.id}-cama`,
      kind: "cama",
      roomId: room.id,
      label: doubleBed ? "Cama doble" : "Cama individual",
      rect: bed,
      meta: { bedSize: doubleBed ? "doble" : "individual" },
    },
  ];

  // Nightstands
  const stand = 0.4;
  if (zone.y + 0.1 + stand < bed.y + bed.h) {
    fixtures.push({
      id: `${room.id}-mesilla-1`,
      kind: "mesilla",
      roomId: room.id,
      label: "Mesilla",
      rect: { x: bed.x + bed.w + 0.08, y: bed.y, w: stand, h: stand },
    });
  }

  // Wardrobe along opposite long wall
  const wardrobeW = Math.min(0.6, zone.w * 0.22);
  const wardrobeH = Math.min(zone.h * 0.7, 2.2);
  fixtures.push({
    id: `${room.id}-armario`,
    kind: "armario",
    roomId: room.id,
    label: index === 0 ? "Armario" : `Armario ${index + 1}`,
    rect: {
      x: zone.x + zone.w - wardrobeW,
      y: zone.y + (zone.h - wardrobeH) / 2,
      w: wardrobeW,
      h: wardrobeH,
    },
  });

  return fixtures;
}

function placeKitchen(room: PlannedRoom): PlannedFixture[] {
  const zone = inset(room.rect, 0.12);
  const depth = 0.6;
  const fixtures: PlannedFixture[] = [];

  // Linear run along the north wall of the kitchen
  const runH = depth;
  const run: Rect = { x: zone.x, y: zone.y, w: zone.w, h: runH };
  fixtures.push({
    id: `${room.id}-encimera`,
    kind: "encimera",
    roomId: room.id,
    label: "Encimera / muebles bajos",
    rect: run,
  });

  // Fridge niche at left end (0.60 x 0.70 clear)
  const fridgeW = 0.6;
  const fridgeD = Math.min(0.7, zone.h * 0.35);
  fixtures.push({
    id: `${room.id}-frigorifico`,
    kind: "frigorifico",
    roomId: room.id,
    label: "Hueco frigorífico",
    rect: {
      x: zone.x,
      y: zone.y + runH + 0.05,
      w: fridgeW,
      h: fridgeD,
    },
  });

  // Sink
  const sinkW = Math.min(0.8, zone.w * 0.28);
  fixtures.push({
    id: `${room.id}-fregadero`,
    kind: "fregadero",
    roomId: room.id,
    label: "Fregadero",
    rect: {
      x: zone.x + fridgeW + 0.25,
      y: zone.y + 0.08,
      w: sinkW,
      h: depth - 0.16,
    },
  });

  // Cooktop / placa
  const plateW = Math.min(0.6, zone.w * 0.22);
  fixtures.push({
    id: `${room.id}-placa`,
    kind: "placa",
    roomId: room.id,
    label: "Placa cocina",
    rect: {
      x: zone.x + zone.w - plateW - 0.25,
      y: zone.y + 0.1,
      w: plateW,
      h: depth - 0.2,
    },
  });

  // Optional washer under residual strip if kitchen is deep enough
  if (zone.h > 2.6) {
    fixtures.push({
      id: `${room.id}-lavadora`,
      kind: "lavadora",
      roomId: room.id,
      label: "Lavadora",
      rect: {
        x: zone.x + zone.w - 0.65,
        y: zone.y + zone.h - 0.65,
        w: 0.6,
        h: 0.6,
      },
    });
  }

  return fixtures;
}

function placeBathroom(room: PlannedRoom, bath: BathroomSpec | undefined): PlannedFixture[] {
  const zone = inset(room.rect, 0.12);
  const fixtures: PlannedFixture[] = [];
  const fixture = bath?.fixture ?? "ducha";

  // Toilet
  fixtures.push({
    id: `${room.id}-inodoro`,
    kind: "inodoro",
    roomId: room.id,
    label: "Inodoro",
    rect: {
      x: zone.x + 0.08,
      y: zone.y + 0.1,
      w: 0.4,
      h: 0.7,
    },
  });

  // Washbasin
  fixtures.push({
    id: `${room.id}-lavabo`,
    kind: "lavabo",
    roomId: room.id,
    label: "Lavabo",
    rect: {
      x: zone.x + Math.max(0.55, zone.w * 0.35),
      y: zone.y + 0.08,
      w: Math.min(0.6, zone.w * 0.35),
      h: 0.45,
    },
  });

  if (fixture === "banera") {
    const tubW = Math.min(1.7, zone.w - 0.2);
    const tubH = Math.min(0.75, zone.h * 0.35);
    fixtures.push({
      id: `${room.id}-banera`,
      kind: "banera",
      roomId: room.id,
      label: "Bañera",
      rect: {
        x: zone.x + (zone.w - tubW) / 2,
        y: zone.y + zone.h - tubH - 0.08,
        w: tubW,
        h: tubH,
      },
    });
  } else {
    const shower = Math.min(0.9, Math.min(zone.w, zone.h) * 0.45);
    fixtures.push({
      id: `${room.id}-ducha`,
      kind: "ducha",
      roomId: room.id,
      label: "Plato de ducha",
      rect: {
        x: zone.x + zone.w - shower - 0.08,
        y: zone.y + zone.h - shower - 0.08,
        w: shower,
        h: shower,
      },
    });
  }

  return fixtures;
}

function placeLiving(room: PlannedRoom): PlannedFixture[] {
  const zone = inset(room.rect, 0.25);
  const fixtures: PlannedFixture[] = [];

  const sofaW = Math.min(2.2, zone.w * 0.55);
  const sofaH = Math.min(0.9, zone.h * 0.22);
  fixtures.push({
    id: `${room.id}-sofa`,
    kind: "sofa",
    roomId: room.id,
    label: "Sofá",
    rect: {
      x: zone.x + 0.1,
      y: zone.y + zone.h - sofaH - 0.1,
      w: sofaW,
      h: sofaH,
    },
  });

  const tableW = Math.min(1.4, zone.w * 0.35);
  const tableH = Math.min(0.9, zone.h * 0.28);
  const table: Rect = {
    x: zone.x + zone.w - tableW - 0.2,
    y: zone.y + 0.25,
    w: tableW,
    h: tableH,
  };
  fixtures.push({
    id: `${room.id}-mesa`,
    kind: "mesa_comedor",
    roomId: room.id,
    label: "Mesa comedor",
    rect: table,
    meta: { seatCount: 4 },
  });

  // Four chairs around table (schematic)
  const chair = 0.4;
  const seats: Array<[number, number]> = [
    [table.x + table.w / 2 - chair / 2, table.y - chair - 0.05],
    [table.x + table.w / 2 - chair / 2, table.y + table.h + 0.05],
    [table.x - chair - 0.05, table.y + table.h / 2 - chair / 2],
    [table.x + table.w + 0.05, table.y + table.h / 2 - chair / 2],
  ];
  seats.forEach(([x, y], i) => {
    if (x < zone.x || y < zone.y || x + chair > zone.x + zone.w || y + chair > zone.y + zone.h) {
      return;
    }
    fixtures.push({
      id: `${room.id}-silla-${i + 1}`,
      kind: "silla",
      roomId: room.id,
      label: `Silla ${i + 1}`,
      rect: { x, y, w: chair, h: chair },
    });
  });

  return fixtures;
}

export function placeFixtures(rooms: PlannedRoom[], answers: FloorPlanAnswers): PlannedFixture[] {
  const fixtures: PlannedFixture[] = [];
  let bedroomIndex = 0;

  for (const room of rooms) {
    if (room.kind === "dormitorio") {
      fixtures.push(...placeBed(room, bedroomIndex));
      bedroomIndex += 1;
    } else if (room.kind === "cocina") {
      fixtures.push(...placeKitchen(room));
    } else if (room.kind === "bano") {
      const bath = answers.bathrooms.find((b) => b.id === room.id) ?? answers.bathrooms[0];
      fixtures.push(...placeBathroom(room, bath));
    } else if (room.kind === "salon") {
      fixtures.push(...placeLiving(room));
    }
  }

  return fixtures.map((fixture) => ({
    ...fixture,
    rect: {
      x: fixture.rect.x,
      y: fixture.rect.y,
      w: clamp(fixture.rect.w, 0.25, 4),
      h: clamp(fixture.rect.h, 0.25, 4),
    },
  }));
}

export function fixtureCadLayer(kind: PlannedFixture["kind"]): string {
  switch (kind) {
    case "cama":
    case "mesilla":
    case "armario":
    case "sofa":
    case "mesa_comedor":
    case "silla":
      return "A-FURN";
    case "encimera":
    case "fregadero":
    case "placa":
    case "frigorifico":
    case "lavadora":
      return "A-FLOR-APPL";
    case "inodoro":
    case "lavabo":
    case "ducha":
    case "banera":
      return "A-FLOR-SANR";
    default:
      return "A-FURN";
  }
}
