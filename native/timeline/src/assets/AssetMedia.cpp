#include "assets/AssetMedia.h"
#include "server/AssetCache.h"
#include "server/ServerTimeline.h"
#include <QDir>
#include <QDateTime>
#include <QDirIterator>
#include <QFile>
#include <QFileInfo>
#include <QLockFile>
#include <algorithm>
#include <vector>

namespace nt::assets {
namespace {
std::mutex& protectionMutex() { static std::mutex mutex; return mutex; }
QSet<MediaProtection*>& protections() { static QSet<MediaProtection*> instances; return instances; }
}
MediaProtection::MediaProtection() {
    const std::lock_guard lock(protectionMutex());
    protections().insert(this);
}
MediaProtection::~MediaProtection() {
    const std::lock_guard lock(protectionMutex());
    protections().remove(this);
}
void MediaProtection::reset(QSet<QString> paths) {
    QSet<QString> absolutePaths;
    for (const auto& path : paths) {
        if (!path.isEmpty()) { absolutePaths.insert(QFileInfo(path).absoluteFilePath()); }
    }
    const std::lock_guard lock(protectionMutex());
    ++m_generation;
    m_paths = std::move(absolutePaths);
}

quint64 MediaProtection::generation() const {
    const std::lock_guard lock(protectionMutex());
    return m_generation;
}

void MediaProtection::protect(const QString& path, std::optional<quint64> generation) {
    if (path.isEmpty()) { return; }
    const std::lock_guard lock(protectionMutex());
    if (generation && *generation != m_generation) { return; }
    m_paths.insert(QFileInfo(path).absoluteFilePath());
}

void MediaProtection::evict(const QString& root, qint64 budget, const QString& justFetched,
                           const std::function<void()>& afterScan) {
    if (budget <= 0) { return; }
    struct Entry {
        QString path;
        QDateTime used;
        qint64 size;
    };
    std::vector<Entry> files;
    qint64 total = 0;
    QDirIterator it(root, QDir::Files, QDirIterator::Subdirectories);
    while (it.hasNext()) {
        const QFileInfo info(it.next());
        const auto name = info.fileName();
        if (name.startsWith(u'.') || name.endsWith(u".part") || name.endsWith(u".total") || name.endsWith(u".json")) {
            continue;
        }
        files.push_back({info.absoluteFilePath(), info.lastModified(), info.size()});
        total += info.size();
    }
    if (total <= budget) { return; }
    std::sort(files.begin(), files.end(), [](const Entry& a, const Entry& b) { return a.used < b.used; });
    const auto fetchedPath = QFileInfo(justFetched).absoluteFilePath();
    if (afterScan) { afterScan(); }
    // A completed reset/protect must cover every subsequent deletion decision.
    const std::lock_guard lock(protectionMutex());
    QSet<QString> protectedPaths;
    for (const auto* protection : protections()) protectedPaths.unite(protection->m_paths);
    for (const auto& file : files) {
        if (total <= budget) { break; }
        if (file.path == fetchedPath || protectedPaths.contains(file.path)) { continue; }
        QLockFile folderLock(QFileInfo(file.path).absolutePath() + QStringLiteral("/.lock"));
        folderLock.setStaleLockTime(0);
        if (!folderLock.tryLock(0)) { continue; }
        if (QFile::remove(file.path)) { total -= file.size; }
    }
}

nt::Clip resolveDroppedMedia(nt::server::ServerClient& client, const QString& cacheRoot,
                             const QJsonObject& asset, const QJsonObject& raw, MediaProtection& protection,
                             quint64 generation) {
    nt::Clip media;
    media.raw = raw;
    const auto type = raw.value("mediaType").toString();
    media.mediaType = type == "image" ? nt::MediaType::Image
        : type == "audio" ? nt::MediaType::Audio : nt::MediaType::Video;
    const bool picture = media.mediaType == nt::MediaType::Video || media.mediaType == nt::MediaType::Image;
    const bool audio = media.mediaType == nt::MediaType::Video || media.mediaType == nt::MediaType::Audio;
    const auto id = asset.value("id").toString();
    nt::server::AssetCache cache(cacheRoot, client.serverKey(), client.userKey(),
        [&client](QNetworkRequest& request) { client.decorate(request); });
    const auto budget = cache.budgetBytes();
    cache.setBudgetBytes(0);
    const auto fetch = [&](const QString& variant, const nt::server::RemoteFile& file) {
        const auto result = cache.fetch(id, variant, file, [&]() -> std::optional<nt::server::RemoteFile> {
            const auto fresh = client.getAsset(id);
            if (!fresh.ok()) { return std::nullopt; }
            QString why;
            return variant == "proxy" ? nt::server::proxyFile(client, fresh.data.toObject(), &why)
                                      : nt::server::originalFile(client, fresh.data.toObject(), &why);
        });
        if (result.ok()) { protection.protect(result.path, generation); }
        if (result.ok() && !result.hit) { protection.evict(cacheRoot, budget, result.path); }
        return result;
    };
    QString why;
    const auto original = nt::server::originalFile(client, asset, &why);
    bool failed = !original;
    if (original && picture) {
        const auto proxy = nt::server::proxyFile(client, asset, &why);
        auto fetched = proxy ? fetch("proxy", *proxy) : fetch("original", *original);
        if (!fetched.ok() && proxy) { fetched = fetch("original", *original); }
        failed = !fetched.ok();
        media.mediaPath = fetched.path.toStdString();
    }
    if (!failed && audio) {
        const auto fetched = fetch("original", *original);
        failed = !fetched.ok();
        media.audioPath = fetched.path.toStdString();
    }
    if (failed) {
        if (picture) {
            media.mediaPath = QDir(cacheRoot).filePath("missing/" + nt::server::safePathPart(id)).toStdString();
        }
        media.audioPath.clear();
    }
    return media;
}
}
