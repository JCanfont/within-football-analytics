import { ArrowLeft, BarChart3, ChevronDown, ChevronRight, RefreshCw, Search, Trophy, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { fetchCompetitions, fetchMatches, fetchTeamSquad, fetchTeams, importTransfermarktSquad } from "../services/api";
import type { Competition, MatchListItem, Team, TeamSquad } from "../types/api";

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
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [openCompetitionId, setOpenCompetitionId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([fetchCompetitions(), fetchMatches()])
      .then(([competitionsResult, matchesResult]) => {
        setCompetitions(competitionsResult);
        setMatches(matchesResult);
      })
      .finally(() => setIsLoading(false));
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
      {isLoading ? (
        <div className="detail-state">Cargando campeonatos...</div>
      ) : (
        <CompetitionGrid
          competitions={visibleCompetitions}
          matches={matches}
          onToggle={(competitionId) => setOpenCompetitionId((current) => (current === competitionId ? null : competitionId))}
          openCompetitionId={openCompetitionId}
        />
      )}
    </CatalogShell>
  );
}

export function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([fetchTeams(), fetchMatches()])
      .then(([teamsResult, matchesResult]) => {
        setTeams(teamsResult);
        setMatches(matchesResult);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const visibleTeams = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? teams.filter((team) => `${team.name} ${team.country ?? ""}`.toLowerCase().includes(normalized)) : teams;
  }, [teams, query]);
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null;

  if (!isLoading && selectedTeam) {
    return <TeamDetailScreen matches={matches} onBack={() => setSelectedTeamId(null)} team={selectedTeam} />;
  }

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
          onSelect={(teamId) => setSelectedTeamId(teamId)}
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

function CompetitionGrid({
  competitions,
  matches,
  onToggle,
  openCompetitionId,
}: {
  competitions: Competition[];
  matches: MatchListItem[];
  onToggle: (competitionId: number) => void;
  openCompetitionId: number | null;
}) {
  return (
    <div className="catalog-grid">
      {competitions.map((competition) => (
        <article className="catalog-card expandable-card competition-card" key={competition.id}>
          <button type="button" onClick={() => onToggle(competition.id)}>
            <span>
              <strong>{competition.name}</strong>
              <small>{competition.country ?? "Pais no informado"}</small>
              <small>{competition.competition_type ?? "domestic_league"}</small>
            </span>
            {openCompetitionId === competition.id ? <ChevronDown size={17} aria-hidden="true" /> : <ChevronRight size={17} aria-hidden="true" />}
          </button>
          {openCompetitionId === competition.id ? <CompetitionProfile competition={competition} matches={matches} /> : null}
        </article>
      ))}
    </div>
  );
}

function TeamGrid({
  onSelect,
  teams,
}: {
  onSelect: (teamId: number) => void;
  teams: Team[];
}) {
  return (
    <div className="catalog-grid">
      {teams.map((team) => (
        <article className="catalog-card expandable-card team-card" key={team.id}>
          <button type="button" onClick={() => onSelect(team.id)}>
            <span>
              <strong>{team.name}</strong>
              <small>{team.country ?? "Pais no informado"}</small>
            </span>
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        </article>
      ))}
    </div>
  );
}

function TeamDetailScreen({ matches, onBack, team }: { matches: MatchListItem[]; onBack: () => void; team: Team }) {
  const [squad, setSquad] = useState<TeamSquad | null>(null);
  const [isSquadLoading, setIsSquadLoading] = useState(true);
  const [isSyncingSquad, setIsSyncingSquad] = useState(false);

  useEffect(() => {
    setIsSquadLoading(true);
    fetchTeamSquad(team.id)
      .then(setSquad)
      .catch(() =>
        setSquad({
          team_id: team.id,
          team: team.name,
          provider: "transfermarkt",
          status: "error",
          message: "No se pudo cargar la plantilla del equipo.",
          imported: 0,
          players: [],
        }),
      )
      .finally(() => setIsSquadLoading(false));
  }, [team.id, team.name]);

  function syncSquad() {
    setIsSyncingSquad(true);
    importTransfermarktSquad(team.id)
      .then(setSquad)
      .catch(() =>
        setSquad((current) => ({
          team_id: team.id,
          team: team.name,
          provider: "transfermarkt",
          status: "request_failed",
          message: "No se pudo sincronizar la plantilla desde el proveedor autorizado.",
          imported: 0,
          players: current?.players ?? [],
        })),
      )
      .finally(() => setIsSyncingSquad(false));
  }

  return (
    <section className="catalog-page team-detail-screen">
      <header className="page-header team-detail-header">
        <div>
          <p className="eyebrow">Ficha de equipo</p>
          <h1>{team.name}</h1>
          <p>{team.country ?? "Pais no informado"}</p>
        </div>
        <button className="filter-show" type="button" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" />
          Atrás
        </button>
      </header>

      <section className="panel team-detail-panel">
        <TeamProfile
          isSquadLoading={isSquadLoading}
          isSyncingSquad={isSyncingSquad}
          matches={matches}
          onSyncSquad={syncSquad}
          squad={squad}
          team={team}
        />
      </section>
    </section>
  );
}

