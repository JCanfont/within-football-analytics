import type { DirectMatchResult, MatchInsightData, MatchListItem } from "../types/api";

export type SpeechMatchOption = {
  label: string;
  description: string;
  matchId: number;
};

export type SpeechMatchResult =
  | { status: "found"; match: MatchListItem }
  | { status: "ambiguous"; message: string; options: SpeechMatchOption[] }
  | { status: "not_found" };

export function findMatchFromSpeech(transcript: string, matches: MatchListItem[]): MatchListItem | null {
  const result = resolveMatchFromSpeech(transcript, matches);
  return result.status === "found" ? result.match : null;
}

export function displaySpokenTeamName(team: string) {
  const labels: Record<string, string> = {
    "Ath Bilbao": "Athletic de Bilbao",
    "Ath Madrid": "Atlético de Madrid",
    Espanol: "RCD Espanyol",
    Sociedad: "Real Sociedad",
  };
  return labels[team] ?? team;
}

export function resolveMatchFromSpeech(transcript: string, matches: MatchListItem[]): SpeechMatchResult {
  const normalizedTranscript = normalize(transcript);
  const ambiguousAthletic = athleticPhoneticAmbiguity(normalizedTranscript, matches);
  if (ambiguousAthletic) {
    return ambiguousAthletic;
  }

  const incompleteAth = incompleteAthAmbiguity(normalizedTranscript, matches);
  if (incompleteAth) {
    return incompleteAth;
  }

  const ambiguousMadrid = madridAmbiguity(normalizedTranscript, matches);
  if (ambiguousMadrid) {
    return ambiguousMadrid;
  }

  const scoredMatches = matches
    .map((match) => {
      const homeScore = scoreTeamMention(match.home_team, normalizedTranscript);
      const awayScore = scoreTeamMention(match.away_team, normalizedTranscript);
      return {
        match,
        score: homeScore + awayScore + orderBonus(match, normalizedTranscript),
        homeScore,
        awayScore,
      };
    })
    .filter((result) => result.homeScore >= 0.58 && result.awayScore >= 0.58)
    .sort((first, second) => second.score - first.score);

  if (!scoredMatches[0]) {
    return { status: "not_found" };
  }

  const [best, second] = scoredMatches;
  const competingMatches = scoredMatches.filter(
    (candidate) =>
      candidate.match.id !== best.match.id &&
      candidate.score >= Math.max(1.45, best.score - 0.28) &&
      candidate.homeScore >= 0.72 &&
      candidate.awayScore >= 0.72,
  );
  if (second && (best.score - second.score < 0.12 || (best.score < 2.1 && competingMatches.length > 0))) {
    const possibleMatches = [best.match, ...competingMatches.slice(0, 2).map((candidate) => candidate.match)];
    if (allSameTeamPair(possibleMatches)) {
      return { status: "found", match: best.match };
    }
    return {
      status: "ambiguous",
      message: "He encontrado varias aproximaciones posibles. Elige el partido correcto.",
      options: uniqueMatchOptions(possibleMatches),
    };
  }

  return { status: "found", match: best.match };
}

