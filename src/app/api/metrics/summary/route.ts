import { NextRequest, NextResponse } from 'next/server';

import { getMetricSnapshot } from '@/lib/metrics/collector';

export async function GET(request: NextRequest) {
  const token = process.env.METRICS_READ_KEY;
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Metrics dashboard disabled' }, { status: 501 });
  }
  const provided = request.headers.get('x-metrics-key');
  if (provided !== token) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ ok: true, snapshot: getMetricSnapshot() });
}
