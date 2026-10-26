#include "assets/AssetBrowser.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "server/ServerSource.h"
#include <QEventLoop>
#include <QFileInfo>
#include <QJsonDocument>
#include <QTimer>
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
