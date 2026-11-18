#include "server/AssetCache.h"

#include <QCryptographicHash>
#include <QDateTime>
#include <QDir>
#include <QDirIterator>
#include <QEventLoop>
#include <QFile>
#include <QFileInfo>
#include <QLockFile>
#include <QNetworkAccessManager>
#include <QNetworkProxy>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QRegularExpression>
#include <QThread>
#include <QTimer>
#include <QUuid>

#include <algorithm>
#include <map>
#include <memory>
#include <mutex>

namespace nt::server {
namespace {

constexpr int kMaxAttempts = 4;

QString pathKey(const QString& path) {
    const QFileInfo info(path);
    const QString canonical = info.canonicalFilePath();
    if (!canonical.isEmpty()) return canonical;
    const QString parent = QFileInfo(info.absolutePath()).canonicalFilePath();
    return QDir(parent.isEmpty() ? info.absolutePath() : parent).filePath(info.fileName());
}

// Hidden lock files let independently opened roots and path-only consumers
// cooperate without a process singleton. The directory guard serializes pin
// creation with removal of a payload. QLockFile clears pins of dead processes.
QString pinPrefix(const QString& path) {
    const auto name = QFileInfo(path).fileName();
    const auto hash = QCryptographicHash::hash(name.toUtf8(), QCryptographicHash::Sha256).toHex();
    return QStringLiteral(".lease-") + QString::fromLatin1(hash) + u'-';
}

struct Attempt {
    enum Kind { Complete, Restart, Fail, Redirect };
    Attempt(Kind k = Fail, QString why = {}) : kind(k), reason(std::move(why)) {}
    Kind kind;
    QString reason;
    bool resumed = false;
    bool keepPartial = false;  // a transport failure mid-body leaves a valid prefix
    qint64 bytes = 0;
    qint64 total = -1;
    QUrl next;  // Redirect: the Location, resolved
};

qint64 readTotal(const QString& path) {
    QFile f(path);
    if (!f.open(QIODevice::ReadOnly)) return -1;
    bool ok = false;
    const qint64 v = f.readAll().trimmed().toLongLong(&ok);
    return ok ? v : -1;
}

void writeTotal(const QString& path, qint64 total) {
    QFile f(path);
    if (f.open(QIODevice::WriteOnly | QIODevice::Truncate)) f.write(QByteArray::number(total));
}

// Recency must not change the modification time used by decoded-media caches.
void touch(const QString& path) {
    QFile file(path);
    if (file.open(QIODevice::ReadWrite | QIODevice::ExistingOnly)) {
        file.setFileTime(QDateTime::currentDateTimeUtc(), QFileDevice::FileAccessTime);
    }
}

void removePartial(const QString& part) {
    QFile::remove(part);
    QFile::remove(part + QStringLiteral(".total"));
}

using Stop = std::function<bool()>;

Attempt cancelledAttempt() {
    Attempt a{Attempt::Fail, QStringLiteral("asset download cancelled")};
    a.keepPartial = true;  // the received prefix stays valid for a later resume
    return a;
}

// One GET. `offset` > 0 sends `Range: bytes=<offset>-` and appends. `stop`
// is polled while the response arrives and aborts it.
Attempt downloadOnce(QNetworkAccessManager& nam, const AssetCache::Decorate& decorate, const Stop& stop,
                     const QUrl& url, const QString& part, qint64 offset, qint64 expectedTotal) {
    if (stop()) return cancelledAttempt();
    QNetworkRequest req(url);
    // Redirects are followed by hand (downloadFollowing), so each hop is
    // decorated for its own origin: credentials never follow a redirect off
    // the server.
    req.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    if (decorate) decorate(req);
    // Byte counts must be file bytes, so no transfer compression.
    req.setRawHeader("Accept-Encoding", "identity");
    if (offset > 0) req.setRawHeader("Range", "bytes=" + QByteArray::number(offset) + "-");

    Attempt a;
    QFile file(part);
    bool checked = false;
    bool writing = false;
    QNetworkReply* reply = nam.get(req);
    QEventLoop loop;
    QTimer cancellation;
    bool stopped = false;
    // Runs inside loop.exec() below, while `reply`, `stop` and `stopped` live.
    QObject::connect(&cancellation, &QTimer::timeout, &loop, [reply, &stop, &stopped] {
        if (!stopped && stop()) {
            stopped = true;
            reply->abort();
        }
    });
    cancellation.start(25);

    auto checkHeaders = [&]() {
        checked = true;
        const int status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
        if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
            const QByteArray location = reply->rawHeader("Location");
            a = {Attempt::Redirect, QStringLiteral("HTTP %1 without a Location").arg(status)};
            if (!location.isEmpty()) a.next = url.resolved(QUrl::fromEncoded(location));
            return false;
        }
        if (status == 206) {
            const auto cr = parseContentRange(reply->rawHeader("Content-Range"));
            if (!cr) {
                a = {Attempt::Restart, QStringLiteral("206 without a valid Content-Range")};
                return false;
            }
            if (cr->start != offset) {
                a = {Attempt::Restart, QStringLiteral("Content-Range starts at %1, the partial file has %2 bytes")
                                           .arg(cr->start)
                                           .arg(offset)};
                return false;
            }
            if (expectedTotal >= 0 && cr->total != expectedTotal) {
                a = {Attempt::Restart, QStringLiteral("Content-Range total %1, expected %2")
                                           .arg(cr->total)
                                           .arg(expectedTotal)};
                return false;
            }
            a.total = cr->total;
            a.resumed = offset > 0;
            writing = file.open(offset > 0 ? QIODevice::Append : (QIODevice::WriteOnly | QIODevice::Truncate));
        } else if (status == 200) {
            // A full answer to a Range request: the partial is dropped and the
            // body replaces it from byte 0.
            const QByteArray len = reply->rawHeader("Content-Length");
            bool ok = false;
            const qint64 length = len.toLongLong(&ok);
            if (ok && expectedTotal >= 0 && length != expectedTotal && offset == 0) {
                a = {Attempt::Fail, QStringLiteral("the server sends %1 bytes, the asset says %2")
                                        .arg(length)
                                        .arg(expectedTotal)};
                return false;
            }
            if (offset > 0 && ok && expectedTotal >= 0 && length != expectedTotal) {
                a = {Attempt::Restart, QStringLiteral("the server ignored Range and sends %1 bytes, expected %2")
                                           .arg(length)
                                           .arg(expectedTotal)};
                return false;
            }
            a.total = ok ? length : expectedTotal;
            writing = file.open(QIODevice::WriteOnly | QIODevice::Truncate);
        } else if (status == 416) {
            a = {Attempt::Restart, QStringLiteral("416: the partial file is longer than the asset")};
            return false;
        } else {
            a = {Attempt::Fail, QStringLiteral("HTTP %1 for %2").arg(status).arg(url.path())};
            return false;
        }
        if (!writing) {
            a = {Attempt::Fail, QStringLiteral("cannot write %1: %2").arg(part, file.errorString())};
            return false;
        }
        if (a.total >= 0) writeTotal(part + QStringLiteral(".total"), a.total);
        return true;
    };

