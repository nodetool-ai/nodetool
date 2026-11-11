#pragma once

#include <QString>
#include <memory>

namespace nt::ui {

struct ThumbnailSet;

class ThumbnailDiskCache {
public:
    static constexpr qint64 DEFAULT_MAX_BYTES = 256 * 1024 * 1024;
    explicit ThumbnailDiskCache(QString directory, qint64 maxBytes = DEFAULT_MAX_BYTES);
    static QString defaultDirectory();
    static QString keyForMedia(const QString& path, const QString& kind);
    // native-rules #1: returns std::shared_ptr with no comment on why unique ownership is impossible
    std::shared_ptr<const ThumbnailSet> load(const QString& key) const;
    void store(const QString& key, const ThumbnailSet& thumbnails) const;

private:
    QString entryPath(const QString& key) const;
    QString m_directory;
    qint64 m_maxBytes;
};

}  // namespace nt::ui
