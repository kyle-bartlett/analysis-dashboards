# State Management & Temporal Consistency Audit
## Analysis Dashboard C2-CPFR
### Date: 2026-02-20 | Auditor: Knox (Automated Deep-Audit Cycle 7)

---

## Executive Summary

The C2-CPFR dashboard has **24 state management issues** across all severity levels. The application manages state across three distinct tiers — **client-side React state** (1,938-line monolithic component), **server-side API state** (ephemeral filesystem + live Google Sheets), and **browser persistence** (localStorage) — with **no synchronization protocol between them**. The most critical finding is that the "accept" operation logs an action to a changelog but **does NOT actually write values back to Google Sheets**, meaning the dashboard claims acceptance happened but the underlying data remains unchanged. Other critical issues include: charts that never update after initial render, derived state (KPIs, category breakdowns) computed from the wrong data source, and a localStorage-based settings system that creates per-device state fragmentation across multiple users sharing the same dashboard.

**Overall State Architecture Maturity: Level 1.5/5** — Basic React `useState` with no state management library, no server-side caching, no optimistic updates, and no state synchronization protocol. The single 1,938-line `page.tsx` contains all state logic with no separation of concerns.

---

## Findings Summary

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 CRITICAL | 5 | State corruption, data loss, or silently incorrect behavior |
| 🟠 HIGH | 8 | Significant UX issues or state inconsistencies |
| 🟡 MEDIUM | 7 | Suboptimal state patterns with moderate user impact |
| 🟢 LOW | 4 | Minor improvements and best practices |

---

## Critical Findings (🔴)

### C1. Accept Operation is a State Lie — Logs Entry but Never Writes to Sheets

**File:** `app/api/accept/route.ts` (lines 1–55)
**File:** `lib/sheets.ts` → `writeCpfrValues()` (never called)

The `POST /api/accept` handler:
1. Receives an accept direction (`anker_accepts_c2` or `c2_accepts_anker`)
2. Writes a changelog entry via `addChangeLogEntry()`
3. Sends an email alert
4. Returns `{ success: true }`

**What it does NOT do:** Call `writeCpfrValues()` to actually overwrite the forecast values in Google Sheets. The `writeCpfrValues` function exists in `lib/sheets.ts` and is fully implemented — but it is **never imported or called by any route**.

**State Consequence:**
- User clicks "Accept C2's Numbers" → sees success toast "Anker accepted all of C2's forecast numbers"
- Changelog shows the acceptance happened
- **But the actual Google Sheets data is UNCHANGED**
- Next data refresh still shows the same discrepancies
- User is left confused: "I accepted, why are there still discrepancies?"

**Severity:** 🔴 CRITICAL — The core business operation of the dashboard (forecast reconciliation) is non-functional. This is a state lie: the UI transitions to "accepted" state while the underlying data state remains "discrepant."

**Remediation:**
```typescript
// In app/api/accept/route.ts — after validation, BEFORE logging:
import { readCpfrSheet, writeCpfrValues } from '@/lib/sheets';

// 1. Read both sheets to find actual discrepancies
// 2. Build update list based on direction
// 3. Call writeCpfrValues() to apply changes
// 4. THEN log the changelog entry
// 5. Return success only if write succeeded
```

---

### C2. Charts Never Update — `chartsInitialized.current` Lock Prevents Re-render

**File:** `app/page.tsx` (lines ~475–600)

```typescript
const chartsInitialized = useRef(false);

useEffect(() => {
  if (!data || chartsInitialized.current) return;  // ← BLOCKS on second+ render
  // ... create charts ...
  chartsInitialized.current = true;
}, [data]);
```

Once charts are created on initial data load, the `chartsInitialized.current = true` flag permanently prevents chart updates. When `fetchData()` runs on the auto-refresh interval (every 1–30 min) and returns new data, `setData(forecast)` triggers a re-render, but the chart `useEffect` immediately returns because `chartsInitialized.current` is `true`.

**State Consequence:**
- Charts show data from the FIRST load only
- Auto-refresh updates the table but charts remain frozen
- If a user leaves the dashboard open for 8 hours, charts show 8-hour-old data while the table shows current data
- Category breakdown totals, weekly trend lines — all stale

