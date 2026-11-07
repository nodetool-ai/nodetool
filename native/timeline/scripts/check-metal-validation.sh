#!/usr/bin/env bash
# Metal API validation check (PLAN M1c exit 5): renders stills and play
# captures of the 4-track fixture with MTL_DEBUG_LAYER=1, on the software and
# the VideoToolbox paths. Fails when a run exits non-zero, when the log has a
# validation failure, or when the log does not show validation enabled (so a
# run without the layer cannot pass).
# Usage: check-metal-validation.sh [fixture.json] [still frames, a,b,c]
set -uo pipefail

cd "$(dirname "$0")/.."
bin=build/nodetool-timeline
fixture=${1:-fixtures/video-4tracks.json}
frames=${2:-0,149,150,300,449}
out=build/metal-validation/$(basename "$fixture" .json)
rm -rf "$out"
mkdir -p "$out"
status=0
for decode in sw hw; do
    for mode in --stills --play-stills; do
        log="$out/${decode}${mode}.log"
        MTL_DEBUG_LAYER=1 "$bin" "$fixture" --decode "$decode" "$mode" "$out/${decode}${mode}" \
            --still-frames "$frames" > /dev/null 2> "$log"
        rc=$?
        enabled=$(grep -c "Metal API Validation Enabled" "$log")
        failures=$(grep -ciE "failed assertion|validation error" "$log")
        verdict=ok
        if [[ $rc != 0 || $enabled == 0 || $failures != 0 ]]; then
            verdict=FAIL
            status=1
        fi
        echo "{\"decode\":\"$decode\",\"mode\":\"${mode#--}\",\"exit\":$rc,\"validationEnabled\":$((enabled > 0 ? 1 : 0)),\"failures\":$failures,\"verdict\":\"$verdict\"}"
    done
done
exit $status