export function buildSpokenSummary(insight: MatchInsightData | null): string {
  if (!insight) {
    return "Selecciona o pide un partido para escuchar el analisis.";
  }

  const { detail, analytics } = insight;
  const latestForebet = detail.forebet_predictions[0] ?? analytics.latest_forebet;
  const homeName = displaySpokenTeamName(detail.home_team.name);
  const awayName = displaySpokenTeamName(detail.away_team.name);
  const parts = analytics.three_season_summary
    ? [formatDirectMatchOpening(homeName, awayName, analytics.three_season_summary)]
    : [`${homeName} contra ${awayName}`];

  if (detail.home_score != null && detail.away_score != null) {
    parts.push(`marcador registrado ${detail.home_score} a ${detail.away_score}`);
  }

  if (analytics.closed_midtable_index != null) {
    parts.push(`indice de equilibrio del partido de ${analytics.closed_midtable_index} sobre 100`);
  }

  if (hasValue(latestForebet?.over_under_prediction)) {
    parts.push(`Forebet indica ${latestForebet?.over_under_prediction}`);
  } else if (hasValue(latestForebet?.prediction)) {
    parts.push(`Forebet indica ${latestForebet?.prediction}`);
  }

  if (hasValue(analytics.reliability) && analytics.reliability !== "insufficient") {
    parts.push(`fiabilidad ${analytics.reliability}`);
  }

  if (analytics.goal_parameter_profile) {
    const profile = analytics.goal_parameter_profile;
    if (hasValue(profile.goal_volume_bucket)) {
      parts.push(`volumen de goles ${profile.goal_volume_bucket}`);
    }
    if (hasValue(profile.late_goal_signal) && !isMissingGoalMinuteSignal(profile.late_goal_signal)) {
      parts.push(profile.late_goal_signal);
    }
  }

  if (analytics.three_season_summary) {
    const summary = analytics.three_season_summary;
    parts.push(
      `en los enfrentamientos directos de las tres ultimas temporadas disponibles hay ${summary.total_goals} goles en ${summary.matches} partidos, promedio ${summary.goals_per_match} goles por partido`,
    );
    const dispersion = formatGoalDispersion(summary);
    if (dispersion) {
      parts.push(dispersion);
    }
    const underOver = formatDirectUnderOver(summary);
    if (underOver) {
      parts.push(underOver);
    }
    if (summary.home_standing) {
      parts.push(
        `${displaySpokenTeamName(summary.home_standing.team)} posicion ${summary.home_standing.position}, goles a favor ${summary.home_standing.goals_for}, goles en contra ${summary.home_standing.goals_against}, diferencia ${summary.home_standing.goal_difference}`,
      );
    }
    if (summary.away_standing) {
      parts.push(
        `${displaySpokenTeamName(summary.away_standing.team)} posicion ${summary.away_standing.position}, goles a favor ${summary.away_standing.goals_for}, goles en contra ${summary.away_standing.goals_against}, diferencia ${summary.away_standing.goal_difference}`,
      );
    }
  }

  if (hasValue(analytics.explanation) && analytics.status !== "insufficient_data") {
    parts.push(analytics.explanation);
  }

  return applySpanishProsody(`${parts.join(". ")}.`);
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bespanyol\b/g, "espanol")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreTeamMention(team: string, normalizedTranscript: string) {
  const transcriptTokens = tokens(normalizedTranscript);
  return Math.max(...teamAliases(team).map((alias) => scoreAlias(alias, normalizedTranscript, transcriptTokens)), 0);
}

function scoreAlias(alias: string, normalizedTranscript: string, transcriptTokens: string[]) {
  const normalizedAlias = normalize(alias);
  if (includesPhrase(normalizedTranscript, normalizedAlias)) {
    return 1.15;
  }

  const aliasTokens = tokens(normalizedAlias).filter((token) => !STOP_WORDS.has(token));
  if (aliasTokens.length === 0 || transcriptTokens.length === 0) {
    return 0;
  }

  const coverage = aliasTokens.reduce((sum, aliasToken) => {
    const bestTokenScore = Math.max(...transcriptTokens.map((transcriptToken) => similarity(aliasToken, transcriptToken)), 0);
    return sum + bestTokenScore;
  }, 0);
  return Math.min(coverage / aliasTokens.length, 0.92);
}

function orderBonus(match: MatchListItem, normalizedTranscript: string) {
  const homeIndex = bestAliasIndex(match.home_team, normalizedTranscript);
  const awayIndex = bestAliasIndex(match.away_team, normalizedTranscript);
  if (homeIndex >= 0 && awayIndex >= 0 && homeIndex < awayIndex) {
    return 0.15;
  }
  return 0;
}

