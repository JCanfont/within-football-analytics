import { BellRing, RefreshCw, Timer, TrendingDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFlashscoreMatches, sendFlashscoreGoalEmail } from "../services/api";
import type { FlashscoreMatch } from "../types/api";

const REFRESH_MS = 15 * 60 * 1000;
const ALERTED_EVENTS_KEY = "within_flashscore_alerted_events";
const AUTO_REFRESH_KEY = "within_flashscore_auto_refresh";

export function FlashscorePage() {
  const [matches, setMatches] = useState<FlashscoreMatch[]>([]);
  const [day, setDay] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("Preparando datos Flashscore...");
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(readAutoRefresh);
  const [alertedEventIds, setAlertedEventIds] = useState<string[]>(readAlertedEvents);
  const alertedRef = useRef(alertedEventIds);
  const pendingAlertsRef = useRef(new Set<string>());

  useEffect(() => {
    alertedRef.current = alertedEventIds;
    localStorage.setItem(ALERTED_EVENTS_KEY, JSON.stringify(alertedEventIds));
  }, [alertedEventIds]);

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

  const refresh = useCallback(() => {
    setIsLoading(true);
    setMessage("Actualizando marcadores y cuotas Flashscore...");
    fetchFlashscoreMatches(day)
      .then((result) => {
        setMatches(result.matches);
        setConfigured(result.configured);
        setStatus(result.status);
        setMessage(result.message);
        setLastRefresh(new Date().toISOString());
        if (result.status === "ok") {
          sendEligibleAlerts(result.matches);
        }
      })
      .catch(() => {
        setStatus("request_failed");
        setMessage("No se pudieron consultar los datos de Flashscore.");
      })
      .finally(() => setIsLoading(false));
  }, [day, sendEligibleAlerts]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    localStorage.setItem(AUTO_REFRESH_KEY, String(autoRefresh));
    if (!autoRefresh || day !== 0) {
      return;
    }
    const interval = window.setInterval(refresh, REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [autoRefresh, day, refresh]);

  const listed = matches.filter((match) => match.favorite_odds != null);
  const alertWatch = listed.filter((match) => match.favorite_odds != null && match.favorite_odds <= 1.5).length;
  const activeAlerts = matches.filter((match) => match.alert_eligible).length;

  return (
    <section className="flashscore-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Cuotas bajas de la jornada</p>
          <h1>Flashscore</h1>
        </div>
      </header>

      <div className="metrics-grid" aria-label="Resumen Flashscore">
        <FlashscoreMetric icon={TrendingDown} label="Cuota ≤ 1,60" value={String(listed.length)} detail="Partidos de la jornada" />
        <FlashscoreMetric icon={Timer} label="Aviso ≤ 1,50" value={String(alertWatch)} detail="Candidatos a email" />
        <FlashscoreMetric icon={BellRing} label="Alertas detectadas" value={String(activeAlerts)} detail="Gol antes del minuto 30" />
        <FlashscoreMetric
          icon={RefreshCw}
          label="Actualizacion"
          value={autoRefresh && day === 0 ? "15 min" : "Manual"}
          detail={lastRefresh ? `Ultima ${formatTime(lastRefresh)}` : "Sin capturas"}
        />
      </div>

      <section className="panel flashscore-panel">
        <div className="panel-heading">
          <div>
            <h2>Jornada con cuota ≤ 1,60</h2>
            <p>Solo partidos con local o visitante a 1,60 o menos. El email de gol temprano se limita a cuota ≤ 1,50. Para no gastar RapidAPI, la captura es cada 15 minutos.</p>
          </div>
          <div className="flashscore-actions">
            <label>
              Jornada
              <select value={day} onChange={(event) => setDay(Number(event.target.value))}>
                <option value={-1}>Ayer</option>
                <option value={0}>Hoy</option>
                <option value={1}>Mañana</option>
              </select>
            </label>
            <button
              className={autoRefresh ? "row-action active" : "row-action"}
              type="button"
              onClick={() => setAutoRefresh((current) => !current)}
            >
              <RefreshCw size={15} aria-hidden="true" />
              {autoRefresh ? "Cada 15 min" : "Auto desactivado"}
            </button>
            <button className="row-action" type="button" onClick={refresh} disabled={isLoading}>
              <RefreshCw size={15} aria-hidden="true" />
              {isLoading ? "Actualizando" : "Actualizar ahora"}
            </button>
          </div>
        </div>

        <p className={configured && status === "ok" ? "forebet-load-message" : "flashscore-setup-message"}>{message}</p>
        {!configured || status === "request_failed" || status === "not_configured" ? (
          <p className="flashscore-setup-detail">
            Las cuotas vienen de RapidAPI (FlashScore4). Si el listado sale vacio, la suscripcion o la clave
            <code> RAPIDAPI_KEY</code> en Vercel estan fallando. Activa FlashScore4 en rapidapi.com y pulsa Actualizar ahora.
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
        {configured && status === "ok" && !isLoading && listed.length === 0 ? (
          <div className="detail-state">No hay partidos con cuota ≤ 1,60 en esta jornada.</div>
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
  if (match.favorite_odds != null && match.favorite_odds > 1.5) return "Listado (aviso ≤ 1,50)";
  if (match.minute == null) return "Vigilando";
  if (match.minute <= 30) return "Esperando gol";
  return "Ventana cerrada";
}

function alertTone(match: FlashscoreMatch, alerted: boolean) {
  if (alerted || match.alert_eligible) return "triggered";
  if (
    match.favorite_team
    && match.favorite_odds != null
    && match.favorite_odds <= 1.5
    && (match.minute == null || match.minute <= 30)
  ) {
    return "watching";
  }
  return "inactive";
}

function isLowOdds(value?: number | null) {
  return value != null && value <= 1.6;
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

function readAutoRefresh() {
  // Default off to protect RapidAPI request limits; user can enable manually.
  return localStorage.getItem(AUTO_REFRESH_KEY) === "true";
}

function notifyBrowser(match: FlashscoreMatch) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  new Notification("Gol temprano con cuota baja", {
    body: `${match.favorite_team} (${match.favorite_odds?.toFixed(2)}) marco en el minuto ${match.minute}. ${formatScore(match)}.`,
  });
}
