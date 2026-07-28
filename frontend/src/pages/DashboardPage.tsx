import { Activity, AlertTriangle, List, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { UnderSignalsChart } from "../charts/UnderSignalsChart";
import { EmptyState } from "../components/EmptyState";
import { MatchDetailPanel } from "../components/MatchDetailPanel";
import { MatchFilters, type AnalysisOutputMode } from "../components/MatchFilters";
import { MetricCard } from "../components/MetricCard";
import { MatchTable } from "../components/MatchTable";
import { LiveTrackingPanel } from "../components/LiveTrackingPanel";
import { VoiceAssistantPanel } from "../components/VoiceAssistantPanel";
import { useBackendHealth } from "../hooks/useBackendHealth";
import { useDashboardData } from "../hooks/useDashboardData";
import { useLiveTracking } from "../hooks/useLiveTracking";
import { useMatchInsight } from "../hooks/useMatchInsight";
import { classifyUnderOver, emptyMatchFilters, filterMatches, findLatestMatchForTeamPair, isTeamPairMatch, teamsFromMatches } from "../utils/matchFilters";
import { buildSpokenSummary } from "../utils/voiceAssistant";

export function DashboardPage() {
  const { data, isLoading, isLoadingAnalytics, error, hydrateAnalytics } = useDashboardData();
  const backendHealth = useBackendHealth();
  const matches = data?.matches ?? [];
  const [filters, setFilters] = useState(emptyMatchFilters);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [outputMode, setOutputMode] = useState<AnalysisOutputMode>("screen");
  const [pendingSpeechMatchId, setPendingSpeechMatchId] = useState<number | null>(null);
  const [isMatchListOpen, setIsMatchListOpen] = useState(false);
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

  function revealAnalysisPanels() {
    window.requestAnimationFrame(() => document.getElementById("match-detail-analysis")?.scrollIntoView({ behavior: "smooth", block: "start" }));
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

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
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
        onReadAnalysis={revealAnalysisPanels}
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

      <MatchFilters
        filters={filters}
        teams={teams}
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
        <MetricCard icon={Activity} label="Partidos visibles" value={isLoading ? "..." : filteredMatches.length.toString()} detail={`${completedMatches} finalizados`} />
        <MetricCard icon={Target} label="Senales Under" value={isLoading ? "..." : underSignals.toString()} detail={hasDirectSummary || hasPairScope ? "Cruce seleccionado: menos de 2.5" : "Menos de 2.5 goles"} />
        <MetricCard icon={Target} label="Senales Over" value={isLoading ? "..." : overSignals.toString()} detail={hasDirectSummary || hasPairScope ? "Cruce seleccionado: mas de 2.5" : "Mas de 2.5 goles"} />
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
                {isMatchListOpen ? "Ocultar lista" : `Mostrar lista (${filteredMatches.length})`}
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
