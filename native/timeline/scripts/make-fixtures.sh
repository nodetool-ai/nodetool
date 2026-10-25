#!/usr/bin/env bash
# Generates the test media the fixtures reference. Output: fixtures/media/
# (ignored by git). A file that exists is kept; pass --force to rebuild all.
#
# Every numbered file carries its frame number twice: as text, and as a 16-bit
# barcode in the top 40 rows of the frame (bit k is the 80 px wide cell at
# x = 80k, white for 1, black for 0), so a check can read it back from pixels.
set -euo pipefail

cd "$(dirname "$0")/.."
out=fixtures/media
mkdir -p "$out"
force=0
[[ "${1:-}" == "--force" ]] && force=1

ff() { ffmpeg -hide_banner -loglevel error -y "$@"; }
need() { [[ $force == 1 || ! -f "$out/$1" ]]; }
kept() { echo "kept $out/$1"; }
wrote() { echo "wrote $out/$1"; }

# A filter graph: `src` with the barcode strip and the burnt-in frame number.
# $1 source, $2 width, $3 height, $4 seconds.
numbered() {
    local src=$1 w=$2 h=$3 s=$4 fs=$(($3 / 8))
    printf '%s' "${src}=size=${w}x${h}:rate=30:duration=${s}[base];" \
        "color=black:size=1280x40:rate=30:duration=${s},format=gray," \
        "geq=lum='if(mod(floor(N/pow(2\\,floor(X/80)))\\,2)\\,255\\,0)'[bar];" \
        "[base][bar]overlay=0:0:shortest=1," \
        "drawtext=text='%{frame_num}':x=(w-tw)/2:y=h-th-${fs}:fontsize=${fs}:fontcolor=white:box=1:boxcolor=black@0.6"
}

# H.264 at 30 fps with a 2 s GOP, BT.709 limited range, tagged.
h264() {
    local name=$1 graph=$2
    if ! need "$name"; then kept "$name"; return; fi
    ff -f lavfi -i "$graph" \
        -vf "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" \
        -c:v libx264 -preset veryfast -crf 18 -g 60 -keyint_min 60 -sc_threshold 0 \
        -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
        -movflags +faststart "$out/$name"
    wrote "$name"
}

# --- media-tracks.json (the M1a layout) --------------------------------------
legacy() {
    local name=$1 src=$2 size=$3 seconds=$4
    if ! need "$name"; then kept "$name"; return; fi
    # Tagged BT.601 limited, which is what the conversion to YUV wrote, so no
    # golden check depends on the untagged guess (R6).
    ff -f lavfi -i "${src}=size=${size}:rate=30:duration=${seconds}" \
        -vf "scale=out_color_matrix=bt601:out_range=tv,format=yuv420p" \
        -c:v libx264 -preset veryfast -g 30 \
        -colorspace smpte170m -color_primaries smpte170m -color_trc smpte170m -color_range tv "$out/$name"
    wrote "$name"
}
legacy background-1080p.mp4 testsrc2 1920x1080 20
legacy pip-a-720p.mp4 smptebars 1280x720 10
legacy pip-b-720p.mp4 testsrc2 1280x720 12
legacy square-800.mp4 testsrc 800x800 10

# --- video-4tracks.json: four numbered 1080p30 H.264 sources -----------------
h264 numbered-a-1080p30.mp4 "$(numbered testsrc2 1920 1080 20)"
h264 numbered-b-1080p30.mp4 "$(numbered smptehdbars 1920 1080 20)"
h264 numbered-c-1080p30.mp4 "$(numbered testsrc 1920 1080 20)"
h264 numbered-d-1080p30.mp4 "$(numbered rgbtestsrc 1920 1080 20)"

# --- video-4k-hevc.json: two numbered 4K30 HEVC sources (8-bit 4:2:0 BT.709) ---
hevc4k() {
    local name=$1 src=$2
    if ! need "$name"; then kept "$name"; return; fi
    ff -f lavfi -i "$(numbered "$src" 3840 2160 15)" \
        -vf "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" \
        -c:v libx265 -preset ultrafast -crf 26 \
        -x265-params log-level=error:keyint=60:min-keyint=60:scenecut=0:colorprim=bt709:transfer=bt709:colormatrix=bt709 \
        -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -tag:v hvc1 \
        -movflags +faststart "$out/$name"
    wrote "$name"
}
hevc4k numbered-a-2160p30-hevc.mp4 testsrc2
hevc4k numbered-b-2160p30-hevc.mp4 smptehdbars

# --- seek tests (ctest): small numbered files --------------------------------
h264 seek-360p30.mp4 "$(numbered testsrc2 640 360 10)"
# Raw Annex-B H.264 with no container timestamps: the decoder must not rely
# on a seek or on packet times to place its frames.
if need annexb-360p30.h264; then
    ff -i "$out/seek-360p30.mp4" -c copy -bsf:v h264_mp4toannexb -f h264 "$out/annexb-360p30.h264"
    wrote annexb-360p30.h264
else
    kept annexb-360p30.h264
