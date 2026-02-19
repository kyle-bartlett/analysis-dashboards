// =============================================================================
// GET /api/forecast — Fetch merged forecast data
// =============================================================================

import { NextResponse } from 'next/server';
import { readCpfrSheet, isSheetsConfigured, isC2SheetConfigured } from '@/lib/sheets';
import { getFallbackData } from '@/lib/fallbackData';
import type { ForecastResponse, Discrepancy } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // If Google Sheets not configured, return fallback data
    if (!isSheetsConfigured()) {
      const fallback = getFallbackData();
      return NextResponse.json(fallback);
    }

    // Read Anker's sheet
    const ankerSheetId = process.env.ANKER_SHEET_ID;
    const ankerTab = process.env.ANKER_SHEET_TAB || 'CPFR';

    if (!ankerSheetId) {
      return NextResponse.json(getFallbackData());
    }

    const ankerResult = await readCpfrSheet(ankerSheetId, ankerTab);

    if (!ankerResult) {
      // Sheets configured but failed to read — use fallback
      console.warn('[forecast] Failed to read Anker sheet, using fallback');
      return NextResponse.json(getFallbackData());
    }

    // Build response
    const response: ForecastResponse = {
      anker: {
        lastModified: ankerResult.lastModified,
        data: ankerResult.data,
      },
      c2: null,
      discrepancies: [],
      meta: {
        totalSkus: ankerResult.data.length,
        totalUnits: ankerResult.data.reduce((s, r) => s + r.totalOfc, 0),
        categories: [...new Set(ankerResult.data.map((d) => d.category))],
        weekColumns: ankerResult.weekColumns.map((_, i) => `W+${i}`),
        mode: 'single',
      },
    };

    // Read C2's sheet if configured
    if (isC2SheetConfigured()) {
      const c2SheetId = process.env.C2_SHEET_ID!;
      const c2Tab = process.env.C2_SHEET_TAB || 'CPFR';
      const c2Result = await readCpfrSheet(c2SheetId, c2Tab);

      if (c2Result) {
        response.c2 = {
          lastModified: c2Result.lastModified,
          data: c2Result.data,
        };
        response.meta.mode = 'dual';

        // Find discrepancies
        const discrepancies: Discrepancy[] = [];
        const c2Map = new Map(c2Result.data.map((d) => [d.sku, d]));

        for (const ankerSku of ankerResult.data) {
          const c2Sku = c2Map.get(ankerSku.sku);
          if (!c2Sku) continue;

          for (const weekKey of Object.keys(ankerSku.weeks)) {
            const ankerVal = ankerSku.weeks[weekKey] || 0;
            const c2Val = c2Sku.weeks[weekKey] || 0;

            if (ankerVal !== c2Val) {
              discrepancies.push({
                sku: ankerSku.sku,
                customer: ankerSku.customer,
                week: weekKey,
                anker: ankerVal,
                c2: c2Val,
                diff: c2Val - ankerVal,
              });
            }
          }
        }

        response.discrepancies = discrepancies;
      }
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error('[forecast] Error:', err);
    return NextResponse.json(getFallbackData());
  }
}
