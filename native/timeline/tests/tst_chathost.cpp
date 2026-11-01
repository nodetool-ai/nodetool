#include "chat/TimelineChatHost.h"
#include "app/startup/LocalDocumentSaver.h"
#include "model/TimelineJson.h"
#include <QFile>
#include <QTemporaryDir>
#include <QtTest>

class TestChatHost : public QObject {
    Q_OBJECT
private slots:
    void toolEditUsesUndoAndPersistence() {
        QTemporaryDir dir;
        const auto path = dir.filePath("timeline.json");
        { QFile file(path); QVERIFY(file.open(QIODevice::WriteOnly)); file.write(R"({"id":"00112233445566778899aabbccddeeff","name":"local","fps":30,"width":100,"height":100,"tracks":[],"clips":[],"unknown":{"keep":true}})"); }
        TimelineModel model;
        const auto loaded = nt::loadTimelineFile(path);
        QVERIFY(loaded.timeline);
        model.setTimeline(*loaded.timeline);
        PlaybackClock clock;
        nt::chat::TimelineChatHost host(model, clock);
        nt::app::LocalDocumentSaver saver(model, path, 10000);
        const auto result = host.execute("ui_timeline_add_marker", {{"timeline_id", "00112233445566778899aabbccddeeff"}, {"timeMs", 125.0}, {"label", "Scene"}});
        QVERIFY(result.value("ok").toBool());
        QCOMPARE(model.undoStack()->count(), 1);
        QVERIFY(saver.flush());
        auto reloaded = nt::loadTimelineFile(path);
        QVERIFY(reloaded.timeline);
        QCOMPARE(reloaded.timeline->raw, model.timeline().raw);
        QCOMPARE(model.markers().size(), 1);
        model.undoStack()->undo();
        QCOMPARE(model.markers().size(), 0);
        QVERIFY(saver.flush());
        QCOMPARE(nt::loadTimelineFile(path).timeline->raw, model.timeline().raw);
        model.undoStack()->redo();
        QVERIFY(saver.flush());
        QCOMPARE(nt::loadTimelineFile(path).timeline->raw, model.timeline().raw);
        QVERIFY(model.timeline().raw.value("unknown").toObject().value("keep").toBool());
        const auto markerPrefix = result.value("marker").toMap().value("id").toString().left(12);
        QVERIFY(host.execute("ui_timeline_delete_marker", {{"timeline_id", "001122334455"}, {"target", markerPrefix}}).value("ok").toBool());
        QCOMPARE(model.markers().size(), 0);
    }
    void rejectsInvalidAndWrongDocumentEdits() {
        TimelineModel model;
        PlaybackClock clock;
        nt::chat::TimelineChatHost host(model, clock);
        const auto id = host.context().value("timeline_id");
        QVERIFY(!host.execute("ui_timeline_add_marker", {{"timeline_id", id}, {"timeMs", -1.0}}).value("ok").toBool());
        QVERIFY(!host.execute("ui_timeline_add_marker", {{"timeline_id", id}, {"timeMs", "10"}}).value("ok").toBool());
        QVERIFY(!host.execute("ui_timeline_add_marker", {{"timeMs", 0.0}, {"timeline_id", "other"}}).value("ok").toBool());
        const auto unsupported = host.execute("ui_timeline_move_clip", {{"timeline_id", id}});
        QVERIFY(!unsupported.value("ok").toBool());
        QVERIFY(unsupported.value("error").toString().contains("does not implement"));
        QCOMPARE(model.undoStack()->count(), 0);
        host.setSelection({"clip"});
        QCOMPARE(host.context().value("selected_clip_ids").toStringList(), QStringList{"clip"});
        QCOMPARE(host.tools().size(), 4);
    }
    void ambiguousLabelsDoNotDeleteAMarker() {
        TimelineModel model;
        PlaybackClock clock;
        nt::chat::TimelineChatHost host(model, clock);
        const auto id = host.context().value("timeline_id");
        model.addMarker(0, "Beat");
        const auto second = model.addMarker(100, "beat");
        const auto count = model.undoStack()->count();
        QVERIFY(!host.execute("ui_timeline_delete_marker", {{"timeline_id", id}, {"target", "BEAT"}}).value("ok").toBool());
        QCOMPARE(model.undoStack()->count(), count);
        QCOMPARE(model.markers().size(), 2);
        QVERIFY(host.execute("ui_timeline_delete_marker", {{"timeline_id", id}, {"target", second}}).value("ok").toBool());
        QCOMPARE(model.markers().size(), 1);
        model.replaceMarkers({QJsonObject{{"id", "aabbccddeeff00000000000000000001"}, {"timeMs", 0}},
                              QJsonObject{{"id", "aabbccddeeff00000000000000000002"}, {"timeMs", 1}}});
        QVERIFY(!host.execute("ui_timeline_delete_marker", {{"timeline_id", id}, {"target", "aabbccddeeff"}}).value("ok").toBool());
        QCOMPARE(model.markers().size(), 2);
    }
    void previousLocalDocumentCannotBeEdited() {
        TimelineModel model;
        PlaybackClock clock;
        nt::chat::TimelineChatHost host(model, clock);
        const auto oldId = host.context().value("timeline_id");
        model.close();
        QVERIFY(host.context().value("timeline_id") != oldId);
        QVERIFY(!host.execute("ui_timeline_add_marker", {{"timeline_id", oldId}, {"timeMs", 0.0}}).value("ok").toBool());
        QCOMPARE(model.markers().size(), 0);
    }
};
QTEST_GUILESS_MAIN(TestChatHost)
#include "tst_chathost.moc"
