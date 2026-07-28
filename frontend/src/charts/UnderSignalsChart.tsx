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
    </div>
  );
}

function classifyDirectUnderOver(match: DirectMatchResult) {
  if (match.home_score == null || match.away_score == null) {
    return "unknown";
  }
  return match.home_score + match.away_score < 2.5 ? "under" : "over";
}
