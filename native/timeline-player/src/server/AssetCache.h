#pragma once

// The disk cache for asset bytes (DESIGN.md D33). FFmpeg decodes from a local
// file, because a seek over HTTP costs a round trip.
//
//   <root>/<serverKey>/<userKey>/<assetId>/<variant>/<version>.<ext>
//
// `variant` is `original`, `proxy` or `package`; variants never share a
// file. `version` comes only from API fields (see AssetResolver), so a
// changed version is a new file, and unprotected older versions of that asset
// and variant are removed once the new one is in place.
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
// use, recorded in access time so the media's modification time stays stable.
// A file the current open uses (`protect`) and the file just fetched are
// never evicted, nor a file whose folder another fetch holds locked.

#include <QString>
#include <QUrl>

#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <optional>

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

// Cache handles and leases share a root's state. The registry mutex guards
// its lease counts. The owner may go away while a worker still holds a lease.
class AssetCacheRoot {
public:
    using Lease = std::shared_ptr<const QString>;

    explicit AssetCacheRoot(QString path = {});
    const QString& path() const { return m_path; }
    [[nodiscard]] Lease lease(const QString& path) const;
    void evict(qint64 budget, const QString& justFetched,
               const std::function<void()>& afterScan = {}) const;

private:
    friend class AssetCache;
    struct Registry;
    struct LeaseHolder;
    void evict(qint64 budget, const QString& justFetched,
               const std::function<void()>& afterScan, bool fetchedFolderLocked) const;
    QString leaseKey(const QString& path) const;
    bool removeIfUnprotected(const QString& path) const;
    std::shared_ptr<std::mutex> folderMutex(const QString& dir) const;

    QString m_path;
    QString m_canonicalPath;
    // A cache and the decoders that use its files can finish independently.
    std::shared_ptr<Registry> m_registry;
};

// Thread-safe after configuration. The folder mutex and QLockFile serialize
// variant writes and eviction. The root registry mutex guards the leases,
// and Protected::mutex guards the paths protected by this cache. Each fetch
// owns its network objects. Callbacks must support concurrent fetches.
class AssetCache {
public:
    using Decorate = std::function<void(QNetworkRequest&)>;
    using Recheck = std::function<std::optional<RemoteFile>()>;
    using OnReady = std::function<void(const QString&)>;
    // True when the fetch must stop, such as after the account signed out.
    // Called on the fetching thread, so it must be thread-safe.
    using Cancelled = std::function<bool()>;
    // Readers of the same cached file can finish independently. The file
    // stays pinned until the last lease is released.
    using Lease = AssetCacheRoot::Lease;

    // `cancelled` is asked before each request, redirect and retry, and
    // while a response arrives; a true answer aborts the reply and the
    // fetch fails, keeping a partial file to resume.
    AssetCache(AssetCacheRoot root, QString serverKey, QString userKey, Decorate decorate = {}, Cancelled cancelled = {});

    // <= 0: no limit. Default: NODETOOL_TIMELINE_CACHE_BUDGET_MB, else 20 GiB.
    void setBudgetBytes(qint64 bytes) { m_budgetBytes = bytes; }
    qint64 budgetBytes() const { return m_budgetBytes; }
    // Marks a file the current open uses; eviction keeps it.
    void protect(const QString& path);
    QString variantDir(const QString& assetId, const QString& variant) const;
    QString pathFor(const QString& assetId, const QString& variant, const RemoteFile& file) const;

    // Blocks until the file is in the cache or the fetch failed. `recheck`
    // runs only when a partial file is about to be resumed. `onReady` runs
    // while the variant folder remains locked, before budget eviction.
    FetchResult fetch(const QString& assetId, const QString& variant, const RemoteFile& file,
                      const Recheck& recheck = {}, const OnReady& onReady = {}) const;

private:
    void evict(const QString& justFetched) const;
    // The thread is interrupted, or `m_cancelled` answers true.
    bool stopRequested() const;
    AssetCacheRoot m_root;
    QString m_serverKey;
    QString m_userKey;
    Decorate m_decorate;
    Cancelled m_cancelled;
    qint64 m_budgetBytes = 0;
    struct Protected {
        // Guards paths.
        std::mutex mutex;
        std::map<QString, Lease> paths;
    };
    // Copies of the cache share the protection scope configured by their caller.
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
