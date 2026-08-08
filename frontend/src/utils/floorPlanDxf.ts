import type { FloorPlanModel, PlannedFixture, PlannedOpening, PlannedRoom, WallSide } from "../types/floorPlan";
import { fixtureCadLayer } from "./floorPlanFixtures";

/**
 * Automated AutoCAD output (DXF R2010 / AC1024).
 * Units: meters in model space. Open the .dxf in AutoCAD / TrueView / DraftSight.
 * Layers follow an architectural discipline similar to AIA/ISO CAD standards.
 */

type DxfLayer = {
  name: string;
  color: number;
  lineType?: string;
};

const LAYERS: DxfLayer[] = [
  { name: "A-WALL", color: 7 },
  { name: "A-WALL-PATT", color: 8 },
  { name: "A-DOOR", color: 3 },
  { name: "A-GLAZ", color: 4 },
  { name: "A-FLOR-IDEN", color: 2 },
  { name: "A-FURN", color: 30 },
  { name: "A-FLOR-APPL", color: 5 },
  { name: "A-FLOR-SANR", color: 4 },
  { name: "A-ANNO-TEXT", color: 7 },
  { name: "A-ANNO-TTLB", color: 7 },
  { name: "A-ANNO-DIMS", color: 1 },
  { name: "A-ANNO-NORT", color: 7 },
  { name: "A-AREA-TERR", color: 94 },
  { name: "A-FLOR-STRS", color: 30 },
  { name: "DEFPOINTS", color: 7 },
];

function escapeDxfText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\P")
    .replace(/á/g, "\\U+00E1")
    .replace(/é/g, "\\U+00E9")
    .replace(/í/g, "\\U+00ED")
    .replace(/ó/g, "\\U+00F3")
    .replace(/ú/g, "\\U+00FA")
    .replace(/ñ/g, "\\U+00F1")
    .replace(/Á/g, "\\U+00C1")
    .replace(/É/g, "\\U+00C9")
    .replace(/Í/g, "\\U+00CD")
    .replace(/Ó/g, "\\U+00D3")
    .replace(/Ú/g, "\\U+00DA")
    .replace(/Ñ/g, "\\U+00D1")
    .replace(/ü/g, "\\U+00FC")
    .replace(/º/g, "\\U+00BA")
    .replace(/²/g, "\\U+00B2");
}

class DxfBuilder {
  private entities: string[] = [];
  private handle = 0x200;

  private nextHandle(): string {
    this.handle += 1;
    return this.handle.toString(16).toUpperCase();
  }

  private push(...pairs: Array<string | number>) {
    for (let i = 0; i < pairs.length; i += 2) {
      this.entities.push(String(pairs[i]), String(pairs[i + 1]));
    }
  }

  line(layer: string, x1: number, y1: number, x2: number, y2: number) {
    this.push(
      0,
      "LINE",
      5,
      this.nextHandle(),
      100,
      "AcDbEntity",
      8,
      layer,
      100,
      "AcDbLine",
      10,
      x1.toFixed(4),
      20,
      y1.toFixed(4),
      30,
      0,
      11,
      x2.toFixed(4),
      21,
      y2.toFixed(4),
      31,
      0,
    );
  }

  lwpolyline(layer: string, points: Array<[number, number]>, closed = true) {
    this.push(
      0,
      "LWPOLYLINE",
      5,
      this.nextHandle(),
      100,
      "AcDbEntity",
      8,
      layer,
      100,
      "AcDbPolyline",
      90,
      points.length,
      70,
      closed ? 1 : 0,
    );
    for (const [x, y] of points) {
      this.push(10, x.toFixed(4), 20, y.toFixed(4));
    }
  }

  circle(layer: string, cx: number, cy: number, radius: number) {
    this.push(
      0,
      "CIRCLE",
      5,
      this.nextHandle(),
      100,
      "AcDbEntity",
      8,
      layer,
      100,
      "AcDbCircle",
      10,
      cx.toFixed(4),
      20,
      cy.toFixed(4),
      30,
      0,
      40,
      radius.toFixed(4),
    );
  }

