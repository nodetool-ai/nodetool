#pragma once
#include <QString>
#include <cstddef>
#include <functional>
#include <limits>
#include <optional>
#include <span>

namespace nt::assets {
// Interleaved stereo float samples to 16-bit PCM, 48000 Hz, RIFF/WAVE.
bool writeStereoWav(const QString& path, std::span<const float> samples);

inline constexpr std::size_t stereoWavChunkFrames = 48000;
// Reader returns stereo frames, 0 at EOF, or a negative count on decode failure.
using StereoWavReader = std::function<qint64(std::span<float>)>;
// Returns the committed frame count. Empty, interrupted, invalid or failed reads
// leave the destination unchanged. A lower data limit permits small limit tests.
std::optional<quint64> writeStereoWavStream(const QString& path, const StereoWavReader& read,
    const std::function<bool()>& interrupted,
    quint32 maxDataBytes = std::numeric_limits<quint32>::max() - 36);
}
