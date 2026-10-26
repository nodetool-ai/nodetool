#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "server/AutosaveController.h"
#include "server/sync/DocumentApplier.h"
#include "TestHttpServer.h"

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QQmlComponent>
#include <QQmlContext>
#include <QQmlEngine>
#include <QQuickItem>
#include <QTemporaryDir>
#include <QtTest>

using namespace nt::server;
namespace {
QJsonObject document(int a = 0, int b = 1500, const QString& revision = "u0") {
    return {{"id", "seq"}, {"name", "Sync model"}, {"fps", 30}, {"width", 640}, {"height", 360},
        {"durationMs", 5000}, {"updatedAt", revision},
        {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}, {"name", "Video"}}}},
        {"clips", QJsonArray{QJsonObject{{"id", "a"}, {"currentAssetId", "asset-a"}, {"name", "A"}, {"trackId", "v"}, {"mediaType", "shape"}, {"startMs", a}, {"durationMs", 1000}},
                              QJsonObject{{"id", "b"}, {"currentAssetId", "asset-b"}, {"name", "B"}, {"trackId", "v"}, {"mediaType", "shape"}, {"startMs", b}, {"durationMs", 1000}}}}};
}
QQuickItem* findItem(QQuickItem* root, const QString& name) {
    if (root->objectName() == name) return root;
    for (auto* child : root->childItems()) {
        if (auto* found = findItem(child, name)) return found;
    }
    return nullptr;
}
}

class TestSyncModel : public QObject {
    Q_OBJECT
private slots:
    void realModel_data() {
        QTest::addColumn<QString>("mode");
        QTest::newRow("clean") << QString("clean");
        QTest::newRow("dirty") << QString("dirty");
        QTest::newRow("accept") << QString("accept");
        QTest::newRow("discard") << QString("discard");
    }
    void realModel() {
        QFETCH(QString, mode);
        QTemporaryDir cache;
        TestHttpServer http;
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(QJsonDocument(document()).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        const auto server = document(500, 1500, "u1");
        http.setJson([&](const QByteArray&, const QUrl&) {
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", server}}}}).toJson();
        });
        http.setPost([](const QByteArray&, const QByteArray&) { return QByteArray(R"({"result":{"data":{"updatedAt":"u2"}}})"); });
        AutosaveController save({http.base(), {}, "seq", cache.path(), {}}, model.undoStack(), [&] { return model.timeline().raw; }, "u0");
        save.setExternalSync(false);
        save.setAutosave(false);
        save.setQuitFallbackDirs({});
        PlaybackClock clock;
        QQmlEngine engine;
        engine.rootContext()->setContextProperty("autosave", &save);
        QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/TimelineEditor.qml"));
        const auto object = std::unique_ptr<QObject>(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&model)},
            {"clock", QVariant::fromValue(&clock)}, {"width", 1280}, {"height", 800}}));
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* root = qobject_cast<QQuickItem*>(object.get());
        QVERIFY(root);
        // No window is shown and no playback starts. These are the actual QML
        // clip delegates that the scene graph renders in the visible editor.
        QTRY_VERIFY(findItem(root, "clip-a"));
        const qreal beforeX = findItem(root, "clip-a")->x();
        if (mode == "dirty") QVERIFY(model.moveClip("b", 2000));
        if (mode == "accept" || mode == "discard") QVERIFY(model.moveClip("a", 100));
        save.externalChanged("updated", "u1", QJsonArray{QJsonObject{{"tool", "ui_timeline_move_clip"}, {"input", QJsonObject{{"id", "a"}}}}}, true);
        QTRY_COMPARE(save.baseUpdatedAt(), QString("u1"));
        QVERIFY(!model.undoStack()->canUndo());
        model.undoStack()->undo();
        if (mode == "accept" || mode == "discard") {
            QCOMPARE(model.timeline().clips[0].startMs, 100.0);
            QCOMPARE(save.externalConflicts().size(), 1);
            if (mode == "accept") {
                QVERIFY(save.acceptExternalConflict("a", &model));
                QCOMPARE(model.timeline().clips[0].startMs, 500.0);
                QCOMPARE(model.undoStack()->count(), 1);
                QCOMPARE(save.externalConflicts().size(), 0);
                model.undoStack()->undo();
                QCOMPARE(model.timeline().clips[0].startMs, 100.0);
                model.undoStack()->redo();
                QCOMPARE(model.timeline().clips[0].startMs, 500.0);
            } else {
                save.discardExternalConflicts();
                QCOMPARE(model.timeline().clips[0].startMs, 100.0);
                QCOMPARE(save.externalConflicts().size(), 0);
            }
        } else {
            QCOMPARE(model.timeline().clips[0].startMs, 500.0);
            QTRY_VERIFY(findItem(root, "clip-a"));
            QTRY_VERIFY(findItem(root, "clip-a")->x() > beforeX);
            if (mode == "dirty") {
                QCOMPARE(model.timeline().clips[1].startMs, 2000.0);
                QVERIFY(save.dirty());
                QVERIFY(save.saveNow().ok);
                QCOMPARE(http.countRequests("POST", "/trpc/timeline.update"), 1);
                const auto sent = QJsonDocument::fromJson(http.requests().back().body).object();
                QCOMPARE(sent["baseUpdatedAt"].toString(), QString("u1"));
                QCOMPARE(sent["document"].toObject()["clips"], document(500, 2000)["clips"]);
            } else {
                QVERIFY(!save.dirty());
                QCOMPARE(http.countRequests("POST", "/trpc/timeline.update"), 0);
            }
        }
    }
    void resolvedMediaSurvives() {
        TimelineModel model;
        auto loaded = nt::parseTimelineJson(QJsonDocument(document()).toJson());
        QVERIFY(loaded.timeline);
        loaded.timeline->clips[0].mediaPath = "/resolved/original.mov";
        loaded.timeline->clips[0].audioPath = "/resolved/audio.mov";
        loaded.timeline->clips[1].mediaPath = "/local/other.mov";
        loaded.timeline->clips[1].audioPath = "/local/other-audio.mov";
        model.setTimeline(*loaded.timeline);
        auto server = *loaded.timeline;
        server.clips.pop_back(); // draft-only clip falls back to current id
        auto raw = document(500, 2000, "u1");
        auto clips = raw["clips"].toArray();
        auto renamed = clips[0].toObject();
        renamed["id"] = "new-clip-same-media";
        clips[0] = renamed;
        raw["clips"] = clips;
        QVERIFY(sync::applyDocument(model.undoStack(), raw, server));
        QCOMPARE(model.timeline().clips[0].mediaPath, std::string("/resolved/original.mov"));
        QCOMPARE(model.timeline().clips[0].audioPath, std::string("/resolved/audio.mov"));
        QCOMPARE(model.timeline().clips[1].mediaPath, std::string("/local/other.mov"));
        QCOMPARE(model.timeline().clips[1].audioPath, std::string("/local/other-audio.mov"));
    }
};
QTEST_MAIN(TestSyncModel)
#include "tst_syncmodel.moc"
