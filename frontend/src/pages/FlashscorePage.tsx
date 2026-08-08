import { BellRing, RefreshCw, Timer, TrendingDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchFlashscoreMatches,
  refreshFlashscoreWatch,
  saveFlashscoreWatch,
  sendFlashscoreGoalEmail,
} from "../services/api";
import type { FlashscoreMatch } from "../types/api";
import {
  ALERT_ODDS_THRESHOLD,
  FAST_LIVE_REFRESH_MS,
  LIST_ODDS_THRESHOLD,
  SLOW_LIVE_REFRESH_MS,
  clearFlashscoreWatch,
  displayMatchMinute,
  hasMatchStarted,
  isHalfTime,
  isMatchFinished,
  isWatchableCompetition,
  liveRefreshIntervalMs,
  nextPollWaitMs,
  readFlashscoreWatch,
  sortFlashscoreMatches,
  withEarlyGoalFlags,
  writeFlashscoreWatch,
} from "../utils/flashscoreWatch";

const ALERTED_EVENTS_KEY = "within_flashscore_alerted_events";
const LIVE_REFRESH_KEY = "within_flashscore_live_refresh";

export function FlashscorePage() {
  const [matches, setMatches] = useState<FlashscoreMatch[]>([]);
  const [day, setDay] = useState(0);
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  const [isCapturingOdds, setIsCapturingOdds] = useState(false);
  const [isRefreshingLive, setIsRefreshingLive] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [oddsStatus, setOddsStatus] = useState("idle");
  const [message, setMessage] = useState("Captura solo favoritos ≤ 1,60. Flashscore Ultra actualiza cada 1 min hasta el 30'.");
  const [lastLiveRefresh, setLastLiveRefresh] = useState<string | null>(null);
  const [refreshEveryMs, setRefreshEveryMs] = useState(FAST_LIVE_REFRESH_MS);
  const [liveRefresh, setLiveRefresh] = useState(readLiveRefresh);
  const [alertedEventIds, setAlertedEventIds] = useState<string[]>(readAlertedEvents);
  const alertedRef = useRef(alertedEventIds);
  const pendingAlertsRef = useRef(new Set<string>());
  const matchesRef = useRef<FlashscoreMatch[]>([]);

  useEffect(() => {
    alertedRef.current = alertedEventIds;
    localStorage.setItem(ALERTED_EVENTS_KEY, JSON.stringify(alertedEventIds));
  }, [alertedEventIds]);

  useEffect(() => {
    matchesRef.current = matches;
    setRefreshEveryMs(liveRefreshIntervalMs(matches) ?? SLOW_LIVE_REFRESH_MS);
  }, [matches]);

  useEffect(() => {
    const saved = readFlashscoreWatch();
    if (!saved) {
      return;
    }
    setDay(saved.day);
    setCapturedAt(saved.capturedAt);
    setMatches(sortFlashscoreMatches(saved.matches.map(withEarlyGoalFlags)));
    setOddsStatus("ok");
    setConfigured(true);
    setMessage(
      `Captura guardada (${saved.matches.length} favoritos ≤ ${LIST_ODDS_THRESHOLD.toFixed(2).replace(".", ",")}). ` +
      "Flashscore Ultra: 1 min hasta el 30', luego 5 min.",
    );
  }, []);

  const syncServerWatch = useCallback((nextMatches: FlashscoreMatch[], nextDay: number, nextCapturedAt: string | null) => {
    saveFlashscoreWatch({
      day: nextDay,
      captured_at: nextCapturedAt,
      matches: nextMatches,
    }).catch(() => {
      setMessage((current) => `${current} · Aviso: no se pudo sincronizar la vigilancia en servidor.`);
    });
  }, []);

  const sendEligibleAlerts = useCallback((items: FlashscoreMatch[]) => {
    for (const match of items) {
      if (
        !match.alert_eligible ||
        !match.favorite_team ||
        match.favorite_odds == null ||
        match.minute == null ||
        match.home_score == null ||
        match.away_score == null ||
        alertedRef.current.includes(match.event_id) ||
        pendingAlertsRef.current.has(match.event_id)
      ) {
        continue;
      }
      pendingAlertsRef.current.add(match.event_id);
      sendFlashscoreGoalEmail({
        event_id: match.event_id,
        competition: match.competition,
        home_team: match.home_team,
        away_team: match.away_team,
        favorite_team: match.favorite_team,
        favorite_odds: match.favorite_odds,
        minute: match.minute,
        home_score: match.home_score,
        away_score: match.away_score,
      })
        .then((result) => {
          if (!result.sent) {
            setMessage(result.message);
            return;
          }
          setAlertedEventIds((current) => [...new Set([...current, match.event_id])]);
          setMessage(`Email enviado: ${match.favorite_team} marco antes del minuto 30 con cuota ${match.favorite_odds?.toFixed(2)}.`);
          notifyBrowser(match);
        })
        .catch(() => setMessage("Se detecto una alerta Flashscore, pero no se pudo enviar el email."))
        .finally(() => pendingAlertsRef.current.delete(match.event_id));
    }
  }, []);

  const refreshLive = useCallback(() => {
    if (matchesRef.current.length === 0) {
      setMessage("Primero captura solo favoritos ≤ 1,60. Luego Flashscore Ultra actualiza marcador y minuto.");
      return;
    }
    setIsRefreshingLive(true);
    setMessage("Actualizando marcadores con Flashscore Ultra...");
    const stamp = capturedAt ?? new Date().toISOString();
    refreshFlashscoreWatch({
      day,
      captured_at: stamp,
      matches: matchesRef.current,
    })
      .then((result) => {
        const merged = sortFlashscoreMatches(
          (result.matches || [])
            .map(withEarlyGoalFlags)
            .filter((match) => !isMatchFinished(match)),
        );
        setMatches(merged);
        writeFlashscoreWatch({
          capturedAt: stamp,
          day,
          matches: merged,
        });
        setLastLiveRefresh(new Date().toISOString());
        const linked = merged.filter((match) => match.minute != null || match.home_score != null).length;
        const earlyGoals = merged.filter((match) => match.early_goal).length;
        const nextWait = liveRefreshIntervalMs(merged);
        const finished = (result.matches || []).length - merged.length;
        const intervalLabel = nextWait == null
          ? "parado (sin activos)"
          : nextWait === FAST_LIVE_REFRESH_MS
            ? "1 min"
            : "5 min";
        setMessage(
          `${result.message || "Marcadores actualizados"} · ${linked}/${merged.length} con dato live · ` +
          `${finished} acabados · ${earlyGoals} gol <30' · proximo refresh ${intervalLabel}.`,
        );
        sendEligibleAlerts(merged);
      })
      .catch(() => setMessage("No se pudieron actualizar los resultados desde Flashscore Ultra."))
      .finally(() => setIsRefreshingLive(false));
  }, [capturedAt, day, sendEligibleAlerts]);

  const captureOdds = useCallback(() => {
    setIsCapturingOdds(true);
    setMessage("Capturando solo favoritos ≤ 1,60 desde Flashscore Ultra...");
    fetchFlashscoreMatches(day)
      .then((result) => {
        setConfigured(result.configured);
        setOddsStatus(result.status);
        if (result.status !== "ok") {
          setMessage(result.message);
          return;
        }
        const stamp = new Date().toISOString();
        const captured = sortFlashscoreMatches(
          result.matches
            .map(withEarlyGoalFlags)
            .filter((match) => match.favorite_odds != null && match.favorite_odds <= LIST_ODDS_THRESHOLD)
            .filter((match) => isWatchableCompetition(match))
            .filter((match) => !isMatchFinished(match)),
        );
        setCapturedAt(stamp);
        setMatches(captured);
        writeFlashscoreWatch({
          capturedAt: stamp,
          day,
          matches: captured,
        });
        syncServerWatch(captured, day, stamp);
        setMessage(
          `${result.message} Guardados ${captured.length} favoritos ≤ 1,60. Actualizando marcadores…`,
        );
        // Pull /matches/live (+ details) right after capture so scores are not stuck on —.
        if (captured.length > 0) {
          matchesRef.current = captured;
          refreshLive();
        }
      })
      .catch(() => {
        setOddsStatus("request_failed");
        setMessage("No se pudieron capturar las cuotas Flashscore.");
      })
      .finally(() => setIsCapturingOdds(false));
  }, [day, refreshLive, syncServerWatch]);

  useEffect(() => {
    localStorage.setItem(LIVE_REFRESH_KEY, String(liveRefresh));
    if (!liveRefresh || matches.length === 0) {
      return;
    }
    let cancelled = false;
    let timer = 0;
    const tick = () => {
      const activeWait = liveRefreshIntervalMs(matchesRef.current);
      const wait = nextPollWaitMs(matchesRef.current);
      setRefreshEveryMs(activeWait ?? wait);
      if (activeWait == null) {
        setMessage((current) => (
          current.includes("esperando kickoff")
            ? current
            : `${current} · Auto-refresh a la espera del siguiente kickoff.`
        ));
      }
      timer = window.setTimeout(() => {
        if (cancelled) return;
        // Always poll: even pre-kickoff we re-check so started matches are not missed.
        refreshLive();
        tick();
      }, wait);
    };
    refreshLive();
    tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [liveRefresh, matches.length, refreshLive]);

  const listed = matches.filter((match) => match.favorite_odds != null);
  const alertWatch = listed.filter((match) => match.favorite_odds != null && match.favorite_odds <= ALERT_ODDS_THRESHOLD).length;
  const earlyGoals = matches.filter((match) => match.early_goal).length;
  const favoriteEarlyGoals = matches.filter((match) => match.early_favorite_goal || match.alert_eligible).length;
  const activeLive = listed.some((match) => liveRefreshIntervalMs([match]) != null);
  const refreshLabel = liveRefresh && listed.length
    ? (!activeLive
      ? "Esperando"
      : refreshEveryMs === FAST_LIVE_REFRESH_MS
        ? "LIVE 1 min"
        : "LIVE 5 min")
    : "Manual";

  return (
    <section className="flashscore-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Flashscore Ultra · solo favoritos ≤ 1,60</p>
          <h1>Flashscore</h1>
        </div>
      </header>

      <div className="metrics-grid" aria-label="Resumen Flashscore">
        <FlashscoreMetric icon={TrendingDown} label="Cuota ≤ 1,60" value={String(listed.length)} detail="Unicos vigilados" />
        <FlashscoreMetric icon={Timer} label="Aviso ≤ 1,50" value={String(alertWatch)} detail="Candidatos a email" />
        <FlashscoreMetric icon={BellRing} label="Gol antes del 30'" value={String(earlyGoals)} detail={`${favoriteEarlyGoals} del equipo vigilado`} />
        <FlashscoreMetric
          icon={RefreshCw}
          label="Resultados"
          value={refreshLabel}
          detail={lastLiveRefresh ? `Ultra ${formatTime(lastLiveRefresh)}` : "Sin actualizacion live"}
        />
      </div>

      <section className="panel flashscore-panel">
        <div className="panel-heading">
          <div>
            <h2>Solo favoritos ≤ 1,60</h2>
            <p>
              No se cargan partidos sin favorito ≤ 1,60. Flashscore Ultra mira cada 1 min hasta el 30'
              y cada 5 min despues.
            </p>
          </div>
          <div className="flashscore-actions">
            <label>
              Jornada
              <select
                value={day}
                onChange={(event) => {
                  const nextDay = Number(event.target.value);
                  setDay(nextDay);
                  clearFlashscoreWatch();
                  setMatches([]);
                  setCapturedAt(null);
                  setOddsStatus("idle");
                  setMessage("Jornada cambiada. Vuelve a capturar las cuotas ≤ 1,60.");
                }}
              >
                <option value={-1}>Ayer</option>
                <option value={0}>Hoy</option>
                <option value={1}>Mañana</option>
              </select>
            </label>
            <button className="row-action active" type="button" onClick={captureOdds} disabled={isCapturingOdds}>
              <TrendingDown size={15} aria-hidden="true" />
              {isCapturingOdds ? "Capturando cuotas" : "Capturar cuotas ≤ 1,60"}
            </button>
            <button
              className={liveRefresh ? "row-action active" : "row-action"}
              type="button"
              onClick={() => {
                setLiveRefresh((current) => {
                  const next = !current;
                  if (next) {
                    requestBrowserNotifications();
                  }
                  return next;
                });
              }}
              disabled={listed.length === 0}
            >
              <RefreshCw size={15} aria-hidden="true" />
              {liveRefresh ? `Ultra auto (${refreshLabel})` : "Ultra auto off"}
            </button>
            <button className="row-action" type="button" onClick={refreshLive} disabled={isRefreshingLive || listed.length === 0}>
              <RefreshCw size={15} aria-hidden="true" />
              {isRefreshingLive ? "Actualizando" : "Actualizar resultados"}
            </button>
          </div>
        </div>

        <p className={configured && oddsStatus !== "request_failed" && oddsStatus !== "not_configured" ? "forebet-load-message" : "flashscore-setup-message"}>
          {message}
          {capturedAt ? <span className="table-subtext"> · Cuotas capturadas {formatTime(capturedAt)}</span> : null}
        </p>
        {!configured || oddsStatus === "request_failed" || oddsStatus === "not_configured" ? (
          <p className="flashscore-setup-detail">
            Cuotas y live usan RapidAPI FlashScore4 Ultra (`RAPIDAPI_KEY`). Solo se vigilan favoritos ≤ 1,60:
            1 min hasta el minuto 30, luego 5 min. El email de senal sigue en cuota ≤ 1,50.
          </p>
        ) : null}

        <div className="table-wrap">
          <table className="flashscore-table">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Partido</th>
                <th>1X2</th>
                <th>Minuto</th>
                <th>Marcador</th>
                <th>Gol &lt;30&apos;</th>
                <th>Alerta</th>
              </tr>
            </thead>
            <tbody>
              {listed.map((match) => {
                const alerted = alertedEventIds.includes(match.event_id);
                const rowClass = match.early_favorite_goal || match.alert_eligible
                  ? "flashscore-alert-row flashscore-early-favorite-row"
                  : match.early_goal
                    ? "flashscore-early-goal-row"
                    : undefined;
                return (
                  <tr className={rowClass} key={match.event_id}>
                    <td>{formatStartTime(match.start_time)}</td>
                    <td>
                      <div className="flashscore-match-cell">
                        <div className="flashscore-match-line">
                          <strong>{match.home_team}</strong>
                          <span className="flashscore-match-vs">vs</span>
                          <strong>{match.away_team}</strong>
                        </div>
                        <span className="table-subtext flashscore-match-competition">{match.competition}</span>
                      </div>
                    </td>
                    <td>
                      <div className="flashscore-odds-trio" aria-label="Cuotas 1X2">
                        <span className={isLowOdds(match.home_odds) ? "flashscore-low-odds" : undefined}>
                          <em>1</em>{formatOdds(match.home_odds)}
                        </span>
                        <span>
                          <em>X</em>{formatOdds(match.draw_odds)}
                        </span>
                        <span className={isLowOdds(match.away_odds) ? "flashscore-low-odds" : undefined}>
                          <em>2</em>{formatOdds(match.away_odds)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={hasMatchStarted(match) ? "flashscore-minute-live" : undefined}>
                        {displayMatchMinute(match)}
                      </span>
                    </td>
                    <td>
                      <span className={isHalfTime(match) || displayMatchMinute(match) === "Descanso"
                        ? "flashscore-score-ht"
                        : "flashscore-score"}
                      >
                        {formatScore(match)}
                      </span>
                    </td>
                    <td>
                      <span className={`flashscore-early-goal-status ${earlyGoalTone(match)}`}>
                        {earlyGoalLabel(match)}
                      </span>
                    </td>
                    <td><span className={`flashscore-alert-status ${alertTone(match, alerted)}`}>{alertLabel(match, alerted)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!isCapturingOdds && listed.length === 0 ? (
          <div className="detail-state">
            Pulsa &quot;Capturar cuotas ≤ 1,60&quot; para guardar solo esos favoritos. Flashscore Ultra vigila goles &lt;30&apos; cada minuto.
          </div>
        ) : null}
      </section>
    </section>
  );
}

function FlashscoreMetric({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-icon"><Icon size={19} aria-hidden="true" /></div>
      <div><p>{label}</p><strong>{value}</strong><span>{detail}</span></div>
    </article>
  );
}

function earlyGoalLabel(match: FlashscoreMatch) {
  const goalMinute = match.early_goal_minute;
  const totalGoals = (match.home_score ?? 0) + (match.away_score ?? 0);
  if (match.early_favorite_goal || match.alert_eligible) {
    const minute = goalMinute ?? match.minute;
    return minute != null ? `Favorito marco (${minute}')` : "Favorito marco <30'";
  }
  if (match.early_goal || (totalGoals > 0 && goalMinute != null)) {
    return goalMinute != null ? `Gol al ${goalMinute}'` : "Gol antes del 30'";
  }
  if (totalGoals > 0 && goalMinute == null) {
    return "Gol (minuto ?)";
  }
  if (match.minute != null && match.minute <= 30) {
    return "Ventana abierta";
  }
  if (match.minute != null && match.minute > 30) {
    return "Sin gol <30'";
  }
  if (isHalfTime(match)) {
    return "Descanso";
  }
  return "—";
}

function earlyGoalTone(match: FlashscoreMatch) {
  if (match.early_favorite_goal || match.alert_eligible) return "favorite";
  if (match.early_goal) return "any";
  if (match.minute != null && match.minute <= 30) return "open";
  return "idle";
}

function alertLabel(match: FlashscoreMatch, alerted: boolean) {
  if (alerted) return "Email enviado";
  if (match.early_favorite_goal || match.alert_eligible) return "Gol favorito <30'";
  if (match.early_goal) return "Gol rival/otro <30'";
  if (isMatchFinished(match)) return "Acabado";
  if (!hasMatchStarted(match)) return "Pendiente de inicio";
  if (!match.favorite_team) return "Sin cuota ≤ 1,60";
  if (match.favorite_odds != null && match.favorite_odds > ALERT_ODDS_THRESHOLD) return "Listado (aviso ≤ 1,50)";
  if (match.minute == null) return "En juego · sin minuto";
  if (match.minute <= 30) return "Esperando gol <30'";
  return "Ventana cerrada";
}

function alertTone(match: FlashscoreMatch, alerted: boolean) {
  if (alerted || match.early_favorite_goal || match.alert_eligible) return "triggered";
  if (match.early_goal) return "watching";
  if (
    match.favorite_team
    && match.favorite_odds != null
    && match.favorite_odds <= ALERT_ODDS_THRESHOLD
    && (match.minute == null || match.minute <= 30)
  ) {
    return "watching";
  }
  return "inactive";
}

function isLowOdds(value?: number | null) {
  return value != null && value <= LIST_ODDS_THRESHOLD;
}

function formatOdds(value?: number | null) {
  return value == null ? "—" : value.toFixed(2).replace(".", ",");
}

function formatScore(match: FlashscoreMatch) {
  return match.home_score == null || match.away_score == null ? "—" : `${match.home_score}-${match.away_score}`;
}

function formatMatchClock(match: FlashscoreMatch) {
  if (isHalfTime(match)) {
    return "Descanso";
  }
  if (hasMatchStarted(match)) {
    return "En juego";
  }
  return formatStatus(match.status);
}

function formatStatus(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("finish")) return "Finalizado";
  if (
    normalized.includes("halftime")
    || normalized === "ht"
    || (normalized.includes("half") && !normalized.includes("1st") && !normalized.includes("2nd"))
  ) {
    return "Descanso";
  }
  if (normalized.includes("progress") || normalized.includes("live")) return "En directo";
  return normalized.includes("sched") ? "Pendiente" : status;
}

function formatStartTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(date) : "—";
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function readAlertedEvents() {
  try {
    const value = JSON.parse(localStorage.getItem(ALERTED_EVENTS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function readLiveRefresh() {
  return localStorage.getItem(LIVE_REFRESH_KEY) !== "false";
}

function requestBrowserNotifications() {
  if (!("Notification" in window) || Notification.permission !== "default") {
    return;
  }
  void Notification.requestPermission();
}

function notifyBrowser(match: FlashscoreMatch) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  new Notification("Gol temprano con cuota baja", {
    body: `${match.favorite_team} (${match.favorite_odds?.toFixed(2)}) marco en el minuto ${match.minute}. ${formatScore(match)}.`,
  });
}