function bestAliasIndex(team: string, normalizedTranscript: string) {
  const indexes = teamAliases(team)
    .map((alias) => normalizedTranscript.indexOf(normalize(alias)))
    .filter((index) => index >= 0);
  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

function includesPhrase(normalizedTranscript: string, normalizedPhrase: string) {
  return ` ${normalizedTranscript} `.includes(` ${normalizedPhrase} `);
}

function tokens(value: string) {
  return value.split(" ").filter((word) => word.length > 1);
}

function madridAmbiguity(normalizedTranscript: string, matches: MatchListItem[]): SpeechMatchResult | null {
  if (!includesPhrase(normalizedTranscript, "madrid")) {
    return null;
  }
  if (
    includesPhrase(normalizedTranscript, "real madrid") ||
    includesPhrase(normalizedTranscript, "atletico madrid") ||
    includesPhrase(normalizedTranscript, "atletico de madrid") ||
    includesPhrase(normalizedTranscript, "ath madrid") ||
    includesPhrase(normalizedTranscript, "atleti")
  ) {
    return null;
  }

  const madridTeams = ["Real Madrid", "Ath Madrid"];
  const otherTeams = Array.from(new Set(matches.flatMap((match) => [match.home_team, match.away_team])))
    .filter((team) => !madridTeams.includes(team))
    .map((team) => ({ team, score: scoreTeamMention(team, normalizedTranscript) }))
    .filter((item) => item.score >= 0.58)
    .sort((first, second) => second.score - first.score);

  const bestOtherTeam = otherTeams[0]?.team;
  const options = madridTeams
    .map((team) => latestMatchForTeamPair(matches, bestOtherTeam, team))
    .filter((match): match is MatchListItem => Boolean(match));

  if (options.length < 2) {
    return null;
  }

  return {
    status: "ambiguous",
    message: "Cuando dices Madrid, ¿te refieres al Real Madrid o al Atletico de Madrid?",
    options: uniqueMatchOptions(options),
  };
}

function athleticPhoneticAmbiguity(normalizedTranscript: string, matches: MatchListItem[]): SpeechMatchResult | null {
  const hasAthleticNoise = ["ateache", "ache", "atletic", "atletik"].some((word) => includesPhrase(normalizedTranscript, word));
  if (!hasAthleticNoise || !includesPhrase(normalizedTranscript, "madrid")) {
    return null;
  }
  if (
    includesPhrase(normalizedTranscript, "atletico madrid") ||
    includesPhrase(normalizedTranscript, "atletico de madrid") ||
    includesPhrase(normalizedTranscript, "atleti") ||
    includesPhrase(normalizedTranscript, "ath madrid")
  ) {
    return null;
  }

  const ambiguousTeams = ["Ath Bilbao", "Ath Madrid"];
  const otherTeams = Array.from(new Set(matches.flatMap((match) => [match.home_team, match.away_team])))
    .filter((team) => !ambiguousTeams.includes(team))
    .map((team) => ({ team, score: scoreTeamMention(team, normalizedTranscript) }))
    .filter((item) => item.score >= 0.58)
    .sort((first, second) => second.score - first.score);

  const bestOtherTeam = otherTeams[0]?.team;
  const options = ambiguousTeams
    .map((team) => latestMatchForTeamPair(matches, bestOtherTeam, team))
    .filter((match): match is MatchListItem => Boolean(match));

  if (options.length < 2) {
    return null;
  }

  return {
    status: "ambiguous",
    message: "He oido una lectura dudosa. ¿Te refieres al Athletic Club o al Atletico de Madrid?",
    options: uniqueMatchOptions(options),
  };
}

function incompleteAthAmbiguity(normalizedTranscript: string, matches: MatchListItem[]): SpeechMatchResult | null {
  if (!includesPhrase(normalizedTranscript, "ath")) {
    return null;
  }
  if (
    includesPhrase(normalizedTranscript, "ath bilbao") ||
    includesPhrase(normalizedTranscript, "athletic") ||
    includesPhrase(normalizedTranscript, "bilbao") ||
    includesPhrase(normalizedTranscript, "ath madrid") ||
    includesPhrase(normalizedTranscript, "atletico") ||
    includesPhrase(normalizedTranscript, "atleti")
  ) {
    return null;
  }

  const ambiguousTeams = ["Ath Bilbao", "Ath Madrid"];
  const otherTeams = Array.from(new Set(matches.flatMap((match) => [match.home_team, match.away_team])))
    .filter((team) => !ambiguousTeams.includes(team))
    .map((team) => ({ team, score: scoreTeamMention(team, normalizedTranscript) }))
    .filter((item) => item.score >= 0.58)
    .sort((first, second) => second.score - first.score);

  const bestOtherTeam = otherTeams[0]?.team;
  const options = ambiguousTeams
    .map((team) => latestMatchForTeamPair(matches, bestOtherTeam, team))
    .filter((match): match is MatchListItem => Boolean(match));

  if (options.length < 2) {
    return null;
  }

  return {
    status: "ambiguous",
    message: "Ath puede referirse a mas de un equipo. Elige la aproximacion correcta.",
    options: uniqueMatchOptions(options),
  };
}

function latestMatchForTeamPair(matches: MatchListItem[], firstTeam: string | undefined, madridTeam: string) {
  const candidates = matches.filter((match) => {
    const hasMadridTeam = match.home_team === madridTeam || match.away_team === madridTeam;
    if (!firstTeam) {
      return hasMadridTeam;
    }
    const hasFirstTeam = match.home_team === firstTeam || match.away_team === firstTeam;
    return hasMadridTeam && hasFirstTeam;
  });
  return candidates.sort((first, second) => new Date(second.match_date).getTime() - new Date(first.match_date).getTime())[0];
}

function uniqueMatchOptions(matches: MatchListItem[]) {
  const seen = new Set<number>();
  return matches
    .filter((match) => {
      if (seen.has(match.id)) {
        return false;
      }
      seen.add(match.id);
      return true;
    })
    .map((match) => ({
      label: `${displaySpokenTeamName(match.home_team)} vs ${displaySpokenTeamName(match.away_team)}`,
      description: `${match.competition} ${match.season}`,
      matchId: match.id,
    }));
}

function allSameTeamPair(matches: MatchListItem[]) {
  if (matches.length <= 1) {
    return true;
  }
  const reference = teamPairKey(matches[0]);
  return matches.every((match) => teamPairKey(match) === reference);
}

function teamPairKey(match: MatchListItem) {
  return [normalize(match.home_team), normalize(match.away_team)].sort().join("|");
}

function teamAliases(team: string) {
  const normalizedTeam = normalize(team);
  const aliases: Record<string, string[]> = {
    "ath madrid": ["ath madrid", "atletico madrid", "atletico de madrid", "atleti"],
    "ath bilbao": [
      "ath bilbao",
      "athletic bilbao",
      "athletic club",
      "athletic de bilbao",
      "atletic bilbao",
      "atletic de bilbao",
      "ateache bilbao",
      "ateache de bilbao",
      "ache bilbao",
      "ache de bilbao",
    ],
    betis: ["betis", "real betis"],
    celta: ["celta", "celta vigo", "celta de vigo"],
    espanol: ["espanol", "espanyol", "rcd espanyol", "rcd espanol"],
    sociedad: ["sociedad", "real sociedad"],
    vallecano: ["vallecano", "rayo vallecano"],
  };
  return Array.from(new Set([normalizedTeam, ...(aliases[normalizedTeam] ?? [])]));
}

function similarity(first: string, second: string) {
  if (first === second) {
    return 1;
  }
  const distance = levenshtein(first, second);
  return 1 - distance / Math.max(first.length, second.length);
}

function levenshtein(first: string, second: string) {
  const rows = Array.from({ length: first.length + 1 }, (_, index) => [index]);
  for (let column = 1; column <= second.length; column += 1) {
    rows[0][column] = column;
  }
  for (let row = 1; row <= first.length; row += 1) {
    for (let column = 1; column <= second.length; column += 1) {
      const cost = first[row - 1] === second[column - 1] ? 0 : 1;
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + cost,
      );
    }
  }
  return rows[first.length][second.length];
}

