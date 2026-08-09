import type { FlashscoreMatch } from "../types/api";

export const FLASHSCORE_HISTORY_KEY = "within_flashscore_history_v1";

export function madridDateKey(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export type FlashscoreHistoryEntry = FlashscoreMatch & {
  archived_at: string;
  watch_day: string;
};

export function readFlashscoreHistory(): FlashscoreHistoryEntry[] {
  try {
    const raw = localStorage.getItem(FLASHSCORE_HISTORY_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isHistoryEntry);
  } catch {
    return [];
  }
}

export function saveFlashscoreHistory(entries: FlashscoreHistoryEntry[]): FlashscoreHistoryEntry[] {
  const byId = new Map(readFlashscoreHistory().map((entry) => [entry.event_id, entry]));
  for (const entry of entries) {
    byId.set(entry.event_id, entry);
  }
  const history = Array.from(byId.values()).sort((left, right) => {
    const dayCompare = right.watch_day.localeCompare(left.watch_day);
    if (dayCompare !== 0) {
      return dayCompare;
    }
    return (right.start_time || "").localeCompare(left.start_time || "");
  });
  try {
    localStorage.setItem(FLASHSCORE_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Keep the UI usable when storage is full/disabled.
  }
  return history;
}

export function archiveFlashscoreMatches(
  matches: FlashscoreMatch[],
  options?: { archivedAt?: string; watchDay?: string },
): FlashscoreHistoryEntry[] {
  const archivedAt = options?.archivedAt ?? new Date().toISOString();
  const watchDay = options?.watchDay ?? madridDateKey(archivedAt);
  const entries = matches.map((match) => ({
    ...match,
    status: "finished",
    archived_at: archivedAt,
    watch_day: match.start_time ? madridDateKey(match.start_time) : watchDay,
  }));
  return saveFlashscoreHistory(entries);
}

export function clearFlashscoreHistory() {
  localStorage.removeItem(FLASHSCORE_HISTORY_KEY);
}

function isHistoryEntry(value: unknown): value is FlashscoreHistoryEntry {
  if (!value || typeof value !== "object") {
    return false;
  }
  const entry = value as FlashscoreHistoryEntry;
  return typeof entry.event_id === "string"
    && typeof entry.home_team === "string"
    && typeof entry.away_team === "string"
    && typeof entry.archived_at === "string"
    && typeof entry.watch_day === "string";
}