    QObject::connect(reply, &QNetworkReply::readyRead, &loop, [&]() {
        if (!checked && !checkHeaders()) {
            reply->abort();
            return;
        }
        if (!writing) return;
        const QByteArray chunk = reply->readAll();
        if (file.write(chunk) != chunk.size()) {
            a = {Attempt::Fail, QStringLiteral("cannot write %1: %2").arg(part, file.errorString())};
            writing = false;
            reply->abort();
            return;
        }
        a.bytes += chunk.size();
    });
    QObject::connect(reply, &QNetworkReply::finished, &loop, &QEventLoop::quit);
    loop.exec();

    // A body-less answer (an error status) never emits readyRead.
    if (!checked && reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).isValid()) {
        checkHeaders();
    }
    if (writing) {
        const QByteArray rest = reply->isOpen() ? reply->readAll() : QByteArray{};
        if (!rest.isEmpty()) {
            file.write(rest);
            a.bytes += rest.size();
        }
        file.close();
        if (reply->error() != QNetworkReply::NoError) {
            a.kind = Attempt::Fail;
            a.reason = QStringLiteral("download interrupted: %1").arg(reply->errorString());
            a.keepPartial = true;
        } else if (a.total >= 0 && QFileInfo(part).size() < a.total) {
            // A clean HTTP EOF can still end before the asset's expected size.
            // Keep the received prefix so the next fetch can resume it.
            a.kind = Attempt::Fail;
            a.reason = QStringLiteral("download interrupted: received %1 bytes, expected %2")
                .arg(QFileInfo(part).size()).arg(a.total);
            a.keepPartial = true;
        } else {
            a.kind = Attempt::Complete;
        }
    } else if (a.reason.isEmpty() && a.kind != Attempt::Redirect) {
        a = {Attempt::Fail, QStringLiteral("no response: %1").arg(reply->errorString())};
    }
    reply->deleteLater();
    if (stopped) return cancelledAttempt();
    return a;
}

