// =============================================================================
// Alerts — Email (Resend) + Webhook (Slack/Teams)
// =============================================================================
// Gracefully skips if not configured. Never blocks the main flow.

import type { AlertRequest } from './types';

// ---------------------------------------------------------------------------
// Email via Resend
// ---------------------------------------------------------------------------
async function sendEmail(to: string, subject: string, message: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('[alerts] Resend not configured, skipping email');
    return false;
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: 'CPFR Dashboard <noreply@bartlettlabs.io>',
      to,
      subject,
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #00A9E0; padding: 20px 30px; border-radius: 8px 8px 0 0;">
            <h2 style="color: white; margin: 0;">C2W & VC Charging CPFR</h2>
          </div>
          <div style="background: #1a202c; padding: 30px; border-radius: 0 0 8px 8px; color: #e2e8f0;">
            <p style="line-height: 1.6;">${message}</p>
            <hr style="border: 1px solid #2d3748; margin: 20px 0;">
            <p style="font-size: 12px; color: #718096;">
              This alert was sent from the CPFR Shared Forecast Dashboard.
              <br>View the dashboard at <a href="https://c2-cpfr.vercel.app" style="color: #00A9E0;">c2-cpfr.vercel.app</a>
            </p>
          </div>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error('[alerts] Email send failed:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Webhook (Slack / Teams / generic)
// ---------------------------------------------------------------------------
async function sendWebhook(
  url: string,
  message: string,
  subject?: string
): Promise<boolean> {
  if (!url) {
    console.log('[alerts] No webhook URL, skipping');
    return false;
  }

  try {
    // Slack-compatible payload
    const payload = {
      text: subject ? `*${subject}*\n${message}` : message,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: subject || 'CPFR Dashboard Alert',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: message,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '<https://c2-cpfr.vercel.app|View Dashboard>',
            },
          ],
        },
      ],
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return res.ok;
  } catch (err) {
    console.error('[alerts] Webhook send failed:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Unified alert sender
// ---------------------------------------------------------------------------
export async function sendAlert(req: AlertRequest): Promise<{ sent: boolean; method: string }> {
  if (req.type === 'email') {
    const to = req.to || process.env.ALERT_EMAIL_C2 || process.env.ALERT_EMAIL_ANKER;
    if (!to) return { sent: false, method: 'email (no recipient)' };
    const sent = await sendEmail(to, req.subject || 'CPFR Update', req.message);
    return { sent, method: 'email' };
  }

  if (req.type === 'webhook') {
    const url = req.webhookUrl || process.env.SLACK_WEBHOOK_URL;
    if (!url) return { sent: false, method: 'webhook (no URL)' };
    const sent = await sendWebhook(url, req.message, req.subject);
    return { sent, method: 'webhook' };
  }

  return { sent: false, method: 'unknown' };
}
