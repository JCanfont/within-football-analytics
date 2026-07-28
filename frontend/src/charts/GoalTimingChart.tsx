import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMemo, useState } from "react";
import type { GoalTiming, GoalTimingContext, GoalTimingSeriesRow } from "../types/api";

type GoalTimingChartProps = {
  homeTeam: string;
  awayTeam: string;
  homeRows: GoalTiming[];
  awayRows: GoalTiming[];
  context?: GoalTimingContext | null;
};

export function GoalTimingChart({ homeTeam, awayTeam, homeRows, awayRows, context }: GoalTimingChartProps) {
  const [isHoveringChart, setIsHoveringChart] = useState(false);
  const canHoverDirect = Boolean(context && context.mode !== "previous_season_fixed" && (context.home_direct_rows.length > 0 || context.away_direct_rows.length > 0));
  const activeMode = canHoverDirect && isHoveringChart ? "direct" : "season";
  const data = useMemo(() => {
    if (context) {
      return mergeSeriesRows(
        activeMode === "direct" ? context.home_direct_rows : context.home_season_rows,
        activeMode === "direct" ? context.away_direct_rows : context.away_season_rows,
        homeTeam,
        awayTeam,
      );
    }
    return mergeTimingRows(homeRows, awayRows, homeTeam, awayTeam);
  }, [activeMode, awayRows, awayTeam, context, homeRows, homeTeam]);
  const summary = buildTimingSummary(data, homeTeam, awayTeam);
  const chartLabel = context
    ? activeMode === "direct"
      ? context.direct_label
      : `${context.season_label} · ${context.season_reason}`
    : "Distribucion temporal importada";

  if (data.length === 0) {
    return <div className="detail-state">Sin distribucion temporal importada para estos equipos.</div>;
  }

  return (
    <>
      <div className="timing-mode-banner">
        <strong>{activeMode === "direct" ? "Vista al pasar el cursor: enfrentamientos directos" : "Vista principal: temporada"}</strong>
        <span>{chartLabel}</span>
        {context?.archived_label && context.mode === "current_season" ? <small>Temporada anterior guardada: {context.archived_label}</small> : null}
      </div>
      <div className="timing-summary">
        <div>
          <span>Primera parte</span>
          <strong>
            {homeTeam} {summary.firstHalf[homeTeam]} - {summary.firstHalf[awayTeam]} {awayTeam}
          </strong>
        </div>
        <div>
          <span>Segunda parte</span>
          <strong>
            {homeTeam} {summary.secondHalf[homeTeam]} - {summary.secondHalf[awayTeam]} {awayTeam}
          </strong>
        </div>
        <div>
          <span>Tramo fuerte local</span>
          <strong>{summary.strongest[homeTeam]}</strong>
        </div>
        <div>
          <span>Tramo fuerte visitante</span>
          <strong>{summary.strongest[awayTeam]}</strong>
        </div>
      </div>
      <div className="goal-chart" onMouseEnter={() => setIsHoveringChart(true)} onMouseLeave={() => setIsHoveringChart(false)}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d8dee8" />
            <XAxis dataKey="interval" tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: "rgba(18, 32, 56, 0.06)" }} />
            <Legend />
            <Bar dataKey={homeTeam} fill="#2f6f73" radius={[5, 5, 0, 0]} />
            <Bar dataKey={awayTeam} fill="#5b6f95" radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

function mergeSeriesRows(homeRows: GoalTimingSeriesRow[], awayRows: GoalTimingSeriesRow[], homeTeam: string, awayTeam: string) {
  const rows = new Map<string, Record<string, string | number>>();

  for (const row of homeRows) {
    const key = formatSeriesInterval(row);
    rows.set(key, { interval: key, [homeTeam]: row.goals_scored, [awayTeam]: 0 });
  }

  for (const row of awayRows) {
    const key = formatSeriesInterval(row);
    const current = rows.get(key) ?? { interval: key, [homeTeam]: 0, [awayTeam]: 0 };
    rows.set(key, { ...current, [awayTeam]: row.goals_scored });
  }

  return Array.from(rows.values()).sort((first, second) => intervalOrder(String(first.interval)) - intervalOrder(String(second.interval)));
}

function formatSeriesInterval(row: GoalTimingSeriesRow) {
  if (row.interval_start === 30 && row.interval_end === 45) {
    return "30-descanso";
  }
  if (row.interval_start === 75 && row.interval_end === 90) {
    return "75-final";
  }
  return `${row.interval_start}-${row.interval_end}`;
}

function mergeTimingRows(homeRows: GoalTiming[], awayRows: GoalTiming[], homeTeam: string, awayTeam: string) {
  const rows = new Map<string, Record<string, string | number>>();

  for (const row of homeRows) {
    const key = formatInterval(row);
    rows.set(key, { interval: key, [homeTeam]: row.goals_scored, [awayTeam]: 0 });
  }

  for (const row of awayRows) {
    const key = formatInterval(row);
    const current = rows.get(key) ?? { interval: key, [homeTeam]: 0, [awayTeam]: 0 };
    rows.set(key, { ...current, [awayTeam]: row.goals_scored });
  }

  return Array.from(rows.values()).sort((first, second) => intervalOrder(String(first.interval)) - intervalOrder(String(second.interval)));
}

function formatInterval(row: GoalTiming) {
  if (row.interval_start == null || row.interval_end == null) {
    return "Anadido";
  }
  if (row.interval_start === 30 && row.interval_end === 45) {
    return "30-descanso";
  }
  if (row.interval_start === 75 && row.interval_end === 90) {
    return "75-final";
  }
  return `${row.interval_start}-${row.interval_end}`;
}

function buildTimingSummary(data: Record<string, string | number>[], homeTeam: string, awayTeam: string) {
  const firstHalf = { [homeTeam]: 0, [awayTeam]: 0 };
  const secondHalf = { [homeTeam]: 0, [awayTeam]: 0 };
  const strongest = {
    [homeTeam]: strongestInterval(data, homeTeam),
    [awayTeam]: strongestInterval(data, awayTeam),
  };

  for (const row of data) {
    const interval = String(row.interval);
    const target = isFirstHalf(interval) ? firstHalf : secondHalf;
    target[homeTeam] += Number(row[homeTeam] ?? 0);
    target[awayTeam] += Number(row[awayTeam] ?? 0);
  }

  return { firstHalf, secondHalf, strongest };
}

function strongestInterval(data: Record<string, string | number>[], team: string) {
  const strongest = data.reduce<{ interval: string; goals: number }>(
    (winner, row) => {
      const goals = Number(row[team] ?? 0);
      return goals > winner.goals ? { interval: String(row.interval), goals } : winner;
    },
    { interval: "Sin goles", goals: 0 },
  );
  return strongest.goals > 0 ? `${strongest.interval} (${strongest.goals})` : "Sin goles";
}

function isFirstHalf(interval: string) {
  return ["0-15", "1-15", "15-30", "16-30", "30-descanso", "31-45"].includes(interval);
}

function intervalOrder(interval: string) {
  const order: Record<string, number> = {
    "0-15": 0,
    "1-15": 0,
    "15-30": 1,
    "16-30": 1,
    "30-descanso": 2,
    "31-45": 2,
    "46-60": 3,
    "60-75": 4,
    "61-75": 4,
    "75-final": 5,
    "76-90": 5,
  };
  return order[interval] ?? 99;
}