constexpr int kMaxRedirects = 5;

// downloadOnce, following up to kMaxRedirects redirects to http(s) URLs.
Attempt downloadFollowing(QNetworkAccessManager& nam, const AssetCache::Decorate& decorate, const Stop& stop,
                          const QUrl& url, const QString& part, qint64 offset, qint64 expectedTotal) {
    QUrl at = url;
    for (int hop = 0; hop <= kMaxRedirects; ++hop) {
        Attempt a = downloadOnce(nam, decorate, stop, at, part, offset, expectedTotal);
        if (a.kind != Attempt::Redirect) return a;
        if (!a.next.isValid() || (a.next.scheme() != u"http" && a.next.scheme() != u"https")) {
            return {Attempt::Fail, QStringLiteral("redirect to an unusable URL: %1").arg(a.reason)};
        }
        at = a.next;
    }
    return {Attempt::Fail, QStringLiteral("more than %1 redirects for %2").arg(kMaxRedirects).arg(url.path())};
}

}  // namespace

std::optional<ContentRange> parseContentRange(const QByteArray& value) {
    static const QRegularExpression re(QStringLiteral(R"(^\s*bytes\s+(\d+)-(\d+)/(\d+|\*)\s*$)"));
    const auto m = re.match(QString::fromLatin1(value));
    if (!m.hasMatch()) return std::nullopt;
    ContentRange cr;
    cr.start = m.captured(1).toLongLong();
    cr.end = m.captured(2).toLongLong();
    cr.total = m.captured(3) == u"*" ? -1 : m.captured(3).toLongLong();
    if (cr.end < cr.start || (cr.total >= 0 && cr.end >= cr.total)) return std::nullopt;
    return cr;
}

QString safePathPart(const QString& s) {
    QString out;
    out.reserve(s.size());
    for (const QChar c : s) {
        out += (c.isLetterOrNumber() && c.unicode() < 128) || c == u'.' || c == u'_' || c == u'-' ? c : u'_';
    }
    if (out.isEmpty() || out == u"." || out == u"..") out = QStringLiteral("_");
    return out.left(64);
}

// Thread-safe. The mutex guards pin counts, pin files and folder mutex lookup.
struct AssetCacheRoot::Registry {
    struct Pin {
        size_t count = 0;
        std::unique_ptr<QLockFile> file;
    };
    std::mutex mutex;
    std::map<QString, Pin> pins;
    std::map<QString, std::weak_ptr<std::mutex>> folders;
};

// The path is immutable. Creating or releasing a lease mutates the registry
// under its mutex, including when the last reader finishes on a worker.
struct AssetCacheRoot::LeaseHolder {
    LeaseHolder(std::shared_ptr<Registry> owner, QString value)
        : registry(std::move(owner)), path(std::move(value)) {
        const std::lock_guard lock(registry->mutex);
        auto& pin = registry->pins[path];
        if (++pin.count != 1) {
            return;
        }

        const QDir folder(QFileInfo(path).absolutePath());
        QLockFile guard(folder.filePath(QStringLiteral(".lease-guard")));
        guard.setStaleLockTime(0);
        if (guard.lock()) {
            auto file = std::make_unique<QLockFile>(
                folder.filePath(pinPrefix(path) + QUuid::createUuid().toString(QUuid::Id128)));
            file->setStaleLockTime(0);
            if (file->tryLock(0)) {
                pin.file = std::move(file);
            }
        }
    }

