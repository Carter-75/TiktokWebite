export type PreferenceSnapshot = {
  likedTags: string[];
  dislikedTags: string[];
  blacklistedItems: string[];
  tagWeights: Record<string, number>;
};

export type HistoryEventType = 'viewed' | 'liked' | 'disliked' | 'reported' | 'search' | 'saved';

export type HistoryTimelineEntry = {
  id: string;
  type: HistoryEventType;
  occurredAt: string;
  product?: {
    id: string;
    title?: string;
    tags?: string[];
  };
  search?: {
    query: string;
    derivedTags: string[];
  };
};

export type SearchHistoryEntry = {
  id: string;
  query: string;
  derivedTags: string[];
  searchedAt: string;
};

export type HistorySnapshot = {
  viewed: string[];
  liked: string[];
  disliked: string[];
  reported: string[];
  saved: string[];
  searches: SearchHistoryEntry[];
  timeline: HistoryTimelineEntry[];
  viewTimestamps: Record<string, string>;
};

export type HistoryRetentionMode = 'balanced' | 'extended' | 'unlimited';

export type UserSettings = {
  telemetryEnabled: boolean;
  reducedMotionMode: boolean;
  historyRetentionMode: HistoryRetentionMode;
};

export type SessionState = {
  sessionId: string;
  userId: string;
  mode: 'guest' | 'google';
  email?: string;
  name?: string;
};

export type CachedProductQueue = {
  queue: string[];
  hydratedAt: string;
};
