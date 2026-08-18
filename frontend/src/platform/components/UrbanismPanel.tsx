import { AlertTriangle, BookOpenCheck, ExternalLink, ShieldAlert } from "lucide-react";
import type { UrbanismAnalysis, UrbanParameter } from "../types/urbanismContract";

type Props = {
  analysis: UrbanismAnalysis;
  cachedNotice?: string | null;
};

function statusClass(status: UrbanParameter["status"]): string {
  switch (status) {
    case "confirmed":
    case "manual_validated":
      return "ok";
    case "interpreted":
      return "warn";
    case "conflict":
    case "unknown":
      return "bad";
    default:
      return "muted";
  }
}

function confidenceBand(score: number): "verde" | "amarillo" | "rojo" {
  if (score >= 0.75) {
    return "verde";
  }
  if (score >= 0.45) {
    return "amarillo";
  }
  return "rojo";
}

export function UrbanismPanel({ analysis, cachedNotice }: Props) {
  const band = confidenceBand(analysis.overall_confidence);

  return (
    <section className="urbanism-panel" aria-label="Panel urbanístico">
      <header className="urbanism-panel-header">
        <div>
          <p className="eyebrow">Consumo API Urbanismo Engine v1</p>
          <h2>Panel urbanístico</h2>
          <p>
            {analysis.municipality}
            {analysis.classification ? ` · ${analysis.classification}` : ""}
            {analysis.qualification ? ` · ${analysis.qualification}` : ""}
          </p>
        </div>
        <div className={`urbanism-confidence ${band}`}>
          <strong>{(analysis.overall_confidence * 100).toFixed(0)}%</strong>
          <span>confianza {band}</span>
        </div>
      </header>

      {cachedNotice ? <p className="urbanism-cache-notice">{cachedNotice}</p> : null}

      <dl className="urbanism-meta">
        <div>
          <dt>analysis_id</dt>
          <dd>{analysis.analysis_id}</dd>
        </div>
        <div>
          <dt>api_version</dt>
          <dd>{analysis.api_version}</dd>
        </div>
        <div>
          <dt>generated_at</dt>
          <dd>{new Date(analysis.generated_at).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Ref. catastral</dt>
          <dd>{analysis.parcel?.cadastral_reference ?? "—"}</dd>
        </div>
      </dl>

      {analysis.requires_human_review ? (
        <p className="urbanism-review-flag">
          <ShieldAlert size={16} aria-hidden="true" />
          Requiere revisión humana en el Urbanismo Engine (no resoluble aquí).
        </p>
      ) : null}

      {analysis.conflicts.length > 0 ? (
        <div className="urbanism-conflicts">
          <h3>
            <AlertTriangle size={16} aria-hidden="true" /> Conflictos
          </h3>
          <ul>
            {analysis.conflicts.map((conflict) => (
              <li key={conflict.code}>
                <strong>{conflict.code}</strong>: {conflict.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="urbanism-params">
        <h3>Parámetros</h3>
        <table>
          <thead>
            <tr>
              <th>Parámetro</th>
              <th>Valor</th>
              <th>Estado</th>
              <th>Confianza</th>
              <th>Fuente</th>
            </tr>
          </thead>
          <tbody>
            {analysis.parameters.map((parameter) => {
              const source = parameter.source_refs?.[0];
              const displayValue =
                parameter.status === "unknown"
                  ? "unknown"
                  : parameter.value === null || parameter.value === undefined
                    ? "—"
                    : `${parameter.value}${parameter.unit ? ` ${parameter.unit}` : ""}`;
              return (
                <tr key={parameter.key}>
                  <td>{parameter.label ?? parameter.key}</td>
                  <td>{displayValue}</td>
                  <td>
                    <span className={`urbanism-status ${statusClass(parameter.status)}`}>{parameter.status}</span>
                  </td>
                  <td>{(parameter.confidence * 100).toFixed(0)}%</td>
                  <td>
                    {source ? (
                      <span className="urbanism-source">
                        <BookOpenCheck size={14} aria-hidden="true" />
                        {source.title}
                        {source.article ? ` · ${source.article}` : ""}
                        {source.document_url ? (
                          <a href={source.document_url} target="_blank" rel="noreferrer">
                            <ExternalLink size={13} aria-hidden="true" />
                          </a>
                        ) : null}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="urbanism-sources">
        <h3>Fuentes</h3>
        <ul>
          {analysis.sources.map((source) => (
            <li key={source.source_id}>
              <strong>{source.title}</strong>
              {source.organism ? ` — ${source.organism}` : ""}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
