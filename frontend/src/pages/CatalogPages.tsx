import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { fetchCompetitions, fetchMatches, fetchTeams } from "../services/api";
import type { Competition, MatchListItem, Team } from "../types/api";

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
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchTeams().then((result) => {
      setTeams(result);
      setIsLoading(false);
    });
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
      {isLoading ? <div className="detail-state">Cargando equipos...</div> : <TeamGrid teams={visibleTeams} />}
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

function TeamGrid({ teams }: { teams: Team[] }) {
  return (
    <div className="catalog-grid">
      {teams.map((team) => (
        <article className="catalog-card" key={team.id}>
          <strong>{team.name}</strong>
          <span>{team.country ?? "Pais no informado"}</span>
        </article>
      ))}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
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
