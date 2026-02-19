// =============================================================================
// POST /api/alerts — Send email/webhook alerts
// =============================================================================

import { NextResponse } from 'next/server';
import { sendAlert } from '@/lib/alerts';
import type { AlertRequest } from '@/lib/types';

export async function POST(req: Request) {
  try {
    const body: AlertRequest = await req.json();

    if (!body.type || !body.message) {
      return NextResponse.json(
        { error: 'Missing required fields: type, message' },
        { status: 400 }
      );
    }

    const result = await sendAlert(body);

    return NextResponse.json({
      success: result.sent,
      method: result.method,
      message: result.sent
        ? `Alert sent via ${result.method}`
        : `Alert not sent: ${result.method} not configured`,
    });
  } catch (err) {
    console.error('[alerts] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
