#include "server/AssetCache.h"

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

#include <algorithm>
#include <filesystem>
#include <map>
#include <memory>
#include <mutex>

namespace nt::server {
namespace {

constexpr int kMaxAttempts = 4;

// One in-process mutex per variant folder. The lock file covers other
// processes; this covers threads of this one.
std::shared_ptr<std::mutex> folderMutex(const QString& dir) {
    static std::mutex guard;
    static std::map<QString, std::weak_ptr<std::mutex>> mutexes;
    std::lock_guard lock(guard);
    auto& weak = mutexes[dir];
    auto m = weak.lock();
    if (!m) {
        m = std::make_shared<std::mutex>();
        weak = m;
    }
    return m;
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

// A cache hit is a use: the file's time moves to now (LRU order).
void touch(const QString& path) {
    std::error_code ec;
    std::filesystem::last_write_time(std::filesystem::path(path.toStdString()),
                                     std::filesystem::file_time_type::clock::now(), ec);
}

void removePartial(const QString& part) {
    QFile::remove(part);
    QFile::remove(part + QStringLiteral(".total"));
}

// One GET. `offset` > 0 sends `Range: bytes=<offset>-` and appends.
Attempt downloadOnce(QNetworkAccessManager& nam, const AssetCache::Decorate& decorate, const QUrl& url,
                     const QString& part, qint64 offset, qint64 expectedTotal) {
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
        const QByteArray rest = reply->readAll();
        if (!rest.isEmpty()) {
            file.write(rest);
            a.bytes += rest.size();
        }
        file.close();
        if (reply->error() != QNetworkReply::NoError) {
            a.kind = Attempt::Fail;
            a.reason = QStringLiteral("download interrupted: %1").arg(reply->errorString());
            a.keepPartial = true;
        } else {
            a.kind = Attempt::Complete;
        }
    } else if (a.reason.isEmpty() && a.kind != Attempt::Redirect) {
        a = {Attempt::Fail, QStringLiteral("no response: %1").arg(reply->errorString())};
    }
    reply->deleteLater();
    return a;
}

constexpr int kMaxRedirects = 5;

// downloadOnce, following up to kMaxRedirects redirects to http(s) URLs.
Attempt downloadFollowing(QNetworkAccessManager& nam, const AssetCache::Decorate& decorate, const QUrl& url,
                          const QString& part, qint64 offset, qint64 expectedTotal) {
    QUrl at = url;
    for (int hop = 0; hop <= kMaxRedirects; ++hop) {
        Attempt a = downloadOnce(nam, decorate, at, part, offset, expectedTotal);
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

AssetCache::AssetCache(QString root, QString serverKey, QString userKey, Decorate decorate)
    : m_root(std::move(root)), m_serverKey(std::move(serverKey)), m_userKey(std::move(userKey)),
      m_decorate(std::move(decorate)) {
    bool ok = false;
    const qint64 mb = qEnvironmentVariable("NODETOOL_TIMELINE_CACHE_BUDGET_MB").toLongLong(&ok);
    m_budgetBytes = ok ? mb * 1024 * 1024 : qint64(20) * 1024 * 1024 * 1024;
}

void AssetCache::protect(const QString& path) {
    std::lock_guard lock(m_protected->mutex);
    m_protected->paths.insert(QFileInfo(path).absoluteFilePath());
}

void AssetCache::evict(const QString& justFetched) const {
    if (m_budgetBytes <= 0) return;
    struct Entry {
        QString path;
        QDateTime used;
        qint64 size;
    };
    std::vector<Entry> files;
    qint64 total = 0;
    QDirIterator it(m_root, QDir::Files, QDirIterator::Subdirectories);
    while (it.hasNext()) {
        const QFileInfo info(it.next());
        const QString name = info.fileName();
        // Payload files only: not locks, partials, raw documents or reports.
        if (name.startsWith(u'.') || name.endsWith(u".part") || name.endsWith(u".total") || name.endsWith(u".json")) continue;
        files.push_back({info.absoluteFilePath(), info.lastModified(), info.size()});
        total += info.size();
    }
    if (total <= m_budgetBytes) return;
    std::sort(files.begin(), files.end(), [](const Entry& a, const Entry& b) { return a.used < b.used; });
    std::set<QString> keep;
    {
        std::lock_guard lock(m_protected->mutex);
        keep = m_protected->paths;
    }
    keep.insert(QFileInfo(justFetched).absoluteFilePath());
    for (const Entry& e : files) {
        if (total <= m_budgetBytes) break;
        if (keep.count(e.path)) continue;
        // A folder another fetch holds is in use; leave it.
        QLockFile folderLock(QFileInfo(e.path).absolutePath() + QStringLiteral("/.lock"));
        folderLock.setStaleLockTime(0);
        const bool ownFolder = QFileInfo(e.path).absolutePath() == QFileInfo(justFetched).absolutePath();
        if (!ownFolder && !folderLock.tryLock(0)) continue;
        if (QFile::remove(e.path)) total -= e.size;
    }
}

QString AssetCache::variantDir(const QString& assetId, const QString& variant) const {
    return QDir(m_root).filePath(QStringLiteral("%1/%2/%3/%4")
                                     .arg(safePathPart(m_serverKey), safePathPart(m_userKey), safePathPart(assetId),
                                          safePathPart(variant)));
}

QString AssetCache::pathFor(const QString& assetId, const QString& variant, const RemoteFile& file) const {
    const QString ext = file.ext.isEmpty() ? QStringLiteral("bin") : safePathPart(file.ext);
    return QDir(variantDir(assetId, variant)).filePath(safePathPart(file.version) + u'.' + ext);
}

FetchResult AssetCache::fetch(const QString& assetId, const QString& variant, const RemoteFile& file,
                              const Recheck& recheck) const {
    FetchResult result;
    const QString dir = variantDir(assetId, variant);
    if (!QDir().mkpath(dir)) {
        result.error = QStringLiteral("cannot create %1").arg(dir);
        return result;
    }
    const auto threadLock = folderMutex(dir);
    std::lock_guard inProcess(*threadLock);
    QLockFile processLock(QDir(dir).filePath(QStringLiteral(".lock")));
    processLock.setStaleLockTime(0);  // stale only when the holder process is gone
    if (!processLock.lock()) {
        result.error = QStringLiteral("cannot lock %1").arg(dir);
        return result;
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
    for (int attempt = 0; attempt < kMaxAttempts; ++attempt) {
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
            const Attempt a = downloadFollowing(nam, m_decorate, cur.url, part, offset, expected);
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
        QFile::remove(finalPath);
        if (!QFile::rename(part, finalPath)) {
            result.error = QStringLiteral("cannot move %1 into place").arg(part);
            return result;
        }
        QFile::remove(part + QStringLiteral(".total"));
        // The older versions of this asset and variant are stale now.
        for (const QString& name : QDir(dir).entryList(QDir::Files | QDir::Hidden)) {
            const QString path = QDir(dir).filePath(name);
            if (path != finalPath && name != u".lock") QFile::remove(path);
        }
        result.path = finalPath;
        result.version = cur.version;
        evict(finalPath);
        return result;
    }
    result.error = QStringLiteral("gave up after %1 restarts").arg(result.restarts);
    return result;
}

}  // namespace nt::server
