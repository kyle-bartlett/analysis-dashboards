// =============================================================================
// Hardcoded Fallback Data
// =============================================================================
// Used when Google Sheets credentials aren't configured.
// This is the EXACT data from the original static dashboard.

import type { SkuForecast, ForecastResponse } from './types';

// Seeded PRNG for reproducible weekly distributions
let _seed = 42;
function seededRandom() {
  _seed = (_seed * 16807) % 2147483647;
  return (_seed - 1) / 2147483646;
}

function distributeWeeksSeeded(
  total: number,
  weeks: number,
  opts: { frontLoad?: boolean; backLoad?: boolean } = {}
): number[] {
  const arr: number[] = [];
  let remaining = total;
  for (let i = 0; i < weeks; i++) {
    let base = Math.round(total / weeks);
    if (opts.frontLoad)
      base = Math.round((total / weeks) * (1.4 - (0.8 * i) / weeks));
    else if (opts.backLoad)
      base = Math.round((total / weeks) * (0.6 + (0.8 * i) / weeks));
    const noise = 1 + (seededRandom() - 0.5) * 0.25;
    let val = Math.max(0, Math.round(base * noise));
    if (i === weeks - 1) val = Math.max(0, remaining);
    else val = Math.min(val, remaining);
    remaining -= val;
    arr.push(val);
  }
  return arr;
}

function distributeQuarters(total: number): [number, number, number, number] {
  const q1 = Math.round(total * (0.2 + seededRandom() * 0.1));
  const q2 = Math.round(total * (0.22 + seededRandom() * 0.1));
  const q3 = Math.round(total * (0.2 + seededRandom() * 0.1));
  const q4 = total - q1 - q2 - q3;
  return [q1, q2, q3, Math.max(0, q4)];
}

const WEEKS = 30;

interface RawSku {
  sku: string;
  cat: string;
  desc: string;
  price: number;
  ofc: number;
  cust: string;
  oh: number;
  selloutAvg: number;
}

const RAW_SKUS: RawSku[] = [
  // Essential
  { sku: 'A1367H11-1', cat: 'Essential', desc: 'PowerPort III Nano 20W', price: 8.99, ofc: 7361, cust: 'C2 Wireless', oh: 1450, selloutAvg: 280 },
  { sku: 'A8189Q21-1', cat: 'Essential', desc: 'PowerLine III Flow USB-C', price: 14.99, ofc: 2366, cust: 'C2 Wireless', oh: 520, selloutAvg: 95 },
  { sku: 'A1F5FH21-1', cat: 'Essential', desc: 'Nano Pro 20W Charger', price: 15.99, ofc: 3500, cust: 'VoiceComm', oh: 680, selloutAvg: 130 },
  { sku: 'A81FEH21-1', cat: 'Essential', desc: 'PowerLine Select+ USB-C', price: 9.99, ofc: 7052, cust: 'C2 Wireless', oh: 1820, selloutAvg: 310 },
  { sku: 'A1F7FH21-1', cat: 'Essential', desc: 'PowerPort Atom III Slim', price: 19.99, ofc: 1512, cust: 'VoiceComm', oh: 240, selloutAvg: 55 },
  { sku: 'A81H5H11-1', cat: 'Essential', desc: 'PowerLine III USB-A to C', price: 7.99, ofc: 1488, cust: 'C2 Wireless', oh: 380, selloutAvg: 72 },

  // Wireless
  { sku: 'A81H7H11-1', cat: 'Wireless', desc: 'MagGo Qi2 Pad', price: 27.99, ofc: 900, cust: 'C2 Wireless', oh: 150, selloutAvg: 35 },
  { sku: 'A2326J21-1', cat: 'Wireless', desc: 'MagGo 3-in-1 Stand', price: 32.99, ofc: 1848, cust: 'VoiceComm', oh: 310, selloutAvg: 68 },
  { sku: 'A2738HJ4J-2', cat: 'Wireless', desc: 'Wireless Charging Station', price: 46.79, ofc: 1000, cust: 'C2 Wireless', oh: 180, selloutAvg: 40 },
  { sku: 'B3MA21H1-1', cat: 'Wireless', desc: 'MagSafe Car Mount Charger', price: 29.99, ofc: 1008, cust: 'VoiceComm', oh: 200, selloutAvg: 42 },

  // Battery
  { sku: 'A1336011', cat: 'Battery', desc: 'PowerCore Select 10K', price: 16.99, ofc: 200, cust: 'VoiceComm', oh: 85, selloutAvg: 12 },
  { sku: 'A1618H11-1', cat: 'Battery', desc: 'PowerCore III Elite 25600', price: 45.99, ofc: 4320, cust: 'C2 Wireless', oh: 760, selloutAvg: 165 },
  { sku: 'A1654H11-1', cat: 'Battery', desc: 'PowerCore Slim 10000 PD', price: 25.99, ofc: 1728, cust: 'C2 Wireless', oh: 350, selloutAvg: 70 },
  { sku: 'A1653H11-1', cat: 'Battery', desc: 'PowerCore 26800 PD', price: 39.99, ofc: 9750, cust: 'VoiceComm', oh: 2100, selloutAvg: 380 },

  // Charger
  { sku: 'A2698JZ1-1', cat: 'Charger', desc: 'Anker 30W USB-C Charger', price: 1.25, ofc: 80136, cust: 'C2 Wireless', oh: 18500, selloutAvg: 3200 },
];

function buildFallbackSkus(): SkuForecast[] {
  _seed = 42; // Reset seed for reproducibility
  return RAW_SKUS.map((s) => {
    const [q1, q2, q3, q4] = distributeQuarters(s.ofc);
    const weekArr = distributeWeeksSeeded(s.ofc, WEEKS, {
      frontLoad: s.cat === 'Charger',
    });
    const wos =
      s.oh > 0 && s.selloutAvg > 0
        ? parseFloat((s.oh / s.selloutAvg).toFixed(1))
        : 0;

    const weeks: Record<string, number> = {};
    for (let i = 0; i < WEEKS; i++) {
      weeks[`W+${i}`] = weekArr[i];
    }

    return {
      sku: s.sku,
      customer: s.cust,
      category: s.cat,
      description: s.desc,
      price: s.price,
      selloutAvg: s.selloutAvg,
      oh: s.oh,
      wos,
      totalOfc: s.ofc,
      q1,
      q2,
      q3,
      q4,
      weeks,
    };
  });
}

export function getFallbackData(): ForecastResponse {
  const data = buildFallbackSkus();
  const weekColumns = Array.from({ length: WEEKS }, (_, i) => `W+${i}`);
  const totalUnits = data.reduce((s, r) => s + r.totalOfc, 0);
  const categories = [...new Set(data.map((d) => d.category))];

  return {
    anker: {
      lastModified: new Date('2026-02-19T10:30:00-06:00').toISOString(),
      data,
    },
    c2: null,
    discrepancies: [],
    meta: {
      totalSkus: data.length,
      totalUnits,
      categories,
      weekColumns,
      mode: 'single',
    },
  };
}
