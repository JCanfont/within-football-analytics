import { BellRing, RefreshCw, Timer, TrendingDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFlashscoreMatches, fetchSofaScoreLiveEvents, sendFlashscoreGoalEmail } from "../services/api";
import type { FlashscoreMatch } from "../types/api";
import {
  ALERT_ODDS_THRESHOLD,
  LIST_ODDS_THRESHOLD,
  clearFlashscoreWatch,
  mergeFlashscoreWithSofaScore,
  readFlashscoreWatch,
  writeFlashscoreWatch,
} from "../utils/flashscoreWatch";

const LIVE_REFRESH_MS = 5 * 60 * 1000;
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
  const [message, setMessage] = useState("Captura las cuotas ≤ 1,60 y deja que SofaScore actualice los resultados.");
  const [lastLiveRefresh, setLastLiveRefresh] = useState<string | null>(null);
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
  }, [matches]);

  useEffect(() => {
    const saved = readFlashscoreWatch();
    if (!saved) {
      return;
    }
    setDay(saved.day);
    setCapturedAt(saved.capturedAt);
    setMatches(saved.matches);
    setOddsStatus("ok");
    setConfigured(true);
    setMessage(
      `Captura guardada (${saved.matches.length} partidos ≤ ${LIST_ODDS_THRESHOLD.toFixed(2).replace(".", ",")}). ` +
      "Los marcadores se actualizan con SofaScore.",
    );
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
        const merged = mergeFlashscoreWithSofaScore(matchesRef.current, result.events);
        setMatches(merged);
        writeFlashscoreWatch({
          capturedAt: capturedAt ?? new Date().toISOString(),
          day,
          matches: merged,
        });
        setLastLiveRefresh(new Date().toISOString());
        const linked = merged.filter((match) => match.minute != null || match.home_score != null).length;
        setMessage(
          `${result.message || "SofaScore actualizado"} · ${linked}/${merged.length} partidos enlazados con directo.`,
        );
        sendEligibleAlerts(merged);
      })
      .catch(() => setMessage("No se pudieron actualizar los resultados desde SofaScore."))
      .finally(() => setIsRefreshingLive(false));
  }, [capturedAt, day, sendEligibleAlerts]);

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
        setCapturedAt(stamp);
        setMatches(result.matches);
        writeFlashscoreWatch({
          capturedAt: stamp,
          day,
          matches: result.matches,
        });
        setMessage(
          `${result.message} Cuotas guardadas. A partir de ahora los resultados vienen de SofaScore.`,
        );
      })
      .catch(() => {
        setOddsStatus("request_failed");
        setMessage("No se pudieron capturar las cuotas Flashscore.");
      })
      .finally(() => setIsCapturingOdds(false));
  }, [day]);

  useEffect(() => {
    localStorage.setItem(LIVE_REFRESH_KEY, String(liveRefresh));
    if (!liveRefresh || matches.length === 0) {
      return;
    }
    const interval = window.setInterval(refreshLive, LIVE_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [liveRefresh, matches.length, refreshLive]);

  const listed = matches.filter((match) => match.favorite_odds != null);
  const alertWatch = listed.filter((match) => match.favorite_odds != null && match.favorite_odds <= ALERT_ODDS_THRESHOLD).length;
  const activeAlerts = matches.filter((match) => match.alert_eligible).length;
  const liveLinked = matches.filter((match) => match.minute != null || (match.home_score != null && match.status.toLowerCase().includes("live")) || match.status.toLowerCase().includes("progress")).length;

  return (
    <section className="flashscore-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Cuotas Flashscore + resultados SofaScore</p>
          <h1>Flashscore</h1>
        </div>
      </header>

      <div className="metrics-grid" aria-label="Resumen Flashscore">
        <FlashscoreMetric icon={TrendingDown} label="Cuota ≤ 1,60" value={String(listed.length)} detail="Capturados en la jornada" />
        <FlashscoreMetric icon={Timer} label="Aviso ≤ 1,50" value={String(alertWatch)} detail="Candidatos a email" />
        <FlashscoreMetric icon={BellRing} label="En directo" value={String(liveLinked)} detail="Enlazados con SofaScore" />
        <FlashscoreMetric
          icon={RefreshCw}
          label="Resultados"
          value={liveRefresh && listed.length ? "5 min" : "Manual"}
          detail={lastLiveRefresh ? `SofaScore ${formatTime(lastLiveRefresh)}` : "Sin actualizacion live"}
        />
      </div>

      <section className="panel flashscore-panel">
        <div className="panel-heading">
          <div>
            <h2>Jornada con cuota ≤ 1,60</h2>
            <p>
              1) Captura las cuotas con Flashscore. 2) SofaScore actualiza marcador y minuto.
              El email de gol temprano usa cuota ≤ {ALERT_ODDS_THRESHOLD.toFixed(2).replace(".", ",")} y minuto ≤ 30.
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
              onClick={() => setLiveRefresh((current) => !current)}
              disabled={listed.length === 0}
            >
              <RefreshCw size={15} aria-hidden="true" />
              {liveRefresh ? "SofaScore cada 5 min" : "SofaScore auto off"}
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
            La captura de cuotas usa RapidAPI FlashScore4 (`RAPIDAPI_KEY`). Los resultados en vivo no dependen de RapidAPI:
            salen de SofaScore.
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
                return (
                  <tr className={match.alert_eligible ? "flashscore-alert-row" : undefined} key={match.event_id}>
                    <td>{formatStartTime(match.start_time)}</td>
                    <td>{match.competition}</td>
                    <td><strong>{match.home_team}</strong> vs <strong>{match.away_team}</strong></td>
                    <td>{match.minute != null ? `${match.minute}'` : formatStatus(match.status)}</td>
                    <td>{formatScore(match)}</td>
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
            Pulsa &quot;Capturar cuotas ≤ 1,60&quot; para guardar la jornada. Luego actualiza resultados con SofaScore.
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

function alertLabel(match: FlashscoreMatch, alerted: boolean) {
  if (alerted) return "Email enviado";
  if (match.alert_eligible) return "Gol detectado";
  if (!match.favorite_team) return "Sin cuota ≤ 1,60";
  if (match.favorite_odds != null && match.favorite_odds > ALERT_ODDS_THRESHOLD) return "Listado (aviso ≤ 1,50)";
  if (match.minute == null) return "Esperando SofaScore";
  if (match.minute <= 30) return "Esperando gol";
  return "Ventana cerrada";
}

function alertTone(match: FlashscoreMatch, alerted: boolean) {
  if (alerted || match.alert_eligible) return "triggered";
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

function notifyBrowser(match: FlashscoreMatch) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  new Notification("Gol temprano con cuota baja", {
    body: `${match.favorite_team} (${match.favorite_odds?.toFixed(2)}) marco en el minuto ${match.minute}. ${formatScore(match)}.`,
  });
}
