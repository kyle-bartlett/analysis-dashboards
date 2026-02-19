#!/bin/bash
# Sync C2 Wireless CPFR data from Anker sheet → Personal mirror sheet
# Runs via cron on Kyle's Mac every 15 minutes
# Anker sheet: read with kyle.bartlett@anker.com OAuth
# Mirror sheet: write with krbartle@gmail.com OAuth

ANKER_SHEET="1GfRZBTAU_oHO6o0jtv_Q9lZRisUznrx9Sfu0_EbwHIs"
MIRROR_SHEET="1jeFQfH53UA0QFiUTc4oqEkdM3MKhzAFM6LEKJ0Ny_bc"
ANKER_ACCOUNT="kyle.bartlett@anker.com"
PERSONAL_ACCOUNT="krbartle@gmail.com"
LOG_FILE="/tmp/c2-cpfr-sync.log"

echo "$(date): Starting CPFR sync..." >> "$LOG_FILE"

# Step 1: Read all data from Anker CPFR tab (rows 1-50, columns A-BM)
DATA=$(gog sheets get -a "$ANKER_ACCOUNT" -j --results-only "$ANKER_SHEET" "CPFR!A1:BM50" 2>&1)

if [ $? -ne 0 ]; then
    echo "$(date): ERROR reading Anker sheet: $DATA" >> "$LOG_FILE"
    exit 1
fi

# Step 2: Clear existing mirror data
gog sheets clear -a "$PERSONAL_ACCOUNT" -y "$MIRROR_SHEET" "Sheet1!A1:BM50" 2>/dev/null

# Step 3: Write data to mirror sheet
echo "$DATA" | gog sheets update -a "$PERSONAL_ACCOUNT" "$MIRROR_SHEET" "Sheet1!A1" --json-input - 2>&1

if [ $? -ne 0 ]; then
    echo "$(date): ERROR writing to mirror sheet" >> "$LOG_FILE"
    exit 1
fi

echo "$(date): Sync complete ✓" >> "$LOG_FILE"
