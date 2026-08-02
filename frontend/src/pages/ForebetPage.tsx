import { Bell, BellRing, Calculator, CalendarDays, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadForebetDate } from "../services/api";
import type { ForebetDateLoadResult, ForebetRangeItem } from "../types/api";

type GoalPredictionMode = "full" | "score" | "total" | "overUnder";

const goalPredictionModes: Array<{ label: string; mode: GoalPredictionMode }> = [
  { label: "Todo", mode: "full" },
  { label: "Marcador", mode: "score" },
  { label: "Goles", mode: "total" },
  { label: "Over/Under", mode: "overUnder" },
];

const FOREBET_WATCH_KEY = "within_forebet_watch";
const MATCH_SETTLED_AFTER_MINUTES = 135;
const LIVE_REFRESH_MS = 10 * 60 * 1000;

type ForebetWatchState = {
  autoRefresh: boolean;
  forecastAlerts: boolean;
  matchIds: number[];
  notifiedForecastIds: number[];
  notifiedStartedIds: number[];
};

export function ForebetPage() {
  const [items, setItems] = useState<ForebetRangeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLiveRefreshing, setIsLiveRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [targetDate, setTargetDate] = useState(todayInputValue());
  const [loadMessage, setLoadMessage] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState<string | null>(null);
  const [forebetLoad, setForebetLoad] = useState<ForebetDateLoadResult | null>(null);
  const [expandedMatchId, setExpandedMatchId] = useState<number | null>(null);
  const [hasCalculatedRanges, setHasCalculatedRanges] = useState(false);
  const [loadingMode, setLoadingMode] = useState<"matches" | "ranges">("matches");
  const [goalPredictionMode, setGoalPredictionMode] = useState<GoalPredictionMode>("full");
  const [watchedMatchIds, setWatchedMatchIds] = useState<number[]>(() => readForebetWatchState().matchIds);
  const [notifiedStartedIds, setNotifiedStartedIds] = useState<number[]>(() => readForebetWatchState().notifiedStartedIds);
  const [notifiedForecastIds, setNotifiedForecastIds] = useState<number[]>(() => readForebetWatchState().notifiedForecastIds);
  const [autoRefresh, setAutoRefresh] = useState(() => readForebetWatchState().autoRefresh);
  const [forecastAlerts, setForecastAlerts] = useState(() => readForebetWatchState().forecastAlerts);
  const [lastLiveRefresh, setLastLiveRefresh] = useState<string | null>(null);
  const [nextLiveRefresh, setNextLiveRefresh] = useState<string | null>(null);
  const liveRefreshInFlightRef = useRef(false);
  const watchedMatchIdsRef = useRef(watchedMatchIds);
  const notifiedStartedIdsRef = useRef(notifiedStartedIds);
  const notifiedForecastIdsRef = useRef(notifiedForecastIds);
  const forecastAlertsRef = useRef(forecastAlerts);
  const isCalculatingRanges = isLoading && loadingMode === "ranges";
  const showRangeColumns = hasCalculatedRanges || isCalculatingRanges;

  function loadDate() {
    if (!targetDate) {
      setError("Selecciona una fecha para cargar la jornada Forebet.");
      return;
    }
    loadDateFor(targetDate, false);
  }

  function calculateRanges() {
    if (!targetDate || items.length === 0) {
      return;
    }
    loadDateFor(targetDate, true);
  }

  function loadDateFor(selectedDate: string, includeRanges: boolean) {
    setIsLoading(true);
    setLoadingMode(includeRanges ? "ranges" : "matches");
    setError(null);
    setLoadMessage(null);
    setForebetLoad(null);
    setExpandedMatchId(null);
    if (!includeRanges) {
      setHasCalculatedRanges(false);
    } else {
      setHasCalculatedRanges(true);
    }
    loadForebetDate(selectedDate, includeRanges)
      .then((result) => {
        setItems(result.matches);
        setLoadMessage(result.message);
        setForebetLoad(result);
        setHasCalculatedRanges(includeRanges);
        setIsLoading(false);
      })
      .catch(() => {
        setError("No se pudo cargar la jornada Forebet para esa fecha.");
        setIsLoading(false);
      });
  }

  const refreshLiveResults = useCallback((manual = false) => {
    if (!targetDate || liveRefreshInFlightRef.current) {
      return;
    }
    liveRefreshInFlightRef.current = true;
    setIsLiveRefreshing(true);
    setLiveMessage(manual ? "Actualizando Forebet ahora..." : "Actualizacion automatica de Forebet en curso...");
    loadForebetDate(targetDate, false)
      .then((result) => {
        setItems((current) => mergeForebetItems(current, result.matches));
        setForebetLoad(result);
        setLastLiveRefresh(new Date().toISOString());
        setNextLiveRefresh(new Date(Date.now() + LIVE_REFRESH_MS).toISOString());
        checkStartedAlerts(result.matches);
        checkForecastAlerts(result.matches);
        setLiveMessage(`Forebet actualizado: ${result.matches.length} partidos revisados.`);
      })
      .catch(() => {
        setLiveMessage("No se pudo actualizar Forebet en este intento.");
      })
      .finally(() => {
        liveRefreshInFlightRef.current = false;
        setIsLiveRefreshing(false);
      });
  }, [targetDate]);

  function toggleAutoRefresh() {
    setAutoRefresh((current) => {
      const next = !current;
      if (next) {
        setLiveMessage("Actualizacion cada 10 minutos activada. Haciendo una primera captura ahora...");
        window.setTimeout(() => refreshLiveResults(true), 0);
      } else {
        setLiveMessage("Actualizacion cada 10 minutos desactivada.");
      }
      return next;
    });
  }

  function toggleStartAlert(item: ForebetRangeItem) {
    const isWatched = watchedMatchIds.includes(item.match_id);
    if (isWatched) {
      setWatchedMatchIds((current) => current.filter((matchId) => matchId !== item.match_id));
      setNotifiedStartedIds((current) => current.filter((matchId) => matchId !== item.match_id));
      setNotifiedForecastIds((current) => current.filter((matchId) => matchId !== item.match_id));
      setLiveMessage(`Aviso desactivado para ${item.home_team} - ${item.away_team}.`);
      return;
    }
    requestNotificationPermission();
    setWatchedMatchIds((current) => [...new Set([...current, item.match_id])]);
    setAutoRefresh(true);
    setLiveMessage(`Avisaremos cuando comience ${item.home_team} - ${item.away_team}.`);
    if (hasMatchStarted(item)) {
      notifyMatchStarted(item);
      setNotifiedStartedIds((current) => [...new Set([...current, item.match_id])]);
    }
  }

  function checkStartedAlerts(nextItems: ForebetRangeItem[]) {
    const nextNotified = new Set(notifiedStartedIdsRef.current);
    for (const item of nextItems) {
      if (!watchedMatchIdsRef.current.includes(item.match_id) || nextNotified.has(item.match_id) || !hasMatchStarted(item)) {
        continue;
      }
      notifyMatchStarted(item);
      nextNotified.add(item.match_id);
    }
    if (nextNotified.size !== notifiedStartedIdsRef.current.length) {
      setNotifiedStartedIds(Array.from(nextNotified));
    }
  }

  function checkForecastAlerts(nextItems: ForebetRangeItem[]) {
    if (!forecastAlertsRef.current) {
      return;
    }
    const nextNotified = new Set(notifiedForecastIdsRef.current);
    for (const item of nextItems) {
      if (!watchedMatchIdsRef.current.includes(item.match_id) || nextNotified.has(item.match_id) || !isLiveMatch(item) || !isThirtyMinuteWarningWindow(item)) {
        continue;
      }
      const forecastState = evaluateForecastState(item);
      if (forecastState.status !== "possible") {
        continue;
      }
      notifyForecastStillPossible(item, forecastState.label);
      nextNotified.add(item.match_id);
    }
    if (nextNotified.size !== notifiedForecastIdsRef.current.length) {
      setNotifiedForecastIds(Array.from(nextNotified));
    }
  }

  useEffect(() => {
    loadDateFor(todayInputValue(), false);
  }, []);

  useEffect(() => {
    writeForebetWatchState({ autoRefresh, forecastAlerts, matchIds: watchedMatchIds, notifiedForecastIds, notifiedStartedIds });
  }, [autoRefresh, forecastAlerts, watchedMatchIds, notifiedForecastIds, notifiedStartedIds]);

  useEffect(() => {
    watchedMatchIdsRef.current = watchedMatchIds;
    notifiedStartedIdsRef.current = notifiedStartedIds;
    notifiedForecastIdsRef.current = notifiedForecastIds;
    forecastAlertsRef.current = forecastAlerts;
  }, [forecastAlerts, notifiedForecastIds, notifiedStartedIds, watchedMatchIds]);

  useEffect(() => {
    if (!autoRefresh) {
      setNextLiveRefresh(null);
      return;
    }
    setNextLiveRefresh(new Date(Date.now() + LIVE_REFRESH_MS).toISOString());
    const intervalId = window.setInterval(() => {
      refreshLiveResults(false);
    }, LIVE_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [autoRefresh, refreshLiveResults]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const visibleItems = normalized
      ? items.filter((item) =>
          `${item.home_team} ${item.away_team} ${item.competition} ${item.season}`.toLowerCase().includes(normalized),
        )
      : items;
    return [...visibleItems].sort((first, second) =>
      compareMatchDateTime(first.match_date, second.match_date) || first.home_team.localeCompare(second.home_team),
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
                  loadDateFor(event.target.value, false);
                }
              }}
            />
          </label>
          <button className="filter-show" type="button" onClick={loadDate} disabled={isLoading && loadingMode === "matches"}>
            <CalendarDays size={17} aria-hidden="true" />
            Cargar jornada
          </button>
          <button className="filter-show" type="button" onClick={calculateRanges} disabled={isLoading || items.length === 0}>
            <Calculator size={17} aria-hidden="true" />
            Calcular rangos
          </button>
        </div>
      </header>

      <section className="panel forebet-panel">
        <div className="panel-heading">
          <div>
            <h2>Jornada del {formatDateLabel(targetDate)}</h2>
            <p>{isLoading ? loadingLabel(loadingMode) : `${filteredItems.length} partidos de la fecha solicitada`}</p>
          </div>
          <div className="forebet-table-tools">
            <div className="forebet-mode-control" aria-label="Vista de prediccion de goles">
              {goalPredictionModes.map((option) => (
                <button
                  className={goalPredictionMode === option.mode ? "active" : ""}
                  key={option.mode}
                  type="button"
                  onClick={() => setGoalPredictionMode(option.mode)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <input
              className="forebet-search"
              aria-label="Buscar partido Forebet"
              placeholder="Buscar equipo, liga o temporada"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>

        {error ? <div className="detail-state">{error}</div> : null}
        {loadMessage ? <div className="forebet-load-message">{loadMessage}</div> : null}
        {forebetLoad ? <ForebetLoadSummary result={forebetLoad} /> : null}
        <ForebetLiveWatchPanel
          autoRefresh={autoRefresh}
          forecastAlerts={forecastAlerts}
          isRefreshing={isLiveRefreshing}
          lastRefresh={lastLiveRefresh}
          liveMessage={liveMessage}
          nextRefresh={nextLiveRefresh}
          onRefreshNow={() => refreshLiveResults(true)}
          onToggleForecastAlerts={() => {
            requestNotificationPermission();
            setForecastAlerts((current) => !current);
          }}
          onToggleAuto={toggleAutoRefresh}
          watchedCount={watchedMatchIds.length}
        />
        {isLoading ? <div className="detail-state">{loadingDetail(loadingMode)}</div> : null}
        {!error && filteredItems.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Partido</th>
                  <th>Seguimiento</th>
                  <th>Forebet</th>
                  <th>Estado pronostico</th>
                  <th>Predicción goles</th>
                  <th>Goles esperados</th>
                  {showRangeColumns ? <th>Rango</th> : null}
                  {showRangeColumns ? <th>Marcadores posibles</th> : null}
                  {showRangeColumns ? <th>Calculo</th> : null}
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <ForebetRangeRow
                    isExpanded={expandedMatchId === item.match_id}
                    item={item}
                    key={item.match_id}
                    onToggle={() => setExpandedMatchId((current) => (current === item.match_id ? null : item.match_id))}
                    onToggleWatch={() => toggleStartAlert(item)}
                    predictionMode={goalPredictionMode}
                    showRanges={showRangeColumns}
                    isCalculatingRanges={isCalculatingRanges}
                    isWatched={watchedMatchIds.includes(item.match_id)}
                    forecastAlerts={forecastAlerts}
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

function ForebetLiveWatchPanel({
  autoRefresh,
  forecastAlerts,
  isRefreshing,
  lastRefresh,
  liveMessage,
  nextRefresh,
  onRefreshNow,
  onToggleForecastAlerts,
  onToggleAuto,
  watchedCount,
}: {
  autoRefresh: boolean;
  forecastAlerts: boolean;
  isRefreshing: boolean;
  lastRefresh: string | null;
  liveMessage: string | null;
  nextRefresh: string | null;
  onRefreshNow: () => void;
  onToggleForecastAlerts: () => void;
  onToggleAuto: () => void;
  watchedCount: number;
}) {
  return (
    <div className="forebet-live-watch">
      <div>
        <span>Seguimiento de inicio y directo</span>
        <strong>{watchedCount} partidos con aviso</strong>
        <small>
          {autoRefresh
            ? `Actualizacion cada 10 minutos${nextRefresh ? `, proxima ${formatTimeOnly(nextRefresh)}` : ""}`
            : "Activa el seguimiento para revisar la jornada automaticamente"}
        </small>
      </div>
      <div className="forebet-live-actions">
        <button className={autoRefresh ? "active" : ""} type="button" onClick={onToggleAuto}>
          <RefreshCw size={16} aria-hidden="true" />
          Cada 10 min
        </button>
        <button className={forecastAlerts ? "active" : ""} type="button" onClick={onToggleForecastAlerts}>
          <BellRing size={16} aria-hidden="true" />
          Pronostico vivo
        </button>
        <button type="button" onClick={onRefreshNow} disabled={isRefreshing}>
          <RefreshCw size={16} aria-hidden="true" />
          {isRefreshing ? "Actualizando" : "Actualizar ahora"}
        </button>
      </div>
      <p>
        {liveMessage ??
          (lastRefresh ? `Ultima actualizacion Forebet: ${formatTimeOnly(lastRefresh)}` : "Sin actualizaciones automaticas todavia.")}
      </p>
    </div>
  );
}

function loadingLabel(mode: "matches" | "ranges") {
  return mode === "ranges" ? "Calculando rangos..." : "Cargando partidos...";
}

function loadingDetail(mode: "matches" | "ranges") {
  return mode === "ranges" ? "Calculando rangos de resultado para los partidos cargados..." : "Adquiriendo partidos de la fecha solicitada...";
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

function ForebetRangeRow({
  isExpanded,
  isCalculatingRanges,
  isWatched,
  forecastAlerts,
  item,
  onToggle,
  onToggleWatch,
  predictionMode,
  showRanges,
}: {
  isExpanded: boolean;
  isCalculatingRanges: boolean;
  isWatched: boolean;
  forecastAlerts: boolean;
  item: ForebetRangeItem;
  onToggle: () => void;
  onToggleWatch: () => void;
  predictionMode: GoalPredictionMode;
  showRanges: boolean;
}) {
  const range = item.score_range;
  const forecastState = isLiveMatch(item) ? evaluateForecastState(item) : null;
  const rowClassName = [
    forecastState?.status === "impossible" ? "forecast-impossible-row" : "",
    forebetTimingClass(item),
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <>
      <tr className={rowClassName || undefined}>
        <td>{formatMatchDateOnly(item.match_date)}</td>
        <td>
          <strong>{item.home_team}</strong> vs <strong>{item.away_team}</strong>
          <span className="table-subtext">{item.competition} · {formatSeason(item.season)}</span>
        </td>
        <td>
          <button className={isWatched ? "row-action active" : "row-action"} type="button" onClick={onToggleWatch}>
            {isWatched ? <BellRing size={15} aria-hidden="true" /> : <Bell size={15} aria-hidden="true" />}
            {isWatched ? "Aviso activo" : "Avisar inicio"}
          </button>
          <span className="table-subtext">{formatMatchStartStatus(item)}</span>
        </td>
        <td>{item.forebet_prediction ?? "Sin captura"}</td>
        <td>
          {forecastState ? (
            <span className={`forecast-status ${forecastState.status}`}>{forecastState.label}</span>
          ) : (
            <span className="table-subtext">{formatNonLiveForecastLabel(item)}</span>
          )}
          <span className="table-subtext">
            {formatCurrentScore(item)}
            {forecastAlerts && isWatched ? " · aviso min 60" : ""}
          </span>
        </td>
        <td>
          {formatGoalPrediction(item, predictionMode)}
        </td>
        <td>{formatUnknown(item.expected_goals)}</td>
        {showRanges ? <td>{isCalculatingRanges ? "Calculando..." : formatRange(range)}</td> : null}
        {showRanges ? <td>{isCalculatingRanges ? "Calculando..." : formatPossibleScores(range)}</td> : null}
        {showRanges ? (
          <td>
            <button className="row-action" type="button" onClick={onToggle} disabled={!range || isCalculatingRanges}>
              {isExpanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
              Ver
            </button>
          </td>
        ) : null}
      </tr>
      {showRanges && isExpanded ? (
        <tr className="forebet-calculation-row">
          <td colSpan={10}>
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
          <dt>Media de rango</dt>
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

function formatTimeOnly(value: string) {
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatMatchDateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return formatDateOnly(value);
  }
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatMatchTimeOnly(value: string) {
  const match = value.match(/T(\d{2}):(\d{2})/);
  if (!match) {
    return formatTimeOnly(value);
  }
  return `${match[1]}:${match[2]}`;
}

function compareMatchDateTime(first: string, second: string) {
  return matchDateTimeSortValue(first) - matchDateTimeSortValue(second);
}

function matchDateTimeSortValue(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) {
    return new Date(value).getTime();
  }
  return Number(`${match[1]}${match[2]}${match[3]}${match[4]}${match[5]}`);
}

function forebetTimingClass(item: ForebetRangeItem) {
  return matchTimingState(item) === "played" ? "forebet-time-past" : "forebet-time-pending";
}

function literalMatchElapsedMinutes(value: string) {
  const matchTime = parseLiteralMatchDate(value);
  if (!matchTime) {
    return null;
  }
  return Math.floor((Date.now() - matchTime.getTime()) / 60_000);
}

function parseLiteralMatchDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
}

function formatSeason(value: string) {
  const match = value.match(/(\d{2})(\d{2})\D+(\d{2})(\d{2})/);
  return match ? `${match[2]}-${match[4]}` : value;
}

function formatRange(range?: Record<string, unknown> | null) {
  return typeof range?.summary === "string" ? range.summary : "Sin rango";
}

function formatGoalPrediction(item: ForebetRangeItem, mode: GoalPredictionMode) {
  const prediction = isRecord(item.goal_prediction) ? item.goal_prediction : {};
  const total = prediction.predicted_total_goals;
  const overUnder = prediction.over_under_25;
  const score = item.predicted_score ?? (typeof prediction.predicted_score === "string" ? prediction.predicted_score : null);
  if (!score && typeof total !== "number" && typeof overUnder !== "string") {
    return "Sin captura";
  }
  if (mode === "score") {
    return score ?? "Sin marcador";
  }
  if (mode === "total") {
    return typeof total === "number" ? `${total} goles` : "Sin total";
  }
  if (mode === "overUnder") {
    return typeof overUnder === "string" ? formatOverUnder(overUnder) : "Sin Over/Under";
  }
  const parts = [];
  if (score) {
    parts.push(score);
  }
  if (typeof total === "number") {
    parts.push(`${total} goles`);
  }
  if (typeof overUnder === "string") {
    parts.push(formatOverUnder(overUnder));
  }
  return parts.join(" · ");
}

function formatOverUnder(value: string) {
  return value === "over_2_5" ? "Over 2.5" : "Under 2.5";
}

function predictedScoreLabel(item: ForebetRangeItem) {
  const prediction = isRecord(item.goal_prediction) ? item.goal_prediction : {};
  const score = item.predicted_score ?? (typeof prediction.predicted_score === "string" ? prediction.predicted_score : null);
  const parsed = splitPredictedScore(score);
  return parsed ? `${parsed.home}-${parsed.away}` : null;
}

function evaluateForecastState(item: ForebetRangeItem): { status: "possible" | "impossible" | "pending"; label: string } {
  if (item.home_score == null || item.away_score == null) {
    return { status: "pending", label: "Sin marcador" };
  }
  const score = splitPredictedScore(item.predicted_score);
  const overUnder = isRecord(item.goal_prediction) && typeof item.goal_prediction.over_under_25 === "string" ? item.goal_prediction.over_under_25 : null;
  const currentTotal = item.home_score + item.away_score;
  if (score && (item.home_score > score.home || item.away_score > score.away)) {
    return { status: "impossible", label: "Ya no es posible" };
  }
  if (overUnder === "under_2_5" && currentTotal >= 3) {
    return { status: "impossible", label: "Ya no es posible" };
  }
  if (overUnder === "over_2_5" && isFinished(item) && currentTotal < 3) {
    return { status: "impossible", label: "Ya no es posible" };
  }
  if (score || overUnder) {
    return { status: "possible", label: "Aun posible" };
  }
  return { status: "pending", label: "Sin regla" };
}

function formatNonLiveForecastLabel(item: ForebetRangeItem) {
  if (isFinished(item)) {
    return "Finalizado";
  }
  if (item.home_score != null && item.away_score != null) {
    return "Resultado capturado";
  }
  return "Pendiente de inicio";
}

function formatMatchStartStatus(item: ForebetRangeItem) {
  const timingState = matchTimingState(item);
  if (timingState === "played") {
    return "Jugado";
  }
  if (timingState === "live") {
    return "En juego";
  }
  return `Inicio ${formatMatchTimeOnly(item.match_date)}`;
}

function matchTimingState(item: ForebetRangeItem): "scheduled" | "live" | "played" {
  if (isFinished(item)) {
    return "played";
  }
  if (isLiveMatch(item)) {
    return "live";
  }
  const elapsedMinutes = literalMatchElapsedMinutes(item.match_date);
  if (elapsedMinutes == null || elapsedMinutes < 0) {
    return "scheduled";
  }
  return elapsedMinutes >= MATCH_SETTLED_AFTER_MINUTES ? "played" : "live";
}

function isLiveMatch(item: ForebetRangeItem) {
  const normalizedStatus = item.status.toLowerCase();
  return ["live", "in_play", "playing", "1h", "2h", "ht"].some((status) => normalizedStatus.includes(status));
}

function splitPredictedScore(value?: string | null) {
  const match = value?.match(/(\d+)\s*-\s*(\d+)/);
  if (!match) {
    return null;
  }
  return { home: Number(match[1]), away: Number(match[2]) };
}

function formatCurrentScore(item: ForebetRangeItem) {
  if (item.home_score == null || item.away_score == null) {
    return isFinished(item) ? "Finalizado; marcador pendiente de captura" : "Marcador pendiente de captura";
  }
  return `Ahora ${item.home_score}-${item.away_score}`;
}

function formatPossibleScores(range?: Record<string, unknown> | null) {
  if (!Array.isArray(range?.possible_scores)) {
    return "Sin rango";
  }
  return range.possible_scores.length > 0 ? range.possible_scores.map(String).join(" | ") : "Sin prediccion";
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

function hasMatchStarted(item: ForebetRangeItem) {
  return matchTimingState(item) !== "scheduled";
}

function isThirtyMinuteWarningWindow(item: ForebetRangeItem) {
  const minute = estimatedMatchMinute(item);
  return minute >= 60 && minute <= 70 && !isFinished(item);
}

function estimatedMatchMinute(item: ForebetRangeItem) {
  const elapsedMinutes = literalMatchElapsedMinutes(item.match_date);
  if (elapsedMinutes == null) {
    return 0;
  }
  return Math.max(0, elapsedMinutes);
}

function isFinished(item: ForebetRangeItem) {
  const normalizedStatus = item.status.toLowerCase();
  return ["finished", "ft", "ended", "final"].some((status) => normalizedStatus.includes(status));
}

function mergeForebetItems(current: ForebetRangeItem[], incoming: ForebetRangeItem[]) {
  const currentById = new Map(current.map((item) => [item.match_id, item]));
  return incoming.map((item) => {
    const previous = currentById.get(item.match_id);
    if (!previous) {
      return item;
    }
    return {
      ...previous,
      ...item,
      score_range: previous.score_range ?? item.score_range,
      reliability: previous.score_range ? previous.reliability : item.reliability,
    };
  });
}

function requestNotificationPermission() {
  if (!("Notification" in window) || Notification.permission !== "default") {
    return;
  }
  Notification.requestPermission().catch(() => undefined);
}

function notifyMatchStarted(item: ForebetRangeItem) {
  const title = "Ha comenzado el partido";
  const body = `${item.home_team} - ${item.away_team}`;
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

function notifyForecastStillPossible(item: ForebetRangeItem, label: string) {
  const title = "Pronostico Forebet aun posible";
  const body = `${item.home_team} - ${item.away_team}: ${label}. ${formatCurrentScore(item)}.`;
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

function readForebetWatchState(): ForebetWatchState {
  try {
    const raw = localStorage.getItem(FOREBET_WATCH_KEY);
    if (!raw) {
      return { autoRefresh: true, forecastAlerts: false, matchIds: [], notifiedForecastIds: [], notifiedStartedIds: [] };
    }
    const parsed = JSON.parse(raw) as Partial<ForebetWatchState>;
    return {
      autoRefresh: parsed.autoRefresh == null ? true : Boolean(parsed.autoRefresh),
      forecastAlerts: Boolean(parsed.forecastAlerts),
      matchIds: Array.isArray(parsed.matchIds) ? parsed.matchIds.filter((id): id is number => typeof id === "number") : [],
      notifiedForecastIds: Array.isArray(parsed.notifiedForecastIds)
        ? parsed.notifiedForecastIds.filter((id): id is number => typeof id === "number")
        : [],
      notifiedStartedIds: Array.isArray(parsed.notifiedStartedIds)
        ? parsed.notifiedStartedIds.filter((id): id is number => typeof id === "number")
        : [],
    };
  } catch {
    return { autoRefresh: true, forecastAlerts: false, matchIds: [], notifiedForecastIds: [], notifiedStartedIds: [] };
  }
}

function writeForebetWatchState(state: ForebetWatchState) {
  localStorage.setItem(FOREBET_WATCH_KEY, JSON.stringify(state));
}

