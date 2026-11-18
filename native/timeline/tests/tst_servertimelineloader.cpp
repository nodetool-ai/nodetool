#include "server/AssetCache.h"
#include "server/ServerTimelineLoader.h"
#include "TestHttpServer.h"

#include <QElapsedTimer>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QProcess>
#include <QTemporaryDir>
#include <QThread>
#include <QTimer>
#include <QtTest>

#include <memory>

namespace {

using nt::server::AssetCacheRoot;
using nt::server::ServerLoaderWorkers;
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

int exitWithStalledRequest(QCoreApplication& app, bool drainOnQuit) {
    QTemporaryDir cache;
    ServerLoaderWorkers workers;
    TestHttpServer server;
    const QString id = QStringLiteral("closing");
    stallTimeline(server, id);
    auto loader = std::make_unique<ServerTimelineLoader>(workers, server.base(), QString(), AssetCacheRoot(cache.path()));
    loader->load(id, QUuid::createUuid());
    if (!QTest::qWaitFor([&server] { return server.countRequests("GET", kTimelinePath) == 1; })) {
        qCritical("Fake server did not receive the request");
        return 1;
    }

    // The fake server still has its ten-second reply pending.
    const auto threads = workers.findChildren<QThread*>(Qt::FindDirectChildrenOnly);
    if (threads.size() != 1) {
        qCritical("Expected one outstanding worker");
        return 1;
    }
    if (drainOnQuit) {
        QTimer::singleShot(0, &app, &QCoreApplication::quit);
        app.exec();
    } else {
        loader.reset();
        workers.shutdown();
    }
    if (!threads.front()->isFinished() ||
        !app.findChildren<QThread*>(Qt::FindDirectChildrenOnly).isEmpty()) {
        qCritical("Application teardown still owns a network worker");
        return 1;
    }
    return 0;
}

}  // namespace

// UI thread only. Each test owns its local HTTP server and cache directory.
class TestServerTimelineLoader : public QObject {
    Q_OBJECT

private slots:
    void loadsSnapshotAndPinsMedia() {
        QTemporaryDir cache;
        QVERIFY(cache.isValid());
        ServerLoaderWorkers workers;
        TestHttpServer server;
        const nt::server::AssetCacheRoot cacheRoot(cache.path());
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
            ServerTimelineLoader loader(workers, server.base(), QStringLiteral("local-token"), cacheRoot);
            QSignalSpy loaded(&loader, &ServerTimelineLoader::loaded);
            QSignalSpy failed(&loader, &ServerTimelineLoader::failed);
            const QUuid request = QUuid::createUuid();
            loader.load(id, request);
            QCOMPARE(loaded.count(), 0);
            QTRY_COMPARE(loaded.count() + failed.count(), 1);
            QCOMPARE(failed.count(), 0);
            const auto args = loaded.takeFirst();
            QCOMPARE(args.at(0).toString(), id);
            QCOMPARE(args.at(1).toUuid(), request);
            const auto snapshot = args.at(2).value<Snapshot>();
            QVERIFY(snapshot);
            QCOMPARE(snapshot->id, id.toStdString());
            QCOMPARE(snapshot->clips.size(), 1u);
            path = QString::fromStdString(snapshot->clips.front().mediaPath);
            leases = args.at(3).value<std::shared_ptr<void>>();
            QVERIFY(leases);
        }

        QFile file(path);
        QVERIFY(file.open(QIODevice::ReadOnly));
        QCOMPARE(file.readAll(), bytes);
        file.close();
        const auto requests = server.requests();
        QVERIFY(!requests.empty());
        QCOMPARE(requests.front().headers.value("authorization"), QByteArray("Bearer local-token"));

