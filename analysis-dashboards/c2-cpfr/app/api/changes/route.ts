// =============================================================================
// GET /api/changes — Fetch the change/acceptance log
// =============================================================================

import { NextResponse } from 'next/server';
import { getChangeLog } from '@/lib/changeLog';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const entries = await getChangeLog(Math.min(limit, 100));

    return NextResponse.json({
      entries,
      total: entries.length,
    });
  } catch (err) {
    console.error('[changes] Error:', err);
    return NextResponse.json({ entries: [], total: 0 });
  }
}
