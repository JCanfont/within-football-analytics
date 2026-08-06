import { Activity, CalendarRange, Goal, RefreshCw, Target, Trash2, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { MetricCard } from "../components/MetricCard";
import { loadForebetDate } from "../services/api";
import type { ForebetRangeItem } from "../types/api";
import { clearForebetHistory, readForebetHistory, saveForebetHistory } from "../utils/forebetHistory";
import { calculateForebetAccuracy, type ForebetAccuracyBreakdown } from "../utils/forebetStats";

const MAX_DAYS_PER_ANALYSIS = 62;
const REQUEST_BATCH_SIZE = 3;

export function ForebetStatsPage() {
  const [history, setHistory] = useState<ForebetRangeItem[]>(readForebetHistory);
  const [fromDate, setFromDate] = useState(() => offsetDate(-7));
  const [toDate, setToDate] = useState(() => offsetDate(-1));
  const [competition, setCompetition] = useState("all");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const competitions = useMemo(
    () => Array.from(new Set(history.map((item) => item.competition).filter(Boolean))).sort(),
    [history],
  );
  const scopedHistory = useMemo(
    () => history.filter((item) => {
      const date = item.match_date.slice(0, 10);
      return date >= fromDate && date <= toDate && (competition === "all" || item.competition === competition);
    }),
    [competition, fromDate, history, toDate],
  );
  const stats = useMemo(() => calculateForebetAccuracy(scopedHistory), [scopedHistory]);

  async function analyzePeriod() {
    const dates = dateRange(fromDate, toDate);
    if (!dates.length) {
      setMessage("Selecciona un periodo valido.");
      return;
    }
    if (dates.length > MAX_DAYS_PER_ANALYSIS) {
      setMessage(`El periodo puede tener como maximo ${MAX_DAYS_PER_ANALYSIS} dias por analisis.`);
      return;
    }

    setIsLoading(true);
    setMessage(`Analizando 0 de ${dates.length} jornadas...`);
    const loaded: ForebetRangeItem[] = [];
    let failed = 0;
    for (let index = 0; index < dates.length; index += REQUEST_BATCH_SIZE) {
      const batch = dates.slice(index, index + REQUEST_BATCH_SIZE);
      const results = await Promise.allSettled(batch.map((date) => loadForebetDate(date, false)));
      results.forEach((result) => {
        if (result.status === "fulfilled") {
          loaded.push(...result.value.matches);
        } else {
          failed += 1;
        }
      });
      setMessage(`Analizando ${Math.min(index + batch.length, dates.length)} de ${dates.length} jornadas...`);
    }
    const nextHistory = saveForebetHistory(loaded);
    setHistory(nextHistory);
    setIsLoading(false);
    const finished = loaded.filter((item) => item.home_score != null && item.away_score != null).length;
    setMessage(
      `${dates.length - failed} jornadas revisadas · ${finished} resultados finales añadidos${failed ? ` · ${failed} jornadas no disponibles` : ""}.`,
    );
  }

  function clearHistory() {
    clearForebetHistory();
    setHistory([]);
    setCompetition("all");
    setMessage("Historial local de Forebet eliminado.");
  }

  return (
    <section className="forebet-stats-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Rendimiento historico</p>
          <h1>Estadisticas Forebet</h1>
        </div>
      </header>

      <section className="panel forebet-stats-controls">
        <div className="panel-heading">
          <div>
            <h2>Periodo de analisis</h2>
            <p>Carga jornadas de Forebet y conserva sus resultados en este navegador para construir el historico.</p>
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
              Campeonato / competicion
              <select value={competition} onChange={(event) => setCompetition(event.target.value)}>
                <option value="all">Todas</option>
                {competitions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <button className="row-action active" type="button" onClick={analyzePeriod} disabled={isLoading}>
              <RefreshCw size={15} aria-hidden="true" />
              {isLoading ? "Analizando..." : "Analizar periodo"}
            </button>
            <button className="row-action" type="button" onClick={clearHistory} disabled={isLoading || history.length === 0}>
              <Trash2 size={15} aria-hidden="true" />
              Vaciar historial
            </button>
          </div>
        </div>
        {message ? <p className="forebet-load-message">{message}</p> : null}
        <p className="forebet-stats-note">
          Los porcentajes solo usan partidos con RF disponible. La muestra indica cuantos resultados sostienen cada estadistica.
        </p>
      </section>

      <div className="metrics-grid" aria-label="Resumen de acierto Forebet">
        <MetricCard icon={Activity} label="Muestra con RF" value={String(stats.sampleSize)} detail="Partidos finalizados del periodo" />
        <MetricCard
          icon={Target}
          label="Acierto Over/Under"
          value={formatPercentage(stats.overUnderAccuracy)}
          detail={`${stats.overUnderHits} de ${stats.overUnderEvaluated} pronosticos`}
        />
        <MetricCard
          icon={Trophy}
          label="Resultados exactos"
          value={formatPercentage(stats.exactAccuracy)}
          detail={`${stats.exactHits} de ${stats.exactEvaluated} marcadores`}
        />
        <MetricCard
          icon={Goal}
          label="Goles por partido"
          value={stats.sampleSize ? stats.averageActualGoals.toFixed(1) : "—"}
          detail="Media del resultado final"
        />
      </div>

      {stats.sampleSize === 0 ? (
        <section className="panel forebet-stats-empty">
          <CalendarRange size={28} aria-hidden="true" />
          <h2>Sin resultados en el periodo</h2>
          <p>Pulsa Analizar periodo para cargar jornadas históricas. Puedes acumular varios periodos en este navegador.</p>
        </section>
      ) : (
        <div className="forebet-stats-grid">
          <BreakdownTable title="Acierto por Over o Under" description="Compara cada señal con el total de goles del RF." rows={stats.byMarket} />
          <BreakdownTable title="Por campeonato y competición" description="Permite detectar dónde Forebet tiene mejor rendimiento." rows={stats.byCompetition} />
          <BreakdownTable title="Resultados exactos pronosticados" description="Porcentaje de veces que cada marcador previsto coincide exactamente con RF." rows={stats.byPredictedScore} />
          <BreakdownTable title="Por número de goles en RF" description="Distribución y acierto según los goles reales del partido." rows={stats.byActualGoals} />
          <BreakdownTable title="Por momento del año" description="Acierto mensual para localizar periodos más y menos fiables." rows={stats.byMonth} />
          <BreakdownTable title="Por día de la semana" description="Compara el rendimiento de Forebet de lunes a domingo." rows={stats.byWeekday} />
        </div>
      )}
    </section>
  );
}

function BreakdownTable({ description, rows, title }: { description: string; rows: ForebetAccuracyBreakdown[]; title: string }) {
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
              <th>Acierto O/U</th>
              <th>Aciertos O/U</th>
              <th>Acierto exacto</th>
              <th>Exactos</th>
              <th>Goles RF</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td><strong>{row.label}</strong></td>
                <td>{row.sampleSize}</td>
                <td>{formatPercentage(row.overUnderAccuracy)}</td>
                <td>{row.overUnderHits}/{row.overUnderEvaluated}</td>
                <td>{formatPercentage(row.exactAccuracy)}</td>
                <td>{row.exactHits}/{row.exactEvaluated}</td>
                <td>{row.averageActualGoals.toFixed(1)}</td>
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
  return localDateValue(date);
}

function localDateValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function dateRange(from: string, to: string) {
  if (!from || !to || from > to) {
    return [];
  }
  const dates: string[] = [];
  const current = new Date(`${from}T12:00:00`);
  const last = new Date(`${to}T12:00:00`);
  while (current <= last) {
    dates.push(localDateValue(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}
