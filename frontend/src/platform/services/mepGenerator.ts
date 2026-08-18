import type { ArchitecturalModel, SemanticObject } from "../types/architecturalModel";
import type { Point2 } from "../types/envelope";
import type {
  MepElement,
  MepElementType,
  MepGeneratorInput,
  MepModel,
  MepSystem,
} from "../types/mep";

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
    cx: (Math.min(...xs) + Math.max(...xs)) / 2,
    cy: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

function pathLength(path: Point2[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y);
  }
  return round2(total);
}

function emptyCounts(): Record<MepElementType, number> {
  return {
    Equipment: 0,
    Terminal: 0,
    Pipe: 0,
    Duct: 0,
    CableTray: 0,
    Cable: 0,
    Connection: 0,
    Circuit: 0,
    Shaft: 0,
  };
}

function countElements(elements: MepElement[]): Record<MepElementType, number> {
  const counts = emptyCounts();
  for (const element of elements) {
    counts[element.type] += 1;
  }
  return counts;
}

const SYSTEM_DISCIPLINE: Record<MepSystem, MepElement["discipline"]> = {
  electrical: "MEP_ELECTRICAL",
  lighting: "MEP_LIGHTING",
  plumbing: "MEP_PLUMBING",
  drainage: "MEP_DRAINAGE",
  dhw: "MEP_DHW",
  hvac_heating: "MEP_HVAC_HEATING",
  hvac_cooling: "MEP_HVAC_COOLING",
  ventilation: "MEP_VENTILATION",
  gas: "MEP_GAS",
  telecom: "MEP_TELECOM",
  fire: "MEP_FIRE",
};

function element(partial: Omit<MepElement, "discipline"> & { system: MepSystem }): MepElement {
  return {
    ...partial,
    discipline: SYSTEM_DISCIPLINE[partial.system],
  };
}

function spaces(model: ArchitecturalModel): SemanticObject[] {
  return model.objects.filter((o) => o.type === "Space" && o.polygon && o.storey_index != null);
}

function shafts(model: ArchitecturalModel): SemanticObject[] {
  return model.objects.filter((o) => o.type === "Shaft" && o.polygon);
}

function cores(model: ArchitecturalModel): SemanticObject[] {
  return model.objects.filter((o) => o.type === "Core" && o.polygon);
}

/**
 * Preliminary coordinated MEP model derived from ARCH spaces/shafts/cores.
 * Specialized plan views can filter by discipline/system later.
 * Not a sized/signed MEP design.
 */
