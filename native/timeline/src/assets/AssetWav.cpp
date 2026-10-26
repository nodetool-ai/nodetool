#include "assets/AssetWav.h"
#include <QDataStream>
#include <QSaveFile>
#include <algorithm>
#include <cmath>
#include <limits>

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
}
