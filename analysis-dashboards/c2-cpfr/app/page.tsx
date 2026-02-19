'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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

const REFRESH_OPTIONS = [
  { label: '1 min', value: 60000 },
  { label: '5 min', value: 300000 },
  { label: '15 min', value: 900000 },
  { label: '30 min', value: 1800000 },
];

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
// CONFIRMATION MODAL
// =============================================================================
function ConfirmModal({
  title,
  message,
  confirmLabel,
  confirmColor,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  confirmColor: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-content" style={{ maxWidth: 440 }}>
        <h2 className="text-xl font-bold text-[var(--text-secondary)] mb-3">{title}</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl border border-[rgba(255,255,255,0.15)] text-[var(--text-muted)] text-sm font-semibold hover:bg-[rgba(255,255,255,0.05)] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="accept-btn px-6 py-2.5 rounded-xl text-white text-sm font-bold cursor-pointer"
            style={{ background: confirmColor }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// SETTINGS MODAL
// =============================================================================
function SettingsModal({
  onClose,
  refreshInterval,
  onRefreshChange,
}: {
  onClose: () => void;
  refreshInterval: number;
  onRefreshChange: (ms: number) => void;
}) {
  const [autoAcceptC2, setAutoAcceptC2] = useState(() =>
    typeof window !== 'undefined'
      ? localStorage.getItem('cpfr-auto-accept-c2') === 'true'
      : false
  );
  const [autoAcceptAnker, setAutoAcceptAnker] = useState(() =>
    typeof window !== 'undefined'
      ? localStorage.getItem('cpfr-auto-accept-anker') === 'true'
      : false
  );
  const [alertEmail, setAlertEmail] = useState(() =>
    typeof window !== 'undefined'
      ? localStorage.getItem('cpfr-alert-email') || ''
      : ''
  );
  const [webhookUrl, setWebhookUrl] = useState(() =>
    typeof window !== 'undefined'
      ? localStorage.getItem('cpfr-webhook-url') || ''
      : ''
  );

  const save = () => {
    localStorage.setItem('cpfr-auto-accept-c2', String(autoAcceptC2));
    localStorage.setItem('cpfr-auto-accept-anker', String(autoAcceptAnker));
    localStorage.setItem('cpfr-alert-email', alertEmail);
    localStorage.setItem('cpfr-webhook-url', webhookUrl);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-[var(--anker-blue)]">
            ⚙️ Dashboard Settings
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-white transition-colors text-2xl leading-none cursor-pointer"
          >
            ×
          </button>
        </div>

        <div className="space-y-6">
          {/* Auto-accept toggles */}
          <div>
            <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-3">
              Auto-Accept Rules
            </label>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoAcceptC2}
                  onChange={(e) => setAutoAcceptC2(e.target.checked)}
                  className="w-4 h-4 accent-[var(--orange)] rounded"
                />
                <span className="text-sm text-[var(--text-muted)]">
                  Automatically accept C2&apos;s updates
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoAcceptAnker}
                  onChange={(e) => setAutoAcceptAnker(e.target.checked)}
                  className="w-4 h-4 accent-[var(--anker-blue)] rounded"
                />
                <span className="text-sm text-[var(--text-muted)]">
                  Automatically accept Anker&apos;s updates
                </span>
              </label>
            </div>
          </div>

          {/* Refresh interval */}
          <div>
            <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
              Auto-Refresh Interval
            </label>
            <div className="flex gap-2">
              {REFRESH_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onRefreshChange(opt.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all ${
                    refreshInterval === opt.value
                      ? 'bg-[var(--anker-blue)] text-white'
                      : 'bg-[rgba(0,169,224,0.1)] text-[var(--text-muted)] border border-[rgba(0,169,224,0.2)] hover:bg-[rgba(0,169,224,0.2)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Alert email */}
          <div>
            <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
              Alert Email
            </label>
            <input
              type="email"
              placeholder="alerts@company.com"
              value={alertEmail}
              onChange={(e) => setAlertEmail(e.target.value)}
              className="settings-input"
            />
          </div>

          {/* Webhook URL */}
          <div>
            <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
              Slack / Teams Webhook URL
            </label>
            <input
              type="url"
              placeholder="https://hooks.slack.com/..."
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="settings-input"
            />
          </div>

          {/* Data source info */}
          <div className="bg-[rgba(0,169,224,0.06)] rounded-xl p-4 border border-[rgba(0,169,224,0.15)]">
            <p className="text-xs text-[var(--text-dim)]">
              📊 Data Source: Google Sheets API (Dynamic Column Mapping)
              <br />
              🔄 Refresh: every {REFRESH_OPTIONS.find((o) => o.value === refreshInterval)?.label || '5 min'}
              <br />
              📍 Columns discovered automatically from header row
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={save}
            className="px-6 py-2.5 rounded-xl bg-[var(--anker-blue)] text-white font-semibold text-sm hover:bg-[var(--anker-blue-light)] transition-colors cursor-pointer"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// FILTER DROPDOWN
// =============================================================================
type SortDir = 'asc' | 'desc' | null;

interface FilterState {
  // Text column filters: set of allowed values
  textFilters: Record<string, Set<string>>;
  // Numeric column filters: { min, max }
  numericFilters: Record<string, { min: number | null; max: number | null }>;
}

function ColumnFilterDropdown({
  columnKey,
  isNumeric,
  uniqueValues,
  filterState,
  onApply,
  onClose,
}: {
  columnKey: string;
  isNumeric: boolean;
  uniqueValues: string[];
  filterState: FilterState;
  onApply: (state: FilterState) => void;
  onClose: () => void;
}) {
  const [localTextSet, setLocalTextSet] = useState<Set<string>>(() => {
    return filterState.textFilters[columnKey]
      ? new Set(filterState.textFilters[columnKey])
      : new Set(uniqueValues);
  });
  const [localMin, setLocalMin] = useState<string>(() => {
    const f = filterState.numericFilters[columnKey];
    return f?.min !== null && f?.min !== undefined ? String(f.min) : '';
  });
  const [localMax, setLocalMax] = useState<string>(() => {
    const f = filterState.numericFilters[columnKey];
    return f?.max !== null && f?.max !== undefined ? String(f.max) : '';
  });

  const apply = () => {
    const newState = { ...filterState };
    if (isNumeric) {
      newState.numericFilters = { ...newState.numericFilters };
      const min = localMin ? parseFloat(localMin) : null;
      const max = localMax ? parseFloat(localMax) : null;
      if (min === null && max === null) {
        delete newState.numericFilters[columnKey];
      } else {
        newState.numericFilters[columnKey] = { min, max };
      }
    } else {
      newState.textFilters = { ...newState.textFilters };
      if (localTextSet.size === uniqueValues.length) {
        delete newState.textFilters[columnKey];
      } else {
        newState.textFilters[columnKey] = new Set(localTextSet);
      }
    }
    onApply(newState);
    onClose();
  };

  const clear = () => {
    const newState = { ...filterState };
    if (isNumeric) {
      newState.numericFilters = { ...newState.numericFilters };
      delete newState.numericFilters[columnKey];
    } else {
      newState.textFilters = { ...newState.textFilters };
      delete newState.textFilters[columnKey];
    }
    onApply(newState);
    onClose();
  };

  return (
    <div className="filter-dropdown" onClick={(e) => e.stopPropagation()}>
      {isNumeric ? (
        <div className="space-y-3">
          <div className="text-xs text-[var(--text-dim)] font-semibold uppercase tracking-wider">
            Range Filter
          </div>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              placeholder="Min"
              value={localMin}
              onChange={(e) => setLocalMin(e.target.value)}
              className="filter-range-input"
            />
            <span className="text-[var(--text-dim)]">—</span>
            <input
              type="number"
              placeholder="Max"
              value={localMax}
              onChange={(e) => setLocalMax(e.target.value)}
              className="filter-range-input"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-[var(--text-dim)] font-semibold uppercase tracking-wider mb-2">
            Select Values
          </div>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setLocalTextSet(new Set(uniqueValues))}
              className="text-xs text-[var(--anker-blue)] hover:underline cursor-pointer"
            >
              All
            </button>
            <button
              onClick={() => setLocalTextSet(new Set())}
              className="text-xs text-[var(--anker-blue)] hover:underline cursor-pointer"
            >
              None
            </button>
          </div>
          <div className="filter-checkbox-list">
            {uniqueValues.map((v) => (
              <label key={v} className="flex items-center gap-2 cursor-pointer py-0.5">
                <input
                  type="checkbox"
                  checked={localTextSet.has(v)}
                  onChange={(e) => {
                    const next = new Set(localTextSet);
                    if (e.target.checked) next.add(v);
                    else next.delete(v);
                    setLocalTextSet(next);
                  }}
                  className="w-3.5 h-3.5 accent-[var(--anker-blue)] rounded"
                />
                <span className="text-xs text-[var(--text-muted)] truncate">{v}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="flex justify-between mt-3 pt-3 border-t border-[rgba(255,255,255,0.08)]">
        <button
          onClick={clear}
          className="text-xs text-[var(--text-dim)] hover:text-[var(--text-muted)] cursor-pointer"
        >
          Clear
        </button>
        <button
          onClick={apply}
          className="text-xs bg-[var(--anker-blue)] text-white px-3 py-1 rounded-md font-semibold cursor-pointer hover:bg-[var(--anker-blue-light)] transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// SORTABLE TABLE HEADER
// =============================================================================
function SortableHeader({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSort,
  isNumeric,
  uniqueValues,
  filterState,
  onFilterApply,
  className,
  style,
}: {
  label: string;
  columnKey: string;
  sortKey: string | null;
  sortDir: SortDir;
  onSort: (key: string) => void;
  isNumeric: boolean;
  uniqueValues: string[];
  filterState: FilterState;
  onFilterApply: (state: FilterState) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [showFilter, setShowFilter] = useState(false);

  const isActive = sortKey === columnKey;
  const hasFilter = isNumeric
    ? !!filterState.numericFilters[columnKey]
    : !!filterState.textFilters[columnKey];

  return (
    <th className={className} style={style}>
      <div className="th-inner">
        <button
          className="sort-btn cursor-pointer"
          onClick={() => onSort(columnKey)}
          title={`Sort by ${label}`}
        >
          <span className="th-label">{label}</span>
          <span className={`sort-indicator ${isActive ? 'active' : ''}`}>
            {isActive && sortDir === 'asc' && '▲'}
            {isActive && sortDir === 'desc' && '▼'}
            {!isActive && '⇅'}
          </span>
        </button>
        <button
          className={`filter-btn cursor-pointer ${hasFilter ? 'has-filter' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setShowFilter(!showFilter);
          }}
          title="Filter"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M0 1h10L6 5.5V9L4 10V5.5L0 1z" />
          </svg>
          {hasFilter && <span className="filter-dot" />}
        </button>
        {showFilter && (
          <ColumnFilterDropdown
            columnKey={columnKey}
            isNumeric={isNumeric}
            uniqueValues={uniqueValues}
            filterState={filterState}
            onApply={onFilterApply}
            onClose={() => setShowFilter(false)}
          />
        )}
      </div>
    </th>
  );
}

// =============================================================================
// CHANGELOG SECTION
// =============================================================================
function ChangeLogSection({ entries }: { entries: ChangeLogEntry[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left cursor-pointer"
      >
        <h2 className="text-2xl font-bold text-[var(--anker-blue)]">
          📋 Change Log
        </h2>
        <span className="text-[var(--text-muted)] text-sm">
          {expanded ? '▾ Collapse' : '▸ Expand'} · {entries.length === 0 ? 'No entries yet' : `${entries.length} entries`}
        </span>
      </button>

      {expanded && (
        <div className="mt-5 space-y-0">
          {entries.map((e) => (
            <div key={e.id} className={`changelog-entry action-${e.action}`}>
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
// HELPER: Get unique values for a column across all skus
// =============================================================================
function getUniqueValues(
  skus: SkuForecast[],
  accessor: (s: SkuForecast) => string | number
): string[] {
  const set = new Set<string>();
  for (const s of skus) {
    const v = accessor(s);
    if (v !== undefined && v !== null && v !== '') set.add(String(v));
  }
  return [...set].sort();
}

// =============================================================================
// HELPER: Sort comparator
// =============================================================================
function getSortValue(
  sku: SkuForecast,
  key: string
): string | number {
  switch (key) {
    case 'sku': return sku.sku;
    case 'customer': return sku.customer;
    case 'price': return sku.price;
    case 'q1': return sku.q1;
    case 'q2': return sku.q2;
    case 'q3': return sku.q3;
    case 'q4': return sku.q4;
    case 'oh': return sku.oh;
    case 'wos': return sku.wos;
    case 'totalOfc': return sku.totalOfc;
    default:
      if (key.startsWith('W+')) return sku.weeks[key] || 0;
      return 0;
  }
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
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    confirmColor: string;
    onConfirm: () => void;
  } | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('cpfr-refresh-interval');
      return saved ? parseInt(saved, 10) : 300000;
    }
    return 300000;
  });

  // Sort & filter state
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [filterState, setFilterState] = useState<FilterState>({
    textFilters: {},
    numericFilters: {},
  });

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
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchData, refreshInterval]);

  // Close filter dropdowns when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.filter-dropdown') && !target.closest('.filter-btn')) {
        // The dropdown close is handled by state in SortableHeader
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // ---------------------------------------------------------------------------
  // Charts
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!data || chartsInitialized.current) return;

    const loadCharts = async () => {
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
      const weekLabels = data.meta.weekColumns;
      const WEEKS = weekLabels.length || 30;
      // Use weekLabels from metadata for display if available
      const displayLabels = data.meta.weekLabels || weekLabels;

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
            data: { labels: displayLabels, datasets },
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
  // Sort handler (3-click cycle: asc → desc → reset)
  // ---------------------------------------------------------------------------
  const handleSort = useCallback(
    (key: string) => {
      if (sortKey !== key) {
        setSortKey(key);
        setSortDir('asc');
      } else if (sortDir === 'asc') {
        setSortDir('desc');
      } else {
        setSortKey(null);
        setSortDir(null);
      }
    },
    [sortKey, sortDir]
  );

  // ---------------------------------------------------------------------------
  // Accept handler
  // ---------------------------------------------------------------------------
  const handleAccept = async (
    direction: 'anker_accepts_c2' | 'c2_accepts_anker',
    scope: 'all' | 'sku' = 'all',
    sku?: string
  ) => {
    setAccepting(true);
    try {
      const res = await fetch('/api/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction, scope, sku }),
      });
      const result = await res.json();

      if (result.success) {
        showToast(result.message, 'success');
        fetchData();
      } else {
        showToast('Accept failed: ' + (result.error || 'Unknown error'), 'error');
      }
    } catch {
      showToast('Network error — could not accept forecast', 'error');
    } finally {
      setAccepting(false);
      setConfirmModal(null);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  };

  const handleRefreshChange = (ms: number) => {
    setRefreshInterval(ms);
    localStorage.setItem('cpfr-refresh-interval', String(ms));
  };

  // ---------------------------------------------------------------------------
  // Computed / memoized values
  // ---------------------------------------------------------------------------
  const processedData = useMemo(() => {
    if (!data) return null;

    const skus = data.anker.data;
    const weekColumns = data.meta.weekColumns;

    // 1. Category + search filter
    let filtered = skus.filter((s) => {
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

    // 2. Apply column filters
    filtered = filtered.filter((s) => {
      // Text filters
      for (const [key, allowedSet] of Object.entries(filterState.textFilters)) {
        let val: string;
        if (key === 'sku') val = s.sku;
        else if (key === 'customer') val = s.customer;
        else continue;
        if (!allowedSet.has(val)) return false;
      }
      // Numeric filters
      for (const [key, range] of Object.entries(filterState.numericFilters)) {
        const val = getSortValue(s, key);
        if (typeof val === 'number') {
          if (range.min !== null && val < range.min) return false;
          if (range.max !== null && val > range.max) return false;
        }
      }
      return true;
    });

    // 3. Sort
    let sorted = [...filtered];
    if (sortKey && sortDir) {
      sorted.sort((a, b) => {
        const aVal = getSortValue(a, sortKey);
        const bVal = getSortValue(b, sortKey);
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortDir === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        }
        const diff = (aVal as number) - (bVal as number);
        return sortDir === 'asc' ? diff : -diff;
      });
    }

    return { filtered: sorted, weekColumns };
  }, [data, activeFilter, searchTerm, sortKey, sortDir, filterState]);

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (loading || !data || !processedData) {
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

  const { filtered, weekColumns } = processedData;
  const isDualMode = data.meta.mode === 'dual';
  const discrepancyMap = new Map<string, number>();
  if (data.discrepancies) {
    for (const d of data.discrepancies) {
      discrepancyMap.set(`${d.sku}|${d.week}`, d.c2);
    }
  }

  // Unique values for filter dropdowns
  const uniqueSkus = getUniqueValues(skus, (s) => s.sku);
  const uniqueCustomers = getUniqueValues(skus, (s) => s.customer);

  // Status dot color based on time difference
  const getStatusColor = (dateStr: string) => {
    const now = new Date();
    const d = new Date(dateStr);
    const diffHours = (now.getTime() - d.getTime()) / (1000 * 60 * 60);
    if (diffHours < 24) return 'green';
    if (diffHours < 72) return 'yellow';
    return 'red';
  };

  // Check if a SKU row has any discrepancies
  const skuHasDiscrepancy = (sku: string) => {
    for (const [key] of discrepancyMap) {
      if (key.startsWith(sku + '|')) return true;
    }
    return false;
  };

  // Display labels for weekly columns
  const weekDisplayLabels = data.meta.weekLabels || weekColumns;

  return (
    <>
      {/* HEADER */}
      <div className="header">
        <div className="relative z-10 flex justify-between items-center flex-wrap gap-4">
          <div>
            <h1
              className="text-4xl lg:text-[44px] font-extrabold tracking-tight"
              style={{ textShadow: '0 4px 20px rgba(0,0,0,0.3)' }}
            >
              Anker-C2W Charging CPFR
            </h1>
            <p className="text-base lg:text-lg opacity-95 mt-1.5">
              Collaborative Planning, Forecasting &amp; Replenishment — 2026
            </p>
          </div>
          <div className="text-right flex flex-col items-end gap-2">
            <div className="flex items-center gap-3">
              {newChangesCount > 0 && (
                <span className="changes-badge">
                  🔔 {newChangesCount} new change
                  {newChangesCount > 1 ? 's' : ''}
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
              <div className={`status-dot ${getStatusColor(data.anker.lastModified)}`} />
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
              Updated forecast quantities for Essential SKUs; adjusted
              sell-through estimates based on latest POS data.
            </div>
          </div>

          <div className="update-card customer">
            <div className="flex items-center gap-3 mb-3.5">
              <div
                className={`status-dot ${
                  data.c2 ? getStatusColor(data.c2.lastModified) : 'yellow'
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

        {/* ACCEPT BUTTONS — always shown */}
        <div className="card mb-9">
            <h2 className="text-2xl font-bold text-[var(--anker-blue)] mb-4">
              ⚡ Forecast Sync
            </h2>
            <p className="text-sm text-[var(--text-muted)] mb-5">
              {isDualMode && data.discrepancies.length > 0
                ? `${data.discrepancies.length} discrepancies found between Anker and C2 forecasts. Review and accept to align.`
                : 'Accept the other side\'s forecast numbers when ready. Changes are logged and auditable.'}
            </p>
            <div className="flex flex-wrap gap-4">
              <button
                onClick={() =>
                  setConfirmModal({
                    title: "Accept C2's Numbers",
                    message:
                      "This will overwrite Anker's forecast values with C2's numbers for all discrepant cells. This action is logged and cannot be undone automatically.",
                    confirmLabel: "Accept C2's Numbers",
                    confirmColor: 'var(--orange)',
                    onConfirm: () => handleAccept('anker_accepts_c2'),
                  })
                }
                disabled={accepting}
                className="accept-btn accept-btn-c2 px-8 py-3.5 rounded-xl text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {accepting ? '⏳ Processing...' : "✓ Accept C2's Numbers"}
              </button>
              <button
                onClick={() =>
                  setConfirmModal({
                    title: "Accept Anker's Numbers",
                    message:
                      "This will overwrite C2's forecast values with Anker's numbers for all discrepant cells. This action is logged and cannot be undone automatically.",
                    confirmLabel: "Accept Anker's Numbers",
                    confirmColor: 'var(--anker-blue)',
                    onConfirm: () => handleAccept('c2_accepts_anker'),
                  })
                }
                disabled={accepting}
                className="accept-btn accept-btn-anker px-8 py-3.5 rounded-xl text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {accepting ? '⏳ Processing...' : "✓ Accept Anker's Numbers"}
              </button>
            </div>
          </div>

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
        <div className="card" style={{ padding: '35px 35px 20px' }}>
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
              {weekDisplayLabels[0]} … {weekDisplayLabels[weekDisplayLabels.length - 1]}
            </span>
            <span className="text-[var(--text-dim)] ml-3">
              {filtered.length} of {skus.length} rows
            </span>
          </div>

          {/* Table with independent scroll */}
          <div className="table-scroll-container">
            <div className="table-wrapper">
              <table className="cpfr-table">
                <thead>
                  <tr>
                    <SortableHeader
                      label="Anker SKU"
                      columnKey="sku"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                      isNumeric={false}
                      uniqueValues={uniqueSkus}
                      filterState={filterState}
                      onFilterApply={setFilterState}
                      className="sticky-col col-sku"
                    />
                    <SortableHeader
                      label="Customer"
                      columnKey="customer"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                      isNumeric={false}
                      uniqueValues={uniqueCustomers}
                      filterState={filterState}
                      onFilterApply={setFilterState}
                      className="sticky-col col-cust"
                    />
                    <SortableHeader
                      label="Price"
                      columnKey="price"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                      isNumeric={true}
                      uniqueValues={[]}
                      filterState={filterState}
                      onFilterApply={setFilterState}
                      className="sticky-col col-price"
                    />
                    <SortableHeader
                      label="Q1"
                      columnKey="q1"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                      isNumeric={true}
                      uniqueValues={[]}
                      filterState={filterState}
                      onFilterApply={setFilterState}
                      className="qt-col"
                    />
                    <SortableHeader
                      label="Q2"
                      columnKey="q2"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                      isNumeric={true}
                      uniqueValues={[]}
                      filterState={filterState}
                      onFilterApply={setFilterState}
                      className="qt-col"
                    />
                    <SortableHeader
                      label="Q3"
                      columnKey="q3"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                      isNumeric={true}
                      uniqueValues={[]}
                      filterState={filterState}
                      onFilterApply={setFilterState}
                      className="qt-col"
                    />
                    <SortableHeader
                      label="Q4"
                      columnKey="q4"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                      isNumeric={true}
                      uniqueValues={[]}
                      filterState={filterState}
                      onFilterApply={setFilterState}
                      className="qt-col"
                    />
                    <SortableHeader
                      label="OH"
                      columnKey="oh"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                      isNumeric={true}
                      uniqueValues={[]}
                      filterState={filterState}
                      onFilterApply={setFilterState}
                    />
                    <SortableHeader
                      label="WOS"
                      columnKey="wos"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                      isNumeric={true}
                      uniqueValues={[]}
                      filterState={filterState}
                      onFilterApply={setFilterState}
                    />
                    <SortableHeader
                      label="Total OFC"
                      columnKey="totalOfc"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                      isNumeric={true}
                      uniqueValues={[]}
                      filterState={filterState}
                      onFilterApply={setFilterState}
                      className="section-divider"
                    />
                    {weekColumns.map((w, i) => (
                      <SortableHeader
                        key={w}
                        label={weekDisplayLabels[i] || w}
                        columnKey={w}
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                        isNumeric={true}
                        uniqueValues={[]}
                        filterState={filterState}
                        onFilterApply={setFilterState}
                        className="week-cell"
                      />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortKey ? (
                    // When sorting, show flat list (no category grouping)
                    filtered.map((s) => (
                      <DataRow
                        key={s.sku}
                        s={s}
                        weekColumns={weekColumns}
                        discrepancyMap={discrepancyMap}
                        isDualMode={isDualMode}
                        hasDiscrepancy={skuHasDiscrepancy(s.sku)}
                        onAcceptRow={(dir) =>
                          setConfirmModal({
                            title: `Accept ${dir === 'anker_accepts_c2' ? "C2's" : "Anker's"} Numbers for ${s.sku}`,
                            message: `This will update the forecast for ${s.sku} to match ${dir === 'anker_accepts_c2' ? "C2's" : "Anker's"} values.`,
                            confirmLabel: 'Accept',
                            confirmColor:
                              dir === 'anker_accepts_c2'
                                ? 'var(--orange)'
                                : 'var(--anker-blue)',
                            onConfirm: () => handleAccept(dir, 'sku', s.sku),
                          })
                        }
                      />
                    ))
                  ) : (
                    // Default: grouped by category
                    CATEGORIES.map((cat) => {
                      const items = filtered.filter((s) => s.category === cat);
                      if (items.length === 0) return null;

                      const catTotal = items.reduce((s, r) => s + r.totalOfc, 0);

                      return [
                        <tr key={`cat-${cat}`} className="cat-row">
                          <td
                            colSpan={10 + weekColumns.length}
                            style={{ textAlign: 'left' }}
                          >
                            ▸ {cat}{' '}
                            <span
                              style={{
                                fontSize: 12,
                                opacity: 0.7,
                                marginLeft: 10,
                              }}
                            >
                              {items.length} SKUs ·{' '}
                              {catTotal.toLocaleString()} units
                            </span>
                          </td>
                        </tr>,
                        ...items.map((s) => (
                          <DataRow
                            key={s.sku}
                            s={s}
                            weekColumns={weekColumns}
                            discrepancyMap={discrepancyMap}
                            isDualMode={isDualMode}
                            hasDiscrepancy={skuHasDiscrepancy(s.sku)}
                            onAcceptRow={(dir) =>
                              setConfirmModal({
                                title: `Accept ${dir === 'anker_accepts_c2' ? "C2's" : "Anker's"} Numbers for ${s.sku}`,
                                message: `This will update the forecast for ${s.sku} to match ${dir === 'anker_accepts_c2' ? "C2's" : "Anker's"} values.`,
                                confirmLabel: 'Accept',
                                confirmColor:
                                  dir === 'anker_accepts_c2'
                                    ? 'var(--orange)'
                                    : 'var(--anker-blue)',
                                onConfirm: () =>
                                  handleAccept(dir, 'sku', s.sku),
                              })
                            }
                          />
                        )),
                      ];
                    })
                  )}

                  {/* Grand totals row */}
                  <tr className="totals-row">
                    <td className="sticky-col col-sku totals-sticky">TOTAL</td>
                    <td className="sticky-col col-cust totals-sticky" />
                    <td className="sticky-col col-price totals-sticky" />
                    <td className="qt-col">
                      {filtered.reduce((s, r) => s + r.q1, 0).toLocaleString()}
                    </td>
                    <td className="qt-col">
                      {filtered.reduce((s, r) => s + r.q2, 0).toLocaleString()}
                    </td>
                    <td className="qt-col">
                      {filtered.reduce((s, r) => s + r.q3, 0).toLocaleString()}
                    </td>
                    <td className="qt-col">
                      {filtered.reduce((s, r) => s + r.q4, 0).toLocaleString()}
                    </td>
                    <td>
                      {filtered.reduce((s, r) => s + r.oh, 0).toLocaleString()}
                    </td>
                    <td />
                    <td className="section-divider">
                      {filtered
                        .reduce((s, r) => s + r.totalOfc, 0)
                        .toLocaleString()}
                    </td>
                    {weekColumns.map((w) => (
                      <td key={w} className="week-cell">
                        {filtered
                          .reduce((s, r) => s + (r.weeks[w] || 0), 0)
                          .toLocaleString()}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
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
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          refreshInterval={refreshInterval}
          onRefreshChange={handleRefreshChange}
        />
      )}

      {/* CONFIRMATION MODAL */}
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          confirmColor={confirmModal.confirmColor}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}

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

// =============================================================================
// DATA ROW COMPONENT (extracted for reuse in sorted/grouped modes)
// =============================================================================
function DataRow({
  s,
  weekColumns,
  discrepancyMap,
  isDualMode,
  hasDiscrepancy,
  onAcceptRow,
}: {
  s: SkuForecast;
  weekColumns: string[];
  discrepancyMap: Map<string, number>;
  isDualMode: boolean;
  hasDiscrepancy: boolean;
  onAcceptRow: (direction: 'anker_accepts_c2' | 'c2_accepts_anker') => void;
}) {
  const custClass = s.customer === 'C2 Wireless' ? 'cust-c2' : 'cust-vc';
  const custLabel = s.customer === 'C2 Wireless' ? 'C2W' : 'VC';
  const wosClass =
    s.wos >= 6 ? 'wos-good' : s.wos >= 3 ? 'wos-warn' : 'wos-danger';

  return (
    <tr>
      <td className="sticky-col col-sku data-sticky" title={s.description}>
        <div className="flex items-center gap-1.5">
          <span>{s.sku}</span>
          {isDualMode && hasDiscrepancy && (
            <div className="row-accept-icons">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAcceptRow('anker_accepts_c2');
                }}
                className="row-accept-btn c2"
                title="Accept C2's numbers for this SKU"
              >
                C2
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAcceptRow('c2_accepts_anker');
                }}
                className="row-accept-btn anker"
                title="Accept Anker's numbers for this SKU"
              >
                AK
              </button>
            </div>
          )}
        </div>
      </td>
      <td className="sticky-col col-cust data-sticky">
        <span className={`cust-badge ${custClass}`}>{custLabel}</span>
      </td>
      <td className="sticky-col col-price data-sticky">
        ${s.price.toFixed(2)}
      </td>
      <td className="qt-col">{s.q1.toLocaleString()}</td>
      <td className="qt-col">{s.q2.toLocaleString()}</td>
      <td className="qt-col">{s.q3.toLocaleString()}</td>
      <td className="qt-col">{s.q4.toLocaleString()}</td>
      <td>{s.oh.toLocaleString()}</td>
      <td className={wosClass}>{s.wos}</td>
      <td
        className="section-divider"
        style={{ fontWeight: 700, color: 'var(--text-secondary)' }}
      >
        {s.totalOfc.toLocaleString()}
      </td>
      {weekColumns.map((w) => {
        const ankerVal = s.weeks[w] || 0;
        const discKey = `${s.sku}|${w}`;
        const c2Val = discrepancyMap.get(discKey);
        const hasDisc = c2Val !== undefined && c2Val !== ankerVal;

        return (
          <td
            key={w}
            className={`week-cell editable ${
              hasDisc ? 'discrepancy-cell has-discrepancy' : ''
            }`}
          >
            {hasDisc ? (
              <div className="tooltip-container">
                <span className="anker-val">{ankerVal.toLocaleString()}</span>
                <br />
                <span className="c2-val">C2: {c2Val!.toLocaleString()}</span>
                <div className="tooltip">
                  Anker: {ankerVal.toLocaleString()} | C2:{' '}
                  {c2Val!.toLocaleString()} | Diff:{' '}
                  {(c2Val! - ankerVal).toLocaleString()}
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
}
