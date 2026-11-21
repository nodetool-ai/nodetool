#!/usr/bin/env bash
# Subsets Noto Sans SC and Noto Sans JP to the glyphs the Chinese and
# Japanese hero cuts use, and writes
# demo/public/promo/NotoSans{SC,JP}-<weight>.subset.woff2.
#
# Usage: scripts/subset-cjk-font.sh <dir with NotoSansSC_*.ttf> <dir with NotoSansJP_*.ttf>
# The TTFs come from the @expo-google-fonts/noto-sans-sc and
# @expo-google-fonts/noto-sans-jp npm packages (`npm pack <name>`).
# Needs fonttools and brotli (`pip install fonttools brotli`).
set -euo pipefail
SC="${1:?directory with NotoSansSC_*.ttf}"
JP="${2:?directory with NotoSansJP_*.ttf}"
DEMO="$(cd "$(dirname "$0")/.." && pwd)"
TEXT="$(mktemp)"
trap 'rm -f "$TEXT"' EXIT
# Every character in the copy, plus ASCII so mixed runs never fall back.
cat "$DEMO/src/heroflow/locale.ts" "$DEMO/src/heroflow/VerticalCut.tsx" > "$TEXT"
printf '%s' ' !"#$%&()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]_abcdefghijklmnopqrstuvwxyz{|}~·—：，。、？！；（）' >> "$TEXT"
for pair in 400:Regular 500:Medium 600:SemiBold 800:ExtraBold; do
  weight="${pair%%:*}"
  name="${pair##*:}"
  for font in "SC:$SC" "JP:$JP"; do
    script="${font%%:*}"
    dir="${font#*:}"
    ttf="$(find "$dir" -name "NotoSans${script}_${weight}${name}.ttf" | head -1)"
    pyftsubset "$ttf" --text-file="$TEXT" --flavor=woff2 \
      --layout-features='*' \
      --output-file="$DEMO/public/promo/NotoSans${script}-${weight}.subset.woff2"
  done
done
ls -l "$DEMO"/public/promo/NotoSans*.subset.woff2