**Why it's designed this way:** Chart.js creates canvas-bound instances. Re-creating them on every render would cause flicker/memory leaks. But the fix is to update the existing chart instance's data, not prevent updates entirely.

**Remediation:**
```typescript
const chartWeeklyInstance = useRef<Chart | null>(null);
const chartQuarterlyInstance = useRef<Chart | null>(null);

useEffect(() => {
  if (!data) return;
  
  if (chartWeeklyInstance.current) {
    // UPDATE existing chart data
    chartWeeklyInstance.current.data.datasets = buildWeeklyDatasets(data);
    chartWeeklyInstance.current.update();
  } else {
    // CREATE chart on first render
    chartWeeklyInstance.current = new Chart(ctx, config);
  }
}, [data]);
```

---

### C3. Changelog Stored in Ephemeral Filesystem — Data Loss on Every Deploy

**File:** `lib/changeLog.ts` (lines 1–50)

```typescript
const LOG_PATH = path.join(process.cwd(), 'data', 'changelog.json');
```

The changelog is stored as a JSON file on the serverless function's filesystem. On Vercel:
- **Serverless functions have read-only filesystems** (except `/tmp/`)
- Even if using `/tmp/`, it's **ephemeral** — cleared on every cold start, deploy, or instance rotation
- The code uses `process.cwd()` which points to the build directory, not `/tmp/`

**State Consequence:**
- Every Vercel deployment wipes the entire change history
- Multiple serverless instances each have their own changelog (write to one, read from another = missing entries)
- The comment in the code literally says: "On Vercel, this persists in /tmp/ during the function lifetime" — but the code doesn't even use `/tmp/`

**Severity:** 🔴 CRITICAL — The entire audit trail of forecast acceptances is lost on every deploy. For a CPFR tool shared between two companies (Anker + C2 Wireless), this is an accountability failure.

**Remediation:** Migrate to persistent storage:
- **Quick fix:** Vercel KV (Redis) or Vercel Blob
- **Proper fix:** Supabase/Neon Postgres table with proper schema
- **Minimum viable:** Write changelog entries back to a dedicated tab in the Google Sheet itself (data already lives there)

---

### C4. Derived State (KPIs) Computed from Unfiltered Data While Table Shows Filtered

**File:** `app/page.tsx` (lines ~750–770)

```typescript
// These KPIs use raw `skus` (ALL data):
const totalSkus = skus.length;
const totalOfc = skus.reduce((s, r) => s + r.totalOfc, 0);
const totalOH = skus.reduce((s, r) => s + r.oh, 0);
const avgWOS = skus.reduce((s, r) => s + r.wos, 0) / skus.length;
```

But the table shows `filtered` data (after category filter, search term, discrepancy filter, and column filters are applied). This means:

- User filters to "Wireless" category → table shows 4 SKUs
- KPI cards still show "15 Active SKUs", "124,619 Total Forecast Units" (all categories combined)
- Category breakdown cards also use `skus` (unfiltered) not `filtered`

**State Consequence:**
- KPIs and table tell contradictory stories
- A user filtering to see "Charger" category stats sees charger data in the table but ALL-category totals in the KPI cards
- This is misleading for anyone making business decisions based on the visible data

**Severity:** 🔴 CRITICAL — Business users may make incorrect procurement decisions based on mismatched KPIs and table data.

**Remediation:**
```typescript
// Compute KPIs from the filtered dataset:
const totalSkus = filtered.length;
const totalOfc = filtered.reduce((s, r) => s + r.totalOfc, 0);
// ... etc.

// OR: Show both — "15 of 45 SKUs" with filtered total / global total
```

---

### C5. Auto-Refresh Triggers Full React Re-render Even When Data is Identical

**File:** `app/page.tsx` (lines ~465–485)

```typescript
const fetchData = useCallback(async () => {
  const [forecastRes, changesRes] = await Promise.all([...]);
  const forecast: ForecastResponse = await forecastRes.json();
  const changesData = await changesRes.json();
  
  setData(forecast);          // ← Always sets, even if identical
  setChanges(changesData.entries || []);  // ← Always sets
}, []);
```