  arc(layer: string, cx: number, cy: number, radius: number, startDeg: number, endDeg: number) {
    this.push(
      0,
      "ARC",
      5,
      this.nextHandle(),
      100,
      "AcDbEntity",
      8,
      layer,
      100,
      "AcDbCircle",
      10,
      cx.toFixed(4),
      20,
      cy.toFixed(4),
      30,
      0,
      40,
      radius.toFixed(4),
      100,
      "AcDbArc",
      50,
      startDeg.toFixed(4),
      51,
      endDeg.toFixed(4),
    );
  }

  text(layer: string, x: number, y: number, height: number, value: string, rotation = 0, alignCenter = true) {
    const handle = this.nextHandle();
    this.push(
      0,
      "TEXT",
      5,
      handle,
      100,
      "AcDbEntity",
      8,
      layer,
      100,
      "AcDbText",
      10,
      x.toFixed(4),
      20,
      y.toFixed(4),
      30,
      0,
      40,
      height.toFixed(4),
      1,
      escapeDxfText(value),
      50,
      rotation.toFixed(4),
    );
    if (alignCenter) {
      this.push(72, 1, 11, x.toFixed(4), 21, y.toFixed(4), 31, 0);
    }
    this.push(100, "AcDbText");
  }

  mtext(layer: string, x: number, y: number, height: number, width: number, value: string) {
    this.push(
      0,
      "MTEXT",
      5,
      this.nextHandle(),
      100,
      "AcDbEntity",
      8,
      layer,
      100,
      "AcDbMText",
      10,
      x.toFixed(4),
      20,
      y.toFixed(4),
      30,
      0,
      40,
      height.toFixed(4),
      41,
      width.toFixed(4),
      71,
      5,
      72,
      5,
      1,
      escapeDxfText(value),
    );
  }

