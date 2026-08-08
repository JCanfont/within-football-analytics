import { Gauge, Sparkles, CheckCircle2, AlertTriangle } from "lucide-react";
import { listOptimizerObjectives } from "../services/designOptimizer";
import type { OptimizationResult, OptimizerObjective } from "../types/optimizer";

type Props = {
  result: OptimizationResult;
  objective: OptimizerObjective;
  onObjectiveChange: (objective: OptimizerObjective) => void;
  onApplyRecommended: () => void;
  selectedMassingKey: "A" | "B" | "C";
};

export function OptimizerPanel({
  result,
  objective,
  onObjectiveChange,
  onApplyRecommended,
  selectedMassingKey,
}: Props) {
  const objectives = listOptimizerObjectives();
  const recommended = result.candidates.find((c) => c.id === result.recommended_id);

  return (
    <section className="optimizer-panel" aria-label="Optimizador de diseño">
      <header className="panel-heading">
        <div>
          <h2>
            <Gauge size={18} aria-hidden="true" /> Optimizador de diseño
          </h2>
          <p>{result.disclaimer}</p>
        </div>
      </header>

      <div className="optimizer-controls">
        <label>
          Objetivo
          <select
            value={objective}
            onChange={(event) => onObjectiveChange(event.target.value as OptimizerObjective)}
            aria-label="Objetivo de optimización"
          >
            {objectives.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <p className="optimizer-objective-help">
          {objectives.find((item) => item.id === objective)?.description}
        </p>
        <button type="button" className="primary-action" onClick={onApplyRecommended}>
          <Sparkles size={16} aria-hidden="true" />
          Aplicar recomendada ({result.recommended_massing_key})
        </button>
      </div>

      {recommended ? (
        <p className="optimizer-recommend">
          Recomendada: <strong>{recommended.label}</strong> · score {(recommended.score * 100).toFixed(1)}% ·
          método {result.method}
          {selectedMassingKey === result.recommended_massing_key ? " · ya seleccionada" : ""}
        </p>
      ) : null}

      <div className="optimizer-rank">
        {result.candidates.map((candidate, index) => {
          const isRecommended = candidate.id === result.recommended_id;
          const isSelected = candidate.source_massing_key === selectedMassingKey;
          return (
            <article
              key={candidate.id}
              className={`optimizer-card${isRecommended ? " recommended" : ""}${isSelected ? " selected" : ""}`}
            >
              <div className="optimizer-card-head">
                <strong>
                  #{index + 1} · {candidate.label}
                </strong>
                {candidate.hard_violation_count === 0 ? (
                  <span className="massing-badge ok">
                    <CheckCircle2 size={14} aria-hidden="true" /> Cumple
                  </span>
                ) : (
                  <span className="massing-badge bad">
                    <AlertTriangle size={14} aria-hidden="true" /> {candidate.hard_violation_count} viol.
                  </span>
                )}
              </div>
              <dl className="massing-metrics">
                <div>
                  <dt>Score</dt>
                  <dd>{(candidate.score * 100).toFixed(1)}%</dd>
                </div>
                <div>
                  <dt>m²t</dt>
                  <dd>{candidate.massing.metrics.gross_floor_area_m2.toFixed(1)}</dd>
                </div>
                <div>
                  <dt>Patio</dt>
                  <dd>{candidate.massing.metrics.courtyard_area_m2.toFixed(1)} m²</dd>
                </div>
                <div>
                  <dt>Altura</dt>
                  <dd>{candidate.massing.height_m.toFixed(1)} m</dd>
                </div>
              </dl>
              <ul className="optimizer-notes">
                {candidate.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
