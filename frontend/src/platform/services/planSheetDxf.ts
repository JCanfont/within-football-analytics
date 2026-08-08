import type { PlanPrimitive, PlanSheet } from "../types/planSheet";

class SimpleDxf {
  entities: string[] = [];
  layers = new Set<string>([
    "A-WALL",
    "A-DOOR",
    "A-GLAZ",
    "A-AREA",
    "A-AREA-TERR",
    "A-ROOF",
    "A-SLAB",
    "A-SITE",
    "A-FLOR-IDEN",
    "A-FLOR-STRS",
    "A-ANNO-DIMS",
    "A-ANNO-TEXT",
    "A-ANNO-AXIS",
    "A-ANNO-NORT",
    "A-ANNO-TTLB",
  ]);
  private handle = 0x300;

  nextHandle(): string {
    this.handle += 1;
    return this.handle.toString(16).toUpperCase();
  }

  private push(...pairs: Array<string | number>) {
    for (let i = 0; i < pairs.length; i += 2) {
      this.entities.push(String(pairs[i]), String(pairs[i + 1]));
    }
  }

  line(layer: string, x1: number, y1: number, x2: number, y2: number) {
    this.layers.add(layer);
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

  polyline(layer: string, points: Array<{ x: number; y: number }>, closed: boolean) {
    this.layers.add(layer);
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
    for (const point of points) {
      this.push(10, point.x.toFixed(4), 20, point.y.toFixed(4));
    }
  }

  text(layer: string, x: number, y: number, height: number, value: string) {
    this.layers.add(layer);
    this.push(
      0,
      "TEXT",
      5,
      this.nextHandle(),
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
      value,
      100,
      "AcDbText",
    );
  }
}

function emitPrimitive(dxf: SimpleDxf, primitive: PlanPrimitive) {
  if (primitive.kind === "polyline") {
    if (primitive.points.length < 2) {
      return;
    }
    if (primitive.points.length === 2 && !primitive.closed) {
      dxf.line(
        primitive.layer,
        primitive.points[0]!.x,
        primitive.points[0]!.y,
        primitive.points[1]!.x,
        primitive.points[1]!.y,
      );
      return;
    }
    dxf.polyline(primitive.layer, primitive.points, Boolean(primitive.closed));
    return;
  }

  if (primitive.kind === "text") {
    dxf.text(primitive.layer, primitive.at.x, primitive.at.y, primitive.height ?? 0.3, primitive.text);
    return;
  }

  if (primitive.kind === "dim") {
    const { a, b, offset, label, layer } = primitive;
    const horizontal = Math.abs(a.y - b.y) < 1e-6;
    if (horizontal) {
      const y = a.y + offset;
      dxf.line(layer, a.x, y, b.x, y);
      dxf.line(layer, a.x, a.y, a.x, y);
      dxf.line(layer, b.x, b.y, b.x, y);
      dxf.text(layer, (a.x + b.x) / 2, y + (offset < 0 ? -0.35 : 0.15), 0.25, label);
    } else {
      const x = a.x + offset;
      dxf.line(layer, x, a.y, x, b.y);
      dxf.line(layer, a.x, a.y, x, a.y);
      dxf.line(layer, b.x, b.y, x, b.y);
      dxf.text(layer, x + (offset < 0 ? -0.35 : 0.15), (a.y + b.y) / 2, 0.25, label);
    }
    return;
  }

  const { at, symbol, layer, label } = primitive;
  if (symbol === "north") {
    dxf.line(layer, at.x, at.y - 0.4, at.x, at.y + 0.4);
    dxf.line(layer, at.x - 0.2, at.y + 0.1, at.x, at.y + 0.4);
    dxf.line(layer, at.x + 0.2, at.y + 0.1, at.x, at.y + 0.4);
    dxf.text(layer, at.x, at.y - 0.7, 0.25, "N");
  } else if (symbol === "door") {
    dxf.line(layer, at.x - 0.4, at.y, at.x + 0.4, at.y);
    dxf.text(layer, at.x, at.y + 0.25, 0.2, label ?? "PUERTA");
  } else if (symbol === "window") {
    dxf.line(layer, at.x - 0.5, at.y, at.x + 0.5, at.y);
    dxf.line(layer, at.x - 0.5, at.y + 0.08, at.x + 0.5, at.y + 0.08);
    dxf.text(layer, at.x, at.y + 0.25, 0.2, label ?? "V");
  } else {
    dxf.text(layer, at.x, at.y, 0.3, label ?? "A-A");
  }
}

export function exportPlanSheetToDxf(sheet: PlanSheet): string {
  const dxf = new SimpleDxf();
  for (const primitive of sheet.primitives) {
    emitPrimitive(dxf, primitive);
  }
  dxf.text("A-ANNO-TTLB", sheet.bounds.minX, sheet.bounds.maxY + 1.2, 0.4, sheet.title);
  dxf.text(
    "A-ANNO-TTLB",
    sheet.bounds.minX,
    sheet.bounds.maxY + 0.6,
    0.25,
    `${sheet.scale} · model ${sheet.model_id}`,
  );

  const lines: string[] = [];
  const pair = (code: number | string, value: number | string) => {
    lines.push(String(code), String(value));
  };
  pair(0, "SECTION");
  pair(2, "HEADER");
  pair(9, "$ACADVER");
  pair(1, "AC1024");
  pair(9, "$INSUNITS");
  pair(70, 6);
  pair(0, "ENDSEC");
  pair(0, "SECTION");
  pair(2, "TABLES");
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
  pair(70, dxf.layers.size);
  for (const layer of dxf.layers) {
    pair(0, "LAYER");
    pair(5, dxf.nextHandle());
    pair(100, "AcDbSymbolTableRecord");
    pair(100, "AcDbLayerTableRecord");
    pair(2, layer);
    pair(70, 0);
    pair(62, 7);
    pair(6, "CONTINUOUS");
  }
  pair(0, "ENDTAB");
  pair(0, "ENDSEC");
  pair(0, "SECTION");
  pair(2, "ENTITIES");
  lines.push(...dxf.entities);
  pair(0, "ENDSEC");
  pair(0, "EOF");
  return `${lines.join("\n")}\n`;
}

export function downloadPlanSheetDxf(sheet: PlanSheet): void {
  const content = exportPlanSheetToDxf(sheet);
  const blob = new Blob([content], { type: "application/dxf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sheet.id}.dxf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadPlanSheetSvg(svgMarkup: string, sheet: PlanSheet): void {
  const blob = new Blob([svgMarkup], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sheet.id}.svg`;
  anchor.click();
  URL.revokeObjectURL(url);
}
