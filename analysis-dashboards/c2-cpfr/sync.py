#!/usr/bin/env python3
"""
Sync C2 CPFR data from Anker Google Sheet → Personal Mirror Sheet.
Uses gog CLI with separate OAuth accounts for each.
"""

import subprocess
import json
import sys
from datetime import datetime

ANKER_SHEET = "1GfRZBTAU_oHO6o0jtv_Q9lZRisUznrx9Sfu0_EbwHIs"
MIRROR_SHEET = "1jeFQfH53UA0QFiUTc4oqEkdM3MKhzAFM6LEKJ0Ny_bc"
ANKER_ACCOUNT = "kyle.bartlett@anker.com"
PERSONAL_ACCOUNT = "krbartle@gmail.com"
RANGE = "CPFR!A1:BM50"
MIRROR_RANGE = "Sheet1!A1:BM50"

def run(cmd):
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        print(f"ERROR: {result.stderr}", file=sys.stderr)
        sys.exit(1)
    return result.stdout

def main():
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] Starting CPFR sync...")

    # 1. Read from Anker sheet
    print("  Reading Anker sheet...")
    raw = run([
        "gog", "sheets", "get",
        "-a", ANKER_ACCOUNT,
        "-j", "--results-only",
        ANKER_SHEET, RANGE
    ])
    data = json.loads(raw)
    rows = len(data)
    print(f"  Got {rows} rows from Anker sheet")

    # 2. Convert to JSON string for --values-json
    values_json = json.dumps(data)

    # 3. Clear mirror sheet first
    print("  Clearing mirror sheet...")
    subprocess.run([
        "gog", "sheets", "clear",
        "-a", PERSONAL_ACCOUNT,
        "-y",
        MIRROR_SHEET, MIRROR_RANGE
    ], capture_output=True, text=True, timeout=30)

    # 4. Write to mirror sheet
    print("  Writing to mirror sheet...")
    run([
        "gog", "sheets", "update",
        "-a", PERSONAL_ACCOUNT,
        "-y",
        "--values-json", values_json,
        MIRROR_SHEET, "Sheet1!A1"
    ])

    print(f"[{ts}] ✓ Sync complete — {rows} rows mirrored")

if __name__ == "__main__":
    main()
