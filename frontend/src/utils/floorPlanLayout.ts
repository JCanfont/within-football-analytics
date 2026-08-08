import type {
  BathroomSpec,
  CardinalOrientation,
  DoorSpec,
  FloorPlanAnswers,
  FloorPlanModel,
  HallwaySpec,
  PlannedOpening,
  PlannedRoom,
  Rect,
  WallSide,
  WindowSpec,
} from "../types/floorPlan";
import { chooseScale, orientationToNorthAngle } from "./floorPlanScale";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function areaOf(rect: Rect): number {
  return rect.w * rect.h;
}

function aspectForOrientation(orientation: CardinalOrientation): number {
  // width / depth. East-west facades prefer elongated plans.
  if (orientation === "este" || orientation === "oeste") {
    return 1.35;
  }
  if (orientation === "noreste" || orientation === "noroeste" || orientation === "sureste" || orientation === "suroeste") {
    return 1.2;
  }
  return 1.1;
}

function dwellingTitle(answers: FloorPlanAnswers): string {
  const estate = answers.estateType === "rustica" ? "Finca rústica" : "Finca urbana";
  const kindMap = {
    local: "local comercial",
    vivienda_aislada: "vivienda aislada",
    vivienda_adosada: "vivienda adosada",
    piso: "vivienda en planta",
  } as const;
  const levels = answers.floorLevels === "duplex" ? "dúplex" : "una planta";
  return `${estate} — ${kindMap[answers.dwellingKind]} (${levels})`;
}

function buildDescription(answers: FloorPlanAnswers, widthM: number, depthM: number, scale: "1:50" | "1:100"): string[] {
  const baths = answers.bathrooms
    .map((b, i) => `baño ${i + 1} con ${b.fixture === "ducha" ? "ducha" : "bañera"}`)
    .join("; ");
  const windows = answers.windows.length
    ? answers.windows.map((w) => `ventana ${w.widthM.toFixed(1)} m en muro ${w.wall}${w.roomHint ? ` (${w.roomHint})` : ""}`).join("; ")
    : "sin ventanas declaradas";
  const halls = answers.hallways.length
    ? answers.hallways.map((h) => `pasillo ${h.location} — ${h.connects}`).join("; ")
    : "sin pasillos declarados";
  const doors = answers.doors.length
    ? answers.doors.map((d) => `${d.label} (${d.kind}${d.wall ? `, muro ${d.wall}` : ""}, ${d.widthM.toFixed(2)} m)`).join("; ")
    : "sin puertas declaradas";

  return [
    `Superficie de planta: ${answers.floorAreaM2.toFixed(1)} m². Emplantillado rectangular aproximado ${widthM.toFixed(2)} × ${depthM.toFixed(2)} m.`,
    `Orientación principal de fachada/huecos: ${answers.orientation}.`,
    `Programa: ${answers.bedroomCount} dormitorio(s); ${answers.bathrooms.length} baño(s)${baths ? ` (${baths})` : ""}.`,
    `Huecos de ventana: ${windows}.`,
    `Circulaciones: ${halls}.`,
    `Carpintería de paso: ${doors}.`,
    `Representación técnica a ${scale} (escala de proyecto de vivienda habitual). Cotas en metros. Norte indicado según orientación declarada.`,
    answers.floorLevels === "duplex"
      ? "Dúplex: se representa la planta baja con indicación de núcleo de escalera; la planta alta se resume en la memoria descriptiva."
      : "Vivienda de una sola planta: distribución completa en la planta representada.",
  ];
}

function allocateEnvelope(areaM2: number, orientation: CardinalOrientation): { widthM: number; depthM: number } {
  const ratio = aspectForOrientation(orientation);
  const depthM = Math.sqrt(areaM2 / ratio);
  const widthM = areaM2 / depthM;
  return { widthM: round1(widthM), depthM: round1(depthM) };
}

function splitHorizontal(rect: Rect, leftRatio: number): [Rect, Rect] {
  const leftW = rect.w * leftRatio;
  return [
    { x: rect.x, y: rect.y, w: leftW, h: rect.h },
    { x: rect.x + leftW, y: rect.y, w: rect.w - leftW, h: rect.h },
  ];
}