  buildDocument(model: FloorPlanModel): string {
    const lines: string[] = [];
    const pair = (code: number | string, value: number | string) => {
      lines.push(String(code), String(value));
    };

    pair(0, "SECTION");
    pair(2, "HEADER");
    pair(9, "$ACADVER");
    pair(1, "AC1024");
    pair(9, "$INSUNITS");
    pair(70, 6); // meters
    pair(9, "$MEASUREMENT");
    pair(70, 1); // metric
    pair(9, "$LTSCALE");
    pair(40, 1);
    pair(9, "$DIMSCALE");
    pair(40, model.scale === "1:50" ? 50 : 100);
    pair(9, "$DIMTXT");
    pair(40, 0.18);
    pair(9, "$DIMASZ");
    pair(40, 0.18);
    pair(9, "$EXTMIN");
    pair(10, -3);
    pair(20, -3);
    pair(30, 0);
    pair(9, "$EXTMAX");
    pair(10, model.widthM + 8);
    pair(20, model.depthM + 6);
    pair(30, 0);
    pair(0, "ENDSEC");

    pair(0, "SECTION");
    pair(2, "TABLES");

    pair(0, "TABLE");
    pair(2, "VPORT");
    pair(5, "8");
    pair(100, "AcDbSymbolTable");
    pair(70, 1);
    pair(0, "VPORT");
    pair(5, "31");
    pair(100, "AcDbSymbolTableRecord");
    pair(100, "AcDbViewportTableRecord");
    pair(2, "*ACTIVE");
    pair(70, 0);
    pair(10, 0);
    pair(20, 0);
    pair(11, 1);
    pair(21, 1);
    pair(12, model.widthM / 2);
    pair(22, model.depthM / 2);
    pair(13, 0);
    pair(23, 0);
    pair(14, 0.5);
    pair(24, 0.5);
    pair(15, 0.5);
    pair(25, 0.5);
    pair(16, 0);
    pair(26, 0);
    pair(36, 1);
    pair(17, 0);
    pair(27, 0);
    pair(37, 0);
    pair(40, Math.max(model.widthM, model.depthM) * 1.4);
    pair(41, 1.5);
    pair(42, 50);
    pair(43, 0);
    pair(44, 0);
    pair(50, 0);
    pair(51, 0);
    pair(71, 0);
    pair(72, 100);
    pair(73, 1);
    pair(74, 3);
    pair(75, 0);
    pair(76, 0);
    pair(77, 0);
    pair(78, 0);
    pair(0, "ENDTAB");

    pair(0, "TABLE");
    pair(2, "LTYPE");
    pair(5, "5");
    pair(100, "AcDbSymbolTable");
    pair(70, 1);
    pair(0, "LTYPE");
    pair(5, "14");
    pair(100, "AcDbSymbolTableRecord");
    pair(100, "AcDbLinetypeTableRecord");
    pair(2, "CONTINUOUS");
    pair(70, 0);
    pair(3, "Solid line");
    pair(72, 65);
    pair(73, 0);
    pair(40, 0);
    pair(0, "ENDTAB");

    pair(0, "TABLE");
    pair(2, "LAYER");
    pair(5, "2");
    pair(100, "AcDbSymbolTable");
    pair(70, LAYERS.length);
    for (const layer of LAYERS) {
      pair(0, "LAYER");
      pair(5, this.nextHandle());
      pair(100, "AcDbSymbolTableRecord");
      pair(100, "AcDbLayerTableRecord");
      pair(2, layer.name);
      pair(70, 0);
      pair(62, layer.color);
      pair(6, layer.lineType ?? "CONTINUOUS");
    }
    pair(0, "ENDTAB");

    pair(0, "TABLE");
    pair(2, "STYLE");
    pair(5, "3");
    pair(100, "AcDbSymbolTable");
    pair(70, 1);
    pair(0, "STYLE");
    pair(5, "11");
    pair(100, "AcDbSymbolTableRecord");
    pair(100, "AcDbTextStyleTableRecord");
    pair(2, "STANDARD");
    pair(70, 0);
    pair(40, 0);
    pair(41, 1);
    pair(50, 0);
    pair(71, 0);
    pair(42, 0.2);
    pair(3, "txt");
    pair(4, "");
    pair(0, "ENDTAB");

    pair(0, "ENDSEC");

    pair(0, "SECTION");
    pair(2, "BLOCKS");
    pair(0, "ENDSEC");

    pair(0, "SECTION");
    pair(2, "ENTITIES");
    lines.push(...this.entities);
    pair(0, "ENDSEC");

    pair(0, "SECTION");
    pair(2, "OBJECTS");
    pair(0, "DICTIONARY");
    pair(5, "C");
    pair(100, "AcDbDictionary");
    pair(281, 1);
    pair(3, "ACAD_GROUP");
    pair(350, "D");
    pair(0, "DICTIONARY");
    pair(5, "D");
    pair(100, "AcDbDictionary");
    pair(281, 1);
    pair(0, "ENDSEC");

    pair(0, "EOF");
    return `${lines.join("\n")}\n`;
  }
}

/** Model Y grows south (screen-like). CAD Y grows north. */
function toCad(model: FloorPlanModel, x: number, y: number): [number, number] {
  return [x, model.depthM - y];
}

function roomCadRect(model: FloorPlanModel, room: PlannedRoom): {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
} {
  const [x, yTop] = toCad(model, room.rect.x, room.rect.y);
  const y = yTop - room.rect.h;
  return {
    x,
    y,
    w: room.rect.w,
    h: room.rect.h,
    cx: x + room.rect.w / 2,
    cy: y + room.rect.h / 2,
  };
}