    ~LeaseHolder() {
        const std::lock_guard lock(registry->mutex);
        auto it = registry->pins.find(path);
        if (--it->second.count == 0) {
            registry->pins.erase(it);
        }
    }

    // The last decoder may finish after its cache root handle is gone.
    const std::shared_ptr<Registry> registry;
    const QString path;
};

AssetCacheRoot::AssetCacheRoot(QString path)
    : m_path(std::move(path)), m_registry(std::make_shared<Registry>()) {}

std::shared_ptr<std::mutex> AssetCacheRoot::folderMutex(const QString& dir) const {
    const auto key = pathKey(dir);
    const std::lock_guard lock(m_registry->mutex);
    auto& weak = m_registry->folders[key];
    if (auto mutex = weak.lock()) {
        return mutex;
    }
    // A fetch and an eviction can hold this lock independently of the
    // registry lookup. The last one releases the mutex.
    auto mutex = std::make_shared<std::mutex>();
    weak = mutex;
    return mutex;
}

AssetCache::AssetCache(AssetCacheRoot root, QString serverKey, QString userKey, Decorate decorate, Cancelled cancelled)
    : m_root(std::move(root)), m_serverKey(std::move(serverKey)), m_userKey(std::move(userKey)),
      m_decorate(std::move(decorate)), m_cancelled(std::move(cancelled)) {
    bool ok = false;
    const qint64 mb = qEnvironmentVariable("NODETOOL_TIMELINE_CACHE_BUDGET_MB").toLongLong(&ok);
    m_budgetBytes = ok ? mb * 1024 * 1024 : qint64(20) * 1024 * 1024 * 1024;
}

bool AssetCache::stopRequested() const {
    return QThread::currentThread()->isInterruptionRequested() || (m_cancelled && m_cancelled());
}

void AssetCache::protect(const QString& path) {
    if (path.isEmpty()) return;
    std::lock_guard lock(m_protected->mutex);
    auto held = m_root.lease(path);
    const QString key = *held;
    m_protected->paths.try_emplace(key, std::move(held));
}

AssetCache::Lease AssetCache::lease(const QString& path) {
    return AssetCacheRoot(QFileInfo(path).absolutePath()).lease(path);
}

AssetCacheRoot::Lease AssetCacheRoot::lease(const QString& path) const {
    if (path.isEmpty()) return {};
    auto holder = std::make_shared<LeaseHolder>(m_registry, pathKey(path));
    return Lease(holder, &holder->path);
}

bool AssetCacheRoot::removeIfUnprotected(const QString& path) const {
    const std::lock_guard lock(m_registry->mutex);
    const auto key = pathKey(path);
    if (m_registry->pins.contains(key)) {
        return false;
    }

    const QDir folder(QFileInfo(key).absolutePath());
    QLockFile guard(folder.filePath(QStringLiteral(".lease-guard")));
    guard.setStaleLockTime(0);
    if (!guard.tryLock(0)) {
        return false;
    }
    const auto pins = folder.entryList({pinPrefix(key) + u'*'}, QDir::Files | QDir::Hidden);
    for (const auto& name : pins) {
        QLockFile pin(folder.filePath(name));
        pin.setStaleLockTime(0);
        if (!pin.tryLock(0)) {
            return false;
        }
    }
    return QFile::remove(path);
}

void AssetCache::evict(const QString& justFetched) const {
    m_root.evict(m_budgetBytes, justFetched, {}, true);
}

void AssetCache::evictRoot(const QString& root, qint64 budget, const QString& justFetched,
                           const std::function<void()>& afterScan) {
    AssetCacheRoot(root).evict(budget, justFetched, afterScan);
}

void AssetCacheRoot::evict(qint64 budget, const QString& justFetched, const std::function<void()>& afterScan) const {
    evict(budget, justFetched, afterScan, false);
}

