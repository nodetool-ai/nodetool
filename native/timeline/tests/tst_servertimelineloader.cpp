#include "server/AssetCache.h"
#include "server/ServerTimelineLoader.h"
#include "TestHttpServer.h"

#include <QElapsedTimer>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QTemporaryDir>
#include <QtTest>

#include <memory>

namespace {

using nt::server::ServerTimelineLoader;
using Snapshot = std::shared_ptr<const nt::Timeline>;

QByteArray document(const QString& id, const QJsonArray& clips = {}) {
    return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", QJsonObject{
        {"id", id}, {"fps", 30}, {"width", 64}, {"height", 64}, {"durationMs", 1000},
        {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}}}}, {"clips", clips},
    }}}}}).toJson(QJsonDocument::Compact);
}

constexpr auto kTimelinePath = "/trpc/timeline.get";

void stallTimeline(TestHttpServer& server, const QString& id) {
    ServedFile stalled(document(id));
    stalled.chunkDelayMs = 10000;
    server.setFile(kTimelinePath, std::move(stalled));
}

}  // namespace

// UI thread only. Each test owns its local HTTP server and cache directory.
class TestServerTimelineLoader : public QObject {
    Q_OBJECT

private slots:
    void loadsSnapshotAndPinsMedia() {
        QTemporaryDir cache;
        QVERIFY(cache.isValid());
        TestHttpServer server;
        const QByteArray bytes("picture");
        const QString id = QStringLiteral("preview");
        server.setFile(kTimelinePath, ServedFile(document(id, QJsonArray{QJsonObject{
            {"id", "still"}, {"trackId", "v"}, {"mediaType", "image"}, {"status", "generated"},
            {"currentAssetId", "package://base/picture.png"}, {"startMs", 0}, {"durationMs", 1000},
        }})));
        server.setFile("/api/assets/packages/base/picture.png", ServedFile(bytes));
        std::shared_ptr<void> leases;
        QString path;
        {
            ServerTimelineLoader loader(server.base(), QStringLiteral("local-token"), cache.path());
            QSignalSpy loaded(&loader, &ServerTimelineLoader::loaded);
            QSignalSpy failed(&loader, &ServerTimelineLoader::failed);
            loader.load(id);
            QCOMPARE(loaded.count(), 0);
            QTRY_COMPARE(loaded.count() + failed.count(), 1);
            QCOMPARE(failed.count(), 0);
            const auto args = loaded.takeFirst();
            QCOMPARE(args.at(0).toString(), id);
            const auto snapshot = args.at(1).value<Snapshot>();
            QVERIFY(snapshot);
            QCOMPARE(snapshot->id, id.toStdString());
            QCOMPARE(snapshot->clips.size(), 1u);
            path = QString::fromStdString(snapshot->clips.front().mediaPath);
            leases = args.at(2).value<std::shared_ptr<void>>();
            QVERIFY(leases);
        }

        QFile file(path);
        QVERIFY(file.open(QIODevice::ReadOnly));
        QCOMPARE(file.readAll(), bytes);
        file.close();
        const auto requests = server.requests();
        QVERIFY(!requests.empty());
        QCOMPARE(requests.front().headers.value("authorization"), QByteArray("Bearer local-token"));

        nt::server::AssetCache::evictRoot(cache.path(), 1, {});
        QVERIFY(QFile::exists(path));
        leases.reset();
        nt::server::AssetCache::evictRoot(cache.path(), 1, {});
        QVERIFY(!QFile::exists(path));
    }

    void reportsFailure() {
        QTemporaryDir cache;
        QVERIFY(cache.isValid());
        TestHttpServer server;
        server.setFile(kTimelinePath, ServedFile(
            R"({"error":{"message":"Timeline missing","data":{"code":"NOT_FOUND"}}})"));
        const QString id = QStringLiteral("missing");
        ServerTimelineLoader loader(server.base(), {}, cache.path());
        QSignalSpy loaded(&loader, &ServerTimelineLoader::loaded);
        QSignalSpy failed(&loader, &ServerTimelineLoader::failed);
        loader.load(id);
        QTRY_COMPARE(failed.count(), 1);
        QCOMPARE(loaded.count(), 0);
        QCOMPARE(failed.first().at(0).toString(), id);
        QCOMPARE(failed.first().at(1).toString(), QStringLiteral("timeline.get: Timeline missing (NOT_FOUND)"));
    }

    void cancelsInFlightLoad() {
        QTemporaryDir cache;
        QVERIFY(cache.isValid());
        TestHttpServer server;
        const QString id = QStringLiteral("cancelled");
        stallTimeline(server, id);
        ServerTimelineLoader loader(server.base(), {}, cache.path());
        QSignalSpy loaded(&loader, &ServerTimelineLoader::loaded);
        QSignalSpy failed(&loader, &ServerTimelineLoader::failed);
        loader.load(id);
        QTRY_COMPARE(server.countRequests("GET", kTimelinePath), 1);
        QCOMPARE(server.activeConnectionCount(), 1);
        loader.cancel();
        QTRY_COMPARE(server.activeConnectionCount(), 0);
        // Allow the already-aborted worker's queued completion to reach the UI.
        QTest::qWait(100);
        QCOMPARE(loaded.count(), 0);
        QCOMPARE(failed.count(), 0);
    }

    void supersedesInFlightLoad() {
        QTemporaryDir cache;
        QVERIFY(cache.isValid());
        TestHttpServer server;
        stallTimeline(server, QStringLiteral("old"));
        const QString newest = QStringLiteral("new");
        ServerTimelineLoader loader(server.base(), {}, cache.path());
        QSignalSpy loaded(&loader, &ServerTimelineLoader::loaded);
        QSignalSpy failed(&loader, &ServerTimelineLoader::failed);
        loader.load(QStringLiteral("old"));
        QTRY_COMPARE(server.countRequests("GET", kTimelinePath), 1);
        server.setFile(kTimelinePath, ServedFile(document(newest)));
        loader.load(QStringLiteral("superseded pending"));
        loader.load(newest);
        QTRY_COMPARE(loaded.count(), 1);
        QCOMPARE(failed.count(), 0);
        QCOMPARE(loaded.first().at(0).toString(), newest);
        QCOMPARE(server.countRequests("GET", kTimelinePath), 2);
    }

    void destroysLoaderDuringLoad() {
        QTemporaryDir cache;
        QVERIFY(cache.isValid());
        TestHttpServer server;
        const QString id = QStringLiteral("closing");
        stallTimeline(server, id);
        auto loader = std::make_unique<ServerTimelineLoader>(server.base(), QString(), cache.path());
        QSignalSpy loaded(loader.get(), &ServerTimelineLoader::loaded);
        QSignalSpy failed(loader.get(), &ServerTimelineLoader::failed);
        loader->load(id);
        QTRY_COMPARE(server.countRequests("GET", kTimelinePath), 1);
        QCOMPARE(server.activeConnectionCount(), 1);
        QElapsedTimer elapsed;
        elapsed.start();
        loader.reset();
        QVERIFY2(elapsed.elapsed() < 1000, "Destructor waited on the worker");
        QTRY_COMPARE(server.activeConnectionCount(), 0);
        QTest::qWait(100);
        QCOMPARE(loaded.count(), 0);
        QCOMPARE(failed.count(), 0);
    }
};

QTEST_GUILESS_MAIN(TestServerTimelineLoader)
#include "tst_servertimelineloader.moc"
