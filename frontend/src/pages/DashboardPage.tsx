import { Activity, AlertTriangle, List, Star, X, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { UnderSignalsChart } from "../charts/UnderSignalsChart";
import { EmptyState } from "../components/EmptyState";
import { MatchDetailPanel } from "../components/MatchDetailPanel";
import { MatchFilters, type AnalysisOutputMode, type TeamOptionGroup } from "../components/MatchFilters";
import { MetricCard } from "../components/MetricCard";
import { MatchTable } from "../components/MatchTable";
import { LiveTrackingPanel } from "../components/LiveTrackingPanel";
import { VoiceAssistantPanel } from "../components/VoiceAssistantPanel";
import { useBackendHealth } from "../hooks/useBackendHealth";
import { useDashboardData } from "../hooks/useDashboardData";
import { useLiveTracking } from "../hooks/useLiveTracking";
import { useMatchInsight } from "../hooks/useMatchInsight";
import { compareSofaScoreEvent, deleteFavorite, fetchFavorites, saveFavorite } from "../services/api";
import type { Competition, Favorite, MatchListItem, SofaScoreEventComparison } from "../types/api";
import { classifyUnderOver, emptyMatchFilters, filterMatches, findLatestMatchForTeamPair, isTeamPairMatch, teamsFromMatches } from "../utils/matchFilters";
import { buildSpokenSummary } from "../utils/voiceAssistant";

const DASHBOARD_HIGHLIGHTED_EVENTS_KEY = "within_dashboard_highlighted_sofascore_events";

type HighlightedSofaScoreEvent = {
  eventId: number;
  label: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  startTime: string;
  interestMatchId?: number | null;
};

export function DashboardPage() {
  const { data, isLoading, isLoadingAnalytics, error, hydrateAnalytics } = useDashboardData();
  const backendHealth = useBackendHealth();
  const matches = data?.matches ?? [];
  const [filters, setFilters] = useState(emptyMatchFilters);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [outputMode, setOutputMode] = useState<AnalysisOutputMode>("screen");
  const [pendingSpeechMatchId, setPendingSpeechMatchId] = useState<number | null>(null);
  const [isMatchListOpen, setIsMatchListOpen] = useState(false);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [favoriteTeamId, setFavoriteTeamId] = useState("");
  const [highlightedEvents, setHighlightedEvents] = useState<HighlightedSofaScoreEvent[]>(readHighlightedSofaScoreEvents);
  const [selectedLiveComparison, setSelectedLiveComparison] = useState<SofaScoreEventComparison | null>(null);
  const [isLiveComparisonLoading, setIsLiveComparisonLoading] = useState(false);
  const [liveComparisonMessage, setLiveComparisonMessage] = useState<string | null>(null);
  const filteredMatches = useMemo(() => filterMatches(matches, filters), [matches, filters]);
  const pairMatches = useMemo(() => {
    if (filters.homeTeam === "all" || filters.awayTeam === "all") {
      return [];
    }
    return matches.filter((match) => isTeamPairMatch(match, filters.homeTeam, filters.awayTeam));
  }, [filters.awayTeam, filters.homeTeam, matches]);
  const insight = useMatchInsight(selectedMatchId);
  const liveTracking = useLiveTracking();
  const hasDirectSummary = Boolean(insight.data?.analytics.three_season_summary);
  const directMatches = insight.data?.analytics.three_season_summary?.direct_matches ?? [];
  const hasPairScope = filters.homeTeam !== "all" && filters.awayTeam !== "all";
  const scopedMatches = hasPairScope ? pairMatches : filteredMatches;
  const chartScopeLabel = hasDirectSummary
    ? `Cruce seleccionado: ${directMatches.length} enfrentamientos directos`
    : hasPairScope
      ? `Cruce filtrado: ${scopedMatches.length} partidos entre equipos`
      : `Vista general: ${scopedMatches.length} partidos visibles`;
  const shouldCollapseMatchList = filteredMatches.length > 50;
  const isMatchTableCollapsed = shouldCollapseMatchList && !isMatchListOpen;
  const underSignals =
    hasDirectSummary
      ? directMatches.filter((match) => match.home_score != null && match.away_score != null && match.home_score + match.away_score < 2.5).length
      : scopedMatches.filter((match) => classifyUnderOver(match) === "under").length;
  const overSignals =
    hasDirectSummary
      ? directMatches.filter((match) => match.home_score != null && match.away_score != null && match.home_score + match.away_score > 2.5).length
      : scopedMatches.filter((match) => classifyUnderOver(match) === "over").length;
  const completedMatches = filteredMatches.filter((match) => match.status === "finished").length;
  const competitionTypes = useMemo(
    () => Array.from(new Set(matches.map((match) => match.competition_type ?? "unknown"))).sort(),
    [matches],
  );
  const teams = useMemo(() => teamsFromMatches(matches), [matches]);
  const teamOptionGroups = useMemo(() => buildTeamOptionGroups(matches, data?.competitions ?? []), [data?.competitions, matches]);
  const teamOptions = useMemo(() => {
    const byName = new Map((data?.teams ?? []).map((team) => [team.name, team]));
    return teams.map((teamName) => byName.get(teamName) ?? { id: teamNameToFallbackId(teamName), name: teamName });
  }, [data?.teams, teams]);

  function analyzeSelectedPair() {
    const match = findLatestMatchForTeamPair(matches, filters.homeTeam, filters.awayTeam);
    if (match) {
      setSelectedMatchId(match.id);
    }
  }

  function selectMatchAndSyncPair(matchId: number) {
    const match = matches.find((item) => item.id === matchId);
    if (match) {
      setFilters((current) => ({
        ...current,
        homeTeam: match.home_team,
        awayTeam: match.away_team,
      }));
    }
    setSelectedMatchId(matchId);
  }

  function selectMatchFromVoice(matchId: number) {
    selectMatchAndSyncPair(matchId);
  }

  function showSelectedAnalysis() {
    const match = findLatestMatchForTeamPair(matches, filters.homeTeam, filters.awayTeam);
    if (!match) {
      return;
    }
    setSelectedMatchId(match.id);
    if (outputMode === "voice" || outputMode === "both") {
      setPendingSpeechMatchId(match.id);
    }
    if (outputMode === "screen" || outputMode === "both") {
      window.requestAnimationFrame(() => document.getElementById("match-detail-analysis")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  function loadFavorites() {
    fetchFavorites("team")
      .then(setFavorites)
      .catch(() => setFavorites([]));
  }

  function addFavoriteTeam() {
    const team = teamOptions.find((item) => String(item.id) === favoriteTeamId);
    if (!team) {
      return;
    }
    saveFavorite({ entity_type: "team", entity_id: team.id, label: team.name })
      .then((favorite) => {
        setFavorites((current) => [...current.filter((item) => item.id !== favorite.id && item.entity_id !== favorite.entity_id), favorite]);
        setFavoriteTeamId("");
      })
      .catch(loadFavorites);
  }

  function removeFavoriteTeam(favoriteId: number) {
    deleteFavorite(favoriteId)
      .then(() => setFavorites((current) => current.filter((item) => item.id !== favoriteId)))
      .catch(loadFavorites);
  }

  function speakAnalysis(text: string) {
    if (!("speechSynthesis" in window)) {
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-ES";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }

  function reloadHighlightedEvents() {
    setHighlightedEvents(readHighlightedSofaScoreEvents());
  }

  function removeHighlightedEvent(eventId: number) {
    const next = highlightedEvents.filter((event) => event.eventId !== eventId);
    setHighlightedEvents(next);
    localStorage.setItem(DASHBOARD_HIGHLIGHTED_EVENTS_KEY, JSON.stringify(next));
    if (selectedLiveComparison?.event_id === eventId) {
      setSelectedLiveComparison(null);
    }
  }

  function analyzeHighlightedEvent(event: HighlightedSofaScoreEvent) {
    setIsLiveComparisonLoading(true);
    setLiveComparisonMessage(`Calculando comparativa de ${event.label}...`);
    compareSofaScoreEvent(event.eventId)
      .then((comparison) => {
        setSelectedLiveComparison(comparison);
        setLiveComparisonMessage(comparison.message);
      })
      .catch(() => {
        setLiveComparisonMessage("No se pudo calcular la comparativa del partido destacado. Revisa que el evento siga disponible en directo.");
      })
      .finally(() => setIsLiveComparisonLoading(false));
  }

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  useEffect(() => {
    loadFavorites();
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === DASHBOARD_HIGHLIGHTED_EVENTS_KEY) {
        reloadHighlightedEvents();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (filters.equilibriumRange !== "all") {
      hydrateAnalytics();
    }
  }, [filters.equilibriumRange, hydrateAnalytics]);

  useEffect(() => {
    if (!pendingSpeechMatchId || insight.isLoading || insight.data?.detail.id !== pendingSpeechMatchId) {
      return;
    }
    speakAnalysis(buildSpokenSummary(insight.data));
    setPendingSpeechMatchId(null);
  }, [insight.data, insight.isLoading, pendingSpeechMatchId]);

  useEffect(() => {
    if (filteredMatches.length === 0) {
      setSelectedMatchId(null);
      return;
    }
    const selectedMatch = matches.find((match) => match.id === selectedMatchId);
    const selectedIsCurrentPair =
      selectedMatch && filters.homeTeam !== "all" && filters.awayTeam !== "all"
        ? isTeamPairMatch(selectedMatch, filters.homeTeam, filters.awayTeam)
        : false;
    if (selectedMatchId && !selectedIsCurrentPair && !filteredMatches.some((match) => match.id === selectedMatchId)) {
      setSelectedMatchId(null);
    }
  }, [filteredMatches, filters.awayTeam, filters.homeTeam, matches, selectedMatchId]);

  return (
    <section className="dashboard-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Private statistical workspace</p>
          <h1>WITHIN Football Analytics</h1>
        </div>
        <div className={`status-pill backend-status ${backendHealth}`}>
          <span />
          {backendHealth === "updating"
            ? "Sistema actualizandose"
            : `Backend ${backendHealth === "connected" ? "conectado" : backendHealth === "checking" ? "comprobando" : "desconectado"}`}
        </div>
      </header>

      {error ? <EmptyState title="Backend no disponible" message={error} /> : null}

      <VoiceAssistantPanel
        matches={matches}
        isLoadingMatches={isLoading}
        selectedInsight={insight.data}
        onSelectMatch={selectMatchFromVoice}
        onReadAnalysis={() => undefined}
      />

      <LiveTrackingPanel
        settings={liveTracking.settings}
        matches={filteredMatches}
        selectedMatchId={selectedMatchId}
        isLoading={liveTracking.isLoading}
        isSaving={liveTracking.isSaving}
        error={liveTracking.error}
        onToggleGlobal={liveTracking.toggleGlobal}
        onToggleMatch={liveTracking.toggleMatch}
        onUpdateSettings={liveTracking.updateSettings}
      />

      <section className="panel dashboard-live-panel" aria-label="Partidos destacados live">
        <div className="panel-heading">
          <div>
            <h2>Partidos destacados live</h2>
            <p>Marca eventos desde Partidos en directo y analiza aqui la comparativa con historicos.</p>
          </div>
          <button className="panel-toggle" type="button" onClick={reloadHighlightedEvents}>
            <Activity size={17} aria-hidden="true" />
            Actualizar destacados
          </button>
        </div>
        {highlightedEvents.length ? (
          <div className="dashboard-live-list">
            {highlightedEvents.map((event) => (
              <article className="dashboard-live-item" key={event.eventId}>
                <div>
                  <span>{event.competition}</span>
                  <strong>{event.label}</strong>
                  <small>{formatTime(event.startTime)} {event.interestMatchId ? `- Forebet ID ${event.interestMatchId}` : ""}</small>
                </div>
                <button className="row-action" type="button" onClick={() => analyzeHighlightedEvent(event)} disabled={isLiveComparisonLoading}>
                  {isLiveComparisonLoading ? "Analizando" : "Analizar"}
                </button>
                <button className="row-action muted" type="button" onClick={() => removeHighlightedEvent(event.eventId)}>
                  Quitar
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="detail-state">Aun no hay partidos live destacados. Entra en Partidos en directo y pulsa Destacar dashboard en el evento que quieras analizar.</div>
        )}
        {liveComparisonMessage ? <p className="live-match-note">{liveComparisonMessage}</p> : null}
        {selectedLiveComparison ? <DashboardLiveComparisonPanel comparison={selectedLiveComparison} /> : null}
      </section>

      <section className="panel favorites-panel" aria-label="Favoritos">
        <div className="panel-heading">
          <div>
            <h2>Favoritos</h2>
            <p>Equipos guardados de forma persistente para futuras vistas.</p>
          </div>
        </div>
        <div className="favorites-controls">
          <select aria-label="Equipo favorito" value={favoriteTeamId} onChange={(event) => setFavoriteTeamId(event.target.value)}>
            <option value="">Selecciona equipo</option>
            {teamOptions.map((team) => (
              <option key={`${team.id}-${team.name}`} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <button className="filter-show" type="button" onClick={addFavoriteTeam} disabled={!favoriteTeamId}>
            <Star size={16} aria-hidden="true" />
            Guardar favorito
          </button>
        </div>
        <div className="favorites-list">
          {favorites.length > 0 ? (
            favorites.map((favorite) => (
              <span className="favorite-chip" key={favorite.id}>
                {favorite.label}
                <button type="button" onClick={() => removeFavoriteTeam(favorite.id)} title={`Quitar ${favorite.label}`}>
                  <X size={14} aria-hidden="true" />
                </button>
              </span>
            ))
          ) : (
            <span className="favorites-empty">Todavia no hay equipos favoritos.</span>
          )}
        </div>
      </section>

      <MatchFilters
        filters={filters}
        teams={teams}
        teamGroups={teamOptionGroups}
        competitionTypes={competitionTypes}
        totalMatches={matches.length}
        visibleMatches={filteredMatches.length}
        pairMatches={pairMatches.length}
        outputMode={outputMode}
        isLoadingEquilibrium={isLoadingAnalytics}
        onChange={setFilters}
        onOutputModeChange={setOutputMode}
        onAnalyzePair={analyzeSelectedPair}
        onShowAnalysis={showSelectedAnalysis}
        onReset={() => setFilters(emptyMatchFilters)}
      />

      <div className="metrics-grid" aria-label="Dashboard metrics">
        <MetricCard
          icon={Activity}
          label="Partidos visibles"
          value={isLoading ? "..." : formatNumber(filteredMatches.length)}
          detail={`${formatNumber(completedMatches)} finalizados de ${formatNumber(matches.length)} cargados`}
        />
        <MetricCard icon={Target} label="Senales Under" value={isLoading ? "..." : formatNumber(underSignals)} detail={hasDirectSummary || hasPairScope ? "Cruce seleccionado: menos de 2.5" : "Menos de 2.5 goles"} />
        <MetricCard icon={Target} label="Senales Over" value={isLoading ? "..." : formatNumber(overSignals)} detail={hasDirectSummary || hasPairScope ? "Cruce seleccionado: mas de 2.5" : "Mas de 2.5 goles"} />
        <MetricCard icon={AlertTriangle} label="Alertas alineacion" value="0" detail="Pendiente fase 8" />
      </div>

      <div className="content-grid">
        <section className="panel match-panel">
          <div className="panel-heading">
            <div>
              <h2>Partidos analizados</h2>
              <p>{isMatchTableCollapsed ? "Lista plegada para evitar ruido visual." : "Vista operativa para revisar senales iniciales."}</p>
            </div>
            {shouldCollapseMatchList ? (
              <button className="panel-toggle" type="button" onClick={() => setIsMatchListOpen((current) => !current)}>
                <List size={17} aria-hidden="true" />
                {isMatchListOpen ? "Ocultar lista" : `Mostrar lista (${formatNumber(filteredMatches.length)})`}
              </button>
            ) : null}
          </div>
          <MatchTable
            matches={filteredMatches}
            totalMatches={matches.length}
            isLoading={isLoading}
            selectedMatchId={selectedMatchId}
            isCollapsed={isMatchTableCollapsed}
            onSelectMatch={setSelectedMatchId}
          />
        </section>

        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h2>Lectura rapida</h2>
              <p>Distribucion provisional segun datos disponibles.</p>
            </div>
          </div>
          <UnderSignalsChart matches={scopedMatches} directMatches={directMatches} useDirectScope={hasDirectSummary} scopeLabel={chartScopeLabel} />
        </section>
      </div>

      <section className="panel detail-panel" id="match-detail-analysis">
        <div className="panel-heading">
          <div>
            <h2>Detalle del partido</h2>
            <p>Indice, Forebet, clasificacion previa y distribucion temporal.</p>
          </div>
        </div>
        <MatchDetailPanel insight={insight.data} isLoading={insight.isLoading} error={insight.error} />
      </section>
    </section>
  );
}

function teamNameToFallbackId(teamName: string) {
  return Array.from(teamName).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function buildTeamOptionGroups(matches: MatchListItem[], competitions: Competition[]): TeamOptionGroup[] {
  const competitionCountries = new Map(competitions.map((competition) => [normalizeKey(competition.name), competition.country?.trim() || ""]));
  const groupedTeams = new Map<string, Set<string>>();

  for (const match of matches) {
    const competition = match.competition?.trim();
    const country = competitionCountries.get(normalizeKey(competition ?? "")) ?? "";
    const label = competition || country || "Sin competicion";
    if (!groupedTeams.has(label)) {
      groupedTeams.set(label, new Set());
    }
    groupedTeams.get(label)?.add(match.home_team);
    groupedTeams.get(label)?.add(match.away_team);
  }

  return Array.from(groupedTeams.entries())
    .map(([label, teamSet]) => ({
      label,
      teams: Array.from(teamSet).sort((a, b) => displaySortName(a).localeCompare(displaySortName(b), "es")),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function displaySortName(value: string) {
  return value
    .replace(/\b(cf|fc|cd|rcd|sd|ud|ath)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-ES").format(value);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function readHighlightedSofaScoreEvents() {
  try {
    const raw = localStorage.getItem(DASHBOARD_HIGHLIGHTED_EVENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as HighlightedSofaScoreEvent[]) : [];
    return Array.isArray(parsed) ? parsed.filter((event) => Number.isFinite(event.eventId)) : [];
  } catch {
    return [];
  }
}

function DashboardLiveComparisonPanel({ comparison }: { comparison: SofaScoreEventComparison }) {
  return (
    <article className="live-comparison-panel dashboard-live-comparison">
      <div className="live-match-heading">
        <div>
          <span>Comparativa del destacado</span>
          <strong>{comparison.event ? `${comparison.event.home_team} vs ${comparison.event.away_team}` : `Evento ${comparison.event_id}`}</strong>
        </div>
        <div>
          <span>Partido base</span>
          <strong>{comparison.match_id ? `ID ${comparison.match_id}` : "Sin cruce historico"}</strong>
        </div>
      </div>
      <div className="live-comparison-grid">
        {comparison.home ? <DashboardTeamComparisonBlock item={comparison.home} /> : null}
        {comparison.away ? <DashboardTeamComparisonBlock item={comparison.away} /> : null}
        {comparison.competition ? (
          <div className="live-signal neutral">
            <span>{comparison.competition.competition}</span>
            <strong>{comparison.competition.goals_per_match.toFixed(2)} goles/partido</strong>
            <small>
              {comparison.competition.total_goals} goles en {comparison.competition.matches} partidos terminados de la competicion.
            </small>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function DashboardTeamComparisonBlock({ item }: { item: NonNullable<SofaScoreEventComparison["home"]> }) {
  return (
    <div className="live-team-comparison">
      <span>{item.team}</span>
      <strong>
        {item.goals_for_average.toFixed(2)} GF / {item.goals_against_average.toFixed(2)} GC
      </strong>
      <small>
        {item.goals_for} marcados y {item.goals_against} recibidos en {item.matches} partidos.
      </small>
      {item.interval_rows.length ? (
        <div className="live-interval-strip">
          {item.interval_rows.map((row) => (
            <span key={`${row.interval_start}-${row.interval_end}`}>
              {row.interval_start}-{row.interval_end}: {row.goals_scored}
            </span>
          ))}
        </div>
      ) : (
        <small>Sin minutos de goles importados para intervalos.</small>
      )}
    </div>
  );
}
