#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "app/EditRegistry.h"
#include <QJsonDocument>
#include <QtTest>

class TestTrackEdits : public QObject {
    Q_OBJECT
private slots:
    void undo_data() {
        QTest::addColumn<QString>("action");
        QTest::addColumn<QJsonObject>("payload");
        QTest::newRow("add") << QString("addTrack") << QJsonObject{{"type", "midi"}};
        QTest::newRow("insert") << QString("insertTrack") << QJsonObject{{"type", "video"}, {"atIndex", 0}};
        QTest::newRow("duplicate") << QString("duplicateTrack") << QJsonObject{{"trackId", "v"}};
        QTest::newRow("remove") << QString("removeTrack") << QJsonObject{{"trackId", "v"}};
        QTest::newRow("reorder") << QString("reorderTracks") << QJsonObject{{"orderedIds", QJsonArray{"a", "v"}}};
        QTest::newRow("name") << QString("setTrackName") << QJsonObject{{"trackId", "v"}, {"name", "Renamed"}};
        QTest::newRow("height") << QString("setTrackHeight") << QJsonObject{{"trackId", "v"}, {"heightPx", 91}};
        QTest::newRow("visible") << QString("setTrackVisible") << QJsonObject{{"trackId", "v"}, {"visible", false}};
        QTest::newRow("locked") << QString("setTrackLocked") << QJsonObject{{"trackId", "v"}, {"locked", true}};
        QTest::newRow("muted") << QString("setTrackMuted") << QJsonObject{{"trackId", "v"}, {"muted", true}};
        QTest::newRow("solo") << QString("setTrackSolo") << QJsonObject{{"trackId", "v"}, {"solo", true}};
    }
    void undo() {
        QFETCH(QString, action);
        QFETCH(QJsonObject, payload);
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(R"({"name":"Fixture","width":640,"height":360,"fps":30,"durationMs":1000,
            "tracks":[{"id":"v","name":"Video","type":"video","index":0,"visible":true,"locked":false},
                      {"id":"a","name":"Audio","type":"audio","index":1,"visible":true,"locked":true}],
            "clips":[{"id":"c","trackId":"v","name":"Clip","startMs":0,"durationMs":500,"mediaType":"video"}],
            "mediaTracks":[{"id":"mt","clipId":"c"}],"extra":{"keep":true}})");
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        const auto before = QJsonDocument::fromJson(model.documentJson()).object();
        QVERIFY2(model.applyEdit(action, payload), qPrintable("applyEdit refused " + action));
        const auto after = QJsonDocument::fromJson(model.documentJson()).object();
        QVERIFY(after != before);
        QCOMPARE(after.value("extra"), before.value("extra"));
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo();
        QCOMPARE(QJsonDocument::fromJson(model.documentJson()).object(), before);
        model.undoStack()->redo();
        QCOMPARE(QJsonDocument::fromJson(model.documentJson()).object(), after);
        QVERIFY(!model.applyEdit("removeTrack", {{"trackId", "a"}}));
        QVERIFY(!model.applyEdit("setTrackName", {{"trackId", "missing"}, {"name", "X"}}));
        QVERIFY(!model.applyEdit("setTrackLocked", {{"trackId", "a"}, {"locked", true}}));
        QCOMPARE(model.undoStack()->count(), 1);
    }
    void largeLinkedGroupUnit() {
        QJsonArray clips;
        constexpr int count = 20000;
        for (int i = 0; i < count; ++i) {
            clips.append(QJsonObject{{"id", QString::number(i)}, {"trackId", "v"}, {"mediaType", "group"},
                {"linkId", "shared"}, {"parentId", QString::number((i + 1) % count)}, {"locked", i == count - 1}});
        }
        const QJsonObject doc{{"tracks", QJsonArray{QJsonObject{{"id", "v"}}}}, {"clips", clips}, {"mediaTracks", QJsonArray{}}};
        const auto edit = nt::app::findEdit("removeTrack");
        QVERIFY(edit);
        QCOMPARE(edit(doc, {{"trackId", "v"}}), doc);
        auto last = clips.last().toObject();
        last.insert("locked", false);
        clips.replace(count - 1, last);
        auto unlocked = doc;
        unlocked.insert("clips", clips);
        const auto removed = edit(unlocked, {{"trackId", "v"}});
        QVERIFY(removed.value("tracks").toArray().empty());
        QVERIFY(removed.value("clips").toArray().empty());
    }
};
QTEST_MAIN(TestTrackEdits)
#include "tst_trackedits.moc"