export function generateMepModel(input: MepGeneratorInput): MepModel {
  const model = input.architecturalModel;
  const elements: MepElement[] = [];
  const spaceList = spaces(model);
  const shaftList = shafts(model);
  const coreList = cores(model);
  const primarySpace = spaceList[0];
  const primaryCore = coreList[0] ?? shaftList[0];

  // Coordinated shafts (reuse ARCH shaft geometry).
  shaftList.forEach((shaft, index) => {
    elements.push(
      element({
        id: `mep-shaft-${index + 1}`,
        type: "Shaft",
        system: "ventilation",
        name: `Shaft MEP ${index + 1}`,
        host_arch_object_id: shaft.id,
        storey_index: shaft.storey_index ?? null,
        path: shaft.polygon!,
        level_elevation_m: shaft.level_elevation_m ?? 0,
        diameter_mm: null,
        width_mm: 800,
        height_mm: 800,
        length_m: shaft.height_m ?? null,
        circuit_id: null,
        properties: { reserved_for: "multi_trade", preliminary: true },
      }),
    );
  });

  // Electrical equipment + circuit in core / first space.
  if (primaryCore?.polygon || primarySpace?.polygon) {
    const host = primaryCore ?? primarySpace!;
    const b = bounds(host.polygon!);
    const panelPoint = { x: round2(b.cx), y: round2(b.cy) };
    const circuitId = "mep-circuit-main";
    elements.push(
      element({
        id: "mep-eq-panel-main",
        type: "Equipment",
        system: "electrical",
        name: "Cuadro general",
        host_arch_object_id: host.id,
        storey_index: host.storey_index ?? 0,
        path: [panelPoint],
        level_elevation_m: (host.level_elevation_m ?? 0) + 1.4,
        diameter_mm: null,
        width_mm: 600,
        height_mm: 800,
        length_m: null,
        circuit_id: circuitId,
        properties: { role: "main_distribution_board", preliminary: true },
      }),
    );
    elements.push(
      element({
        id: circuitId,
        type: "Circuit",
        system: "electrical",
        name: "Circuito general vivienda/edificio",
        host_arch_object_id: host.id,
        storey_index: host.storey_index ?? 0,
        path: [panelPoint],
        level_elevation_m: host.level_elevation_m ?? 0,
        diameter_mm: null,
        width_mm: null,
        height_mm: null,
        length_m: null,
        circuit_id: circuitId,
        properties: { voltage_v: 230, phases: 1, preliminary: true },
      }),
    );
  }

  // Lighting terminals + cable tray per space.
  spaceList.forEach((space, index) => {
    const b = bounds(space.polygon!);
    const light = { x: round2(b.cx), y: round2(b.cy) };
    const trayStart = { x: round2(b.minX + 0.4), y: round2(b.cy) };
    const trayEnd = { x: round2(b.maxX - 0.4), y: round2(b.cy) };
    const circuitId = `mep-circuit-light-${index + 1}`;
    elements.push(
      element({
        id: circuitId,
        type: "Circuit",
        system: "lighting",
        name: `Circuito iluminación ${index + 1}`,
        host_arch_object_id: space.id,
        storey_index: space.storey_index ?? null,
        path: [light],
        level_elevation_m: (space.level_elevation_m ?? 0) + (space.height_m ?? 2.7) - 0.1,
        diameter_mm: null,
        width_mm: null,
        height_mm: null,
        length_m: null,
        circuit_id: circuitId,
        properties: { preliminary: true },
      }),
    );
    elements.push(
      element({
        id: `mep-term-light-${index + 1}`,
        type: "Terminal",
        system: "lighting",
        name: `Luminaria ${index + 1}`,
        host_arch_object_id: space.id,
        storey_index: space.storey_index ?? null,
        path: [light],
        level_elevation_m: (space.level_elevation_m ?? 0) + (space.height_m ?? 2.7) - 0.05,
        diameter_mm: null,
        width_mm: 200,
        height_mm: 50,
        length_m: null,
        circuit_id: circuitId,
        properties: { terminal_kind: "luminaire", preliminary: true },
      }),
    );
    elements.push(
      element({
        id: `mep-tray-${index + 1}`,
        type: "CableTray",
        system: "electrical",
        name: `Bandeja eléctrica ${index + 1}`,
        host_arch_object_id: space.id,
        storey_index: space.storey_index ?? null,
        path: [trayStart, trayEnd],
        level_elevation_m: (space.level_elevation_m ?? 0) + (space.height_m ?? 2.7) - 0.25,
        diameter_mm: null,
        width_mm: 200,
        height_mm: 60,
        length_m: pathLength([trayStart, trayEnd]),
        circuit_id: null,
        properties: { preliminary: true },
      }),
    );
    elements.push(
      element({
        id: `mep-cable-${index + 1}`,
        type: "Cable",
        system: "lighting",
        name: `Cable iluminación ${index + 1}`,
        host_arch_object_id: space.id,
        storey_index: space.storey_index ?? null,
        path: [trayStart, light],
        level_elevation_m: (space.level_elevation_m ?? 0) + (space.height_m ?? 2.7) - 0.2,
        diameter_mm: 12,
        width_mm: null,
        height_mm: null,
        length_m: pathLength([trayStart, light]),
        circuit_id: circuitId,
        properties: { preliminary: true },
      }),
    );
  });

  // Plumbing / DHW / drainage risers via shaft or core.
  const riserHost = shaftList[0] ?? coreList[0] ?? primarySpace;
  if (riserHost?.polygon) {
    const b = bounds(riserHost.polygon);
    const riser = { x: round2(b.cx), y: round2(b.cy) };
    const systems: Array<{ system: MepSystem; name: string; diameter: number }> = [
      { system: "plumbing", name: "Bajante / suministro ACS/AF", diameter: 32 },
      { system: "dhw", name: "Montante ACS", diameter: 25 },
      { system: "drainage", name: "Bajante saneamiento", diameter: 110 },
      { system: "gas", name: "Montante gas", diameter: 20 },
    ];
    systems.forEach((spec, index) => {
      const path = [
        { x: riser.x, y: riser.y },
        { x: riser.x, y: round2(riser.y + 0.01) },
      ];
      elements.push(
        element({
          id: `mep-pipe-riser-${index + 1}`,
          type: "Pipe",
          system: spec.system,
          name: spec.name,
          host_arch_object_id: riserHost.id,
          storey_index: riserHost.storey_index ?? 0,
          path,
          level_elevation_m: riserHost.level_elevation_m ?? 0,
          diameter_mm: spec.diameter,
          width_mm: null,
          height_mm: null,
          length_m: Math.max(1, model.storey_count) * 3,
          circuit_id: null,
          properties: { route: "vertical_riser", preliminary: true },
        }),
      );
    });

    // Wet terminal placeholders on ground floor primary space.
    if (primarySpace?.polygon) {
      const sb = bounds(primarySpace.polygon);
      const sink = { x: round2(sb.minX + 1.2), y: round2(sb.minY + 1.2) };
      elements.push(
        element({
          id: "mep-term-sink-1",
          type: "Terminal",
          system: "plumbing",
          name: "Punto agua cocina/baño (preliminar)",
          host_arch_object_id: primarySpace.id,
          storey_index: primarySpace.storey_index ?? null,
          path: [sink],
          level_elevation_m: (primarySpace.level_elevation_m ?? 0) + 0.9,
          diameter_mm: 15,
          width_mm: null,
          height_mm: null,
          length_m: null,
          circuit_id: null,
          properties: { terminal_kind: "water_outlet", preliminary: true },
        }),
      );
      elements.push(
        element({
          id: "mep-conn-sink-1",
          type: "Connection",
          system: "plumbing",
          name: "Conexión terminal agua",
          host_arch_object_id: primarySpace.id,
          storey_index: primarySpace.storey_index ?? null,
          path: [sink, { x: riser.x, y: riser.y }],
          level_elevation_m: (primarySpace.level_elevation_m ?? 0) + 0.3,
          diameter_mm: 20,
          width_mm: null,
          height_mm: null,
          length_m: pathLength([sink, { x: riser.x, y: riser.y }]),
          circuit_id: null,
          properties: { connects: "mep-term-sink-1", preliminary: true },
        }),
      );
    }
  }

  // HVAC ducts + terminals per storey space.
  spaceList.forEach((space, index) => {
    const b = bounds(space.polygon!);
    const supplyStart = { x: round2(b.minX + 0.8), y: round2(b.maxY - 0.8) };
    const supplyEnd = { x: round2(b.maxX - 0.8), y: round2(b.maxY - 0.8) };
    const diffuser = { x: round2(b.cx), y: round2(b.maxY - 0.8) };
    elements.push(
      element({
        id: `mep-duct-supply-${index + 1}`,
        type: "Duct",
        system: "ventilation",
        name: `Conducto impulsión ${index + 1}`,
        host_arch_object_id: space.id,
        storey_index: space.storey_index ?? null,
        path: [supplyStart, supplyEnd],
        level_elevation_m: (space.level_elevation_m ?? 0) + (space.height_m ?? 2.7) - 0.35,
        diameter_mm: null,
        width_mm: 300,
        height_mm: 200,
        length_m: pathLength([supplyStart, supplyEnd]),
        circuit_id: null,
        properties: { air_role: "supply", preliminary: true },
      }),
    );
    elements.push(
      element({
        id: `mep-term-diffuser-${index + 1}`,
        type: "Terminal",
        system: "ventilation",
        name: `Difusor ${index + 1}`,
        host_arch_object_id: space.id,
        storey_index: space.storey_index ?? null,
        path: [diffuser],
        level_elevation_m: (space.level_elevation_m ?? 0) + (space.height_m ?? 2.7) - 0.05,
        diameter_mm: null,
        width_mm: 300,
        height_mm: 300,
        length_m: null,
        circuit_id: null,
        properties: { terminal_kind: "diffuser", preliminary: true },
      }),
    );
    elements.push(
      element({
        id: `mep-eq-fancoil-${index + 1}`,
        type: "Equipment",
        system: index % 2 === 0 ? "hvac_cooling" : "hvac_heating",
        name: `Unidad terminal clima ${index + 1}`,
        host_arch_object_id: space.id,
        storey_index: space.storey_index ?? null,
        path: [{ x: round2(b.maxX - 1), y: round2(b.minY + 1) }],
        level_elevation_m: (space.level_elevation_m ?? 0) + 2.2,
        diameter_mm: null,
        width_mm: 900,
        height_mm: 300,
        length_m: null,
        circuit_id: null,
        properties: { preliminary: true },
      }),
    );
  });

  // Telecom + fire placeholders near core.
  if (primaryCore?.polygon) {
    const b = bounds(primaryCore.polygon);
    elements.push(
      element({
        id: "mep-eq-telecom-1",
        type: "Equipment",
        system: "telecom",
        name: "Rack telecomunicaciones",
        host_arch_object_id: primaryCore.id,
        storey_index: primaryCore.storey_index ?? 0,
        path: [{ x: round2(b.minX + 0.3), y: round2(b.cy) }],
        level_elevation_m: (primaryCore.level_elevation_m ?? 0) + 0.2,
        diameter_mm: null,
        width_mm: 600,
        height_mm: 800,
        length_m: null,
        circuit_id: null,
        properties: { preliminary: true },
      }),
    );
    elements.push(
      element({
        id: "mep-eq-fire-panel-1",
        type: "Equipment",
        system: "fire",
        name: "Central de detección/incendio",
        host_arch_object_id: primaryCore.id,
        storey_index: primaryCore.storey_index ?? 0,
        path: [{ x: round2(b.maxX - 0.3), y: round2(b.cy) }],
        level_elevation_m: (primaryCore.level_elevation_m ?? 0) + 1.5,
        diameter_mm: null,
        width_mm: 400,
        height_mm: 500,
        length_m: null,
        circuit_id: null,
        properties: { preliminary: true },
      }),
    );
  }

  const systems_present = [...new Set(elements.map((e) => e.system))];

  return {
    mep_model_id: `mep-${model.model_id}`,
    schema: "platform-mep-v1",
    architectural_model_id: model.model_id,
    urbanism_analysis_id: model.urbanism_analysis_id,
    generated_at: new Date().toISOString(),
    units: "meters",
    elements,
    counts: countElements(elements),
    systems_present,
    is_preliminary: true,
    is_sized_design: false,
    disclaimer:
      "Modelo MEP preliminar coordinado con ARCH (equipos, terminales, tuberías, conductos, bandejas/cables, conexiones, circuitos y shafts). No es dimensionado ni proyecto de instalaciones firmado. Las vistas especializadas filtrarán por disciplina.",
  };
}

export function filterMepBySystem(model: MepModel, system: MepSystem): MepElement[] {
  return model.elements.filter((element) => element.system === system);
}

export function filterMepByDiscipline(
  model: MepModel,
  discipline: MepElement["discipline"],
): MepElement[] {
  return model.elements.filter((element) => element.discipline === discipline);
}
