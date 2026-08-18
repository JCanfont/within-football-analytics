import { Cable, AlertTriangle, Download } from "lucide-react";
import { useMemo, useState } from "react";
import type { MepElementType, MepModel, MepSystem } from "../types/mep";
import { filterMepBySystem } from "../services/mepGenerator";

type Props = {
  model: MepModel;
};

const TYPE_ORDER: MepElementType[] = [
  "Equipment",
  "Terminal",
  "Pipe",
  "Duct",
  "CableTray",
  "Cable",
  "Connection",
  "Circuit",
  "Shaft",
];

const TYPE_LABELS: Record<MepElementType, string> = {
  Equipment: "Equipos",
  Terminal: "Terminales",
  Pipe: "Tuberías",
  Duct: "Conductos",
  CableTray: "Bandejas",
  Cable: "Cables",
  Connection: "Conexiones",
  Circuit: "Circuitos",
  Shaft: "Shafts",
};

const SYSTEM_LABELS: Record<MepSystem, string> = {
  electrical: "Eléctrico",
  lighting: "Iluminación",
  plumbing: "Fontanería",
  drainage: "Saneamiento",
  dhw: "ACS",
  hvac_heating: "Calefacción",
  hvac_cooling: "Refrigeración",
  ventilation: "Ventilación",
  gas: "Gas",
  telecom: "Telecom",
  fire: "PCI",
};

function downloadJson(model: MepModel) {
  const blob = new Blob([JSON.stringify(model, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${model.mep_model_id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function MepPanel({ model }: Props) {
  const [systemFilter, setSystemFilter] = useState<"all" | MepSystem>("all");
  const visible = useMemo(() => {
    if (systemFilter === "all") return model.elements;
    return filterMepBySystem(model, systemFilter);
  }, [model, systemFilter]);

  const sample = visible.slice(0, 8);

  return (
    <section className="mep-panel" aria-label="Modelo MEP preliminar">
      <header className="panel-heading">
        <div>
          <h2>
            <Cable size={18} aria-hidden="true" /> Instalaciones MEP preliminares
          </h2>
          <p>{model.disclaimer}</p>
        </div>
      </header>

      <div className="structure-banner">
        <AlertTriangle size={16} aria-hidden="true" />
        <span>
          Geometría/coordinación preliminar · <strong>no</strong> dimensionado firmado (
          {model.is_sized_design ? "dimensionado" : "no dimensionado"})
        </span>
      </div>

      <dl className="massing-metrics structure-meta">
        <div>
          <dt>mep_model_id</dt>
          <dd>{model.mep_model_id}</dd>
        </div>
        <div>
          <dt>architectural_model_id</dt>
          <dd>{model.architectural_model_id}</dd>
        </div>
        <div>
          <dt>Elementos</dt>
          <dd>{model.elements.length}</dd>
        </div>
        <div>
          <dt>Sistemas</dt>
          <dd>{model.systems_present.length}</dd>
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

      <div className="mep-filter-row">
        <label>
          Vista filtrada por sistema
          <select
            aria-label="Filtro sistema MEP"
            value={systemFilter}
            onChange={(event) => setSystemFilter(event.target.value as "all" | MepSystem)}
          >
            <option value="all">Todos</option>
            {model.systems_present.map((system) => (
              <option key={system} value={system}>
                {SYSTEM_LABELS[system]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="secondary-action" onClick={() => downloadJson(model)}>
          <Download size={16} aria-hidden="true" />
          Exportar MEP JSON
        </button>
      </div>

      <ul className="structure-sample">
        {sample.map((element) => (
          <li key={element.id}>
            <strong>{element.name}</strong>
            <span>
              {TYPE_LABELS[element.type]} · {SYSTEM_LABELS[element.system]} · {element.discipline} ·
              host {element.host_arch_object_id ?? "—"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
