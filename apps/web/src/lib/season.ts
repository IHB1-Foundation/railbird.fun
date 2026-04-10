/**
 * G-27: Season system
 * Each season is a 2-4 week window. Deterministic from a start date.
 */

export interface Season {
  id: number;
  name: string;
  startMs: number;
  endMs: number;
  durationDays: number;
}

/** Season 1 start date (2026-04-01 UTC) */
const SEASON_1_START = new Date("2026-04-01T00:00:00Z").getTime();
/** Season duration: 28 days */
const SEASON_DURATION_MS = 28 * 24 * 60 * 60 * 1000;

/**
 * Get the current active season
 */
export function getCurrentSeason(): Season {
  const now = Date.now();
  const elapsed = Math.max(0, now - SEASON_1_START);
  const id = Math.floor(elapsed / SEASON_DURATION_MS) + 1;
  const startMs = SEASON_1_START + (id - 1) * SEASON_DURATION_MS;
  const endMs = startMs + SEASON_DURATION_MS;

  return {
    id,
    name: `Season ${id}`,
    startMs,
    endMs,
    durationDays: 28,
  };
}

/**
 * Progress within the current season (0–1)
 */
export function getSeasonProgress(): number {
  const season = getCurrentSeason();
  const now = Date.now();
  return Math.min(Math.max((now - season.startMs) / (season.endMs - season.startMs), 0), 1);
}

/**
 * Days remaining in the current season
 */
export function getSeasonDaysRemaining(): number {
  const season = getCurrentSeason();
  const now = Date.now();
  return Math.max(0, Math.ceil((season.endMs - now) / (24 * 60 * 60 * 1000)));
}

/**
 * Day N of season (1-indexed)
 */
export function getSeasonDay(): number {
  const season = getCurrentSeason();
  const now = Date.now();
  return Math.min(
    Math.floor((now - season.startMs) / (24 * 60 * 60 * 1000)) + 1,
    season.durationDays,
  );
}

/**
 * Format season label: "Season 1 · Day 12 / 28"
 */
export function getSeasonLabel(): string {
  const season = getCurrentSeason();
  const day = getSeasonDay();
  return `${season.name} · Day ${day} / ${season.durationDays}`;
}
