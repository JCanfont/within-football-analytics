import type { FlashscoreHistoryEntry } from "./flashscoreHistory";
import { ALERT_ODDS_THRESHOLD } from "./flashscoreWatch";

export type FlashscoreStatsBreakdown = {
  key: string;
  label: string;
  sampleSize: number;
  earlyGoals: number;
  earlyGoalRate: number | null;
  favoriteEarlyGoals: number;
  favoriteEarlyGoalRate: number | null;
};

export type FlashscoreDayStats = {
  sampleSize: number;
  finishedWithScore: number;
  earlyGoals: number;
  earlyGoalRate: number | null;
  favoriteEarlyGoals: number;
  favoriteEarlyGoalRate: number | null;
  alertEligible: number;
  averageFavoriteOdds: number | null;
  byCompetition: FlashscoreStatsBreakdown[];
  byDay: FlashscoreStatsBreakdown[];
};

export function calculateFlashscoreStats(entries: FlashscoreHistoryEntry[]): FlashscoreDayStats {
  const sample = entries.filter((entry) => entry.home_score != null && entry.away_score != null);
  const earlyGoals = sample.filter((entry) => entry.early_goal || entry.early_favorite_goal).length;
  const favoriteEarlyGoals = sample.filter((entry) => entry.early_favorite_goal || entry.alert_eligible).length;
  const alertEligible = sample.filter((entry) => (
    entry.alert_eligible
    || (
      entry.favorite_odds != null
      && entry.favorite_odds <= ALERT_ODDS_THRESHOLD
      && (entry.early_favorite_goal || false)
    )
  )).length;
  const odds = sample
    .map((entry) => entry.favorite_odds)
    .filter((value): value is number => value != null);
  const averageFavoriteOdds = odds.length
    ? odds.reduce((sum, value) => sum + value, 0) / odds.length
    : null;

  return {
    sampleSize: sample.length,
    finishedWithScore: sample.length,
    earlyGoals,
    earlyGoalRate: rate(earlyGoals, sample.length),
    favoriteEarlyGoals,
    favoriteEarlyGoalRate: rate(favoriteEarlyGoals, sample.length),
    alertEligible,
    averageFavoriteOdds,
    byCompetition: groupEntries(sample, (entry) => ({
      key: entry.competition || "Sin competicion",
      label: entry.competition || "Sin competicion",
    })),
    byDay: groupEntries(sample, (entry) => ({
      key: entry.watch_day,
      label: entry.watch_day,
    }), (left, right) => right.key.localeCompare(left.key)),
  };
}

function groupEntries(
  entries: FlashscoreHistoryEntry[],
  keyFn: (entry: FlashscoreHistoryEntry) => { key: string; label: string },
  sortFn?: (left: FlashscoreStatsBreakdown, right: FlashscoreStatsBreakdown) => number,
): FlashscoreStatsBreakdown[] {
  const groups = new Map<string, { label: string; items: FlashscoreHistoryEntry[] }>();
  for (const entry of entries) {
    const { key, label } = keyFn(entry);
    const current = groups.get(key) ?? { label, items: [] };
    current.items.push(entry);
    groups.set(key, current);
  }
  const rows = Array.from(groups.entries()).map(([key, group]) => {
    const earlyGoals = group.items.filter((entry) => entry.early_goal || entry.early_favorite_goal).length;
    const favoriteEarlyGoals = group.items.filter((entry) => entry.early_favorite_goal || entry.alert_eligible).length;
    return {
      key,
      label: group.label,
      sampleSize: group.items.length,
      earlyGoals,
      earlyGoalRate: rate(earlyGoals, group.items.length),
      favoriteEarlyGoals,
      favoriteEarlyGoalRate: rate(favoriteEarlyGoals, group.items.length),
    };
  });
  return rows.sort(sortFn ?? ((left, right) => right.sampleSize - left.sampleSize || left.label.localeCompare(right.label)));
}

function rate(hits: number, total: number) {
  return total > 0 ? (hits / total) * 100 : null;
}
