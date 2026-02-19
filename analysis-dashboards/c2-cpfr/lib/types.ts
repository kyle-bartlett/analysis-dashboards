// =============================================================================
// C2 CPFR Dashboard — Shared Types
// =============================================================================

export interface SkuForecast {
  sku: string;
  customer: string;
  category: string;
  description?: string;
  price: number;
  selloutAvg: number;
  oh: number;         // On Hand
  wos: number;        // Weeks of Supply
  totalOfc: number;   // Total OFC
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  weeks: Record<string, number>; // { "W+0": 120, "W+1": 85, ... }
}

export interface ForecastResponse {
  anker: {
    lastModified: string;
    data: SkuForecast[];
  };
  c2: {
    lastModified: string;
    data: SkuForecast[];
  } | null;
  discrepancies: Discrepancy[];
  meta: {
    totalSkus: number;
    totalUnits: number;
    categories: string[];
    weekColumns: string[];       // W+0, W+1, etc.
    weekLabels?: string[];       // Original header text (202606, 202607, etc.)
    mode: 'dual' | 'single';    // single = only Anker data
    columnMapping?: Record<string, number>; // Discovered column positions
    warnings?: string[];         // Any column mapping warnings
  };
}

export interface Discrepancy {
  sku: string;
  customer: string;
  week: string;
  anker: number;
  c2: number;
  diff: number;
}

export interface AcceptRequest {
  direction: 'anker_accepts_c2' | 'c2_accepts_anker';
  scope: 'all' | 'sku';
  sku?: string;
  weeks?: string[];
}

export interface ChangeLogEntry {
  id: string;
  timestamp: string;
  actor: 'Anker' | 'C2';
  action: 'accepted' | 'updated' | 'alert_sent';
  details: string;
  skus: string[];
}

export interface AlertRequest {
  type: 'email' | 'webhook';
  to?: string;
  subject?: string;
  message: string;
  webhookUrl?: string;
}
