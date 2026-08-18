import type { ArchitecturalModel, SemanticObject } from "../types/architecturalModel";
import type { Point2 } from "../types/envelope";
import type { PlanPrimitive, PlanSet, PlanSheet } from "../types/planSheet";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function boundsOf(points: Point2[]): PlanSheet["bounds"] {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function expandBounds(bounds: PlanSheet["bounds"], pad: number): PlanSheet["bounds"] {
  return {
    minX: bounds.minX - pad,
    minY: bounds.minY - pad,
    maxX: bounds.maxX + pad,
    maxY: bounds.maxY + pad,
  };
}

function mergeBounds(a: PlanSheet["bounds"], b: PlanSheet["bounds"]): PlanSheet["bounds"] {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function polygonCentroid(points: Point2[]): Point2 {
  const b = boundsOf(points);
  return { x: round2((b.minX + b.maxX) / 2), y: round2((b.minY + b.maxY) / 2) };
}

function childrenOf(model: ArchitecturalModel, parentId: string): SemanticObject[] {
  return model.objects.filter((object) => object.parent_id === parentId);
}

function overallFootprint(model: ArchitecturalModel): Point2[] {
  const site = model.objects.find((object) => object.type === "Site");
  if (site?.polygon?.length) {
    return site.polygon;
  }
  const slabs = model.objects.filter((object) => object.type === "Slab" && object.polygon);
  const points = slabs.flatMap((slab) => slab.polygon ?? []);
  if (!points.length) {
    return [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
  }
  const b = boundsOf(points);
  return [
    { x: b.minX, y: b.minY },
    { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY },
    { x: b.minX, y: b.maxY },
  ];
}

function dimPrimitives(bounds: PlanSheet["bounds"], prefix: string): PlanPrimitive[] {
  return [
    {
      id: `${prefix}-dim-x`,
      kind: "dim",
      layer: "A-ANNO-DIMS",
      a: { x: bounds.minX, y: bounds.minY },
      b: { x: bounds.maxX, y: bounds.minY },
      offset: -1.2,
      label: `${round2(bounds.maxX - bounds.minX).toFixed(2)} m`,
    },
    {
      id: `${prefix}-dim-y`,
      kind: "dim",
      layer: "A-ANNO-DIMS",
      a: { x: bounds.minX, y: bounds.minY },
      b: { x: bounds.minX, y: bounds.maxY },
      offset: -1.2,
      label: `${round2(bounds.maxY - bounds.minY).toFixed(2)} m`,
    },
  ];
}

function axisPrimitives(bounds: PlanSheet["bounds"], prefix: string): PlanPrimitive[] {
  const cx = round2((bounds.minX + bounds.maxX) / 2);
  const cy = round2((bounds.minY + bounds.maxY) / 2);
  return [
    {
      id: `${prefix}-axis-x`,
      kind: "polyline",
      layer: "A-ANNO-AXIS",
      points: [
        { x: bounds.minX - 0.8, y: cy },
        { x: bounds.maxX + 0.8, y: cy },
      ],
      dashed: true,
    },
    {
      id: `${prefix}-axis-y`,
      kind: "polyline",
      layer: "A-ANNO-AXIS",
      points: [
        { x: cx, y: bounds.minY - 0.8 },
        { x: cx, y: bounds.maxY + 0.8 },
      ],
      dashed: true,
    },
    {
      id: `${prefix}-axis-label-a`,
      kind: "text",
      layer: "A-ANNO-AXIS",
      at: { x: bounds.minX - 1.1, y: cy },
      text: "A",
      height: 0.35,
    },
    {
      id: `${prefix}-axis-label-1`,
      kind: "text",
      layer: "A-ANNO-AXIS",
      at: { x: cx, y: bounds.minY - 1.1 },
      text: "1",
      height: 0.35,
    },
  ];
}

function buildFloorPlanSheet(model: ArchitecturalModel, storey: SemanticObject): PlanSheet {
  const primitives: PlanPrimitive[] = [];
  const storeyChildren = childrenOf(model, storey.id);
  const site = model.objects.find((object) => object.type === "Site");

  if (site?.polygon) {
    primitives.push({
      id: `${storey.id}-site`,
      kind: "polyline",
      layer: "A-SITE",
      points: site.polygon,
      closed: true,
      dashed: true,
    });
  }

  for (const object of storeyChildren) {
    if (!object.polygon?.length) {
      continue;
    }
    if (object.type === "Wall") {
      primitives.push({
        id: `${object.id}-pl`,
        kind: "polyline",
        layer: "A-WALL",
        points: object.polygon,
        closed: true,
      });
    } else if (object.type === "Space") {
      primitives.push({
        id: `${object.id}-pl`,
        kind: "polyline",
        layer: "A-AREA",
        points: object.polygon,
        closed: true,
      });
      const c = polygonCentroid(object.polygon);
      primitives.push({
        id: `${object.id}-name`,
        kind: "text",
        layer: "A-FLOR-IDEN",
        at: c,
        text: object.name,
        height: 0.35,
      });
      if (object.area_m2 != null) {
        primitives.push({
          id: `${object.id}-area`,
          kind: "text",
          layer: "A-FLOR-IDEN",
          at: { x: c.x, y: c.y - 0.45 },
          text: `${object.area_m2.toFixed(1)} m2`,
          height: 0.28,
        });
      }
    } else if (object.type === "Core" || object.type === "Stair") {
      primitives.push({
        id: `${object.id}-pl`,
        kind: "polyline",
        layer: "A-FLOR-STRS",
        points: object.polygon,
        closed: true,
      });
      primitives.push({
        id: `${object.id}-name`,
        kind: "text",
        layer: "A-FLOR-IDEN",
        at: polygonCentroid(object.polygon),
        text: object.type === "Stair" ? "ESC" : "NUCLEO",
        height: 0.28,
      });
    } else if (object.type === "Terrace") {
      primitives.push({
        id: `${object.id}-pl`,
        kind: "polyline",
        layer: "A-AREA-TERR",
        points: object.polygon,
        closed: true,
        dashed: true,
      });
    }
  }

  // Doors / windows hosted by walls of this storey
  const wallIds = new Set(storeyChildren.filter((object) => object.type === "Wall").map((w) => w.id));
  for (const object of model.objects) {
    if (object.type !== "Door" && object.type !== "Window") {
      continue;
    }
    const hostId = String(object.properties.host_wall_id ?? object.parent_id ?? "");
    if (!wallIds.has(hostId)) {
      continue;
    }
    const host = model.objects.find((candidate) => candidate.id === hostId);
    const at = host?.polygon ? polygonCentroid(host.polygon) : { x: 0, y: 0 };
    primitives.push({
      id: `${object.id}-sym`,
      kind: "symbol",
      layer: object.type === "Door" ? "A-DOOR" : "A-GLAZ",
      at,
      symbol: object.type === "Door" ? "door" : "window",
      label: object.name,
    });
  }

  const geometryPoints = primitives.flatMap((primitive) => {
    if (primitive.kind === "polyline") {
      return primitive.points;
    }
    if (primitive.kind === "text" || primitive.kind === "symbol") {
      return [primitive.at];
    }
    return [primitive.a, primitive.b];
  });
  const bounds = expandBounds(boundsOf(geometryPoints.length ? geometryPoints : overallFootprint(model)), 2);
  primitives.push(...axisPrimitives(bounds, storey.id));
  primitives.push(...dimPrimitives(bounds, storey.id));
  primitives.push({
    id: `${storey.id}-north`,
    kind: "symbol",
    layer: "A-ANNO-NORT",
    at: { x: bounds.maxX - 0.8, y: bounds.maxY - 0.8 },
    symbol: "north",
  });

  return {
    id: `sheet-floor-${storey.storey_index ?? 0}`,
    kind: "floor_plan",
    title: `Planta ${storey.name}`,
    scale: "1:100",
    storey_index: storey.storey_index ?? 0,
    model_id: model.model_id,
    bounds,
    primitives,
    notes: [
      "Plano derivado del modelo semántico ARCH.",
      `Storey elevation: ${storey.level_elevation_m ?? 0} m`,
    ],
  };
}

function buildRoofPlanSheet(model: ArchitecturalModel): PlanSheet {
  const roofs = model.objects.filter((object) => object.type === "Roof" && object.polygon);
  const site = model.objects.find((object) => object.type === "Site");
  const primitives: PlanPrimitive[] = [];

  if (site?.polygon) {
    primitives.push({
      id: "roof-site",
      kind: "polyline",
      layer: "A-SITE",
      points: site.polygon,
      closed: true,
      dashed: true,
    });
  }

  roofs.forEach((roof, index) => {
    primitives.push({
      id: `${roof.id}-pl`,
      kind: "polyline",
      layer: "A-ROOF",
      points: roof.polygon!,
      closed: true,
    });
    primitives.push({
      id: `${roof.id}-name`,
      kind: "text",
      layer: "A-FLOR-IDEN",
      at: polygonCentroid(roof.polygon!),
      text: roof.name || `Cubierta ${index + 1}`,
      height: 0.35,
    });
    if (roof.area_m2 != null) {
      primitives.push({
        id: `${roof.id}-area`,
        kind: "text",
        layer: "A-FLOR-IDEN",
        at: {
          x: polygonCentroid(roof.polygon!).x,
          y: polygonCentroid(roof.polygon!).y - 0.45,
        },
        text: `${roof.area_m2.toFixed(1)} m2`,
        height: 0.28,
      });
    }
  });

  const points = primitives.flatMap((primitive) => (primitive.kind === "polyline" ? primitive.points : []));
  const bounds = expandBounds(boundsOf(points.length ? points : overallFootprint(model)), 2);
  primitives.push(...dimPrimitives(bounds, "roof"));
  primitives.push({
    id: "roof-north",
    kind: "symbol",
    layer: "A-ANNO-NORT",
    at: { x: bounds.maxX - 0.8, y: bounds.maxY - 0.8 },
    symbol: "north",
  });

  return {
    id: "sheet-roof",
    kind: "roof_plan",
    title: "Planta de cubierta",
    scale: "1:100",
    model_id: model.model_id,
    bounds,
    primitives,
    notes: ["Cubierta derivada de objetos Roof del modelo."],
  };
}

function buildElevationSheet(model: ArchitecturalModel): PlanSheet {
  const footprint = overallFootprint(model);
  const b = boundsOf(footprint);
  const width = b.maxX - b.minX;
  const height = model.storey_count * 3;
  const primitives: PlanPrimitive[] = [];

  // Ground line
  primitives.push({
    id: "elev-ground",
    kind: "polyline",
    layer: "A-ANNO-DIMS",
    points: [
      { x: -1, y: 0 },
      { x: width + 1, y: 0 },
    ],
  });

  // Facade rectangle
  primitives.push({
    id: "elev-facade",
    kind: "polyline",
    layer: "A-WALL",
    points: [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
    closed: true,
  });

  for (let i = 1; i < model.storey_count; i += 1) {
    const y = i * 3;
    primitives.push({
      id: `elev-level-${i}`,
      kind: "polyline",
      layer: "A-ANNO-AXIS",
      points: [
        { x: 0, y },
        { x: width, y },
      ],
      dashed: true,
    });
    primitives.push({
      id: `elev-level-label-${i}`,
      kind: "text",
      layer: "A-ANNO-TEXT",
      at: { x: -0.8, y },
      text: `+${y.toFixed(2)}`,
      height: 0.3,
    });
  }

  // Windows as elevation marks
  const windows = model.objects.filter((object) => object.type === "Window");
  windows.slice(0, 12).forEach((window, index) => {
    const storey = Math.max(0, window.storey_index ?? 0);
    const x = ((index + 1) / (Math.min(windows.length, 12) + 1)) * width;
    const sill = storey * 3 + 1;
    primitives.push({
      id: `${window.id}-elev`,
      kind: "polyline",
      layer: "A-GLAZ",
      points: [
        { x: x - 0.6, y: sill },
        { x: x + 0.6, y: sill },
        { x: x + 0.6, y: sill + 1.2 },
        { x: x - 0.6, y: sill + 1.2 },
      ],
      closed: true,
    });
  });

  // Door on ground
  primitives.push({
    id: "elev-door",
    kind: "polyline",
    layer: "A-DOOR",
    points: [
      { x: width * 0.5 - 0.5, y: 0 },
      { x: width * 0.5 + 0.5, y: 0 },
      { x: width * 0.5 + 0.5, y: 2.1 },
      { x: width * 0.5 - 0.5, y: 2.1 },
    ],
    closed: true,
  });

  primitives.push({
    id: "elev-title",
    kind: "text",
    layer: "A-ANNO-TTLB",
    at: { x: width / 2, y: height + 1 },
    text: "Alzado Sur",
    height: 0.4,
  });

  const bounds = expandBounds({ minX: -1.5, minY: -1, maxX: width + 1.5, maxY: height + 1.8 }, 0.5);
  primitives.push(...dimPrimitives({ minX: 0, minY: 0, maxX: width, maxY: height }, "elev"));

  return {
    id: "sheet-elevation-south",
    kind: "elevation",
    title: "Alzado Sur",
    scale: "1:100",
    model_id: model.model_id,
    bounds,
    primitives,
    notes: ["Alzado esquemático generado desde plantas/alturas del modelo."],
  };
}

function buildSectionSheet(model: ArchitecturalModel): PlanSheet {
  const footprint = overallFootprint(model);
  const b = boundsOf(footprint);
  const depth = b.maxY - b.minY;
  const height = model.storey_count * 3;
  const primitives: PlanPrimitive[] = [];

  primitives.push({
    id: "sec-ground",
    kind: "polyline",
    layer: "A-ANNO-DIMS",
    points: [
      { x: -1, y: 0 },
      { x: depth + 1, y: 0 },
    ],
  });

  // Cut mass as filled outline
  primitives.push({
    id: "sec-mass",
    kind: "polyline",
    layer: "A-WALL",
    points: [
      { x: 0, y: 0 },
      { x: depth, y: 0 },
      { x: depth, y: height },
      { x: 0, y: height },
    ],
    closed: true,
  });

  for (let i = 0; i <= model.storey_count; i += 1) {
    const y = i * 3;
    primitives.push({
      id: `sec-slab-${i}`,
      kind: "polyline",
      layer: "A-SLAB",
      points: [
        { x: 0, y },
        { x: depth, y },
      ],
    });
  }

  // Core cut
  primitives.push({
    id: "sec-core",
    kind: "polyline",
    layer: "A-FLOR-STRS",
    points: [
      { x: depth * 0.45, y: 0 },
      { x: depth * 0.55, y: 0 },
      { x: depth * 0.55, y: height },
      { x: depth * 0.45, y: height },
    ],
    closed: true,
  });

  primitives.push({
    id: "sec-mark",
    kind: "symbol",
    layer: "A-ANNO-TEXT",
    at: { x: depth + 1.2, y: height / 2 },
    symbol: "section_mark",
    label: "A-A",
  });

  const bounds = expandBounds({ minX: -1.5, minY: -1, maxX: depth + 2, maxY: height + 1.5 }, 0.5);
  primitives.push(...dimPrimitives({ minX: 0, minY: 0, maxX: depth, maxY: height }, "sec"));

  return {
    id: "sheet-section-aa",
    kind: "section",
    title: "Sección A-A",
    scale: "1:100",
    model_id: model.model_id,
    bounds,
    primitives,
    notes: ["Sección esquemática por eje longitudinal del modelo."],
  };
}

export function generatePlanSetFromModel(model: ArchitecturalModel): PlanSet {
  const storeys = model.objects
    .filter((object) => object.type === "Storey")
    .sort((a, b) => (a.storey_index ?? 0) - (b.storey_index ?? 0));

  const sheets: PlanSheet[] = [
    ...storeys.map((storey) => buildFloorPlanSheet(model, storey)),
    buildRoofPlanSheet(model),
    buildElevationSheet(model),
    buildSectionSheet(model),
  ];

  return {
    plan_set_id: `plans-${model.model_id}`,
    model_id: model.model_id,
    generated_at: new Date().toISOString(),
    sheets,
    disclaimer:
      "Planos 2D derivados del modelo semántico. Si el modelo cambia, estas hojas deben regenerarse.",
  };
}

export function combineSheetBounds(sheets: PlanSheet[]): PlanSheet["bounds"] {
  return sheets.reduce((acc, sheet) => mergeBounds(acc, sheet.bounds), sheets[0]!.bounds);
}