function CompetitionProfile({ competition, matches }: { competition: Competition; matches: MatchListItem[] }) {
  const competitionMatches = matches.filter((match) => match.competition === competition.name);
  const stats = buildCompetitionStats(competition, competitionMatches);

  return (
    <div className="team-profile competition-profile">
      <div className="team-profile-grid">
        <TeamProfileMetric label="Temporada analizada" value={formatSeason(stats.season)} detail="Ultima disponible" />
        <TeamProfileMetric label="Jornadas totales" value={stats.totalMatchdaysLabel} detail={stats.matchdaySource} />
        <TeamProfileMetric label="Jornada actual" value={stats.currentMatchdayLabel} detail={`${stats.finishedMatches.length} finalizados`} />
        <TeamProfileMetric label="Partidos cargados" value={stats.seasonMatches.length.toString()} detail={`${stats.teamCount} equipos`} />
      </div>
      <div className="team-profile-section">
        <div className="team-profile-heading">
          <Trophy size={16} aria-hidden="true" />
          <strong>Goles por equipo</strong>
          <span>Calculado con partidos finalizados</span>
        </div>
        <div className="competition-rankings">
          <TeamProfileMetric label="Mas goles" value={stats.mostGoalsFor?.team ?? "n/d"} detail={stats.mostGoalsFor ? `${stats.mostGoalsFor.goalsFor} goles` : "Sin muestra"} />
          <TeamProfileMetric label="Menos goles" value={stats.leastGoalsFor?.team ?? "n/d"} detail={stats.leastGoalsFor ? `${stats.leastGoalsFor.goalsFor} goles` : "Sin muestra"} />
          <TeamProfileMetric label="Mejor defensa" value={stats.bestDefense?.team ?? "n/d"} detail={stats.bestDefense ? `${stats.bestDefense.goalsAgainst} recibidos` : "Sin muestra"} />
          <TeamProfileMetric label="Mejor diferencia" value={stats.bestDifference?.team ?? "n/d"} detail={stats.bestDifference ? `DG ${stats.bestDifference.goalDifference}` : "Sin muestra"} />
        </div>
      </div>
      <div className="team-profile-section">
        <div className="team-profile-heading">
          <BarChart3 size={16} aria-hidden="true" />
          <strong>Rachas under y over</strong>
          <span>Solo esta competicion y temporada</span>
        </div>
        <div className="competition-rankings">
          <TeamProfileMetric label="Under actual" value={stats.streaks.under.current.toString()} detail={`Maxima ${stats.streaks.under.maximum}`} />
          <TeamProfileMetric label="Over actual" value={stats.streaks.over.current.toString()} detail={`Maxima ${stats.streaks.over.maximum}`} />
          <TeamProfileMetric label="Promedio goles" value={stats.averageGoals.toFixed(2)} detail="Por partido finalizado" />
          <TeamProfileMetric label="Total goles" value={stats.totalGoals.toString()} detail="Temporada analizada" />
        </div>
      </div>
      <div className="team-profile-section">
        <strong>Ultimos partidos finalizados</strong>
        <div className="team-recent-list">
          {stats.finishedMatches.slice(0, 5).map((match) => (
            <span key={match.id}>
              {formatDate(match.match_date)} - {match.home_team} {formatScore(match)} {match.away_team}
            </span>
          ))}
          {!stats.finishedMatches.length ? <span>Sin partidos finalizados en la muestra.</span> : null}
        </div>
      </div>
    </div>
  );
}

