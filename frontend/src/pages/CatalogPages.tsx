import { ChevronDown, ChevronRight, Search, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { fetchCompetitions, fetchMatches, fetchPlayers, fetchTeams } from "../services/api";
import type { Competition, MatchListItem, Player, Team } from "../types/api";

export function MatchesPage() {
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMatches()
      .then((result) => {
        setMatches(result);
        setIsLoading(false);
      })
      .catch(() => {
        setError("No se pudo cargar la lista de partidos.");
        setIsLoading(false);
      });
  }, []);

  const visibleMatches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return matches;
    }
    return matches.filter((match) =>
      `${match.competition} ${match.season} ${match.home_team} ${match.away_team}`.toLowerCase().includes(normalized),
    );
  }, [matches, query]);

  return (
    <CatalogShell
      title="Partidos"
      subtitle={isLoading ? "Cargando partidos..." : `${visibleMatches.length} partidos visibles de ${matches.length} cargados`}
      query={query}
      onQueryChange={setQuery}
      placeholder="Buscar equipo, liga o temporada"
    >
      {error ? <div className="detail-state">{error}</div> : null}
      {isLoading ? <div className="detail-state">Cargando lista de partidos...</div> : null}
      {!isLoading && !error ? (
        <div className="table-wrap catalog-table">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Liga</th>
                <th>Temporada</th>
                <th>Partido</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {visibleMatches.map((match) => (
                <tr key={match.id}>
                  <td>{formatDate(match.match_date)}</td>
                  <td>{formatTime(match.match_date)}</td>
                  <td>{match.competition}</td>
                  <td>{formatSeason(match.season)}</td>
                  <td>
                    <strong>{match.home_team}</strong> vs <strong>{match.away_team}</strong>
                  </td>
                  <td>{formatScore(match)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </CatalogShell>
  );
}

export function CompetitionsPage() {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchCompetitions().then((result) => {
      setCompetitions(result);
      setIsLoading(false);
    });
  }, []);

  const visibleCompetitions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? competitions.filter((competition) => `${competition.name} ${competition.country ?? ""}`.toLowerCase().includes(normalized))
      : competitions;
  }, [competitions, query]);

  return (
    <CatalogShell
      title="Competiciones"
      subtitle={isLoading ? "Cargando competiciones..." : `${visibleCompetitions.length} competiciones visibles`}
      query={query}
      onQueryChange={setQuery}
      placeholder="Buscar liga o pais"
    >
      {isLoading ? <div className="detail-state">Cargando campeonatos...</div> : <CompetitionGrid competitions={visibleCompetitions} />}
    </CatalogShell>
  );
}

export function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [openTeamId, setOpenTeamId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([fetchTeams(), fetchMatches(), fetchPlayers()])
      .then(([teamsResult, matchesResult, playersResult]) => {
        setTeams(teamsResult);
        setMatches(matchesResult);
        setPlayers(playersResult);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const visibleTeams = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? teams.filter((team) => `${team.name} ${team.country ?? ""}`.toLowerCase().includes(normalized)) : teams;
  }, [teams, query]);

  return (
    <CatalogShell
      title="Equipos"
      subtitle={isLoading ? "Cargando equipos..." : `${visibleTeams.length} equipos visibles`}
      query={query}
      onQueryChange={setQuery}
      placeholder="Buscar equipo o pais"
    >
      {isLoading ? (
        <div className="detail-state">Cargando equipos...</div>
      ) : (
        <TeamGrid
          matches={matches}
          onToggle={(teamId) => setOpenTeamId((current) => (current === teamId ? null : teamId))}
          openTeamId={openTeamId}
          players={players}
          teams={visibleTeams}
        />
      )}
    </CatalogShell>
  );
}

function CatalogShell({
  children,
  onQueryChange,
  placeholder,
  query,
  subtitle,
  title,
}: {
  children: ReactNode;
  onQueryChange: (value: string) => void;
  placeholder: string;
  query: string;
  subtitle: string;
  title: string;
}) {
  return (
    <section className="catalog-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Catalogo cargado</p>
          <h1>{title}</h1>
        </div>
        <label className="players-search">
          <Search size={16} aria-hidden="true" />
          <input aria-label={`Buscar ${title.toLowerCase()}`} placeholder={placeholder} value={query} onChange={(event) => onQueryChange(event.target.value)} />
        </label>
      </header>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
        </div>
        {children}
      </section>
    </section>
  );
}

function CompetitionGrid({ competitions }: { competitions: Competition[] }) {
  return (
    <div className="catalog-grid">
      {competitions.map((competition) => (
        <article className="catalog-card" key={competition.id}>
          <strong>{competition.name}</strong>
          <span>{competition.country ?? "Pais no informado"}</span>
          <small>{competition.competition_type ?? "domestic_league"}</small>
        </article>
      ))}
    </div>
  );
}

function TeamGrid({
  matches,
  onToggle,
  openTeamId,
  players,
  teams,
}: {
  matches: MatchListItem[];
  onToggle: (teamId: number) => void;
  openTeamId: number | null;
  players: Player[];
  teams: Team[];
}) {
  return (
    <div className="catalog-grid">
      {teams.map((team) => (
        <article className="catalog-card team-card" key={team.id}>
          <button type="button" onClick={() => onToggle(team.id)}>
            <span>
              <strong>{team.name}</strong>
              <small>{team.country ?? "Pais no informado"}</small>
            </span>
            {openTeamId === team.id ? <ChevronDown size={17} aria-hidden="true" /> : <ChevronRight size={17} aria-hidden="true" />}
          </button>
          {openTeamId === team.id ? <TeamProfile matches={matches} players={players} team={team} /> : null}
        </article>
      ))}
    </div>
  );
}

function TeamProfile({ matches, players, team }: { matches: MatchListItem[]; players: Player[]; team: Team }) {
  const teamMatches = matches
    .filter((match) => match.home_team === team.name || match.away_team === team.name)
    .sort((a, b) => new Date(b.match_date).getTime() - new Date(a.match_date).getTime());
  const standings = buildStandings(matches);
  const standing = standings.find((row) => row.team === team.name);
  const streaks = buildUnderOverStreaks(teamMatches);
  const localPlayers = players.slice(0, 8);

  return (
    <div className="team-profile">
      <div className="team-profile-grid">
        <TeamProfileMetric label="Posicion calculada" value={standing ? `${standing.position}` : "n/d"} detail={standing ? `${standing.points} pts - DG ${standing.goalDifference}` : "Sin partidos suficientes"} />
        <TeamProfileMetric label="Partidos cargados" value={teamMatches.length.toString()} detail="Muestra local" />
        <TeamProfileMetric label="Racha under" value={streaks.under.current.toString()} detail={`Maxima ${streaks.under.maximum}`} />
        <TeamProfileMetric label="Racha over" value={streaks.over.current.toString()} detail={`Maxima ${streaks.over.maximum}`} />
      </div>
      <div className="team-profile-section">
        <div className="team-profile-heading">
          <UsersRound size={16} aria-hidden="true" />
          <strong>Plantilla</strong>
          <span>Transfermarkt pendiente de conexion real</span>
        </div>
        {localPlayers.length ? (
          <>
            <p className="team-profile-note">Plantilla provisional con jugadores ya importados. La vinculacion equipo-jugador se completara con el conector de Transfermarkt.</p>
            <div className="team-squad-list">
              {localPlayers.map((player) => (
                <span key={player.id}>
                  {player.full_name}
                  <small>{player.primary_position ?? "posicion n/d"}</small>
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="team-profile-note">No hay jugadores importados para mostrar. La conexion real con Transfermarkt debe hacerse desde backend o proveedor autorizado.</p>
        )}
      </div>
      <div className="team-profile-section">
        <strong>Ultimos partidos</strong>
        <div className="team-recent-list">
          {teamMatches.slice(0, 5).map((match) => (
            <span key={match.id}>
              {formatDate(match.match_date)} - {match.home_team} {formatScore(match)} {match.away_team}
            </span>
          ))}
          {!teamMatches.length ? <span>Sin partidos cargados.</span> : null}
        </div>
      </div>
    </div>
  );
}

function TeamProfileMetric({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function buildStandings(matches: MatchListItem[]) {
  const table = new Map<string, { team: string; played: number; points: number; goalsFor: number; goalsAgainst: number; goalDifference: number }>();
  for (const match of matches) {
    if (match.home_score == null || match.away_score == null) {
      continue;
    }
    const home = table.get(match.home_team) ?? { team: match.home_team, played: 0, points: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 };
    const away = table.get(match.away_team) ?? { team: match.away_team, played: 0, points: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 };
    home.played += 1;
    away.played += 1;
    home.goalsFor += match.home_score;
    home.goalsAgainst += match.away_score;
    away.goalsFor += match.away_score;
    away.goalsAgainst += match.home_score;
    if (match.home_score > match.away_score) {
      home.points += 3;
    } else if (match.home_score < match.away_score) {
      away.points += 3;
    } else {
      home.points += 1;
      away.points += 1;
    }
    home.goalDifference = home.goalsFor - home.goalsAgainst;
    away.goalDifference = away.goalsFor - away.goalsAgainst;
    table.set(home.team, home);
    table.set(away.team, away);
  }
  return Array.from(table.values())
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor)
    .map((row, index) => ({ ...row, position: index + 1 }));
}

function buildUnderOverStreaks(matches: MatchListItem[]) {
  const chronological = [...matches].reverse().filter((match) => match.home_score != null && match.away_score != null);
  return {
    under: streakSummary(chronological, "under"),
    over: streakSummary(chronological, "over"),
  };
}

function streakSummary(matches: MatchListItem[], target: "under" | "over") {
  const signals = matches.map((match) => ((match.home_score ?? 0) + (match.away_score ?? 0) < 2.5 ? "under" : "over"));
  let current = 0;
  for (const signal of [...signals].reverse()) {
    if (signal !== target) {
      break;
    }
    current += 1;
  }
  let maximum = 0;
  let running = 0;
  for (const signal of signals) {
    if (signal === target) {
      running += 1;
      maximum = Math.max(maximum, running);
    } else {
      running = 0;
    }
  }
  return { current, maximum };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function formatTime(value: string) {
  const match = value.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : "--:--";
}

function formatSeason(value: string) {
  const match = value.match(/(\d{2})(\d{2})\D+(\d{2})(\d{2})/);
  return match ? `${match[2]}-${match[4]}` : value;
}

function formatScore(match: MatchListItem) {
  if (match.home_score == null || match.away_score == null) {
    return match.status;
  }
  return `${match.home_score}-${match.away_score}`;
}
