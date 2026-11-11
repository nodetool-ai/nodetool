#pragma once

// Shared by the audio role tests: deterministic signals, a float WAV writer and a small timeline document.
// Test code only.

#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QString>

#include <cmath>
#include <cstdint>
#include <functional>
#include <vector>

namespace audioroles_test {

constexpr int kRate = 48000;

// A voiced source (gliding f0, harmonics falling 6 dB per octave) under a 4.5 Hz syllable envelope, where
// `active(t)` holds. Ported from `speech` in FilmCraft's essential_sound_tests.rs (MIT, see licenses/FilmCraft-MIT.txt).
inline std::vector<float> speech(double secs, float amp, const std::function<bool(double)>& active) {
    const auto n = static_cast<std::size_t>(secs * kRate);
    std::vector<float> out(n, 0.0f);
    double phase = 0;
    for (std::size_t i = 0; i < n; ++i) {
        const double t = static_cast<double>(i) / kRate;
        if (!active(t)) continue;
        const double f0 = 135.0 + 25.0 * std::sin(2.0 * M_PI * 0.7 * t);
        phase += f0 / kRate;
        double v = 0;
        for (int k = 1; k * f0 < 4000.0; ++k) v += std::sin(2.0 * M_PI * phase * k) / k;
        const double syllable = 0.6 - 0.4 * std::cos(2.0 * M_PI * 4.5 * t);
        out[i] = static_cast<float>(v * syllable * 0.5) * amp;
    }
    return out;
}

inline std::vector<float> tone(double secs, double hz, float amp) {
    std::vector<float> out(static_cast<std::size_t>(secs * kRate));
    for (std::size_t i = 0; i < out.size(); ++i) {
        out[i] = static_cast<float>(amp * std::sin(2.0 * M_PI * hz * static_cast<double>(i) / kRate));
    }
    return out;
}

// 32-bit float WAV at 48 kHz. `channels` is 1 (samples as given) or 2 (the mono signal on both sides).
inline void writeWav(const QString& path, const std::vector<float>& mono, int channels) {
    QFile file(path);
    if (!file.open(QIODevice::WriteOnly)) return;
    const auto put32 = [&](std::uint32_t v) { file.write(reinterpret_cast<const char*>(&v), 4); };
    const auto put16 = [&](std::uint16_t v) { file.write(reinterpret_cast<const char*>(&v), 2); };
    const std::uint32_t bytes = static_cast<std::uint32_t>(mono.size() * static_cast<std::size_t>(channels) * 4);
    file.write("RIFF");
    put32(36 + bytes);
    file.write("WAVEfmt ");
    put32(16);
    put16(3);
    put16(static_cast<std::uint16_t>(channels));
    put32(kRate);
    put32(static_cast<std::uint32_t>(kRate * channels * 4));
    put16(static_cast<std::uint16_t>(channels * 4));
    put16(32);
    file.write("data");
    put32(bytes);
    for (float s : mono) {
        for (int c = 0; c < channels; ++c) file.write(reinterpret_cast<const char*>(&s), 4);
    }
}

inline QJsonObject audioClip(const QString& id, const QString& track, const QString& wav, double startMs, double durationMs,
                             const QString& role = {}) {
    QJsonObject clip{{"id", id}, {"trackId", track}, {"name", id}, {"startMs", startMs}, {"durationMs", durationMs},
                     {"inPointMs", 0}, {"mediaType", "audio"}, {"sourceType", "imported"}, {"status", "generated"},
                     {"locked", false}, {"versions", QJsonArray{}}, {"mediaPath", wav}};
    if (!role.isEmpty()) clip.insert("audioRole", role);
    return clip;
}

inline QJsonObject audioTrack(const QString& id, int index, double volumeDb = 0) {
    QJsonObject track{{"id", id}, {"name", id}, {"type", "audio"}, {"index", index}, {"visible", true},
                      {"locked", false}, {"muted", false}};
    if (volumeDb != 0) track.insert("volumeDb", volumeDb);
    return track;
}

inline QByteArray document(const QJsonArray& tracks, const QJsonArray& clips, double durationMs) {
    return QJsonDocument(QJsonObject{{"id", "roles"}, {"projectId", "test"}, {"name", "Roles"}, {"fps", 30}, {"width", 640},
                                     {"height", 360}, {"durationMs", durationMs}, {"master", QJsonObject{{"volumeDb", 0}}},
                                     {"tracks", tracks}, {"clips", clips}, {"markers", QJsonArray{}}})
        .toJson(QJsonDocument::Compact);
}

}  // namespace audioroles_test
