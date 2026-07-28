import { BarChart3, Calculator, ChevronDown, ChevronRight, Download, Gauge, Info, Percent, ShieldCheck, TrendingDown } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { GoalTimingChart } from "../charts/GoalTimingChart";
import { fetchMatchGoalMoments } from "../services/api";
import type { DirectMatchResult, GoalMoment, MatchInsightData, TeamReferenceStanding } from "../types/api";
import { buildMatchReport, downloadTextFile, matchReportFileName } from "../utils/matchReport";
import { displaySpokenTeamName } from "../utils/voiceAssistant";

type MatchDetailPanelProps = {
  insight: MatchInsightData | null;
  isLoading: boolean;
  error: string | null;
};

export function MatchDetailPanel({ insight, isLoading, error }: MatchDetailPanelProps) {
  const [isIndexCalculationOpen, setIsIndexCalculationOpen] = useState(false);
  const [isScoreRangeOpen, setIsScoreRangeOpen] = useState(false);

  if (isLoading) {
    return <div className="detail-state">Cargando detalle del partido...</div>;
  }

  if (error) {
    return <div className="detail-state">{error}</div>;
  }

  if (!insight) {
    return <div className="detail-state">Selecciona un partido para ver su analisis completo.</div>;
  }

  const { detail, analytics, homeGoalTiming, awayGoalTiming } = insight;
  const latestForebet = detail.forebet_predictions[0] ?? analytics.latest_forebet;
  const homeStanding = detail.standings.find((standing) => standing.team_id === detail.home_team.id);
  const awayStanding = detail.standings.find((standing) => standing.team_id === detail.away_team.id);
  const scoreRange = isRecord(analytics.inputs.score_range) ? analytics.inputs.score_range : null;
  const exportReport = () => downloadTextFile(matchReportFileName(insight), buildMatchReport(insight));

  return (
    <div className="detail-stack">
      <section className="detail-hero">
        <div>
          <p className="eyebrow">{detail.competition.name}</p>
          <h2>
            {detail.home_team.name} vs {detail.away_team.name}
          </h2>
          <p>{detail.stadium ? `${detail.stadium.name}, ${detail.stadium.city ?? detail.stadium.country ?? ""}` : "Estadio sin asignar"}</p>
        </div>
        <div className="score-box">
          <span>{formatDate(detail.match_date)}</span>
          <strong>{formatScore(detail.home_score, detail.away_score)}</strong>
          <small>{detail.status}</small>
        </div>
      </section>

      <div className="analysis-grid">
        <div className="analysis-card featured">
          <div className="analysis-icon">
            <TrendingDown size={18} aria-hidden="true" />
          </div>
          <span>Indice de equilibrio</span>
          <strong>{analytics.closed_midtable_index == null ? "Sin datos" : `${analytics.closed_midtable_index}/100`}</strong>
          <small>Fiabilidad: {analytics.reliability}</small>
        </div>
        <div className="analysis-card">
          <div className="analysis-icon">
            <Percent size={18} aria-hidden="true" />
          </div>
          <span>Forebet</span>
          <strong>{latestForebet?.prediction ?? "Sin captura"}</strong>
          <small>{formatForebet(latestForebet)}</small>
        </div>
        <div className="analysis-card">
          <div className="analysis-icon">
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          <span>Clasificacion previa</span>
          <strong>{formatPositions(homeStanding?.position, awayStanding?.position)}</strong>
          <small>Tabla anterior al partido</small>
        </div>
        <button
          className="analysis-card score-range-card"
          type="button"
          onClick={() => setIsScoreRangeOpen((current) => !current)}
          aria-expanded={isScoreRangeOpen}
          aria-controls="score-range-panel"
          disabled={!scoreRange}
          title="Ver calculo del rango de marcador"
        >
          <div className="analysis-icon">
            <Calculator size={18} aria-hidden="true" />
          </div>
          <span>Rango de resultado</span>
          <strong>{formatScoreRangeSummary(scoreRange)}</strong>
          <small>Pulsa para ver el calculo</small>
        </button>
      </div>

      {scoreRange && isScoreRangeOpen ? <ScoreRangePanel scoreRange={scoreRange} /> : null}

      <section className="detail-block">
        <div className="detail-block-heading">
          <div className="detail-title">
            <Gauge size={18} aria-hidden="true" />
            <h3>Factores del indice</h3>
          </div>
          <button
            className="report-button"
            type="button"
            onClick={() => setIsIndexCalculationOpen((current) => !current)}
            aria-expanded={isIndexCalculationOpen}
            aria-controls="index-calculation-panel"
            title="Ver como se ha calculado el indice"
          >
            {isIndexCalculationOpen ? <ChevronDown size={17} aria-hidden="true" /> : <ChevronRight size={17} aria-hidden="true" />}
            Ver calculo
          </button>
        </div>
        <div className="parameter-grid">
          <div>
            <span>Forma {detail.home_team.name}</span>
            <strong>{formatRecentForm(analytics.inputs.home_recent_form)}</strong>
            <small>Ultimos partidos anteriores</small>
          </div>
          <div>
            <span>Forma {detail.away_team.name}</span>
            <strong>{formatRecentForm(analytics.inputs.away_recent_form)}</strong>
            <small>Ultimos partidos anteriores</small>
          </div>
          <div>
            <span>Favorito y campo</span>
            <strong>{formatFactor(analytics.inputs.venue_favorite_factor)}</strong>
            <small>{String(analytics.inputs.favorite_context ?? "Sin contexto de favorito")}</small>
          </div>
          <div>
            <span>Lesiones</span>
            <strong>{analytics.inputs.injury_data_status === "missing" ? "Sin dato" : "Incluidas"}</strong>
            <small>{formatInjuryIndex(analytics.inputs)}</small>
          </div>
        </div>
        {isIndexCalculationOpen ? <IndexCalculationPanel analytics={analytics} /> : null}
      </section>

      <section className="detail-block">
        <div className="detail-block-heading">
          <div className="detail-title">
            <Info size={18} aria-hidden="true" />
            <h3>Explicacion del analisis</h3>
          </div>
          <button className="report-button" type="button" onClick={exportReport} title="Exportar informe del partido">
            <Download size={17} aria-hidden="true" />
            Exportar informe
          </button>
        </div>
        <p>{analytics.explanation}</p>
      </section>

      <section className="detail-block">
        <div className="detail-title">
          <Gauge size={18} aria-hidden="true" />
          <h3>Parametros de goles</h3>
        </div>
        {analytics.goal_parameter_profile ? (
          <>
            <div className="parameter-grid">
              <div>
                <span>Competicion</span>
                <strong>{formatCompetitionType(analytics.goal_parameter_profile.competition_type)}</strong>
                <small>{analytics.goal_parameter_profile.is_friendly ? "Amistoso, peso reducido" : "Oficial, peso completo"}</small>
              </div>
              <div>
                <span>Volumen</span>
                <strong>{analytics.goal_parameter_profile.goal_volume_bucket}</strong>
                <small>{analytics.goal_parameter_profile.under_over_profile}</small>
              </div>
              <div>
                <span>Minutos</span>
                <strong>{formatGoalMinuteSignal(analytics.goal_parameter_profile.late_goal_signal)}</strong>
                <small>{formatGoalMinuteSignal(analytics.goal_parameter_profile.early_goal_signal)}</small>
              </div>
              <div>
                <span>Muestra</span>
                <strong>{analytics.goal_parameter_profile.sample_size}</strong>
                <small>Fiabilidad: {analytics.goal_parameter_profile.reliability}</small>
              </div>
            </div>
            <p>{analytics.goal_parameter_profile.explanation}</p>
          </>
        ) : (
          <p>Sin parametros de goles disponibles para este partido.</p>
        )}
      </section>

      <section className="detail-block">
        <div className="detail-title">
          <BarChart3 size={18} aria-hidden="true" />
          <h3>Enfrentamientos directos</h3>
        </div>
        {analytics.three_season_summary ? (
          <>
            <p className={analytics.three_season_summary.matches < 3 ? "sample-warning" : "sample-ok"}>
              {formatHeadToHeadSampleNotice(analytics.three_season_summary.matches)}
            </p>
            <div className="parameter-grid">
              <div>
                <span>Temporadas</span>
                <strong>{analytics.three_season_summary.seasons.join(", ")}</strong>
                <small>{analytics.three_season_summary.matches} partidos</small>
              </div>
              <div>
                <span>Goles totales</span>
                <strong>{analytics.three_season_summary.total_goals}</strong>
                <small>{analytics.three_season_summary.goals_per_match} por partido</small>
              </div>
              <div>
                <span>Dispersion goles</span>
                <strong>{formatGoalDispersion(analytics.three_season_summary)}</strong>
                <small>Varianza / desviacion tipica</small>
              </div>
              <div>
                <span>Under / Over 2.5</span>
                <strong>{formatUnderOverDirect(analytics.three_season_summary)}</strong>
                <small>Solo enfrentamientos directos</small>
              </div>
              <div>
                <span>{detail.home_team.name}</span>
                <strong>{formatReferenceStanding(analytics.three_season_summary.home_standing)}</strong>
                <small>{formatGoalDifference(analytics.three_season_summary.home_standing)}</small>
              </div>
              <div>
                <span>{detail.away_team.name}</span>
                <strong>{formatReferenceStanding(analytics.three_season_summary.away_standing)}</strong>
                <small>{formatGoalDifference(analytics.three_season_summary.away_standing)}</small>
              </div>
            </div>
            <DirectResultsList matches={analytics.three_season_summary.direct_matches ?? []} />
            <p>{analytics.three_season_summary.explanation}</p>
          </>
        ) : (
          <p>Sin resumen historico disponible.</p>
        )}
      </section>

      <section className="detail-block">
        <div className="detail-title">
          <BarChart3 size={18} aria-hidden="true" />
          <h3>Goles por intervalo</h3>
        </div>
        <GoalTimingChart
          homeTeam={detail.home_team.name}
          awayTeam={detail.away_team.name}
          homeRows={homeGoalTiming}
          awayRows={awayGoalTiming}
          context={insight.goalTimingContext}
        />
      </section>

      <section className="detail-block">
        <div className="detail-title">
          <ShieldCheck size={18} aria-hidden="true" />
          <h3>Tabla antes del partido</h3>
        </div>
        <div className="standings-mini">
          {detail.standings.length === 0 ? (
            <p>Sin clasificacion previa importada.</p>
          ) : (
            detail.standings.map((standing) => (
              <div key={standing.team_id}>
                <strong>{standing.team}</strong>
                <span>Pos. {standing.position}</span>
                <span>{standing.points} pts</span>
                <span>DG {standing.goal_difference}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function IndexCalculationPanel({ analytics }: { analytics: MatchInsightData["analytics"] }) {
  const weights = isRecord(analytics.inputs.configured_weights) ? analytics.inputs.configured_weights : {};
  const factorRows = [
    {
      label: "Centralidad en la tabla",
      value: formatPair(analytics.inputs.home_relative_position, analytics.inputs.away_relative_position),
      weight: weights.centrality,
      note: "Mide si ambos equipos estan en una zona parecida de la clasificacion.",
    },
    {
      label: "Diferencia de posiciones",
      value: formatUnknown(analytics.inputs.classification_position_gap),
      weight: weights.classification_distance,
      note: "Aqui cuenta la resta directa entre posiciones.",
    },
    {
      label: "Diferencia goleadora media",
      value: formatPair(analytics.inputs.home_goal_balance, analytics.inputs.away_goal_balance),
      weight: weights.goal_balance,
      note: "Goles a favor menos goles en contra dividido por partidos jugados. Si es negativo, encaja mas de lo que marca.",
    },
    {
      label: "Actividad goleadora",
      value: formatPair(analytics.inputs.home_goal_activity, analytics.inputs.away_goal_activity),
      weight: weights.goal_activity,
      note: "Mide volumen de goles a favor y en contra por partido.",
    },
    {
      label: "Forma reciente",
      value: formatUnknown(analytics.inputs.recent_form_similarity_factor),
      weight: weights.form,
      note: "Compara puntos recientes antes del partido.",
    },
    {
      label: "Localia y favorito",
      value: formatUnknown(analytics.inputs.venue_favorite_factor),
      weight: weights.venue,
      note: String(analytics.inputs.favorite_context ?? "Sin contexto de favorito."),
    },
    {
      label: "Fiabilidad",
      value: formatUnknown(analytics.reliability),
      weight: weights.reliability,
      note: "Ajusta el indice segun el volumen de muestra disponible.",
    },
  ];

  return (
    <div className="index-calculation" id="index-calculation-panel">
      <div className="index-calculation-heading">
        <Calculator size={18} aria-hidden="true" />
        <div>
          <span>Formula provisional</span>
          <strong>{analytics.closed_midtable_index == null ? "Sin indice calculado" : `${analytics.closed_midtable_index}/100`}</strong>
        </div>
      </div>
      <p>
        El indice se mueve de 0 a 100. Cuanto mas alto, mas equilibrado se considera el partido. Combina los factores de abajo
        aplicando los pesos configurados.
      </p>
      <div className="index-formula">Indice = suma ponderada de factores de equilibrio x 100</div>
      <div className="index-calculation-table">
        <table>
          <thead>
            <tr>
              <th>Factor</th>
              <th>Dato usado</th>
              <th>Peso</th>
              <th>Lectura</th>
            </tr>
          </thead>
          <tbody>
            {factorRows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td>{row.value}</td>
                <td>{formatWeight(row.weight)}</td>
                <td>{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>{analytics.explanation}</p>
    </div>
  );
}

function ScoreRangePanel({ scoreRange }: { scoreRange: Record<string, unknown> }) {
  const home = isRecord(scoreRange.home) ? scoreRange.home : {};
  const away = isRecord(scoreRange.away) ? scoreRange.away : {};
  const possibleScores = Array.isArray(scoreRange.possible_scores) ? scoreRange.possible_scores.map(String) : [];

  return (
    <section className="detail-block score-range-panel" id="score-range-panel">
      <div className="detail-title">
        <Calculator size={18} aria-hidden="true" />
        <h3>Calculo del rango de resultado</h3>
      </div>
      <p>{String(scoreRange.explanation ?? "Rango calculado con goles marcados y recibidos por partido.")}</p>
      <p className="sample-ok">{String(scoreRange.reference_reason ?? "Referencia estadistica disponible.")}</p>
      <div className="score-range-grid">
        <ScoreRangeTeamCard label="Equipo local" values={home} expected={scoreRange.home_expected_goals} range={scoreRange.home_integer_range} />
        <ScoreRangeTeamCard label="Equipo visitante" values={away} expected={scoreRange.away_expected_goals} range={scoreRange.away_integer_range} />
      </div>
      <div className="index-formula">{formatScoreRangeSummary(scoreRange)}</div>
      <div className="score-range-scores">
        <span>Marcadores dentro del rango</span>
        <strong>{possibleScores.length > 0 ? possibleScores.join(" | ") : "Sin rango disponible"}</strong>
      </div>
    </section>
  );
}

function ScoreRangeTeamCard({
  label,
  values,
  expected,
  range,
}: {
  label: string;
  values: Record<string, unknown>;
  expected: unknown;
  range: unknown;
}) {
  const integerRange = isRecord(range) ? range : {};
  return (
    <div className="score-range-team-card">
      <span>{label}</span>
      <strong>{String(values.team ?? "Equipo")}</strong>
      <dl>
        <div>
          <dt>Goles marcados</dt>
          <dd>
            {formatUnknown(values.goals_for)} / {formatUnknown(values.played)} = {formatUnknown(values.scored_per_match)}
          </dd>
        </div>
        <div>
          <dt>Goles recibidos</dt>
          <dd>
            {formatUnknown(values.goals_against)} / {formatUnknown(values.played)} = {formatUnknown(values.conceded_per_match)}
          </dd>
        </div>
        <div>
          <dt>Media cruzada</dt>
          <dd>{formatUnknown(expected)}</dd>
        </div>
        <div>
          <dt>Rango entero</dt>
          <dd>
            {formatUnknown(integerRange.min)} - {formatUnknown(integerRange.max)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function DirectResultsList({ matches }: { matches: DirectMatchResult[] }) {
  const [selectedMatch, setSelectedMatch] = useState<DirectMatchResult | null>(null);
  const [goalMoments, setGoalMoments] = useState<GoalMoment[]>([]);
  const [isLoadingMoments, setIsLoadingMoments] = useState(false);
  const [momentsError, setMomentsError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedMatch) {
      setGoalMoments([]);
      setMomentsError(null);
      return;
    }
    let isMounted = true;
    setIsLoadingMoments(true);
    setMomentsError(null);
    fetchMatchGoalMoments(selectedMatch.id)
      .then((moments) => {
        if (isMounted) {
          setGoalMoments(moments);
          setIsLoadingMoments(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setMomentsError("No se pudieron cargar los minutos de gol de este partido.");
          setGoalMoments([]);
          setIsLoadingMoments(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [selectedMatch]);

  if (matches.length === 0) {
    return <p>No hay resultados directos importados entre estos dos equipos.</p>;
  }
  const highlights = directMatchHighlights(matches);
  const groupedMatches = groupDirectMatchesBySeason(matches);

  return (
    <>
      <div className="direct-results-highlights">
        {highlights.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.matches.map(formatDirectMatchShort).join(" · ")}</strong>
          </div>
        ))}
      </div>
      <div className="direct-results-table" aria-label="Resultados directos encontrados">
        <div className="direct-results-table-title">
          <span>Cuadro de resultados por temporada</span>
          <strong>{matches.length} partidos</strong>
        </div>
        <table>
          <thead>
            <tr>
              <th>Temporada</th>
              <th>Fecha</th>
              <th>Local</th>
              <th>Resultado</th>
              <th>Visitante</th>
              <th>Localia</th>
            </tr>
          </thead>
          <tbody>
            {groupedMatches.map(([season, seasonMatches]) => (
              <Fragment key={season}>
                <tr className="season-row">
                  <td colSpan={6}>{season}</td>
                </tr>
                {seasonMatches.map((match) => (
                  <tr className={selectedMatch?.id === match.id ? "selected-row" : ""} key={match.id}>
                    <td>{match.season}</td>
                    <td>{formatDateOnly(match.match_date)}</td>
                    <td>{displaySpokenTeamName(match.home_team)}</td>
                    <td>
                      <button className="score-pill score-pill-button" type="button" onClick={() => setSelectedMatch(match)}>
                        {formatScore(match.home_score, match.away_score)}
                      </button>
                    </td>
                    <td>{displaySpokenTeamName(match.away_team)}</td>
                    <td>{formatVenueContext(match.venue_context)}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {selectedMatch ? (
        <GoalMomentsPanel
          error={momentsError}
          isLoading={isLoadingMoments}
          match={selectedMatch}
          moments={goalMoments}
        />
      ) : null}
    </>
  );
}

function GoalMomentsPanel({
  error,
  isLoading,
  match,
  moments,
}: {
  error: string | null;
  isLoading: boolean;
  match: DirectMatchResult;
  moments: GoalMoment[];
}) {
  const grouped = groupGoalMomentsByTeam(moments);
  return (
    <div className="goal-moments-panel">
      <div className="direct-results-table-title">
        <span>Goles por minuto</span>
        <strong>{formatDirectMatchShort(match)}</strong>
      </div>
      {isLoading ? <p>Cargando minutos de gol...</p> : null}
      {error ? <p className="sample-warning">{error}</p> : null}
      {!isLoading && !error && moments.length === 0 ? <p>No hay minutos de gol importados para este resultado.</p> : null}
      {!isLoading && !error && moments.length > 0 ? (
        <div className="goal-moments-grid">
          {grouped.map(([team, rows]) => (
            <div key={team}>
              <span>{displaySpokenTeamName(team)}</span>
              <strong>{rows.map(formatGoalMoment).join(", ")}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function groupDirectMatchesBySeason(matches: DirectMatchResult[]) {
  const grouped = new Map<string, DirectMatchResult[]>();
  for (const match of matches) {
    const rows = grouped.get(match.season) ?? [];
    rows.push(match);
    grouped.set(match.season, rows);
  }
  return Array.from(grouped.entries());
}

function groupGoalMomentsByTeam(moments: GoalMoment[]) {
  const grouped = new Map<string, GoalMoment[]>();
  for (const moment of moments) {
    const rows = grouped.get(moment.team) ?? [];
    rows.push(moment);
    grouped.set(moment.team, rows);
  }
  return Array.from(grouped.entries());
}

function formatGoalMoment(moment: GoalMoment) {
  return `${moment.minute}' (${formatGoalMomentInterval(moment)})`;
}

function formatGoalMomentInterval(moment: GoalMoment) {
  if (moment.interval_start === 30 && moment.interval_end === 45) {
    return "30-descanso";
  }
  if (moment.interval_start === 75 && moment.interval_end === 90) {
    return "75-final";
  }
  return `${moment.interval_start}-${moment.interval_end}`;
}

function directMatchHighlights(matches: DirectMatchResult[]) {
  const latest = [...matches].sort((first, second) => new Date(second.match_date).getTime() - new Date(first.match_date).getTime())[0];
  const validMatches = matches.filter((match) => match.home_score != null && match.away_score != null);
  const maxGoals = Math.max(...validMatches.map(totalGoals), 0);
  const maxGoalMatches = validMatches.filter((match) => totalGoals(match) === maxGoals);
  const maxGap = Math.max(...validMatches.map(goalDifference), 0);
  const maxGapMatches = validMatches.filter((match) => goalDifference(match) === maxGap);
  const sameGoalAndGapMatches = sameMatchSet(maxGoalMatches, maxGapMatches);
  return [
    latest ? { label: "Ultimo resultado", matches: [latest] } : null,
    sameGoalAndGapMatches && maxGoalMatches.length > 0 ? { label: "Mas goles y mayor diferencia", matches: maxGoalMatches } : null,
    !sameGoalAndGapMatches && maxGoalMatches.length > 0 ? { label: "Mas goles", matches: maxGoalMatches } : null,
    !sameGoalAndGapMatches && maxGapMatches.length > 0 ? { label: "Mayor diferencia", matches: maxGapMatches } : null,
  ].filter((item): item is { label: string; matches: DirectMatchResult[] } => Boolean(item));
}

function formatDirectMatchShort(match: DirectMatchResult) {
  return `${formatDateOnly(match.match_date)} ${displaySpokenTeamName(match.home_team)} ${formatScore(match.home_score, match.away_score)} ${displaySpokenTeamName(match.away_team)}`;
}

function totalGoals(match: DirectMatchResult) {
  return (match.home_score ?? 0) + (match.away_score ?? 0);
}

function goalDifference(match: DirectMatchResult) {
  return Math.abs((match.home_score ?? 0) - (match.away_score ?? 0));
}

function sameMatchSet(first: DirectMatchResult[], second: DirectMatchResult[]) {
  if (first.length !== second.length) {
    return false;
  }
  const firstIds = first.map((match) => match.id).sort((a, b) => a - b);
  const secondIds = second.map((match) => match.id).sort((a, b) => a - b);
  return firstIds.every((id, index) => id === secondIds[index]);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatScore(home?: number | null, away?: number | null) {
  if (home == null || away == null) {
    return "-";
  }
  return `${home}-${away}`;
}

function formatVenueContext(value: string) {
  return value === "same_home" ? "mismo orden local/visitante" : "localia invertida";
}

function formatForebet(prediction: MatchInsightData["detail"]["forebet_predictions"][number] | null | undefined) {
  if (!prediction) {
    return "Pendiente de importar";
  }
  const expectedGoals = prediction.expected_goals ?? "n/d";
  const under = prediction.over_under_prediction ?? "sin under/over";
  return `xG ${expectedGoals} - ${under}`;
}

function formatPositions(home?: number, away?: number) {
  if (!home || !away) {
    return "Sin tabla";
  }
  return `${home} / ${away}`;
}

function formatCompetitionType(value: string) {
  const labels: Record<string, string> = {
    domestic_league: "Liga domestica",
    domestic_cup: "Copa domestica",
    continental: "Continental",
    friendly: "Amistoso",
  };
  return labels[value] ?? value;
}

function formatGoalMinuteSignal(value: string) {
  if (value.toLowerCase().includes("sin datos de minutos")) {
    return "Pendiente de minutos de gol";
  }
  return value;
}

function formatReferenceStanding(standing?: TeamReferenceStanding | null) {
  if (!standing) {
    return "Sin tabla";
  }
  return `Pos. ${standing.position}`;
}

function formatGoalDifference(standing?: TeamReferenceStanding | null) {
  if (!standing) {
    return "Sin diferencia";
  }
  return `GF ${standing.goals_for} / GC ${standing.goals_against} / DG ${standing.goal_difference}`;
}

function formatGoalDispersion(summary: NonNullable<MatchInsightData["analytics"]["three_season_summary"]>) {
  return `${summary.goals_variance ?? 0} / ${summary.goals_standard_deviation ?? 0}`;
}

function formatUnderOverDirect(summary: NonNullable<MatchInsightData["analytics"]["three_season_summary"]>) {
  return `${summary.under_25_matches ?? 0} / ${summary.over_25_matches ?? 0}`;
}

function formatHeadToHeadSampleNotice(matches: number) {
  if (matches >= 3) {
    return "Muestra directa suficiente: hay al menos tres enfrentamientos disponibles.";
  }
  if (matches === 2) {
    return "Aviso: no tenemos tres enfrentamientos directos para este cruce; solo hay dos.";
  }
  if (matches === 1) {
    return "Aviso: no tenemos tres enfrentamientos directos para este cruce; solo hay uno.";
  }
  return "Aviso: no tenemos enfrentamientos directos para este cruce en las temporadas cargadas.";
}

function formatRecentForm(value: unknown) {
  if (!isRecentForm(value) || value.matches === 0) {
    return "Sin muestra";
  }
  return `${value.points} pts / ${value.matches} partidos`;
}

function formatFactor(value: unknown) {
  return typeof value === "number" ? value.toFixed(2) : "Sin dato";
}

function formatInjuryIndex(inputs: Record<string, unknown>) {
  const withoutInjuries = inputs.closed_midtable_index_without_injuries;
  const neutralInjuries = inputs.closed_midtable_index_with_neutral_injuries;
  if (typeof withoutInjuries === "number" && typeof neutralInjuries === "number") {
    return `Sin lesiones ${withoutInjuries}/100; neutral ${neutralInjuries}/100`;
  }
  return "Pendiente de fuente de lesionados";
}

function isRecentForm(value: unknown): value is { matches: number; points: number } {
  return typeof value === "object" && value !== null && "matches" in value && "points" in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatPair(first: unknown, second: unknown) {
  return `${formatUnknown(first)} / ${formatUnknown(second)}`;
}

function formatUnknown(value: unknown) {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  }
  if (typeof value === "string") {
    return value;
  }
  return "n/d";
}

function formatWeight(value: unknown) {
  if (typeof value !== "number") {
    return "n/d";
  }
  return `${Math.round(value * 100)}%`;
}

function formatScoreRangeSummary(scoreRange: Record<string, unknown> | null) {
  if (!scoreRange) {
    return "Sin rango";
  }
  return typeof scoreRange.summary === "string" ? scoreRange.summary : "Sin rango";
}