function openingCad(
  model: FloorPlanModel,
  opening: PlannedOpening,
): { x1: number; y1: number; x2: number; y2: number; wall: WallSide; nx: number; ny: number } {
  const { offsetM, widthM, wall } = opening;
  const W = model.widthM;
  const D = model.depthM;
  if (wall === "norte") {
    const [x1, y1] = toCad(model, offsetM, 0);
    const [x2, y2] = toCad(model, offsetM + widthM, 0);
    return { x1, y1, x2, y2, wall, nx: 0, ny: 1 };
  }
  if (wall === "sur") {
    const [x1, y1] = toCad(model, offsetM, D);
    const [x2, y2] = toCad(model, offsetM + widthM, D);
    return { x1, y1, x2, y2, wall, nx: 0, ny: -1 };
  }
  if (wall === "oeste") {
    const [x1, y1] = toCad(model, 0, offsetM);
    const [x2, y2] = toCad(model, 0, offsetM + widthM);
    return { x1, y1, x2, y2, wall, nx: -1, ny: 0 };
  }
  const [x1, y1] = toCad(model, W, offsetM);
  const [x2, y2] = toCad(model, W, offsetM + widthM);
  return { x1, y1, x2, y2, wall, nx: 1, ny: 0 };
}

function drawWalls(dxf: DxfBuilder, model: FloorPlanModel) {
  const t = 0.15; // exterior wall thickness
  // Outer footprint
  dxf.lwpolyline(
    "A-WALL",
    [
      [0, 0],
      [model.widthM, 0],
      [model.widthM, model.depthM],
      [0, model.depthM],
    ],
    true,
  );
  // Inner face
  dxf.lwpolyline(
    "A-WALL",
    [
      [t, t],
      [model.widthM - t, t],
      [model.widthM - t, model.depthM - t],
      [t, model.depthM - t],
    ],
    true,
  );

  for (const room of model.rooms.filter((r) => r.kind !== "terraza")) {
    const r = roomCadRect(model, room);
    dxf.lwpolyline(
      room.kind === "escalera" ? "A-FLOR-STRS" : "A-WALL",
      [
        [r.x, r.y],
        [r.x + r.w, r.y],
        [r.x + r.w, r.y + r.h],
        [r.x, r.y + r.h],
      ],
      true,
    );

    const label = room.label.replace("\n", " - ");
    dxf.mtext("A-FLOR-IDEN", r.cx, r.cy + 0.15, 0.22, Math.max(1.2, r.w * 0.9), label);
    dxf.text("A-FLOR-IDEN", r.cx, r.cy - 0.25, 0.18, `${room.areaM2.toFixed(1)} m2`, 0, true);

    if (room.kind === "escalera") {
      const steps = 8;
      for (let i = 1; i < steps; i += 1) {
        const yy = r.y + (r.h * i) / steps;
        dxf.line("A-FLOR-STRS", r.x + 0.05, yy, r.x + r.w - 0.05, yy);
      }
    }
  }

  for (const room of model.rooms.filter((r) => r.kind === "terraza")) {
    const r = roomCadRect(model, room);
    // terrace sits south of building in model; after flip it is below y=0
    dxf.lwpolyline(
      "A-AREA-TERR",
      [
        [r.x, r.y],
        [r.x + r.w, r.y],
        [r.x + r.w, r.y + r.h],
        [r.x, r.y + r.h],
      ],
      true,
    );
    dxf.text("A-AREA-TERR", r.cx, r.cy, 0.22, room.label, 0, true);
  }
}

