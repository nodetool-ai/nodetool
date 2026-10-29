// The D33 disk cache against an in-process HTTP server: versions, Range
// resume, the restart rules, and concurrent fetches of one asset.

#include "server/AssetCache.h"
#include "TestHttpServer.h"

#include <QCoreApplication>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QTemporaryDir>
#include <QThread>
#include <QNetworkRequest>
#include <QtTest>

#include <atomic>

using nt::server::AssetCache;
using nt::server::FetchResult;
using nt::server::RemoteFile;

namespace {

QByteArray pattern(int size, char seed) {
    QByteArray b(size, Qt::Uninitialized);
    for (int i = 0; i < size; ++i) b[i] = static_cast<char>((i * 31 + seed) & 0xff);
    return b;
}

QByteArray readAll(const QString& path) {
    QFile f(path);
    return f.open(QIODevice::ReadOnly) ? f.readAll() : QByteArray();
}

}  // namespace

class TestAssetCache : public QObject {
    Q_OBJECT

private:
    // Under the build folder, never the user's cache or home folders.
    QTemporaryDir m_dir{QCoreApplication::applicationDirPath() + QStringLiteral("/test-cache-XXXXXX")};
    std::unique_ptr<TestHttpServer> m_http;

    AssetCache cache() const { return AssetCache(m_dir.path(), QStringLiteral("http_127.0.0.1_1"), QStringLiteral("1")); }
    RemoteFile remote(const QByteArray& path, const QString& version, qint64 size) const {
        return RemoteFile{m_http->base().resolved(QUrl(QString::fromLatin1(path))), version, size, QStringLiteral("mp4")};
    }
    // A partial file of `bytes` bytes from a dropped first download.
    void makePartial(const QByteArray& path, const QString& version, qint64 size, int bytes) {
        m_http->file(path).dropAfterBytes = bytes;
        m_http->file(path).dropCount = 1;
        const FetchResult r = cache().fetch(QStringLiteral("a1"), QStringLiteral("original"), remote(path, version, size));
        QVERIFY2(!r.ok(), "the first download must fail");
        const QString part = cache().pathFor(QStringLiteral("a1"), QStringLiteral("original"), remote(path, version, size)) +
                             QStringLiteral(".part");
        QCOMPARE(QFileInfo(part).size(), static_cast<qint64>(bytes));
    }

private slots:
    void init() {
        QVERIFY(m_dir.isValid());
        QDir(m_dir.path()).removeRecursively();
        QDir().mkpath(m_dir.path());
        m_http = std::make_unique<TestHttpServer>();
    }

    void interruptionCancelsTricklingDownload() {
        auto slow = ServedFile{pattern(5 * 1024 * 1024, 1)};
        slow.chunkDelayMs = 10;
        m_http->setFile("/slow.mp4", slow);
        FetchResult result;
        const auto root = m_dir.path();
        const auto file = remote("/slow.mp4", "v1", 5 * 1024 * 1024);
        auto worker = std::unique_ptr<QThread>(QThread::create([&result, root, file] {
            AssetCache cache(root, "server", "user", [](QNetworkRequest& request) {
                request.setTransferTimeout(500);
            });
            result = cache.fetch("asset", "original", file);
        }));
        worker->start();
        QVERIFY(QTest::qWaitFor([&] { return m_http->countRequests("GET", "/slow.mp4") > 0; }, 2000));
        worker->requestInterruption();
        const bool cancelled = QTest::qWaitFor([&] { return worker->isFinished(); }, 500);
        QVERIFY(QTest::qWaitFor([&] { return worker->isFinished(); }, 10000));
        worker->wait();
        QVERIFY2(cancelled, "interruption must cancel an active trickling download");
        QVERIFY(!result.ok());
        QVERIFY(!result.error.isEmpty());
    }

    void downloadsOnceThenHits() {
        const QByteArray data = pattern(200000, 1);
        m_http->setFile("/api/storage/1/a1.mp4", ServedFile{data});
        const FetchResult first = cache().fetch(QStringLiteral("a1"), QStringLiteral("original"),
                                                remote("/api/storage/1/a1.mp4", QStringLiteral("v1"), data.size()));
        QVERIFY2(first.ok(), qPrintable(first.error));
        QVERIFY(!first.hit);
        QCOMPARE(readAll(first.path), data);
        QVERIFY(first.path.endsWith(QStringLiteral("/http_127.0.0.1_1/1/a1/original/v1.mp4")));
        const FetchResult second = cache().fetch(QStringLiteral("a1"), QStringLiteral("original"),
                                                 remote("/api/storage/1/a1.mp4", QStringLiteral("v1"), data.size()));
        QVERIFY(second.hit);
        QCOMPARE(m_http->countRequests("GET", "/api/storage/1/a1.mp4"), 1);
    }

