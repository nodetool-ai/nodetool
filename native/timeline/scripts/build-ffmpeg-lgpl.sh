#!/usr/bin/env bash
# Builds FFmpeg as LGPL shared libraries for packaging (PLAN M6: "FFmpeg as
# an LGPL build, linked dynamically"). Homebrew's FFmpeg is configured with
# --enable-gpl (libx264, libx265 and others), so it cannot ship in the app.
# This build enables no GPL or nonfree part; its configure prints
# "License: LGPL version 2.1 or later", and the script fails otherwise.
#
# Output: build-ffmpeg-lgpl/install (lib/, include/, lib/pkgconfig/), with
# @rpath install names so the app bundle can relocate the libraries.
#
#   scripts/build-ffmpeg-lgpl.sh            # build once, keep an existing install
#   scripts/build-ffmpeg-lgpl.sh --force    # rebuild
set -euo pipefail

cd "$(dirname "$0")/.."
version=8.0
sha256=b2751fccb6cc4c77708113cd78b561059b6fa904b24162fa0be2d60273d27b8e
root=build-ffmpeg-lgpl
prefix="$PWD/$root/install"
[[ "${1:-}" == "--force" ]] && rm -rf "$root"
export_codecs_configured() {
    local codec
    for codec in libmp3lame libopenh264 libopus libvpx; do
        grep -qw "$codec" "$root/configure.log" || return 1
    done
}
if [[ -f "$prefix/lib/pkgconfig/libavcodec.pc" ]] && export_codecs_configured; then
    echo "kept $prefix"
    exit 0
fi
mkdir -p "$root/src" "$root/obj"
pkg-config --exists lame openh264 opus vpx || {
    echo "error: export needs LAME, OpenH264, Opus and libvpx development packages" >&2
    exit 1
}
codec_cflags=$(pkg-config --cflags lame openh264 opus vpx)
codec_ldflags=$(pkg-config --libs-only-L lame openh264 opus vpx)
tarball="$root/ffmpeg-$version.tar.xz"
if [[ ! -f "$tarball" ]]; then
    curl -sSfL --retry 3 --retry-all-errors --retry-delay 2 --retry-max-time 180 \
        -o "$tarball.part" "https://ffmpeg.org/releases/ffmpeg-$version.tar.xz"
    mv "$tarball.part" "$tarball"
fi
echo "$sha256  $tarball" | shasum -a 256 -c -
tar xf "$tarball" -C "$root/src"
case "$(uname -s)" in
    Darwin) platform=(--enable-videotoolbox --enable-audiotoolbox --install-name-dir=@rpath) ;;
    Linux) platform=(--enable-vaapi) ;;  # the app imports VAAPI frames itself (VulkanInterop)
    *) platform=() ;;
esac
(
    cd "$root/obj"
    "../src/ffmpeg-$version/configure" --prefix="$prefix" --enable-shared --disable-static --disable-programs \
        --enable-libmp3lame --enable-libopenh264 --enable-libopus --enable-libvpx \
        --disable-doc --disable-avdevice --disable-network --extra-cflags="$codec_cflags" --extra-ldflags="$codec_ldflags" "${platform[@]}" | tee ../configure.log
)
grep -q "^License: LGPL version 2.1 or later" "$root/configure.log" || {
    echo "error: the FFmpeg configuration is not LGPL" >&2
    exit 1
}
# Few jobs at low priority: other builds share the machine (NT_JOBS overrides).
nice -n 10 make -C "$root/obj" -j"${NT_JOBS:-3}" > "$root/make.log"
make -C "$root/obj" install > "$root/install.log"
echo "wrote $prefix"