fi
# Variable frame rate: frame n starts at n/30 s for n < 30, then at
# (2n - 30)/30 s, so the second half runs at 15 fps.
if need vfr-360p.mp4; then
    ff -f lavfi -i "$(numbered testsrc2 640 360 4)" \
        -vf "setpts='if(lt(N,30),N,2*N-30)/(30*TB)',scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" \
        -fps_mode passthrough -c:v libx264 -preset veryfast -crf 18 -g 60 \
        -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
        -video_track_timescale 30000 "$out/vfr-360p.mp4"
    wrote vfr-360p.mp4
else
    kept vfr-360p.mp4
fi

# --- colour bars: BT.709 / BT.601, limited / full range ----------------------
bars() {
    local name=$1 matrix=$2 tag=$3 range=$4
    if ! need "$name"; then kept "$name"; return; fi
    ff -f lavfi -i "smptehdbars=size=1920x1080:rate=30:duration=3" \
        -vf "scale=out_color_matrix=${matrix}:out_range=${range},format=yuv420p" \
        -c:v libx264 -preset veryfast -qp 0 -g 30 \
        -colorspace "$tag" -color_primaries "$tag" -color_trc "$tag" -color_range "$range" \
        "$out/$name"
    wrote "$name"
}
bars colorbars-bt709-limited.mp4 bt709 bt709 tv
bars colorbars-bt709-full.mp4 bt709 bt709 pc
bars colorbars-bt601-limited.mp4 bt601 smpte170m tv
bars colorbars-bt601-full.mp4 bt601 smpte170m pc

# --- RGB input: decoded as GBRP or RGB24, converted to YUV on the worker ----
rgb() {
    local name=$1 spec=$2 codec=$3
    if ! need "$name"; then kept "$name"; return; fi
    case "$codec" in
    x264rgb) ff -f lavfi -i "$spec" -c:v libx264rgb -qp 0 -pix_fmt bgr0 "$out/$name" ;;
    png) ff -f lavfi -i "$spec" -c:v png -pix_fmt rgb24 "$out/$name" ;;
    esac
    wrote "$name"
}
rgb rgb-solid-720p.mp4 "color=c=0xC02040:size=1280x720:rate=30:duration=1" x264rgb
rgb rgb-bars-gbrp.mp4 "smptehdbars=size=1920x1080:rate=30:duration=3" x264rgb
rgb rgb-bars-png.mov "smptehdbars=size=1920x1080:rate=30:duration=1" png
# 4:4:4 YUV, BT.709 values with no colour tags: converted to I420 on the
# worker, read with the D10 default (BT.709 at 720 lines).
if need yuv444-untagged-720p.mp4; then
    ff -f lavfi -i "color=c=0xC02040:size=1280x720:rate=30:duration=1" \
        -vf "scale=out_color_matrix=bt709:out_range=tv,format=yuv444p" -c:v libx264 -qp 0 \
        "$out/yuv444-untagged-720p.mp4"
    wrote yuv444-untagged-720p.mp4
else
    kept yuv444-untagged-720p.mp4
fi

# --- untagged media: the D10 guess by height (R6) ----------------------------
# No colour tags. HD content is BT.709 and SD content BT.601, which is what
# the guess must pick.
untagged() {
    local name=$1 size=$2 matrix=$3
    if ! need "$name"; then kept "$name"; return; fi
    ff -f lavfi -i "color=c=0xC02040:size=${size}:rate=30:duration=1" \
        -vf "scale=out_color_matrix=${matrix}:out_range=tv,format=yuv420p,setparams=colorspace=unknown:color_primaries=unknown:color_trc=unknown:range=unknown" \
        -c:v libx264 -qp 0 "$out/$name"
    wrote "$name"
}
untagged untagged-hd-720p.mp4 1280x720 bt709
untagged untagged-sd-480p.mp4 854x480 bt601

# --- D10a rejections: one file per reason ------------------------------------
if need reject-rotation.mp4; then
    ff -f lavfi -i "testsrc2=size=1280x720:rate=30:duration=3" -c:v libx264 -pix_fmt yuv420p \
        -preset veryfast "$out/reject-rotation-src.mp4"
    ff -display_rotation:v:0 90 -i "$out/reject-rotation-src.mp4" -c copy "$out/reject-rotation.mp4"
    rm -f "$out/reject-rotation-src.mp4"
    wrote reject-rotation.mp4
else
    kept reject-rotation.mp4
fi
if need reject-pixel-aspect.mp4; then
    ff -f lavfi -i "testsrc2=size=1440x1080:rate=30:duration=3" -vf "setsar=4/3,format=yuv420p" \
        -c:v libx264 -preset veryfast "$out/reject-pixel-aspect.mp4"
    wrote reject-pixel-aspect.mp4
else
    kept reject-pixel-aspect.mp4
fi
if need reject-alpha.mov; then
    ff -f lavfi -i "testsrc2=size=640x360:rate=30:duration=3" -vf "format=argb" \
        -c:v qtrle "$out/reject-alpha.mov"
    wrote reject-alpha.mov
else
    kept reject-alpha.mov
fi
if need reject-hdr.mp4; then
    ff -f lavfi -i "testsrc2=size=1280x720:rate=30:duration=3" -vf "format=yuv420p10le" \
        -c:v libx265 -preset ultrafast -x265-params log-level=error:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc \
        -color_primaries bt2020 -color_trc smpte2084 -colorspace bt2020nc -color_range tv \
        -tag:v hvc1 "$out/reject-hdr.mp4"
    wrote reject-hdr.mp4
else
    kept reject-hdr.mp4
fi