void AssetCacheRoot::evict(qint64 budget, const QString& justFetched,
                          const std::function<void()>& afterScan, bool fetchedFolderLocked) const {
    if (budget <= 0) return;
    struct Entry {
        QString path;
        QDateTime used;
        qint64 size;
    };
    std::vector<Entry> files;
    qint64 total = 0;
    QDirIterator it(m_path, QDir::Files, QDirIterator::Subdirectories);
    while (it.hasNext()) {
        const QFileInfo info(it.next());
        const QString name = info.fileName();
        // Payload files only: not locks, partials, raw documents or reports.
        if (name.startsWith(u'.') || name.endsWith(u".part") || name.endsWith(u".total") || name.endsWith(u".json")) continue;
        files.push_back({info.absoluteFilePath(), std::max(info.lastRead(), info.lastModified()), info.size()});
        total += info.size();
    }
    if (total <= budget) return;
    std::sort(files.begin(), files.end(), [](const Entry& a, const Entry& b) { return a.used < b.used; });
    if (afterScan) afterScan();
    const QString fetchedPath = pathKey(justFetched);
    const QString fetchedFolder = pathKey(QFileInfo(justFetched).absolutePath());
    for (const Entry& e : files) {
        if (total <= budget) break;
        if (pathKey(e.path) == fetchedPath) continue;
        // A folder another fetch holds is in use; leave it.
        const QString folder = QFileInfo(e.path).absolutePath();
        const bool ownFolder = fetchedFolderLocked && pathKey(folder) == fetchedFolder;
        const auto threadMutex = folderMutex(folder);
        std::unique_lock<std::mutex> threadLock(*threadMutex, std::defer_lock);
        if (!ownFolder && !threadLock.try_lock()) continue;
        QLockFile folderLock(folder + QStringLiteral("/.lock"));
        folderLock.setStaleLockTime(0);
        if (!ownFolder && !folderLock.tryLock(0)) continue;
        if (removeIfUnprotected(e.path)) total -= e.size;
    }
}

QString AssetCache::variantDir(const QString& assetId, const QString& variant) const {
    return QDir(m_root.path()).filePath(QStringLiteral("%1/%2/%3/%4")
                                     .arg(safePathPart(m_serverKey), safePathPart(m_userKey), safePathPart(assetId),
                                          safePathPart(variant)));
}

QString AssetCache::pathFor(const QString& assetId, const QString& variant, const RemoteFile& file) const {
    const QString ext = file.ext.isEmpty() ? QStringLiteral("bin") : safePathPart(file.ext);
    return QDir(variantDir(assetId, variant)).filePath(safePathPart(file.version) + u'.' + ext);
}

