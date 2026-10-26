#include "assets/AssetBrowser.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "server/ServerSource.h"
#include <QEventLoop>
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
    void tileDragCarriesSingleAsset() {
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
Item {
    id: root
    width: 400; height: 120
    property bool dropped: false
    AssetBrowser { id: browser }
    AssetItem {
        width: 84; height: 84
        browser: browser
        asset: ({id: "asset", name: "take.mp4", content_type: "video/mp4"})
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
        root->setParentItem(window.contentItem());
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        QTest::mousePress(&window, Qt::LeftButton, {}, QPoint(40, 40));
        for (int x = 50; x <= 250; x += 10) { QTest::mouseMove(&window, QPoint(x, 40)); }
        QTest::mouseRelease(&window, Qt::LeftButton, {}, QPoint(250, 40));
        QTRY_VERIFY2(root->property("dropped").toBool(), "dragging an asset tile must deliver its asset to the lane drop key");
    }
};
int main(int argc, char** argv) {
    const bool probeDrop = argc > 1 && QByteArray(argv[1]) == "--probe-drop";
    if (probeDrop) {
        const int status = nt::server::takeServerArgs(argc, argv);
        if (status != 0) { return status; }
    }
    QGuiApplication app(argc, argv);
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
        const bool accepted = browser.drop(asset.toVariantMap(), "v", 1000, "overwrite", 0);
        const bool deferred = model.documentJson() == before && model.undoStack()->count() == 0;
        QEventLoop loop;
        QObject::connect(&browser, &AssetBrowser::stateChanged, &loop, [&] {
            if (!browser.busy()) { loop.quit(); }
        });
        QTimer::singleShot(60000, &loop, &QEventLoop::quit);
        if (browser.busy()) { loop.exec(); }
        const auto after = model.documentJson();
        const auto undoCount = model.undoStack()->count();
        model.undoStack()->undo();
        const bool undone = model.documentJson() == before;
        model.undoStack()->redo();
        const QJsonObject report{{"accepted", accepted}, {"deferred", deferred},
            {"finished", !browser.busy()}, {"undoCount", undoCount}, {"undone", undone},
            {"redone", model.documentJson() == after}, {"document", QJsonDocument::fromJson(after).object()}};
        std::printf("%s\n", QJsonDocument(report).toJson(QJsonDocument::Compact).constData());
        return 0;
    }
    TestAssetBrowser test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_assetbrowser.moc"
