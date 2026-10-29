#include "ui/ThumbnailDiskCache.h"
#include "ui/MediaPreviews.h"
#include "ui/MediaVersion.h"

#include <QBuffer>
#include <QCryptographicHash>
#include <QDataStream>
#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QImageReader>
#include <QLockFile>
#include <QSaveFile>
#include <QStandardPaths>

#include <cmath>

namespace nt::ui {
namespace {
constexpr quint32 MAGIC = 0x4e545431;  // NTT1
constexpr qint64 MAX_ENTRY_BYTES = 64 * 1024 * 1024;
}

ThumbnailDiskCache::ThumbnailDiskCache(QString directory, qint64 maxBytes)
    : m_directory(directory.isEmpty() ? QString() : QDir(directory).absolutePath()), m_maxBytes(maxBytes) {}

QString ThumbnailDiskCache::defaultDirectory() {
    const QString directory = QStandardPaths::writableLocation(QStandardPaths::CacheLocation);
    return directory.isEmpty() ? QString() : QDir(directory).filePath("thumbnails-v1");
}

QString ThumbnailDiskCache::keyForMedia(const QString& path, const QString& kind) {
    const QFileInfo file(path);
    if (!file.isFile() || (kind != u"video" && kind != u"image")) return {};
    const int count = kind == u"image" ? 1 : THUMBNAIL_COUNT;
    const int width = kind == u"image" ? 2 * THUMBNAIL_WIDTH_PX : THUMBNAIL_WIDTH_PX;
    return QStringLiteral("v1|%1|%2|%3|%4").arg(kind).arg(count).arg(width)
        .arg(mediaVersionKey(file.absoluteFilePath()));
}

QString ThumbnailDiskCache::entryPath(const QString& key) const {
    const auto digest = QCryptographicHash::hash(key.toUtf8(), QCryptographicHash::Sha256).toHex();
    return QDir(m_directory).filePath(QString::fromLatin1(digest) + ".ntthumb");
}

std::shared_ptr<const ThumbnailSet> ThumbnailDiskCache::load(const QString& key) const {
    if (key.isEmpty() || m_directory.isEmpty() || m_maxBytes <= 0) return nullptr;
    QFile file(entryPath(key));
    if (!file.open(QIODevice::ReadOnly) || file.size() > MAX_ENTRY_BYTES || file.size() > m_maxBytes) return nullptr;
    QDataStream stream(&file);
    stream.setVersion(QDataStream::Qt_6_0);
    quint32 magic = 0, count = 0, width = 0, height = 0;
    stream >> magic >> count >> width >> height;
    if (magic != MAGIC || count == 0 || count > THUMBNAIL_COUNT || width == 0 ||
        width > 2 * THUMBNAIL_WIDTH_PX || height == 0 || height > 16384 ||
        qint64(width) * count * height * 4 > MAX_ENTRY_BYTES) return nullptr;
    auto result = std::make_shared<ThumbnailSet>();
    result->thumbSize = QSize(static_cast<int>(width), static_cast<int>(height));
    for (quint32 i = 0; i < count; ++i) {
        double time = 0;
        stream >> time;
        if (!std::isfinite(time) || time < 0 || (!result->thumbs.empty() && time < result->thumbs.back().timeSec)) {
            return nullptr;
        }
        result->thumbs.push_back({time, {}});
    }
    if (stream.status() != QDataStream::Ok) return nullptr;
    QByteArray png = file.readAll();
    QBuffer buffer(&png);
    if (!buffer.open(QIODevice::ReadOnly)) return nullptr;
    QImageReader reader(&buffer, "png");
    const QSize atlasSize(static_cast<int>(width * count), static_cast<int>(height));
    if (reader.size() != atlasSize) return nullptr;
    result->atlas = reader.read();
    if (result->atlas.isNull()) return nullptr;
    for (quint32 i = 0; i < count; ++i) {
        result->thumbs[i].image = result->atlas.copy(static_cast<int>(i * width), 0,
                                                  static_cast<int>(width), static_cast<int>(height));
    }
    // Modification time records the last successful use for eviction.
    file.close();
    if (file.open(QIODevice::ReadWrite | QIODevice::ExistingOnly)) {
        file.setFileTime(QDateTime::currentDateTimeUtc(), QFileDevice::FileModificationTime);
    }
    return result;
}

void ThumbnailDiskCache::store(const QString& key, const ThumbnailSet& thumbnails) const {
    if (key.isEmpty() || m_directory.isEmpty() || m_maxBytes <= 0 || thumbnails.atlas.isNull() ||
        thumbnails.thumbs.empty() || thumbnails.thumbs.size() > THUMBNAIL_COUNT ||
        thumbnails.atlas.sizeInBytes() > MAX_ENTRY_BYTES) return;
    QByteArray data;
    QBuffer buffer(&data);
    if (!buffer.open(QIODevice::WriteOnly)) return;
    QDataStream stream(&buffer);
    stream.setVersion(QDataStream::Qt_6_0);
    stream << MAGIC << static_cast<quint32>(thumbnails.thumbs.size())
           << static_cast<quint32>(thumbnails.thumbSize.width()) << static_cast<quint32>(thumbnails.thumbSize.height());
    for (const auto& thumbnail : thumbnails.thumbs) stream << thumbnail.timeSec;
    if (stream.status() != QDataStream::Ok || !thumbnails.atlas.save(&buffer, "PNG") ||
        data.size() > m_maxBytes || data.size() > MAX_ENTRY_BYTES) return;
    QDir directory(m_directory);
    if (!directory.mkpath(".")) return;
    // Serialize writers across workers and app instances. Readers see atomic replacements.
    QLockFile lock(directory.filePath(".writer.lock"));
    if (!lock.tryLock(1000)) return;
    const QString destination = entryPath(key);
    const auto entries = directory.entryInfoList({"*.ntthumb"}, QDir::Files, QDir::Time | QDir::Reversed);
    qint64 bytes = data.size();
    for (const auto& entry : entries) {
        if (entry.absoluteFilePath() != destination) bytes += entry.size();
    }
    for (const auto& entry : entries) {
        if (bytes <= m_maxBytes) break;
        if (entry.absoluteFilePath() != destination && QFile::remove(entry.absoluteFilePath())) bytes -= entry.size();
    }
    if (bytes > m_maxBytes) return;
    QSaveFile output(destination);
    if (!output.open(QIODevice::WriteOnly) || output.write(data) != data.size()) return;
    output.commit();
}

}  // namespace nt::ui
