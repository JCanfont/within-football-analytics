import { Activity, RefreshCw, Save } from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { loadForebetDate } from "../services/api";
import type { ForebetRangeItem } from "../types/api";

const FOREBET_WATCH_KEY = "within_forebet_watch";
const LIVE_PARAMS_KEY = "within_live_match_parameters";

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
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const watchedIds = useMemo(() => readWatchedForebetMatchIds(), []);
  const selectedMatches = matches.filter((match) => watchedIds.includes(match.match_id));

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
      })
      .catch(() => {
        setMessage("No se pudieron cargar los partidos de Forebet.");
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    refreshMatches();
  }, []);

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
            <p>{message ?? "Se muestran los partidos marcados con aviso en la pantalla Forebet."}</p>
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
                parameters={parameters[match.match_id] ?? DEFAULT_PARAMETERS}
              />
            ))}
          </div>
        ) : (
          <div className="detail-state">Selecciona partidos en Forebet con el boton Avisar inicio para que aparezcan aqui.</div>
        )}
      </section>
    </section>
  );
}

function LiveMatchCard({
  match,
  onChange,
  parameters,
}: {
  match: ForebetRangeItem;
  onChange: (matchId: number, field: keyof LiveMatchParameters, value: string) => void;
  parameters: LiveMatchParameters;
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

function readLiveParameters() {
  try {
    const raw = localStorage.getItem(LIVE_PARAMS_KEY);
    return raw ? (JSON.parse(raw) as Record<number, LiveMatchParameters>) : {};
  } catch {
    return {};
  }
}

function formatScore(match: ForebetRangeItem) {
  if (match.home_score == null || match.away_score == null) {
    return match.status;
  }
  return `${match.home_score}-${match.away_score}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function todayInputValue() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}
