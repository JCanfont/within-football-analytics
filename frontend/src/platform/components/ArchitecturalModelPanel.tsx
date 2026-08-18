import { Boxes, Download, FileJson2 } from "lucide-react";
import {
  downloadArchitecturalModelJson,
  downloadIfc,
} from "../services/bim/ifcAdapter";
import { countObjectsByType } from "../services/architecturalModelGenerator";
import type { ArchitecturalModel } from "../types/architecturalModel";

type Props = {
  model: ArchitecturalModel;
};

export function ArchitecturalModelPanel({ model }: Props) {
  const counts = countObjectsByType(model);
  const storeys = model.objects.filter((object) => object.type === "Storey");

  return (
    <section className="arch-model-panel" aria-label="Modelo arquitectónico BIM">
      <header className="panel-heading">
        <div>
          <h2>
            <Boxes size={18} aria-hidden="true" /> Modelo arquitectónico paramétrico
          </h2>
          <p>{model.disclaimer}</p>
        </div>
      </header>

      <div className="arch-model-actions">
        <button type="button" className="primary-action" onClick={() => downloadIfc(model)}>
          <Download size={16} aria-hidden="true" />
          Exportar IFC4
        </button>
        <button type="button" className="secondary-action" onClick={() => downloadArchitecturalModelJson(model)}>
          <FileJson2 size={16} aria-hidden="true" />
          Descargar JSON semántico
        </button>
      </div>

      <dl className="fp-summary">
        <div>
          <dt>model_id</dt>
          <dd>{model.model_id}</dd>
        </div>
        <div>
          <dt>Massing</dt>
          <dd>{model.massing_key}</dd>
        </div>
        <div>
          <dt>Plantas</dt>
          <dd>{model.storey_count}</dd>
        </div>
        <div>
          <dt>m²t</dt>
          <dd>{model.gross_floor_area_m2.toFixed(1)}</dd>
        </div>
        <div>
          <dt>Objetos</dt>
          <dd>{model.objects.length}</dd>
        </div>
        <div>
          <dt>Schema</dt>
          <dd>{model.schema}</dd>
        </div>
      </dl>

      <div className="arch-model-counts">
        <h3>Inventario semántico</h3>
        <ul>
          {Object.entries(counts).map(([type, count]) => (
            <li key={type}>
              <strong>{type}</strong>
              <span>{count}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="arch-model-tree">
        <h3>Plantas</h3>
        <ul>
          {storeys.map((storey) => {
            const children = model.objects.filter((object) => object.parent_id === storey.id);
            return (
              <li key={storey.id}>
                <strong>
                  {storey.name} · z={storey.level_elevation_m ?? 0} m
                </strong>
                <span>
                  {children.filter((child) => child.type === "Space").length} spaces ·{" "}
                  {children.filter((child) => child.type === "Wall").length} walls ·{" "}
                  {children.filter((child) => child.type === "Slab").length} slabs
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