function drawOpenings(dxf: DxfBuilder, model: FloorPlanModel) {
  for (const opening of model.openings) {
    const g = openingCad(model, opening);
    if (opening.type === "ventana") {
      dxf.line("A-GLAZ", g.x1, g.y1, g.x2, g.y2);
      dxf.line(
        "A-GLAZ",
        g.x1 + g.nx * 0.08,
        g.y1 + g.ny * 0.08,
        g.x2 + g.nx * 0.08,
        g.y2 + g.ny * 0.08,
      );
      dxf.text(
        "A-ANNO-TEXT",
        (g.x1 + g.x2) / 2 + g.nx * 0.25,
        (g.y1 + g.y2) / 2 + g.ny * 0.25,
        0.15,
        opening.label,
        0,
        true,
      );
      continue;
    }

    // Door leaf + swing arc
    const leaf = opening.widthM;
    const hingeX = opening.swing === "right" ? g.x2 : g.x1;
    const hingeY = opening.swing === "right" ? g.y2 : g.y1;
    const leafEndX = opening.swing === "right" ? g.x1 : g.x2;
    const leafEndY = opening.swing === "right" ? g.y1 : g.y2;
    dxf.line("A-DOOR", hingeX, hingeY, leafEndX, leafEndY);

    // Clear wall segment visually with a short white gap via DEFPOINTS guide
    dxf.line("DEFPOINTS", g.x1, g.y1, g.x2, g.y2);

    let start = 0;
    let end = 90;
    if (opening.wall === "sur") {
      start = opening.swing === "right" ? 0 : 90;
      end = opening.swing === "right" ? 90 : 180;
    } else if (opening.wall === "norte") {
      start = opening.swing === "right" ? 180 : 270;
      end = opening.swing === "right" ? 270 : 360;
    } else if (opening.wall === "este") {
      start = opening.swing === "right" ? 90 : 180;
      end = opening.swing === "right" ? 180 : 270;
    } else {
      start = opening.swing === "right" ? 270 : 0;
      end = opening.swing === "right" ? 360 : 90;
    }
    dxf.arc("A-DOOR", hingeX, hingeY, leaf, start, end);
    dxf.text(
      "A-ANNO-TEXT",
      (g.x1 + g.x2) / 2 + g.nx * 0.3,
      (g.y1 + g.y2) / 2 + g.ny * 0.3,
      0.15,
      opening.label,
      0,
      true,
    );
  }
}

function fixtureCadBox(model: FloorPlanModel, fixture: PlannedFixture) {
  const [x, yTop] = toCad(model, fixture.rect.x, fixture.rect.y);
  const y = yTop - fixture.rect.h;
  return {
    x,
    y,
    w: fixture.rect.w,
    h: fixture.rect.h,
    cx: x + fixture.rect.w / 2,
    cy: y + fixture.rect.h / 2,
  };
}

