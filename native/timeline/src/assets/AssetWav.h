#pragma once
#include <QString>
#include <span>

namespace nt::assets {
// Interleaved stereo float samples to 16-bit PCM, 48000 Hz, RIFF/WAVE.
bool writeStereoWav(const QString& path, std::span<const float> samples);
}
