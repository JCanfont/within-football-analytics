import { Bell, BellRing, Calculator, CalendarDays, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchSofaScoreLiveEvents, loadForebetDate, sendForebetStartEmail } from "../services/api";
import type { ForebetDateLoadResult, ForebetRangeItem, SofaScoreTeamEvent } from "../types/api";
import { saveForebetHistory } from "../utils/forebetHistory";
import {
  evaluateForecastState,
  formatCurrentScore,
  formatFinalScore,
  formatForecastColumn,
  formatMatchStartStatus,
  formatOverUnder,
  formatOverUnderSignal,
  hasMatchStarted,
  isLiveMatch,
  isRecord,
  isThirtyMinuteWarningWindow,
  matchTimingState,
  overUnderSignal,
  predictedScoreLabel,
} from "../utils/forebetSignals";

type GoalPredictionMode = "full" | "score" | "total" | "overUnder";
type OverUnderFilter = "all" | "over" | "under";

const goalPredictionModes: Array<{ label: string; mode: GoalPredictionMode }> = [
  { label: "Todo", mode: "full" },
  { label: "Marcador", mode: "score" },
  { label: "Goles", mode: "total" },
  { label: "Over/Under", mode: "overUnder" },
];

const overUnderFilters: Array<{ label: string; value: OverUnderFilter }> = [
  { label: "Todos", value: "all" },
  { label: "Over", value: "over" },
  { label: "Under", value: "under" },
];

