// =============================================================================
// POST /api/accept — Accept the other side's forecast numbers
// =============================================================================

import { NextResponse } from 'next/server';
import { addChangeLogEntry } from '@/lib/changeLog';
import { sendAlert } from '@/lib/alerts';
import type { AcceptRequest } from '@/lib/types';

export async function POST(req: Request) {
  try {
    const body: AcceptRequest = await req.json();

    // Validate
    if (!body.direction || !body.scope) {
      return NextResponse.json(
        { error: 'Missing required fields: direction, scope' },
        { status: 400 }
      );
    }

    const actor = body.direction === 'anker_accepts_c2' ? 'Anker' : 'C2';
    const otherSide = actor === 'Anker' ? 'C2' : 'Anker';

    let details: string;
    const skus = body.sku ? [body.sku] : [];

    if (body.scope === 'all') {
      details = `${actor} accepted all of ${otherSide}'s forecast numbers`;
    } else if (body.sku) {
      const weekStr = body.weeks?.length
        ? ` for ${body.weeks.join(', ')}`
        : '';
      details = `${actor} accepted ${otherSide}'s forecast for ${body.sku}${weekStr}`;
    } else {
      details = `${actor} accepted ${otherSide}'s forecast`;
    }

    // Log the acceptance
    const entry = await addChangeLogEntry({
      actor: actor as 'Anker' | 'C2',
      action: 'accepted',
      details,
      skus,
    });

    // Try to send an alert (non-blocking)
    sendAlert({
      type: 'email',
      subject: `CPFR Forecast Accepted — ${actor}`,
      message: details,
    }).catch((err) => console.error('[accept] Alert failed:', err));

    return NextResponse.json({
      success: true,
      entry,
      message: details,
    });
  } catch (err) {
    console.error('[accept] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
