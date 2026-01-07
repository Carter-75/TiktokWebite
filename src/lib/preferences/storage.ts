import {
  PreferenceSnapshot,
  HistoryRetentionMode,
  HistorySnapshot,
  HistoryTimelineEntry,
  SearchHistoryEntry,
  UserSettings,
} from '@/types/preferences';
import type { ProductContent } from '@/types/product';
import { uiLogger, createLogger } from '@/lib/logger';

const storageLogger = createLogger('Storage');

export const STORAGE_KEYS = {
  userId: 'user_id',
  sessionId: 'session_id',
  preferences: 'preferences',
  history: 'history',
  cache: 'cache.generated_pages',
  preloadQueue: 'preload_queue',
  settings: 'user_settings',
} as const;

const defaultPreferences: PreferenceSnapshot = {
  likedTags: [],
  dislikedTags: [],
  blacklistedItems: [],
  tagWeights: {},
};

const defaultHistory: HistorySnapshot = {
  viewed: [],
  liked: [],
  disliked: [],
  reported: [],
  saved: [],
  searches: [],
  timeline: [],
  viewTimestamps: {},
};

const defaultSettings: UserSettings = {
  telemetryEnabled: true,
  reducedMotionMode: false,
  historyRetentionMode: 'balanced',
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export const createBlankPreferences = (): PreferenceSnapshot => clone(defaultPreferences);
export const createBlankHistory = (): HistorySnapshot => clone(defaultHistory);
export const createDefaultSettings = (): UserSettings => clone(defaultSettings);

const safeJsonParse = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    uiLogger.warn('Failed to parse storage value', {
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
};

const hasWindow = () => typeof window !== 'undefined';

const randomId = () => (crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

const RETENTION_RULES: Record<HistoryRetentionMode, { events: number; searches: number; timeline: number; timestampDays: number | null }> = {
  balanced: { events: 400, searches: 250, timeline: 600, timestampDays: 30 },
  extended: { events: 4000, searches: 2000, timeline: 6000, timestampDays: 365 },
  unlimited: { events: Number.POSITIVE_INFINITY, searches: Number.POSITIVE_INFINITY, timeline: Number.POSITIVE_INFINITY, timestampDays: null },
};

const normalizeSearches = (searches: HistorySnapshot['searches'] | string[] | undefined): SearchHistoryEntry[] => {
  if (!Array.isArray(searches)) return [];
  if (searches.length === 0) return [];
  if (typeof searches[0] === 'string') {
    return (searches as string[]).map((query) => ({
      id: randomId(),
      query,
      derivedTags: [],
      searchedAt: new Date().toISOString(),
    }));
  }
  return (searches as SearchHistoryEntry[]).map((entry) => ({
    ...entry,
    id: entry.id ?? randomId(),
    derivedTags: entry.derivedTags ?? [],
    searchedAt: entry.searchedAt ?? new Date().toISOString(),
  }));
};

const normalizeTimeline = (timeline?: HistoryTimelineEntry[]): HistoryTimelineEntry[] => {
  if (!Array.isArray(timeline)) return [];
  return timeline.map((entry) => ({
    ...entry,
    id: entry.id ?? randomId(),
    occurredAt: entry.occurredAt ?? new Date().toISOString(),
  }));
};

export const loadPreferenceSnapshot = (): PreferenceSnapshot => {
  if (!hasWindow()) return defaultPreferences;
  const parsed = safeJsonParse(localStorage.getItem(STORAGE_KEYS.preferences), defaultPreferences);
  return { ...defaultPreferences, ...parsed, tagWeights: parsed.tagWeights ?? {} };
};

export const persistPreferenceSnapshot = (snapshot: PreferenceSnapshot) => {
  if (!hasWindow()) return;
  localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify(snapshot));
};

export const loadHistorySnapshot = (): HistorySnapshot => {
  if (!hasWindow()) return defaultHistory;
  const parsed = safeJsonParse(localStorage.getItem(STORAGE_KEYS.history), defaultHistory);
  return {
    ...defaultHistory,
    ...parsed,
    saved: parsed.saved ?? [],
    timeline: normalizeTimeline(parsed.timeline),
    searches: normalizeSearches(parsed.searches),
    viewTimestamps: parsed.viewTimestamps ?? {},
  };
};

export const applyHistoryRetention = (
  snapshot: HistorySnapshot,
  mode: HistoryRetentionMode
): HistorySnapshot => {
  const rules = RETENTION_RULES[mode] ?? RETENTION_RULES.balanced;
  const cap = <T>(items: T[], limit: number) => (limit === Number.POSITIVE_INFINITY ? items : items.slice(-limit));
  const filteredTimestamps = (() => {
    if (rules.timestampDays === null) return snapshot.viewTimestamps;
    const windowMs = rules.timestampDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    return Object.fromEntries(
      Object.entries(snapshot.viewTimestamps).filter(([, iso]) => {
        const ts = new Date(iso).getTime();
        if (!Number.isFinite(ts)) return false;
        return now - ts <= windowMs;
      })
    );
  })();
  return {
    ...snapshot,
    viewed: cap(snapshot.viewed, rules.events),
    liked: cap(snapshot.liked, rules.events),
    disliked: cap(snapshot.disliked, rules.events),
    reported: cap(snapshot.reported, rules.events),
    saved: cap(snapshot.saved, rules.events),
    searches: cap(snapshot.searches, rules.searches),
    timeline: cap(snapshot.timeline, rules.timeline),
    viewTimestamps: rules.timestampDays === null ? snapshot.viewTimestamps : filteredTimestamps,
  };
};

export const persistHistorySnapshot = (snapshot: HistorySnapshot) => {
  if (!hasWindow()) return;
  const settings = loadUserSettings();
  const retained = applyHistoryRetention(snapshot, settings.historyRetentionMode);
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(retained));
};

export const loadUserSettings = (): UserSettings => {
  if (!hasWindow()) return defaultSettings;
  const parsed = safeJsonParse(localStorage.getItem(STORAGE_KEYS.settings), defaultSettings);
  return {
    ...defaultSettings,
    ...parsed,
  };
};

export const persistUserSettings = (settings: UserSettings) => {
  if (!hasWindow()) return;
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
  try {
    const hydratedHistory = loadHistorySnapshot();
    const retained = applyHistoryRetention(hydratedHistory, settings.historyRetentionMode);
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(retained));
  } catch (error) {
    storageLogger.warn('unable to reapply history retention', {
      error: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
  }
};

export const eraseAllLocalState = () => {
  if (!hasWindow()) return;
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  try {
    window.sessionStorage?.clear();
  } catch (error) {
    uiLogger.warn('Unable to clear sessionStorage', { 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
};

export const persistPreloadQueue = (queue: ProductContent[]) => {
  if (!hasWindow()) return;
  localStorage.setItem(
    STORAGE_KEYS.preloadQueue,
    JSON.stringify({ queue, hydratedAt: new Date().toISOString() })
  );
};

export const loadPreloadQueue = (): ProductContent[] => {
  if (!hasWindow()) return [];
  const payload = safeJsonParse<{ queue: ProductContent[]; hydratedAt?: string }>(
    localStorage.getItem(STORAGE_KEYS.preloadQueue),
    { queue: [] }
  );
  return payload.queue ?? [];
};
