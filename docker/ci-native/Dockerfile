# syntax=docker/dockerfile:1
#
# The Linux image the native CI jobs run in: the native timeline build and
# sanitizer legs, the native UI primitives, the VST host, the graph runner and
# the GPU preview. It carries the
# system packages those jobs used to apt-get install at run time. Qt and the
# LGPL FFmpeg build still install per job, because their versions live in the
# workflows. See docker/ci/README.md for the tag scheme and container options.

FROM ubuntu:24.04@sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852

ARG DEBIAN_FRONTEND=noninteractive

# General tools the jobs call (git, jq, pipx for aqtinstall, zstd for
# actions/cache) and both toolchains: GCC for the release build, Clang with
# its runtime libraries for the ASan and TSan presets, and lld, which links
# the many test executables faster than GNU ld for both. llvm puts
# llvm-symbolizer on PATH: without it sanitizer stacks have no function names
# and the name-based suppressions in tools/sanitizers/lsan.supp match nothing.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg git openssh-client sudo \
      jq zstd xz-utils unzip zip file rsync procps psmisc lsof \
      build-essential clang libclang-rt-dev llvm lld cmake ninja-build pkg-config nasm ccache gdb \
      python3 python3-venv python3-pip pipx \
 && rm -rf /var/lib/apt/lists/*

# Native timeline: FFmpeg (the command line tool for test media, and the codec
# libraries the LGPL build links), Vulkan on Mesa lavapipe, audio, text (a
# color emoji font for tst_render2d's fallback test), and the X11/xcb
# libraries Qt's xcb platform loads under Xvfb.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ffmpeg libmp3lame-dev libopenh264-dev libopus-dev libvpx-dev libva-dev \
      libvulkan-dev mesa-vulkan-drivers vulkan-tools libgl1-mesa-dev libegl1 libopengl0 \
      libxkbcommon-dev libfontconfig1-dev fontconfig fonts-dejavu-core fonts-noto-color-emoji \
      libasound2-dev libpulse-dev libharfbuzz-dev libfreetype-dev \
      libglib2.0-0t64 libdbus-1-3 \
      xvfb xauth libx11-xcb1 libxkbcommon-x11-0 libxcb-cursor0 libxcb-icccm4 libxcb-image0 \
      libxcb-keysyms1 libxcb-randr0 libxcb-render-util0 libxcb-shape0 libxcb-xfixes0 \
      libxcb-xinerama0 libxcb-xkb1 libfuse2t64 \
 && rm -rf /var/lib/apt/lists/*

# VST host: JUCE's build libraries, and a window manager for its editor test.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libx11-dev libxext-dev libxinerama-dev libxrandr-dev libxcursor-dev libfreetype6-dev \
      xfwm4 dbus-x11 x11-utils \
 && rm -rf /var/lib/apt/lists/*

# Graph runner: Meson and the libraries the pinned libvips, libwebp and
# Tesseract builds link (FFmpeg, Cairo, Pango, image codecs, Leptonica), the
# English Tesseract data its OCR tests read, and libsecret for the keychain
# the backend packages load.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      meson libsecret-1-0 libicu-dev libcurl4-openssl-dev \
      libavformat-dev libavcodec-dev libavutil-dev libavfilter-dev libswscale-dev libswresample-dev \
      libcairo2-dev libpango1.0-dev libglib2.0-dev libexpat1-dev libjpeg-turbo8-dev libpng-dev \
      libtiff-dev librsvg2-dev libgif-dev liblcms2-dev libexif-dev libarchive-dev \
      libleptonica-dev tesseract-ocr-eng \
 && rm -rf /var/lib/apt/lists/*

# GPU preview: libclang for bindgen in the wgpu-native build, the Vulkan
# validation layer, and the xcb libraries Qt's xcb platform loads.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libclang-dev vulkan-validationlayers libxcb-sync1 libxcb-shm0 libxcb-glx0 \
 && rm -rf /var/lib/apt/lists/*

# Jobs run as the hosted runner's user (uid 1001), which owns the mounted
# workspace, tool cache and home, as in the Node CI image.
RUN groupadd --gid 1001 runner \
 && useradd --uid 1001 --gid 1001 --create-home --shell /bin/bash runner \
 && echo "runner ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/runner \
 && chmod 0440 /etc/sudoers.d/runner

# Steps can tell they run in a CI image. A container has no FUSE device, so
# AppImages (linuxdeploy in package-linux.sh) extract themselves and run.
ENV NODETOOL_CI_IMAGE=1 \
    APPIMAGE_EXTRACT_AND_RUN=1

LABEL org.opencontainers.image.source="https://github.com/nodetool-ai/nodetool" \
      org.opencontainers.image.description="NodeTool native CI image: system packages for the Linux native jobs"
