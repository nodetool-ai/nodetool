#include "assets/AssetWav.h"
#include <QDataStream>
#include <QSaveFile>
#include <algorithm>
#include <cmath>
#include <limits>
#include <vector>

namespace nt::assets {
bool writeStereoWav(const QString& path, std::span<const float> samples) {
    if (samples.size() % 2 != 0 || samples.size() > (std::numeric_limits<quint32>::max() - 36) / 2) { return false; }
    QSaveFile file(path);
    if (!file.open(QIODevice::WriteOnly)) { return false; }
    QDataStream out(&file);
    out.setByteOrder(QDataStream::LittleEndian);
    const auto size = static_cast<quint32>(samples.size() * 2);
    out.writeRawData("RIFF", 4);
    out << quint32(36 + size);
    out.writeRawData("WAVEfmt ", 8);
    out << quint32(16) << quint16(1) << quint16(2) << quint32(48000) << quint32(192000) << quint16(4) << quint16(16);
    out.writeRawData("data", 4);
    out << size;
    for (const float sample : samples) {
        const float value = std::isfinite(sample) ? std::clamp(sample, -1.0f, 1.0f) : 0.0f;
        out << static_cast<qint16>(std::lround(value * (value < 0 ? 32768 : 32767)));
    }
    return out.status() == QDataStream::Ok && file.commit();
}

std::optional<quint64> writeStereoWavStream(const QString& path, const StereoWavReader& read,
                                          const std::function<bool()>& interrupted,
                                          quint32 maxDataBytes) {
    QSaveFile file(path);
    if (interrupted() || !file.open(QIODevice::WriteOnly)) { return std::nullopt; }
    QDataStream out(&file);
    out.setByteOrder(QDataStream::LittleEndian);
    out.writeRawData("RIFF", 4);
    out << quint32(0);
    out.writeRawData("WAVEfmt ", 8);
    out << quint32(16) << quint16(1) << quint16(2) << quint32(48000) << quint32(192000) << quint16(4) << quint16(16);
    out.writeRawData("data", 4);
    out << quint32(0);
    std::vector<float> buffer(stereoWavChunkFrames * 2);
    quint32 dataBytes = 0;
    const auto limit = std::min(maxDataBytes, std::numeric_limits<quint32>::max() - 36);
    for (;;) {
        if (interrupted() || out.status() != QDataStream::Ok) { return std::nullopt; }
        const auto frames = read(buffer);
        if (interrupted() || frames < 0 || frames > static_cast<qint64>(stereoWavChunkFrames)) { return std::nullopt; }
        if (frames == 0) { break; }
        const auto bytes = static_cast<quint32>(frames) * 4;
        if (bytes > limit - dataBytes) { return std::nullopt; }
        for (const float sample : std::span(buffer).first(static_cast<std::size_t>(frames) * 2)) {
            const float value = std::isfinite(sample) ? std::clamp(sample, -1.0f, 1.0f) : 0.0f;
            out << static_cast<qint16>(std::lround(value * (value < 0 ? 32768 : 32767)));
        }
        dataBytes += bytes;
    }
    if (dataBytes == 0 || !file.seek(4)) { return std::nullopt; }
    out << quint32(36 + dataBytes);
    if (!file.seek(40)) { return std::nullopt; }
    out << dataBytes;
    if (out.status() != QDataStream::Ok || interrupted() || !file.commit()) { return std::nullopt; }
    return dataBytes / 4;
}
}
