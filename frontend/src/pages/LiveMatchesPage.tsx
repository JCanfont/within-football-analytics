import { Activity, RefreshCw, Save } from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { fetchLiveMatchSnapshot, fetchLiveProviderStatus, fetchSofaScoreEventSnapshot, fetchSofaScoreTeamEvents, loadForebetDate } from "../services/api";
import type { ForebetRangeItem, LiveMatchSnapshot, LiveProviderStatus, SofaScoreTeamEvent } from "../types/api";

const FOREBET_WATCH_KEY = "within_forebet_watch";
const LIVE_PARAMS_KEY = "within_live_match_parameters";
const SOFASCORE_TEAMS_KEY = "within_sofascore_live_teams";

type LiveMatchParameters = {
  minute: number;
  homeShotsOnTarget: number;
  awayShotsOnTarget: number;
  homeExpectedByMinute: number;
  awayExpectedByMinute: number;
  competitionExpectedByMinute: number;
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
  const [teamEvents, setTeamEvents] = useState<Record<number, SofaScoreTeamEvent[]>>({});
  const [eventSnapshots, setEventSnapshots] = useState<Record<number, LiveMatchSnapshot>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
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

  function addSofaScoreTeam() {
    const teamId = Number(teamInput.trim());
    if (!Number.isFinite(teamId) || teamId <= 0) {
      setMessage("Introduce un ID numerico de equipo SofaScore.");
      return;
    }
    saveSofaScoreTeams([...sofaScoreTeamIds, teamId]);
    setTeamInput("");
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
        fetchSofaScoreTeamEvents(teamId, "next", 0)
          .then((result) => [teamId, result.events] as const)
          .catch(() => [teamId, []] as const),
      ),
    )
      .then((items) => {
        setTeamEvents(Object.fromEntries(items));
        const total = items.reduce((sum, [, events]) => sum + events.length, 0);
        setMessage(`${total} eventos SofaScore encontrados para ${items.length} equipos elegidos.`);
      })
      .finally(() => setIsLoadingTeams(false));
  }

  function refreshEventSnapshot(eventId: number) {
    fetchSofaScoreEventSnapshot(eventId)
      .then((snapshot) => setEventSnapshots((current) => ({ ...current, [eventId]: snapshot })))
      .catch(() =>
        setEventSnapshots((current) => ({
          ...current,
          [eventId]: {
            match_id: eventId,
            provider: "sofascore-crawlora",
            status: "request_failed",
            message: "No se pudo consultar el evento SofaScore.",
            captured_at: new Date().toISOString(),
          },
        })),
      );
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
        </div>
        {sofaScoreTeamIds.length ? (
          <div className="live-match-list">
            {sofaScoreTeamIds.map((teamId) => (
              <SofaScoreTeamBlock
                key={teamId}
                events={teamEvents[teamId] ?? []}
                onRemove={() => saveSofaScoreTeams(sofaScoreTeamIds.filter((item) => item !== teamId))}
                onSnapshot={refreshEventSnapshot}
                snapshots={eventSnapshots}
                teamId={teamId}
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

function SofaScoreTeamBlock({
  events,
  onRemove,
  onSnapshot,
  snapshots,
  teamId,
}: {
  events: SofaScoreTeamEvent[];
  onRemove: () => void;
  onSnapshot: (eventId: number) => void;
  snapshots: Record<number, LiveMatchSnapshot>;
  teamId: number;
}) {
  return (
    <article className="live-match-card">
      <div className="live-match-heading">
        <div>
          <span>Equipo SofaScore</span>
          <strong>ID {teamId}</strong>
        </div>
        <button className="row-action" type="button" onClick={onRemove}>
          Quitar
        </button>
      </div>
      {events.length ? (
        <div className="live-match-list compact">
          {events.map((event) => {
            const snapshot = snapshots[event.event_id];
            return (
              <div className="live-provider-card" key={event.event_id}>
                <div>
                  <span>{event.competition || "SofaScore"}</span>
                  <strong>
                    {event.home_team} vs {event.away_team}
                  </strong>
                  <small>{formatTime(event.start_time)} · {event.status}</small>
                </div>
                <div>
                  <span>Marcador</span>
                  <strong>{formatEventScore(event, snapshot)}</strong>
                  <small>{snapshot?.minute != null ? `Minuto ${snapshot.minute}` : snapshot?.message ?? "Sin snapshot"}</small>
                </div>
                <div>
                  <span>Tiros a puerta</span>
                  <strong>{formatPair(snapshot?.home_shots_on_target, snapshot?.away_shots_on_target)}</strong>
                  <small>Evento {event.event_id}</small>
                </div>
                <button className="row-action" type="button" onClick={() => onSnapshot(event.event_id)}>
                  Actualizar evento
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="detail-state">Pulsa Cargar equipos para traer eventos de este equipo.</div>
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

  return (
    <article className="live-match-card">
      <div className="live-match-heading">
        <div>
          <span>{match.competition}</span>
          <strong>
            {match.home_team} vs {match.away_team}
          </strong>
        </div>
        <div>
          <span>{formatTime(match.match_date)}</span>
          <strong>{formatScore(match)}</strong>
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