const STOP_WORDS = new Set(["cf", "club", "de", "del", "el", "la", "los", "las", "real", "rcd"]);

function hasValue(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function isMissingGoalMinuteSignal(value: string) {
  return value.toLowerCase().includes("sin datos de minutos");
}

function formatDirectMatchOpening(
  homeName: string,
  awayName: string,
  summary: NonNullable<MatchInsightData["analytics"]["three_season_summary"]>,
) {
  const directMatches = summary.direct_matches ?? [];
  if (directMatches.length === 0) {
    return `${homeName} contra ${awayName}. ${formatHeadToHeadSampleNotice(0)}`;
  }

  const results = directMatches.map((match) => `${formatShortDate(match.match_date)}, ${formatDirectResultScore(match)}`).join("; ");
  const highlights = formatDirectMatchHighlights(directMatches);
  const sampleNotice = directMatches.length < 3 ? `${formatHeadToHeadSampleNotice(directMatches.length)}. ` : "";
  const venueSummary = formatVenueSummary(homeName, directMatches);

  return `${homeName} contra ${awayName}. ${sampleNotice}He encontrado ${directMatches.length} partidos entre estos dos equipos en las ultimas temporadas cargadas: ${venueSummary}. Los resultados fueron: ${results}. ${highlights}`;
}

function formatVenueSummary(homeName: string, matches: DirectMatchResult[]) {
  const selectedHomeMatches = matches.filter((match) => match.venue_context === "same_home").length;
  const selectedAwayMatches = matches.filter((match) => match.venue_context === "reversed_home").length;
  const unknownVenueMatches = Math.max(matches.length - selectedHomeMatches - selectedAwayMatches, 0);
  const parts = [
    `${selectedHomeMatches} con ${homeName} en casa`,
    `${selectedAwayMatches} con ${homeName} fuera`,
    unknownVenueMatches > 0 ? `${unknownVenueMatches} sin localia identificada` : "",
  ].filter(Boolean);
  return parts.join(" y ");
}

function formatDirectMatchHighlights(matches: DirectMatchResult[]) {
  const latestMatch = [...matches].sort((first, second) => new Date(second.match_date).getTime() - new Date(first.match_date).getTime())[0];
  const validMatches = matches.filter((match) => match.home_score != null && match.away_score != null);
  const maxGoals = Math.max(...validMatches.map((match) => totalGoals(match)), 0);
  const maxGoalMatches = validMatches.filter((match) => totalGoals(match) === maxGoals);
  const maxGap = Math.max(...validMatches.map((match) => goalDifference(match)), 0);
  const maxGapMatches = validMatches.filter((match) => goalDifference(match) === maxGap);
  const sameGoalAndGapMatches = sameMatchSet(maxGoalMatches, maxGapMatches);
  return [
    latestMatch ? `El ultimo resultado fue ${formatDirectMatchForSpeech(latestMatch)}` : "",
    sameGoalAndGapMatches && maxGoalMatches.length > 0
      ? `El resultado con mayor numero de goles y mayor diferencia de goles fue ${formatManyDirectMatches(maxGoalMatches)}`
      : "",
    !sameGoalAndGapMatches && maxGoalMatches.length > 0
      ? `El resultado con mayor numero de goles fue ${formatManyDirectMatches(maxGoalMatches)}`
      : "",
    !sameGoalAndGapMatches && maxGapMatches.length > 0
      ? `El resultado con mayor diferencia de goles fue ${formatManyDirectMatches(maxGapMatches)}`
      : "",
  ]
    .filter(Boolean)
    .join(". ");
}

function formatManyDirectMatches(matches: DirectMatchResult[]) {
  return matches.map(formatDirectMatchForSpeech).join("; ");
}

function formatDirectMatchForSpeech(match: DirectMatchResult) {
  return `${formatShortDate(match.match_date)}, ${formatDirectResultScore(match)}`;
}

function formatDirectResultScore(match: DirectMatchResult) {
  if (match.home_score == null || match.away_score == null) {
    return `${displaySpokenTeamName(match.home_team)} contra ${displaySpokenTeamName(match.away_team)}, sin marcador`;
  }
  return `${displaySpokenTeamName(match.home_team)} ${match.home_score}, ${displaySpokenTeamName(match.away_team)} ${match.away_score}`;
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

function formatHeadToHeadSampleNotice(matches: number) {
  if (matches >= 3) {
    return "hay al menos tres enfrentamientos directos disponibles para este cruce";
  }
  if (matches === 2) {
    return "aviso inicial: no tenemos tres enfrentamientos directos disponibles para este cruce, solo hay dos";
  }
  if (matches === 1) {
    return "aviso inicial: no tenemos tres enfrentamientos directos disponibles para este cruce, solo hay uno";
  }
  return "aviso inicial: no tenemos enfrentamientos directos disponibles para este cruce en las temporadas cargadas";
}

function formatGoalDispersion(summary: NonNullable<MatchInsightData["analytics"]["three_season_summary"]>) {
  if (summary.goals_variance == null || summary.goals_standard_deviation == null) {
    return "";
  }
  return `varianza de goles por partido ${summary.goals_variance} y desviacion tipica ${summary.goals_standard_deviation}`;
}

function formatDirectUnderOver(summary: NonNullable<MatchInsightData["analytics"]["three_season_summary"]>) {
  if (summary.under_25_matches == null || summary.over_25_matches == null) {
    return "";
  }
  return `en este cruce directo hay ${summary.under_25_matches} partidos under 2.5 y ${summary.over_25_matches} partidos over 2.5`;
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatScore(home?: number | null, away?: number | null) {
  if (home == null || away == null) {
    return "sin marcador contra";
  }
  return `${home} a ${away}`;
}

function formatSpokenSeason(value: string) {
  const match = value.match(/^(\d{4})\D+(\d{4})$/);
  if (!match) {
    return value;
  }
  return `${formatSpokenShortYear(match[1])} - ${formatSpokenShortYear(match[2])}`;
}

function formatSpokenShortYear(value: string) {
  const year = Number(value.slice(-2));
  const years: Record<number, string> = {
    23: "veintitrés",
    24: "veinticuatro",
    25: "veinticinco",
    26: "veintiséis",
    27: "veintisiete",
    28: "veintiocho",
    29: "veintinueve",
    30: "treinta",
  };
  return years[year] ?? value;
}

function applySpanishProsody(text: string) {
  const replacements: Array<[RegExp, string]> = [
    [/\bindice\b/gi, "índice"],
    [/\bformula\b/gi, "fórmula"],
    [/\banalisis\b/gi, "análisis"],
    [/\bclasificacion\b/gi, "clasificación"],
    [/\bposicion\b/gi, "posición"],
    [/\bultimas\b/gi, "últimas"],
    [/\bultimo\b/gi, "último"],
    [/\bnumero\b/gi, "número"],
    [/\bmas\b/gi, "más"],
    [/\bsenal\b/gi, "señal"],
    [/\bsenales\b/gi, "señales"],
    [/\bpeticion\b/gi, "petición"],
    [/\bsintesis\b/gi, "síntesis"],
    [/\bmicrofono\b/gi, "micrófono"],
    [/\boido\b/gi, "oído"],
    [/\bhistorico\b/gi, "histórico"],
    [/\blocalia\b/gi, "localía"],
    [/\basi\b/gi, "así"],
    [/\bcompeticion\b/gi, "competición"],
    [/\bparametros\b/gi, "parámetros"],
    [/\btardios\b/gi, "tardíos"],
    [/\bdesviacion\b/gi, "desviación"],
    [/\btipica\b/gi, "típica"],
    [/\bveintitres\b/gi, "veintitrés"],
    [/\bveintiseis\b/gi, "veintiséis"],
  ];
  return replacements.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text);
}
