// =============================================================================
// Google Sheets API Wrapper — Dynamic Column Mapping
// =============================================================================
// Reads forecast data from Google Sheets using a service account.
// Column positions are discovered dynamically by matching header text,
// NOT hardcoded indices. This means if columns are rearranged, inserted,
// or renamed, the dashboard adapts automatically.

import { google } from 'googleapis';
import type { SkuForecast } from './types';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!email || !key) return null;

  const auth = new google.auth.JWT(email, undefined, key, [
    'https://www.googleapis.com/auth/spreadsheets',
  ]);

  return google.sheets({ version: 'v4', auth });
}

// ---------------------------------------------------------------------------
// Dynamic Column Discovery
// ---------------------------------------------------------------------------
// Known column headers we look for (case-insensitive matching)
const KNOWN_HEADERS: Record<string, string[]> = {
  ANKER_SKU: ['Anker SKU', 'Anker_SKU', 'SKU', 'Anker Model'],
  CUSTOMER: ['Customer', 'Cust', 'Account'],
  PRICE: ['Price', 'Unit Price', 'Sell Price', 'ASP'],
  PDT: ['PDT', 'Category', 'Product Type', 'Product Category'],
  SELLOUT_AVG: ['Sellout avg', 'Sellout Avg', 'Sellout Average', 'Avg Sellout', 'Weekly Sellout'],
  OH: ['OH', 'On Hand', 'On-Hand', 'Inventory', 'Current OH'],
  WOS: ['WOS', 'Weeks of Supply', 'Weeks Supply', 'WoS'],
  TOTAL_OFC: ['Total OFC', 'Total Forecast', 'OFC Total', 'Total'],
  Q1: ['Q1', 'Q1 Total', 'Quarter 1'],
  Q2: ['Q2', 'Q2 Total', 'Quarter 2'],
  Q3: ['Q3', 'Q3 Total', 'Quarter 3'],
  Q4: ['Q4', 'Q4 Total', 'Quarter 4'],
};

// Pattern for weekly columns: 6-digit fiscal week (YYYYWW) or W+N
const WEEK_PATTERN = /^(\d{6})$|^W\+\d+$/;

interface ColumnMap {
  [key: string]: number; // header key → column index
}

interface WeekColumnInfo {
  index: number;
  label: string; // original header text (e.g., "202606")
  weekKey: string; // normalized key for the frontend (e.g., "W+0")
}

function discoverColumns(headerRow: string[]): {
  columnMap: ColumnMap;
  weekColumns: WeekColumnInfo[];
  rawHeaders: string[];
  warnings: string[];
} {
  const columnMap: ColumnMap = {};
  const weekColumns: WeekColumnInfo[] = [];
  const warnings: string[] = [];
  const rawHeaders = headerRow.map((h) => (h || '').toString().trim());

  // Match known columns by header text (case-insensitive)
  for (const [key, aliases] of Object.entries(KNOWN_HEADERS)) {
    let found = false;
    for (const alias of aliases) {
      const idx = rawHeaders.findIndex(
        (h) => h.toLowerCase() === alias.toLowerCase()
      );
      if (idx !== -1) {
        columnMap[key] = idx;
        found = true;
        break;
      }
    }
    if (!found) {
      warnings.push(`Column "${key}" not found (looked for: ${aliases.join(', ')})`);
    }
  }

  // Find weekly columns (6-digit fiscal week codes or W+N patterns)
  for (let i = 0; i < rawHeaders.length; i++) {
    const h = rawHeaders[i];
    if (WEEK_PATTERN.test(h)) {
      weekColumns.push({
        index: i,
        label: h,
        weekKey: '', // will be assigned below
      });
    }
  }

  // Sort week columns by index (they should already be in order, but be safe)
  weekColumns.sort((a, b) => a.index - b.index);

  // Assign W+N keys
  weekColumns.forEach((wc, i) => {
    wc.weekKey = `W+${i}`;
  });

  if (weekColumns.length === 0) {
    warnings.push('No weekly columns found (expected YYYYWW or W+N pattern headers)');
  }

  return { columnMap, weekColumns, rawHeaders, warnings };
}

