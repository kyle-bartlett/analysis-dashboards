// =============================================================================
// Google Sheets API Wrapper
// =============================================================================
// Reads forecast data from Google Sheets using a service account.
// Falls back to hardcoded sample data when credentials aren't configured.

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
// CPFR Tab column mapping (row 5 is header, data starts row 6)
// A=Q1, B=Q2, C=Q3, D=Q4, E=Price, F=PDT, G=Sellout avg, H=OH, I=WOS,
// J=Total OFC, K-S=misc, T=Anker SKU (col index 19),
// U onwards = weekly sell-in (202606, 202607, ...)
// Q=Customer (col index 16)
// ---------------------------------------------------------------------------
const COL = {
  Q1: 0,
  Q2: 1,
  Q3: 2,
  Q4: 3,
  PRICE: 4,
  PDT: 5,
  SELLOUT_AVG: 6,
  OH: 7,
  WOS: 8,
  TOTAL_OFC: 9,
  CUSTOMER: 16,
  ANKER_SKU: 19,
  WEEK_START: 20, // Column U onwards
};

// Week column labels from the sheet (fiscal weeks)
// We'll read them from the header row and map to W+0, W+1, etc.

function parseNumber(val: string | undefined): number {
  if (!val) return 0;
  // Remove $, commas, and whitespace
  const cleaned = val.toString().replace(/[$,\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// ---------------------------------------------------------------------------
// Read CPFR data from a sheet
// ---------------------------------------------------------------------------
export async function readCpfrSheet(
  sheetId: string,
  tabName: string = 'CPFR'
): Promise<{ data: SkuForecast[]; weekColumns: string[]; lastModified: string } | null> {
  const sheets = getSheetsClient();
  if (!sheets) return null;

  try {
    // Read header row (row 5) to get week column labels
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!A5:CZ5`,
    });
    const headerRow = headerRes.data.values?.[0] || [];

    // Extract week column labels (starting from col U = index 20)
    const weekColumns: string[] = [];
    for (let i = COL.WEEK_START; i < headerRow.length; i++) {
      const label = headerRow[i]?.toString().trim();
      if (label) {
        weekColumns.push(label);
      }
    }

    // Read data rows (row 6 onwards)
    const dataRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!A6:CZ200`,
    });
    const rows = dataRes.data.values || [];

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

    for (const row of rows) {
      const sku = row[COL.ANKER_SKU]?.toString().trim();
      if (!sku) continue; // Skip empty rows

      const customer = row[COL.CUSTOMER]?.toString().trim() || 'Unknown';
      const category = row[COL.PDT]?.toString().trim() || 'Unknown';

      // Build weekly forecast map
      const weeks: Record<string, number> = {};
      for (let i = 0; i < weekColumns.length; i++) {
        const colIdx = COL.WEEK_START + i;
        const weekLabel = `W+${i}`;
        weeks[weekLabel] = parseNumber(row[colIdx]);
      }

      data.push({
        sku,
        customer,
        category,
        price: parseNumber(row[COL.PRICE]),
        selloutAvg: parseNumber(row[COL.SELLOUT_AVG]),
        oh: parseNumber(row[COL.OH]),
        wos: parseNumber(row[COL.WOS]),
        totalOfc: parseNumber(row[COL.TOTAL_OFC]),
        q1: parseNumber(row[COL.Q1]),
        q2: parseNumber(row[COL.Q2]),
        q3: parseNumber(row[COL.Q3]),
        q4: parseNumber(row[COL.Q4]),
        weeks,
      });
    }

    return { data, weekColumns, lastModified };
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