function drawFixtures(dxf: DxfBuilder, model: FloorPlanModel) {
  for (const fixture of model.fixtures) {
    const layer = fixtureCadLayer(fixture.kind);
    const b = fixtureCadBox(model, fixture);

    dxf.lwpolyline(
      layer,
      [
        [b.x, b.y],
        [b.x + b.w, b.y],
        [b.x + b.w, b.y + b.h],
        [b.x, b.y + b.h],
      ],
      true,
    );

    if (fixture.kind === "cama") {
      // Headboard + pillow lines
      dxf.line(layer, b.x, b.y + b.h * 0.88, b.x + b.w, b.y + b.h * 0.88);
      dxf.lwpolyline(
        layer,
        [
          [b.x + b.w * 0.08, b.y + b.h * 0.7],
          [b.x + b.w * 0.42, b.y + b.h * 0.7],
          [b.x + b.w * 0.42, b.y + b.h * 0.85],
          [b.x + b.w * 0.08, b.y + b.h * 0.85],
        ],
        true,
      );
      dxf.lwpolyline(
        layer,
        [
          [b.x + b.w * 0.58, b.y + b.h * 0.7],
          [b.x + b.w * 0.92, b.y + b.h * 0.7],
          [b.x + b.w * 0.92, b.y + b.h * 0.85],
          [b.x + b.w * 0.58, b.y + b.h * 0.85],
        ],
        true,
      );
      dxf.text(layer, b.cx, b.cy, 0.12, fixture.label, 0, true);
    } else if (fixture.kind === "frigorifico") {
      dxf.line(layer, b.x + 0.05, b.cy, b.x + b.w - 0.05, b.cy);
      dxf.text(layer, b.cx, b.cy - 0.12, 0.11, "FRIGO", 0, true);
    } else if (fixture.kind === "fregadero") {
      dxf.circle(layer, b.cx - b.w * 0.2, b.cy, Math.min(b.w, b.h) * 0.22);
      dxf.circle(layer, b.cx + b.w * 0.2, b.cy, Math.min(b.w, b.h) * 0.22);
      dxf.text(layer, b.cx, b.y - 0.08, 0.1, "FREG.", 0, true);
    } else if (fixture.kind === "placa") {
      const r = Math.min(b.w, b.h) * 0.12;
      dxf.circle(layer, b.cx - b.w * 0.22, b.cy - b.h * 0.18, r);
      dxf.circle(layer, b.cx + b.w * 0.22, b.cy - b.h * 0.18, r);
      dxf.circle(layer, b.cx - b.w * 0.22, b.cy + b.h * 0.18, r);
      dxf.circle(layer, b.cx + b.w * 0.22, b.cy + b.h * 0.18, r);
      dxf.text(layer, b.cx, b.y - 0.08, 0.1, "PLACA", 0, true);
    } else if (fixture.kind === "encimera") {
      dxf.text(layer, b.cx, b.cy, 0.11, "ENCIMERA", 0, true);
    } else if (fixture.kind === "lavadora") {
      dxf.circle(layer, b.cx, b.cy, Math.min(b.w, b.h) * 0.28);
      dxf.text(layer, b.cx, b.y - 0.08, 0.1, "LAVAD.", 0, true);
    } else if (fixture.kind === "inodoro") {
      dxf.lwpolyline(
        layer,
        [
          [b.x, b.y + b.h * 0.72],
          [b.x + b.w, b.y + b.h * 0.72],
          [b.x + b.w, b.y + b.h],
          [b.x, b.y + b.h],
        ],
        true,
      );
      dxf.circle(layer, b.cx, b.y + b.h * 0.38, Math.min(b.w, b.h) * 0.28);
      dxf.text(layer, b.cx, b.y - 0.08, 0.1, "WC", 0, true);
    } else if (fixture.kind === "lavabo") {
      dxf.circle(layer, b.cx, b.cy, Math.min(b.w, b.h) * 0.28);
      dxf.text(layer, b.cx, b.y - 0.08, 0.1, "LAVABO", 0, true);
    } else if (fixture.kind === "ducha") {
      dxf.line(layer, b.x, b.y, b.x + b.w, b.y + b.h);
      dxf.line(layer, b.x + b.w, b.y, b.x, b.y + b.h);
      dxf.circle(layer, b.x + b.w * 0.78, b.y + b.h * 0.78, 0.06);
      dxf.text(layer, b.cx, b.cy, 0.11, "DUCHA", 0, true);
    } else if (fixture.kind === "banera") {
      dxf.circle(layer, b.x + 0.2, b.cy, Math.min(0.18, b.h * 0.35));
      dxf.text(layer, b.cx, b.cy, 0.11, "BANERA", 0, true);
    } else if (fixture.kind === "sofa") {
      dxf.line(layer, b.x, b.y + b.h * 0.7, b.x + b.w, b.y + b.h * 0.7);
      dxf.text(layer, b.cx, b.cy, 0.11, "SOFA", 0, true);
    } else if (fixture.kind === "mesa_comedor") {
      dxf.text(layer, b.cx, b.cy, 0.11, "MESA", 0, true);
    } else if (fixture.kind === "armario") {
      dxf.line(layer, b.cx, b.y + 0.05, b.cx, b.y + b.h - 0.05);
      dxf.text(layer, b.cx, b.cy, 0.1, "ARM.", 0, true);
    } else if (fixture.kind === "mesilla") {
      dxf.text(layer, b.cx, b.cy, 0.09, "MES.", 0, true);
    }
  }
}

function drawDimensions(dxf: DxfBuilder, model: FloorPlanModel) {
  const y = -0.7;
  dxf.line("A-ANNO-DIMS", 0, y, model.widthM, y);
  dxf.line("A-ANNO-DIMS", 0, y - 0.15, 0, y + 0.15);
  dxf.line("A-ANNO-DIMS", model.widthM, y - 0.15, model.widthM, y + 0.15);
  dxf.text("A-ANNO-DIMS", model.widthM / 2, y - 0.35, 0.2, `${model.widthM.toFixed(2)} m`, 0, true);

  const x = -0.7;
  dxf.line("A-ANNO-DIMS", x, 0, x, model.depthM);
  dxf.line("A-ANNO-DIMS", x - 0.15, 0, x + 0.15, 0);
  dxf.line("A-ANNO-DIMS", x - 0.15, model.depthM, x + 0.15, model.depthM);
  dxf.text("A-ANNO-DIMS", x - 0.4, model.depthM / 2, 0.2, `${model.depthM.toFixed(2)} m`, 90, true);
}

