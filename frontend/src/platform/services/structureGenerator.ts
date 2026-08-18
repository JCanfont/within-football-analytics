import type { ArchitecturalModel, SemanticObject } from "../types/architecturalModel";
import type { Point2 } from "../types/envelope";
import type {
  StructuralElement,
  StructuralElementType,
  StructuralModel,
  StructureGeneratorInput,
} from "../types/structure";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function bounds(points: Point2[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function pointInPolygon(point: Point2, polygon: Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i]!.x;
    const yi = polygon[i]!.y;
    const xj = polygon[j]!.x;
    const yj = polygon[j]!.y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function squareAround(center: Point2, size: number): Point2[] {
  const h = size / 2;
  return [
    { x: round2(center.x - h), y: round2(center.y - h) },
    { x: round2(center.x + h), y: round2(center.y - h) },
    { x: round2(center.x + h), y: round2(center.y + h) },
    { x: round2(center.x - h), y: round2(center.y + h) },
  ];
}

function edgeLength(a: Point2, b: Point2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function emptyCounts(): Record<StructuralElementType, number> {
  return {
    Column: 0,
    Beam: 0,
    StructuralWall: 0,
    StructuralSlab: 0,
    Foundation: 0,
    Opening: 0,
  };
}

function countElements(elements: StructuralElement[]): Record<StructuralElementType, number> {
  const counts = emptyCounts();
  for (const element of elements) {
    counts[element.type] += 1;
  }
  return counts;
}

function spacesByStorey(model: ArchitecturalModel): Map<number, SemanticObject[]> {
  const map = new Map<number, SemanticObject[]>();
  for (const object of model.objects) {
    if (object.type !== "Space" || !object.polygon || object.storey_index == null) continue;
    const list = map.get(object.storey_index) ?? [];
    list.push(object);
    map.set(object.storey_index, list);
  }
  return map;
}

function proposeColumnCenters(space: SemanticObject, spacing: number): Point2[] {
  const polygon = space.polygon!;
  const b = bounds(polygon);
  const margin = Math.min(spacing * 0.35, 1.2);
  const centers: Point2[] = [];
  const startX = b.minX + margin;
  const endX = b.maxX - margin;
  const startY = b.minY + margin;
  const endY = b.maxY - margin;

  if (endX <= startX || endY <= startY) {
    const cx = round2((b.minX + b.maxX) / 2);
    const cy = round2((b.minY + b.maxY) / 2);
    const c = { x: cx, y: cy };
    if (pointInPolygon(c, polygon)) return [c];
    return [];
  }

  for (let x = startX; x <= endX + 1e-6; x += spacing) {
    for (let y = startY; y <= endY + 1e-6; y += spacing) {
      const candidate = { x: round2(x), y: round2(y) };
      if (pointInPolygon(candidate, polygon)) {
        centers.push(candidate);
      }
    }
  }

  // Ensure corners near extents exist for a usable grid.
  const corners = [
    { x: round2(startX), y: round2(startY) },
    { x: round2(endX), y: round2(startY) },
    { x: round2(endX), y: round2(endY) },
    { x: round2(startX), y: round2(endY) },
  ];
  for (const corner of corners) {
    if (pointInPolygon(corner, polygon) && !centers.some((c) => Math.hypot(c.x - corner.x, c.y - corner.y) < 0.2)) {
      centers.push(corner);
    }
  }

  return centers;
}

/**
 * Generates preliminary STRUCT geometry coordinated with the ARCH model.
 * This is NOT a signed structural calculation.
 */
export function generateStructuralModel(input: StructureGeneratorInput): StructuralModel {
  const model = input.architecturalModel;
  const spacing = input.grid_spacing_m ?? 5.5;
  const columnSection = input.column_section_m ?? 0.4;
  const beamWidth = input.beam_width_m ?? 0.3;
  const beamDepth = input.beam_depth_m ?? 0.45;
  const foundationPad = input.foundation_pad_m ?? 1.2;

  const elements: StructuralElement[] = [];
  const storeySpaces = spacesByStorey(model);
  const storeyElevations = new Map<number, number>();
  for (const object of model.objects) {
    if (object.type === "Storey" && object.storey_index != null) {
      storeyElevations.set(object.storey_index, object.level_elevation_m ?? 0);
    }
  }

  const storeyIndexes = [...storeySpaces.keys()].sort((a, b) => a - b);
  const columnsByStorey = new Map<number, Array<{ id: string; center: Point2; host: string }>>();

  for (const storeyIndex of storeyIndexes) {
    const elevation = storeyElevations.get(storeyIndex) ?? storeyIndex * 3;
    const spaces = storeySpaces.get(storeyIndex) ?? [];
    const storeyColumns: Array<{ id: string; center: Point2; host: string }> = [];
    let columnCounter = 0;

    for (const space of spaces) {
      const height = space.height_m ?? 2.7;
      const centers = proposeColumnCenters(space, spacing);
      for (const center of centers) {
        columnCounter += 1;
        const id = `struct-col-s${storeyIndex}-${columnCounter}`;
        elements.push({
          id,
          type: "Column",
          discipline: "STRUCT",
          name: `Pilar ${storeyIndex}.${columnCounter}`,
          host_arch_object_id: space.id,
          storey_index: storeyIndex,
          polygon: squareAround(center, columnSection),
          level_elevation_m: elevation,
          height_m: height,
          thickness_m: null,
          width_m: columnSection,
          depth_m: columnSection,
          length_m: null,
          material_hint: "reinforced_concrete_prelim",
          properties: {
            grid_spacing_m: spacing,
            preliminary: true,
          },
        });
        storeyColumns.push({ id, center, host: space.id });
      }

      // Structural slab linked to ARCH slab/space (same storey + overlapping bounds).
      const spaceBounds = bounds(space.polygon!);
      const archSlab = model.objects.find((o) => {
        if (o.type !== "Slab" || o.storey_index !== storeyIndex || !o.polygon) return false;
        const sb = bounds(o.polygon);
        return (
          Math.abs(sb.minX - spaceBounds.minX) < 0.05 &&
          Math.abs(sb.maxX - spaceBounds.maxX) < 0.05 &&
          Math.abs(sb.minY - spaceBounds.minY) < 0.05 &&
          Math.abs(sb.maxY - spaceBounds.maxY) < 0.05
        );
      });
      elements.push({
        id: `struct-slab-s${storeyIndex}-${space.id}`,
        type: "StructuralSlab",
        discipline: "STRUCT",
        name: `Forjado estructural ${storeyIndex} · ${space.name}`,
        host_arch_object_id: archSlab?.id ?? space.id,
        storey_index: storeyIndex,
        polygon: space.polygon!,
        level_elevation_m: elevation,
        height_m: null,
        thickness_m: archSlab?.thickness_m ?? 0.3,
        width_m: null,
        depth_m: null,
        length_m: null,
        material_hint: "reinforced_concrete_prelim",
        properties: {
          linked_arch_type: archSlab ? "Slab" : "Space",
          preliminary: true,
        },
      });
    }

    columnsByStorey.set(storeyIndex, storeyColumns);

    // Beams: connect neighboring columns on sorted X then Y rows (axis segments).
    const sorted = [...storeyColumns].sort((a, b) => a.center.y - b.center.y || a.center.x - b.center.x);
    let beamCounter = 0;
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const a = sorted[i]!;
        const b = sorted[j]!;
        const dx = Math.abs(a.center.x - b.center.x);
        const dy = Math.abs(a.center.y - b.center.y);
        const sameRow = dy < 0.35 && dx > 0.5 && dx <= spacing * 1.35;
        const sameCol = dx < 0.35 && dy > 0.5 && dy <= spacing * 1.35;
        if (!sameRow && !sameCol) continue;
        beamCounter += 1;
        elements.push({
          id: `struct-beam-s${storeyIndex}-${beamCounter}`,
          type: "Beam",
          discipline: "STRUCT",
          name: `Viga ${storeyIndex}.${beamCounter}`,
          host_arch_object_id: a.host,
          storey_index: storeyIndex,
          polygon: [
            { x: a.center.x, y: a.center.y },
            { x: b.center.x, y: b.center.y },
          ],
          level_elevation_m: round2(elevation + (spaces[0]?.height_m ?? 2.7) - beamDepth),
          height_m: null,
          thickness_m: null,
          width_m: beamWidth,
          depth_m: beamDepth,
          length_m: round2(edgeLength(a.center, b.center)),
          material_hint: "reinforced_concrete_prelim",
          properties: {
            start_column_id: a.id,
            end_column_id: b.id,
            preliminary: true,
          },
        });
      }
    }
  }

  // Structural walls from ARCH walls (load-bearing candidates: long edges).
  let wallCounter = 0;
  for (const wall of model.objects.filter((o) => o.type === "Wall" && o.polygon && o.polygon.length >= 2)) {
    const length = Number(wall.properties.length_m ?? 0);
    if (length < 4) continue;
    wallCounter += 1;
    elements.push({
      id: `struct-wall-${wallCounter}`,
      type: "StructuralWall",
      discipline: "STRUCT",
      name: `Muro estructural ${wallCounter}`,
      host_arch_object_id: wall.id,
      storey_index: wall.storey_index ?? null,
      polygon: wall.polygon!,
      level_elevation_m: wall.level_elevation_m ?? 0,
      height_m: wall.height_m ?? 2.7,
      thickness_m: wall.thickness_m ?? 0.3,
      width_m: null,
      depth_m: null,
      length_m: round2(length),
      material_hint: "reinforced_concrete_prelim",
      properties: {
        role: "load_bearing_candidate",
        preliminary: true,
      },
    });
  }

  // Foundations under ground-floor columns.
  const groundColumns = columnsByStorey.get(0) ?? [];
  groundColumns.forEach((column, index) => {
    elements.push({
      id: `struct-found-${index + 1}`,
      type: "Foundation",
      discipline: "STRUCT",
      name: `Zapata ${index + 1}`,
      host_arch_object_id: column.id,
      storey_index: 0,
      polygon: squareAround(column.center, foundationPad),
      level_elevation_m: -0.6,
      height_m: 0.6,
      thickness_m: 0.6,
      width_m: foundationPad,
      depth_m: foundationPad,
      length_m: null,
      material_hint: "reinforced_concrete_prelim",
      properties: {
        supports_column_id: column.id,
        foundation_kind: "pad",
        preliminary: true,
      },
    });
  });

  // Openings from ARCH doors/windows (huecos).
  let openingCounter = 0;
  for (const openingHost of model.objects.filter((o) => o.type === "Door" || o.type === "Window")) {
    openingCounter += 1;
    const width = Number(openingHost.properties.width_m ?? (openingHost.type === "Door" ? 1 : 1.2));
    const hostWallId = String(openingHost.properties.host_wall_id ?? "");
    const hostWall = model.objects.find((o) => o.id === hostWallId);
    const axis: Point2[] = hostWall?.polygon?.slice(0, 2) ?? [
      { x: 0, y: 0 },
      { x: width, y: 0 },
    ];
    elements.push({
      id: `struct-open-${openingCounter}`,
      type: "Opening",
      discipline: "STRUCT",
      name: `Hueco ${openingHost.type === "Door" ? "puerta" : "ventana"} ${openingCounter}`,
      host_arch_object_id: openingHost.id,
      storey_index: openingHost.storey_index ?? null,
      polygon: axis,
      level_elevation_m: openingHost.level_elevation_m ?? 0,
      height_m: openingHost.height_m ?? (openingHost.type === "Door" ? 2.1 : 1.2),
      thickness_m: openingHost.thickness_m ?? hostWall?.thickness_m ?? 0.3,
      width_m: width,
      depth_m: null,
      length_m: width,
      material_hint: "unknown",
      properties: {
        opening_kind: openingHost.type === "Door" ? "door" : "window",
        host_wall_id: hostWallId || null,
        preliminary: true,
      },
    });
  }

  return {
    structural_model_id: `struct-${model.model_id}`,
    schema: "platform-struct-v1",
    architectural_model_id: model.model_id,
    urbanism_analysis_id: model.urbanism_analysis_id,
    generated_at: new Date().toISOString(),
    units: "meters",
    grid_spacing_m: spacing,
    elements,
    counts: countElements(elements),
    is_preliminary: true,
    is_signed_calculation: false,
    disclaimer:
      "Geometría estructural preliminar coordinada con el modelo ARCH. No constituye cálculo estructural firmado ni dimensionado normativo.",
  };
}

export function listStructuralElementsByType(
  model: StructuralModel,
  type: StructuralElementType,
): StructuralElement[] {
  return model.elements.filter((element) => element.type === type);
}
