import { Eye, Filter, Play, RotateCcw } from "lucide-react";
import { describeEquilibriumRange, displayTeamName } from "../utils/matchFilters";
import type { MatchFilterState } from "../utils/matchFilters";

export type AnalysisOutputMode = "screen" | "voice" | "both";

type MatchFiltersProps = {
  filters: MatchFilterState;
  teams: string[];
  teamGroups?: TeamOptionGroup[];
  competitionTypes: string[];
  totalMatches: number;
  visibleMatches: number;
  pairMatches: number;
  outputMode: AnalysisOutputMode;
  isLoadingEquilibrium: boolean;
  onChange: (filters: MatchFilterState) => void;
  onOutputModeChange: (mode: AnalysisOutputMode) => void;
  onAnalyzePair: () => void;
  onShowAnalysis: () => void;
  onReset: () => void;
};

export type TeamOptionGroup = {
  label: string;
  teams: string[];
};

export function MatchFilters({
  filters,
  teams,
  teamGroups = [],
  competitionTypes,
  totalMatches,
  visibleMatches,
  pairMatches,
  outputMode,
  isLoadingEquilibrium,
  onChange,
  onOutputModeChange,
  onAnalyzePair,
  onShowAnalysis,
  onReset,
}: MatchFiltersProps) {
  const hasSelectedTeams = filters.homeTeam !== "all" && filters.awayTeam !== "all";
  const canAnalyzePair = hasSelectedTeams && pairMatches > 0;
  const hasGroupedTeams = teamGroups.some((group) => group.teams.length > 0);

  return (
    <section className="panel filters-panel" aria-label="Filtros de partidos">
      <div className="filters-heading">
        <div className="detail-title">
          <Filter size={18} aria-hidden="true" />
          <h3>Filtros de parametros</h3>
        </div>
        <span>
          {formatNumber(visibleMatches)}/{formatNumber(totalMatches)}
        </span>
      </div>
      <div className="filters-grid">
        <label>
          <span>Equipo local</span>
          <select value={filters.homeTeam} onChange={(event) => onChange({ ...filters, homeTeam: event.target.value })}>
            <option value="all">Todos</option>
            <TeamOptions teams={teams} groups={teamGroups} useGroups={hasGroupedTeams} />
          </select>
        </label>
        <label>
          <span>Equipo visitante</span>
          <select value={filters.awayTeam} onChange={(event) => onChange({ ...filters, awayTeam: event.target.value })}>
            <option value="all">Todos</option>
            <TeamOptions teams={teams} groups={teamGroups} useGroups={hasGroupedTeams} />
          </select>
        </label>
        <label>
          <span>Competicion</span>
          <select value={filters.competitionType} onChange={(event) => onChange({ ...filters, competitionType: event.target.value })}>
            <option value="all">Todas</option>
            {competitionTypes.map((type) => (
              <option key={type} value={type}>
                {formatCompetitionType(type)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Partido</span>
          <select value={filters.matchKind} onChange={(event) => onChange({ ...filters, matchKind: event.target.value })}>
            <option value="all">Todos</option>
            <option value="official">Oficiales</option>
            <option value="friendly">Amistosos</option>
          </select>
        </label>
        <label>
          <span>Under/Over</span>
          <select value={filters.underOver} onChange={(event) => onChange({ ...filters, underOver: event.target.value })}>
            <option value="all">Todos</option>
            <option value="under">Under</option>
            <option value="over">Over</option>
            <option value="unknown">Sin senal</option>
          </select>
        </label>
        <label>
          <span>Volumen</span>
          <select value={filters.goalVolume} onChange={(event) => onChange({ ...filters, goalVolume: event.target.value })}>
            <option value="all">Todos</option>
            <option value="low">Bajo</option>
            <option value="medium">Medio</option>
            <option value="high">Alto</option>
            <option value="unknown">Sin marcador</option>
          </select>
        </label>
        <label>
          <span>Equilibrio</span>
          <select value={filters.equilibriumRange} onChange={(event) => onChange({ ...filters, equilibriumRange: event.target.value })}>
            <option value="all">Todos</option>
            <option value="0-30">0-30</option>
            <option value="31-60">31-60</option>
            <option value="61-80">61-80</option>
            <option value="81-100">81-100</option>
            <option value="unknown">Sin indice</option>
          </select>
        </label>
        <label>
          <span>Salida</span>
          <select value={outputMode} onChange={(event) => onOutputModeChange(event.target.value as AnalysisOutputMode)}>
            <option value="screen">Pantalla</option>
            <option value="voice">Lectura</option>
            <option value="both">Pantalla y lectura</option>
          </select>
        </label>
        <button className="filter-analyze" type="button" onClick={onAnalyzePair} disabled={!canAnalyzePair} title="Analizar el cruce seleccionado">
          <Play size={17} aria-hidden="true" />
          Analizar cruce
        </button>
        <button className="filter-show" type="button" onClick={onShowAnalysis} disabled={!canAnalyzePair} title="Mostrar el analisis segun la salida elegida">
          <Eye size={17} aria-hidden="true" />
          Mostrar analisis
        </button>
        <button className="filter-reset" type="button" onClick={onReset} title="Limpiar filtros">
          <RotateCcw size={17} aria-hidden="true" />
          Limpiar
        </button>
      </div>
      <p className="filter-hint">
        {hasSelectedTeams
          ? `Cruce seleccionado: ${pairMatches} partidos encontrados entre ambos equipos en las temporadas cargadas.`
          : isLoadingEquilibrium
            ? "Calculando indices de equilibrio para esta busqueda."
            : describeEquilibriumRange(filters.equilibriumRange)}
      </p>
    </section>
  );
}

function TeamOptions({ groups, teams, useGroups }: { groups: TeamOptionGroup[]; teams: string[]; useGroups: boolean }) {
  if (useGroups) {
    return (
      <>
        {groups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.teams.map((team) => (
              <option key={`${group.label}-${team}`} value={team}>
                {displayTeamName(team)}
              </option>
            ))}
          </optgroup>
        ))}
      </>
    );
  }
  return (
    <>
      {teams.map((team) => (
        <option key={team} value={team}>
          {displayTeamName(team)}
        </option>
      ))}
    </>
  );
}

function formatCompetitionType(value: string) {
  const labels: Record<string, string> = {
    domestic_league: "Liga domestica",
    domestic_cup: "Copa domestica",
    continental: "Continental",
    friendly: "Amistoso",
    unknown: "Sin tipo",
  };
  return labels[value] ?? value;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-ES").format(value);
}
