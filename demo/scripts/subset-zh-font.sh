#!/usr/bin/env bash
# Subsets Noto Sans SC to the glyphs the Chinese hero cut uses and writes
# demo/public/promo/NotoSansSC-<weight>.subset.woff2.
#
# Usage: scripts/subset-zh-font.sh <dir with NotoSansSC_*.ttf>
# The TTFs come from the @expo-google-fonts/noto-sans-sc npm package
# (`npm pack @expo-google-fonts/noto-sans-sc`). Needs fonttools and brotli
# (`pip install fonttools brotli`).
set -euo pipefail
SRC="${1:?directory with NotoSansSC_*.ttf}"
DEMO="$(cd "$(dirname "$0")/.." && pwd)"
TEXT="$(mktemp)"
trap 'rm -f "$TEXT"' EXIT
# Every character in the zh copy, plus ASCII so mixed runs never fall back.
cat "$DEMO/src/heroflow/locale.ts" "$DEMO/src/heroflow/VerticalCut.tsx" > "$TEXT"
printf '%s' ' !"#$%&()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]_abcdefghijklmnopqrstuvwxyz{|}~·—：，。、？！；（）' >> "$TEXT"
for pair in 400:Regular 500:Medium 600:SemiBold 800:ExtraBold; do
  weight="${pair%%:*}"
  name="${pair##*:}"
  ttf="$(find "$SRC" -name "NotoSansSC_${weight}${name}.ttf" | head -1)"
  pyftsubset "$ttf" --text-file="$TEXT" --flavor=woff2 \
    --layout-features='*' \
    --output-file="$DEMO/public/promo/NotoSansSC-${weight}.subset.woff2"
done
ls -l "$DEMO"/public/promo/NotoSansSC-*.subset.woff2
