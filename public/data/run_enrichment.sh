#!/usr/bin/env bash
# =============================================================================
# run_enrichment.sh
# =============================================================================
# Runs pqc_enrichment.py on every subfolder that contains a cbom.json.
# Always run this from the PNB-QRIE root directory.
#
# Usage:
#   bash run_enrichment.sh              # process ALL subfolders automatically
#   bash run_enrichment.sh Microsoft    # process one specific folder
#   bash run_enrichment.sh Microsoft PNB  # process multiple specific folders
#
# Output:
#   Each folder gets enriched_cbom.json written next to its cbom.json.
#     Microsoft/cbom.json  -->  Microsoft/enriched_cbom.json
#     PNB/cbom.json        -->  PNB/enriched_cbom.json
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENRICHMENT_SCRIPT="$SCRIPT_DIR/pqc_enrichment.py"
INPUT_FILENAME="cbom.json"
OUTPUT_FILENAME="enriched_cbom.json"

# Colour codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Sanity checks ──────────────────────────────────────────────────
if [[ ! -f "$ENRICHMENT_SCRIPT" ]]; then
    echo -e "${RED}Error:${RESET} pqc_enrichment.py not found at:"
    echo "  $ENRICHMENT_SCRIPT"
    echo ""
    echo "Make sure you run this script from the PNB-QRIE root:"
    echo "  cd ~/Documents/PNB-QRIE"
    echo "  bash run_enrichment.sh"
    exit 1
fi

if ! command -v python3 &>/dev/null; then
    echo -e "${RED}Error:${RESET} python3 not found in PATH."
    exit 1
fi

# ── Determine which folders to process ────────────────────────────
if [[ $# -gt 0 ]]; then
    # Folders named explicitly as arguments
    TARGET_FOLDERS=("$@")
else
    # Auto-discover every direct subdirectory that has a cbom.json
    mapfile -t TARGET_FOLDERS < <(
        find "$SCRIPT_DIR" -mindepth 2 -maxdepth 2 -name "$INPUT_FILENAME" \
        | sed "s|/$INPUT_FILENAME$||" \
        | sed "s|^$SCRIPT_DIR/||" \
        | sort
    )
fi

if [[ ${#TARGET_FOLDERS[@]} -eq 0 ]]; then
    echo -e "${YELLOW}No subfolders containing cbom.json were found under:${RESET}"
    echo "  $SCRIPT_DIR"
    exit 0
fi

echo -e "${BOLD}PNB-QRIE — PQC Enrichment Runner${RESET}"
echo -e "Root  : $SCRIPT_DIR"
echo -e "Queued: ${#TARGET_FOLDERS[@]} folder(s)"
echo ""

# ── Process each folder ────────────────────────────────────────────
PASS=0
FAIL=0
SKIP=0

for folder in "${TARGET_FOLDERS[@]}"; do
    input="$SCRIPT_DIR/$folder/$INPUT_FILENAME"
    output="$SCRIPT_DIR/$folder/$OUTPUT_FILENAME"

    echo -e "${CYAN}──────────────────────────────────────${RESET}"
    echo -e "${BOLD}[ $folder ]${RESET}"

    if [[ ! -f "$input" ]]; then
        echo -e "  ${YELLOW}Skipped${RESET} — cbom.json not found."
        SKIP=$((SKIP + 1))
        continue
    fi

    echo "  Input  : $input"
    echo "  Output : $output"

    if python3 "$ENRICHMENT_SCRIPT" "$input" "$output" 2>&1 | sed 's/^/  /'; then
        echo -e "  ${GREEN}Success${RESET}"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}Failed${RESET} — see error above."
        FAIL=$((FAIL + 1))
    fi
    echo ""
done

# ── Final summary ──────────────────────────────────────────────────
echo -e "${CYAN}══════════════════════════════════════${RESET}"
echo -e "${BOLD}All done${RESET}"
echo -e "  ${GREEN}Succeeded : $PASS${RESET}"
[[ $SKIP -gt 0 ]] && echo -e "  ${YELLOW}Skipped   : $SKIP${RESET}"
[[ $FAIL -gt 0 ]] && echo -e "  ${RED}Failed    : $FAIL${RESET}"
echo ""
echo "Enriched files:"
for folder in "${TARGET_FOLDERS[@]}"; do
    out="$SCRIPT_DIR/$folder/$OUTPUT_FILENAME"
    if [[ -f "$out" ]]; then
        size=$(wc -c < "$out")
        echo -e "  ${GREEN}v${RESET}  $folder/$OUTPUT_FILENAME  (${size} bytes)"
    fi
done