#!/bin/bash
# An ffmpeg stand-in for the scratch servers of server-check.mjs. It runs the
# real ffmpeg, except:
#   - NT_FAKE_NO_X264=1 hides libx264 from `-encoders`, so the server makes
#     VP9 proxies (video-proxy.ts picks VP9 when libx264 is missing);
#   - a proxy encode (its output ends in `.partial`) of an input whose MD5 is
#     NT_FAKE_FAIL_MD5 exits 1 (a failed proxy), and of NT_FAKE_HOLD_MD5
#     sleeps until the server stops (a pending proxy).
# Every other call (thumbnails, probes, other proxies) is the real ffmpeg.
real="${NT_REAL_FFMPEG:-/opt/homebrew/bin/ffmpeg}"

for arg in "$@"; do
  if [ "$arg" = "-encoders" ] && [ "${NT_FAKE_NO_X264:-}" = "1" ]; then
    "$real" "$@" | grep -v libx264
    exit "${PIPESTATUS[0]}"
  fi
done

last="${@: -1}"
if [[ "$last" == *.partial ]]; then
  input=""
  prev=""
  for arg in "$@"; do
    if [ "$prev" = "-i" ]; then input="$arg"; fi
    prev="$arg"
  done
  if [ -n "$input" ] && [ -f "$input" ]; then
    sum=$(md5 -q "$input")
    if [ -n "${NT_FAKE_FAIL_MD5:-}" ] && [ "$sum" = "$NT_FAKE_FAIL_MD5" ]; then
      echo "fake-ffmpeg: failing the proxy encode on purpose" >&2
      exit 1
    fi
    if [ -n "${NT_FAKE_HOLD_MD5:-}" ] && [ "$sum" = "$NT_FAKE_HOLD_MD5" ]; then
      exec sleep 3600
    fi
  fi
fi
exec "$real" "$@"
