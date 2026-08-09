import { Activity, BellRing, CalendarRange, Goal, Trash2, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { MetricCard } from "../components/MetricCard";
import {
  clearFlashscoreHistory,
  readFlashscoreHistory,
  type FlashscoreHistoryEntry,
} from "../utils/flashscoreHistory";
import { calculateFlashscoreStats, type FlashscoreStatsBreakdown } from "../utils/flashscoreStats";

export function FlashscoreStatsPage() {
  const [history, setHistory] = useState<FlashscoreHistoryEntry[]>(readFlashscoreHistory);
  const [fromDate, setFromDate] = useState(() => offsetDate(-7));
  const [toDate, setToDate] = useState(() => offsetDate(0));
  const [competition, setCompetition] = useState("all");
  const [message, setMessage] = useState<string | null>(
    "Los partidos acabados de Flashscore pasan aqui al cambiar el dia (Europe/Madrid).",
  );

  const competitions = useMemo(
    () => Array.from(new Set(history.map((entry) => entry.competition).filter(Boolean))).sort(),
    [history],
  );
  const scoped = useMemo(
    () => history.filter((entry) => (
      entry.watch_day >= fromDate
      && entry.watch_day <= toDate
      && (competition === "all" || entry.competition === competition)
    )),
    [competition, fromDate, history, toDate],
  );
  const stats = useMemo(() => calculateFlashscoreStats(scoped), [scoped]);

  function clearHistory() {
    clearFlashscoreHistory();
    setHistory([]);
    setCompetition("all");
    setMessage("Historial local de Flashscore eliminado.");
  }

  function reload() {
    setHistory(readFlashscoreHistory());
    setMessage("Historial Flashscore recargado desde este navegador.");
  }

  return (
    <section className="flashscore-stats-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Historico diario</p>
          <h1>Estadisticas Flashscore</h1>
        </div>
      </header>

      <section className="panel forebet-stats-controls">
        <div className="panel-heading">
          <div>
            <h2>Periodo archivado</h2>
            <p>
              Al final del dia, los favoritos ≤ 1,60 concluidos salen de la lista live
              y quedan aqui con marcador y senal &lt;30&apos;.
            </p>
          </div>
          <div className="forebet-actions">
            <label className="forebet-date-form">
              Desde
              <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            </label>
            <label className="forebet-date-form">
              Hasta
              <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
            </label>
            <label className="forebet-date-form">
              Competicion
              <select value={competition} onChange={(event) => setCompetition(event.target.value)}>
                <option value="all">Todas</option>
                {competitions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <button className="row-action" type="button" onClick={reload}>
              Recargar
            </button>
            <button className="row-action" type="button" onClick={clearHistory} disabled={history.length === 0}>
              <Trash2 size={15} aria-hidden="true" />
              Vaciar historial
            </button>
          </div>
        </div>
        {message ? <p className="forebet-load-message">{message}</p> : null}
      </section>

      <div className="metrics-grid" aria-label="Resumen Flashscore archivado">
        <MetricCard icon={Activity} label="Partidos archivados" value={String(stats.sampleSize)} detail="Con marcador final" />
        <MetricCard
          icon={Goal}
          label="Gol &lt;30'"
          value={formatPercentage(stats.earlyGoalRate)}
          detail={`${stats.earlyGoals} de ${stats.sampleSize}`}
        />
        <MetricCard
          icon={BellRing}
          label="Favorito &lt;30'"
          value={formatPercentage(stats.favoriteEarlyGoalRate)}
          detail={`${stats.favoriteEarlyGoals} senales · ${stats.alertEligible} elegibles email`}
        />
        <MetricCard
          icon={Trophy}
          label="Cuota media favorito"
          value={stats.averageFavoriteOdds == null ? "—" : stats.averageFavoriteOdds.toFixed(2).replace(".", ",")}
          detail="Solo vigilados ≤ 1,60"
        />
      </div>

      {stats.sampleSize === 0 ? (
        <section className="panel forebet-stats-empty">
          <CalendarRange size={28} aria-hidden="true" />
          <h2>Sin partidos archivados</h2>
          <p>
            Vigila favoritos en Flashscore durante el dia. Al cambiar la fecha en Europe/Madrid,
            los concluidos se mueven automaticamente a este historico.
          </p>
        </section>
      ) : (
        <>
          <div className="forebet-stats-grid">
            <BreakdownTable title="Por dia" description="Volumen y goles tempranos archivados cada jornada." rows={stats.byDay} />
            <BreakdownTable title="Por competicion" description="Donde aparecen mas senales &lt;30&apos;." rows={stats.byCompetition} />
          </div>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Partidos archivados</h2>
                <p>{scoped.length} resultados en el periodo seleccionado.</p>
              </div>
            </div>
            <div className="table-wrap">
              <table className="flashscore-table">
                <thead>
                  <tr>
                    <th>Dia</th>
                    <th>Partido</th>
                    <th>1X2</th>
                    <th>RF</th>
                    <th>Gol &lt;30&apos;</th>
                  </tr>
                </thead>
                <tbody>
                  {scoped.map((entry) => (
                    <tr key={entry.event_id} className="flashscore-finished-row">
                      <td>{entry.watch_day}</td>
                      <td>
                        <strong>{entry.home_team} - {entry.away_team}</strong>
                        <span className="table-subtext flashscore-match-competition">{entry.competition}</span>
                      </td>
                      <td>{entry.favorite_odds?.toFixed(2).replace(".", ",") ?? "—"}</td>
                      <td>{entry.home_score}-{entry.away_score}</td>
                      <td>
                        {entry.early_favorite_goal || entry.alert_eligible
                          ? `Favorito${entry.early_goal_minute != null ? ` (${entry.early_goal_minute}')` : ""}`
                          : entry.early_goal
                            ? `Gol${entry.early_goal_minute != null ? ` (${entry.early_goal_minute}')` : ""}`
                            : "No"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </section>
  );
}

function BreakdownTable({
  description,
  rows,
  title,
}: {
  description: string;
  rows: FlashscoreStatsBreakdown[];
  title: string;
}) {
  return (
    <section className="panel forebet-stats-breakdown">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Campo</th>
              <th>Muestra</th>
              <th>Gol &lt;30&apos;</th>
              <th>Favorito &lt;30&apos;</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td><strong>{row.label}</strong></td>
                <td>{row.sampleSize}</td>
                <td>{formatPercentage(row.earlyGoalRate)} ({row.earlyGoals})</td>
                <td>{formatPercentage(row.favoriteEarlyGoalRate)} ({row.favoriteEarlyGoals})</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatPercentage(value: number | null) {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

function offsetDate(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