function splitVertical(rect: Rect, topRatio: number): [Rect, Rect] {
  const topH = rect.h * topRatio;
  return [
    { x: rect.x, y: rect.y, w: rect.w, h: topH },
    { x: rect.x, y: rect.y + topH, w: rect.w, h: rect.h - topH },
  ];
}

function placeRooms(answers: FloorPlanAnswers, widthM: number, depthM: number): PlannedRoom[] {
  const rooms: PlannedRoom[] = [];
  const envelope: Rect = { x: 0, y: 0, w: widthM, h: depthM };
  const hasHall = answers.hallways.length > 0;
  const hallRatio = hasHall ? clamp(1.2 / depthM, 0.1, 0.18) : 0;

  let livingZone = envelope;
  let hallRect: Rect | null = null;

  if (hasHall) {
    const [hall, rest] = splitVertical(envelope, hallRatio);
    hallRect = hall;
    livingZone = rest;
    rooms.push({
      id: "pasillo-1",
      kind: "pasillo",
      label: answers.hallways[0]?.location === "entrada" ? "PASILLO / DISTRIBUIDOR" : "PASILLO",
      areaM2: round1(areaOf(hall)),
      rect: hall,
      floor: 0,
    });
  }

  // Entrance pocket near the declared entrance door wall (default sur).
  const entranceWall = answers.doors.find((d) => d.kind === "entrada")?.wall ?? "sur";
  if (!hasHall && entranceWall === "sur") {
    const [rest, entry] = splitVertical(livingZone, 0.88);
    livingZone = rest;
    rooms.push({
      id: "entrada-1",
      kind: "entrada",
      label: "ENTRADA",
      areaM2: round1(areaOf(entry)),
      rect: entry,
      floor: 0,
    });
  }

  const bedroomCount = Math.max(0, answers.bedroomCount);
  const bathCount = answers.bathrooms.length;
  const isLocal = answers.dwellingKind === "local";

  // Night zone on the left for bedrooms + baths; day zone on the right.
  const nightRatio = isLocal
    ? 0.25
    : clamp(0.28 + bedroomCount * 0.08 + bathCount * 0.04, 0.32, 0.55);
  const [nightZone, dayZone] = splitHorizontal(livingZone, nightRatio);

  // Day: kitchen strip + living
  const kitchenRatio = isLocal ? 0.2 : clamp(3.2 / dayZone.h, 0.22, 0.35);
  const [kitchen, salon] = splitVertical(dayZone, kitchenRatio);
  rooms.push({
    id: "cocina-1",
    kind: isLocal ? "local" : "cocina",
    label: isLocal ? "ZONA SERVICIO" : "COCINA",
    areaM2: round1(areaOf(kitchen)),
    rect: kitchen,
    floor: 0,
  });
  rooms.push({
    id: "salon-1",
    kind: isLocal ? "local" : "salon",
    label: isLocal ? "LOCAL / ATENCIÓN" : "SALÓN-COMEDOR",
    areaM2: round1(areaOf(salon)),
    rect: salon,
    floor: 0,
  });

  // Night zone: bathrooms stacked at top, bedrooms below
  let remainingNight = nightZone;
  if (bathCount > 0) {
    const bathBandRatio = clamp((bathCount * 2.2) / remainingNight.h, 0.2, 0.42);
    const [bathBand, sleepBand] = splitVertical(remainingNight, bathBandRatio);
    remainingNight = sleepBand;
    const bathW = bathBand.w / bathCount;
    answers.bathrooms.forEach((bath, index) => {
      const rect = {
        x: bathBand.x + index * bathW,
        y: bathBand.y,
        w: bathW,
        h: bathBand.h,
      };
      rooms.push({
        id: bath.id,
        kind: "bano",
        label: `BAÑO ${index + 1}\n(${bath.fixture === "ducha" ? "ducha" : "bañera"})`,
        areaM2: round1(areaOf(rect)),
        rect,
        floor: 0,
      });
    });
  }

  if (bedroomCount === 0 && !isLocal) {
    rooms.push({
      id: "dormitorio-flex",
      kind: "dormitorio",
      label: "ESTANCIA FLEXIBLE",
      areaM2: round1(areaOf(remainingNight)),
      rect: remainingNight,
      floor: 0,
    });
  } else if (bedroomCount > 0) {
    const cols = bedroomCount <= 2 ? 1 : 2;
    const rows = Math.ceil(bedroomCount / cols);
    const cellW = remainingNight.w / cols;
    const cellH = remainingNight.h / rows;
    for (let i = 0; i < bedroomCount; i += 1) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const rect = {
        x: remainingNight.x + col * cellW,
        y: remainingNight.y + row * cellH,
        w: cellW,
        h: cellH,
      };
      rooms.push({
        id: `dormitorio-${i + 1}`,
        kind: "dormitorio",
        label: `DORMITORIO ${i + 1}`,
        areaM2: round1(areaOf(rect)),
        rect,
        floor: 0,
      });
    }
  }

  if (answers.floorLevels === "duplex") {
    const stairW = clamp(1.1, 0.9, widthM * 0.12);
    const stairH = clamp(2.4, 2.0, depthM * 0.28);
    const baseX = hallRect ? hallRect.x + hallRect.w - stairW - 0.15 : widthM - stairW - 0.2;
    const baseY = hallRect ? hallRect.y + 0.1 : depthM - stairH - 0.2;
    rooms.push({
      id: "escalera-1",
      kind: "escalera",
      label: "ESCALERA\n(a planta alta)",
      areaM2: round1(stairW * stairH),
      rect: { x: baseX, y: baseY, w: stairW, h: stairH },
      floor: 0,
    });
  }

  if (answers.dwellingKind === "vivienda_aislada" || answers.estateType === "rustica") {
    // Symbolic terrace strip outside south facade (not counted in floor area envelope).
    rooms.push({
      id: "terraza-1",
      kind: "terraza",
      label: "TERRAZA / PORCHE",
      areaM2: round1(widthM * 1.5),
      rect: { x: 0, y: depthM, w: widthM, h: 1.5 },
      floor: 0,
    });
  }

  return rooms;
}

