import type {
  ArchitecturalModel,
  ArchitecturalModelInput,
  SemanticObject,
} from "../types/architecturalModel";
import type { Point2 } from "../types/envelope";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function polygonArea(points: Point2[]): number {
  if (points.length < 3) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
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

function centroid(points: Point2[]): Point2 {
  const b = bounds(points);
  return { x: round2((b.minX + b.maxX) / 2), y: round2((b.minY + b.maxY) / 2) };
}

function edgeWallPolygon(a: Point2, b: Point2, thickness: number): Point2[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (thickness / 2);
  const ny = (dx / len) * (thickness / 2);
  return [
    { x: round2(a.x + nx), y: round2(a.y + ny) },
    { x: round2(b.x + nx), y: round2(b.y + ny) },
    { x: round2(b.x - nx), y: round2(b.y - ny) },
    { x: round2(a.x - nx), y: round2(a.y - ny) },
  ];
}

function storeyName(index: number): string {
  return index === 0 ? "Planta Baja" : `Planta ${index}`;
}

export function generateArchitecturalModel(input: ArchitecturalModelInput): ArchitecturalModel {
  const wallThickness = input.wall_thickness_m ?? 0.3;
  const slabThickness = input.slab_thickness_m ?? 0.3;
  const floors = Math.max(1, input.massing.floors);
  const floorToFloor = input.massing.floor_to_floor_m;
  const objects: SemanticObject[] = [];

  const siteId = "obj-site";
  const buildingId = "obj-building";

  objects.push({
    id: siteId,
    type: "Site",
    name: "Solar",
    discipline: "ARCH",
    parent_id: null,
    polygon: input.plot_polygon,
    area_m2: round2(polygonArea(input.plot_polygon)),
    level_elevation_m: 0,
    properties: {
      urbanism_analysis_id: input.urbanism_analysis_id,
      envelope_id: input.envelope_id,
    },
  });

  objects.push({
    id: buildingId,
    type: "Building",
    name: `Edificio massing ${input.massing.key}`,
    discipline: "ARCH",
    parent_id: siteId,
    properties: {
      massing_strategy: input.massing.strategy,
      massing_alternative_id: input.massing.id,
      storeys: floors,
    },
  });

  // Core / stair near footprint centroid of first mass polygon.
  const primaryMass = input.massing.mass_polygons[0] ?? input.plot_polygon;
  const coreCenter = centroid(primaryMass);
  const coreSize = 2.4;
  const corePoly: Point2[] = [
    { x: round2(coreCenter.x - coreSize / 2), y: round2(coreCenter.y - coreSize / 2) },
    { x: round2(coreCenter.x + coreSize / 2), y: round2(coreCenter.y - coreSize / 2) },
    { x: round2(coreCenter.x + coreSize / 2), y: round2(coreCenter.y + coreSize / 2) },
    { x: round2(coreCenter.x - coreSize / 2), y: round2(coreCenter.y + coreSize / 2) },
  ];

  let wallCounter = 0;
  let spaceCounter = 0;
  let slabCounter = 0;
  let doorCounter = 0;
  let windowCounter = 0;

  for (let storeyIndex = 0; storeyIndex < floors; storeyIndex += 1) {
    const elevation = round2(storeyIndex * floorToFloor);
    const storeyId = `obj-storey-${storeyIndex}`;
    objects.push({
      id: storeyId,
      type: "Storey",
      name: storeyName(storeyIndex),
      discipline: "ARCH",
      parent_id: buildingId,
      storey_index: storeyIndex,
      level_elevation_m: elevation,
      height_m: floorToFloor,
      properties: {
        composition_type: "ELEMENTARY",
      },
    });

    // Core + stair on every storey
    objects.push({
      id: `obj-core-${storeyIndex}`,
      type: "Core",
      name: `Núcleo comunicaciones P${storeyIndex}`,
      discipline: "ARCH",
      parent_id: storeyId,
      storey_index: storeyIndex,
      polygon: corePoly,
      height_m: floorToFloor,
      area_m2: round2(coreSize * coreSize),
      level_elevation_m: elevation,
      properties: { contains: "stair+shaft" },
    });
    objects.push({
      id: `obj-stair-${storeyIndex}`,
      type: "Stair",
      name: `Escalera P${storeyIndex}`,
      discipline: "ARCH",
      parent_id: `obj-core-${storeyIndex}`,
      storey_index: storeyIndex,
      polygon: corePoly,
      height_m: floorToFloor,
      level_elevation_m: elevation,
      properties: { flight: storeyIndex === floors - 1 ? "top" : "through" },
    });
    objects.push({
      id: `obj-shaft-${storeyIndex}`,
      type: "Shaft",
      name: `Hueco instalaciones P${storeyIndex}`,
      discipline: "ARCH",
      parent_id: `obj-core-${storeyIndex}`,
      storey_index: storeyIndex,
      polygon: [
        { x: round2(coreCenter.x - 0.4), y: round2(coreCenter.y - 0.4) },
        { x: round2(coreCenter.x + 0.4), y: round2(coreCenter.y - 0.4) },
        { x: round2(coreCenter.x + 0.4), y: round2(coreCenter.y + 0.4) },
        { x: round2(coreCenter.x - 0.4), y: round2(coreCenter.y + 0.4) },
      ],
      height_m: floorToFloor,
      level_elevation_m: elevation,
      properties: { reserved_for: "MEP" },
    });

    input.massing.mass_polygons.forEach((massPoly, massIndex) => {
      spaceCounter += 1;
      const spaceId = `obj-space-${storeyIndex}-${massIndex}`;
      const area = round2(polygonArea(massPoly));
      objects.push({
        id: spaceId,
        type: "Space",
        name: storeyIndex === 0 && massIndex === 0 ? "Espacio PB" : `Espacio ${storeyIndex}.${massIndex + 1}`,
        discipline: "ARCH",
        parent_id: storeyId,
        storey_index: storeyIndex,
        polygon: massPoly,
        area_m2: area,
        height_m: floorToFloor - slabThickness,
        level_elevation_m: elevation,
        properties: {
          long_name: `Space storey ${storeyIndex} zone ${massIndex + 1}`,
        },
      });

      slabCounter += 1;
      objects.push({
        id: `obj-slab-${storeyIndex}-${massIndex}`,
        type: "Slab",
        name: `Forjado ${storeyIndex}.${massIndex + 1}`,
        discipline: "ARCH",
        parent_id: storeyId,
        storey_index: storeyIndex,
        polygon: massPoly,
        thickness_m: slabThickness,
        area_m2: area,
        level_elevation_m: elevation,
        properties: { predefined_type: "FLOOR" },
      });

      for (let i = 0; i < massPoly.length; i += 1) {
        const a = massPoly[i]!;
        const b = massPoly[(i + 1) % massPoly.length]!;
        wallCounter += 1;
        const wallId = `obj-wall-${storeyIndex}-${massIndex}-${i}`;
        objects.push({
          id: wallId,
          type: "Wall",
          name: `Muro ${storeyIndex}.${massIndex + 1}.${i + 1}`,
          discipline: "ARCH",
          parent_id: storeyId,
          storey_index: storeyIndex,
          polygon: edgeWallPolygon(a, b, wallThickness),
          height_m: floorToFloor,
          thickness_m: wallThickness,
          level_elevation_m: elevation,
          properties: {
            length_m: round2(Math.hypot(b.x - a.x, b.y - a.y)),
          },
        });

        // One door on first edge of ground floor primary mass; windows on long edges.
        const edgeLen = Math.hypot(b.x - a.x, b.y - a.y);
        if (storeyIndex === 0 && massIndex === 0 && i === 0) {
          doorCounter += 1;
          objects.push({
            id: `obj-door-${doorCounter}`,
            type: "Door",
            name: "Acceso principal",
            discipline: "ARCH",
            parent_id: wallId,
            storey_index: storeyIndex,
            height_m: 2.1,
            thickness_m: wallThickness,
            level_elevation_m: elevation,
            properties: { host_wall_id: wallId, width_m: 1.0 },
          });
        } else if (edgeLen > 4) {
          windowCounter += 1;
          objects.push({
            id: `obj-window-${windowCounter}`,
            type: "Window",
            name: `Ventana ${windowCounter}`,
            discipline: "ARCH",
            parent_id: wallId,
            storey_index: storeyIndex,
            height_m: 1.2,
            level_elevation_m: elevation + 1.0,
            properties: { host_wall_id: wallId, width_m: Math.min(1.8, edgeLen * 0.35) },
          });
        }
      }
    });

    // Courtyards as outdoor voids / terraces on ground + roof terrace concept on top.
    input.massing.courtyard_polygons.forEach((court, courtIndex) => {
      objects.push({
        id: `obj-court-${storeyIndex}-${courtIndex}`,
        type: "Terrace",
        name: storeyIndex === 0 ? `Patio ${courtIndex + 1}` : `Vacío patio P${storeyIndex}.${courtIndex + 1}`,
        discipline: "ARCH",
        parent_id: storeyId,
        storey_index: storeyIndex,
        polygon: court,
        area_m2: round2(polygonArea(court)),
        level_elevation_m: elevation,
        properties: { is_courtyard: true },
      });
    });
  }

  // Roof on top of each mass
  input.massing.mass_polygons.forEach((massPoly, massIndex) => {
    objects.push({
      id: `obj-roof-${massIndex}`,
      type: "Roof",
      name: `Cubierta ${massIndex + 1}`,
      discipline: "ARCH",
      parent_id: buildingId,
      polygon: massPoly,
      thickness_m: slabThickness,
      area_m2: round2(polygonArea(massPoly)),
      level_elevation_m: round2(floors * floorToFloor),
      properties: { predefined_type: "FLAT_ROOF" },
    });
  });

  // Optional parking placeholder on site if ground footprint leaves residual area.
  const plotArea = polygonArea(input.plot_polygon);
  const footprint = input.massing.metrics.footprint_area_m2;
  if (plotArea - footprint > 40) {
    const b = bounds(input.plot_polygon);
    objects.push({
      id: "obj-parking-1",
      type: "ParkingSpace",
      name: "Plaza aparcamiento (reserva)",
      discipline: "ARCH",
      parent_id: siteId,
      polygon: [
        { x: round2(b.minX + 1), y: round2(b.minY + 1) },
        { x: round2(b.minX + 3.5), y: round2(b.minY + 1) },
        { x: round2(b.minX + 3.5), y: round2(b.minY + 6) },
        { x: round2(b.minX + 1), y: round2(b.minY + 6) },
      ],
      area_m2: 12.5,
      level_elevation_m: 0,
      properties: { provisional: true },
    });
  }

  return {
    model_id: `arch-${input.massing.id}`,
    schema: "platform-arch-v1",
    urbanism_analysis_id: input.urbanism_analysis_id,
    envelope_id: input.envelope_id,
    massing_alternative_id: input.massing.id,
    massing_key: input.massing.key,
    generated_at: new Date().toISOString(),
    units: "meters",
    objects,
    storey_count: floors,
    gross_floor_area_m2: input.massing.metrics.gross_floor_area_m2,
    disclaimer:
      "Modelo arquitectónico paramétrico semántico (fuente de verdad). La malla/visualización e IFC son derivados. Structure/MEP se conectarán sobre los mismos IDs.",
  };
}

export function countObjectsByType(model: ArchitecturalModel): Record<string, number> {
  return model.objects.reduce<Record<string, number>>((acc, object) => {
    acc[object.type] = (acc[object.type] ?? 0) + 1;
    return acc;
  }, {});
}
