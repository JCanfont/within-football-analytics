export type EstateType = "rustica" | "urbana";

export type DwellingKind = "local" | "vivienda_aislada" | "vivienda_adosada" | "piso";

export type FloorLevels = "una_planta" | "duplex";

export type BathroomFixture = "ducha" | "banera";

export type CardinalOrientation = "norte" | "sur" | "este" | "oeste" | "noreste" | "noroeste" | "sureste" | "suroeste";

export type WallSide = "norte" | "sur" | "este" | "oeste";

export type BathroomSpec = {
  id: string;
  fixture: BathroomFixture;
};

export type WindowSpec = {
  id: string;
  wall: WallSide;
  roomHint?: string;
  widthM: number;
};

export type HallwaySpec = {
  id: string;
  location: "entrada" | "central" | "distribuidor" | "lateral";
  connects: string;
};

export type DoorSpec = {
  id: string;
  kind: "entrada" | "interior" | "terraza" | "servicio";
  wall?: WallSide;
  widthM: number;
  label: string;
};

export type FloorPlanAnswers = {
  estateType: EstateType;
  dwellingKind: DwellingKind;
  floorLevels: FloorLevels;
  floorAreaM2: number;
  bathrooms: BathroomSpec[];
  bedroomCount: number;
  orientation: CardinalOrientation;
  windows: WindowSpec[];
  hallways: HallwaySpec[];
  doors: DoorSpec[];
};

export type RoomKind =
  | "salon"
  | "cocina"
  | "dormitorio"
  | "bano"
  | "pasillo"
  | "entrada"
  | "terraza"
  | "local"
  | "escalera";

export type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PlannedRoom = {
  id: string;
  kind: RoomKind;
  label: string;
  areaM2: number;
  rect: Rect;
  floor: 0 | 1;
};

export type PlannedOpening = {
  id: string;
  type: "ventana" | "puerta";
  wall: WallSide;
  /** Position along wall from left/top origin of outer envelope, in meters */
  offsetM: number;
  widthM: number;
  swing?: "left" | "right";
  label: string;
  roomId?: string;
};

export type DimensionLine = {
  id: string;
  axis: "x" | "y";
  startM: number;
  endM: number;
  offsetM: number;
  label: string;
};

export type FixtureKind =
  | "cama"
  | "mesilla"
  | "armario"
  | "encimera"
  | "fregadero"
  | "placa"
  | "frigorifico"
  | "lavadora"
  | "inodoro"
  | "lavabo"
  | "ducha"
  | "banera"
  | "sofa"
  | "mesa_comedor"
  | "silla";

export type PlannedFixture = {
  id: string;
  kind: FixtureKind;
  roomId: string;
  label: string;
  /** Bounding box in model meters (same coords as rooms). */
  rect: Rect;
  /** Optional rotation in degrees (0 = aligned to axes). */
  rotationDeg?: number;
  /** Extra drawing hints for CAD symbols. */
  meta?: {
    bedSize?: "individual" | "doble";
    seatCount?: number;
  };
};

export type FloorPlanModel = {
  answers: FloorPlanAnswers;
  scale: "1:50" | "1:100";
  widthM: number;
  depthM: number;
  rooms: PlannedRoom[];
  openings: PlannedOpening[];
  fixtures: PlannedFixture[];
  dimensions: DimensionLine[];
  northAngleDeg: number;
  title: string;
  description: string[];
};