        cacheRoot.evict(1, {});
        QVERIFY(QFile::exists(path));
        leases.reset();
        cacheRoot.evict(1, {});
        QVERIFY(!QFile::exists(path));
    }

    void reportsFailure() {
        QTemporaryDir cache;
        QVERIFY(cache.isValid());
        ServerLoaderWorkers workers;
        TestHttpServer server;
        server.setFile(kTimelinePath, ServedFile(
            R"({"error":{"message":"Timeline missing","data":{"code":"NOT_FOUND"}}})"));
        const QString id = QStringLiteral("missing");
        ServerTimelineLoader loader(workers, server.base(), {}, AssetCacheRoot(cache.path()));
        QSignalSpy loaded(&loader, &ServerTimelineLoader::loaded);
        QSignalSpy failed(&loader, &ServerTimelineLoader::failed);
        const QUuid request = QUuid::createUuid();
        loader.load(id, request);
        QTRY_COMPARE(failed.count(), 1);
        QCOMPARE(loaded.count(), 0);
        QCOMPARE(failed.first().at(0).toString(), id);
        QCOMPARE(failed.first().at(1).toUuid(), request);
        QCOMPARE(failed.first().at(2).toString(), QStringLiteral("timeline.get: Timeline missing (NOT_FOUND)"));
    }

    void cancelsInFlightLoad() {
        QTemporaryDir cache;
        QVERIFY(cache.isValid());
        ServerLoaderWorkers workers;
        TestHttpServer server;
        const QString id = QStringLiteral("cancelled");
        stallTimeline(server, id);
        ServerTimelineLoader loader(workers, server.base(), {}, AssetCacheRoot(cache.path()));
        QSignalSpy loaded(&loader, &ServerTimelineLoader::loaded);
        QSignalSpy failed(&loader, &ServerTimelineLoader::failed);
        const QUuid request = QUuid::createUuid();
        loader.load(id, request);
        QTRY_COMPARE(server.countRequests("GET", kTimelinePath), 1);
        QCOMPARE(server.activeConnectionCount(), 1);
        loader.cancel();
        QTRY_COMPARE(server.activeConnectionCount(), 0);
        QTRY_VERIFY(workers.findChildren<QThread*>().isEmpty());
        QCOMPARE(loaded.count(), 0);
        QCOMPARE(failed.count(), 0);
    }

    void supersedesInFlightLoad() {
        QTemporaryDir cache;
        QVERIFY(cache.isValid());
        ServerLoaderWorkers workers;
        TestHttpServer server;
        stallTimeline(server, QStringLiteral("old"));
        const QString newest = QStringLiteral("new");
        ServerTimelineLoader loader(workers, server.base(), {}, AssetCacheRoot(cache.path()));
        QSignalSpy loaded(&loader, &ServerTimelineLoader::loaded);
        QSignalSpy failed(&loader, &ServerTimelineLoader::failed);
        loader.load(QStringLiteral("old"), QUuid::createUuid());
        QTRY_COMPARE(server.countRequests("GET", kTimelinePath), 1);
        server.setFile(kTimelinePath, ServedFile(document(newest)));
        loader.load(QStringLiteral("superseded pending"), QUuid::createUuid());
        const QUuid request = QUuid::createUuid();
        loader.load(newest, request);
        QTRY_COMPARE(loaded.count(), 1);
        QCOMPARE(failed.count(), 0);
        QCOMPARE(loaded.first().at(0).toString(), newest);
        QCOMPARE(loaded.first().at(1).toUuid(), request);
        QCOMPARE(server.countRequests("GET", kTimelinePath), 2);
    }

    void applicationExitDrainsWorkersAfterLoaderDestruction() {
        QProcess child;
        child.setProcessChannelMode(QProcess::MergedChannels);
        child.start(QCoreApplication::applicationFilePath(), {QStringLiteral("--exit-with-stalled-request")});
        QVERIFY(child.waitForFinished(15000));
        const auto output = child.readAll();
        QVERIFY2(child.exitStatus() == QProcess::NormalExit && child.exitCode() == 0, output.constData());
    }

    void aboutToQuitDrainsOutstandingWorker() {
        QProcess child;
        child.setProcessChannelMode(QProcess::MergedChannels);
        child.start(QCoreApplication::applicationFilePath(), {QStringLiteral("--quit-with-stalled-request")});
        QVERIFY(child.waitForFinished(15000));
        const auto output = child.readAll();
        QVERIFY2(child.exitStatus() == QProcess::NormalExit && child.exitCode() == 0, output.constData());
    }

    void shutdownRejectsNewRequests() {
        QTemporaryDir cache;
        ServerLoaderWorkers workers;
        TestHttpServer server;
        ServerTimelineLoader loader(workers, server.base(), {}, AssetCacheRoot(cache.path()));
        workers.shutdown();
        QSignalSpy failed(&loader, &ServerTimelineLoader::failed);
        const QString id = QStringLiteral("after-shutdown");
        const QUuid request = QUuid::createUuid();
        loader.load(id, request);
        QCOMPARE(failed.count(), 1);
        QCOMPARE(failed.first().at(0).toString(), id);
        QCOMPARE(failed.first().at(1).toUuid(), request);
        QCOMPARE(server.countRequests("GET", kTimelinePath), 0);
    }

    void destroysLoaderDuringLoad() {
        QTemporaryDir cache;
        QVERIFY(cache.isValid());
        ServerLoaderWorkers workers;
        TestHttpServer server;
        const QString id = QStringLiteral("closing");
        stallTimeline(server, id);
        auto loader = std::make_unique<ServerTimelineLoader>(workers, server.base(), QString(), AssetCacheRoot(cache.path()));
        loader->load(id, QUuid::createUuid());
        QTRY_COMPARE(server.countRequests("GET", kTimelinePath), 1);
        QCOMPARE(server.activeConnectionCount(), 1);
        QElapsedTimer elapsed;
        elapsed.start();
        loader.reset();
        QVERIFY2(elapsed.elapsed() < 1000, "Destructor waited on the worker");
        QTRY_COMPARE(server.activeConnectionCount(), 0);
        QTRY_VERIFY(workers.findChildren<QThread*>().isEmpty());
        QCOMPARE(server.countRequests("GET", kTimelinePath), 1);
    }
};

int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    if (app.arguments().contains(QStringLiteral("--exit-with-stalled-request"))) {
        return exitWithStalledRequest(app, false);
    }
    if (app.arguments().contains(QStringLiteral("--quit-with-stalled-request"))) {
        return exitWithStalledRequest(app, true);
    }
    TestServerTimelineLoader test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_servertimelineloader.moc"