function parseNumber(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = val.toString().replace(/[$,\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function safeGet(row: string[], idx: number | undefined): string | undefined {
  if (idx === undefined || idx < 0 || idx >= row.length) return undefined;
  return row[idx];
}

// ---------------------------------------------------------------------------
// Read CPFR data from a sheet (dynamic column mapping)
// ---------------------------------------------------------------------------
export async function readCpfrSheet(
  sheetId: string,
  tabName: string = 'CPFR',
  headerRowIndex: number = 4, // 0-indexed row for header (row 5 = index 4)
  dataStartRow: number = 5 // 0-indexed row where data begins (row 6 = index 5)
): Promise<{
  data: SkuForecast[];
  weekColumns: string[];
  weekLabels: string[];
  lastModified: string;
  columnMapping: Record<string, number>;
  warnings: string[];
} | null> {
  const sheets = getSheetsClient();
  if (!sheets) return null;

  try {
    // Read the entire range including header and data
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!A1:CZ500`,
    });
    const allRows = res.data.values || [];

    if (allRows.length <= headerRowIndex) {
      console.warn(`[sheets] Sheet "${tabName}" has fewer rows than expected header row ${headerRowIndex + 1}`);
      return null;
    }

    // Discover columns from header row
    const headerRow = allRows[headerRowIndex] || [];
    const { columnMap, weekColumns, warnings } = discoverColumns(
      headerRow.map((v: string) => v?.toString() || '')
    );

    // Log warnings for debugging
    for (const w of warnings) {
      console.warn(`[sheets] ${w}`);
    }

    // Extract week column labels (original header text and W+N keys)
    const weekLabels = weekColumns.map((wc) => wc.label);
    const weekKeys = weekColumns.map((wc) => wc.weekKey);

    // Read data rows
    const dataRows = allRows.slice(dataStartRow);

    // Get last modified time from Drive API
    let lastModified = new Date().toISOString();
    try {
      const drive = google.drive({
        version: 'v3',
        auth: sheets.context._options.auth,
      });
      const fileRes = await drive.files.get({
        fileId: sheetId,
        fields: 'modifiedTime',
      });
      lastModified = fileRes.data.modifiedTime || lastModified;
    } catch {
      // Drive API might not be enabled, that's fine
    }

    const data: SkuForecast[] = [];

    for (const row of dataRows) {
      const sku = safeGet(row, columnMap.ANKER_SKU)?.trim();
      if (!sku) continue; // Skip empty rows

      const customer = safeGet(row, columnMap.CUSTOMER)?.trim() || 'Unknown';

      // Filter: only C2 Wireless rows (skip VoiceComm)
      if (customer.toLowerCase().includes('voicecomm')) continue;

      const category = safeGet(row, columnMap.PDT)?.trim() || 'Unknown';

      // Build weekly forecast map
      const weeks: Record<string, number> = {};
      for (const wc of weekColumns) {
        weeks[wc.weekKey] = parseNumber(safeGet(row, wc.index));
      }

      data.push({
        sku,
        customer,
        category,
        price: parseNumber(safeGet(row, columnMap.PRICE)),
        selloutAvg: parseNumber(safeGet(row, columnMap.SELLOUT_AVG)),
        oh: parseNumber(safeGet(row, columnMap.OH)),
        wos: parseNumber(safeGet(row, columnMap.WOS)),
        totalOfc: parseNumber(safeGet(row, columnMap.TOTAL_OFC)),
        q1: parseNumber(safeGet(row, columnMap.Q1)),
        q2: parseNumber(safeGet(row, columnMap.Q2)),
        q3: parseNumber(safeGet(row, columnMap.Q3)),
        q4: parseNumber(safeGet(row, columnMap.Q4)),
        weeks,
      });
    }

    return {
      data,
      weekColumns: weekKeys,
      weekLabels,
      lastModified,
      columnMapping: columnMap,
      warnings,
    };
  } catch (err) {
    console.error('Error reading Google Sheet:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Write values back to a sheet (for accept operations)
// ---------------------------------------------------------------------------
export async function writeCpfrValues(
  sheetId: string,
  tabName: string,
  updates: { row: number; col: number; value: number }[]
): Promise<boolean> {
  const sheets = getSheetsClient();
  if (!sheets) return false;

  try {
    const data = updates.map((u) => {
      // Convert col index to A1 notation
      let col = '';
      let c = u.col;
      while (c >= 0) {
        col = String.fromCharCode(65 + (c % 26)) + col;
        c = Math.floor(c / 26) - 1;
      }
      return {
        range: `${tabName}!${col}${u.row}`,
        values: [[u.value]],
      };
    });

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data,
      },
    });

    return true;
  } catch (err) {
    console.error('Error writing to Google Sheet:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Check if sheets are configured
// ---------------------------------------------------------------------------
export function isSheetsConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY
  );
}

export function isC2SheetConfigured(): boolean {
  return !!process.env.C2_SHEET_ID;
}
