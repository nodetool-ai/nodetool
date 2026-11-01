#include "assets/AssetBrowser.h"
#include "aiassist/CandidatePreview.h"
#include <QBuffer>
#include <QProcess>
#include "export/ExportController.h"
#include "motion/mattes/MatteResolver.h"
#include "app/EditRegistry.h"
#include "edit/tracks/TrackEdits.h"
#include "edit/sourceEdit/SourceViewerState.h"
#include "edit/targeting/TrackTargeting.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "server/ServerSource.h"
#include "../../tests/TestHttpServer.h"
#include "../../tests/TrickleHttpServer.h"
#include <QDir>
#include <QEventLoop>
#include <QFileInfo>
#include <QJsonDocument>
#include <QLockFile>
#include <QTimer>
#include <QTemporaryDir>
#include <QUrlQuery>
#include <QScopeGuard>
#include <cstdio>
#include <QGuiApplication>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QtTest>
#include <memory>

namespace {
QQuickItem* itemNamed(QQuickItem* root, const QString& name) {
    if (root->objectName() == name) { return root; }
    for (auto* child : root->childItems()) {
        if (auto* found = itemNamed(child, name)) { return found; }
    }
    return nullptr;
}
}

class TestAssetBrowser : public QObject {
    Q_OBJECT
private slots:
    void destructionCancelsTricklingQuery() {
        TrickleHttpServer http;
        auto browser = std::make_unique<AssetBrowser>();
        browser->m_target = nt::server::SaveTarget{http.base(), {}, {}, {}, {}};
        browser->refresh();
        QTRY_VERIFY(http.requests() > 0 && http.chunks() >= 2);
        QElapsedTimer elapsed;
        elapsed.start();
        browser.reset();
        QVERIFY2(elapsed.elapsed() < 1000, "Browser destruction waited for the trickling response");
    }
    void resolvesExistingMatteAfterEdit_data() {
        QTest::addColumn<QString>("reference");
        QTest::addColumn<bool>("resolves");
        QTest::addColumn<int>("browserCount");
        const QString full = "cccccccccccccccccccccccccccccccc";
        QTest::newRow("full-no-browser") << full << true << 0;
        QTest::newRow("full-two-browsers") << full << true << 2;
        QTest::newRow("asset-uri") << "asset://" + full << true << 0;
        QTest::newRow("prefix") << full.left(12) << false << 0;
        QTest::newRow("asset-uri-prefix") << "asset://" + full.left(12) << false << 0;
        QTest::newRow("missing") << QString("dddddddddddddddddddddddddddddddd") << false << 0;
        QTest::newRow("ambiguous") << QString("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") << false << 0;
    }
    void resolvesExistingMatteAfterEdit() {
        QFETCH(QString, reference);
        QFETCH(bool, resolves);
        QFETCH(int, browserCount);
        const QString id = "cccccccccccccccccccccccccccccccc";
        TestHttpServer http;
        QVERIFY(http.base().port() != 7777);
        const QByteArray bytes(1000, 'm');
        http.setFile("/matte.mp4", ServedFile{bytes});
        http.setJson([&](const QByteArray& path, const QUrl& url) {
            if (path != "/trpc/assets.get") { return QByteArray(); }
            const auto input = QJsonDocument::fromJson(QUrlQuery(url).queryItemValue("input", QUrl::FullyDecoded).toUtf8()).object();
            if (input.value("id").toString() != id) {
                const bool ambiguous = input.value("id").toString().startsWith("eeee");
                const QJsonObject details{{"code", ambiguous ? "CONFLICT" : "NOT_FOUND"},
                                          {"httpStatus", ambiguous ? 403 : 404}};
                return QJsonDocument(QJsonObject{{"error", QJsonObject{{"message", "unavailable"},
                    {"code", -32004}, {"data", details}}}}).toJson(QJsonDocument::Compact);
            }
            const QJsonObject asset{{"id", id}, {"get_url", "/matte.mp4"},
                {"size", bytes.size()}, {"content_type", "video/mp4"}};
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", asset}}}}).toJson(QJsonDocument::Compact);
        });
        QTemporaryDir dir;
        auto parsed = nt::parseTimelineJson(R"({"fps":30,"width":64,"height":64,
            "tracks":[{"id":"v","type":"video"}],"clips":[{"id":"c","trackId":"v",
            "mediaType":"video","durationMs":1000}]})");
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(*parsed.timeline);
        nt::server::SaveTarget target;
        target.server = http.base();
        target.backupDir = dir.filePath("server/user/timelines");
        nt::motion::MatteResolver resolver(model, target);
        std::vector<std::unique_ptr<AssetBrowser>> browsers;
        for (int i = 0; i < browserCount; ++i) {
            auto browser = std::make_unique<AssetBrowser>();
            browser->m_target = target;
            browser->setTimeline(&model);
            browsers.push_back(std::move(browser));
        }
        auto clips = model.clipsJson();
        auto clip = clips[0].toObject();
        clip.insert("generatedMatte", QJsonObject{{"assetId", reference}, {"unknown", 42}});
        clips[0] = clip;
        QVERIFY(model.commitEdit("Matte", model.clipsJson(), clips));
        const auto before = model.documentJson();
        if (resolves) {
            QTRY_VERIFY_WITH_TIMEOUT(!model.timeline().clips.front().generatedMattePath.empty(), 10000);
            QVERIFY(QFileInfo::exists(QString::fromStdString(model.timeline().clips.front().generatedMattePath)));
            const auto snapshot = nt::exporting::exportSnapshot(model);
            const auto exportedMatte = snapshot.value("clips").toArray()[0].toObject().value("generatedMatte").toObject();
            QCOMPARE(exportedMatte.value("mediaPath").toString(), QString::fromStdString(model.timeline().clips.front().generatedMattePath));
            QCOMPARE(exportedMatte.value("assetId").toString(), reference);
            QCOMPARE(exportedMatte.value("unknown").toInt(), 42);
        } else {
            QTRY_VERIFY_WITH_TIMEOUT(http.countRequests("GET", "/trpc/assets.get") > 0 ||
                reference.endsWith("cccccccccccc"), 10000);
            QTest::qWait(100);
            QVERIFY(model.timeline().clips.front().generatedMattePath.empty());
        }
        QCOMPARE(model.documentJson(), before);
        if (resolves) QCOMPARE(http.countRequests("GET", "/trpc/assets.get"), 1);
    }
    void sourceViewerResolvesFreshAsset_data() {
        QTest::addColumn<QString>("kind");
        QTest::addColumn<QString>("media");
        for (const auto* kind : {"append", "insert", "overwrite"}) {
            for (const auto* media : {"image", "audio", "video"}) {
                QTest::newRow(qPrintable(QString::fromLatin1(kind) + '-' + media)) << QString(kind) << QString(media);
            }
        }
    }
    void sourceViewerResolvesFreshAsset() {
        QFETCH(QString, kind);
        QFETCH(QString, media);
        QTemporaryDir cache;
        TestHttpServer http;
        http.setFile("/fresh.bin", ServedFile{QByteArray("source-media")});
        auto parsed = nt::parseTimelineJson(R"({"fps":30,"width":640,"height":360,
            "tracks":[{"id":"v","type":"video","index":0},
                      {"id":"a","type":"audio","index":1}],"clips":[]})");
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        PlaybackClock clock;
        ClipGestureController gestures;
        gestures.setTimeline(&model);
        gestures.setClock(&clock);
        nt::targeting::TrackTargeting::current().setTrackTargeted("v", true);
        nt::targeting::TrackTargeting::current().setTrackTargeted("a", true);
        AssetBrowser browser;
        browser.setTimeline(&model);
        browser.m_target = nt::server::SaveTarget{http.base(), {}, "seq",
            cache.filePath("server/user/timelines"), {}};
        SourceViewerState source;
        source.setMediaBrowser(&browser);
        source.setAsset({{"id", "0123456789abcdef0123456789abcdef"}, {"name", "Fresh"},
            {"content_type", media + (media == "image" ? "/png" : media == "audio" ? "/wav" : "/mp4")},
            {"get_url", "/fresh.bin"}, {"size", 12}, {"duration", 2}});
        QVERIFY(source.perform(kind, &gestures));
        QCOMPARE(model.clipCount(), 1);
        QTRY_VERIFY_WITH_TIMEOUT(!browser.busy(), 2000);
        const auto clip = model.timeline().clips.front();
        if (media != "audio") {
            QVERIFY2(!clip.mediaPath.empty(), "source edits must resolve uncached picture media");
            QVERIFY(QFileInfo::exists(QString::fromStdString(clip.mediaPath)));
        }
        if (media != "image") {
            QVERIFY2(!clip.audioPath.empty(), "source edits must resolve uncached audio media");
            QVERIFY(QFileInfo::exists(QString::fromStdString(clip.audioPath)));
        }
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo();
        QCOMPARE(model.clipCount(), 0);
        model.undoStack()->redo();
        QCOMPARE(model.timeline().clips.front().mediaPath, clip.mediaPath);
        QCOMPARE(model.timeline().clips.front().audioPath, clip.audioPath);
    }

    void documentSwitchDuringEviction() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        QStringList paths;
        for (const auto& name : {"old.mp4", "loaded.mp4", "loaded.wav", "fetched.png"}) {
            const auto path = dir.filePath(name);
            QFile file(path);
            QVERIFY(file.open(QIODevice::WriteOnly));
            QCOMPARE(file.write(QByteArray(700000, 'b')), 700000);
            QVERIFY(file.setFileTime(QDateTime::fromSecsSinceEpoch(paths.size() + 1),
                                     QFileDevice::FileModificationTime));
            paths.append(path);
        }
        const auto document = [] {
            return nt::parseTimelineJson(R"({"fps":30,"width":640,"height":360,
                "tracks":[{"id":"v","type":"video","index":0}],
                "clips":[{"id":"loaded","trackId":"v","mediaType":"video","durationMs":2000}]})");
        };
        auto first = document();
        auto second = document();
        QVERIFY(first.timeline);
        QVERIFY(second.timeline);
        first.timeline->clips.front().mediaPath = paths[0].toStdString();
        second.timeline->clips.front().mediaPath = paths[1].toStdString();
        second.timeline->clips.front().audioPath = QDir::current().relativeFilePath(paths[2]).toStdString();
        TimelineModel model;
        model.setTimeline(std::move(*first.timeline));
        AssetBrowser browser;
        browser.setTimeline(&model);
        bool switched = false;
        browser.m_mediaProtection->evict(dir.path(), 1024 * 1024, paths[3], [&] {
            model.setTimeline(std::move(*second.timeline));
            switched = true;
        });
        QVERIFY(switched);
        QVERIFY2(QFileInfo::exists(paths[1]), "new document video was evicted after reset returned");
        QVERIFY2(QFileInfo::exists(paths[2]), "new document audio was evicted after reset returned");
        QVERIFY2(!QFileInfo::exists(paths[0]), "unprotected old file was not evicted");
        QVERIFY(QFileInfo::exists(paths[3]));
    }
    void mediaEvictionPolicy_data() {
        QTest::addColumn<qint64>("budget");
        QTest::addColumn<bool>("evicted");
        QTest::newRow("negative-unlimited") << qint64(-1) << false;
        QTest::newRow("zero-unlimited") << qint64(0) << false;
        QTest::newRow("within-budget") << qint64(4 * 1024 * 1024) << false;
        QTest::newRow("over-budget") << qint64(3 * 1024 * 1024) << true;
    }
    void mediaEvictionPolicy() {
        QFETCH(qint64, budget);
        QFETCH(bool, evicted);
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        QVERIFY(QDir(dir.path()).mkpath("locked"));
        QStringList paths;
        for (const auto& name : {"protected.png", "locked/other.png", "old.png", "recent.png",
                                 "locked/fetched.png", ".hidden", "download.part", "download.total", "report.json"}) {
            const auto path = dir.filePath(name);
            QFile file(path);
            QVERIFY(file.open(QIODevice::WriteOnly));
            QCOMPARE(file.write(QByteArray(700000, 'b')), 700000);
            QVERIFY(file.setFileTime(QDateTime::fromSecsSinceEpoch(paths.size() + 1),
                                     QFileDevice::FileModificationTime));
            QVERIFY(file.setFileTime(QDateTime::fromSecsSinceEpoch(paths.size() + 1),
                                     QFileDevice::FileAccessTime));
            paths.append(path);
        }
        QLockFile held(dir.filePath("locked/.lock"));
        held.setStaleLockTime(0);
        QVERIFY(held.tryLock(0));
        nt::assets::MediaProtection protection;
        protection.protect(QDir::current().relativeFilePath(paths[0]));
        protection.evict(dir.path(), budget, paths[4]);
        QCOMPARE(QFileInfo::exists(paths[2]), !evicted);
        for (const auto& path : paths) {
            if (path != paths[2]) { QVERIFY2(QFileInfo::exists(path), qPrintable(path)); }
        }
    }
    void mediaLeasesReleaseWithOwner() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        QStringList paths;
        for (const auto& name : {"document.png", "export.png", "new.png"}) {
            const QString path = dir.filePath(name);
            QFile file(path);
            QVERIFY(file.open(QIODevice::WriteOnly));
            QCOMPARE(file.write(QByteArray(700000, 'b')), 700000);
            paths.append(path);
        }
        nt::assets::MediaProtection document;
        document.reset({paths[0]});
        auto exportLeases = nt::assets::MediaProtection::leasePaths({paths[1]});
        document.evict(dir.path(), 700000, paths[2]);
        QVERIFY(QFileInfo::exists(paths[0]));
        QVERIFY(QFileInfo::exists(paths[1]));
        document.reset({});
        exportLeases.clear();
        document.evict(dir.path(), 700000, paths[2]);
        QVERIFY(!QFileInfo::exists(paths[0]));
        QVERIFY(!QFileInfo::exists(paths[1]));
        QVERIFY(QFileInfo::exists(paths[2]));
    }
    void proxyVideoRetainsOriginalPicturePath() {
        TestHttpServer http;
        QVERIFY(http.base().port() > 0);
        http.setFile("/proxy.mp4", ServedFile{QByteArray(400000, 'p')});
        http.setFile("/original.mp4", ServedFile{QByteArray(700000, 'o')});
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        nt::server::ServerClient client(http.base());
        nt::assets::MediaProtection protection;
        const QJsonObject asset{{"id", "video"}, {"get_url", "/original.mp4"},
            {"size", 700000}, {"content_type", "video/mp4"},
            {"proxy_status", "ready"}, {"proxy_url", "/proxy.mp4?v=proxy1"}};
        const auto media = nt::assets::resolveDroppedMedia(client, dir.path(), asset,
            {{"id", "clip"}, {"mediaType", "video"}}, protection, protection.generation());
        const QString preview = QString::fromStdString(media.mediaPath);
        const QString original = QString::fromStdString(media.originalMediaPath);
        QVERIFY(QFileInfo::exists(preview));
        QVERIFY(QFileInfo::exists(original));
        QVERIFY(preview != original);
        QCOMPARE(media.audioPath, media.originalMediaPath);
    }
    void linkedAudioTrackedDeletion_data() {
        QTest::addColumn<QString>("outcome");
        QTest::newRow("audio") << QString("audio");
        QTest::newRow("failed") << QString("failed");
    }
    void linkedAudioTrackedDeletion() {
        QFETCH(QString, outcome);
        auto parsed = nt::parseTimelineJson(R"({"fps":30,"width":640,"height":360,
            "tracks":[{"id":"v","type":"video","index":0}],"clips":[]})");
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        AssetBrowser browser;
        browser.setTimeline(&model);
        browser.m_target = nt::server::SaveTarget{};
        QThread occupiedWorker;
        browser.m_thread = &occupiedWorker;
        const auto clearWorker = qScopeGuard([&browser] { browser.m_thread.clear(); });
        QVERIFY(browser.drop({{"id", "video"}, {"name", "take.mp4"},
            {"content_type", "video/mp4"}, {"duration", 2}}, "v", 0, "overlap", 0));
        auto completion = std::move(browser.m_requests.back().done);
        browser.m_requests.clear();
        browser.m_target.reset();
        QVERIFY(completion);
        QVERIFY(model.commitEdit("Delete clips", model.clipsJson(), {}));
        QCOMPARE(model.clipCount(), 0);
        AssetBrowser::Result result;
        result.settlement = {{"outcome", outcome},
            {"asset", QJsonObject{{"id", "extracted-wav"}, {"duration", 1.5}}}};
        // Retain a target only to observe queued media, without starting network work.
        browser.m_target = nt::server::SaveTarget{};
        completion(result);
        QCOMPARE(model.clipCount(), 0);
        model.undoStack()->undo();
        QCOMPARE(model.clipCount(), 2);
        const auto audio = model.clipsJson().last().toObject();
        QCOMPARE(audio.value("status").toString(), outcome == "audio" ? QString("generated") : QString("failed"));
        if (outcome == "audio") {
            QCOMPARE(audio.value("currentAssetId").toString(), QString("extracted-wav"));
            QCOMPARE(browser.m_requests.size(), size_t(1));
        }
        model.undoStack()->redo();
        QCOMPARE(model.clipCount(), 0);
        QCOMPARE(model.undoStack()->count(), 2);
    }
    void linkedAudioLaterHistory_data() {
        QTest::addColumn<QString>("outcome");
        QTest::addColumn<bool>("documentMarker");
        QTest::addColumn<bool>("checkAfterMarkerUndo");
        for (const auto& outcome : {QString("audio"), QString("failed"), QString("silent")}) {
            for (const bool documentMarker : {false, true}) {
                for (const bool checkAfterMarkerUndo : {false, true}) {
                    const auto name = outcome + (documentMarker ? "-document" : "-markers") +
                        (checkAfterMarkerUndo ? "-undo-marker" : "-redo-drop");
                    QTest::newRow(qPrintable(name)) << outcome << documentMarker << checkAfterMarkerUndo;
                }
            }
        }
    }
    void linkedAudioLaterHistory() {
        QFETCH(QString, outcome);
        QFETCH(bool, documentMarker);
        QFETCH(bool, checkAfterMarkerUndo);
        auto parsed = nt::parseTimelineJson(R"({"fps":30,"width":640,"height":360,
            "tracks":[{"id":"v","type":"video","index":0}],"clips":[]})");
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        AssetBrowser browser;
        browser.setTimeline(&model);
        browser.m_target = nt::server::SaveTarget{};
        QThread occupiedWorker;
        browser.m_thread = &occupiedWorker;
        QVERIFY(browser.drop({{"id", "video"}, {"name", "take.mp4"},
            {"content_type", "video/mp4"}, {"duration", 2}}, "v", 0, "overlap", 0));
        auto completion = std::move(browser.m_requests.back().done);
        browser.m_requests.clear();
        browser.m_thread.clear();
        browser.m_target.reset();
        QVERIFY(completion);
        if (documentMarker) {
            QVERIFY(model.applyEdit("addMarker", {{"timeMs", 500}, {"label", "Later edit"}}));
        } else { model.addMarker(500, "Later edit"); }
        const auto markers = model.markersJson();
        AssetBrowser::Result result;
        result.settlement = {{"outcome", outcome},
            {"asset", QJsonObject{{"id", "extracted-wav"}, {"duration", 1.5}}}};
        completion(result);
        QCOMPARE(model.markersJson(), markers);
        model.undoStack()->undo();
        if (!checkAfterMarkerUndo) {
            model.undoStack()->undo();
            QCOMPARE(model.clipCount(), 0);
            model.undoStack()->redo();
        }
        QCOMPARE(model.markersJson().size(), 0);
        if (outcome == "silent") {
            QCOMPARE(model.clipCount(), 1);
            QVERIFY(!model.clipsJson().first().toObject().contains("linkId"));
            QCOMPARE(model.timeline().raw.value("tracks").toArray().size(), 1);
        } else {
            const auto audio = model.clipsJson().last().toObject();
            QCOMPARE(audio.value("status").toString(), outcome == "failed" ? QString("failed") : QString("generated"));
            if (outcome == "audio") { QCOMPARE(audio.value("currentAssetId").toString(), QString("extracted-wav")); }
        }
        QCOMPARE(model.undoStack()->count(), 2);
        QVERIFY(!browser.m_settlements.isEmpty());
        model.undoStack()->redo();
        QCOMPARE(model.markersJson(), markers);
        if (outcome != "silent") {
            const auto audio = model.clipsJson().last().toObject();
            QCOMPARE(audio.value("status").toString(), outcome == "failed" ? QString("failed") : QString("generated"));
        }
        const auto protection = browser.m_mediaProtection;
        const auto protectionGeneration = protection->generation();
        auto replacement = nt::parseTimelineJson(model.documentJson());
        QVERIFY(replacement.timeline);
        model.setTimeline(std::move(*replacement.timeline));
        QVERIFY(browser.m_settlements.isEmpty());
        QCOMPARE(browser.m_mediaProtection, protection);
        QVERIFY(protection->generation() != protectionGeneration);
    }
    void linkedSilentSettlementPreservesLaterTrack() {
        auto parsed = nt::parseTimelineJson(R"({"fps":30,"width":640,"height":360,
            "tracks":[{"id":"v","type":"video","index":0}],"clips":[]})");
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        AssetBrowser browser;
        browser.setTimeline(&model);
        browser.m_target = nt::server::SaveTarget{};
        QThread occupied;
        browser.m_thread = &occupied;
        QVERIFY(browser.drop({{"id", "video"}, {"name", "Silent"}, {"content_type", "video/mp4"},
            {"duration", 2}}, "v", 0, "overlap", 0));
        auto complete = std::move(browser.m_requests.back().done);
        browser.m_requests.clear();
        browser.m_thread.clear();
        browser.m_target.reset();
        nt::app::registerEdit("testAddTrack", nt::tracks::addTrack);
        QVERIFY(model.applyEdit("testAddTrack", {{"type", "audio"}}));
        const auto added = model.timeline().raw["tracks"].toArray().last().toObject();
        AssetBrowser::Result result;
        result.settlement = {{"outcome", "silent"}};
        complete(result);
        QCOMPARE(model.timeline().raw["tracks"].toArray().size(), 2);
        QCOMPARE(model.timeline().raw["tracks"].toArray().last().toObject()["id"], added["id"]);
        QCOMPARE(model.undoStack()->count(), 2);
        model.undoStack()->undo();
        QCOMPARE(model.timeline().raw["tracks"].toArray().size(), 1);
        model.undoStack()->redo();
        QCOMPARE(model.timeline().raw["tracks"].toArray().size(), 2);
        QCOMPARE(model.timeline().raw["tracks"].toArray().last().toObject()["id"], added["id"]);
    }

    void documentSwitchProtectsMedia_data() {
        QTest::addColumn<QString>("scenario");
        for (const auto& scenario : {"queued", "running", "new-document"}) {
            QTest::newRow(scenario) << QString(scenario);
        }
    }
    void documentSwitchProtectsMedia() {
        QFETCH(QString, scenario);
        const auto oldBudget = qgetenv("NODETOOL_TIMELINE_CACHE_BUDGET_MB");
        qputenv("NODETOOL_TIMELINE_CACHE_BUDGET_MB", "1");
        const auto restoreBudget = qScopeGuard([oldBudget] {
            if (oldBudget.isNull()) { qunsetenv("NODETOOL_TIMELINE_CACHE_BUDGET_MB"); }
            else { qputenv("NODETOOL_TIMELINE_CACHE_BUDGET_MB", oldBudget); }
        });
        TestHttpServer http;
        QVERIFY(http.base().port() > 0 && http.base().port() != 7777);
        ServedFile download{QByteArray(700000, 'a')};
        download.chunkDelayMs = 10;
        http.setFile("/download.png", download);
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        QStringList paths;
        for (const auto& name : {"old.mp4", "loaded.mp4", "loaded.wav"}) {
            const auto path = dir.filePath(name);
            QFile file(path);
            QVERIFY(file.open(QIODevice::WriteOnly));
            QCOMPARE(file.write(QByteArray(700000, 'b')), 700000);
            QVERIFY(file.setFileTime(QDateTime::fromSecsSinceEpoch(1), QFileDevice::FileModificationTime));
            paths.append(path);
        }
        const auto document = [] {
            return nt::parseTimelineJson(R"({"fps":30,"width":640,"height":360,
                "tracks":[{"id":"v","type":"video","index":0}],
                "clips":[{"id":"loaded","trackId":"v","mediaType":"video","durationMs":2000}]})");
        };
        auto first = document();
        auto second = document();
        QVERIFY(first.timeline);
        QVERIFY(second.timeline);
        first.timeline->clips.front().mediaPath = paths[0].toStdString();
        second.timeline->clips.front().mediaPath = paths[1].toStdString();
        second.timeline->clips.front().audioPath = paths[2].toStdString();
        TimelineModel model;
        model.setTimeline(std::move(*first.timeline));
        AssetBrowser browser;
        browser.setTimeline(&model);
        nt::server::SaveTarget target;
        target.server = http.base();
        target.backupDir = dir.filePath("server/user/timelines");
        browser.m_target = target;
        QThread occupiedWorker;
        browser.m_thread = &occupiedWorker;
        const auto clearWorker = qScopeGuard([&browser] { browser.m_thread.clear(); });
        const auto queue = [&] {
            browser.queueMedia({{"id", "download"}, {"get_url", "/download.png"},
                {"size", 700000}, {"content_type", "image/png"}},
                {{"id", "download"}, {"mediaType", "image"}, {"currentAssetId", "download"}},
                &model, model.documentGeneration());
        };
        queue();
        QCOMPARE(browser.m_requests.size(), size_t(1));
        auto request = std::move(browser.m_requests.front());
        browser.m_requests.clear();
        AssetBrowser::Result result;
        if (scenario == "running") {
            auto worker = std::unique_ptr<QThread>(QThread::create([&request, &result, server = http.base()] {
                nt::server::ServerClient client(server);
                result = request.work(client);
            }));
            const auto finishWorker = qScopeGuard([&worker] { worker->requestInterruption(); worker->wait(); });
            worker->start();
            QTRY_VERIFY(http.countRequests("GET", "/download.png") > 0);
            QVERIFY(!worker->isFinished());
            model.setTimeline(std::move(*second.timeline));
            QTRY_VERIFY_WITH_TIMEOUT(worker->isFinished(), 15000);
            worker->wait();
            QVERIFY(result.media);
            QVERIFY(QFileInfo::exists(QString::fromStdString(result.media->mediaPath)));
            QVERIFY2(!QFileInfo::exists(paths[0]), "running fetch did not evict unprotected old media");
        } else {
            model.setTimeline(std::move(*second.timeline));
            nt::server::ServerClient client(http.base());
            result = request.work(client);
        }
        if (request.done) { request.done(result); }
        for (const auto& path : {paths[1], paths[2]}) {
            QVERIFY2(QFileInfo::exists(path), qPrintable("new document media was evicted: " + path));
        }
        QCOMPARE(QString::fromStdString(model.timeline().clips.front().mediaPath), paths[1]);
        QCOMPARE(QString::fromStdString(model.timeline().clips.front().audioPath), paths[2]);
        if (scenario != "running") {
            QVERIFY(!result.media);
            QCOMPARE(http.countRequests("GET", "/download.png"), 0);
        }
        if (scenario == "new-document") {
            queue();
            auto current = std::move(browser.m_requests.front());
            browser.m_requests.clear();
            nt::server::ServerClient client(http.base());
            const auto media = current.work(client);
            QVERIFY(media.media);
            QVERIFY(QFileInfo::exists(QString::fromStdString(media.media->mediaPath)));
            QVERIFY(!QFileInfo::exists(paths[0]));
            QVERIFY(QFileInfo::exists(paths[1]));
            QVERIFY(QFileInfo::exists(paths[2]));
        }
    }
    void dropMediaSurvivesEviction_data() {
        QTest::addColumn<QString>("scenario");
        for (const auto& scenario : {"sequential", "extracted-audio", "open-document"}) {
            QTest::newRow(scenario) << QString(scenario);
        }
    }
    void dropMediaSurvivesEviction() {
        QFETCH(QString, scenario);
        const auto oldBudget = qgetenv("NODETOOL_TIMELINE_CACHE_BUDGET_MB");
        qputenv("NODETOOL_TIMELINE_CACHE_BUDGET_MB", "1");
        const auto restoreBudget = qScopeGuard([oldBudget] {
            if (oldBudget.isNull()) { qunsetenv("NODETOOL_TIMELINE_CACHE_BUDGET_MB"); }
            else { qputenv("NODETOOL_TIMELINE_CACHE_BUDGET_MB", oldBudget); }
        });
        TestHttpServer http;
        QVERIFY(http.base().port() > 0 && http.base().port() != 7777);
        http.setFile("/first.mp4", ServedFile{QByteArray(700000, 'a')});
        http.setFile("/second.wav", ServedFile{QByteArray(700000, 'b')});
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        auto parsed = nt::parseTimelineJson(R"({"fps":30,"width":640,"height":360,
            "tracks":[{"id":"v","type":"video","index":0}],
            "clips":[{"id":"loaded","trackId":"v","mediaType":"video","durationMs":2000}]})");
        QVERIFY(parsed.timeline);
        QStringList paths;
        if (scenario == "open-document") {
            for (const auto& name : {"loaded.mp4", "loaded.wav"}) {
                const auto path = dir.filePath(name);
                QFile file(path);
                QVERIFY(file.open(QIODevice::WriteOnly));
                QCOMPARE(file.write(QByteArray(700000, 'c')), 700000);
                paths.append(path);
            }
            parsed.timeline->clips.front().mediaPath = paths[0].toStdString();
            parsed.timeline->clips.front().audioPath = paths[1].toStdString();
        }
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        AssetBrowser browser;
        browser.setTimeline(&model);
        nt::server::SaveTarget target;
        target.server = http.base();
        target.backupDir = dir.filePath("server/user/timelines");
        browser.m_target = target;
        QThread occupiedWorker;
        browser.m_thread = &occupiedWorker;
        const auto queue = [&](const QString& id, const QString& type, const QString& url) {
            const QJsonObject asset{{"id", id}, {"get_url", url}, {"size", 700000},
                {"content_type", type == "audio" ? "audio/wav" : "video/mp4"}};
            browser.queueMedia(asset, {{"id", id}, {"mediaType", type}, {"currentAssetId", id}},
                &model, model.documentGeneration());
        };
        if (scenario != "open-document") { queue("first", scenario == "extracted-audio" ? "video" : "image", "/first.mp4"); }
        queue("second", scenario == "extracted-audio" ? "audio" : "image", "/second.wav");
        auto requests = std::move(browser.m_requests);
        browser.m_thread.clear();
        nt::server::ServerClient client(http.base());
        for (auto& request : requests) {
            const auto result = request.work(client);
            QVERIFY(result.media);
            const auto path = QString::fromStdString(result.media->mediaType == nt::MediaType::Audio
                ? result.media->audioPath : result.media->mediaPath);
            QVERIFY2(QFileInfo::exists(path), qPrintable(path));
            if (result.media->mediaType == nt::MediaType::Video) {
                QCOMPARE(result.media->originalMediaPath, result.media->audioPath);
            } else if (result.media->mediaType == nt::MediaType::Image) {
                QCOMPARE(result.media->originalMediaPath, result.media->mediaPath);
            }
            paths.append(path);
            if (request.done) { request.done(result); }
        }
        for (const auto& path : paths) {
            QVERIFY2(QFileInfo::exists(path), qPrintable("open document media was evicted: " + path));
        }
    }
    void linkedAudioHistory_data() {
        QTest::addColumn<QString>("scenario");
        for (const auto& scenario : {"audio", "undone", "silent", "later", "later-undone", "deleted"}) {
            QTest::newRow(scenario) << QString(scenario);
        }
    }
    void linkedAudioHistory() {
        QFETCH(QString, scenario);
        const auto parsed = nt::parseTimelineJson(R"({"fps":30,"width":640,"height":360,
            "tracks":[{"id":"v","type":"video","index":0}],"clips":[]})");
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(*parsed.timeline);
        const auto before = model.timeline().raw;
        AssetBrowser browser;
        browser.setTimeline(&model);
        browser.m_target = nt::server::SaveTarget{};
        QThread occupiedWorker;
        browser.m_thread = &occupiedWorker;
        QVERIFY(browser.drop({{"id", "video"}, {"name", "take.mp4"},
            {"content_type", "video/mp4"}, {"duration", 2}}, "v", 0, "overlap", 0));
        // Run the queued completion deterministically without a server or decoder.
        QVERIFY(!browser.m_requests.empty());
        auto completion = std::move(browser.m_requests.back().done);
        browser.m_requests.clear();
        browser.m_thread.clear();
        browser.m_target.reset();
        QVERIFY(completion);
        const bool later = scenario.startsWith("later");
        if (later) { model.addMarker(500, "Later edit"); }
        if (scenario == "undone" || scenario == "later-undone") { model.undoStack()->undo(); }
        if (scenario == "deleted") { model.replaceClips({}); }
        const auto atSettlement = model.timeline().raw;
        AssetBrowser::Result result;
        result.settlement = {{"outcome", scenario == "silent" ? "silent" : "audio"},
            {"asset", QJsonObject{{"id", "extracted-wav"}, {"duration", 1.5}}}};
        completion(result);
        if (scenario == "deleted") {
            QCOMPARE(model.clipsJson().size(), 0);
            return;
        }
        if (scenario == "undone") { QCOMPARE(model.timeline().raw, atSettlement); }
        if (!later) {
            if (scenario != "undone") { model.undoStack()->undo(); }
            QCOMPARE(model.timeline().raw, before);
            model.undoStack()->redo();
        } else {
            QCOMPARE(model.timeline().raw.value("markers"), atSettlement.value("markers"));
        }
        const auto clips = model.clipsJson();
        if (scenario == "silent") {
            QCOMPARE(clips.size(), 1);
            QVERIFY(!clips.first().toObject().contains("linkId"));
            QCOMPARE(model.timeline().raw.value("tracks").toArray().size(), 1);
        } else {
            const auto audio = clips.last().toObject();
            QCOMPARE(audio.value("status").toString(), QString("generated"));
            QCOMPARE(audio.value("currentAssetId").toString(), QString("extracted-wav"));
        }
        QCOMPARE(model.undoStack()->count(), later ? 2 : 1);
    }
    void queuedImportsKeepDestination_data() {
        QTest::addColumn<QString>("folder");
        QTest::addColumn<QString>("project");
        QTest::addColumn<QString>("nextFolder");
        QTest::addColumn<QString>("nextProject");
        QTest::newRow("folder-navigation") << QString("A") << QString("project-A") << QString("B") << QString("project-A");
        QTest::newRow("project-switch") << QString("A") << QString("project-A") << QString("A") << QString("project-B");
        QTest::newRow("home-to-folder-and-project") << QString() << QString() << QString("B") << QString("project-B");
    }
    void queuedImportsKeepDestination() {
        QFETCH(QString, folder);
        QFETCH(QString, project);
        QFETCH(QString, nextFolder);
        QFETCH(QString, nextProject);
        TimelineModel original;
        TimelineModel replacement;
        const auto document = [](const QString& projectId) {
            return QJsonDocument(QJsonObject{{"fps", 30}, {"width", 640}, {"height", 360},
                {"durationMs", 1000}, {"projectId", projectId}, {"tracks", QJsonArray{}}, {"clips", QJsonArray{}}}).toJson();
        };
        auto first = nt::parseTimelineJson(document(project));
        auto second = nt::parseTimelineJson(document(nextProject));
        QVERIFY(first.timeline);
        QVERIFY(second.timeline);
        original.setTimeline(std::move(*first.timeline));
        replacement.setTimeline(std::move(*second.timeline));
        QThread occupiedWorker; // Hold uploads in the queue without starting a server or thread.
        AssetBrowser browser;
        browser.m_target = nt::server::SaveTarget{};
        browser.m_thread = &occupiedWorker;
        browser.setTimeline(&original);
        browser.setFolderId(folder);
        browser.importFiles({QUrl::fromLocalFile("/first.wav"), QUrl::fromLocalFile("/second.wav")});
        const auto firstUpload = browser.takeNextImport();
        QCOMPARE(firstUpload.file, QString("/first.wav"));
        QCOMPARE(firstUpload.folder, folder);
        QCOMPARE(firstUpload.fields.value("parent_id").toString(), folder);
        QCOMPARE(firstUpload.fields.value("project_id").toString(), project);
        browser.setFolderId(nextFolder);
        browser.setTimeline(&replacement);
        const auto secondUpload = browser.takeNextImport();
        QCOMPARE(secondUpload.file, QString("/second.wav"));
        QCOMPARE(secondUpload.folder, folder);
        QCOMPARE(secondUpload.fields, firstUpload.fields);
        QCOMPARE(secondUpload.fields.contains("parent_id"), !folder.isEmpty());
        QCOMPARE(secondUpload.fields.contains("project_id"), !project.isEmpty());
        browser.m_thread.clear();
    }
    void foldersOpenWithKeyboardAndMouse() {
        AssetBrowser browser;
        QVERIFY2(browser.property("folderId").isValid(), "AssetBrowser must expose current folderId");
        QQmlEngine engine;
        QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/assets/AssetItem.qml"));
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> object(component.createWithInitialProperties({
            {"asset", QVariantMap{{"id", "footage"}, {"name", "Footage"}, {"content_type", "folder"}}},
            {"browser", QVariant::fromValue(&browser)}, {"width", 84}, {"height", 84}}));
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* tile = qobject_cast<QQuickItem*>(object.get());
        QVERIFY(tile);
        QQuickWindow window;
        window.resize(120, 120);
        tile->setParentItem(window.contentItem());
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        tile->forceActiveFocus();
        QTest::keyClick(&window, Qt::Key_Return);
        QCOMPARE(browser.property("folderId").toString(), QString("footage"));
        QVERIFY(QMetaObject::invokeMethod(&browser, "openFolder", Q_ARG(QString, "nested")));
        QCOMPARE(browser.property("folderId").toString(), QString("nested"));
        QVERIFY(QMetaObject::invokeMethod(&browser, "goUp"));
        QCOMPARE(browser.property("folderId").toString(), QString("footage"));
        QVERIFY(QMetaObject::invokeMethod(&browser, "goUp"));
        QCOMPARE(browser.property("folderId").toString(), QString());
        QTest::mouseDClick(&window, Qt::LeftButton, {}, QPoint(40, 40));
        QCOMPARE(browser.property("folderId").toString(), QString("footage"));
        TimelineModel model;
        browser.setTimeline(&model);
        QVERIFY(!browser.drop({{"id", "footage"}, {"content_type", "folder"}}, "", 0, "overlap", 0));
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void noServer() {
        AssetBrowser browser;
        QVERIFY(!browser.configured());
        QVERIFY(!browser.busy());
        QVERIFY(browser.assets().isEmpty());
        browser.importFiles({QUrl::fromLocalFile("/missing.mp4")});
        QVERIFY(!browser.busy());
    }
    void panelAndLaneDrop() {
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(R"({"fps":30,"width":640,"height":360,"durationMs":20000,
            "tracks":[{"id":"v","name":"Video","type":"video","index":0}],"clips":[]})");
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        PlaybackClock clock;
        QQmlEngine engine;
        QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/TimelineEditor.qml"));
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> editor(component.createWithInitialProperties({
            {"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)},
            {"width", 1400}, {"height", 900}}));
        QVERIFY2(editor, qPrintable(component.errorString()));
        auto* root = qobject_cast<QQuickItem*>(editor.get());
        QVERIFY(root);
        QQuickWindow window;
        window.resize(1400, 900);
        root->setParentItem(window.contentItem());
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        auto* dockStore = root->findChild<QObject*>("dockLayoutStore");
        QVERIFY(dockStore);
        QVERIFY(QMetaObject::invokeMethod(dockStore, "dispatch", Q_ARG(QVariantMap,
            (QVariantMap{{"type", "reveal"}, {"panelId", "assets"}}))));
        QTRY_VERIFY(itemNamed(root, "assetExplorer"));
        QTRY_VERIFY(itemNamed(root, "assetDropOverlay"));
        QTRY_VERIFY(itemNamed(root, "timelineScriptPanel"));
        QTRY_VERIFY(itemNamed(root, "timelineStoryboardPanel"));
        auto* story = itemNamed(root, "timelineScriptPanel");
        QVERIFY(itemNamed(story, "storyWorkspaceEditor"));
        for (auto* child : story->findChildren<QObject*>()) {
            const auto text = child->property("text").toString();
            QVERIFY(text != "Production" && text != "Workspace");
        }
        auto* panel = itemNamed(root, "assetExplorer");
        auto* overlay = itemNamed(root, "assetDropOverlay");
        QTRY_VERIFY(panel->property("timeline").value<QObject*>() == &model);
        QTRY_VERIFY(overlay->property("region").value<QObject*>());
        QVERIFY(panel->width() > 0);
        QVERIFY(panel->height() > 0);
        QVERIFY(itemNamed(root, "assetImportButton"));
        QVERIFY(!itemNamed(root, "assetImportButton")->isEnabled());
        QVariant applied;
        const QVariant asset = QVariantMap{{"id", "picture"}, {"name", "still.png"}, {"content_type", "image/png"}};
        QVERIFY(QMetaObject::invokeMethod(overlay, "dropAt", Q_RETURN_ARG(QVariant, applied),
            Q_ARG(QVariant, asset), Q_ARG(QVariant, 30), Q_ARG(QVariant, 20)));
        QVERIFY2(applied.toBool(), "asset overlay must resolve the lane without shared-file changes");
        QCOMPARE(model.clipCount(), 1);
        QCOMPARE(model.clipsJson().first().toObject().value("trackId").toString(), QString("v"));
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo();
        QCOMPARE(model.clipCount(), 0);
    }
    void libraryDragToTimeline_data() {
        QTest::addColumn<bool>("newTrack");
        QTest::addColumn<bool>("locked");
        QTest::addColumn<bool>("resizeDock");
        QTest::addColumn<int>("trackCount");
        QTest::newRow("existing-track") << false << false << false << 1;
        QTest::newRow("new-track") << true << false << false << 1;
        QTest::newRow("empty-timeline") << true << false << false << 0;
        QTest::newRow("locked-track") << false << true << false << 1;
        QTest::newRow("resized-timeline-dock") << false << false << true << 1;
        QTest::newRow("resized-new-track") << true << false << true << 1;
        QTest::newRow("new-track-in-full-viewport") << true << false << false << 12;
    }
    void libraryDragToTimeline() {
        QFETCH(bool, newTrack);
        QFETCH(bool, locked);
        QFETCH(bool, resizeDock);
        QFETCH(int, trackCount);
        QTemporaryDir preferences;
        const auto oldPreferences = qgetenv("NODETOOL_TIMELINE_PREFERENCES");
        qputenv("NODETOOL_TIMELINE_PREFERENCES", (preferences.path() + "/settings.ini").toUtf8());
        const auto restorePreferences = qScopeGuard([oldPreferences] {
            if (oldPreferences.isNull()) { qunsetenv("NODETOOL_TIMELINE_PREFERENCES"); }
            else { qputenv("NODETOOL_TIMELINE_PREFERENCES", oldPreferences); }
        });
        TimelineModel model;
        QJsonObject document{{"fps", 30}, {"width", 640}, {"height", 360}, {"durationMs", 20000},
            {"clips", QJsonArray{}}};
        QJsonArray tracks;
        for (int i = 0; i < trackCount; ++i) {
            tracks.append(QJsonObject{{"id", i == 0 ? QString("v") : QString("v%1").arg(i)},
                {"name", "Video"}, {"type", "video"}, {"index", i}, {"locked", locked}});
        }
        document.insert("tracks", tracks);
        auto parsed = nt::parseTimelineJson(QJsonDocument(document).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        const auto before = model.documentJson();
        const auto undoCount = model.undoStack()->count();
        PlaybackClock clock;
        QQmlEngine engine;
        QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/TimelineEditor.qml"));
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> editor(component.createWithInitialProperties({
            {"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)},
            {"width", 1400}, {"height", 900}}));
        QVERIFY2(editor, qPrintable(component.errorString()));
        auto* root = qobject_cast<QQuickItem*>(editor.get());
        QVERIFY(root);
        QQuickWindow window;
        window.resize(1400, 900);
        root->setParentItem(window.contentItem());
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        auto* dockStore = root->findChild<QObject*>("dockLayoutStore");
        QVERIFY(dockStore);
        QVERIFY(QMetaObject::invokeMethod(dockStore, "dispatch", Q_ARG(QVariantMap,
            (QVariantMap{{"type", "reveal"}, {"panelId", "assets"}}))));
        QTRY_VERIFY(itemNamed(root, "assetExplorer"));
        auto* explorer = itemNamed(root, "assetExplorer");
        auto* browser = explorer->findChild<AssetBrowser*>();
        QVERIFY(browser);
        browser->m_assets = QJsonArray{QJsonObject{{"id", "picture"}, {"name", "still.png"}, {"content_type", "image/png"}}};
        emit browser->assetsChanged();
        auto* grid = itemNamed(root, "libraryGrid");
        QVERIFY(grid);
        QTRY_VERIFY(grid->isVisible());
        QTRY_VERIFY(!grid->childItems().isEmpty());
        auto* lanes = itemNamed(root, "lanesViewport");
        QVERIFY(lanes);
        if (resizeDock) {
            auto* store = root->findChild<QObject*>("dockLayoutStore");
            QVERIFY(store);
            const auto oldTop = lanes->mapToScene(QPointF()).y();
            QVERIFY(QMetaObject::invokeMethod(store, "dispatch", Q_ARG(QVariantMap,
                (QVariantMap{{"type", "resize"}, {"region", "bottom"}, {"size", 450}}))));
            QTRY_VERIFY(lanes->mapToScene(QPointF()).y() < oldTop);
        }
        const auto from = grid->mapToScene(QPointF(40, 40)).toPoint();
        const auto to = lanes->mapToScene(QPointF(60, newTrack ? lanes->height() - 20 : 20)).toPoint();
        QVERIFY(window.contentItem()->contains(from));
        QVERIFY(window.contentItem()->contains(to));
        QTest::mousePress(&window, Qt::LeftButton, {}, from);
        for (int step = 1; step <= 30; ++step) {
            QTest::mouseMove(&window, from + (to - from) * step / 30, 10);
        }
        auto* preview = itemNamed(window.contentItem(), "assetDragPreview");
        QVERIFY(preview);
        QTRY_VERIFY(preview->isVisible());
        QVERIFY(preview->parentItem()->parentItem()->parentItem() == window.contentItem());
        QVERIFY(preview->x() >= 0);
        QVERIFY(preview->y() >= 0);
        QVERIFY(preview->x() + preview->width() <= window.width());
        QVERIFY(preview->y() + preview->height() <= window.height());
        auto* source = itemNamed(root, "libraryAsset_picture");
        QVERIFY(source);
        QTRY_COMPARE(source->property("dropAllowed").toBool(), !locked);
        auto* pointer = source->findChild<QObject*>("assetDragPointer");
        QVERIFY(pointer);
        QCOMPARE(pointer->property("cursorShape").toInt(), int(locked ? Qt::ForbiddenCursor : Qt::DragCopyCursor));
        QTRY_COMPARE(window.cursor().shape(), locked ? Qt::ForbiddenCursor : Qt::DragCopyCursor);
        QTest::mouseRelease(&window, Qt::LeftButton, {}, to);
        QTRY_VERIFY(!itemNamed(window.contentItem(), "assetDragPreview"));
        if (locked) {
            QCOMPARE(model.documentJson(), before);
            QCOMPARE(model.undoStack()->count(), undoCount);
            QVERIFY(browser->error().contains("locked"));
            return;
        }
        QTRY_COMPARE(model.clipCount(), 1);
        QCOMPARE(model.tracks()->rowCount(), trackCount + (newTrack ? 1 : 0));
        const auto clip = model.clipsJson().first().toObject();
        QCOMPARE(clip.value("currentAssetId").toString(), QString("picture"));
        QCOMPARE(clip.value("trackId").toString() == "v", !newTrack);
        QCOMPARE(model.undoStack()->count(), undoCount + 1);
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
        model.undoStack()->redo();
        QCOMPARE(model.clipCount(), 1);
    }
    void thumbnailRequestsUseAssetMetadata_data() {
        QTest::addColumn<bool>("hasThumbnail");
        QTest::newRow("thumbnail") << true;
        QTest::newRow("image-fallback") << false;
    }
    void thumbnailRequestsUseAssetMetadata() {
        QFETCH(bool, hasThumbnail);
        TestHttpServer http;
        const QString id = "123456789abc123456789abc12345678";
        int reads = 0;
        QString requested;
        http.setJson([&](const QByteArray&, const QUrl& url) {
            ++reads;
            const auto input = QJsonDocument::fromJson(QUrlQuery(url).queryItemValue("input", QUrl::FullyDecoded).toUtf8()).object();
            requested = input.value("id").toString();
            QJsonObject asset{{"id", id}, {"content_type", "image/png"}, {"get_url", "/original.png"}};
            if (hasThumbnail) { asset.insert("thumb_url", "/thumbnail.png?revision=one"); }
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", asset}}}}).toJson();
        });
        TimelineModel timeline;
        AssetBrowser browser;
        browser.setTimeline(&timeline);
        browser.m_target = nt::server::SaveTarget{http.base(), {}, {}, {}, {}};
        const auto before = timeline.documentJson();
        browser.requestThumbnail(id);
        browser.requestThumbnail(id);
        QTRY_VERIFY(!browser.busy());
        QCOMPARE(reads, 1);
        QCOMPARE(requested, id);
        QCOMPARE(browser.thumbnails().value(id).toString(), http.base().resolved(QUrl(hasThumbnail ? "/thumbnail.png?revision=one" : "/original.png")).toString());
        QVERIFY(browser.assets().isEmpty());
        QCOMPARE(timeline.documentJson(), before);
        timeline.setTimeline(nt::Timeline{});
        QVERIFY(browser.thumbnails().isEmpty());
    }
    void folderDragMovesAsset_data() {
        QTest::addColumn<bool>("alreadyInFolder");
        QTest::newRow("move-into-folder") << false;
        QTest::newRow("already-in-folder") << true;
    }
    void folderDragMovesAsset() {
        QFETCH(bool, alreadyInFolder);
        TestHttpServer http;
        const QString assetId = "11111111111111111111111111111111";
        const QString folderId = "22222222222222222222222222222222";
        QJsonObject asset{{"id", assetId}, {"name", "Still"}, {"content_type", "image/png"},
            {"parent_id", alreadyInFolder ? folderId : QString("owner")}, {"user_id", "owner"}};
        const QJsonObject folder{{"id", folderId}, {"name", "References"}, {"content_type", "folder"},
            {"parent_id", "owner"}, {"user_id", "owner"}};
        QList<QJsonObject> writes;
        http.setJson([&](const QByteArray& path, const QUrl&) {
            const QJsonValue data = path == "/trpc/assets.get" ? QJsonValue(asset)
                : QJsonValue(QJsonObject{{"assets", QJsonArray{asset, folder}}, {"next_cursor", QJsonValue::Null}});
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", data}}}}).toJson();
        });
        http.setPost([&](const QByteArray& path, const QByteArray& bytes) {
            if (path == "/trpc/assets.update") {
                const auto input = QJsonDocument::fromJson(bytes).object();
                writes.append(input);
                asset.insert("parent_id", input.value("parent_id"));
            }
            return QByteArray(R"({"result":{"data":{}}})");
        });
        TimelineModel timeline;
        AssetBrowser browser;
        browser.setTimeline(&timeline);
        browser.m_target = nt::server::SaveTarget{http.base(), {}, {}, {}, {}};
        browser.m_assets = QJsonArray{asset, folder};
        const auto before = timeline.documentJson();
        QQmlEngine engine;
        QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/assets/AssetGrid.qml"));
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> object(component.createWithInitialProperties({
            {"browser", QVariant::fromValue(&browser)}, {"width", 400}, {"height", 180}}));
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* root = qobject_cast<QQuickItem*>(object.get());
        QVERIFY(root);
        QQuickWindow window;
        window.resize(400, 180);
        root->setParentItem(window.contentItem());
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        QTRY_VERIFY(itemNamed(root, "libraryAsset_" + assetId));
        auto* source = itemNamed(root, "libraryAsset_" + assetId);
        auto* target = itemNamed(root, "libraryAsset_" + folderId);
        QVERIFY(target);
        const auto from = source->mapToScene(QPointF(source->width() / 2, source->height() / 2)).toPoint();
        const auto to = target->mapToScene(QPointF(target->width() / 2, target->height() / 2)).toPoint();
        QTest::mousePress(&window, Qt::LeftButton, {}, from);
        for (int step = 1; step <= 15; ++step) {
            QTest::mouseMove(&window, from + (to - from) * step / 15, 10);
        }
        QTRY_COMPARE(source->property("dropAllowed").toBool(), !alreadyInFolder);
        QCOMPARE(target->property("folderDropActive").toBool(), !alreadyInFolder);
        QTRY_COMPARE(window.cursor().shape(), alreadyInFolder ? Qt::ForbiddenCursor : Qt::DragMoveCursor);
        QTest::mouseRelease(&window, Qt::LeftButton, {}, to);
        if (!alreadyInFolder) {
            QTRY_COMPARE(writes.size(), 1);
            QCOMPARE(writes.first().value("id").toString(), assetId);
            QCOMPARE(writes.first().value("parent_id").toString(), folderId);
            QTRY_VERIFY(!browser.busy());
            QTRY_COMPARE(browser.assets().size(), 1);
        } else {
            QCOMPARE(writes.size(), 0);
        }
        QCOMPARE(timeline.documentJson(), before);
        QCOMPARE(timeline.undoStack()->count(), 0);
        QVERIFY(!itemNamed(window.contentItem(), "assetDragPreview"));
    }
    void tileDragCarriesSingleAsset_data() {
        QTest::addColumn<bool>("folder");
        QTest::newRow("media") << false;
        QTest::newRow("folder") << true;
    }
    void tileDragCarriesSingleAsset() {
        QFETCH(bool, folder);
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
Item {
    id: root
    width: 400; height: 120
    property bool dropped: false
    property string contentType: "video/mp4"
    property string thumbnail: ""
    AssetBrowser { id: browser }
    AssetItem {
        width: 84; height: 84
        browser: browser
        asset: ({id: "asset", name: "take.mp4", content_type: root.contentType, thumb_url: root.thumbnail})
    }
    DropArea {
        x: 200; width: 150; height: 120
        keys: ["application/x-nodetool-asset"]
        onDropped: event => {
            root.dropped = event.source.asset.id === "asset"
            event.acceptProposedAction()
        }
    }
})", QUrl());
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        QQuickWindow window;
        window.resize(400, 120);
        std::unique_ptr<QObject> object(component.create());
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* root = qobject_cast<QQuickItem*>(object.get());
        QVERIFY(root);
        if (folder) { root->setProperty("contentType", "folder"); }
        auto* browser = root->findChild<AssetBrowser*>();
        QVERIFY(browser);
        browser->m_target = nt::server::SaveTarget{QUrl("http://127.0.0.1:1"), {}, {}, {}, {}};
        QImage thumbnail(64, 40, QImage::Format_RGB32);
        thumbnail.fill(QColor("#406080"));
        QByteArray png;
        QBuffer buffer(&png);
        QVERIFY(buffer.open(QIODevice::WriteOnly));
        QVERIFY(thumbnail.save(&buffer, "PNG"));
        root->setProperty("thumbnail", "data:image/png;base64," + png.toBase64());
        root->setParentItem(window.contentItem());
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        QTest::mousePress(&window, Qt::LeftButton, {}, QPoint(40, 40));
        for (int x = 50; x <= 250; x += 10) { QTest::mouseMove(&window, QPoint(x, 40)); }
        auto* preview = itemNamed(window.contentItem(), "assetDragPreview");
        QCOMPARE(preview != nullptr, !folder);
        if (!folder) {
            QVERIFY(preview->isVisible());
            auto* image = itemNamed(preview, "assetDragImage");
            QVERIFY(image);
            QTRY_COMPARE(image->property("status").toInt(), 1);
            auto* status = itemNamed(preview, "assetDragStatus");
            QVERIFY(status);
            QTRY_COMPARE(status->property("status").toInt(), 1);
            const auto capture = qEnvironmentVariable("NODETOOL_ASSET_DRAG_CAPTURE");
            if (!capture.isEmpty()) { QVERIFY(window.grabWindow().save(capture)); }
        }
        QTest::mouseRelease(&window, Qt::LeftButton, {}, QPoint(250, 40));
        QTRY_VERIFY(!itemNamed(window.contentItem(), "assetDragPreview"));
        if (folder) { QVERIFY2(!root->property("dropped").toBool(), "folders must not start timeline drags"); }
        else { QTRY_VERIFY2(root->property("dropped").toBool(), "dragging an asset tile must deliver its asset to the lane drop key"); }
    }
    void libraryPanelFlow() {
        TestHttpServer http;
        QVERIFY(http.base().port() != 7777);
        QTemporaryDir cache;
        QImage image(64, 32, QImage::Format_RGB32);
        image.fill(QColor("#406080"));
        QByteArray png;
        QBuffer buffer(&png);
        QVERIFY(buffer.open(QIODevice::WriteOnly));
        QVERIFY(image.save(&buffer, "PNG"));
        http.setFile("/library.png", ServedFile(png));
        const QString pictureId = "11111111111111111111111111111111";
        const QString folderId = "22222222222222222222222222222222";
        const QString createdId = "33333333333333333333333333333333";
        QJsonObject picture{{"id", pictureId}, {"user_id", "library-user"}, {"parent_id", "library-user"},
            {"name", "Reference image"}, {"content_type", "image/png"}, {"size", png.size()},
            {"get_url", "/library.png"}, {"favorite", false},
            {"metadata", QJsonObject{{"tags", QJsonArray{"old"}}, {"description", "Keep this"}, {"width", 64}, {"height", 32}}}};
        QJsonArray rows{picture, QJsonObject{{"id", folderId}, {"user_id", "library-user"},
            {"parent_id", "library-user"}, {"name", "Footage"}, {"content_type", "folder"}}};
        bool failTagOnce = true;
        int tagWrites = 0;
        http.setJson([&](const QByteArray& path, const QUrl& url) {
            QJsonValue result;
            if (path == "/trpc/assets.search") {
                result = QJsonObject{{"assets", rows}, {"next_cursor", QJsonValue::Null}};
            } else if (path == "/trpc/assets.get") {
                const auto input = QJsonDocument::fromJson(QUrlQuery(url).queryItemValue("input", QUrl::FullyDecoded).toUtf8()).object();
                for (const auto& row : rows) {
                    if (row.toObject().value("id") == input.value("id")) { result = row; break; }
                }
            }
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", result}}}}).toJson();
        });
        http.setPost([&](const QByteArray& path, const QByteArray& bytes) {
            const auto input = QJsonDocument::fromJson(bytes).object();
            if (path == "/api/assets") {
                auto folder = input;
                folder.insert("id", createdId); folder.insert("user_id", "library-user");
                folder.insert("parent_id", "library-user"); rows.append(folder);
                return QJsonDocument(folder).toJson();
            }
            if (path == "/trpc/assets.update") {
                if (input.contains("metadata")) {
                    ++tagWrites;
                    if (failTagOnce) {
                        failTagOnce = false;
                        return QByteArray(R"({"error":{"message":"Tag write failed","data":{"code":"INTERNAL_SERVER_ERROR"}}})");
                    }
                }
                for (qsizetype i = 0; i < rows.size(); ++i) {
                    auto row = rows[i].toObject();
                    if (row.value("id") != input.value("id")) { continue; }
                    for (const auto& key : {"name", "favorite", "metadata", "parent_id"}) {
                        if (input.contains(key)) { row.insert(key, input.value(key)); }
                    }
                    rows[i] = row;
                    return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", row}}}}).toJson();
                }
            }
            return QByteArray(R"({"result":{"data":{}}})");
        });
        QProcess child;
        child.setProcessChannelMode(QProcess::MergedChannels);
        child.start(QCoreApplication::applicationFilePath(), {"--probe-library", "--server", http.base().toString(),
            "--timeline", "library-test", "--cache-dir", cache.path()});
        QTRY_COMPARE_WITH_TIMEOUT(child.state(), QProcess::NotRunning, 60000);
        const auto output = child.readAll();
        QVERIFY2(child.exitStatus() == QProcess::NormalExit && child.exitCode() == 0, output.constData());
        QCOMPARE(tagWrites, 2);
        const auto saved = rows.first().toObject();
        QCOMPARE(saved.value("name").toString(), QString("renamed image"));
        QVERIFY(saved.value("favorite").toBool());
        QCOMPARE(saved.value("metadata").toObject().value("tags").toArray(), QJsonArray({"hero", "reference"}));
        QCOMPARE(saved.value("metadata").toObject().value("description").toString(), QString("Keep this"));
        QCOMPARE(rows.size(), 3);
        QCOMPARE(rows.last().toObject().value("name").toString(), QString("references"));
    }
    void libraryPanelServerSession() {
        if (!qApp->property("libraryProbe").toBool()) { QSKIP("Driven by the isolated libraryPanelFlow subprocess"); }
        TimelineModel cut;
        auto parsed = nt::parseTimelineJson(R"({"fps":30,"width":320,"height":180,"durationMs":4000,"tracks":[],"clips":[]})");
        QVERIFY(parsed.timeline);
        cut.setTimeline(std::move(*parsed.timeline));
        const auto before = cut.documentJson();
        const auto generation = cut.documentGeneration();
        QQmlEngine engine;
        QQmlComponent component(&engine, QUrl::fromLocalFile(QFINDTESTDATA("../../qml/assets/AssetExplorer.qml")));
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> object(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&cut)}, {"width", 320}, {"height", 640}}));
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* panel = qobject_cast<QQuickItem*>(object.get());
        QVERIFY(panel);
        QQuickWindow window;
        window.resize(320, 640);
        panel->setParentItem(window.contentItem());
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        auto* browser = panel->findChild<AssetBrowser*>();
        QVERIFY(browser);
        QTRY_VERIFY(!browser->busy() && browser->assets().size() == 2);
        const QString pictureId = "11111111111111111111111111111111";
        panel->setProperty("selectedId", pictureId);
        auto* tags = panel->findChild<QObject*>("libraryTagEditor");
        QVERIFY(tags);
        QTRY_COMPARE(panel->property("selectedId").toString(), pictureId);
        QTRY_COMPARE(tags->property("text").toString(), QString("old"));
        qobject_cast<QQuickItem*>(tags)->forceActiveFocus();
        QTest::keyClick(&window, Qt::Key_A, Qt::ControlModifier);
        for (const QChar letter : QStringLiteral("hero, reference")) {
            QTest::keyClick(&window, static_cast<Qt::Key>(letter.toUpper().unicode()),
                letter.isUpper() ? Qt::ShiftModifier : Qt::NoModifier);
        }
        auto* save = panel->findChild<QObject*>("librarySaveTags");
        QVERIFY(save);
        qobject_cast<QQuickItem*>(save)->forceActiveFocus(); QTest::keyClick(&window, Qt::Key_Space);
        QTRY_VERIFY(!browser->busy() && browser->error().contains("Tag write failed"));
        QCOMPARE(tags->property("text").toString(), QString("hero, reference"));
        qobject_cast<QQuickItem*>(save)->forceActiveFocus(); QTest::keyClick(&window, Qt::Key_Space);
        QTRY_VERIFY(!browser->busy() && browser->error().isEmpty());
        QTRY_COMPARE(browser->assets().first().toMap().value("metadata").toMap().value("tags").toStringList(), QStringList({"hero", "reference"}));
        QVERIFY(QMetaObject::invokeMethod(panel, "renameSelected"));
        auto* dialog = panel->findChild<QObject*>("libraryActionDialog");
        auto* input = panel->findChild<QObject*>("libraryActionInput");
        QVERIFY(dialog && input);
        QTRY_VERIFY(dialog->property("opened").toBool());
        qobject_cast<QQuickItem*>(input)->forceActiveFocus();
        QTest::keyClick(&window, Qt::Key_A, Qt::ControlModifier);
        for (const QChar letter : QStringLiteral("renamed image")) {
            QTest::keyClick(&window, static_cast<Qt::Key>(letter.toUpper().unicode()),
                letter.isUpper() ? Qt::ShiftModifier : Qt::NoModifier);
        }
        QTest::keyClick(&window, Qt::Key_Return);
        QTRY_VERIFY(!browser->busy() && browser->assets().first().toMap().value("name").toString() == "renamed image");
        auto* favorite = panel->findChild<QObject*>("libraryFavorite");
        QVERIFY(favorite);
        qobject_cast<QQuickItem*>(favorite)->forceActiveFocus(); QTest::keyClick(&window, Qt::Key_Space);
        QTRY_VERIFY(!browser->busy() && browser->assets().first().toMap().value("favorite").toBool());
        auto* create = panel->findChild<QObject*>("libraryCreateFolder");
        QVERIFY(create);
        qobject_cast<QQuickItem*>(create)->forceActiveFocus(); QTest::keyClick(&window, Qt::Key_Space);
        QTRY_VERIFY(dialog->property("opened").toBool());
        qobject_cast<QQuickItem*>(input)->forceActiveFocus();
        QTest::keyClick(&window, Qt::Key_A, Qt::ControlModifier);
        for (const QChar letter : QStringLiteral("references")) {
            QTest::keyClick(&window, static_cast<Qt::Key>(letter.toUpper().unicode()),
                letter.isUpper() ? Qt::ShiftModifier : Qt::NoModifier);
        }
        QTest::keyClick(&window, Qt::Key_Return);
        QTRY_VERIFY(!browser->busy() && browser->assets().size() == 3);
        QVERIFY(QMetaObject::invokeMethod(panel, "navigateFolder", Q_ARG(QVariant, QString("33333333333333333333333333333333"))));
        QTRY_VERIFY(!browser->busy() && browser->assets().isEmpty());
        QVERIFY(QMetaObject::invokeMethod(panel, "navigateFolder", Q_ARG(QVariant, QString())));
        QTRY_VERIFY(!browser->busy() && browser->assets().size() == 3);
        panel->setProperty("selectedId", pictureId);
        const auto asset = browser->assets().first().toMap();
        QVERIFY(QMetaObject::invokeMethod(panel, "showPreview", Q_ARG(QVariant, asset)));
        auto* review = panel->findChild<CandidatePreview*>("libraryPreviewService");
        QVERIFY(review);
        QTRY_VERIFY_WITH_TIMEOUT(review->ready() || !review->error().isEmpty(), 15000);
        QVERIFY2(review->ready(), qPrintable(review->error()));
        QCOMPARE(review->previewTimeline()->timeline().width, 64);
        QCOMPARE(review->previewTimeline()->timeline().height, 32);
        QCOMPARE(review->audioMode(), QString("none"));
        auto* audioChoice = panel->findChild<QObject*>("libraryPreviewAudio");
        QVERIFY(audioChoice);
        QVERIFY(!audioChoice->property("visible").toBool());
        auto* preview = panel->findChild<QObject*>("assetPreview");
        QVERIFY(preview);
        QVERIFY(QMetaObject::invokeMethod(preview, "closePreview"));
        QVERIFY(!review->ready());
        auto* gallery = panel->findChild<QObject*>("assetGallery");
        QVERIFY(gallery);
        QVERIFY(QMetaObject::invokeMethod(gallery, "openAsset", Q_ARG(QVariant, asset)));
        QTRY_VERIFY(gallery->property("opened").toBool());
        QCOMPARE(gallery->property("index").toInt(), 0);
        const int galleryCount = gallery->property("items").toList().size();
        QVERIFY(galleryCount > 0);
        QVERIFY(QMetaObject::invokeMethod(gallery, "step", Q_ARG(QVariant, 1)));
        QCOMPARE(gallery->property("index").toInt(), qMin(1, galleryCount - 1));
        QVERIFY(QMetaObject::invokeMethod(gallery, "wheelStep", Q_ARG(QVariant, 60)));
        QCOMPARE(gallery->property("index").toInt(), qMin(1, galleryCount - 1));
        QVERIFY(QMetaObject::invokeMethod(gallery, "wheelStep", Q_ARG(QVariant, 60)));
        QCOMPARE(gallery->property("index").toInt(), 0);
        QVERIFY(QMetaObject::invokeMethod(gallery, "close"));
        QTRY_COMPARE(gallery->property("index").toInt(), -1);
        QCOMPARE(cut.documentJson(), before);
        QCOMPARE(cut.documentGeneration(), generation);
        QCOMPARE(cut.undoStack()->count(), 0);
        const auto capture = qEnvironmentVariable("NT_LIBRARY_CAPTURE");
        if (!capture.isEmpty()) {
            QTest::qWait(100);
            QVERIFY(window.grabWindow().save(capture));
        }
    }

    void libraryOffersEntityActions() {
        QQmlEngine engine;
        // A stand-in for the editor, which is what the Library menu hands an image to.
        QQmlComponent hostComponent(&engine);
        hostComponent.setData("import QtQuick\nItem { property var timeline: null; property var clock: ({}); property var calls: []\n"
            "function openEntityEditor(id, existing) { calls = calls.concat([[id, existing]]) } }", QUrl());
        std::unique_ptr<QObject> hostObject(hostComponent.create());
        QVERIFY2(hostObject, qPrintable(hostComponent.errorString()));
        auto* host = qobject_cast<QQuickItem*>(hostObject.get());
        QQmlComponent component(&engine, QUrl::fromLocalFile(QFINDTESTDATA("../../qml/assets/AssetExplorer.qml")));
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> object(component.createWithInitialProperties({{"width", 320}, {"height", 640}}));
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* explorer = qobject_cast<QQuickItem*>(object.get());
        explorer->setParentItem(host);
        QQuickWindow window;
        window.resize(480, 640);
        host->setSize(QSizeF(480, 640));
        host->setParentItem(window.contentItem());
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        auto* browser = explorer->findChild<AssetBrowser*>();
        QVERIFY(browser);
        QTest::qWait(100);
        const QJsonObject entity{{"kind", "character"}, {"name", "Mara"}, {"descriptor", "A captain."}};
        browser->m_assets = QJsonArray{
            QJsonObject{{"id", "plain"}, {"name", "Plain image"}, {"content_type", "image/png"}},
            QJsonObject{{"id", "tagged"}, {"name", "Mara"}, {"content_type", "image/png"}, {"metadata", QJsonObject{{"nodetool_entity", entity}}}},
            QJsonObject{{"id", "broken"}, {"name", "Odd tag"}, {"content_type", "image/png"}, {"metadata", QJsonObject{{"nodetool_entity", QJsonObject{{"kind", "monster"}}}}}},
            QJsonObject{{"id", "sound"}, {"name", "Voice"}, {"content_type", "audio/wav"}}};
        emit browser->assetsChanged();
        auto* item = explorer->findChild<QObject*>("libraryEntityAction");
        QVERIFY(item);
        auto select = [&](const char* id) {
            explorer->setProperty("selectedId", QString::fromLatin1(id));
            QTRY_COMPARE(explorer->property("selectedId").toString(), QString::fromLatin1(id));
        };
        select("plain");
        QCOMPARE(item->property("text").toString(), QString("Use as entity…"));
        QVERIFY(item->property("enabled").toBool());
        select("tagged");
        QCOMPARE(item->property("text").toString(), QString("Edit entity…"));
        QVERIFY(item->property("enabled").toBool());
        select("broken");
        QCOMPARE(item->property("text").toString(), QString("Use as entity…"));
        select("sound");
        QCOMPARE(item->property("text").toString(), QString("Use as entity…"));
        QVERIFY(!item->property("enabled").toBool());
        select("plain");
        QVERIFY(QMetaObject::invokeMethod(item, "triggered"));
        select("tagged");
        QVERIFY(QMetaObject::invokeMethod(item, "triggered"));
        // The editor opens after the menu has had its turn to close.
        QCOMPARE(host->property("calls").toList().size(), 0);
        QTRY_COMPARE(host->property("calls").toList().size(), 2);
        const auto calls = host->property("calls").toList();
        QCOMPARE(calls[0].toList(), QVariantList({"plain", false}));
        QCOMPARE(calls[1].toList(), QVariantList({"tagged", true}));
        const auto capture = qEnvironmentVariable("NT_ENTITY_CAPTURE_DIR");
        if (capture.isEmpty()) return;
        QDir().mkpath(capture);
        auto* theme = engine.singletonInstance<QObject*>("NodeTool.UiPrimitives", "Theme");
        QVERIFY(theme);
        auto* grid = explorer->findChild<QObject*>("libraryGrid");
        QVERIFY(grid);
        select("plain");
        for (const auto& [name, preference] : {std::pair{QString("dark"), 2}, std::pair{QString("light"), 3}}) {
            theme->setProperty("preference", preference);
            QVERIFY(QMetaObject::invokeMethod(grid, "actionsRequested", Q_ARG(QVariant, browser->assets().first())));
            QTest::qWait(300);
            QVERIFY(window.grabWindow().save(QDir(capture).filePath(name + "-library-menu-use-as-entity.png")));
            QTest::keyClick(&window, Qt::Key_Escape);
            QTest::qWait(100);
        }
        theme->setProperty("preference", 2);
    }
};
int main(int argc, char** argv) {
    const bool probeLibrary = argc > 1 && QByteArray(argv[1]) == "--probe-library";
    const bool probeDrop = argc > 1 && QByteArray(argv[1]) == "--probe-drop";
    const bool listFolder = argc > 1 && QByteArray(argv[1]) == "--list-folder";
    if (probeDrop || listFolder || probeLibrary) {
        const int status = nt::server::takeServerArgs(argc, argv);
        if (status != 0) { return status; }
    }
    QGuiApplication app(argc, argv);
    if (probeLibrary) {
        app.setProperty("libraryProbe", true);
        TestAssetBrowser test;
        return QTest::qExec(&test, QStringList{app.arguments().first(), "libraryPanelServerSession"});
    }
    if (listFolder) {
        const auto target = nt::server::serverSaveTarget();
        if (!target || target->server.port() == 7777) { return 2; }
        AssetBrowser browser;
        QEventLoop loop;
        QObject::connect(&browser, &AssetBrowser::stateChanged, &loop, [&] {
            if (!browser.busy()) { loop.quit(); }
        });
        QTimer::singleShot(60000, &loop, &QEventLoop::quit);
        browser.openFolder(app.arguments().value(2));
        if (browser.busy()) { loop.exec(); }
        const auto children = QJsonArray::fromVariantList(browser.assets());
        const auto folder = browser.folderId();
        browser.goUp();
        if (browser.busy()) { loop.exec(); }
        const QJsonObject report{{"folder", folder}, {"assets", children},
            {"home", browser.folderId()}, {"homeAssets", QJsonArray::fromVariantList(browser.assets())}};
        std::printf("%s\n", QJsonDocument(report).toJson(QJsonDocument::Compact).constData());
        return browser.busy() || !browser.error().isEmpty() ? 1 : 0;
    }
    if (probeDrop) {
        const auto args = app.arguments();
        const auto asset = QJsonDocument::fromJson(args.value(2).toUtf8()).object();
        const auto target = nt::server::serverSaveTarget();
        if (!target || target->server.port() == 7777 || asset.isEmpty()) { return 2; }
        auto parsed = nt::parseTimelineJson(R"({"fps":30,"width":640,"height":360,"durationMs":30000,
            "tracks":[{"id":"v","name":"Video","type":"video","index":0}],
            "clips":[{"id":"existing","trackId":"v","mediaType":"video","startMs":0,"durationMs":20000}]})");
        if (!parsed.timeline) { return 2; }
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        AssetBrowser browser;
        browser.setTimeline(&model);
        const auto before = model.documentJson();
        const auto scenario = args.value(3);
        if (scenario == "queued") { browser.refresh(); }
        const bool accepted = browser.drop(asset.toVariantMap(), "v", 1000, "overwrite", 0);
        const bool deferred = model.documentJson() == before && model.undoStack()->count() == 0;
        TimelineModel replacement;
        if (scenario == "undo") { model.undoStack()->undo(); }
        if (scenario == "replace") {
            auto fresh = nt::parseTimelineJson(model.documentJson());
            model.setTimeline(std::move(*fresh.timeline));
        }
        if (scenario == "switch") { browser.setTimeline(&replacement); }
        if (scenario == "delete") { model.replaceClips({}); }
        const auto afterAction = model.documentJson();
        QEventLoop loop;
        QObject::connect(&browser, &AssetBrowser::stateChanged, &loop, [&] {
            if (!browser.busy()) { loop.quit(); }
        });
        QTimer::singleShot(60000, &loop, &QEventLoop::quit);
        if (browser.busy()) { loop.exec(); }
        const auto after = model.documentJson();
        const auto runtimePaths = [&model] {
            QJsonArray runtime;
            for (const auto& clip : model.snapshot()->clips) {
                runtime.append(QJsonObject{{"id", QString::fromStdString(clip.id)},
                    {"mediaPath", QString::fromStdString(clip.mediaPath)},
                    {"audioPath", QString::fromStdString(clip.audioPath)},
                    {"pictureExists", QFileInfo::exists(QString::fromStdString(clip.mediaPath))},
                    {"audioExists", QFileInfo::exists(QString::fromStdString(clip.audioPath))}});
            }
            return runtime;
        };
        const auto runtime = runtimePaths();
        const auto undoCount = model.undoStack()->count();
        model.undoStack()->undo();
        const bool undone = model.documentJson() == before;
        model.undoStack()->redo();
        const QJsonObject report{{"runtime", runtime}, {"runtimeRedone", runtimePaths()},
            {"redoneDocument", model.timeline().raw}, {"accepted", accepted}, {"deferred", deferred},
            {"finished", !browser.busy()}, {"undoCount", undoCount}, {"undone", undone},
            {"redone", model.documentJson() == after}, {"unchangedAfterAction", afterAction == after}, {"document", QJsonDocument::fromJson(after).object()}};
        std::printf("%s\n", QJsonDocument(report).toJson(QJsonDocument::Compact).constData());
        return 0;
    }
    TestAssetBrowser test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_assetbrowser.moc"
