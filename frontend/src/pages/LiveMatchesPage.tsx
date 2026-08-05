import { Activity, RefreshCw, Save } from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  fetchLiveMatchSnapshot,
  fetchLiveProviderStatus,
  fetchSofaScoreEventSnapshot,
  loadForebetDate,
  storeSofaScoreLiveEvents,
  storeSofaScoreTeamEvents,
} from "../services/api";
import type { ForebetRangeItem, LiveMatchSnapshot, LiveProviderStatus, SofaScoreTeamEvent } from "../types/api";
import {
  evaluateForecastState,
  formatCurrentScore,
  formatMatchStartStatus,
  formatOverUnderSignal,
  isLiveMatch,
  overUnderSignal,
  predictedScoreLabel,
} from "../utils/forebetSignals";

const FOREBET_WATCH_KEY = "within_forebet_watch";
const LIVE_PARAMS_KEY = "within_live_match_parameters";
const SOFASCORE_TEAMS_KEY = "within_sofascore_live_teams";
const SOFASCORE_TEAM_NAMES_KEY = "within_sofascore_live_team_names";
const LIVE_COMMENTARY_HISTORY_KEY = "within_live_commentary_history";
const DASHBOARD_HIGHLIGHTED_EVENTS_KEY = "within_dashboard_highlighted_sofascore_events";

type LiveMatchParameters = {
  minute: number;
  homeShotsOnTarget: number;
  awayShotsOnTarget: number;
  homeExpectedByMinute: number;
  awayExpectedByMinute: number;
  competitionExpectedByMinute: number;
};

type LiveCommentaryHistory = Record<number, string[]>;
type SofaScoreTeamNames = Record<number, string>;
type HighlightedSofaScoreEvent = {
  eventId: number;
  label: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  startTime: string;
  interestMatchId?: number | null;
};

const DEFAULT_PARAMETERS: LiveMatchParameters = {
  minute: 30,
  homeShotsOnTarget: 0,
  awayShotsOnTarget: 0,
  homeExpectedByMinute: 3,
  awayExpectedByMinute: 3,
  competitionExpectedByMinute: 2.4,
};