FetchResult AssetCache::fetch(const QString& assetId, const QString& variant, const RemoteFile& file,
                              const Recheck& recheck, const OnReady& onReady) const {
    FetchResult result;
    if (stopRequested()) {
        result.error = QStringLiteral("asset download cancelled");
        return result;
    }
    const QString dir = variantDir(assetId, variant);
    const auto threadLock = m_root.folderMutex(dir);
    // An interrupted loader must exit even when another fetch holds the variant.
    std::unique_lock inProcess(*threadLock, std::defer_lock);
    while (!inProcess.try_lock()) {
        if (stopRequested()) {
            result.error = QStringLiteral("asset download cancelled");
            return result;
        }
        QThread::msleep(25);
    }
    // Serialize creation as well as downloads. Another process can still
    // create the directory, so check the postcondition after mkpath fails.
    if (!QDir().mkpath(dir) && !QFileInfo(dir).isDir()) {
        result.error = QStringLiteral("cannot create %1").arg(dir);
        return result;
    }
    QLockFile processLock(QDir(dir).filePath(QStringLiteral(".lock")));
    processLock.setStaleLockTime(0);  // stale only when the holder process is gone
    while (!processLock.tryLock(25)) {
        if (stopRequested()) {
            result.error = QStringLiteral("asset download cancelled");
            return result;
        }
        if (processLock.error() != QLockFile::LockFailedError) {
            result.error = QStringLiteral("cannot lock %1").arg(dir);
            return result;
        }
    }

    RemoteFile cur = file;
    auto finishedFile = [&](const RemoteFile& f) -> bool {
        const QFileInfo info(pathFor(assetId, variant, f));
        return info.isFile() && (f.expectedSize < 0 || info.size() == f.expectedSize);
    };
    if (finishedFile(cur)) {
        result.path = pathFor(assetId, variant, cur);
        result.hit = true;
        result.version = cur.version;
        touch(result.path);
        if (onReady) onReady(result.path);
        return result;
    }

    const QStringList partials = QDir(dir).entryList({QStringLiteral("*.part")}, QDir::Files);
    if (!partials.isEmpty() && recheck) {
        // Resume only bytes of the version the server has now (no If-Range).
        const auto now = recheck();
        if (!now) {
            result.error = QStringLiteral("cannot re-check the asset version before a resume");
            return result;
        }
        cur = *now;
        if (finishedFile(cur)) {
            result.path = pathFor(assetId, variant, cur);
            result.hit = true;
            result.version = cur.version;
            if (onReady) onReady(result.path);
            return result;
        }
    }
    const QString finalPath = pathFor(assetId, variant, cur);
    const QString part = finalPath + QStringLiteral(".part");
    for (const QString& name : partials) {
        const QString path = QDir(dir).filePath(name);
        if (path != part) {
            removePartial(path);  // another version's bytes: never resumed
            ++result.restarts;
        }
    }

    QNetworkAccessManager nam;
    nam.setProxy(QNetworkProxy::NoProxy);
    const Stop stop = [this] { return stopRequested(); };
    for (int attempt = 0; attempt < kMaxAttempts; ++attempt) {
        if (stopRequested()) {
            result.error = QStringLiteral("asset download cancelled");
            return result;
        }
        qint64 offset = QFileInfo(part).isFile() ? QFileInfo(part).size() : 0;
        const qint64 savedTotal = readTotal(part + QStringLiteral(".total"));
        if (offset > 0 && cur.expectedSize >= 0 && savedTotal >= 0 && savedTotal != cur.expectedSize) {
            removePartial(part);
            offset = 0;
            ++result.restarts;
        }
        if (offset > 0 && savedTotal < 0 && cur.expectedSize < 0) {
            removePartial(part);  // a partial with no known total cannot be checked
            offset = 0;
            ++result.restarts;
        }
        const qint64 expected = cur.expectedSize >= 0 ? cur.expectedSize : (offset > 0 ? savedTotal : -1);
        if (offset > 0 && expected >= 0 && offset >= expected) {
            if (offset > expected) {
                removePartial(part);
                ++result.restarts;
                continue;
            }
        } else {
            const Attempt a = downloadFollowing(nam, m_decorate, stop, cur.url, part, offset, expected);
            result.bytesDownloaded += a.bytes;
            result.resumed = result.resumed || a.resumed;
            if (a.kind == Attempt::Restart) {
                removePartial(part);
                ++result.restarts;
                continue;
            }
            if (a.kind == Attempt::Fail) {
                if (!a.keepPartial) removePartial(part);
                result.error = a.reason;
                return result;
            }
        }
        const qint64 size = QFileInfo(part).size();
        const qint64 want = expected >= 0 ? expected : readTotal(part + QStringLiteral(".total"));
        if (want >= 0 && size != want) {
            removePartial(part);
            result.error = QStringLiteral("downloaded %1 bytes, expected %2").arg(size).arg(want);
            return result;
        }
        if (QFileInfo::exists(finalPath) && !m_root.removeIfUnprotected(finalPath)) {
            result.error = QStringLiteral("cannot replace protected cache file %1").arg(finalPath);
            return result;
        }
        if (!QFile::rename(part, finalPath)) {
            result.error = QStringLiteral("cannot move %1 into place").arg(part);
            return result;
        }
        QFile::remove(part + QStringLiteral(".total"));
        // The older versions of this asset and variant are stale now.
        for (const QString& name : QDir(dir).entryList(QDir::Files | QDir::Hidden)) {
            const QString path = QDir(dir).filePath(name);
            if (path != finalPath && name != u".lock" && !name.startsWith(u".lease-")) {
                m_root.removeIfUnprotected(path);
            }
        }
        result.path = finalPath;
        result.version = cur.version;
        if (onReady) onReady(result.path);
        evict(finalPath);
        return result;
    }
    result.error = QStringLiteral("gave up after %1 restarts").arg(result.restarts);
    return result;
}

}  // namespace nt::server
