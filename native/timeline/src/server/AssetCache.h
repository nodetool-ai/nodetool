#pragma once

// The disk cache for asset bytes (DESIGN.md D33). FFmpeg decodes from a local
// file, because a seek over HTTP costs a round trip.
//
//   <root>/<serverKey>/<userKey>/<assetId>/<variant>/<version>.<ext>
//
// `variant` is `original`, `proxy` or `package`; variants never share a
// file. `version` comes only from API fields (see AssetResolver), so a
// changed version is a new file, and the older versions of that asset and
// variant are removed once the new one is in place.
//
// A download writes `<final>.part` and renames it into place only when it
// has the expected size. `/api/storage` serves `Range` but not `If-Range`,
// so a resume first asks `recheck` for the current version, then sends
// `Range`, and checks that `Content-Range` starts at the partial size and
// names the expected total. Any mismatch deletes the partial and starts
// again from 0. A server that answers 200 to a `Range` request also restarts
// from 0.
//
// Concurrent fetches of one asset and variant, from threads or processes,
// serialize on a lock file, and the later ones find the finished file.
//
// Size budget (D33): after a download, the least recently used files under
// the cache root go until the total fits the budget. A cache hit counts as a
// use. A file the current open uses (`protect`) and the file just fetched are
// never evicted, nor a file whose folder another fetch holds locked.

#include <QString>
#include <QUrl>

#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <set>

class QNetworkRequest;

namespace nt::server {

struct RemoteFile {
    QUrl url;
    QString version;          // a file name part, from API fields only
    qint64 expectedSize = -1; // -1: unknown (take the total from the first response)
    QString ext;              // without the dot
};

struct FetchResult {
    QString path;           // the finished file; empty on error
    QString error;
    bool hit = false;       // the file was already in the cache
    bool resumed = false;   // a Range request continued a partial file
    int restarts = 0;       // times a partial was dropped and the download restarted from 0
    qint64 bytesDownloaded = 0;
    QString version;        // the version that landed (recheck can change it)
    bool ok() const { return !path.isEmpty(); }
};

class AssetCache {
public:
    using Decorate = std::function<void(QNetworkRequest&)>;
    using Recheck = std::function<std::optional<RemoteFile>()>;

    AssetCache(QString root, QString serverKey, QString userKey, Decorate decorate = {});

    // <= 0: no limit. Default: NODETOOL_TIMELINE_CACHE_BUDGET_MB, else 20 GiB.
    void setBudgetBytes(qint64 bytes) { m_budgetBytes = bytes; }
    qint64 budgetBytes() const { return m_budgetBytes; }
    // Marks a file the current open uses; eviction keeps it.
    void protect(const QString& path);

    QString variantDir(const QString& assetId, const QString& variant) const;
    QString pathFor(const QString& assetId, const QString& variant, const RemoteFile& file) const;

    // Blocks until the file is in the cache or the fetch failed. `recheck`
    // runs only when a partial file is about to be resumed.
    FetchResult fetch(const QString& assetId, const QString& variant, const RemoteFile& file,
                      const Recheck& recheck = {}) const;

private:
    void evict(const QString& justFetched) const;

    QString m_root;
    QString m_serverKey;
    QString m_userKey;
    Decorate m_decorate;
    qint64 m_budgetBytes = 0;
    struct Protected {
        std::mutex mutex;
        std::set<QString> paths;
    };
    std::shared_ptr<Protected> m_protected = std::make_shared<Protected>();
};

// `bytes a-b/total` -> {a, total}; nullopt when malformed.
struct ContentRange {
    qint64 start = 0;
    qint64 end = 0;
    qint64 total = -1;
};
std::optional<ContentRange> parseContentRange(const QByteArray& value);

// A path-safe form of an id: [A-Za-z0-9._-], at most 64 chars, never "." or "..".
QString safePathPart(const QString& s);

}  // namespace nt::server
