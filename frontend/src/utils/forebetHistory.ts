import type { ForebetRangeItem } from "../types/api";

const FOREBET_HISTORY_KEY = "within_forebet_history_v1";

function matchKey(item: ForebetRangeItem) {
  return `${item.match_date}|${item.competition}|${item.home_team}|${item.away_team}`;
}

export function readForebetHistory(): ForebetRangeItem[] {
  try {
    const raw = localStorage.getItem(FOREBET_HISTORY_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ForebetRangeItem[]) : [];
  } catch {
    return [];
  }
}

export function saveForebetHistory(items: ForebetRangeItem[]) {
  const byMatch = new Map(readForebetHistory().map((item) => [matchKey(item), item]));
  items.forEach((item) => byMatch.set(matchKey(item), item));
  const history = Array.from(byMatch.values()).sort((left, right) => right.match_date.localeCompare(left.match_date));
  try {
    localStorage.setItem(FOREBET_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // The current analysis can continue even when browser storage is full or disabled.
  }
  return history;
}

export function clearForebetHistory() {
  localStorage.removeItem(FOREBET_HISTORY_KEY);
}