Every refresh (every 1–30 min) calls `setData()` with a new object reference, even if the underlying Google Sheets data hasn't changed. This triggers:
1. Full React re-render of the 1,938-line component
2. All `useMemo` recalculations (processedData, unique values, etc.)
3. DOM reconciliation for potentially 500+ table cells
4. If charts were properly updating (see C2), they'd flicker/redraw unnecessarily

**State Consequence:**
- Wasted CPU cycles on every refresh when nothing changed
- FilterState, sortState, and scroll position are preserved (they're separate state), but any transient UI state (open dropdowns, hover states) resets
- On slower devices (tablets viewing the dashboard), visible jank during re-render

**Severity:** 🔴 CRITICAL (combined with C2 — this is why charts were locked; the developer knew re-renders were problematic but chose the wrong fix)

**Remediation:**
```typescript
const fetchData = useCallback(async () => {
  const forecast = await forecastRes.json();
  
  // Only update state if data actually changed:
  setData(prev => {
    if (prev && JSON.stringify(prev.anker.data) === JSON.stringify(forecast.anker.data)
        && prev.anker.lastModified === forecast.anker.lastModified) {
      return prev; // Same reference = no re-render
    }
    return forecast;
  });
}, []);

// Better: Use ETag/Last-Modified headers from API, or content hash
```

---

## High Findings (🟠)

### H1. FilterState Object Uses Sets — useMemo Cache Misses Guaranteed

**File:** `app/page.tsx` (FilterState type + processedData useMemo)

```typescript
interface FilterState {
  textFilters: Record<string, Set<string>>;   // ← Set objects
  numericFilters: Record<string, { min: number | null; max: number | null }>;
}
```

`Set` objects don't participate in React's shallow comparison or `useMemo` dependency checks. Every time `setFilterState` is called with a new `FilterState` containing `Set` instances, React sees a new reference — even if the Set contents are identical. This means `processedData = useMemo(...)` with `filterState` as a dependency recalculates on every render where filters are involved, not just when filter values actually change.

Furthermore, the `ColumnFilterDropdown` creates new `Set` instances on every apply:
```typescript
newState.textFilters[columnKey] = new Set(localTextSet);  // New Set every time
```

**Impact:** Unnecessary recomputation of the entire filtered/sorted dataset on renders where only unrelated state changed but filterState reference was recreated.

---

### H2. localStorage State is Per-Device, Not Per-User — Multi-User Dashboard Has No Shared Settings

**File:** `app/page.tsx` (SettingsModal, refreshInterval initialization)

Settings stored in localStorage:
- `cpfr-refresh-interval` — auto-refresh frequency
- `cpfr-auto-accept-c2` — auto-accept toggle
- `cpfr-auto-accept-anker` — auto-accept toggle
- `cpfr-alert-email` — notification email
- `cpfr-webhook-url` — Slack/Teams webhook
- `cpfr-last-visit` — last visit timestamp (for "new changes" badge)

**Problem:** This is a SHARED dashboard between Anker and C2 Wireless. Two scenarios:
1. **Same person, different devices:** Settings don't sync between Kyle's laptop and phone/tablet
2. **Different users on shared URL:** Each user's localStorage is isolated, which is fine for preferences, but `cpfr-auto-accept-*` toggles are business logic that should be server-side
3. **Auto-accept toggles exist in UI but are NEVER READ by any accept logic** — they're stored but have no effect

**Impact:** Users configure auto-accept settings that do nothing. False sense of automation.

---

### H3. Confirm Modal Stores Callback Function in State — Stale Closure Risk

**File:** `app/page.tsx` (lines ~394–410)

```typescript
const [confirmModal, setConfirmModal] = useState<{
  title: string;
  message: string;
  confirmLabel: string;
  confirmColor: string;
  onConfirm: () => void;  // ← Function stored in state
} | null>(null);
```

When `setConfirmModal` is called, the `onConfirm` closure captures the current values of `handleAccept`, `fetchData`, etc. If the data refreshes between modal open and user clicking confirm (which can be seconds to minutes), the closure may reference stale state.

Specific scenario:
1. User clicks "Accept C2's Numbers" → modal opens with `onConfirm` capturing current state
2. Auto-refresh fires, `fetchData()` updates `data` state
3. User clicks "Accept" in the modal → stale closure runs, potentially with outdated discrepancy data

**Impact:** Accept operation could reference outdated forecast values, though since the accept API currently doesn't write to sheets (C1), this is theoretical until C1 is fixed.

---

### H4. `showToast` Is Not a Stable Callback — Can Cause Effect Loops

**File:** `app/page.tsx` (line ~740)

```typescript
const showToast = (message: string, type: 'success' | 'error' | 'info') => {
  setToast({ message, type });
};
```

`showToast` is recreated on every render (not wrapped in `useCallback`). It's called inside `fetchData` (line ~479 in the catch block), which IS wrapped in `useCallback`. This means:
- `fetchData` has an implicit dependency on `showToast` 
- But `showToast` isn't in `fetchData`'s dependency array (it's called as a module-scoped reference)
- ESLint exhaustive-deps would flag this

Fortunately, since `showToast` is defined inside the component but outside `fetchData`'s `useCallback`, it captures the latest `setToast` reference via closure (which is stable from `useState`). So this is more of a code quality issue than a bug. But if `fetchData`'s dependency array were properly exhaustive, `showToast`'s instability would cause `fetchData` to be recreated every render, breaking the `setInterval` in the `useEffect`.

---

### H5. No Loading/Stale Indicators During Auto-Refresh

**File:** `app/page.tsx` — `fetchData()` does not set `loading` state during refreshes

```typescript
const fetchData = useCallback(async () => {
  try {
    // No setLoading(true) here — only set at initialization
    const [forecastRes, changesRes] = await Promise.all([...]);
    // ...
  } catch (err) {
    showToast('Failed to load forecast data', 'error');
  } finally {
    setLoading(false);  // ← Only matters on first load
  }
}, []);
```

During auto-refresh, if the Google Sheets API is slow (2-5 seconds), the user has no indication that data is being refreshed. If the API fails, they see an error toast but the old data remains — with no visual indicator that the displayed data is now stale.

**Impact:** Users don't know if they're looking at current data or 30-minute-old cached data.

---

### H6. newChangesCount Based on localStorage Timestamp — Unreliable Across Users

**File:** `app/page.tsx` (lines ~475–482)

```typescript
const lastVisit = localStorage.getItem('cpfr-last-visit');
if (lastVisit && changesData.entries) {
  const newCount = changesData.entries.filter(
    (e: ChangeLogEntry) => new Date(e.timestamp) > new Date(lastVisit)
  ).length;
  setNewChangesCount(newCount);
}
localStorage.setItem('cpfr-last-visit', new Date().toISOString());
```

Problems:
1. `cpfr-last-visit` is written on EVERY fetch (including auto-refreshes), so after the first load, `newChangesCount` is always 0 on subsequent auto-refreshes within the same session
2. The badge says "🔔 3 new changes" but only on the very first page load — it goes to 0 after the first auto-refresh
3. `localStorage.setItem` is called even when `fetchData` fails (in the `try` block, before the `catch`)

**Impact:** The "new changes" notification is effectively useless — it shows briefly on first load then disappears.

---

### H7. Discrepancy Map Built on Every Render — Not Memoized

**File:** `app/page.tsx` (lines ~770–775)

```typescript
// These run on EVERY render, not inside useMemo:
const discrepancyMap = new Map<string, number>();
if (data.discrepancies) {
  for (const d of data.discrepancies) {
    discrepancyMap.set(`${d.sku}|${d.week}`, d.c2);
  }
}
```

With potentially hundreds of discrepancies, this Map is rebuilt on every render. Since the Map reference changes every render, every `DataRow` component that receives it as a prop will also re-render (React sees a new Map object ≠ old Map object).

**Impact:** Unnecessary re-renders of all table rows on every render cycle.

---

### H8. Column Widths Not Persisted — Lost on Page Refresh

**File:** `app/page.tsx` (line ~420)

```typescript
const [colWidths, setColWidths] = useState<Record<string, number>>({});
```

Users can resize columns by dragging column borders. But widths are stored only in React state — not in localStorage, URL params, or server-side. Every page reload, navigation, or auto-refresh-induced full remount resets all column widths.

**Impact:** Users who customize column widths for their workflow lose that customization constantly.

---

## Medium Findings (🟡)

### M1. Sort State Not Persisted or URL-Synced

Sort key and direction (`sortKey`, `sortDir`) are ephemeral React state. They're not encoded in the URL (no `?sort=price&dir=desc`) and not saved to localStorage. This means:
- Sharing a dashboard link doesn't share the current sort
- Page reload resets to default unsorted view
- Browser back/forward doesn't restore sort state

### M2. Search Term Not URL-Synced

`searchTerm` is ephemeral React state. A user searching for "A2698" can't share that filtered view via URL. No `?q=A2698` parameter.

### M3. Active Category Filter Not URL-Synced

`activeFilter` is ephemeral React state. Should be `?category=Wireless` in URL for shareability and back-button support.

### M4. Scroll Position Lost on Data Refresh

The `tableScrollRef` maintains scroll position across re-renders (React preserves DOM), but the `hasAutoScrolled` ref ensures auto-scroll to current week only happens once. However, if a re-render causes the table to unmount/remount (unlikely in current code but possible with React 19 concurrent features), scroll position is lost.

### M5. Toast Queueing — Multiple Toasts Overwrite Each Other

```typescript
const [toast, setToast] = useState<{...} | null>(null);
```

Only one toast at a time. If an auto-refresh error toast appears while an accept success toast is showing, the first toast is instantly replaced. No queue system.

### M6. Category Breakdown Cards Use Unfiltered Data

Same as C4 but for the category breakdown section specifically — the cards show total units per category from ALL data regardless of active filters, creating a visual mismatch with the filtered table below.

### M7. `accepting` State Not Per-Operation

```typescript
const [accepting, setAccepting] = useState(false);
```

One boolean for both "Accept C2's Numbers" and "Accept Anker's Numbers" buttons. Clicking either disables BOTH. In a multi-user scenario, there's no indication of WHICH direction was being accepted.

---

## Low Findings (🟢)

### L1. No Error Boundary Around Charts

If Chart.js fails to load from CDN (network issue, CSP block), the entire dashboard crashes. Charts should be in a React Error Boundary with a fallback.

### L2. `getStatusColor` Function Not Memoized

Called in the render path for each update card. Trivial computation, but could be a `useMemo` for consistency.

### L3. CSS Variables vs. Tailwind Hybrid

State-adjacent: the application uses both CSS custom properties (`var(--anker-blue)`) and Tailwind utility classes, sometimes for the same property. This makes it harder to implement theme state (dark/light mode toggle) because state changes would need to update both systems.

### L4. DataRow Component Not Memoized with `React.memo`

Every `DataRow` re-renders when the parent re-renders, even if that specific row's data hasn't changed. With 50+ rows and 30+ week columns, this is significant DOM reconciliation. Should be wrapped in `React.memo` with custom comparator.

---

## State Topology Map

```
┌─────────────────────────────────────────────────────────┐
│                    BROWSER (Client)                      │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │              React State (ephemeral)              │    │
│  │                                                   │    │
│  │  data ──────────── ForecastResponse               │    │
│  │  changes ───────── ChangeLogEntry[]               │    │
│  │  loading ───────── boolean                        │    │
│  │  activeFilter ──── string                         │    │
│  │  searchTerm ────── string                         │    │
│  │  sortKey/Dir ───── string | null / SortDir        │    │
│  │  filterState ───── FilterState (Sets inside!)     │    │
│  │  showDiscrepanciesOnly ── boolean                 │    │
│  │  showSettings ──── boolean                        │    │
│  │  toast ─────────── {message, type} | null         │    │
│  │  accepting ─────── boolean                        │    │
│  │  newChangesCount ─ number                         │    │
│  │  confirmModal ──── {title,msg,onConfirm} | null   │    │
│  │  refreshInterval ─ number                         │    │
│  │  colWidths ─────── Record<string, number>         │    │
│  │                                                   │    │
│  │  REFS (non-reactive):                             │    │
│  │  chartsInitialized ── boolean (NEVER resets!)     │    │
│  │  hasAutoScrolled ──── boolean                     │    │
│  │  chartWeeklyRef ────── HTMLCanvasElement           │    │
│  │  chartQuarterlyRef ─── HTMLCanvasElement           │    │
│  │  tableScrollRef ────── HTMLDivElement              │    │
│  └───────────┬───────────────────────────────────────┘    │
│              │                                            │
│  ┌───────────▼───────────────────────────────────────┐    │
│  │            localStorage (per-device)               │    │
│  │                                                   │    │
│  │  cpfr-refresh-interval ── number (ms)             │    │
│  │  cpfr-auto-accept-c2 ─── boolean (UNUSED)        │    │
│  │  cpfr-auto-accept-anker ─ boolean (UNUSED)       │    │
│  │  cpfr-alert-email ─────── string (UNUSED)        │    │
│  │  cpfr-webhook-url ─────── string (UNUSED)        │    │
│  │  cpfr-last-visit ──────── ISO timestamp           │    │
│  └───────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────┘
                           │ fetch() every N ms
                           ▼
┌─────────────────────────────────────────────────────────┐
│               VERCEL SERVERLESS (Server)                 │
│                                                          │
│  ┌──────────────────────────────┐                       │
│  │   API Routes (stateless)     │                       │
│  │                              │                       │
│  │  GET /api/forecast ──────────┼──→ Google Sheets API  │
│  │  GET /api/changes ───────────┼──→ filesystem JSON    │
│  │  POST /api/accept ───────────┼──→ filesystem JSON    │
│  │  POST /api/alerts ───────────┼──→ Resend / webhook   │
│  └──────────────────────────────┘                       │
│                                                          │
│  ┌──────────────────────────────┐                       │
│  │  Ephemeral Filesystem        │                       │
│  │                              │                       │
│  │  data/changelog.json ────────│ LOST ON DEPLOY        │
│  └──────────────────────────────┘                       │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              GOOGLE SHEETS (Source of Truth)              │
│                                                          │
│  Anker Sheet ───── kyle.bartlett@anker.com (read/write)  │
│  Mirror Sheet ──── krbartle@gmail.com (read/write)       │
│  C2 Sheet ──────── (optional, dual-mode)                 │
│                                                          │
│  Sync: cron script (sync.py) every 15 min               │
│  Anker Sheet → Mirror Sheet                              │
└─────────────────────────────────────────────────────────┘
```

---

## State Lifecycle Analysis

### Data Flow: Forecast Values

```
Google Sheet (Anker) ──[15min cron]──→ Mirror Sheet ──[API call]──→ React `data` state
                                                                          │
                                                            ┌─────────────┤
                                                            ▼             ▼
                                                      processedData    KPIs (BUG: uses
                                                    (filtered/sorted)   unfiltered data)
                                                            │
                                                            ▼
                                                      Table render
```

**Staleness window:** Up to 15 min (cron sync) + N min (auto-refresh interval) = potentially 45 minutes of stale data with no indicator.

### Data Flow: Accept Operation

```
User clicks "Accept" ──→ POST /api/accept
                              │
                    ┌─────────┤ (current behavior)
                    ▼         ▼
              changelog.json   Email alert
              (ephemeral)      (fire-and-forget)
                    │
                    ▼
              ❌ NEVER writes to Google Sheets
              ❌ No optimistic UI update
              ❌ No rollback on failure
```

### Data Flow: Settings

```
User configures in SettingsModal
         │
         ▼
   localStorage.setItem()
         │
         ▼
   ❌ Settings NEVER READ by business logic
   ❌ auto-accept toggles are decorative
   ❌ alert email/webhook stored but accept route uses env vars
```

---

## State Invariants (Identified & Analyzed)

### Invariant 1: "Accepted forecasts should not show discrepancies"
**Status:** VIOLATED — Accept doesn't write to sheets, so discrepancies persist permanently.

### Invariant 2: "KPIs reflect the currently visible data"
**Status:** VIOLATED — KPIs use unfiltered data while table shows filtered data.

### Invariant 3: "Charts reflect current data"
**Status:** VIOLATED — Charts freeze after first render.

### Invariant 4: "Changelog entries correspond to actual data changes"
**Status:** VIOLATED — Changelog records acceptances that never happened at the data layer.

### Invariant 5: "Auto-refresh shows latest data without jarring UX"
**Status:** PARTIALLY VIOLATED — Re-renders even when data unchanged; no stale indicator; no loading indicator during refresh.

### Invariant 6: "User settings persist across sessions"
**Status:** PARTIALLY MET — localStorage works per-device but not cross-device. Some settings (auto-accept) are non-functional.

---

## Remediation Roadmap

### Phase 1: Critical Fixes (Effort: ~8 hours)

| Priority | Issue | Fix | Effort |
|----------|-------|-----|--------|
| P0 | C1 | Wire up `writeCpfrValues()` in accept route | 3h |
| P0 | C3 | Migrate changelog to Vercel KV or Google Sheet tab | 2h |
| P0 | C4 | Compute KPIs from `filtered` data | 30min |
| P0 | C2 | Store chart instances in refs, update data on refresh | 2h |
| P0 | C5 | Add shallow comparison before `setData()` | 30min |

### Phase 2: UX State Improvements (Effort: ~6 hours)

| Priority | Issue | Fix | Effort |
|----------|-------|-----|--------|
| P1 | H5 | Add `isRefreshing` state + visual indicator | 1h |
| P1 | H1 | Convert filterState Sets to sorted arrays for stable comparison | 1.5h |
| P1 | H7 | Memoize discrepancyMap with `useMemo` | 30min |
| P1 | M1-M3 | Sync sort/filter/search to URL params via `useSearchParams` | 2h |
| P1 | H6 | Fix newChangesCount logic — don't reset on auto-refresh | 1h |

### Phase 3: Architecture (Effort: ~12 hours)

| Priority | Issue | Fix | Effort |
|----------|-------|-----|--------|
| P2 | H2 | Migrate settings to server-side (API route + simple KV) | 3h |
| P2 | L4 | Wrap DataRow in React.memo with custom comparator | 1h |
| P2 | H8 | Persist column widths to localStorage | 1h |
| P2 | All | Extract state into custom hooks (useForecaseData, useFilters, useSettings) | 4h |
| P2 | All | Add React Error Boundaries around charts and table | 1h |
| P2 | M5 | Implement toast queue with auto-dismiss | 2h |

### Phase 4: Production-Grade (Effort: ~16 hours)

| Priority | Issue | Fix | Effort |
|----------|-------|-----|--------|
| P3 | — | Add server-side caching (Vercel KV) with ETag-based invalidation | 4h |
| P3 | — | Implement optimistic UI for accept operations with rollback | 4h |
| P3 | — | Add WebSocket or Server-Sent Events for real-time sync | 6h |
| P3 | — | Implement proper state management (Zustand or Jotai) | 4h (refactor) |

---

## State Architecture Maturity Assessment

| Module | Current Level | Target Level | Effort |
|--------|--------------|--------------|--------|
| Forecast Data | 1 (raw useState, no cache) | 3 (cached, ETag, optimistic) | 8h |
| Filter/Sort | 1.5 (useState, not URL-synced) | 3 (URL params, shareable) | 3h |
| Settings | 1 (localStorage, non-functional) | 3 (server-persisted, per-user) | 4h |
| Changelog | 0.5 (ephemeral filesystem!) | 3 (persistent DB, paginated) | 3h |
| Charts | 1 (frozen after init) | 2.5 (reactive updates, no flicker) | 2h |
| Accept Flow | 0 (does nothing!) | 3 (writes to sheets, optimistic UI, rollback) | 6h |
| Toast/Notifications | 1 (single, no queue) | 2 (queued, dismissible) | 2h |

**Maturity Scale:**
- Level 0: Broken or non-existent
- Level 1: Basic implementation, ephemeral, no persistence
- Level 2: Persistent, handles basic edge cases
- Level 3: Robust, shared, URL-synced, proper error handling
- Level 4: Optimistic updates, real-time sync, proper caching
- Level 5: Event-sourced, conflict resolution, audit trail

---

## Conclusion

The C2-CPFR dashboard's state management has a fundamental disconnect: **the most important stateful operation (forecast acceptance) doesn't actually modify state**. Combined with frozen charts, mismatched KPIs, ephemeral storage, and non-functional settings, the dashboard is currently a **read-only visualization tool masquerading as a collaborative planning tool**. The table rendering and filtering work well, but every piece of state that involves persistence, sharing, or write-back is broken or decorative.

The good news: the code is well-structured enough that each fix is surgical and independent. The remediation roadmap prioritizes fixing the accept pipeline first (the core business value), then UX state improvements (URL sync, refresh indicators), then architectural improvements (proper state management, real-time sync).

**Estimated total remediation effort: ~42 engineering hours across 4 phases.**
