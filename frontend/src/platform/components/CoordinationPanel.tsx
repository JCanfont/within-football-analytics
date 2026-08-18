import { Scale, AlertTriangle, Download } from "lucide-react";
import { useState } from "react";
import type { CoordinationPack } from "../types/coordination";

type Props = {
  pack: CoordinationPack;
};

type Tab = "clash" | "quantities" | "budget";

function downloadJson(pack: CoordinationPack) {
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${pack.coordination_id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function CoordinationPanel({ pack }: Props) {
  const [tab, setTab] = useState<Tab>("clash");

  return (
    <section className="coordination-panel" aria-label="Clash, mediciones y presupuesto">
      <header className="panel-heading">
        <div>
          <h2>
            <Scale size={18} aria-hidden="true" /> Clash · Mediciones · Presupuesto
          </h2>
          <p>{pack.disclaimer}</p>
        </div>
      </header>

      <div className="structure-banner">
        <AlertTriangle size={16} aria-hidden="true" />
        <span>
          Reportes derivados · catálogo precios {pack.budget.catalog_id} v{pack.budget.catalog_version}
        </span>
      </div>

      <dl className="massing-metrics structure-meta">
        <div>
          <dt>coordination_id</dt>
          <dd>{pack.coordination_id}</dd>
        </div>
        <div>
          <dt>Clashes</dt>
          <dd>
            {pack.clash.counts.total} (H{pack.clash.counts.hard}/S{pack.clash.counts.soft}/C
            {pack.clash.counts.clearance})
          </dd>
        </div>
        <div>
          <dt>Partidas medición</dt>
          <dd>{pack.takeoff.lines.length}</dd>
        </div>
        <div>
          <dt>Total estimado</dt>
          <dd>{pack.budget.total_eur.toLocaleString("es-ES")} €</dd>
        </div>
      </dl>

      <div className="plan-sheet-tabs coordination-tabs">
        <button type="button" className={tab === "clash" ? "active" : ""} onClick={() => setTab("clash")}>
          Clash
        </button>
        <button
          type="button"
          className={tab === "quantities" ? "active" : ""}
          onClick={() => setTab("quantities")}
        >
          Mediciones
        </button>
        <button
          type="button"
          className={tab === "budget" ? "active" : ""}
          onClick={() => setTab("budget")}
        >
          Presupuesto
        </button>
      </div>

      {tab === "clash" ? (
        <div className="coordination-section">
          <p className="page-lead">
            Tolerancias: hard {pack.clash.tolerances.hard_m} m · soft {pack.clash.tolerances.soft_m} m ·
            clearance {pack.clash.tolerances.clearance_m} m
          </p>
          {pack.clash.issues.length === 0 ? (
            <p className="page-lead">Sin interferencias detectadas con las tolerancias actuales.</p>
          ) : (
            <ul className="structure-sample">
              {pack.clash.issues.slice(0, 12).map((issue) => (
                <li key={issue.id}>
                  <strong>
                    [{issue.severity}] {issue.kind}
                  </strong>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === "quantities" ? (
        <div className="coordination-section">
          <table className="coordination-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th>Ud</th>
                <th>Cantidad</th>
                <th>Disc.</th>
              </tr>
            </thead>
            <tbody>
              {pack.takeoff.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.code}</td>
                  <td>{line.description}</td>
                  <td>{line.unit}</td>
                  <td>{line.quantity}</td>
                  <td>{line.source_discipline}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "budget" ? (
        <div className="coordination-section">
          <ul className="structure-sample">
            {pack.budget.chapter_totals.map((chapter) => (
              <li key={chapter.chapter}>
                <strong>{chapter.chapter}</strong>
                <span>{chapter.total_eur.toLocaleString("es-ES")} €</span>
              </li>
            ))}
          </ul>
          <table className="coordination-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Partida</th>
                <th>Cant.</th>
                <th>P.U.</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {pack.budget.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.code}</td>
                  <td>{line.description}</td>
                  <td>
                    {line.quantity} {line.unit}
                  </td>
                  <td>{line.unit_price_eur.toLocaleString("es-ES")} €</td>
                  <td>{line.total_eur.toLocaleString("es-ES")} €</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="coordination-total">
            Total estimado: <strong>{pack.budget.total_eur.toLocaleString("es-ES")} €</strong>
          </p>
        </div>
      ) : null}

      <button type="button" className="secondary-action" onClick={() => downloadJson(pack)}>
        <Download size={16} aria-hidden="true" />
        Exportar coordinación JSON
      </button>
    </section>
  );
}
