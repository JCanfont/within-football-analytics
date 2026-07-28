import { Calculator, CalendarDays, ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { loadForebetDate } from "../services/api";
import type { ForebetDateLoadResult, ForebetRangeItem } from "../types/api";

export function ForebetPage() {
  const [items, setItems] = useState<ForebetRangeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [targetDate, setTargetDate] = useState(todayInputValue());
  const [loadMessage, setLoadMessage] = useState<string | null>(null);
  const [forebetLoad, setForebetLoad] = useState<ForebetDateLoadResult | null>(null);
  const [expandedMatchId, setExpandedMatchId] = useState<number | null>(null);

  function loadDate() {
    if (!targetDate) {
      setError("Selecciona una fecha para cargar la jornada Forebet.");
      return;
    }
    loadDateFor(targetDate);
  }

  function loadDateFor(selectedDate: string) {
    setIsLoading(true);
    setError(null);
    setLoadMessage(null);
    setForebetLoad(null);
    setExpandedMatchId(null);
    loadForebetDate(selectedDate)
      .then((result) => {
        setItems(result.matches);
        setLoadMessage(result.message);
        setForebetLoad(result);
        setIsLoading(false);
      })
      .catch(() => {
        setError("No se pudo cargar la jornada Forebet para esa fecha.");
        setIsLoading(false);
      });
  }

  useEffect(() => {
    loadDateFor(todayInputValue());
  }, []);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return items;
    }
    return items.filter((item) =>
      `${item.home_team} ${item.away_team} ${item.competition} ${item.season}`.toLowerCase().includes(normalized),
    );
  }, [items, query]);

  return (
    <section className="forebet-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Forebet range board</p>
          <h1>Forebet</h1>
        </div>
        <div className="forebet-actions">
          <label className="forebet-date-form">
            <span>Fecha</span>
            <input
              aria-label="Fecha de jornada Forebet"
              type="date"
              value={targetDate}
              onChange={(event) => {
                setTargetDate(event.target.value);
                if (event.target.value) {
                  loadDateFor(event.target.value);
                }
              }}
            />
          </label>
          <button className="filter-show" type="button" onClick={loadDate}>
            <CalendarDays size={17} aria-hidden="true" />
            Cargar jornada
          </button>
        </div>
      </header>

      <section className="panel forebet-panel">
        <div className="panel-heading">
          <div>
            <h2>Jornada del {formatDateLabel(targetDate)}</h2>
            <p>{isLoading ? "Calculando rangos..." : `${filteredItems.length} partidos de la fecha solicitada`}</p>
          </div>
          <input
            className="forebet-search"
            aria-label="Buscar partido Forebet"
            placeholder="Buscar equipo, liga o temporada"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {error ? <div className="detail-state">{error}</div> : null}
        {loadMessage ? <div className="forebet-load-message">{loadMessage}</div> : null}
        {forebetLoad ? <ForebetLoadSummary result={forebetLoad} /> : null}
        {isLoading ? <div className="detail-state">Calculando rangos de resultado para los partidos importados...</div> : null}
        {!isLoading && !error && filteredItems.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Partido</th>
                  <th>Forebet</th>
                  <th>Rango</th>
                  <th>Marcadores posibles</th>
                  <th>Calculo</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <ForebetRangeRow
                    isExpanded={expandedMatchId === item.match_id}
                    item={item}
                    key={item.match_id}
                    onToggle={() => setExpandedMatchId((current) => (current === item.match_id ? null : item.match_id))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {!isLoading && !error && filteredItems.length === 0 ? (
          <div className="forebet-empty-date">
            <strong>No hay partidos para {formatDateLabel(targetDate)}</strong>
            <span>La vista Forebet solo muestra la fecha solicitada. Cambia la fecha para consultar otra jornada.</span>
          </div>
        ) : null}
      </section>
    </section>
  );
}

function ForebetLoadSummary({ result }: { result: ForebetDateLoadResult }) {
  return (
    <div className="forebet-source-summary">
      <span>Estado Forebet: {formatExternalStatus(result.external_fetch_status)}</span>
      <span>Extraidos: {result.forebet_fetched}</span>
      <span>Cruzados: {result.forebet_matched}</span>
      <span>Creados: {result.forebet_created_matches}</span>
      <span>Importados: {result.forebet_imported}</span>
      {result.forebet_source_url ? (
        <a href={result.forebet_source_url} target="_blank" rel="noreferrer">
          Fuente
        </a>
      ) : null}
    </div>
  );
}

function formatExternalStatus(value: string) {
  const labels: Record<string, string> = {
    ok: "conectado",
    reader_fallback: "lectura externa",
    blocked: "bloqueado por proteccion",
    request_failed: "sin conexion",
    http_error: "error HTTP",
    no_forebet_matches: "sin partidos extraidos",
    no_local_match: "sin cruce local",
    storage_unavailable: "lectura temporal",
  };
  return labels[value] ?? value;
}

function todayInputValue() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function formatDateLabel(value: string) {
  if (!value) {
    return "fecha seleccionada";
  }
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function ForebetRangeRow({ isExpanded, item, onToggle }: { isExpanded: boolean; item: ForebetRangeItem; onToggle: () => void }) {
  const range = item.score_range;
  return (
    <>
      <tr>
        <td>{formatDateOnly(item.match_date)}</td>
        <td>
          <strong>{item.home_team}</strong> vs <strong>{item.away_team}</strong>
          <span className="table-subtext">{item.competition} · {formatSeason(item.season)}</span>
        </td>
        <td>{item.forebet_prediction ?? "Sin captura"}</td>
        <td>{formatRange(range)}</td>
        <td>{formatPossibleScores(range)}</td>
        <td>
          <button className="row-action" type="button" onClick={onToggle} disabled={!range}>
            {isExpanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
            Ver
          </button>
        </td>
      </tr>
      {isExpanded ? (
        <tr className="forebet-calculation-row">
          <td colSpan={6}>
            <ForebetCalculation range={range} reliability={item.reliability} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function ForebetCalculation({ range, reliability }: { range?: Record<string, unknown> | null; reliability: string }) {
  if (!range) {
    return <div className="detail-state">Sin datos suficientes para calcular rango.</div>;
  }
  const home = isRecord(range.home) ? range.home : {};
  const away = isRecord(range.away) ? range.away : {};
  return (
    <div className="forebet-calculation">
      <div className="index-calculation-heading">
        <Calculator size={18} aria-hidden="true" />
        <div>
          <span>Calculo de rango</span>
          <strong>{formatRange(range)}</strong>
        </div>
      </div>
      <p>{String(range.explanation ?? "Rango calculado con goles marcados y recibidos por partido.")}</p>
      <p className="sample-ok">{String(range.reference_reason ?? `Fiabilidad: ${reliability}`)}</p>
      <div className="score-range-grid">
        <RangeTeam values={home} expected={range.home_expected_goals} label="Local" range={range.home_integer_range} />
        <RangeTeam values={away} expected={range.away_expected_goals} label="Visitante" range={range.away_integer_range} />
      </div>
    </div>
  );
}

function RangeTeam({ expected, label, range, values }: { expected: unknown; label: string; range: unknown; values: Record<string, unknown> }) {
  const integerRange = isRecord(range) ? range : {};
  return (
    <div className="score-range-team-card">
      <span>{label}</span>
      <strong>{String(values.team ?? "Equipo")}</strong>
      <dl>
        <div>
          <dt>Marcados</dt>
          <dd>{formatUnknown(values.goals_for)} / {formatUnknown(values.played)} = {formatUnknown(values.scored_per_match)}</dd>
        </div>
        <div>
          <dt>Recibidos</dt>
          <dd>{formatUnknown(values.goals_against)} / {formatUnknown(values.played)} = {formatUnknown(values.conceded_per_match)}</dd>
        </div>
        <div>
          <dt>Media cruzada</dt>
          <dd>{formatUnknown(expected)}</dd>
        </div>
        <div>
          <dt>Rango entero</dt>
          <dd>{formatUnknown(integerRange.min)} - {formatUnknown(integerRange.max)}</dd>
        </div>
      </dl>
    </div>
  );
}

function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function formatSeason(value: string) {
  const match = value.match(/(\d{2})(\d{2})\D+(\d{2})(\d{2})/);
  return match ? `${match[2]}-${match[4]}` : value;
}

function formatRange(range?: Record<string, unknown> | null) {
  return typeof range?.summary === "string" ? range.summary : "Sin rango";
}

function formatPossibleScores(range?: Record<string, unknown> | null) {
  return Array.isArray(range?.possible_scores) ? range.possible_scores.map(String).join(" | ") : "Sin rango";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatUnknown(value: unknown) {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  }
  if (typeof value === "string") {
    return value;
  }
  return "n/d";
}