const FOREBET_WATCH_KEY = "within_forebet_watch";
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
  const [overUnderFilter, setOverUnderFilter] = useState<OverUnderFilter>("all");
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
        saveForebetHistory(result.matches);
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
    Promise.allSettled([loadForebetDate(targetDate, false), fetchSofaScoreLiveEvents()])
      .then(([forebetResult, liveResult]) => {
        if (forebetResult.status === "rejected") {
          throw forebetResult.reason;
        }
        const result = forebetResult.value;
        const liveEvents = liveResult.status === "fulfilled" ? liveResult.value?.events ?? [] : [];
        const refreshedMatches = mergeLiveScores(result.matches, liveEvents);
        setItems((current) => mergeForebetItems(current, refreshedMatches));
        saveForebetHistory(refreshedMatches);
        setForebetLoad(result);
        setLastLiveRefresh(new Date().toISOString());
        setNextLiveRefresh(new Date(Date.now() + LIVE_REFRESH_MS).toISOString());
        checkStartedAlerts(refreshedMatches);
        checkForecastAlerts(refreshedMatches);
        const liveWithScore = refreshedMatches.filter((item) => isLiveMatch(item) && item.home_score != null && item.away_score != null).length;
        setLiveMessage(`Forebet actualizado: ${refreshedMatches.length} partidos revisados · ${liveWithScore} resultados en curso.`);
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
      if (isLiveMatch(item)) {
        emailMatchStarted(item, setLiveMessage);
      }
      setNotifiedStartedIds((current) => [...new Set([...current, item.match_id])]);
    }
  }

  function checkStartedAlerts(nextItems: ForebetRangeItem[]) {
    const nextNotified = new Set(notifiedStartedIdsRef.current);
    const startedLabels: string[] = [];
    for (const item of nextItems) {
      if (!watchedMatchIdsRef.current.includes(item.match_id) || nextNotified.has(item.match_id) || !hasMatchStarted(item)) {
        continue;
      }
      notifyMatchStarted(item);
      if (isLiveMatch(item)) {
        emailMatchStarted(item, setLiveMessage);
      }
      startedLabels.push(`${item.home_team} - ${item.away_team}`);
      nextNotified.add(item.match_id);
    }
    if (nextNotified.size !== notifiedStartedIdsRef.current.length) {
      setNotifiedStartedIds(Array.from(nextNotified));
      if (startedLabels.length) {
        setLiveMessage(`Ha comenzado: ${startedLabels.join(", ")}.`);
      }
    }
  }

  function checkForecastAlerts(nextItems: ForebetRangeItem[]) {
    if (!forecastAlertsRef.current) {
      return;
    }
    const nextNotified = new Set(notifiedForecastIdsRef.current);
    const possibleLabels: string[] = [];
    for (const item of nextItems) {
      if (!watchedMatchIdsRef.current.includes(item.match_id) || nextNotified.has(item.match_id) || !isLiveMatch(item)) {
        continue;
      }
      const forecastState = evaluateForecastState(item);
      if (forecastState.status !== "possible") {
        continue;
      }
      const shouldAlertNow = isThirtyMinuteWarningWindow(item) || hasMatchStarted(item);
      if (!shouldAlertNow) {
        continue;
      }
      notifyForecastStillPossible(item, forecastState);
      possibleLabels.push(`${item.home_team} - ${item.away_team}: ${forecastState.detail}`);
      nextNotified.add(item.match_id);
    }
    if (nextNotified.size !== notifiedForecastIdsRef.current.length) {
      setNotifiedForecastIds(Array.from(nextNotified));
      if (possibleLabels.length) {
        setLiveMessage(`Pronostico Forebet aun posible: ${possibleLabels.join(" · ")}`);
      }
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
    const visibleItems = items.filter((item) => {
      const matchesQuery = !normalized
        || `${item.home_team} ${item.away_team} ${item.competition} ${item.season}`.toLowerCase().includes(normalized);
      if (!matchesQuery) {
        return false;
      }
      if (overUnderFilter === "all") {
        return true;
      }
      return overUnderSignal(item) === overUnderFilter;
    });
    return [...visibleItems].sort((first, second) =>
      compareMatchDateTime(first.match_date, second.match_date) || first.home_team.localeCompare(second.home_team),
    );
  }, [items, overUnderFilter, query]);

  const overUnderCounts = useMemo(() => {
    return items.reduce(
      (counts, item) => {
        const signal = overUnderSignal(item);
        if (signal === "over") {
          counts.over += 1;
        } else if (signal === "under") {
          counts.under += 1;
        }
        return counts;
      },
      { over: 0, under: 0 },
    );
  }, [items]);

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
            <div className="forebet-mode-control" aria-label="Filtro Over Under Forebet">
              {overUnderFilters.map((option) => (
                <button
                  className={overUnderFilter === option.value ? "active" : ""}
                  key={option.value}
                  type="button"
                  onClick={() => setOverUnderFilter(option.value)}
                >
                  {option.label}
                  {option.value === "over" ? ` (${overUnderCounts.over})` : ""}
                  {option.value === "under" ? ` (${overUnderCounts.under})` : ""}
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
            setForecastAlerts((current) => {
              const next = !current;
              if (next) {
                setLiveMessage("Avisos de pronostico vivo activados. Revisando partidos seguidos...");
                window.setTimeout(() => refreshLiveResults(true), 0);
              } else {
                setLiveMessage("Avisos de pronostico vivo desactivados.");
              }
              return next;
            });
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
                  <th>Over/Under</th>
                  <th>RF</th>
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
        <span>Seguimiento de inicio, Over/Under y pronostico</span>
        <strong>{watchedCount} partidos con aviso</strong>
        <small>
          {autoRefresh
            ? `Actualizacion cada 10 minutos${nextRefresh ? `, proxima ${formatTimeOnly(nextRefresh)}` : ""}${forecastAlerts ? ". Aviso si el marcador Forebet sigue posible" : ""}`
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
  const forecastState = formatForecastColumn(item);
  const ouSignal = overUnderSignal(item);
  const rowClassName = [
    forecastState.status === "impossible" ? "forecast-impossible-row" : "",
    forecastState.status === "possible" && isLiveMatch(item) ? "forecast-possible-row" : "",
    forecastState.label === "Cumplido" ? "forecast-possible-row" : "",
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
          <span className="table-subtext">{item.competition}</span>
        </td>
        <td>
          <button className={isWatched ? "row-action active" : "row-action"} type="button" onClick={onToggleWatch}>
            {isWatched ? <BellRing size={15} aria-hidden="true" /> : <Bell size={15} aria-hidden="true" />}
            {isWatched ? "Aviso activo" : "Avisar inicio"}
          </button>
          <span className="table-subtext">{formatMatchStartStatus(item)}</span>
          {isLiveMatch(item) ? <span className="table-subtext">{formatCurrentScore(item)}</span> : null}
        </td>
        <td>{item.forebet_prediction ?? "Sin captura"}</td>
        <td>
          <span className={`ou-signal ${ouSignal ?? "pending"}`}>{formatOverUnderSignal(item)}</span>
        </td>
        <td>
          <strong>{formatFinalScore(item)}</strong>
        </td>
        <td>
          <span className={`forecast-status ${forecastState.status}`}>{forecastState.label}</span>
          <span className="table-subtext">{forecastState.detail}</span>
          <span className="table-subtext">
            {forecastAlerts && isWatched ? " · aviso vivo" : ""}
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
          <td colSpan={12}>
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

function formatPossibleScores(range?: Record<string, unknown> | null) {
  if (!Array.isArray(range?.possible_scores)) {
    return "Sin rango";
  }
  return range.possible_scores.length > 0 ? range.possible_scores.map(String).join(" | ") : "Sin prediccion";
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

function mergeLiveScores(matches: ForebetRangeItem[], events: SofaScoreTeamEvent[]) {
  return matches.map((match) => {
    const event = events.find((candidate) =>
      sameTeam(match.home_team, candidate.home_team) &&
      sameTeam(match.away_team, candidate.away_team) &&
      candidate.home_score != null &&
      candidate.away_score != null
    );
    if (!event) {
      return match;
    }
    return {
      ...match,
      status: "live",
      home_score: event.home_score,
      away_score: event.away_score,
    };
  });
}

function sameTeam(left: string, right: string) {
  const normalizedLeft = normalizeTeam(left);
  const normalizedRight = normalizeTeam(right);
  return normalizedLeft === normalizedRight ||
    (Math.min(normalizedLeft.length, normalizedRight.length) >= 5 &&
      (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)));
}

function normalizeTeam(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function requestNotificationPermission() {
  if (!("Notification" in window) || Notification.permission !== "default") {
    return;
  }
  Notification.requestPermission().catch(() => undefined);
}

function notifyMatchStarted(item: ForebetRangeItem) {
  const title = "Ha comenzado el partido";
  const signal = formatOverUnderSignal(item);
  const score = predictedScoreLabel(item);
  const body = `${item.home_team} - ${item.away_team}${score ? ` · Pronostico ${score}` : ""}${signal !== "Sin Over/Under" ? ` · ${signal}` : ""}`;
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

function emailMatchStarted(item: ForebetRangeItem, setMessage: (message: string) => void) {
  sendForebetStartEmail({
    home_team: item.home_team,
    away_team: item.away_team,
    match_date: item.match_date,
    competition: item.competition,
    home_score: item.home_score,
    away_score: item.away_score,
    over_under: formatOverUnderSignal(item),
  })
    .then((result) => {
      if (result.sent) {
        setMessage(`${item.home_team} - ${item.away_team}: aviso de inicio enviado por email.`);
      } else if (!result.configured) {
        setMessage("Partido iniciado. El aviso por email esta pendiente de configurar en Vercel.");
      }
    })
    .catch(() => setMessage("Partido iniciado, pero no se pudo enviar el aviso por email."));
}

function notifyForecastStillPossible(item: ForebetRangeItem, forecastState: { label: string; detail: string }) {
  const title = "Pronostico Forebet aun posible";
  const body = `${item.home_team} - ${item.away_team}: ${forecastState.detail}. ${formatCurrentScore(item)}.`;
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

