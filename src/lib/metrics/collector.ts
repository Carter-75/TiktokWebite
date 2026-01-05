type MetricMeta = Record<string, unknown>;

type MetricEntry = {
  count: number;
  lastSampleAt: string;
  sample?: MetricMeta;
};

const metrics = new Map<string, MetricEntry>();

const sanitizeMeta = (meta?: MetricMeta): MetricMeta | undefined => {
  if (!meta) return undefined;
  const safe: MetricMeta = {};
  Object.entries(meta).forEach(([key, value]) => {
    if (value === undefined) return;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      safe[key] = value;
      return;
    }
    safe[key] = JSON.stringify(value);
  });
  return safe;
};

export const recordMetric = (event: string, meta?: MetricMeta) => {
  const normalized = event.slice(0, 64);
  const nowIso = new Date().toISOString();
  const entry = metrics.get(normalized) ?? { count: 0, lastSampleAt: nowIso };
  entry.count += 1;
  entry.lastSampleAt = nowIso;
  entry.sample = sanitizeMeta(meta);
  metrics.set(normalized, entry);
};

export const getMetricSnapshot = () => {
  return {
    generatedAt: new Date().toISOString(),
    events: Array.from(metrics.entries()).map(([event, data]) => ({ event, ...data })),
  };
};

export const resetMetrics = () => metrics.clear();