function openingsFromAnswers(
  answers: FloorPlanAnswers,
  widthM: number,
  depthM: number,
  rooms: PlannedRoom[],
): PlannedOpening[] {
  const openings: PlannedOpening[] = [];

  const wallLength = (wall: WallSide) => (wall === "norte" || wall === "sur" ? widthM : depthM);

  answers.windows.forEach((window, index) => {
    const len = wallLength(window.wall);
    const width = clamp(window.widthM, 0.6, Math.min(2.4, len * 0.45));
    const slot = (index + 1) / (answers.windows.length + 1);
    openings.push({
      id: window.id,
      type: "ventana",
      wall: window.wall,
      offsetM: round1(clamp(slot * len - width / 2, 0.3, len - width - 0.3)),
      widthM: round1(width),
      label: window.roomHint ? `V.${index + 1} ${window.roomHint}` : `V.${index + 1}`,
    });
  });

  answers.doors.forEach((door, index) => {
    const wall = door.wall ?? (door.kind === "entrada" ? "sur" : "este");
    const len = wallLength(wall);
    const width = clamp(door.widthM, 0.7, door.kind === "entrada" ? 1.2 : 0.9);
    const preferred =
      door.kind === "entrada"
        ? len * 0.5 - width / 2
        : ((index + 1) / (answers.doors.length + 2)) * len;
    openings.push({
      id: door.id,
      type: "puerta",
      wall,
      offsetM: round1(clamp(preferred, 0.2, len - width - 0.2)),
      widthM: round1(width),
      swing: index % 2 === 0 ? "left" : "right",
      label: door.kind === "entrada" ? "ENTRADA" : door.label || `P.${index + 1}`,
      roomId: rooms.find((r) => r.kind === "entrada" || r.kind === "pasillo")?.id,
    });
  });

  // Interior doors from hallway/entrance into main rooms if none declared beyond entrance.
  const interiorTargets = rooms.filter((r) => r.kind === "dormitorio" || r.kind === "bano" || r.kind === "cocina");
  interiorTargets.slice(0, Math.min(interiorTargets.length, 6)).forEach((room, index) => {
    if (answers.doors.some((d) => d.label.toLowerCase().includes(room.label.toLowerCase().split("\n")[0]!))) {
      return;
    }
    openings.push({
      id: `puerta-int-${room.id}`,
      type: "puerta",
      wall: "este",
      offsetM: round1(room.rect.y + room.rect.h * 0.35),
      widthM: 0.8,
      swing: index % 2 === 0 ? "right" : "left",
      label: `P.${room.label.split("\n")[0]}`,
      roomId: room.id,
    });
  });

  return openings;
}

