import { Columns3, AlertTriangle, Download } from "lucide-react";
import type { StructuralElementType, StructuralModel } from "../types/structure";

type Props = {
  model: StructuralModel;
};

const TYPE_ORDER: StructuralElementType[] = [
  "Column",
  "Beam",
  "StructuralWall",
  "StructuralSlab",
  "Foundation",
  "Opening",
];

const TYPE_LABELS: Record<StructuralElementType, string> = {
  Column: "Pilares",
  Beam: "Vigas",
  StructuralWall: "Muros estructurales",
  StructuralSlab: "Forjados",
  Foundation: "Cimentación",
  Opening: "Huecos",
};

function downloadJson(model: StructuralModel) {
  const blob = new Blob([JSON.stringify(model, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${model.structural_model_id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function StructurePanel({ model }: Props) {
  const sample = TYPE_ORDER.flatMap((type) =>
    model.elements.filter((element) => element.type === type).slice(0, 3),
  );

  return (
    <section className="structure-panel" aria-label="Modelo estructural preliminar">
      <header className="panel-heading">
        <div>
          <h2>
            <Columns3 size={18} aria-hidden="true" /> Estructura preliminar
          </h2>
          <p>{model.disclaimer}</p>
        </div>
      </header>

      <div className="structure-banner">
        <AlertTriangle size={16} aria-hidden="true" />
        <span>
          Geometría preliminar coordinada con ARCH · <strong>no</strong> es cálculo firmado (
          {model.is_signed_calculation ? "firmado" : "no firmado"})
        </span>
      </div>

      <dl className="massing-metrics structure-meta">
        <div>
          <dt>structural_model_id</dt>
          <dd>{model.structural_model_id}</dd>
        </div>
        <div>
          <dt>architectural_model_id</dt>
          <dd>{model.architectural_model_id}</dd>
        </div>
        <div>
          <dt>Rejilla</dt>
          <dd>{model.grid_spacing_m.toFixed(1)} m</dd>
        </div>
        <div>
          <dt>Elementos</dt>
          <dd>{model.elements.length}</dd>
        </div>
      </dl>

      <div className="structure-counts">
        {TYPE_ORDER.map((type) => (
          <div key={type} className="structure-count-card">
            <strong>{TYPE_LABELS[type]}</strong>
            <span>{model.counts[type]}</span>
          </div>
        ))}
      </div>

      <button type="button" className="secondary-action" onClick={() => downloadJson(model)}>
        <Download size={16} aria-hidden="true" />
        Exportar STRUCT JSON
      </button>

      <ul className="structure-sample">
        {sample.map((element) => (
          <li key={element.id}>
            <strong>{element.name}</strong>
            <span>
              {TYPE_LABELS[element.type]} · host {element.host_arch_object_id ?? "—"} · z=
              {element.level_elevation_m.toFixed(2)} m
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
