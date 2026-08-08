import { BoxSelect, Info } from "lucide-react";
import type { BuildingEnvelope, Point2 } from "../types/envelope";

type Props = {
  envelope: BuildingEnvelope;
};

function toPath(points: Point2[], scale: number, flipY: boolean, height: number): string {
  return points
    .map((point, index) => {
      const x = point.x * scale;
      const y = flipY ? height - point.y * scale : point.y * scale;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ")
    .concat(" Z");
}

export function EnvelopePanel({ envelope }: Props) {
  const all = [...envelope.plot_polygon, ...envelope.footprint_polygon];
  const maxX = Math.max(...all.map((p) => p.x), 1);
  const maxY = Math.max(...all.map((p) => p.y), 1);
  const padding = 24;
  const drawW = 420;
  const drawH = 300;
  const scale = Math.min((drawW - padding * 2) / maxX, (drawH - padding * 2) / maxY);
  const heightPx = maxY * scale;

  return (
    <section className="envelope-panel" aria-label="Envolvente edificable">
      <header className="panel-heading">
        <div>
          <h2>
            <BoxSelect size={18} aria-hidden="true" /> Envolvente edificable
          </h2>
          <p>{envelope.disclaimer}</p>
        </div>
      </header>

      <div className="envelope-layout">
        <svg
          className="envelope-svg"
          viewBox={`0 0 ${drawW} ${drawH}`}
          role="img"
          aria-label="Planta de parcela y huella máxima"
        >
          <rect x={0} y={0} width={drawW} height={drawH} fill="#f8fafc" />
          <g transform={`translate(${padding}, ${padding})`}>
            <path
              d={toPath(envelope.plot_polygon, scale, true, heightPx)}
              fill="#e2e8f0"
              stroke="#334155"
              strokeWidth={2}
            />
            <path
              d={toPath(envelope.footprint_polygon, scale, true, heightPx)}
              fill="rgba(47, 111, 115, 0.28)"
              stroke="#2f6f73"
              strokeWidth={2}
            />
            <text x={0} y={heightPx + 16} className="envelope-legend">
              Gris: parcela · Verde: huella máxima tras restricciones
            </text>
          </g>
        </svg>

        <div className="envelope-side">
          <dl className="fp-summary">
            <div>
              <dt>Área parcela</dt>
              <dd>{envelope.metrics.plot_area_m2.toFixed(1)} m²</dd>
            </div>
            <div>
              <dt>Huella máxima</dt>
              <dd>{envelope.metrics.footprint_area_m2.toFixed(1)} m²</dd>
            </div>
            <div>
              <dt>Ocupación usada / permitida</dt>
              <dd>
                {envelope.metrics.occupation_used !== null
                  ? `${(envelope.metrics.occupation_used * 100).toFixed(1)}%`
                  : "—"}
                {" / "}
                {envelope.metrics.occupation_allowed !== null
                  ? `${(envelope.metrics.occupation_allowed * 100).toFixed(1)}%`
                  : "unknown"}
              </dd>
            </div>
            <div>
              <dt>m²t footprint×plantas</dt>
              <dd>
                {envelope.metrics.buildable_area_m2_from_footprint_x_floors !== null
                  ? `${envelope.metrics.buildable_area_m2_from_footprint_x_floors.toFixed(1)} m²t`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>m²t permitidos</dt>
              <dd>
                {envelope.metrics.buildable_area_m2_allowed !== null
                  ? `${envelope.metrics.buildable_area_m2_allowed.toFixed(1)} m²t`
                  : "unknown"}
              </dd>
            </div>
            <div>
              <dt>Altura / plantas</dt>
              <dd>
                {envelope.metrics.max_height_m !== null ? `${envelope.metrics.max_height_m} m` : "—"}
                {" · "}
                {envelope.metrics.max_floors !== null ? `${envelope.metrics.max_floors} pl.` : "—"}
              </dd>
            </div>
            <div>
              <dt>Extrusión</dt>
              <dd>{envelope.extrude_height_m !== null ? `${envelope.extrude_height_m} m` : "—"}</dd>
            </div>
          </dl>

          {envelope.warnings.length > 0 ? (
            <div className="envelope-warnings">
              <h3>
                <Info size={15} aria-hidden="true" /> Avisos
              </h3>
              <ul>
                {envelope.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      <div className="envelope-constraints">
        <h3>Restricciones trazables</h3>
        <p className="page-lead">Relación `constraint → urban_parameter → source_refs`.</p>
        <table>
          <thead>
            <tr>
              <th>Restricción</th>
              <th>Valor aplicado</th>
              <th>Limita</th>
              <th>Parámetro</th>
              <th>Fuente</th>
            </tr>
          </thead>
          <tbody>
            {envelope.constraints.map((constraint) => (
              <tr key={constraint.id}>
                <td>
                  {constraint.label}
                  {constraint.note ? <div className="envelope-note">{constraint.note}</div> : null}
                </td>
                <td>
                  {constraint.applied_value === null || constraint.applied_value === undefined
                    ? "—"
                    : `${constraint.applied_value}${constraint.unit ? ` ${constraint.unit}` : ""}`}
                </td>
                <td>{constraint.is_limiting ? "Sí" : "No"}</td>
                <td>{constraint.urban_parameter_key ?? "—"}</td>
                <td>{constraint.source_refs[0]?.title ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
