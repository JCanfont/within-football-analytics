import type { ArchitecturalModel } from "../types/architecturalModel";
import type { QuantityLine, QuantityTakeoff } from "../types/coordination";
import type { MepModel } from "../types/mep";
import type { StructuralModel } from "../types/structure";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function pushOrMerge(lines: QuantityLine[], line: QuantityLine) {
  const existing = lines.find((l) => l.code === line.code && l.unit === line.unit);
  if (existing) {
    existing.quantity = round2(existing.quantity + line.quantity);
    existing.source_object_ids.push(...line.source_object_ids);
    return;
  }
  lines.push(line);
}

export function generateQuantityTakeoff(
  architecturalModel: ArchitecturalModel,
  structuralModel: StructuralModel,
  mepModel: MepModel,
): QuantityTakeoff {
  const lines: QuantityLine[] = [];

  const walls = architecturalModel.objects.filter((o) => o.type === "Wall");
  const wallArea = walls.reduce((sum, wall) => {
    const length = Number(wall.properties.length_m ?? 0);
    const height = wall.height_m ?? 2.7;
    return sum + length * height;
  }, 0);
  pushOrMerge(lines, {
    id: "qty-arch-walls",
    code: "ARCH.WALL",
    classification: "tabiques/muros ARCH",
    description: "Muros/tabiques (superficie vertical)",
    source_discipline: "ARCH",
    unit: "m2",
    quantity: round2(wallArea),
    material: "factory_default",
    source_object_ids: walls.map((w) => w.id),
  });

  const doors = architecturalModel.objects.filter((o) => o.type === "Door");
  pushOrMerge(lines, {
    id: "qty-arch-doors",
    code: "ARCH.DOOR",
    classification: "carpintería",
    description: "Puertas",
    source_discipline: "ARCH",
    unit: "ud",
    quantity: doors.length,
    material: null,
    source_object_ids: doors.map((d) => d.id),
  });

  const windows = architecturalModel.objects.filter((o) => o.type === "Window");
  pushOrMerge(lines, {
    id: "qty-arch-windows",
    code: "ARCH.WINDOW",
    classification: "carpintería",
    description: "Ventanas",
    source_discipline: "ARCH",
    unit: "ud",
    quantity: windows.length,
    material: null,
    source_object_ids: windows.map((w) => w.id),
  });

  const slabs = architecturalModel.objects.filter((o) => o.type === "Slab");
  const slabArea = slabs.reduce((sum, slab) => sum + (slab.area_m2 ?? 0), 0);
  pushOrMerge(lines, {
    id: "qty-arch-slabs",
    code: "ARCH.SLAB",
    classification: "forjados ARCH",
    description: "Forjados (superficie)",
    source_discipline: "ARCH",
    unit: "m2",
    quantity: round2(slabArea),
    material: "reinforced_concrete_prelim",
    source_object_ids: slabs.map((s) => s.id),
  });

  const columns = structuralModel.elements.filter((e) => e.type === "Column");
  const columnVolume = columns.reduce((sum, col) => {
    const section = (col.width_m ?? 0.4) * (col.depth_m ?? 0.4);
    return sum + section * (col.height_m ?? 2.7);
  }, 0);
  pushOrMerge(lines, {
    id: "qty-struct-columns",
    code: "STRUCT.COLUMN",
    classification: "hormigón estructura",
    description: "Pilares (volumen hormigón preliminar)",
    source_discipline: "STRUCT",
    unit: "m3",
    quantity: round2(columnVolume),
    material: "reinforced_concrete_prelim",
    source_object_ids: columns.map((c) => c.id),
  });

  const beams = structuralModel.elements.filter((e) => e.type === "Beam");
  const beamLength = beams.reduce((sum, beam) => sum + (beam.length_m ?? 0), 0);
  pushOrMerge(lines, {
    id: "qty-struct-beams",
    code: "STRUCT.BEAM",
    classification: "hormigón estructura",
    description: "Vigas (longitud)",
    source_discipline: "STRUCT",
    unit: "m",
    quantity: round2(beamLength),
    material: "reinforced_concrete_prelim",
    source_object_ids: beams.map((b) => b.id),
  });

  const foundations = structuralModel.elements.filter((e) => e.type === "Foundation");
  const foundationVolume = foundations.reduce((sum, f) => {
    return sum + (f.width_m ?? 1.2) * (f.depth_m ?? 1.2) * (f.thickness_m ?? 0.6);
  }, 0);
  pushOrMerge(lines, {
    id: "qty-struct-foundation",
    code: "STRUCT.FOUNDATION",
    classification: "cimentación",
    description: "Zapatas (volumen)",
    source_discipline: "STRUCT",
    unit: "m3",
    quantity: round2(foundationVolume),
    material: "reinforced_concrete_prelim",
    source_object_ids: foundations.map((f) => f.id),
  });

  const pipes = mepModel.elements.filter((e) => e.type === "Pipe");
  pushOrMerge(lines, {
    id: "qty-mep-pipe",
    code: "MEP.PIPE",
    classification: "tubería",
    description: "Tuberías (longitud)",
    source_discipline: "MEP",
    unit: "m",
    quantity: round2(pipes.reduce((sum, p) => sum + (p.length_m ?? 0), 0)),
    material: null,
    source_object_ids: pipes.map((p) => p.id),
  });

  const ducts = mepModel.elements.filter((e) => e.type === "Duct");
  pushOrMerge(lines, {
    id: "qty-mep-duct",
    code: "MEP.DUCT",
    classification: "conductos",
    description: "Conductos (longitud)",
    source_discipline: "MEP",
    unit: "m",
    quantity: round2(ducts.reduce((sum, d) => sum + (d.length_m ?? 0), 0)),
    material: null,
    source_object_ids: ducts.map((d) => d.id),
  });

  const cables = mepModel.elements.filter((e) => e.type === "Cable");
  pushOrMerge(lines, {
    id: "qty-mep-cable",
    code: "MEP.CABLE",
    classification: "cableado",
    description: "Cables (longitud)",
    source_discipline: "MEP",
    unit: "m",
    quantity: round2(cables.reduce((sum, c) => sum + (c.length_m ?? 0), 0)),
    material: null,
    source_object_ids: cables.map((c) => c.id),
  });

  const luminaires = mepModel.elements.filter(
    (e) => e.type === "Terminal" && e.properties.terminal_kind === "luminaire",
  );
  pushOrMerge(lines, {
    id: "qty-mep-luminaire",
    code: "MEP.LUMINAIRE",
    classification: "iluminación",
    description: "Luminarias",
    source_discipline: "MEP",
    unit: "ud",
    quantity: luminaires.length,
    material: null,
    source_object_ids: luminaires.map((l) => l.id),
  });

  const equipment = mepModel.elements.filter((e) => e.type === "Equipment");
  pushOrMerge(lines, {
    id: "qty-mep-equipment",
    code: "MEP.EQUIPMENT",
    classification: "equipos",
    description: "Equipos MEP",
    source_discipline: "MEP",
    unit: "ud",
    quantity: equipment.length,
    material: null,
    source_object_ids: equipment.map((e) => e.id),
  });

  return {
    takeoff_id: `qty-${architecturalModel.model_id}`,
    architectural_model_id: architecturalModel.model_id,
    structural_model_id: structuralModel.structural_model_id,
    mep_model_id: mepModel.mep_model_id,
    generated_at: new Date().toISOString(),
    lines: lines.filter((line) => line.quantity > 0),
    disclaimer:
      "Mediciones derivadas de objetos ARCH/STRUCT/MEP. Catálogo de precios versionado aparte; no es certificación de obra.",
  };
}
