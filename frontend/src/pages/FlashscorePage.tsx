import { BellRing, RefreshCw, Timer, TrendingDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchFlashscoreMatches,
  fetchSofaScoreLiveEvents,
  saveFlashscoreWatch,
  sendFlashscoreGoalEmail,
} from "../services/api";
import type { FlashscoreMatch } from "../types/api";
import {
  ALERT_ODDS_THRESHOLD,
  FAST_LIVE_REFRESH_MS,
  LIST_ODDS_THRESHOLD,
  clearFlashscoreWatch,
  liveRefreshIntervalMs,
  mergeFlashscoreWithSofaScore,
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
  const [message, setMessage] = useState("Captura las cuotas ≤ 1,60 y deja que SofaScore avise a tiempo.");
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
    setRefreshEveryMs(liveRefreshIntervalMs(matches));
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
      `Captura guardada (${saved.matches.length} partidos ≤ ${LIST_ODDS_THRESHOLD.toFixed(2).replace(".", ",")}). ` +
      "En ventana critica SofaScore refresca cada 1 min.",
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
      setMessage("Primero captura las cuotas ≤ 1,60. Luego SofaScore actualizara marcadores y minuto.");
      return;
    }
    setIsRefreshingLive(true);
    setMessage("Actualizando marcadores con SofaScore...");
    fetchSofaScoreLiveEvents()
      .then((result) => {
        const merged = sortFlashscoreMatches(mergeFlashscoreWithSofaScore(matchesRef.current, result.events));
        setMatches(merged);
        writeFlashscoreWatch({
          capturedAt: capturedAt ?? new Date().toISOString(),
          day,
          matches: merged,
        });
        syncServerWatch(merged, day, capturedAt);
        setLastLiveRefresh(new Date().toISOString());
        const linked = merged.filter((match) => match.minute != null || match.home_score != null).length;
        const earlyGoals = merged.filter((match) => match.early_goal).length;
        const intervalLabel = liveRefreshIntervalMs(merged) === FAST_LIVE_REFRESH_MS ? "1 min" : "5 min";
        setMessage(
          `${result.message || "SofaScore actualizado"} · ${linked}/${merged.length} enlazados · ${earlyGoals} con gol antes del 30' · proximo refresh ${intervalLabel}.`,
        );
        sendEligibleAlerts(merged);
      })
      .catch(() => setMessage("No se pudieron actualizar los resultados desde SofaScore."))
      .finally(() => setIsRefreshingLive(false));
  }, [capturedAt, day, sendEligibleAlerts, syncServerWatch]);

  const captureOdds = useCallback(() => {
    setIsCapturingOdds(true);
    setMessage("Capturando cuotas ≤ 1,60 desde Flashscore (RapidAPI)...");
    fetchFlashscoreMatches(day)
      .then((result) => {
        setConfigured(result.configured);
        setOddsStatus(result.status);
        if (result.status !== "ok") {
          setMessage(result.message);
          return;
        }
        const stamp = new Date().toISOString();
        const captured = sortFlashscoreMatches(result.matches.map(withEarlyGoalFlags));
        setCapturedAt(stamp);
        setMatches(captured);
        writeFlashscoreWatch({
          capturedAt: stamp,
          day,
          matches: captured,
        });
        syncServerWatch(captured, day, stamp);
        setMessage(
          `${result.message} Cuotas guardadas en el navegador y en servidor. ` +
          "En ventana critica SofaScore mira cada 1 min; el tick de fondo tambien usa SofaScore.",
        );
      })
      .catch(() => {
        setOddsStatus("request_failed");
        setMessage("No se pudieron capturar las cuotas Flashscore.");
      })
      .finally(() => setIsCapturingOdds(false));
  }, [day, syncServerWatch]);

  useEffect(() => {
    localStorage.setItem(LIVE_REFRESH_KEY, String(liveRefresh));
    if (!liveRefresh || matches.length === 0) {
      return;
    }
    let cancelled = false;
    let timer = 0;
    const tick = () => {
      const wait = liveRefreshIntervalMs(matchesRef.current);
      setRefreshEveryMs(wait);
      timer = window.setTimeout(() => {
        if (cancelled) return;
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
  const refreshLabel = liveRefresh && listed.length
    ? (refreshEveryMs === FAST_LIVE_REFRESH_MS ? "1 min" : "5 min")
    : "Manual";

  return (
    <section className="flashscore-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Cuotas Flashscore + senales SofaScore a tiempo</p>
          <h1>Flashscore</h1>
        </div>
      </header>

      <div className="metrics-grid" aria-label="Resumen Flashscore">
        <FlashscoreMetric icon={TrendingDown} label="Cuota ≤ 1,60" value={String(listed.length)} detail="Capturados en la jornada" />
        <FlashscoreMetric icon={Timer} label="Aviso ≤ 1,50" value={String(alertWatch)} detail="Candidatos a email" />
        <FlashscoreMetric icon={BellRing} label="Gol antes del 30'" value={String(earlyGoals)} detail={`${favoriteEarlyGoals} del equipo vigilado`} />
        <FlashscoreMetric
          icon={RefreshCw}
          label="Resultados"
          value={refreshLabel}
          detail={lastLiveRefresh ? `SofaScore ${formatTime(lastLiveRefresh)}` : "Sin actualizacion live"}
        />
      </div>

      <section className="panel flashscore-panel">
        <div className="panel-heading">
          <div>
            <h2>Jornada con cuota ≤ 1,60</h2>
            <p>
              Se senala en cuanto SofaScore detecta un gol antes del minuto 30.
              En ventana critica el refresh baja a 1 minuto para pillar el precio a tiempo.
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
              {liveRefresh ? `SofaScore auto (${refreshLabel})` : "SofaScore auto off"}
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
            La captura de cuotas usa RapidAPI FlashScore4 (`RAPIDAPI_KEY`). Las senales en vivo usan SofaScore/Crawlora
            (`CRAWLORA_API_KEY`) cada 1 min en ventana critica, sin gastar RapidAPI.
          </p>
        ) : null}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Hora</th>
                <th>Competicion</th>
                <th>Partido</th>
                <th>Minuto</th>
                <th>Marcador</th>
                <th>Gol &lt;30&apos;</th>
                <th>Cuota local</th>
                <th>Empate</th>
                <th>Cuota visitante</th>
                <th>Equipo vigilado</th>
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
                    <td>{match.competition}</td>
                    <td><strong>{match.home_team}</strong> vs <strong>{match.away_team}</strong></td>
                    <td>{match.minute != null ? `${match.minute}'` : formatStatus(match.status)}</td>
                    <td>{formatScore(match)}</td>
                    <td>
                      <span className={`flashscore-early-goal-status ${earlyGoalTone(match)}`}>
                        {earlyGoalLabel(match)}
                      </span>
                    </td>
                    <td className={isLowOdds(match.home_odds) ? "flashscore-low-odds" : undefined}>{formatOdds(match.home_odds)}</td>
                    <td>{formatOdds(match.draw_odds)}</td>
                    <td className={isLowOdds(match.away_odds) ? "flashscore-low-odds" : undefined}>{formatOdds(match.away_odds)}</td>
                    <td>
                      {match.favorite_team ? (
                        <>
                          <strong>{match.favorite_team}</strong>
                          <span className="table-subtext">Cuota {formatOdds(match.favorite_odds)}</span>
                        </>
                      ) : "—"}
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
            Pulsa &quot;Capturar cuotas ≤ 1,60&quot; para guardar la jornada. Luego SofaScore vigila goles &lt;30&apos; cada minuto.
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
  if (match.early_favorite_goal || match.alert_eligible) {
    const minute = match.early_goal_minute ?? match.minute;
    return minute != null ? `Favorito marco (${minute}')` : "Favorito marco <30'";
  }
  if (match.early_goal) {
    const minute = match.early_goal_minute ?? match.minute;
    return minute != null ? `Gol al ${minute}'` : "Gol antes del 30'";
  }
  if (match.minute != null && match.minute <= 30) {
    return "Ventana abierta";
  }
  if (match.minute != null && match.minute > 30) {
    return "Sin gol <30'";
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
  if (!match.favorite_team) return "Sin cuota ≤ 1,60";
  if (match.favorite_odds != null && match.favorite_odds > ALERT_ODDS_THRESHOLD) return "Listado (aviso ≤ 1,50)";
  if (match.minute == null) return "Esperando SofaScore";
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

function formatStatus(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("finish")) return "Finalizado";
  if (normalized.includes("half")) return "Descanso";
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
