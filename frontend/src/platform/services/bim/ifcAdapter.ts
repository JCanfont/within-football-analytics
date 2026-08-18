import type { ArchitecturalModel, SemanticObject } from "../../types/architecturalModel";
import type { Point2 } from "../../types/envelope";

/**
 * Isolated BIM adapter: exports a simplified IFC4 SPF from the semantic model.
 * Semantic JSON remains the source of truth. No IfcOpenShell/Revit dependency.
 */

type IfcWriter = {
  lines: string[];
  nextId: number;
  push: (entity: string) => number;
};

function createWriter(): IfcWriter {
  const lines: string[] = [];
  let nextId = 1;
  return {
    lines,
    get nextId() {
      return nextId;
    },
    push(entity: string) {
      const id = nextId;
      nextId += 1;
      lines.push(`#${id}=${entity};`);
      return id;
    },
  };
}

function escapeIfc(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

function guidFromId(id: string): string {
  const base = id.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return (base + "0123456789ABCDEFGHIJ").slice(0, 22);
}

function buildBodyRepresentation(
  writer: IfcWriter,
  contextId: number,
  polygon: Point2[],
  depth: number,
  elevation: number,
): number {
  const origin = polygon[0] ?? { x: 0, y: 0 };
  const pointIds = polygon.map((p) =>
    writer.push(`IFCCARTESIANPOINT((${(p.x - origin.x).toFixed(4)},${(p.y - origin.y).toFixed(4)}))`),
  );
  if (pointIds[0]) {
    pointIds.push(pointIds[0]);
  }
  const polyline = writer.push(`IFCPOLYLINE((${pointIds.map((id) => `#${id}`).join(",")}))`);
  const profile = writer.push(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#${polyline})`);
  const loc = writer.push(
    `IFCCARTESIANPOINT((${origin.x.toFixed(4)},${origin.y.toFixed(4)},${elevation.toFixed(4)}))`,
  );
  const z = writer.push("IFCDIRECTION((0.,0.,1.))");
  const x = writer.push("IFCDIRECTION((1.,0.,0.))");
  const placement = writer.push(`IFCAXIS2PLACEMENT3D(#${loc},#${z},#${x})`);
  const dir = writer.push("IFCDIRECTION((0.,0.,1.))");
  const solid = writer.push(
    `IFCEXTRUDEDAREASOLID(#${profile},#${placement},#${dir},${Math.max(depth, 0.05).toFixed(4)})`,
  );
  return writer.push(`IFCSHAPEREPRESENTATION(#${contextId},'Body','SweptSolid',(#${solid}))`);
}

function productDefinitionShape(writer: IfcWriter, representationId: number): number {
  return writer.push(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${representationId}))`);
}

function localPlacement(writer: IfcWriter, relativeTo: number | null, elevation = 0): number {
  const origin = writer.push(`IFCCARTESIANPOINT((0.,0.,${elevation.toFixed(4)}))`);
  const axis = writer.push(`IFCAXIS2PLACEMENT3D(#${origin},$,$)`);
  if (relativeTo === null) {
    return writer.push(`IFCLOCALPLACEMENT($,#${axis})`);
  }
  return writer.push(`IFCLOCALPLACEMENT(#${relativeTo},#${axis})`);
}

export function exportArchitecturalModelToIfc4(model: ArchitecturalModel): string {
  const writer = createWriter();
  const now = new Date().toISOString();

  const header = [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [DesignTransferView_V1.0]'),'2;1');",
    `FILE_NAME('${escapeIfc(model.model_id)}.ifc','${now}',('WITHIN Platform'),('WITHIN'),'platform-ifc-adapter','platform-ifc-adapter','');`,
    "FILE_SCHEMA(('IFC4'));",
    "ENDSEC;",
    "DATA;",
  ];

  const app = writer.push("IFCAPPLICATION($,'0.1','WITHIN Real Estate Design Platform','WITHIN_PLATFORM')");
  const person = writer.push("IFCPERSON($,$,'Platform',$,$,$,$,$)");
  const org = writer.push("IFCORGANIZATION($,'WITHIN',$,$,$)");
  const personOrg = writer.push(`IFCPERSONANDORGANIZATION(#${person},#${org},$)`);
  const owner = writer.push(
    `IFCOWNERHISTORY(#${personOrg},#${app},$,.ADDED.,$,#${personOrg},#${app},${Math.floor(Date.now() / 1000)})`,
  );

  const lengthUnit = writer.push("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)");
  const unitAssignment = writer.push(`IFCUNITASSIGNMENT((#${lengthUnit}))`);
  const worldOrigin = writer.push("IFCCARTESIANPOINT((0.,0.,0.))");
  const worldAxis = writer.push(`IFCAXIS2PLACEMENT3D(#${worldOrigin},$,$)`);
  const context = writer.push(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#${worldAxis},$)`);
  const subContext = writer.push(
    `IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#${context},$,.MODEL_VIEW.,$)`,
  );

  const project = writer.push(
    `IFCPROJECT('${guidFromId(model.model_id)}',#${owner},'${escapeIfc(model.model_id)}','Architectural parametric model',$,$,$,(#${context}),#${unitAssignment})`,
  );

  const siteObj = model.objects.find((object) => object.type === "Site");
  const buildingObj = model.objects.find((object) => object.type === "Building");
  const projectPlacement = localPlacement(writer, null);
  const sitePlacement = localPlacement(writer, projectPlacement);

  const siteShape = siteObj?.polygon
    ? productDefinitionShape(
        writer,
        buildBodyRepresentation(writer, subContext, siteObj.polygon, 0.05, 0),
      )
    : null;

  const site = writer.push(
    `IFCSITE('${guidFromId(siteObj?.id ?? "site")}',#${owner},'${escapeIfc(siteObj?.name ?? "Site")}','SITE',$,#${sitePlacement},${siteShape ? `#${siteShape}` : "$"},$,.ELEMENT.,$,$,$,$,$)`,
  );

  const buildingPlacement = localPlacement(writer, sitePlacement);
  const building = writer.push(
    `IFCBUILDING('${guidFromId(buildingObj?.id ?? "building")}',#${owner},'${escapeIfc(buildingObj?.name ?? "Building")}','BUILDING',$,#${buildingPlacement},$,$,.ELEMENT.,$,$,$)`,
  );

  writer.push(
    `IFCRELAGGREGATES('${guidFromId("rel-project")}',#${owner},'ProjectContainer',$,#${project},(#${site}))`,
  );
  writer.push(
    `IFCRELAGGREGATES('${guidFromId("rel-site")}',#${owner},'SiteContainer',$,#${site},(#${building}))`,
  );

  const storeys = model.objects.filter((object) => object.type === "Storey");
  const storeyIfcIds: number[] = [];
  const storeyMap = new Map<string, number>();

  for (const storey of storeys) {
    const elevation = storey.level_elevation_m ?? 0;
    const placement = localPlacement(writer, buildingPlacement, elevation);
    const ifcStorey = writer.push(
      `IFCBUILDINGSTOREY('${guidFromId(storey.id)}',#${owner},'${escapeIfc(storey.name)}','STOREY',$,#${placement},$,$,.ELEMENT.,${elevation.toFixed(4)})`,
    );
    storeyIfcIds.push(ifcStorey);
    storeyMap.set(storey.id, ifcStorey);
  }

  if (storeyIfcIds.length) {
    writer.push(
      `IFCRELAGGREGATES('${guidFromId("rel-building")}',#${owner},'BuildingContainer',$,#${building},(${storeyIfcIds
        .map((id) => `#${id}`)
        .join(",")}))`,
    );
  }

  const containedByStorey = new Map<number, number[]>();
  const exportable = model.objects.filter((object) =>
    ["Wall", "Slab", "Roof", "Space"].includes(object.type),
  );

  for (const object of exportable) {
    if (!object.polygon || object.polygon.length < 3) {
      continue;
    }
    const parentStorey = model.objects.find(
      (candidate) => candidate.id === object.parent_id && candidate.type === "Storey",
    );
    const storeyIfc = parentStorey ? storeyMap.get(parentStorey.id) : storeyIfcIds[0];
    if (!storeyIfc) {
      continue;
    }

    const depth =
      object.type === "Slab" || object.type === "Roof"
        ? object.thickness_m ?? 0.3
        : object.height_m ?? 3;
    const representation = buildBodyRepresentation(writer, subContext, object.polygon, depth, 0);
    const shape = productDefinitionShape(writer, representation);
    const placement = localPlacement(writer, null);

    let entityLine = "";
    if (object.type === "Wall") {
      entityLine = `IFCWALL('${guidFromId(object.id)}',#${owner},'${escapeIfc(object.name)}','Wall',$,#${placement},#${shape},$)`;
    } else if (object.type === "Space") {
      entityLine = `IFCSPACE('${guidFromId(object.id)}',#${owner},'${escapeIfc(object.name)}','Space',$,#${placement},#${shape},$,.ELEMENT.,.INTERNAL.,$)`;
    } else if (object.type === "Roof") {
      entityLine = `IFCROOF('${guidFromId(object.id)}',#${owner},'${escapeIfc(object.name)}','Roof',$,#${placement},#${shape},$,.FLAT_ROOF.)`;
    } else {
      entityLine = `IFCSLAB('${guidFromId(object.id)}',#${owner},'${escapeIfc(object.name)}','Slab',$,#${placement},#${shape},$,.FLOOR.)`;
    }

    const productId = writer.push(entityLine);
    const bucket = containedByStorey.get(storeyIfc) ?? [];
    bucket.push(productId);
    containedByStorey.set(storeyIfc, bucket);

    const propSemantic = writer.push(
      `IFCPROPERTYSINGLEVALUE('SemanticId',$,IFCLABEL('${escapeIfc(object.id)}'),$)`,
    );
    const propDiscipline = writer.push(
      `IFCPROPERTYSINGLEVALUE('Discipline',$,IFCLABEL('${object.discipline}'),$)`,
    );
    const pset = writer.push(
      `IFCPROPERTYSET('${guidFromId(`pset-${object.id}`)}',#${owner},'Pset_PlatformIdentity',$,(#${propSemantic},#${propDiscipline}))`,
    );
    writer.push(
      `IFCRELDEFINESBYPROPERTIES('${guidFromId(`reldef-${object.id}`)}',#${owner},$,$,(#${productId}),#${pset})`,
    );
  }

  for (const [storeyIfc, products] of containedByStorey.entries()) {
    writer.push(
      `IFCRELCONTAINEDINSPATIALSTRUCTURE('${guidFromId(`relc-${storeyIfc}`)}',#${owner},$,$,(${products
        .map((id) => `#${id}`)
        .join(",")}),#${storeyIfc})`,
    );
  }

  return `${header.join("\n")}\n${writer.lines.join("\n")}\nENDSEC;\nEND-ISO-10303-21;\n`;
}

export function downloadIfc(model: ArchitecturalModel): void {
  const content = exportArchitecturalModelToIfc4(model);
  const blob = new Blob([content], { type: "application/x-step" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${model.model_id}.ifc`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadArchitecturalModelJson(model: ArchitecturalModel): void {
  const blob = new Blob([JSON.stringify(model, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${model.model_id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function listExportableObjectTypes(model: ArchitecturalModel): SemanticObject["type"][] {
  return [...new Set(model.objects.map((object) => object.type))];
}
