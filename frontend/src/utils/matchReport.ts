import type { MatchInsightData } from "../types/api";

export function buildMatchReport(insight: MatchInsightData): string {
  const { detail, analytics, homeGoalTiming, awayGoalTiming } = insight;
  const latestForebet = detail.forebet_predictions[0] ?? analytics.latest_forebet;
  const profile = analytics.goal_parameter_profile;
  const lines = [
    "WITHIN Football Analytics",
    `Informe de partido: ${detail.home_team.name} vs ${detail.away_team.name}`,
    `Fecha: ${formatDateTime(detail.match_date)}`,
    `Competicion: ${detail.competition.name}`,
    `Temporada: ${detail.season}`,
    `Estadio: ${detail.stadium ? [detail.stadium.name, detail.stadium.city, detail.stadium.country].filter(Boolean).join(", ") : "Sin asignar"}`,
    `Estado: ${detail.status}`,
    `Marcador: ${formatScore(detail.home_score, detail.away_score)}`,
    "",
    "Resumen analitico",
    `Indice de equilibrio del partido: ${analytics.closed_midtable_index == null ? "Sin datos" : `${analytics.closed_midtable_index}/100`}`,
    `Fiabilidad: ${analytics.reliability}`,
    `Forebet: ${latestForebet?.prediction ?? "Sin captura"}`,
    `Under/Over: ${latestForebet?.over_under_prediction ?? "Sin senal"}`,
    `xG Forebet: ${latestForebet?.expected_goals ?? "n/d"}`,
    "",
    "Parametros de goles",
    profile ? `Tipo competicion: ${profile.competition_type}` : "Sin perfil de goles",
    profile ? `Amistoso: ${profile.is_friendly ? "si" : "no"}` : "",
    profile ? `Peso estadistico: ${profile.statistical_weight}` : "",
    profile ? `Volumen: ${profile.goal_volume_bucket}` : "",
    profile ? `Perfil under/over: ${profile.under_over_profile}` : "",
    profile ? `Goles tempranos: ${profile.early_goal_signal}` : "",
    profile ? `Goles tardios: ${profile.late_goal_signal}` : "",
    profile ? `Muestra: ${profile.sample_size}` : "",
    profile ? `Fiabilidad del perfil: ${profile.reliability}` : "",
    "",
    "Resumen enfrentamientos directos tres temporadas",
    analytics.three_season_summary ? formatHeadToHeadSampleNotice(analytics.three_season_summary.matches) : "",
    analytics.three_season_summary
      ? `Temporadas: ${analytics.three_season_summary.seasons.join(", ")}`
      : "Sin resumen de tres temporadas",
    analytics.three_season_summary ? `Partidos: ${analytics.three_season_summary.matches}` : "",
    analytics.three_season_summary ? "Resultados encontrados:" : "",
    ...(analytics.three_season_summary ? formatDirectMatches(analytics.three_season_summary.direct_matches ?? []) : []),
    analytics.three_season_summary ? `Goles totales: ${analytics.three_season_summary.total_goals}` : "",
    analytics.three_season_summary ? `Promedio goles por partido: ${analytics.three_season_summary.goals_per_match}` : "",
    analytics.three_season_summary ? `Varianza goles por partido: ${analytics.three_season_summary.goals_variance ?? 0}` : "",
    analytics.three_season_summary ? `Desviacion tipica goles por partido: ${analytics.three_season_summary.goals_standard_deviation ?? 0}` : "",
    analytics.three_season_summary ? `Under 2.5 directos: ${analytics.three_season_summary.under_25_matches ?? 0}` : "",
    analytics.three_season_summary ? `Over 2.5 directos: ${analytics.three_season_summary.over_25_matches ?? 0}` : "",
    analytics.three_season_summary?.home_standing ? formatReferenceStanding(analytics.three_season_summary.home_standing) : "",
    analytics.three_season_summary?.away_standing ? formatReferenceStanding(analytics.three_season_summary.away_standing) : "",
    "",
    "Explicacion",
    analytics.explanation,
    profile?.explanation ?? "",
    "",
    "Tabla previa",
    ...formatStandings(insight),
    "",
    "Goles por intervalo",
    ...formatTiming(detail.home_team.name, homeGoalTiming),
    ...formatTiming(detail.away_team.name, awayGoalTiming),
    "",
    "Nota",
    "Este informe describe patrones y asociaciones historicas. No debe leerse como causalidad ni como certeza predictiva.",
  ];

  return lines.filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n");
}

export function matchReportFileName(insight: MatchInsightData): string {
  const { detail } = insight;
  return `${slugify(detail.home_team.name)}-${slugify(detail.away_team.name)}-${detail.id}-within-report.txt`;
}

export function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function formatStandings(insight: MatchInsightData): string[] {
  if (insight.detail.standings.length === 0) {
    return ["Sin clasificacion previa importada."];
  }
  return insight.detail.standings.map(
    (standing) =>
      `${standing.team}: posicion ${standing.position}, ${standing.points} puntos, DG ${standing.goal_difference}, GF ${standing.goals_for}, GC ${standing.goals_against}`,
  );
}

function formatTiming(teamName: string, rows: MatchInsightData["homeGoalTiming"]): string[] {
  if (rows.length === 0) {
    return [`${teamName}: sin intervalos importados.`];
  }
  return rows.map(
    (row) =>
      `${teamName} ${row.interval_start ?? "?"}-${row.interval_end ?? "?"}: ${row.goals_scored} a favor, ${row.goals_conceded} en contra, muestra ${row.matches_played}`,
  );
}

function formatReferenceStanding(standing: NonNullable<NonNullable<MatchInsightData["analytics"]["three_season_summary"]>["home_standing"]>) {
  return `${standing.team}: posicion ${standing.position}, GF ${standing.goals_for}, GC ${standing.goals_against}, DG ${standing.goal_difference}, temporada ${standing.season}`;
}

function formatDirectMatches(matches: NonNullable<NonNullable<MatchInsightData["analytics"]["three_season_summary"]>["direct_matches"]>): string[] {
  if (matches.length === 0) {
    return ["Sin resultados directos importados."];
  }
  return matches.map(
    (match) =>
      `${formatDateOnly(match.match_date)} - ${match.season} - ${match.home_team} ${formatScore(match.home_score, match.away_score)} ${match.away_team}`,
  );
}

function formatHeadToHeadSampleNotice(matches: number) {
  if (matches >= 3) {
    return "Muestra directa: al menos tres enfrentamientos disponibles.";
  }
  if (matches === 2) {
    return "Aviso de muestra: no tenemos tres enfrentamientos directos; solo hay dos.";
  }
  if (matches === 1) {
    return "Aviso de muestra: no tenemos tres enfrentamientos directos; solo hay uno.";
  }
  return "Aviso de muestra: no tenemos enfrentamientos directos en las temporadas cargadas.";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
  }).format(new Date(value));
}

function formatScore(home?: number | null, away?: number | null) {
  if (home == null || away == null) {
    return "Sin marcador";
  }
  return `${home}-${away}`;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