export function LiveMatchesPage() {
  const [targetDate, setTargetDate] = useState(todayInputValue());
  const [matches, setMatches] = useState<ForebetRangeItem[]>([]);
  const [parameters, setParameters] = useState<Record<number, LiveMatchParameters>>(readLiveParameters);
  const [snapshots, setSnapshots] = useState<Record<number, LiveMatchSnapshot>>({});
  const [providerStatus, setProviderStatus] = useState<LiveProviderStatus | null>(null);
  const [teamInput, setTeamInput] = useState("");
  const [sofaScoreTeamIds, setSofaScoreTeamIds] = useState<number[]>(readSofaScoreTeamIds);
  const [sofaScoreTeamNames, setSofaScoreTeamNames] = useState<SofaScoreTeamNames>(readSofaScoreTeamNames);
  const [liveEvents, setLiveEvents] = useState<SofaScoreTeamEvent[]>([]);
  const [teamEvents, setTeamEvents] = useState<Record<number, SofaScoreTeamEvent[]>>({});
  const [eventSnapshots, setEventSnapshots] = useState<Record<number, LiveMatchSnapshot>>({});
  const [commentaryHistory, setCommentaryHistory] = useState<LiveCommentaryHistory>(readLiveCommentaryHistory);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const [isLoadingLiveEvents, setIsLoadingLiveEvents] = useState(false);
  const [message, setMessage] = useState<string | null>(() => initialLiveMessage());

  const watchedIds = useMemo(() => readWatchedForebetMatchIds(), []);
  const selectedMatches = matches.filter((match) => watchedIds.includes(match.match_id));

  useEffect(() => {
    fetchLiveProviderStatus()
      .then(setProviderStatus)
      .catch(() =>
        setProviderStatus({
          provider: "sofascore",
          status: "backend_unavailable",
          configured: false,
          message: "No se pudo consultar el estado del proveedor live.",
        }),
      );
  }, []);

  function saveParameters(nextParameters: Record<number, LiveMatchParameters>) {
    setParameters(nextParameters);
    localStorage.setItem(LIVE_PARAMS_KEY, JSON.stringify(nextParameters));
  }

  function updateMatchParameter(matchId: number, field: keyof LiveMatchParameters, value: string) {
    const numericValue = Number(value.replace(",", "."));
    const safeValue = Number.isFinite(numericValue) ? numericValue : 0;
    saveParameters({
      ...parameters,
      [matchId]: {
        ...(parameters[matchId] ?? DEFAULT_PARAMETERS),
        [field]: safeValue,
      },
    });
  }

  function refreshMatches() {
    if (!targetDate) {
      return;
    }
    setIsLoading(true);
    setMessage("Actualizando partidos seleccionados desde Forebet...");
    loadForebetDate(targetDate, false)
      .then((result) => {
        setMatches(result.matches);
        setMessage(`${result.matches.length} partidos Forebet revisados; ${readWatchedForebetMatchIds().length} seleccionados para directo.`);
        refreshSnapshots(result.matches.filter((match) => readWatchedForebetMatchIds().includes(match.match_id)));
      })
      .catch(() => {
        setMessage("No se pudieron cargar los partidos de Forebet.");
      })
      .finally(() => setIsLoading(false));
  }

  function refreshSnapshots(items: ForebetRangeItem[] = selectedMatches) {
    for (const match of items) {
      fetchLiveMatchSnapshot(match.match_id)
        .then((snapshot) => setSnapshots((current) => ({ ...current, [match.match_id]: snapshot })))
        .catch(() =>
          setSnapshots((current) => ({
            ...current,
            [match.match_id]: {
              match_id: match.match_id,
              provider: "sofascore",
              status: "request_failed",
              message: "No se pudo consultar el snapshot live.",
              captured_at: new Date().toISOString(),
            },
          })),
        );
    }
  }

  function saveSofaScoreTeams(nextIds: number[]) {
    const unique = Array.from(new Set(nextIds)).filter((teamId) => Number.isFinite(teamId) && teamId > 0);
    setSofaScoreTeamIds(unique);
    localStorage.setItem(SOFASCORE_TEAMS_KEY, JSON.stringify(unique));
  }

  function saveSofaScoreTeamNames(nextNames: SofaScoreTeamNames) {
    setSofaScoreTeamNames(nextNames);
    localStorage.setItem(SOFASCORE_TEAM_NAMES_KEY, JSON.stringify(nextNames));
  }

  function rememberSofaScoreTeamNames(events: SofaScoreTeamEvent[]) {
    const nextNames = { ...sofaScoreTeamNames };
    for (const event of events) {
      if (event.home_team_id) {
        nextNames[event.home_team_id] = event.home_team;
      }
      if (event.away_team_id) {
        nextNames[event.away_team_id] = event.away_team;
      }
    }
    saveSofaScoreTeamNames(nextNames);
  }

  function groupLiveEventsByTeam(events: SofaScoreTeamEvent[]) {
    const grouped: Record<number, SofaScoreTeamEvent[]> = {};
    for (const event of events.filter(isLiveSofaScoreEvent)) {
      for (const teamId of [event.home_team_id, event.away_team_id]) {
        if (!teamId) {
          continue;
        }
        grouped[teamId] = [...(grouped[teamId] ?? []), event];
      }
    }
    return grouped;
  }

  function addSofaScoreTeam() {
    const teamId = Number(teamInput.trim());
    if (!Number.isFinite(teamId) || teamId <= 0) {
      setMessage("Introduce un ID numerico de equipo SofaScore.");
      return;
    }
    addSofaScoreTeamById(teamId);
    setTeamInput("");
  }

  function addSofaScoreTeamById(teamId?: number | null) {
    if (!teamId || !Number.isFinite(teamId) || teamId <= 0) {
      setMessage("Ese partido no trae ID de equipo SofaScore.");
      return;
    }
    saveSofaScoreTeams([...sofaScoreTeamIds, teamId]);
    setMessage(`Equipo SofaScore ${teamId} anadido. Pulsa Cargar equipos para ver sus eventos.`);
  }

  function followLiveEvents(events: SofaScoreTeamEvent[]) {
    const teamIds = events.flatMap((event) => [event.home_team_id, event.away_team_id]).filter((teamId): teamId is number => Number.isFinite(teamId) && Boolean(teamId));
    if (!teamIds.length) {
      setMessage("No hay equipos SofaScore validos en los partidos en directo cargados.");
      return;
    }
    const previousCount = sofaScoreTeamIds.length;
    const nextIds = Array.from(new Set([...sofaScoreTeamIds, ...teamIds]));
    saveSofaScoreTeams(nextIds);
    rememberSofaScoreTeamNames(events);
    setTeamEvents((current) => ({ ...current, ...groupLiveEventsByTeam(events) }));
    setMessage(`${nextIds.length - previousCount} equipos anadidos desde ${events.length} partidos en directo. Los nombres y partidos quedan visibles debajo.`);
  }

  function rememberLiveCommentary(event: SofaScoreTeamEvent, snapshot?: LiveMatchSnapshot) {
    const line = buildLiveCommentaryLine(event, snapshot);
    setCommentaryHistory((current) => {
      const currentLines = current[event.event_id] ?? [];
      if (currentLines[currentLines.length - 1] === line) {
        return current;
      }
      const next = {
        ...current,
        [event.event_id]: [...currentLines, line].slice(-80),
      };
      localStorage.setItem(LIVE_COMMENTARY_HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }

  function findSofaScoreEvent(eventId: number) {
    return liveEvents.find((event) => event.event_id === eventId) ?? Object.values(teamEvents).flat().find((event) => event.event_id === eventId);
  }

  function refreshLiveEvents() {
    setIsLoadingLiveEvents(true);
    setMessage("Consultando y guardando partidos de futbol en directo desde SofaScore...");
    storeSofaScoreLiveEvents("football")
      .then((result) => {
        const liveOnlyEvents = result.events.filter(isLiveSofaScoreEvent);
        setLiveEvents(liveOnlyEvents);
        rememberSofaScoreTeamNames(liveOnlyEvents);
        setTeamEvents((current) => ({ ...current, ...groupLiveEventsByTeam(liveOnlyEvents) }));
        liveOnlyEvents.forEach((event) => rememberLiveCommentary(event));
        setMessage(`${result.message} Ya estan sumados al total de partidos.`);
      })
      .catch(() => {
        setLiveEvents([]);
        setMessage("No se pudieron cargar los partidos en directo de SofaScore.");
      })
      .finally(() => setIsLoadingLiveEvents(false));
  }

  function refreshAndFollowLiveEvents() {
    setIsLoadingLiveEvents(true);
    setMessage("Cargando y seleccionando partidos en directo desde SofaScore...");
    storeSofaScoreLiveEvents("football")
      .then((result) => {
        const liveOnlyEvents = result.events.filter(isLiveSofaScoreEvent);
        setLiveEvents(liveOnlyEvents);
        rememberSofaScoreTeamNames(liveOnlyEvents);
        liveOnlyEvents.forEach((event) => rememberLiveCommentary(event));
        followLiveEvents(liveOnlyEvents);
        setMessage(`${result.message} Equipos de directos anadidos al seguimiento.`);
      })
      .catch(() => {
        setLiveEvents([]);
        setMessage("No se pudieron cargar los partidos en directo de SofaScore.");
      })
      .finally(() => setIsLoadingLiveEvents(false));
  }

  function refreshTeamEvents() {
    if (!sofaScoreTeamIds.length) {
      setMessage("Anade primero uno o varios equipos SofaScore.");
      return;
    }
    setIsLoadingTeams(true);
    setMessage("Consultando SofaScore para los equipos elegidos...");
    Promise.all(
      sofaScoreTeamIds.map((teamId) =>
        storeSofaScoreTeamEvents(teamId, "next", 0)
          .then((result) => [teamId, result.events.filter(isLiveSofaScoreEvent)] as const)
          .catch(() => [teamId, (teamEvents[teamId] ?? []).filter(isLiveSofaScoreEvent)] as const),
      ),
    )
      .then((items) => {
        setTeamEvents(Object.fromEntries(items));
        items.forEach(([, events]) => rememberSofaScoreTeamNames(events));
        items.forEach(([, events]) => events.forEach((event) => rememberLiveCommentary(event)));
        const total = items.reduce((sum, [, events]) => sum + events.length, 0);
        setMessage(`${total} eventos SofaScore encontrados o conservados para ${items.length} equipos elegidos.`);
      })
      .finally(() => setIsLoadingTeams(false));
  }

  function refreshEventSnapshot(eventId: number) {
    fetchSofaScoreEventSnapshot(eventId)
      .then((snapshot) => {
        setEventSnapshots((current) => ({ ...current, [eventId]: snapshot }));
        const event = findSofaScoreEvent(eventId);
        if (event) {
          rememberLiveCommentary(event, snapshot);
        }
      })
      .catch(() => {
        const failedSnapshot = {
          match_id: eventId,
          provider: "sofascore-crawlora",
          status: "request_failed",
          message: "No se pudo consultar el evento SofaScore.",
          captured_at: new Date().toISOString(),
        };
        setEventSnapshots((current) => ({
          ...current,
          [eventId]: failedSnapshot,
        }));
        const event = findSofaScoreEvent(eventId);
        if (event) {
          rememberLiveCommentary(event, failedSnapshot);
        }
      });
  }

  function highlightEventForDashboard(event: SofaScoreTeamEvent) {
    const highlightedEvent: HighlightedSofaScoreEvent = {
      eventId: event.event_id,
      label: `${event.home_team} vs ${event.away_team}`,
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      competition: event.competition || "SofaScore live",
      startTime: event.start_time,
      interestMatchId: event.interest_match_id ?? null,
    };
    const current = readHighlightedSofaScoreEvents();
    const next = [highlightedEvent, ...current.filter((item) => item.eventId !== event.event_id)].slice(0, 20);
    localStorage.setItem(DASHBOARD_HIGHLIGHTED_EVENTS_KEY, JSON.stringify(next));
    setMessage(`${highlightedEvent.label} queda destacado en el dashboard para analisis y comparativa.`);
  }

  return (
    <section className="live-matches-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Seguimiento en directo</p>
          <h1>Partidos en directo</h1>
        </div>
        <div className="forebet-actions">
          <label className="forebet-date-form">
            <span>Fecha</span>
            <input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
          </label>
          <button className="filter-show" type="button" onClick={refreshMatches} disabled={isLoading}>
            <RefreshCw size={17} aria-hidden="true" />
            {isLoading ? "Actualizando" : "Actualizar"}
          </button>
        </div>
      </header>

      <section className="panel live-matches-panel">
        <div className="panel-heading">
          <div>
            <h2>Partidos seleccionados en Forebet</h2>
            <p>{message}</p>
            <p className={providerStatus?.configured ? "live-provider-status ready" : "live-provider-status pending"}>
              Sofascore: {providerStatus?.message ?? "Comprobando proveedor live..."}
            </p>
          </div>
          <Activity size={20} aria-hidden="true" />
        </div>
        {selectedMatches.length ? (
          <div className="live-match-list">
            {selectedMatches.map((match) => (
              <LiveMatchCard
                key={match.match_id}
                match={match}
                onChange={updateMatchParameter}
                onRefreshSnapshot={() => refreshSnapshots([match])}
                parameters={parameters[match.match_id] ?? DEFAULT_PARAMETERS}
                snapshot={snapshots[match.match_id]}
              />
            ))}
          </div>
        ) : watchedIds.length ? (
          <div className="detail-state">Hay {watchedIds.length} partidos seleccionados. Pulsa Actualizar para traerlos desde Forebet sin bloquear la entrada a esta pantalla.</div>
        ) : (
          <div className="detail-state">Selecciona partidos en Forebet con el boton Avisar inicio para que aparezcan aqui.</div>
        )}
      </section>

      <section className="panel live-matches-panel">
        <div className="panel-heading">
          <div>
            <h2>Equipos SofaScore elegidos</h2>
            <p>Introduce los IDs de equipo SofaScore y carga sus proximos partidos o eventos live.</p>
          </div>
          <Activity size={20} aria-hidden="true" />
        </div>
        <div className="forebet-actions">
          <label className="forebet-date-form">
            <span>ID equipo SofaScore</span>
            <input value={teamInput} inputMode="numeric" onChange={(event) => setTeamInput(event.target.value)} placeholder="Ej. 2817" />
          </label>
          <button className="filter-show" type="button" onClick={addSofaScoreTeam}>
            Anadir equipo
          </button>
          <button className="filter-show" type="button" onClick={refreshTeamEvents} disabled={isLoadingTeams}>
            <RefreshCw size={17} aria-hidden="true" />
            {isLoadingTeams ? "Consultando" : "Cargar equipos"}
          </button>
          <button className="filter-show" type="button" onClick={refreshLiveEvents} disabled={isLoadingLiveEvents}>
            <RefreshCw size={17} aria-hidden="true" />
            {isLoadingLiveEvents ? "Buscando live" : "Cargar partidos en directo"}
          </button>
          <button className="filter-show" type="button" onClick={refreshAndFollowLiveEvents} disabled={isLoadingLiveEvents}>
            Seguir directos SofaScore
          </button>
          <button className="filter-show" type="button" onClick={() => followLiveEvents(liveEvents)} disabled={!liveEvents.length || isLoadingLiveEvents}>
            Seguir lista cargada
          </button>
        </div>
        {liveEvents.length ? (
          <div className="live-match-list compact">
            {liveEvents.map((event) => (
              <SofaScoreLiveEventRow
                event={event}
                history={commentaryHistory[event.event_id] ?? []}
                key={event.event_id}
                onAddAway={() => addSofaScoreTeamById(event.away_team_id)}
                onAddHome={() => addSofaScoreTeamById(event.home_team_id)}
                onHighlight={() => highlightEventForDashboard(event)}
                onSnapshot={refreshEventSnapshot}
                snapshot={eventSnapshots[event.event_id]}
              />
            ))}
          </div>
        ) : (
          <div className="detail-state">Pulsa Cargar partidos en directo para ver equipos que estan jugando ahora y poder anadirlos.</div>
        )}
        {sofaScoreTeamIds.length ? (
          <div className="live-match-list">
            {sofaScoreTeamIds.map((teamId) => (
              <SofaScoreTeamBlock
                key={teamId}
                events={teamEvents[teamId] ?? []}
                history={commentaryHistory}
                onRemove={() => saveSofaScoreTeams(sofaScoreTeamIds.filter((item) => item !== teamId))}
                onSnapshot={refreshEventSnapshot}
                snapshots={eventSnapshots}
                teamId={teamId}
                teamName={sofaScoreTeamNames[teamId]}
              />
            ))}
          </div>
        ) : (
          <div className="detail-state">Aun no hay equipos SofaScore elegidos.</div>
        )}
      </section>
    </section>
  );
}

function SofaScoreLiveEventRow({
  event,
  history,
  onAddAway,
  onAddHome,
  onHighlight,
  onSnapshot,
  snapshot,
}: {
  event: SofaScoreTeamEvent;
  history: string[];
  onAddAway: () => void;
  onAddHome: () => void;
  onHighlight: () => void;
  onSnapshot: (eventId: number) => void;
  snapshot?: LiveMatchSnapshot;
}) {
  const commentaryLines = history.length ? history : [buildLiveCommentaryLine(event, snapshot)];
  return (
    <article className="live-provider-card">
      <div>
        <span>{event.competition || "SofaScore live"}</span>
        <strong>
          {event.home_team} vs {event.away_team}
        </strong>
        {event.is_interest ? <b className="live-interest-badge">{event.interest_label ?? "PARTIDO DE INTERES"}</b> : null}
        <small>
          {formatTime(event.start_time)} - {event.status}
        </small>
      </div>
      <div>
        <span>Marcador</span>
        <strong>{formatEventScore(event, snapshot)}</strong>
        <small>{snapshot?.minute != null ? `Minuto ${snapshot.minute}` : `Evento ${event.event_id}`}</small>
      </div>
      <div>
        <span>Minuto</span>
        <strong>{formatLiveMinute(event, snapshot)}</strong>
        <small>{formatLiveStatus(event.status)}</small>
      </div>
      <button className="row-action" type="button" onClick={onAddHome}>
        Seguir local
      </button>
      <button className="row-action" type="button" onClick={onAddAway}>
        Seguir visitante
      </button>
      <button className="row-action" type="button" onClick={() => onSnapshot(event.event_id)}>
        Actualizar evento
      </button>
      <button className="row-action" type="button" onClick={onHighlight}>
        Destacar dashboard
      </button>
      <LiveCommentary history={commentaryLines} />
    </article>
  );
}

function SofaScoreTeamBlock({
  events,
  history,
  onRemove,
  onSnapshot,
  snapshots,
  teamId,
  teamName,
}: {
  events: SofaScoreTeamEvent[];
  history: LiveCommentaryHistory;
  onRemove: () => void;
  onSnapshot: (eventId: number) => void;
  snapshots: Record<number, LiveMatchSnapshot>;
  teamId: number;
  teamName?: string;
}) {
  return (
    <article className="live-match-card">
      <div className="live-match-heading">
        <div>
          <span>Equipo SofaScore</span>
          <strong>{teamName ?? `Equipo ${teamId}`}</strong>
          <span>ID {teamId}</span>
        </div>
        <button className="row-action" type="button" onClick={onRemove}>
          Quitar
        </button>
      </div>
      {events.length ? (
        <div className="live-match-list compact">
          {events.map((event) => {
            const snapshot = snapshots[event.event_id];
            const commentaryLines = history[event.event_id]?.length ? history[event.event_id] : [buildLiveCommentaryLine(event, snapshot)];
            return (
              <div className="live-provider-card" key={event.event_id}>
                <div>
                  <span>{event.competition || "SofaScore"}</span>
                  <strong>
                    {event.home_team} vs {event.away_team}
                  </strong>
                  {event.is_interest ? <b className="live-interest-badge">{event.interest_label ?? "PARTIDO DE INTERES"}</b> : null}
                  <small>{formatTime(event.start_time)} · {event.status}</small>
                </div>
                <div>
                  <span>Marcador</span>
                  <strong>{formatEventScore(event, snapshot)}</strong>
                  <small>{snapshot?.minute != null ? `Minuto ${snapshot.minute}` : snapshot?.message ?? "Sin snapshot"}</small>
                </div>
                <div>
                  <span>Minuto</span>
                  <strong>{formatLiveMinute(event, snapshot)}</strong>
                  <small>{formatLiveStatus(event.status)}</small>
                </div>
                <div>
                  <span>Tiros a puerta</span>
                  <strong>{formatPair(snapshot?.home_shots_on_target, snapshot?.away_shots_on_target)}</strong>
                  <small>Evento {event.event_id}</small>
                </div>
                <button className="row-action" type="button" onClick={() => onSnapshot(event.event_id)}>
                  Actualizar evento
                </button>
                <LiveCommentary history={commentaryLines} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="detail-state">No hay eventos visibles para {teamName ?? `el equipo ${teamId}`}. Si viene de directos, pulsa Cargar partidos en directo o Seguir directos SofaScore para reconstruir la lista con nombres.</div>
      )}
    </article>
  );
}

function LiveMatchCard({
  match,
  onChange,
  onRefreshSnapshot,
  parameters,
  snapshot,
}: {
  match: ForebetRangeItem;
  onChange: (matchId: number, field: keyof LiveMatchParameters, value: string) => void;
  onRefreshSnapshot: () => void;
  parameters: LiveMatchParameters;
  snapshot?: LiveMatchSnapshot;
}) {
  const homeSignal = buildPressureSignal(parameters.homeShotsOnTarget, parameters.homeExpectedByMinute, parameters.competitionExpectedByMinute);
  const awaySignal = buildPressureSignal(parameters.awayShotsOnTarget, parameters.awayExpectedByMinute, parameters.competitionExpectedByMinute);
  const ouSignal = overUnderSignal(match);
  const forecastState = isLiveMatch(match) ? evaluateForecastState(match) : null;
  const predictedScore = predictedScoreLabel(match);

  return (
    <article className="live-match-card">
      <div className="live-match-heading">
        <div>
          <span>{match.competition}</span>
          <strong>
            {match.home_team} vs {match.away_team}
          </strong>
          <small>{formatMatchStartStatus(match)}</small>
        </div>
        <div>
          <span>{formatTime(match.match_date)}</span>
          <strong>{formatScore(match)}</strong>
        </div>
      </div>

      <div className="live-provider-card forebet-live-signals">
        <div>
          <span>Senal Over/Under</span>
          <strong className={`ou-signal ${ouSignal ?? "pending"}`}>{formatOverUnderSignal(match)}</strong>
          <small>{predictedScore ? `Marcador Forebet ${predictedScore}` : "Sin marcador Forebet"}</small>
        </div>
        <div>
          <span>Estado pronostico</span>
          <strong className={`forecast-status ${forecastState?.status ?? "pending"}`}>
            {forecastState?.label ?? formatMatchStartStatus(match)}
          </strong>
          <small>{forecastState?.detail ?? formatCurrentScore(match)}</small>
        </div>
        <div>
          <span>Marcador actual</span>
          <strong>{formatScore(match)}</strong>
          <small>{formatCurrentScore(match)}</small>
        </div>
      </div>

      <div className="live-provider-card">
        <div>
          <span>Snapshot Sofascore</span>
          <strong>{formatSnapshotScore(snapshot)}</strong>
          <small>{snapshot?.minute != null ? `Minuto ${snapshot.minute}` : snapshot?.status ?? "Pendiente"}</small>
        </div>
        <div>
          <span>Tiros a puerta</span>
          <strong>{formatPair(snapshot?.home_shots_on_target, snapshot?.away_shots_on_target)}</strong>
          <small>{snapshot?.message ?? "Pulsa para consultar el proveedor live."}</small>
        </div>
        <div>
          <span>Posesion</span>
          <strong>{formatPair(snapshot?.home_possession, snapshot?.away_possession, "%")}</strong>
          <small>{snapshot?.captured_at ? `Capturado ${formatTime(snapshot.captured_at)}` : "Sin captura todavia"}</small>
        </div>
        <button className="row-action" type="button" onClick={onRefreshSnapshot}>
          Actualizar Sofascore
        </button>
      </div>

      <div className="live-parameter-grid">
        <LiveNumberInput label="Minuto" value={parameters.minute} onChange={(event) => onChange(match.match_id, "minute", event.target.value)} />
        <LiveNumberInput
          label={`${match.home_team} tiros a puerta`}
          value={parameters.homeShotsOnTarget}
          onChange={(event) => onChange(match.match_id, "homeShotsOnTarget", event.target.value)}
        />
        <LiveNumberInput
          label={`${match.away_team} tiros a puerta`}
          value={parameters.awayShotsOnTarget}
          onChange={(event) => onChange(match.match_id, "awayShotsOnTarget", event.target.value)}
        />
        <LiveNumberInput
          label="Media competicion"
          value={parameters.competitionExpectedByMinute}
          step="0.1"
          onChange={(event) => onChange(match.match_id, "competitionExpectedByMinute", event.target.value)}
        />
        <LiveNumberInput
          label={`Referencia ${match.home_team}`}
          value={parameters.homeExpectedByMinute}
          step="0.1"
          onChange={(event) => onChange(match.match_id, "homeExpectedByMinute", event.target.value)}
        />
        <LiveNumberInput
          label={`Referencia ${match.away_team}`}
          value={parameters.awayExpectedByMinute}
          step="0.1"
          onChange={(event) => onChange(match.match_id, "awayExpectedByMinute", event.target.value)}
        />
      </div>

      <div className="live-signal-grid">
        <LiveSignal team={match.home_team} signal={homeSignal} />
        <LiveSignal team={match.away_team} signal={awaySignal} />
      </div>

      <p className="live-match-note">
        <Save size={15} aria-hidden="true" />
        Los parametros se guardan localmente por partido y excluyen el partido actual de la referencia que introduzcas.
      </p>
    </article>
  );
}

function LiveNumberInput({
  label,
  onChange,
  step = "1",
  value,
}: {
  label: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  step?: string;
  value: number;
}) {
  return (
    <label className="live-number-input">
      <span>{label}</span>
      <input inputMode="decimal" min="0" step={step} type="number" value={value} onChange={onChange} />
    </label>
  );
}

function LiveSignal({ signal, team }: { signal: ReturnType<typeof buildPressureSignal>; team: string }) {
  return (
    <div className={`live-signal ${signal.tone}`}>
      <span>{team}</span>
      <strong>{signal.label}</strong>
      <small>{signal.detail}</small>
    </div>
  );
}

function LiveCommentary({ history }: { history: string[] }) {
  const currentLine = history[history.length - 1];
  const previousLines = history.slice(0, -1).reverse();
  return (
    <div className="live-commentary">
      <span>Comentario en directo</span>
      {currentLine ? (
        <>
          <p className="live-commentary-current">{currentLine}</p>
          <details className="live-commentary-history">
            <summary>Historial del partido ({history.length})</summary>
            {previousLines.length ? (
              <ul>
                {previousLines.map((line, index) => (
                  <li key={`${line}-${index}`}>{line}</li>
                ))}
              </ul>
            ) : (
              <p>Aun no hay lineas anteriores guardadas para este partido.</p>
            )}
          </details>
        </>
      ) : (
        <p>Cuando se actualice el evento iran apareciendo aqui las lineas del partido.</p>
      )}
    </div>
  );
}

function buildPressureSignal(current: number, teamReference: number, competitionReference: number) {
  const reference = Math.max(teamReference, competitionReference);
  if (reference <= 0) {
    return { label: "Sin referencia", detail: "Introduce una media del equipo o de la competicion.", tone: "neutral" };
  }
  const ratio = current / reference;
  if (ratio < 0.5) {
    return {
      label: "Dificultad alta",
      detail: `${current} tiros a puerta frente a ${reference.toFixed(1)} esperados.`,
      tone: "bad",
    };
  }
  if (ratio < 0.8) {
    return {
      label: "Por debajo de ritmo",
      detail: `${current} tiros a puerta; necesita subir produccion ofensiva.`,
      tone: "warn",
    };
  }
  return {
    label: "Ritmo aceptable",
    detail: `${current} tiros a puerta frente a ${reference.toFixed(1)} de referencia.`,
    tone: "good",
  };
}

function buildLiveCommentaryLine(event: SofaScoreTeamEvent, snapshot?: LiveMatchSnapshot) {
  const parts = [`${formatLiveMinute(event, snapshot)}: ${event.home_team} ${formatEventScore(event, snapshot)} ${event.away_team}`];
  if (snapshot?.home_shots_on_target != null && snapshot.away_shots_on_target != null) {
    parts.push(`tiros a puerta ${snapshot.home_shots_on_target}-${snapshot.away_shots_on_target}`);
  }
  if (snapshot?.home_possession != null && snapshot.away_possession != null) {
    parts.push(`posesion ${snapshot.home_possession}%-${snapshot.away_possession}%`);
  }
  if (snapshot?.message && snapshot.status === "request_failed") {
    parts.push(snapshot.message);
  }
  parts.push(formatLiveStatus(event.status));
  return `${parts.join(". ")}.`;
}

function formatLiveMinute(event: SofaScoreTeamEvent, snapshot?: LiveMatchSnapshot) {
  const minute = snapshot?.minute ?? event.minute;
  if (minute != null) {
    return `Minuto ${formatRegularMatchMinute(minute)}`;
  }
  const estimated = estimateLiveMinute(event);
  if (estimated != null) {
    return `Minuto ${formatRegularMatchMinute(estimated)} estimado`;
  }
  return event.status === "halftime" ? "Descanso" : "Minuto n/d";
}

function estimateLiveMinute(event: SofaScoreTeamEvent) {
  if (event.status !== "inprogress") {
    return null;
  }
  const start = new Date(event.start_time).getTime();
  if (!Number.isFinite(start)) {
    return null;
  }
  const elapsed = Math.floor((Date.now() - start) / 60_000);
  if (elapsed <= 0) {
    return null;
  }
  if (elapsed <= 45) {
    return elapsed;
  }
  if (elapsed <= 60) {
    return 45;
  }
  return Math.min(elapsed - 15, 90);
}

function formatRegularMatchMinute(minute: number) {
  if (minute <= 45) {
    return String(Math.max(1, minute));
  }
  if (minute <= 90) {
    return String(minute);
  }
  return "90+";
}

function formatLiveStatus(status: string) {
  const labels: Record<string, string> = {
    inprogress: "En juego",
    halftime: "Descanso",
    scheduled: "No iniciado",
    finished: "Finalizado",
    canceled: "Cancelado",
  };
  return labels[status] ?? status;
}

function isLiveSofaScoreEvent(event: SofaScoreTeamEvent) {
  return ["inprogress", "halftime", "live"].includes(event.status.toLowerCase());
}

function readWatchedForebetMatchIds() {
  try {
    const raw = localStorage.getItem(FOREBET_WATCH_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as { matchIds?: number[] };
    return Array.isArray(parsed.matchIds) ? parsed.matchIds : [];
  } catch {
    return [];
  }
}

function initialLiveMessage() {
  const watchedCount = readWatchedForebetMatchIds().length;
  if (!watchedCount) {
    return "Se muestran los partidos marcados con aviso en la pantalla Forebet.";
  }
  return `${watchedCount} partidos seleccionados. Pulsa Actualizar para cargar datos live cuando lo necesites.`;
}

function readLiveParameters() {
  try {
    const raw = localStorage.getItem(LIVE_PARAMS_KEY);
    return raw ? (JSON.parse(raw) as Record<number, LiveMatchParameters>) : {};
  } catch {
    return {};
  }
}

function readSofaScoreTeamIds() {
  try {
    const raw = localStorage.getItem(SOFASCORE_TEAMS_KEY);
    const parsed = raw ? (JSON.parse(raw) as number[]) : [];
    return Array.isArray(parsed) ? parsed.filter((value) => Number.isFinite(value)) : [];
  } catch {
    return [];
  }
}

function readSofaScoreTeamNames() {
  try {
    const raw = localStorage.getItem(SOFASCORE_TEAM_NAMES_KEY);
    const parsed = raw ? (JSON.parse(raw) as SofaScoreTeamNames) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readLiveCommentaryHistory() {
  try {
    const raw = localStorage.getItem(LIVE_COMMENTARY_HISTORY_KEY);
    const parsed = raw ? (JSON.parse(raw) as LiveCommentaryHistory) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readHighlightedSofaScoreEvents() {
  try {
    const raw = localStorage.getItem(DASHBOARD_HIGHLIGHTED_EVENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as HighlightedSofaScoreEvent[]) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => Number.isFinite(item.eventId)) : [];
  } catch {
    return [];
  }
}

function formatScore(match: ForebetRangeItem) {
  if (match.home_score == null || match.away_score == null) {
    return match.status;
  }
  return `${match.home_score}-${match.away_score}`;
}

function formatSnapshotScore(snapshot?: LiveMatchSnapshot) {
  if (!snapshot) {
    return "Sin captura";
  }
  if (snapshot.home_score == null || snapshot.away_score == null) {
    return snapshot.status;
  }
  return `${snapshot.home_score}-${snapshot.away_score}`;
}

function formatPair(home?: number | null, away?: number | null, suffix = "") {
  if (home == null || away == null) {
    return "n/d";
  }
  return `${home}${suffix} - ${away}${suffix}`;
}

function formatEventScore(event: SofaScoreTeamEvent, snapshot?: LiveMatchSnapshot) {
  if (snapshot?.home_score != null && snapshot.away_score != null) {
    return `${snapshot.home_score}-${snapshot.away_score}`;
  }
  if (event.home_score != null && event.away_score != null) {
    return `${event.home_score}-${event.away_score}`;
  }
  return event.status;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function todayInputValue() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}
