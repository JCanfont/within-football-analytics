import type { MatchListItem } from "../types/api";
import { displayTeamName } from "../utils/matchFilters";

const MAX_RENDERED_MATCHES = 100;

type MatchTableProps = {
  matches: MatchListItem[];
  totalMatches: number;
  isLoading: boolean;
  selectedMatchId: number | null;
  isCollapsed?: boolean;
  onSelectMatch: (matchId: number) => void;
};

export function MatchTable({ matches, totalMatches, isLoading, selectedMatchId, isCollapsed = false, onSelectMatch }: MatchTableProps) {
  if (isLoading) {
    return <div className="table-state">Cargando partidos...</div>;
  }

  if (matches.length === 0) {
    if (totalMatches > 0) {
      return <div className="table-state">No hay partidos con estos filtros.</div>;
    }
    return <div className="table-state">No hay partidos importados todavia.</div>;
  }

  if (isCollapsed) {
    return (
      <div className="table-state table-state-collapsed">
        Lista plegada: {formatNumber(matches.length)} partidos visibles de {formatNumber(totalMatches)} cargados. Usa los filtros, la voz o el boton de mostrar lista para revisar partidos concretos.
      </div>
    );
  }

  const visibleRows = matches.slice(0, MAX_RENDERED_MATCHES);
  const isLimited = matches.length > visibleRows.length;

  return (
    <div className="table-wrap">
      <div className="table-summary">
        {isLimited
          ? `Mostrando los primeros ${formatNumber(visibleRows.length)} de ${formatNumber(matches.length)} partidos visibles. Usa filtros para acotar la busqueda.`
          : `Mostrando ${formatNumber(matches.length)} partidos visibles de ${formatNumber(totalMatches)} cargados.`}
      </div>
      <table>
        <thead>
          <tr>
            <th>Hora</th>
            <th>Liga</th>
            <th>Tipo</th>
            <th>Partido</th>
            <th>Forebet</th>
            <th>Estado</th>
            <th>Detalle</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((match) => (
            <tr className={selectedMatchId === match.id ? "selected-row" : ""} key={match.id}>
              <td>{formatTime(match.match_date)}</td>
              <td>{match.competition}</td>
              <td>{match.is_friendly ? "Amistoso" : formatCompetitionType(match.competition_type)}</td>
              <td>
                <strong>{displayTeamName(match.home_team)}</strong>
                <span> vs </span>
                <strong>{displayTeamName(match.away_team)}</strong>
              </td>
              <td>{match.latest_forebet_prediction ?? "Sin captura"}</td>
              <td>
                <span className="table-badge">{match.status}</span>
              </td>
              <td>
                <button className="row-action" type="button" onClick={() => onSelectMatch(match.id)}>
                  Analizar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCompetitionType(value?: string | null) {
  const labels: Record<string, string> = {
    domestic_league: "Liga",
    domestic_cup: "Copa",
    continental: "Continental",
    friendly: "Amistoso",
  };
  return labels[value ?? ""] ?? "Sin tipo";
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-ES").format(value);
}