    void variantsNeverShareAFile() {
        const QByteArray data = pattern(1000, 2);
        m_http->setFile("/x.mp4", ServedFile{data});
        const auto f = remote("/x.mp4", QStringLiteral("v1"), data.size());
        QVERIFY(cache().pathFor(QStringLiteral("a1"), QStringLiteral("original"), f) !=
                cache().pathFor(QStringLiteral("a1"), QStringLiteral("proxy"), f));
    }

    void changedVersionIsANewFile() {
        m_http->setFile("/a.mp4", ServedFile{pattern(5000, 3)});
        const FetchResult v1 = cache().fetch(QStringLiteral("a1"), QStringLiteral("original"), remote("/a.mp4", QStringLiteral("v1"), 5000));
        QVERIFY2(v1.ok(), qPrintable(v1.error));
        const QByteArray changed = pattern(7000, 4);
        m_http->setFile("/a.mp4", ServedFile{changed});
        const FetchResult v2 = cache().fetch(QStringLiteral("a1"), QStringLiteral("original"), remote("/a.mp4", QStringLiteral("v2"), 7000));
        QVERIFY2(v2.ok(), qPrintable(v2.error));
        QVERIFY(!v2.hit);
        QVERIFY(v2.path != v1.path);
        QCOMPARE(readAll(v2.path), changed);
        QVERIFY2(!QFileInfo::exists(v1.path), "the stale version is removed");
    }

    void resumesSameVersionWithRange() {
        const QByteArray data = pattern(300000, 5);
        m_http->setFile("/r.mp4", ServedFile{data});
        makePartial("/r.mp4", QStringLiteral("v1"), data.size(), 100000);
        if (QTest::currentTestFailed()) return;
        m_http->clearRequests();
        int rechecks = 0;
        const FetchResult r = cache().fetch(QStringLiteral("a1"), QStringLiteral("original"),
                                            remote("/r.mp4", QStringLiteral("v1"), data.size()), [&]() {
                                                ++rechecks;
                                                // The re-check runs before the Range request.
                                                if (m_http->countRequests("GET", "/r.mp4") != 0) return std::optional<RemoteFile>{};
                                                return std::optional<RemoteFile>(remote("/r.mp4", QStringLiteral("v1"), data.size()));
                                            });
        QVERIFY2(r.ok(), qPrintable(r.error));
        QCOMPARE(rechecks, 1);
        QVERIFY(r.resumed);
        QCOMPARE(r.restarts, 0);
        QCOMPARE(r.bytesDownloaded, static_cast<qint64>(data.size() - 100000));
        QCOMPARE(m_http->requests().back().headers.value("range"), QByteArray("bytes=100000-"));
        QCOMPARE(readAll(r.path), data);
    }

    void resumeWithChangedSizeRestartsFromZero() {
        const QByteArray v1 = pattern(300000, 6);
        m_http->setFile("/s.mp4", ServedFile{v1});
        makePartial("/s.mp4", QStringLiteral("v1"), v1.size(), 120000);
        if (QTest::currentTestFailed()) return;
        // The asset changed on the server: a new size, so a new version.
        const QByteArray v2 = pattern(250000, 7);
        m_http->setFile("/s.mp4", ServedFile{v2});
        m_http->clearRequests();
        const FetchResult r = cache().fetch(QStringLiteral("a1"), QStringLiteral("original"),
                                            remote("/s.mp4", QStringLiteral("v1"), v1.size()), [&]() {
                                                return std::optional<RemoteFile>(remote("/s.mp4", QStringLiteral("v2"), v2.size()));
                                            });
        QVERIFY2(r.ok(), qPrintable(r.error));
        QVERIFY(!r.resumed);
        QCOMPARE(r.restarts, 1);
        QCOMPARE(r.version, QStringLiteral("v2"));
        QCOMPARE(m_http->requests().size(), size_t(1));
        QVERIFY2(m_http->requests().front().headers.value("range").isEmpty(), "the restart sends no Range");
        QCOMPARE(readAll(r.path), v2);
        QVERIFY(QDir(QFileInfo(r.path).absolutePath()).entryList({QStringLiteral("*.part")}, QDir::Files).isEmpty());
    }

