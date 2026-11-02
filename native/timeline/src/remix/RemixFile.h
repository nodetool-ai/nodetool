// Ported from FilmCraft (https://github.com/storytold/filmcraft, crates/audio-dsp/src/remix.rs and fft.rs), MIT OR Apache-2.0, see native/timeline/licenses/FilmCraft-MIT.txt
#pragma once
#include "remix/RemixDsp.h"
#include <QString>
#include <string>

namespace nt::remix {
struct FileWindow {
    std::string path;
    double startMs = 0, durationMs = 0;
};
// Decode the window at 24 kHz and average stereo channels into mono.
AnalysisResult analyzeFile(const FileWindow&, const std::function<void(double)>& progress = {},
                           const std::function<bool()>& cancelled = {});
// Scale the 24 kHz plan by two and stream a 16-bit, 48 kHz stereo WAV.
// Source positions are relative to the window. Failure/cancellation preserves wavPath.
Error bakeWav(const FileWindow&, const Plan& plan24k, int64_t targetFrames, const QString& wavPath,
              const std::function<void(double)>& progress = {}, const std::function<bool()>& cancelled = {});
} // namespace nt::remix
