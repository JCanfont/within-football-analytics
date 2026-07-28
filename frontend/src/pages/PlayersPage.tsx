import { BarChart3, ChevronDown, ChevronRight, Search, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fetchPlayerStadiumAnalytics, fetchPlayers } from "../services/api";
import type { Player, PlayerStadiumAnalytics } from "../types/api";

export function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPlayerId, setExpandedPlayerId] = useState<number | null>(null);
  const [analyticsByPlayer, setAnalyticsByPlayer] = useState<Record<number, PlayerStadiumAnalytics[]>>({});
  const [loadingAnalyticsId, setLoadingAnalyticsId] = useState<number | null>(null);

  useEffect(() => {
    fetchPlayers()
      .then((result) => {
        setPlayers(result);
        setIsLoading(false);
      })
      .catch(() => {
        setError("No se pudieron cargar los jugadores.");
        setIsLoading(false);
      });
  }, []);

  const filteredPlayers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return players;
    }
    return players.filter((player) =>
      `${player.full_name} ${player.primary_position ?? ""} ${player.nationality ?? ""}`.toLowerCase().includes(normalized),
    );
  }, [players, query]);

  function togglePlayer(player: Player) {
    if (expandedPlayerId === player.id) {
      setExpandedPlayerId(null);
      return;
    }
    setExpandedPlayerId(player.id);
    if (analyticsByPlayer[player.id]) {
      return;
    }
    setLoadingAnalyticsId(player.id);
    fetchPlayerStadiumAnalytics(player.id)
      .then((rows) => setAnalyticsByPlayer((current) => ({ ...current, [player.id]: rows })))
      .catch(() => setAnalyticsByPlayer((current) => ({ ...current, [player.id]: [] })))
      .finally(() => setLoadingAnalyticsId(null));
  }

  return (
    <section className="players-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Catalogo y rendimiento</p>
          <h1>Jugadores</h1>
        </div>
        <label className="players-search">
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="Buscar jugador"
            placeholder="Buscar jugador, posicion o pais"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </header>

      <section className="panel players-panel">
        <div className="panel-heading">
          <div>
            <h2>Lista de jugadores</h2>
            <p>{isLoading ? "Cargando jugadores..." : `${filteredPlayers.length} jugadores visibles`}</p>
          </div>
        </div>

        {error ? <div className="detail-state">{error}</div> : null}
        {isLoading ? <div className="detail-state">Cargando informacion de jugadores...</div> : null}

        {!isLoading && !error && filteredPlayers.length > 0 ? (
          <div className="players-list">
            {filteredPlayers.map((player) => (
              <article className="player-row" key={player.id}>
                <button type="button" onClick={() => togglePlayer(player)} aria-expanded={expandedPlayerId === player.id}>
                  <span className="player-avatar">
                    <UserRound size={18} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{player.full_name}</strong>
                    <small>
                      {formatPlayerMeta(player.primary_position)} · {player.nationality ?? "Pais no informado"}
                    </small>
                  </span>
                  {expandedPlayerId === player.id ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
                </button>

                {expandedPlayerId === player.id ? (
                  <PlayerAnalyticsBlock rows={analyticsByPlayer[player.id] ?? []} isLoading={loadingAnalyticsId === player.id} />
                ) : null}
              </article>
            ))}
          </div>
        ) : null}

        {!isLoading && !error && filteredPlayers.length === 0 ? (
          <div className="forebet-empty-date">
            <strong>No hay jugadores para esa busqueda</strong>
            <span>Importa estadisticas de jugadores o cambia el texto de busqueda.</span>
          </div>
        ) : null}
      </section>
    </section>
  );
}

function PlayerAnalyticsBlock({ isLoading, rows }: { isLoading: boolean; rows: PlayerStadiumAnalytics[] }) {
  if (isLoading) {
    return <div className="player-analytics-state">Cargando rendimiento por estadio...</div>;
  }
  if (rows.length === 0) {
    return <div className="player-analytics-state">Sin datos de rendimiento cargados para este jugador.</div>;
  }
  return (
    <div className="player-analytics">
      <div className="player-analytics-title">
        <BarChart3 size={17} aria-hidden="true" />
        <span>Rendimiento por estadio</span>
      </div>
      <div className="table-wrap compact-table">
        <table>
          <thead>
            <tr>
              <th>Estadio</th>
              <th>Partidos</th>
              <th>Minutos</th>
              <th>Goles</th>
              <th>Asistencias</th>
              <th>G+A / 90</th>
              <th>Fiabilidad</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.player_id}-${row.stadium_id ?? "all"}`}>
                <td>{row.stadium ?? "Todos"}</td>
                <td>{row.matches}</td>
                <td>{row.minutes}</td>
                <td>{row.goals}</td>
                <td>{row.assists}</td>
                <td>{formatDecimal(row.goal_participations_per_90)}</td>
                <td>{formatReliability(row.reliability)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatPlayerMeta(value?: string | null) {
  return value ? value : "Posicion no informada";
}

function formatDecimal(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : "n/d";
}

function formatReliability(value: string) {
  const labels: Record<string, string> = {
    very_low: "muy baja",
    low: "baja",
    medium: "media",
    high: "alta",
  };
  return labels[value] ?? value;
}
