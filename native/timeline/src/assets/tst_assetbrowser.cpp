#include "assets/AssetBrowser.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "server/ServerSource.h"
#include "../../tests/TestHttpServer.h"
#include <QEventLoop>
#include <QFileInfo>
#include <QJsonDocument>
#include <QTimer>
#include <QTemporaryDir>
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
            QEXPECT_FAIL("", "F3: public TimelineModel API cannot remove tracks untracked while later history exists", Continue);
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
        QTRY_VERIFY(itemNamed(root, "assetExplorer"));
        QTRY_VERIFY(itemNamed(root, "assetDropOverlay"));
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
    AssetBrowser { id: browser }
    AssetItem {
        width: 84; height: 84
        browser: browser
        asset: ({id: "asset", name: "take.mp4", content_type: root.contentType})
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
        root->setParentItem(window.contentItem());
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        QTest::mousePress(&window, Qt::LeftButton, {}, QPoint(40, 40));
        for (int x = 50; x <= 250; x += 10) { QTest::mouseMove(&window, QPoint(x, 40)); }
        QTest::mouseRelease(&window, Qt::LeftButton, {}, QPoint(250, 40));
        if (folder) { QVERIFY2(!root->property("dropped").toBool(), "folders must not start timeline drags"); }
        else { QTRY_VERIFY2(root->property("dropped").toBool(), "dragging an asset tile must deliver its asset to the lane drop key"); }
    }
};
int main(int argc, char** argv) {
    const bool probeDrop = argc > 1 && QByteArray(argv[1]) == "--probe-drop";
    const bool listFolder = argc > 1 && QByteArray(argv[1]) == "--list-folder";
    if (probeDrop || listFolder) {
        const int status = nt::server::takeServerArgs(argc, argv);
        if (status != 0) { return status; }
    }
    QGuiApplication app(argc, argv);
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
