'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { ForecastResponse, SkuForecast, ChangeLogEntry } from '@/lib/types';

// =============================================================================
// CONSTANTS
// =============================================================================
const CATEGORIES = ['Essential', 'Wireless', 'Battery', 'Charger'] as const;
const CAT_COLORS: Record<string, string> = {
  Essential: '#00DB84',
  Wireless: '#00A9E0',
  Battery: '#ed8936',
  Charger: '#f56565',
};

const REFRESH_INTERVAL =
  typeof window !== 'undefined'
    ? parseInt(
        (window as unknown as Record<string, string>)
          .NEXT_PUBLIC_REFRESH_INTERVAL || '300000',
        10
      )
    : 300000;

// =============================================================================
// TOAST COMPONENT
// =============================================================================
function Toast({
  message,
  type,
  onDone,
}: {
  message: string;
  type: 'success' | 'error' | 'info';
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className={`toast ${type}`}>
      {type === 'success' && '✓ '}
      {type === 'error' && '✕ '}
      {type === 'info' && 'ℹ '}
      {message}
    </div>
  );
}

// =============================================================================
// SETTINGS MODAL
// =============================================================================
function SettingsModal({ onClose }: { onClose: () => void }) {
  const [refreshMin, setRefreshMin] = useState(5);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-[var(--anker-blue)]">
            ⚙️ Dashboard Settings
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-white transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="space-y-6">
          {/* Auto-refresh */}
          <div>
            <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
              Auto-Refresh Interval
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={30}
                value={refreshMin}
                onChange={(e) => setRefreshMin(parseInt(e.target.value))}
                className="flex-1 accent-[var(--anker-blue)]"
              />
              <span className="text-sm text-[var(--text-muted)] w-16 text-right">
                {refreshMin} min
              </span>
            </div>
          </div>

          {/* Alert preferences */}
          <div>
            <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
              Alert Preferences
            </label>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-4 h-4 accent-[var(--anker-blue)] rounded"
                />
                <span className="text-sm text-[var(--text-muted)]">
                  Email alerts on forecast changes
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-[var(--anker-blue)] rounded"
                />
                <span className="text-sm text-[var(--text-muted)]">
                  Slack/webhook notifications
                </span>
              </label>
            </div>
          </div>

          {/* Webhook URL */}
          <div>
            <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
              Webhook URL (Slack/Teams)
            </label>
            <input
              type="url"
              placeholder="https://hooks.slack.com/..."
              className="w-full px-4 py-2.5 rounded-xl border border-[rgba(0,169,224,0.3)] bg-[rgba(26,32,44,0.8)] text-[var(--text-secondary)] text-sm outline-none focus:border-[var(--anker-blue)] focus:ring-2 focus:ring-[rgba(0,169,224,0.15)] transition-all"
            />
          </div>

          {/* Data source info */}
          <div className="bg-[rgba(0,169,224,0.06)] rounded-xl p-4 border border-[rgba(0,169,224,0.15)]">
            <p className="text-xs text-[var(--text-dim)]">
              📊 Data Source: Google Sheets API
              <br />
              🔄 Next refresh in: {refreshMin} minutes
              <br />
              📍 Mode: Single-source (Anker only)
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-[var(--anker-blue)] text-white font-semibold text-sm hover:bg-[var(--anker-blue-light)] transition-colors"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// CHANGELOG SECTION
// =============================================================================
function ChangeLogSection({ entries }: { entries: ChangeLogEntry[] }) {
  const [expanded, setExpanded] = useState(false);

  if (entries.length === 0) return null;

  return (
    <div className="card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <h2 className="text-2xl font-bold text-[var(--anker-blue)]">
          📋 Change Log
        </h2>
        <span className="text-[var(--text-muted)] text-sm">
          {expanded ? '▾ Collapse' : '▸ Expand'} · {entries.length} entries
        </span>
      </button>

      {expanded && (
        <div className="mt-5 space-y-0">
          {entries.map((e) => (
            <div
              key={e.id}
              className={`changelog-entry action-${e.action}`}
            >
              <div className="flex items-center gap-3 mb-1">
                <span className="text-sm font-bold text-[var(--text-secondary)]">
                  {e.actor}
                </span>
                <span className="text-xs text-[var(--text-dim)]">
                  {new Date(e.timestamp).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="text-sm text-[var(--text-muted)]">{e.details}</p>
              {e.skus.length > 0 && (
                <p className="text-xs text-[var(--text-dim)] mt-1">
                  SKUs: {e.skus.join(', ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN DASHBOARD PAGE
// =============================================================================
export default function Dashboard() {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [changes, setChanges] = useState<ChangeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [newChangesCount, setNewChangesCount] = useState(0);
  const chartWeeklyRef = useRef<HTMLCanvasElement>(null);
  const chartQuarterlyRef = useRef<HTMLCanvasElement>(null);
  const chartsInitialized = useRef(false);

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------
  const fetchData = useCallback(async () => {
    try {
      const [forecastRes, changesRes] = await Promise.all([
        fetch('/api/forecast'),
        fetch('/api/changes'),
      ]);

      const forecast: ForecastResponse = await forecastRes.json();
      const changesData = await changesRes.json();

      setData(forecast);
      setChanges(changesData.entries || []);

      // Check for new changes since last visit
      const lastVisit = localStorage.getItem('cpfr-last-visit');
      if (lastVisit && changesData.entries) {
        const newCount = changesData.entries.filter(
          (e: ChangeLogEntry) => new Date(e.timestamp) > new Date(lastVisit)
        ).length;
        setNewChangesCount(newCount);
      }
      localStorage.setItem('cpfr-last-visit', new Date().toISOString());
    } catch (err) {
      console.error('Failed to fetch data:', err);
      showToast('Failed to load forecast data', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ---------------------------------------------------------------------------
  // Charts (Chart.js loaded from CDN)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!data || chartsInitialized.current) return;

    const loadCharts = async () => {
      // Dynamic import of Chart.js from CDN
      if (!(window as unknown as Record<string, unknown>).Chart) {
        const script = document.createElement('script');
        script.src =
          'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
        script.async = true;
        document.head.appendChild(script);
        await new Promise((resolve) => {
          script.onload = resolve;
        });
      }

      const Chart = (window as unknown as Record<string, unknown>).Chart as {
        new (
          ctx: CanvasRenderingContext2D,
          config: Record<string, unknown>
        ): unknown;
      };

      const skus = data.anker.data;
      const WEEKS = data.meta.weekColumns.length || 30;
      const weekLabels = data.meta.weekColumns;

      // Weekly forecast by category (stacked area)
      if (chartWeeklyRef.current) {
        const ctx = chartWeeklyRef.current.getContext('2d');
        if (ctx) {
          const datasets = CATEGORIES.map((cat) => {
            const items = skus.filter((s) => s.category === cat);
            const weekTotals = Array.from({ length: WEEKS }, (_, w) => {
              const wk = weekLabels[w];
              return items.reduce((s, r) => s + (r.weeks[wk] || 0), 0);
            });
            return {
              label: cat,
              data: weekTotals,
              borderColor: CAT_COLORS[cat],
              backgroundColor: CAT_COLORS[cat] + '30',
              fill: true,
              tension: 0.35,
              borderWidth: 2,
              pointRadius: 0,
              pointHoverRadius: 4,
            };
          });

          new Chart(ctx, {
            type: 'line',
            data: { labels: weekLabels, datasets },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              plugins: {
                legend: {
                  labels: { color: '#a0aec0', font: { size: 12 } },
                },
                tooltip: {
                  backgroundColor: 'rgba(26,32,44,0.95)',
                  borderColor: '#00A9E0',
                  borderWidth: 1,
                  titleColor: '#e2e8f0',
                  bodyColor: '#cbd5e0',
                  callbacks: {
                    label: (ctx: { dataset: { label: string }; parsed: { y: number } }) =>
                      `${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()} units`,
                  },
                },
              },
              scales: {
                x: {
                  ticks: { color: '#4a5568', maxRotation: 45 },
                  grid: { color: 'rgba(255,255,255,0.04)' },
                },
                y: {
                  stacked: true,
                  ticks: {
                    color: '#4a5568',
                    callback: (v: number) =>
                      v >= 1000 ? v / 1000 + 'K' : v,
                  },
                  grid: { color: 'rgba(255,255,255,0.06)' },
                },
              },
            },
          });
        }
      }

      // Quarterly bar chart
      if (chartQuarterlyRef.current) {
        const ctx = chartQuarterlyRef.current.getContext('2d');
        if (ctx) {
          const datasets = CATEGORIES.map((cat) => {
            const items = skus.filter((s) => s.category === cat);
            return {
              label: cat,
              data: [
                items.reduce((s, r) => s + r.q1, 0),
                items.reduce((s, r) => s + r.q2, 0),
                items.reduce((s, r) => s + r.q3, 0),
                items.reduce((s, r) => s + r.q4, 0),
              ],
              backgroundColor: CAT_COLORS[cat] + 'CC',
              borderColor: CAT_COLORS[cat],
              borderWidth: 1,
              borderRadius: 4,
            };
          });

          new Chart(ctx, {
            type: 'bar',
            data: { labels: ['Q1', 'Q2', 'Q3', 'Q4'], datasets },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  labels: { color: '#a0aec0', font: { size: 12 } },
                },
                tooltip: {
                  backgroundColor: 'rgba(26,32,44,0.95)',
                  borderColor: '#00A9E0',
                  borderWidth: 1,
                  titleColor: '#e2e8f0',
                  bodyColor: '#cbd5e0',
                  callbacks: {
                    label: (ctx: { dataset: { label: string }; parsed: { y: number } }) =>
                      `${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()} units`,
                  },
                },
              },
              scales: {
                x: {
                  ticks: { color: '#4a5568' },
                  grid: { color: 'rgba(255,255,255,0.04)' },
                },
                y: {
                  ticks: {
                    color: '#4a5568',
                    callback: (v: number) =>
                      v >= 1000 ? v / 1000 + 'K' : v,
                  },
                  grid: { color: 'rgba(255,255,255,0.06)' },
                },
              },
            },
          });
        }
      }

      chartsInitialized.current = true;
    };

    loadCharts();
  }, [data]);

  // ---------------------------------------------------------------------------
  // Accept handler
  // ---------------------------------------------------------------------------
  const handleAccept = async (direction: 'anker_accepts_c2' | 'c2_accepts_anker') => {
    setAccepting(true);
    try {
      const res = await fetch('/api/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction, scope: 'all' }),
      });
      const result = await res.json();

      if (result.success) {
        showToast(result.message, 'success');
        fetchData(); // Refresh
      } else {
        showToast('Accept failed: ' + (result.error || 'Unknown error'), 'error');
      }
    } catch {
      showToast('Network error — could not accept forecast', 'error');
    } finally {
      setAccepting(false);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  };

  // ---------------------------------------------------------------------------
  // Computed values
  // ---------------------------------------------------------------------------
  if (loading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">📊</div>
          <p className="text-[var(--text-muted)]">Loading forecast data...</p>
        </div>
      </div>
    );
  }

  const skus = data.anker.data;
  const totalSkus = skus.length;
  const totalOfc = skus.reduce((s, r) => s + r.totalOfc, 0);
  const totalOH = skus.reduce((s, r) => s + r.oh, 0);
  const avgWOS =
    skus.length > 0
      ? parseFloat(
          (skus.reduce((s, r) => s + r.wos, 0) / skus.length).toFixed(1)
        )
      : 0;

  const weekColumns = data.meta.weekColumns;
  const isDualMode = data.meta.mode === 'dual';
  const discrepancyMap = new Map<string, number>();
  if (data.discrepancies) {
    for (const d of data.discrepancies) {
      discrepancyMap.set(`${d.sku}|${d.week}`, d.c2);
    }
  }

  // Filtered SKUs
  const filterSkus = (items: SkuForecast[]) => {
    return items.filter((s) => {
      if (activeFilter !== 'all' && s.category !== activeFilter) return false;
      if (searchTerm) {
        const t = searchTerm.toLowerCase();
        return (
          s.sku.toLowerCase().includes(t) ||
          s.customer.toLowerCase().includes(t) ||
          (s.description || '').toLowerCase().includes(t) ||
          s.category.toLowerCase().includes(t)
        );
      }
      return true;
    });
  };

  // Status dot color based on time difference
  const getStatusColor = (dateStr: string) => {
    const now = new Date();
    const d = new Date(dateStr);
    const diffHours = (now.getTime() - d.getTime()) / (1000 * 60 * 60);
    if (diffHours < 24) return 'green';
    if (diffHours < 72) return 'yellow';
    return 'red';
  };

  return (
    <>
      {/* HEADER */}
      <div className="header">
        <div className="relative z-10 flex justify-between items-center flex-wrap gap-4">
          <div>
            <h1 className="text-4xl lg:text-[44px] font-extrabold tracking-tight"
              style={{ textShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
              C2W &amp; VC Charging CPFR
            </h1>
            <p className="text-base lg:text-lg opacity-95 mt-1.5">
              Collaborative Planning, Forecasting &amp; Replenishment — 2026
            </p>
          </div>
          <div className="text-right flex flex-col items-end gap-2">
            <div className="flex items-center gap-3">
              {newChangesCount > 0 && (
                <span className="changes-badge">
                  🔔 {newChangesCount} new change{newChangesCount > 1 ? 's' : ''}
                </span>
              )}
              <span className="inline-block bg-white/20 px-5 py-2 rounded-2xl text-sm font-semibold backdrop-blur-lg border border-white/30">
                Shared Forecast Dashboard
              </span>
              <button
                onClick={() => setShowSettings(true)}
                className="w-10 h-10 rounded-xl bg-white/15 border border-white/30 flex items-center justify-center text-lg hover:bg-white/25 transition-colors cursor-pointer"
                title="Settings"
              >
                ⚙️
              </button>
            </div>
            <div className="inline-flex items-center gap-2 bg-white/15 px-4 py-1.5 rounded-2xl text-xs font-semibold border border-white/20">
              <span
                className="w-2 h-2 rounded-full bg-[var(--green)]"
                style={{ animation: 'dot-blink 2s ease-in-out infinite' }}
              />
              {isDualMode ? 'Dual-Source Sync Active' : 'Single-Source Mode'}
            </div>
          </div>
        </div>
      </div>

      {/* DASHBOARD */}
      <div className="max-w-[1800px] mx-auto px-5 lg:px-[60px] py-10">
        {/* LAST UPDATED PANEL */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-9">
          <div className="update-card anker">
            <div className="flex items-center gap-3 mb-3.5">
              <div
                className={`status-dot ${getStatusColor(data.anker.lastModified)}`}
              />
              <span className="text-lg font-bold text-[var(--text-secondary)]">
                Anker (Kyle Bartlett)
              </span>
            </div>
            <p className="text-sm text-[var(--text-muted)] mb-2.5">
              Last updated:{' '}
              <strong className="text-[var(--text-secondary)]">
                {new Date(data.anker.lastModified).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  timeZoneName: 'short',
                })}
              </strong>
            </p>
            <div className="text-xs leading-relaxed text-[var(--text-muted)] bg-[rgba(0,169,224,0.08)] p-2.5 px-3.5 rounded-lg border-l-[3px] border-l-[rgba(0,169,224,0.4)]">
              Updated forecast quantities for Essential SKUs; adjusted sell-through estimates based on latest POS data.
            </div>
          </div>

          <div className="update-card customer">
            <div className="flex items-center gap-3 mb-3.5">
              <div
                className={`status-dot ${
                  data.c2
                    ? getStatusColor(data.c2.lastModified)
                    : 'yellow'
                }`}
              />
              <span className="text-lg font-bold text-[var(--text-secondary)]">
                C2 Wireless
              </span>
            </div>
            <p className="text-sm text-[var(--text-muted)] mb-2.5">
              Last updated:{' '}
              <strong className="text-[var(--text-secondary)]">
                {data.c2
                  ? new Date(data.c2.lastModified).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZoneName: 'short',
                    })
                  : 'Not connected'}
              </strong>
            </p>
            <div className="text-xs leading-relaxed text-[var(--text-muted)] bg-[rgba(0,169,224,0.08)] p-2.5 px-3.5 rounded-lg border-l-[3px] border-l-[rgba(237,137,54,0.4)]">
              {data.c2
                ? 'Revised on-hand counts and updated sell-in actuals.'
                : 'C2 sheet not connected. Dashboard running in single-source mode showing Anker data only.'}
            </div>
          </div>
        </div>

        {/* ACCEPT BUTTONS (only in dual mode with discrepancies) */}
        {isDualMode && data.discrepancies.length > 0 && (
          <div className="card mb-9">
            <h2 className="text-2xl font-bold text-[var(--anker-blue)] mb-4">
              ⚡ Forecast Discrepancies
            </h2>
            <p className="text-sm text-[var(--text-muted)] mb-5">
              {data.discrepancies.length} discrepancies found between Anker and C2 forecasts.
              Review and accept to align.
            </p>
            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => handleAccept('anker_accepts_c2')}
                disabled={accepting}
                className="accept-btn px-8 py-3.5 rounded-xl bg-[var(--anker-blue)] text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {accepting ? '⏳ Processing...' : '✓ Accept C2\'s Numbers'}
              </button>
              <button
                onClick={() => handleAccept('c2_accepts_anker')}
                disabled={accepting}
                className="accept-btn px-8 py-3.5 rounded-xl bg-[var(--orange)] text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {accepting ? '⏳ Processing...' : '✓ Accept Anker\'s Numbers'}
              </button>
            </div>
          </div>
        )}

        {/* KPI CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-9">
          {[
            {
              val: totalSkus.toString(),
              label: 'Active SKUs',
              sub: `${data.meta.categories.length} categories`,
            },
            {
              val: totalOfc.toLocaleString(),
              label: 'Total Forecast Units',
              sub: 'All weeks combined',
            },
            {
              val: totalOH.toLocaleString(),
              label: 'Current On-Hand',
              sub: 'Across all SKUs',
            },
            {
              val: avgWOS + ' wks',
              label: 'Avg Weeks of Supply',
              sub: 'OH ÷ Sellout Avg',
            },
          ].map((kpi, i) => (
            <div key={i} className="kpi-card">
              <div className="text-4xl font-extrabold text-[var(--anker-blue)] mb-1.5">
                {kpi.val}
              </div>
              <div className="text-sm text-[var(--text-muted)] font-medium">
                {kpi.label}
              </div>
              <div className="text-xs text-[var(--text-dim)] mt-1">
                {kpi.sub}
              </div>
            </div>
          ))}
        </div>

        {/* CATEGORY BREAKDOWN */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-9">
          {CATEGORIES.map((cat) => {
            const items = skus.filter((s) => s.category === cat);
            const units = items.reduce((s, r) => s + r.totalOfc, 0);
            return (
              <div
                key={cat}
                className={`bg-[rgba(0,169,224,0.06)] rounded-xl p-5 border border-[rgba(0,169,224,0.15)] cat-${cat.toLowerCase()}`}
              >
                <div className="cat-name text-sm font-semibold mb-1.5">
                  {cat}
                </div>
                <div className="text-[22px] font-bold text-[var(--text-secondary)]">
                  {units.toLocaleString()}
                </div>
                <div className="text-[11px] text-[var(--text-dim)] mt-0.5">
                  {items.length} SKU{items.length > 1 ? 's' : ''} ·{' '}
                  {totalOfc > 0
                    ? ((units / totalOfc) * 100).toFixed(1)
                    : '0.0'}
                  % of total
                </div>
              </div>
            );
          })}
        </div>

        {/* CHARTS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-9">
          <div className="card" style={{ padding: 25 }}>
            <h3 className="text-2xl font-bold text-[var(--anker-blue)] mb-4">
              Weekly Forecast by Category
            </h3>
            <div className="relative h-[280px]">
              <canvas ref={chartWeeklyRef} />
            </div>
          </div>
          <div className="card" style={{ padding: 25 }}>
            <h3 className="text-2xl font-bold text-[var(--anker-blue)] mb-4">
              Quarterly Sell-Through Distribution
            </h3>
            <div className="relative h-[280px]">
              <canvas ref={chartQuarterlyRef} />
            </div>
          </div>
        </div>

        {/* MAIN TABLE */}
        <div className="card">
          <h2 className="text-2xl font-bold text-[var(--anker-blue)] mb-5">
            CPFR Forecast Detail
          </h2>

          {/* Filter bar */}
          <div className="flex items-center gap-4 mb-5 flex-wrap">
            <input
              type="text"
              placeholder="Search SKU, customer, category…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 max-w-[350px] px-5 py-2.5 rounded-xl border border-[rgba(0,169,224,0.3)] bg-[rgba(26,32,44,0.8)] text-[var(--text-secondary)] text-sm outline-none transition-all focus:border-[var(--anker-blue)] focus:ring-[3px] focus:ring-[rgba(0,169,224,0.15)] placeholder:text-[rgba(226,232,240,0.4)]"
            />
            {['all', ...CATEGORIES].map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveFilter(cat)}
                className={`px-5 py-2.5 rounded-xl border text-sm font-semibold cursor-pointer transition-all ${
                  activeFilter === cat
                    ? 'bg-[rgba(0,169,224,0.25)] border-[var(--anker-blue)] text-[var(--anker-blue)]'
                    : 'bg-[rgba(0,169,224,0.1)] border-[rgba(0,169,224,0.3)] text-[var(--text-secondary)] hover:bg-[rgba(0,169,224,0.25)] hover:border-[var(--anker-blue)]'
                }`}
              >
                {cat === 'all' ? 'All' : cat}
              </button>
            ))}
          </div>

          {/* Scroll hint */}
          <div className="text-right text-xs text-[var(--text-faint)] mb-2">
            Scroll right for weekly columns →{' '}
            <span className="text-[var(--anker-blue)]">
              W+0 … W+{weekColumns.length - 1}
            </span>
          </div>

          {/* Table */}
          <div className="table-wrapper">
            <table className="cpfr-table">
              <thead>
                <tr>
                  <th className="sticky-col col-sku">Anker SKU</th>
                  <th className="sticky-col col-cust">Customer</th>
                  <th className="sticky-col col-price">Price</th>
                  <th className="qt-col">Q1</th>
                  <th className="qt-col">Q2</th>
                  <th className="qt-col">Q3</th>
                  <th className="qt-col">Q4</th>
                  <th>OH</th>
                  <th>WOS</th>
                  <th className="section-divider">Total OFC</th>
                  {weekColumns.map((w) => (
                    <th key={w} className="week-cell">
                      {w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map((cat) => {
                  const items = filterSkus(
                    skus.filter((s) => s.category === cat)
                  );
                  if (items.length === 0) return null;

                  const catTotal = items.reduce(
                    (s, r) => s + r.totalOfc,
                    0
                  );

                  return [
                    // Category header row
                    <tr key={`cat-${cat}`} className="cat-row">
                      <td colSpan={10 + weekColumns.length} style={{ textAlign: 'left' }}>
                        ▸ {cat}{' '}
                        <span
                          style={{
                            fontSize: 12,
                            opacity: 0.7,
                            marginLeft: 10,
                          }}
                        >
                          {items.length} SKUs · {catTotal.toLocaleString()} units
                        </span>
                      </td>
                    </tr>,
                    // Data rows
                    ...items.map((s) => {
                      const custClass =
                        s.customer === 'C2 Wireless'
                          ? 'cust-c2'
                          : 'cust-vc';
                      const custLabel =
                        s.customer === 'C2 Wireless' ? 'C2W' : 'VC';
                      const wosClass =
                        s.wos >= 6
                          ? 'wos-good'
                          : s.wos >= 3
                          ? 'wos-warn'
                          : 'wos-danger';

                      return (
                        <tr key={s.sku}>
                          <td
                            className="sticky-col col-sku"
                            style={{ background: 'inherit' }}
                            title={s.description}
                          >
                            {s.sku}
                          </td>
                          <td
                            className="sticky-col col-cust"
                            style={{ background: 'inherit' }}
                          >
                            <span className={`cust-badge ${custClass}`}>
                              {custLabel}
                            </span>
                          </td>
                          <td
                            className="sticky-col col-price"
                            style={{ background: 'inherit' }}
                          >
                            ${s.price.toFixed(2)}
                          </td>
                          <td className="qt-col">
                            {s.q1.toLocaleString()}
                          </td>
                          <td className="qt-col">
                            {s.q2.toLocaleString()}
                          </td>
                          <td className="qt-col">
                            {s.q3.toLocaleString()}
                          </td>
                          <td className="qt-col">
                            {s.q4.toLocaleString()}
                          </td>
                          <td>{s.oh.toLocaleString()}</td>
                          <td className={wosClass}>{s.wos}</td>
                          <td
                            className="section-divider"
                            style={{
                              fontWeight: 700,
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {s.totalOfc.toLocaleString()}
                          </td>
                          {weekColumns.map((w) => {
                            const ankerVal = s.weeks[w] || 0;
                            const discKey = `${s.sku}|${w}`;
                            const c2Val = discrepancyMap.get(discKey);
                            const hasDisc =
                              c2Val !== undefined && c2Val !== ankerVal;

                            return (
                              <td
                                key={w}
                                className={`week-cell editable ${
                                  hasDisc
                                    ? 'discrepancy-cell has-discrepancy'
                                    : ''
                                }`}
                              >
                                {hasDisc ? (
                                  <div className="tooltip-container">
                                    <span className="anker-val">
                                      {ankerVal.toLocaleString()}
                                    </span>
                                    <br />
                                    <span className="c2-val">
                                      C2: {c2Val!.toLocaleString()}
                                    </span>
                                    <div className="tooltip">
                                      Anker: {ankerVal.toLocaleString()} |
                                      C2: {c2Val!.toLocaleString()} |
                                      Diff:{' '}
                                      {(
                                        c2Val! - ankerVal
                                      ).toLocaleString()}
                                    </div>
                                  </div>
                                ) : (
                                  ankerVal.toLocaleString()
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    }),
                  ];
                })}

                {/* Grand totals row */}
                <tr className="totals-row">
                  <td
                    className="sticky-col col-sku"
                    style={{
                      background: 'rgba(0,169,224,0.15)',
                    }}
                  >
                    TOTAL
                  </td>
                  <td
                    className="sticky-col col-cust"
                    style={{
                      background: 'rgba(0,169,224,0.15)',
                    }}
                  />
                  <td
                    className="sticky-col col-price"
                    style={{
                      background: 'rgba(0,169,224,0.15)',
                    }}
                  />
                  <td className="qt-col">
                    {filterSkus(skus)
                      .reduce((s, r) => s + r.q1, 0)
                      .toLocaleString()}
                  </td>
                  <td className="qt-col">
                    {filterSkus(skus)
                      .reduce((s, r) => s + r.q2, 0)
                      .toLocaleString()}
                  </td>
                  <td className="qt-col">
                    {filterSkus(skus)
                      .reduce((s, r) => s + r.q3, 0)
                      .toLocaleString()}
                  </td>
                  <td className="qt-col">
                    {filterSkus(skus)
                      .reduce((s, r) => s + r.q4, 0)
                      .toLocaleString()}
                  </td>
                  <td>
                    {filterSkus(skus)
                      .reduce((s, r) => s + r.oh, 0)
                      .toLocaleString()}
                  </td>
                  <td />
                  <td className="section-divider">
                    {filterSkus(skus)
                      .reduce((s, r) => s + r.totalOfc, 0)
                      .toLocaleString()}
                  </td>
                  {weekColumns.map((w) => (
                    <td key={w} className="week-cell">
                      {filterSkus(skus)
                        .reduce((s, r) => s + (r.weeks[w] || 0), 0)
                        .toLocaleString()}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* CHANGE LOG */}
        <ChangeLogSection entries={changes} />
      </div>

      {/* FOOTER */}
      <div className="text-center py-8 px-[60px] text-sm text-[var(--text-faint)] border-t border-t-[rgba(255,255,255,0.05)]">
        <p>
          Powered by{' '}
          <span className="text-[var(--anker-blue)] font-bold">
            Bartlett Labs
          </span>
        </p>
        <p className="text-[11px] text-[#2d3748] mt-1.5">
          CONFIDENTIAL — This dashboard contains proprietary forecast data
          shared under NDA between Anker Innovations and C2 Wireless /
          VoiceComm. Do not distribute.
        </p>
      </div>

      {/* SETTINGS MODAL */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {/* TOAST */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDone={() => setToast(null)}
        />
      )}
    </>
  );
}