export function buildFloorPlan(answers: FloorPlanAnswers): FloorPlanModel {
  const safeArea = clamp(answers.floorAreaM2, 20, 600);
  const normalized: FloorPlanAnswers = {
    ...answers,
    floorAreaM2: safeArea,
    bedroomCount: clamp(answers.bedroomCount, 0, 8),
    bathrooms: answers.bathrooms.slice(0, 4),
  };

  const { widthM, depthM } = allocateEnvelope(safeArea, normalized.orientation);
  const scale = chooseScale(safeArea, Math.max(widthM, depthM));
  const rooms = placeRooms(normalized, widthM, depthM);
  const openings = openingsFromAnswers(normalized, widthM, depthM, rooms);

  return {
    answers: normalized,
    scale,
    widthM,
    depthM,
    rooms,
    openings,
    dimensions: [
      {
        id: "dim-width",
        axis: "x",
        startM: 0,
        endM: widthM,
        offsetM: -0.8,
        label: `${widthM.toFixed(2)} m`,
      },
      {
        id: "dim-depth",
        axis: "y",
        startM: 0,
        endM: depthM,
        offsetM: -0.8,
        label: `${depthM.toFixed(2)} m`,
      },
    ],
    northAngleDeg: orientationToNorthAngle(normalized.orientation),
    title: dwellingTitle(normalized),
    description: buildDescription(normalized, widthM, depthM, scale),
  };
}

export function createDefaultAnswers(): FloorPlanAnswers {
  return {
    estateType: "urbana",
    dwellingKind: "piso",
    floorLevels: "una_planta",
    floorAreaM2: 90,
    bathrooms: [{ id: "bano-1", fixture: "ducha" }],
    bedroomCount: 2,
    orientation: "sur",
    windows: [
      { id: "v1", wall: "sur", roomHint: "salón", widthM: 1.8 },
      { id: "v2", wall: "este", roomHint: "dormitorio", widthM: 1.2 },
    ],
    hallways: [{ id: "h1", location: "entrada", connects: "salón y dormitorios" }],
    doors: [
      { id: "d-entrada", kind: "entrada", wall: "sur", widthM: 0.9, label: "Puerta de entrada" },
      { id: "d-salon", kind: "interior", widthM: 0.8, label: "Puerta salón" },
    ],
  };
}

export function bathroomFactory(index: number, fixture: BathroomSpec["fixture"] = "ducha"): BathroomSpec {
  return { id: `bano-${index + 1}`, fixture };
}

export function windowFactory(index: number, wall: WallSide = "sur"): WindowSpec {
  return { id: `ventana-${index + 1}`, wall, widthM: 1.2, roomHint: "" };
}

export function hallwayFactory(index: number): HallwaySpec {
  return { id: `pasillo-${index + 1}`, location: "central", connects: "estancias" };
}

export function doorFactory(index: number, kind: DoorSpec["kind"] = "interior"): DoorSpec {
  return {
    id: `puerta-${index + 1}`,
    kind,
    wall: kind === "entrada" ? "sur" : undefined,
    widthM: kind === "entrada" ? 0.9 : 0.8,
    label: kind === "entrada" ? "Puerta de entrada" : `Puerta ${index + 1}`,
  };
}