function TeamProfile({
  isSquadLoading,
  isSyncingSquad,
  matches,
  onSyncSquad,
  squad,
  team,
}: {
  isSquadLoading: boolean;
  isSyncingSquad: boolean;
  matches: MatchListItem[];
  onSyncSquad: () => void;
  squad: TeamSquad | null;
  team: Team;
}) {
  const teamMatches = matches
    .filter((match) => match.home_team === team.name || match.away_team === team.name)
    .sort((a, b) => new Date(b.match_date).getTime() - new Date(a.match_date).getTime());
  const standings = buildStandings(matches);
  const standing = standings.find((row) => row.team === team.name);
  const streaks = buildUnderOverStreaks(teamMatches);
  const squadPlayers = squad?.players ?? [];

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
          <span>{squad?.message ?? "Cargando plantilla..."}</span>
          <button className="row-action" type="button" onClick={onSyncSquad} disabled={isSyncingSquad}>
            <RefreshCw size={15} aria-hidden="true" />
            {isSyncingSquad ? "Sincronizando" : "Sincronizar Transfermarkt"}
          </button>
        </div>
        {isSquadLoading ? (
          <p className="team-profile-note">Cargando plantilla del equipo...</p>
        ) : squadPlayers.length ? (
          <div className="team-squad-list">
            {squadPlayers.map((player) => (
              <span key={player.id}>
                {player.shirt_number ? `${player.shirt_number}. ` : ""}
                {player.full_name}
                <small>{player.primary_position ?? "posicion n/d"}{player.nationality ? ` - ${player.nationality}` : ""}</small>
              </span>
            ))}
          </div>
        ) : (
          <p className="team-profile-note">No hay plantilla importada para este equipo. Configura un feed autorizado y pulsa Sincronizar Transfermarkt.</p>
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

function buildCompetitionStats(competition: Competition, matches: MatchListItem[]) {
  const seasons = Array.from(new Set(matches.map((match) => match.season))).sort((a, b) => b.localeCompare(a));
  const season = seasons[0] ?? "n/d";
  const seasonMatches = matches
    .filter((match) => match.season === season)
    .sort((a, b) => new Date(b.match_date).getTime() - new Date(a.match_date).getTime());
  const finishedMatches = seasonMatches.filter((match) => match.home_score != null && match.away_score != null);
  const standings = buildStandings(finishedMatches);
  const teamCount = new Set(seasonMatches.flatMap((match) => [match.home_team, match.away_team])).size;
  const matchesPerMatchday = Math.max(1, Math.floor(teamCount / 2));
  const isLeague = (competition.competition_type ?? "domestic_league").includes("league");
  const estimatedTotalMatchdays = isLeague && teamCount > 1 ? (teamCount - 1) * 2 : Math.ceil(seasonMatches.length / matchesPerMatchday);
  const currentMatchday = Math.min(estimatedTotalMatchdays || 0, Math.ceil(finishedMatches.length / matchesPerMatchday));
  const totalGoals = finishedMatches.reduce((sum, match) => sum + (match.home_score ?? 0) + (match.away_score ?? 0), 0);
  const rankedByGoalsFor = [...standings].sort((a, b) => b.goalsFor - a.goalsFor || a.team.localeCompare(b.team));
  const rankedByGoalsAgainst = [...standings].sort((a, b) => a.goalsAgainst - b.goalsAgainst || a.team.localeCompare(b.team));
  const rankedByDifference = [...standings].sort((a, b) => b.goalDifference - a.goalDifference || a.team.localeCompare(b.team));

  return {
    averageGoals: finishedMatches.length ? totalGoals / finishedMatches.length : 0,
    bestDefense: rankedByGoalsAgainst[0],
    bestDifference: rankedByDifference[0],
    currentMatchdayLabel: currentMatchday ? `${currentMatchday}` : "n/d",
    finishedMatches,
    leastGoalsFor: rankedByGoalsFor.at(-1),
    matchdaySource: isLeague ? "Estimacion por equipos" : "Estimacion por partidos",
    mostGoalsFor: rankedByGoalsFor[0],
    season,
    seasonMatches,
    streaks: buildUnderOverStreaks(finishedMatches),
    teamCount,
    totalGoals,
    totalMatchdaysLabel: estimatedTotalMatchdays ? `${estimatedTotalMatchdays}` : "n/d",
  };
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