    void wrongContentRangeTotalRestartsFromZero() {
        const QByteArray data = pattern(200000, 8);
        m_http->setFile("/w.mp4", ServedFile{data});
        makePartial("/w.mp4", QStringLiteral("v1"), data.size(), 50000);
        if (QTest::currentTestFailed()) return;
        m_http->file("/w.mp4").wrongTotal = true;
        m_http->clearRequests();
        const FetchResult r = cache().fetch(QStringLiteral("a1"), QStringLiteral("original"),
                                            remote("/w.mp4", QStringLiteral("v1"), data.size()), [&]() {
                                                return std::optional<RemoteFile>(remote("/w.mp4", QStringLiteral("v1"), data.size()));
                                            });
        QVERIFY2(r.ok(), qPrintable(r.error));
        QCOMPARE(r.restarts, 1);
        QVERIFY(!r.resumed);
        const auto reqs = m_http->requests();
        QCOMPARE(reqs.size(), size_t(2));
        QCOMPARE(reqs[0].headers.value("range"), QByteArray("bytes=50000-"));
        QVERIFY(reqs[1].headers.value("range").isEmpty());
        QCOMPARE(readAll(r.path), data);
    }

    void serverIgnoringRangeReplacesThePartial() {
        const QByteArray data = pattern(150000, 9);
        m_http->setFile("/i.mp4", ServedFile{data});
        makePartial("/i.mp4", QStringLiteral("v1"), data.size(), 40000);
        if (QTest::currentTestFailed()) return;
        m_http->file("/i.mp4").ignoreRange = true;
        const FetchResult r = cache().fetch(QStringLiteral("a1"), QStringLiteral("original"),
                                            remote("/i.mp4", QStringLiteral("v1"), data.size()), [&]() {
                                                return std::optional<RemoteFile>(remote("/i.mp4", QStringLiteral("v1"), data.size()));
                                            });
        QVERIFY2(r.ok(), qPrintable(r.error));
        QVERIFY(!r.resumed);
        QCOMPARE(readAll(r.path), data);
    }

    void unknownSizeResumeChecksTheFirstTotal() {
        // A proxy has no size in the API: the total of the first answer is
        // kept, and a resume must match it.
        const QByteArray data = pattern(180000, 10);
        m_http->setFile("/p.mp4", ServedFile{data});
        makePartial("/p.mp4", QStringLiteral("pv"), -1, 60000);
        if (QTest::currentTestFailed()) return;
        m_http->file("/p.mp4").wrongTotal = true;
        m_http->clearRequests();
        const FetchResult r = cache().fetch(QStringLiteral("a1"), QStringLiteral("original"), remote("/p.mp4", QStringLiteral("pv"), -1),
                                            [&]() { return std::optional<RemoteFile>(remote("/p.mp4", QStringLiteral("pv"), -1)); });
        QVERIFY2(r.ok(), qPrintable(r.error));
        QCOMPARE(r.restarts, 1);
        QCOMPARE(readAll(r.path), data);
    }

    void sizeMismatchIsAnError() {
        m_http->setFile("/m.mp4", ServedFile{pattern(4000, 11)});
        const FetchResult r = cache().fetch(QStringLiteral("a1"), QStringLiteral("original"), remote("/m.mp4", QStringLiteral("v1"), 3000));
        QVERIFY(!r.ok());
        QVERIFY2(r.error.contains(QStringLiteral("4000")), qPrintable(r.error));
        QVERIFY(!QFileInfo::exists(cache().pathFor(QStringLiteral("a1"), QStringLiteral("original"),
                                                   remote("/m.mp4", QStringLiteral("v1"), 3000))));
    }

    void httpErrorIsAnError() {
        const FetchResult r = cache().fetch(QStringLiteral("a1"), QStringLiteral("original"), remote("/nope.mp4", QStringLiteral("v1"), 10));
        QVERIFY(!r.ok());
        QVERIFY2(r.error.contains(QStringLiteral("404")), qPrintable(r.error));
    }

