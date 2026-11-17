#include "chat/TimelineChatHost.h"
#include "aiassist/AgentBridge.h"
#include "app/startup/LocalDocumentSaver.h"
#include "model/TimelineJson.h"
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTemporaryDir>
#include <QtTest>

class TestChatHost : public QObject {
    Q_OBJECT
private slots:
    // The native tools are narrower than the shared contracts the web editor and
    // the headless bridge register. Each one must stay a subset of its contract,
    // so a call the native app accepts means the same thing on every host.
    // resources/chat/tool-manifest.json is written by scripts/generate-tool-manifest.mjs.
    void nativeToolsAreSubsetsOfTheSharedContracts() {
        QFile file(QStringLiteral(NT_TOOL_MANIFEST));
        QVERIFY2(file.open(QIODevice::ReadOnly), qPrintable(file.fileName()));
        QHash<QString, QJsonObject> contracts;
        for (const auto& entry : QJsonDocument::fromJson(file.readAll()).array()) {
            contracts.insert(entry.toObject().value("name").toString(), entry.toObject().value("parameters").toObject());
        }
        QVERIFY(contracts.size() > 40);
        QJsonArray native = nt::aiassist::assistantTools();
        for (const auto& tool : nt::chat::TimelineChatHost::tools()) {
            native.append(QJsonObject::fromVariantMap(tool.toMap()));
        }
        const auto typesOf = [](const QJsonObject& schema) {
            QSet<QString> out;
            const auto type = schema.value("type");
            for (const auto& value : type.isArray() ? type.toArray() : QJsonArray{type}) {
                const auto name = value.toString();
                out.insert(name == QStringLiteral("integer") ? QStringLiteral("number") : name);
            }
            for (const auto& branch : schema.value("anyOf").toArray()) {
                const auto t = branch.toObject().value("type").toString();
                out.insert(t == QStringLiteral("integer") ? QStringLiteral("number") : t);
            }
            if (schema.contains("enum") && out.isEmpty()) out.insert(QStringLiteral("string"));
            out.remove(QString());
            return out;
        };
        int checked = 0;
        for (const auto& value : native) {
            const auto tool = value.toObject();
            const auto name = tool.value("name").toString();
            if (!contracts.contains(name)) continue;
            ++checked;
            const auto shared = contracts.value(name).value("properties").toObject();
            const auto own = tool.value("parameters").toObject().value("properties").toObject();
            for (auto it = own.begin(); it != own.end(); ++it) {
                QVERIFY2(shared.contains(it.key()),
                         qPrintable(QStringLiteral("%1.%2 is not in the shared contract").arg(name, it.key())));
                const auto ownTypes = typesOf(it.value().toObject());
                const auto sharedTypes = typesOf(shared.value(it.key()).toObject());
                if (sharedTypes.isEmpty()) continue;
                for (const auto& type : ownTypes) {
                    QVERIFY2(sharedTypes.contains(type),
                             qPrintable(QStringLiteral("%1.%2 is %3 here and %4 in the shared contract")
                                            .arg(name, it.key(), type, QStringList(sharedTypes.values()).join('|'))));
                }
            }
        }
        QVERIFY(checked >= 10);
    }
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
    void markerNotesReachTheDocumentAndTheState() {
        TimelineModel model;
        PlaybackClock clock;
        nt::chat::TimelineChatHost host(model, clock);
        const auto id = host.context().value("timeline_id");
        const auto added = host.execute("ui_timeline_add_marker", {{"timeline_id", id}, {"timeMs", 4000.4}, {"label", "Hands"},
            {"note", "Regenerate with the right number of fingers"}, {"color", "#E5484D"}, {"durationMs", 1500.0}});
        QVERIFY2(added.value("ok").toBool(), qPrintable(added.value("error").toString()));
        QCOMPARE(model.undoStack()->count(), 1);
        const auto marker = added.value("marker").toMap();
        QCOMPARE(marker.value("note").toString(), QString("Regenerate with the right number of fingers"));
        QCOMPARE(marker.value("color").toString(), QString("#E5484D"));
        QCOMPARE(marker.value("durationMs").toDouble(), 1500.0);
        QCOMPARE(marker.value("author").toString(), QString("Assistant"));
        // The note comes back through the state the assistant reads.
        const auto state = host.execute("ui_timeline_get_state", {{"timeline_id", id}});
        const auto markers = state.value("markers").toList();
        QCOMPARE(markers.size(), 1);
        QCOMPARE(markers[0].toMap().value("note").toString(), QString("Regenerate with the right number of fingers"));
        QCOMPARE(markers[0].toMap().value("timeMs").toDouble(), 4000.0);
        model.undoStack()->undo();
        QCOMPARE(model.markers().size(), 0);
        model.undoStack()->redo();
        QCOMPARE(model.markers().size(), 1);
    }
    void markerFieldsOfTheWrongTypeAreRefused() {
        TimelineModel model;
        PlaybackClock clock;
        nt::chat::TimelineChatHost host(model, clock);
        const auto id = host.context().value("timeline_id");
        QVERIFY(!host.execute("ui_timeline_add_marker", {{"timeline_id", id}, {"timeMs", 0.0}, {"note", 5}}).value("ok").toBool());
        QVERIFY(!host.execute("ui_timeline_add_marker", {{"timeline_id", id}, {"timeMs", 0.0}, {"color", true}}).value("ok").toBool());
        QVERIFY(!host.execute("ui_timeline_add_marker", {{"timeline_id", id}, {"timeMs", 0.0}, {"durationMs", -1.0}}).value("ok").toBool());
        QVERIFY(!host.execute("ui_timeline_add_marker", {{"timeline_id", id}, {"timeMs", 0.0}, {"durationMs", "long"}}).value("ok").toBool());
        QCOMPARE(model.undoStack()->count(), 0);
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
