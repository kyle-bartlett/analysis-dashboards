# C2W & VC Charging CPFR Dashboard

Collaborative Planning, Forecasting & Replenishment dashboard for Anker ↔ C2 Wireless / VoiceComm.

**Live:** [c2-cpfr.vercel.app](https://c2-cpfr.vercel.app)

## Features

- 📊 **Dual-Source Forecast View** — Shows both Anker and C2's forecast data side-by-side
- ⚡ **Discrepancy Detection** — Highlights where Anker and C2 disagree on quantities
- ✅ **Accept System** — One-click accept of the other side's numbers
- 📋 **Change Log** — Tracks all acceptance/update actions with timestamps
- 🔔 **Alerts** — Email (Resend) + Slack/Teams webhook notifications
- 🔄 **Auto-Refresh** — Fetches fresh data every 5 minutes
- 📱 **Responsive** — Works on desktop and tablet

## Quick Start

```bash
# Install dependencies
npm install

# Copy env template
cp .env.local.example .env.local

# Run dev server
npm run dev
```

The dashboard works **without any API keys** — it falls back to hardcoded sample data.

## Google Sheets Setup

### Option 1: Service Account (Recommended for Production)

1. Go to [GCP Console](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Create a service account in the "gmail-brain" project
3. Enable the **Google Sheets API** and **Google Drive API**
4. Create a JSON key for the service account
5. Share the Google Sheet with the service account email (viewer for read-only, editor for accept/write)
6. Add to `.env.local`:

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-sa@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
ANKER_SHEET_ID=1GfRZBTAU_oHO6o0jtv_Q9lZRisUznrx9Sfu0_EbwHIs
```

### Option 2: OAuth (Kyle's `gog` CLI tokens)

The app currently uses the service account approach. To use Kyle's existing OAuth tokens from `gog`, the auth setup in `lib/sheets.ts` would need to be modified to use refresh tokens.

## C2's Sheet

When C2 provides their forecast sheet:

1. Add `C2_SHEET_ID=<their-sheet-id>` to `.env.local`
2. Make sure the sheet tab is named `CPFR` (or set `C2_SHEET_TAB`)
3. The dashboard will automatically switch to dual-source mode and show discrepancies

### C2 Sheet Template

C2's sheet should have a `CPFR` tab with this column structure (row 5 = headers, data starts row 6):

| Col | Header | Description |
|-----|--------|-------------|
| A | Q1 | Q1 forecast units |
| B | Q2 | Q2 forecast units |
| C | Q3 | Q3 forecast units |
| D | Q4 | Q4 forecast units |
| E | Price | Unit price |
| F | PDT | Product type (Essential/Wireless/Battery/Charger) |
| G | Sellout avg | Average sellout |
| H | OH | On-hand inventory |
| I | WOS | Weeks of supply |
| J | Total OFC | Total forecast |
| Q | Customer | Customer name |
| T | Anker SKU | SKU identifier |
| U+ | Week columns | Weekly sell-in (202606, 202607, ...) |

## Alerts Setup

### Email (Resend)

1. Sign up at [resend.com](https://resend.com) (free: 100 emails/day)
2. Add `RESEND_API_KEY=re_xxxxx` to `.env.local`
3. Set `ALERT_EMAIL_ANKER` and `ALERT_EMAIL_C2`

### Slack/Teams Webhook

1. Create an incoming webhook in your Slack workspace
2. Add `SLACK_WEBHOOK_URL=https://hooks.slack.com/...` to `.env.local`

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/forecast` | GET | Fetch merged forecast data from both sheets |
| `/api/accept` | POST | Accept the other side's forecast numbers |
| `/api/changes` | GET | Fetch the change/acceptance log |
| `/api/alerts` | POST | Send email or webhook alert |

## Deployment

Deployed to Vercel. Push to main branch auto-deploys.

```bash
vercel --prod
```

Set environment variables in Vercel dashboard → Settings → Environment Variables.

## Architecture

```
c2-cpfr/
├── app/
│   ├── page.tsx          # Main dashboard (React + Tailwind)
│   ├── layout.tsx        # Root layout
│   ├── globals.css       # All custom styles (dark theme)
│   └── api/
│       ├── forecast/     # GET: merged forecast data
│       ├── accept/       # POST: accept numbers
│       ├── changes/      # GET: change log
│       └── alerts/       # POST: send alerts
├── lib/
│   ├── types.ts          # TypeScript interfaces
│   ├── sheets.ts         # Google Sheets API wrapper
│   ├── fallbackData.ts   # Hardcoded sample data
│   ├── changeLog.ts      # Change tracking (JSON file)
│   └── alerts.ts         # Email + webhook sender
└── data/                 # Runtime: changelog.json
```

---

**CONFIDENTIAL** — Proprietary forecast data under NDA. Do not distribute.
