import type { MatchListItem } from "../types/api";

export type MatchFilterState = {
  homeTeam: string;
  awayTeam: string;
  competitionType: string;
  matchKind: string;
  underOver: string;
  goalVolume: string;
  equilibriumRange: string;
};

export const emptyMatchFilters: MatchFilterState = {
  homeTeam: "all",
  awayTeam: "all",
  competitionType: "all",
  matchKind: "all",
  underOver: "all",
  goalVolume: "all",
  equilibriumRange: "all",
};

export function filterMatches(matches: MatchListItem[], filters: MatchFilterState): MatchListItem[] {
  return matches.filter((match) => {
    if (filters.homeTeam !== "all" && filters.awayTeam !== "all") {
      if (!isTeamPairMatch(match, filters.homeTeam, filters.awayTeam)) {
        return false;
      }
    } else {
      if (filters.homeTeam !== "all" && match.home_team !== filters.homeTeam) {
        return false;
      }
      if (filters.awayTeam !== "all" && match.away_team !== filters.awayTeam) {
        return false;
      }
    }
    if (filters.competitionType !== "all" && (match.competition_type ?? "unknown") !== filters.competitionType) {
      return false;
    }
    if (filters.matchKind === "official" && match.is_friendly) {
      return false;
    }
    if (filters.matchKind === "friendly" && !match.is_friendly) {
      return false;
    }
    if (filters.underOver !== "all" && classifyUnderOver(match) !== filters.underOver) {
      return false;
    }
    if (filters.goalVolume !== "all" && classifyGoalVolume(match) !== filters.goalVolume) {
      return false;
    }
    if (filters.equilibriumRange !== "all" && classifyEquilibrium(match.closed_midtable_index) !== filters.equilibriumRange) {
      return false;
    }
    return true;
  });
}

export function findLatestMatchForTeamPair(matches: MatchListItem[], homeTeam: string, awayTeam: string): MatchListItem | null {
  if (homeTeam === "all" || awayTeam === "all") {
    return null;
  }
  return (
    matches
      .filter((match) => isTeamPairMatch(match, homeTeam, awayTeam))
      .sort((first, second) => new Date(second.match_date).getTime() - new Date(first.match_date).getTime())[0] ?? null
  );
}

export function isTeamPairMatch(match: MatchListItem, homeTeam: string, awayTeam: string): boolean {
  return (
    (match.home_team === homeTeam && match.away_team === awayTeam) ||
    (match.home_team === awayTeam && match.away_team === homeTeam)
  );
}

export function teamsFromMatches(matches: MatchListItem[]): string[] {
  return Array.from(new Set(matches.flatMap((match) => [match.home_team, match.away_team]))).sort((first, second) =>
    displayTeamName(first).localeCompare(displayTeamName(second), "es"),
  );
}

export function displayTeamName(team: string): string {
  const labels: Record<string, string> = {
    "Ath Bilbao": "Athletic de Bilbao",
    "Ath Madrid": "Atletico de Madrid",
    Espanol: "RCD Espanyol",
    Sociedad: "Real Sociedad",
  };
  return labels[team] ?? team;
}

export function classifyUnderOver(match: MatchListItem): string {
  const forebet = match.latest_forebet_prediction?.toLowerCase() ?? "";
  if (forebet.includes("under")) {
    return "under";
  }
  if (forebet.includes("over")) {
    return "over";
  }
  const total = totalGoals(match);
  if (total == null) {
    return "unknown";
  }
  return total < 2.5 ? "under" : "over";
}

export function classifyGoalVolume(match: MatchListItem): string {
  const total = totalGoals(match);
  if (total == null) {
    return "unknown";
  }
  if (total <= 2) {
    return "low";
  }
  if (total < 4) {
    return "medium";
  }
  return "high";
}

export function classifyEquilibrium(index?: number | null): string {
  if (index == null) {
    return "unknown";
  }
  if (index <= 30) {
    return "0-30";
  }
  if (index <= 60) {
    return "31-60";
  }
  if (index <= 80) {
    return "61-80";
  }
  return "81-100";
}

export function describeEquilibriumRange(range: string): string {
  const descriptions: Record<string, string> = {
    all: "Todos los niveles de equilibrio.",
    "0-30": "Desequilibrado: hay bastante distancia competitiva entre los equipos.",
    "31-60": "Equilibrio moderado: hay cercania, pero todavia existen diferencias relevantes.",
    "61-80": "Bastante equilibrado: los equipos llegan con perfiles competitivos parecidos.",
    "81-100": "Muy equilibrado: cruce de alta igualdad segun clasificacion y goles.",
    unknown: "Sin indice calculado.",
  };
  return descriptions[range] ?? descriptions.all;
}

export function totalGoals(match: MatchListItem): number | null {
  if (match.home_score == null || match.away_score == null) {
    return null;
  }
  return match.home_score + match.away_score;
}
