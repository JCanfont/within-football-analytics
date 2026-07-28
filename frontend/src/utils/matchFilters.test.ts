import { describe, expect, it } from "vitest";
import type { MatchListItem } from "../types/api";
import {
  classifyEquilibrium,
  classifyGoalVolume,
  classifyUnderOver,
  describeEquilibriumRange,
  displayTeamName,
  findLatestMatchForTeamPair,
  filterMatches,
  teamsFromMatches,
} from "./matchFilters";

const matches: MatchListItem[] = [
  {
    id: 1,
    match_date: "2026-08-15T19:30:00+00:00",
    competition: "LaLiga",
    competition_type: "domestic_league",
    season: "2026/2027",
    home_team: "Getafe",
    away_team: "Osasuna",
    status: "finished",
    home_score: 1,
    away_score: 1,
    is_friendly: false,
    latest_forebet_prediction: "under_2_5",
    closed_midtable_index: 67,
  },
  {
    id: 3,
    match_date: "2026-08-20T19:30:00+00:00",
    competition: "LaLiga",
    competition_type: "domestic_league",
    season: "2026/2027",
    home_team: "Osasuna",
    away_team: "Getafe",
    status: "finished",
    home_score: 0,
    away_score: 2,
    is_friendly: false,
    latest_forebet_prediction: "under_2_5",
    closed_midtable_index: 69,
  },
  {
    id: 2,
    match_date: "2026-08-16T19:30:00+00:00",
    competition: "Friendly Cup",
    competition_type: "friendly",
    season: "2026",
    home_team: "Betis",
    away_team: "Valencia",
    status: "finished",
    home_score: 3,
    away_score: 2,
    is_friendly: true,
    latest_forebet_prediction: "over_2_5",
    closed_midtable_index: 25,
  },
];

describe("matchFilters", () => {
  it("filters by competition type and match kind", () => {
    const filtered = filterMatches(matches, {
      homeTeam: "all",
      awayTeam: "all",
      competitionType: "friendly",
      matchKind: "friendly",
      underOver: "all",
      goalVolume: "all",
      equilibriumRange: "all",
    });

    expect(filtered.map((match) => match.id)).toEqual([2]);
  });

  it("classifies under/over and goal volume", () => {
    const friendly = matches.find((match) => match.id === 2)!;

    expect(classifyUnderOver(matches[0])).toBe("under");
    expect(classifyGoalVolume(matches[0])).toBe("low");
    expect(classifyUnderOver(friendly)).toBe("over");
    expect(classifyGoalVolume(friendly)).toBe("high");
  });

  it("filters by selected home and away teams and exposes readable team labels", () => {
    const filtered = filterMatches(matches, {
      homeTeam: "Getafe",
      awayTeam: "Osasuna",
      competitionType: "all",
      matchKind: "all",
      underOver: "all",
      goalVolume: "all",
      equilibriumRange: "all",
    });

    expect(filtered.map((match) => match.id)).toEqual([1, 3]);
    expect(teamsFromMatches(matches)).toEqual(["Betis", "Getafe", "Osasuna", "Valencia"]);
    expect(displayTeamName("Espanol")).toBe("RCD Espanyol");
    expect(displayTeamName("Sociedad")).toBe("Real Sociedad");
  });

  it("finds the latest direct match for a selected pair ignoring other filters", () => {
    const match = findLatestMatchForTeamPair(matches, "Getafe", "Osasuna");

    expect(match?.id).toBe(3);
  });

  it("filters inversely by equilibrium range and describes the interval", () => {
    const filtered = filterMatches(matches, {
      homeTeam: "all",
      awayTeam: "all",
      competitionType: "all",
      matchKind: "all",
      underOver: "all",
      goalVolume: "all",
      equilibriumRange: "61-80",
    });

    expect(filtered.map((match) => match.id)).toEqual([1, 3]);
    expect(classifyEquilibrium(matches[0].closed_midtable_index)).toBe("61-80");
    expect(describeEquilibriumRange("61-80")).toContain("Bastante equilibrado");
  });
});