    void concurrentFetchesDownloadOnce() {
        const QByteArray data = pattern(400000, 12);
        ServedFile slow{data};
        slow.chunkDelayMs = 5;  // about 25 chunks: the fetches overlap
        m_http->setFile("/c.mp4", slow);
        const RemoteFile f = remote("/c.mp4", QStringLiteral("v1"), data.size());
        const QString root = m_dir.path();
        constexpr int kThreads = 4;
        std::vector<FetchResult> results(kThreads);
        std::vector<QThread*> threads;
        std::atomic<int> done{0};
        for (int i = 0; i < kThreads; ++i) {
            threads.push_back(QThread::create([&, i]() {
                // Each thread has its own cache object, as separate processes would.
                AssetCache c(root, QStringLiteral("http_127.0.0.1_1"), QStringLiteral("1"));
                results[i] = c.fetch(QStringLiteral("a1"), QStringLiteral("original"), f);
                ++done;
            }));
            threads.back()->start();
        }
        QTRY_COMPARE_WITH_TIMEOUT(done.load(), kThreads, 20000);
        for (QThread* t : threads) {
            t->wait();
            delete t;
        }
        int downloads = 0;
        for (const FetchResult& r : results) {
            QVERIFY2(r.ok(), qPrintable(r.error));
            QCOMPARE(r.path, results[0].path);
            if (!r.hit) ++downloads;
        }
        QCOMPARE(downloads, 1);
        QCOMPARE(m_http->countRequests("GET", "/c.mp4"), 1);
        QCOMPARE(readAll(results[0].path), data);
    }

    // Codex review F7 (D33): least recently used files go first under a size
    // budget, and files the current open uses are never evicted.
    void evictsLeastRecentlyUsedUnderBudget() {
        for (const char* name : {"/a.mp4", "/b.mp4", "/c.mp4", "/d.mp4"}) m_http->setFile(name, ServedFile{pattern(100000, 20)});
        AssetCache c = cache();
        c.setBudgetBytes(250000);
        auto get = [&](const char* id, const char* path) {
            return c.fetch(QLatin1String(id), QStringLiteral("original"), remote(path, QStringLiteral("v1"), 100000));
        };
        const FetchResult a = get("a", "/a.mp4");
        QVERIFY(a.ok());
        QTest::qWait(20);
        const FetchResult b = get("b", "/b.mp4");
        QTest::qWait(20);
        // A hit makes `a` the most recent, so `b` is now the oldest.
        QVERIFY(get("a", "/a.mp4").hit);
        QTest::qWait(20);
        const FetchResult cc = get("c", "/c.mp4");
        QVERIFY(cc.ok());
        QVERIFY2(!QFileInfo::exists(b.path), "the least recently used file goes first");
        QVERIFY(QFileInfo::exists(a.path));
        QVERIFY(QFileInfo::exists(cc.path));

        // A file in use is kept even when it is the oldest.
        c.protect(a.path);
        QTest::qWait(20);
        QVERIFY(get("c", "/c.mp4").hit);
        QTest::qWait(20);
        const FetchResult d = get("d", "/d.mp4");
        QVERIFY(d.ok());
        QVERIFY2(QFileInfo::exists(a.path), "a protected file is never evicted");
        QVERIFY(!QFileInfo::exists(cc.path));
        QVERIFY(QFileInfo::exists(d.path));
    }

    void contentRangeParse() {
        const auto cr = nt::server::parseContentRange("bytes 100-199/1000");
        QVERIFY(cr);
        QCOMPARE(cr->start, qint64(100));
        QCOMPARE(cr->total, qint64(1000));
        QVERIFY(!nt::server::parseContentRange("bytes 100-1000/1000"));
        QVERIFY(!nt::server::parseContentRange("bytes */1000"));
        QVERIFY(!nt::server::parseContentRange("items 1-2/3"));
    }

    void pathPartsAreSafe() {
        QCOMPARE(nt::server::safePathPart(QStringLiteral("../etc")), QStringLiteral(".._etc"));
        QCOMPARE(nt::server::safePathPart(QStringLiteral("..")), QStringLiteral("_"));
        QCOMPARE(nt::server::safePathPart(QStringLiteral("a/b")), QStringLiteral("a_b"));
    }
};

QTEST_GUILESS_MAIN(TestAssetCache)
#include "tst_assetcache.moc"
