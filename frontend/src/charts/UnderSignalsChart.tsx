import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DirectMatchResult, MatchListItem } from "../types/api";
import { classifyUnderOver } from "../utils/matchFilters";

type UnderSignalsChartProps = {
  matches: MatchListItem[];
  directMatches?: DirectMatchResult[];
  useDirectScope?: boolean;
  scopeLabel?: string;
};

export function UnderSignalsChart({ matches, directMatches = [], useDirectScope = false, scopeLabel }: UnderSignalsChartProps) {
  const underBreakdown = useDirectScope ? directUnderBreakdown(directMatches) : matchUnderBreakdown(matches);
  const underTotal = underBreakdown.reduce((sum, item) => sum + item.value, 0);
  const data = [
    {
      name: "Under",
      value: useDirectScope
        ? directMatches.filter((match) => classifyDirectUnderOver(match) === "under").length
        : matches.filter((match) => classifyUnderOver(match) === "under").length,
    },
    {
      name: "Over",
      value: useDirectScope
        ? directMatches.filter((match) => classifyDirectUnderOver(match) === "over").length
        : matches.filter((match) => classifyUnderOver(match) === "over").length,
    },
  ];

  return (
    <div className="chart-box">
      <p className="chart-scope">
        {scopeLabel ?? (useDirectScope ? `Cruce seleccionado: ${directMatches.length} enfrentamientos directos` : `Vista general: ${matches.length} partidos visibles`)}
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d8dee8" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "rgba(18, 32, 56, 0.06)" }} />
          <Bar dataKey="value" fill="#2f6f73" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="under-breakdown">
        <div className="under-breakdown-heading">
          <span>Lectura rapida under</span>
          <strong>{underTotal} marcadores under con resultado</strong>
        </div>
        <div className="under-breakdown-grid">
          {underBreakdown.map((item) => (
            <div className={`under-breakdown-item ${item.key}`} key={item.key}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{underTotal ? `${Math.round((item.value / underTotal) * 100)}%` : "0%"}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function matchUnderBreakdown(matches: MatchListItem[]) {
  return underBreakdownFromScores(matches.map((match) => ({ home: match.home_score, away: match.away_score })));
}

function directUnderBreakdown(matches: DirectMatchResult[]) {
  return underBreakdownFromScores(matches.map((match) => ({ home: match.home_score, away: match.away_score })));
}

function underBreakdownFromScores(scores: Array<{ home?: number | null; away?: number | null }>) {
  const buckets = [
    { key: "score-00", label: "0-0", value: 0 },
    { key: "score-10", label: "1-0 / 0-1", value: 0 },
    { key: "score-11", label: "1-1", value: 0 },
    { key: "score-20", label: "2-0 / 0-2", value: 0 },
  ];
  for (const score of scores) {
    if (score.home == null || score.away == null || score.home + score.away >= 2.5) {
      continue;
    }
    if (score.home === 0 && score.away === 0) {
      buckets[0].value += 1;
    } else if ((score.home === 1 && score.away === 0) || (score.home === 0 && score.away === 1)) {
      buckets[1].value += 1;
    } else if (score.home === 1 && score.away === 1) {
      buckets[2].value += 1;
    } else if ((score.home === 2 && score.away === 0) || (score.home === 0 && score.away === 2)) {
      buckets[3].value += 1;
    }
  }
  return buckets;
}

function classifyDirectUnderOver(match: DirectMatchResult) {
  if (match.home_score == null || match.away_score == null) {
    return "unknown";
  }
  return match.home_score + match.away_score < 2.5 ? "under" : "over";
}
