#!/usr/bin/env bash
# Small WebP stills for the recipe step diagrams (src/components/recipeSteps/).
# Every still is a frame or a resize of an accepted run file. Run from marketing/.
# Needs ffmpeg and ImageMagick.
set -euo pipefail
out=public/recipes/step-media
runs=public/recipes/runs
assets=recipe-assets
mkdir -p "$out"/{campaign,ugc,worlds,commercial,dub,catalogue,trailer}

still() { # source width target
  convert "$1" -resize "$2x" -quality 78 "$3"
}
frame() { # video seconds width target
  ffmpeg -loglevel error -y -ss "$2" -i "$1" -frames:v 1 -vf "scale=$3:-2" -c:v libwebp -quality 78 "$4"
}

product="$assets/2026-09-10-marketing-recipes-01/shared/product/product-reference.png"

c="$runs/2026-09-14-directed-campaign-kit-gpt25"
still "$c/product-reference.png" 280 "$out/campaign/product.webp"
still "$c/hero.png" 640 "$out/campaign/hero.webp"
still "$c/social-square.png" 320 "$out/campaign/square.webp"
still "$c/story.png" 220 "$out/campaign/story.webp"
still "$c/revision.png" 640 "$out/campaign/revision.webp"

u="$runs/2026-09-14-emotional-support-cup/final.mp4"
still "$product" 240 "$out/ugc/product.webp"
for pair in creator:0.5 hook:1.5 leave:3.5 street:6.5 work:8.5 pause:11.5 evening:13.5; do
  frame "$u" "${pair#*:}" 240 "$out/ugc/${pair%%:*}.webp"
done

w="$runs/2026-09-14-impossible-product-worlds-dreamina/final.mp4"
still "$product" 240 "$out/worlds/product.webp"
for pair in dunes:0.5 climb:3.5 reveal:4.5 run:6.5 jump:7.5 splash:8.5 drink:11.5 final:14.5; do
  frame "$w" "${pair#*:}" 240 "$out/worlds/${pair%%:*}.webp"
done

m="$runs/2026-09-14-photographic-commercial"
still "$product" 240 "$out/commercial/product.webp"
still "$m/reference.webp" 480 "$out/commercial/reference.webp"
still "$m/insert.webp" 480 "$out/commercial/insert.webp"
for pair in pour:2 pause:6 leave:10.5; do
  frame "$m/commercial.mp4" "${pair#*:}" 480 "$out/commercial/${pair%%:*}.webp"
done

d="$assets/2026-09-10-marketing-recipes-01/multilingual-video-dubber/web"
still "$d/source-en-poster.webp" 480 "$out/dub/source-en.webp"
still "$d/dub-es-voiceover-poster.webp" 480 "$out/dub/voiceover-es.webp"
still "$d/dub-es-lipsync-poster.webp" 480 "$out/dub/lipsync-es.webp"

k="$assets/2026-09-10-marketing-recipes-01/ecommerce-sku-visual-factory"
still "$k/sources/product-original.png" 320 "$out/catalogue/product.webp"
still "$k/sources/product-cutout.png" 320 "$out/catalogue/cutout.webp"
still "$k/selects/studio-hero.png" 320 "$out/catalogue/studio.webp"
still "$k/selects/winter-scene.png" 320 "$out/catalogue/winter.webp"
still "$k/selects/motion-hero.png" 320 "$out/catalogue/motion.webp"

t="$runs/2026-09-10-marketing-recipes-01/storyboard-to-trailer"
for name in elin lighthouse keepers-room message-bottle; do
  still "$t/$name.jpg" 320 "$out/trailer/$name.webp"
done
# Shots 1 to 5 from the 3200-pixel board capture, shot 6 from the published board.
board="$assets/2026-09-10-marketing-recipes-01/storyboard-to-trailer/captures/raw/tr-c6.png"
crop() { convert "$board" -crop "$1" +repage -resize 320x -quality 78 "$out/trailer/$2.webp"; }
crop 560x312+134+480 shot-1
crop 560x312+732+480 shot-2
crop 560x312+134+920 shot-3
crop 560x312+732+920 shot-4
crop 560x312+134+1360 shot-5
convert "$t/storyboard-board.jpg" -crop 151x84+55+631 +repage -resize 320x -quality 78 "$out/trailer/shot-6.webp"
