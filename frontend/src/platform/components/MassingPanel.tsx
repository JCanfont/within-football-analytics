import { Layers3, CheckCircle2, AlertTriangle } from "lucide-react";
import type { BuildingEnvelope, Point2 } from "../types/envelope";
import type { MassingAlternative, MassingStudy } from "../types/massing";

type Props = {
  study: MassingStudy;
  envelope: BuildingEnvelope;
  selectedKey: "A" | "B" | "C";
  onSelect: (key: "A" | "B" | "C") => void;
};

function toPath(points: Point2[], scale: number, heightPx: number, ox: number, oy: number): string {
  return points
    .map((point, index) => {
      const x = ox + point.x * scale;
      const y = oy + (heightPx - point.y * scale);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ")
    .concat(" Z");
}

function MiniPlan({
  envelope,
  alternative,
}: {
  envelope: BuildingEnvelope;
  alternative: MassingAlternative;
}) {
  const all = [...envelope.plot_polygon, ...envelope.footprint_polygon, ...alternative.mass_polygons.flat()];
  const maxX = Math.max(...all.map((p) => p.x), 1);
  const maxY = Math.max(...all.map((p) => p.y), 1);
  const width = 220;
  const height = 160;
  const pad = 14;
  const scale = Math.min((width - pad * 2) / maxX, (height - pad * 2) / maxY);
  const heightPx = maxY * scale;

  return (
    <svg className="massing-mini" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Massing ${alternative.key}`}>
      <rect width={width} height={height} fill="#f8fafc" />
      <path
        d={toPath(envelope.plot_polygon, scale, heightPx, pad, pad)}
        fill="#e2e8f0"
        stroke="#64748b"
        strokeWidth={1.2}
      />
      <path
        d={toPath(envelope.footprint_polygon, scale, heightPx, pad, pad)}
        fill="rgba(148,163,184,0.25)"
        stroke="#94a3b8"
        strokeWidth={1}
        strokeDasharray="3 2"
      />
      {alternative.mass_polygons.map((poly, index) => (
        <path
          key={`${alternative.id}-m-${index}`}
          d={toPath(poly, scale, heightPx, pad, pad)}
          fill="rgba(47,111,115,0.45)"
          stroke="#2f6f73"
          strokeWidth={1.4}
        />
      ))}
      {alternative.courtyard_polygons.map((poly, index) => (
        <path
          key={`${alternative.id}-c-${index}`}
          d={toPath(poly, scale, heightPx, pad, pad)}
          fill="rgba(236,252,203,0.85)"
          stroke="#65a30d"
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}

export function MassingPanel({ study, envelope, selectedKey, onSelect }: Props) {
  return (
    <section className="massing-panel" aria-label="Estudio de massing">
      <header className="panel-heading">
        <div>
          <h2>
            <Layers3 size={18} aria-hidden="true" /> Massing paramétrico
          </h2>
          <p>{study.disclaimer}</p>
        </div>
      </header>

      <div className="massing-grid">
        {study.alternatives.map((alternative) => {
          const selected = alternative.key === selectedKey;
          return (
            <button
              key={alternative.id}
              type="button"
              className={selected ? "massing-card selected" : "massing-card"}
              onClick={() => onSelect(alternative.key)}
            >
              <div className="massing-card-head">
                <strong>{alternative.label}</strong>
                {alternative.is_within_envelope ? (
                  <span className="massing-badge ok">
                    <CheckCircle2 size={14} aria-hidden="true" /> Dentro
                  </span>
                ) : (
                  <span className="massing-badge bad">
                    <AlertTriangle size={14} aria-hidden="true" /> Violaciones
                  </span>
                )}
              </div>
              <p>{alternative.summary}</p>
              <MiniPlan envelope={envelope} alternative={alternative} />
              <dl className="massing-metrics">
                <div>
                  <dt>Plantas</dt>
                  <dd>{alternative.metrics.floors}</dd>
                </div>
                <div>
                  <dt>Altura</dt>
                  <dd>{alternative.metrics.height_m.toFixed(1)} m</dd>
                </div>
                <div>
                  <dt>Huella</dt>
                  <dd>{alternative.metrics.footprint_area_m2.toFixed(1)} m²</dd>
                </div>
                <div>
                  <dt>m²t</dt>
                  <dd>{alternative.metrics.gross_floor_area_m2.toFixed(1)}</dd>
                </div>
                <div>
                  <dt>Patio</dt>
                  <dd>{alternative.metrics.courtyard_area_m2.toFixed(1)} m²</dd>
                </div>
                <div>
                  <dt>Fill envolvente</dt>
                  <dd>{(alternative.metrics.envelope_fill_ratio * 100).toFixed(0)}%</dd>
                </div>
              </dl>
              {alternative.violations.length > 0 ? (
                <ul className="massing-violations">
                  {alternative.violations.map((violation) => (
                    <li key={violation.code}>{violation.message}</li>
                  ))}
                </ul>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