function drawNorthAndTitle(dxf: DxfBuilder, model: FloorPlanModel) {
  const cx = model.widthM + 2.2;
  const cy = model.depthM - 1.2;
  dxf.circle("A-ANNO-NORT", cx, cy, 0.55);
  // Rotate arrow by declared orientation angle (screen angle → CAD: invert sense lightly)
  const rad = ((90 - model.northAngleDeg) * Math.PI) / 180;
  const tipX = cx + Math.cos(rad) * 0.45;
  const tipY = cy + Math.sin(rad) * 0.45;
  dxf.line("A-ANNO-NORT", cx, cy, tipX, tipY);
  dxf.text("A-ANNO-NORT", cx, cy - 0.85, 0.25, "N", 0, true);

  const bx = 0;
  const by = model.depthM + 1.2;
  dxf.lwpolyline(
    "A-ANNO-TTLB",
    [
      [bx, by],
      [model.widthM + 4.5, by],
      [model.widthM + 4.5, by + 2.4],
      [bx, by + 2.4],
    ],
    true,
  );
  dxf.mtext(
    "A-ANNO-TTLB",
    bx + 0.2,
    by + 2.05,
    0.28,
    model.widthM + 4,
    `${model.title}\\PPlano de planta automatizado AutoCAD · Escala ${model.scale}\\PSuperficie ${model.answers.floorAreaM2.toFixed(1)} m2 · Orientacion ${model.answers.orientation}\\PUnidades: metros (INSUNITS=6). Generado por WITHIN Floor Plan Automator.`,
  );

  // Graphic scale bar (5 m)
  const sx = model.widthM + 1.2;
  const sy = 0.8;
  dxf.line("A-ANNO-DIMS", sx, sy, sx + 5, sy);
  dxf.line("A-ANNO-DIMS", sx, sy - 0.1, sx, sy + 0.1);
  dxf.line("A-ANNO-DIMS", sx + 5, sy - 0.1, sx + 5, sy + 0.1);
  dxf.text("A-ANNO-DIMS", sx, sy - 0.35, 0.18, "0", 0, true);
  dxf.text("A-ANNO-DIMS", sx + 5, sy - 0.35, 0.18, "5 m", 0, true);
  dxf.text("A-ANNO-DIMS", sx + 2.5, sy + 0.35, 0.18, `ESCALA ${model.scale}`, 0, true);
}

export function buildFloorPlanDxf(model: FloorPlanModel): string {
  const dxf = new DxfBuilder();
  drawWalls(dxf, model);
  drawFixtures(dxf, model);
  drawOpenings(dxf, model);
  drawDimensions(dxf, model);
  drawNorthAndTitle(dxf, model);

  // Memory as AutoCAD annotation block text to the right
  const memoX = model.widthM + 1.1;
  const memoY = model.depthM - 2.2;
  dxf.mtext(
    "A-ANNO-TEXT",
    memoX,
    memoY,
    0.16,
    4.2,
    ["MEMORIA DESCRIPTIVA", ...model.description].join("\\P"),
  );

  return dxf.buildDocument(model);
}

export function floorPlanDxfFilename(model: FloorPlanModel): string {
  const kind = model.answers.dwellingKind.replace(/_/g, "-");
  const area = Math.round(model.answers.floorAreaM2);
  return `plano-${kind}-${area}m2-${model.scale.replace(":", "")}.dxf`;
}

export function downloadFloorPlanDxf(model: FloorPlanModel): void {
  const content = buildFloorPlanDxf(model);
  const blob = new Blob([content], { type: "application/dxf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = floorPlanDxfFilename(model);
  anchor.click();
  URL.revokeObjectURL(url);
}
