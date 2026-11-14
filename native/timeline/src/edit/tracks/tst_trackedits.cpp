#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "app/EditRegistry.h"
#include <QJsonDocument>
#include <QtTest>

class TestTrackEdits : public QObject {
    Q_OBJECT
private slots:
    void duplicateTrackKeepsItsOwnReframeTracks() {
        const QJsonObject tracked{{"id", "mt"}, {"clipId", "c"}, {"status", "ready"},
                                  {"sourceAssetId", "asset"},
                                  {"samples", QJsonArray{QJsonObject{{"sourceMs", 0}, {"x", 0.8}}}}};
        const QJsonObject clip{{"id", "c"}, {"trackId", "v"}, {"mediaType", "video"},
                               {"startMs", 0}, {"durationMs", 1000}, {"currentAssetId", "asset"},
                               {"reframe", QJsonObject{{"mode", "track"}, {"trackId", "mt"}}},
                               {"trackBinding", QJsonObject{{"trackId", "mt"}}}};
        const QJsonObject raw{{"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}}}},
                              {"clips", QJsonArray{clip}}, {"mediaTracks", QJsonArray{tracked}}};
        const auto duplicate = nt::app::findEdit("duplicateTrack");
        const auto remove = nt::app::findEdit("removeTrack");
        QVERIFY(duplicate);
        QVERIFY(remove);
        const auto copied = duplicate(raw, {{"trackId", "v"}});
        QCOMPARE(copied.value("mediaTracks").toArray().size(), 2);
        const auto surviving = remove(copied, {{"trackId", "v"}});
        const auto clips = surviving.value("clips").toArray();
        const auto media = surviving.value("mediaTracks").toArray();
        QCOMPARE(clips.size(), 1);
        QCOMPARE(media.size(), 1);
        const auto child = clips.first().toObject();
        const auto track = media.first().toObject();
        QVERIFY(track.value("id").toString() != "mt");
        QCOMPARE(track.value("clipId"), child.value("id"));
        QCOMPARE(child.value("reframe").toObject().value("trackId"), track.value("id"));
        QCOMPARE(child.value("trackBinding").toObject().value("trackId"), track.value("id"));
        QCOMPARE(track.value("samples"), tracked.value("samples"));
    }

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
    void addTextOnTopReusesFreeTop_data() {
        QTest::addColumn<QString>("type");
        QTest::newRow("video") << QString("video");
        QTest::newRow("overlay") << QString("overlay");
    }
    void addTextOnTopReusesFreeTop() {
        QFETCH(QString, type);
        const auto edit = nt::app::findEdit("addTextOnTop");
        QVERIFY(edit);
        // The top track has a clip that ends where the title starts.
        const QJsonObject raw{{"tracks", QJsonArray{QJsonObject{{"id", "top"}, {"type", type}, {"locked", false}},
                                                   QJsonObject{{"id", "low"}, {"type", "video"}}}},
                              {"clips", QJsonArray{QJsonObject{{"id", "c"}, {"trackId", "top"}, {"startMs", 0}, {"durationMs", 1000}}}}};
        const auto after = edit(raw, {{"atMs", 1000}, {"clipId", "title"}, {"text", "Hello"}, {"durationMs", 2000}});
        QCOMPARE(after.value("tracks"), raw.value("tracks"));
        const auto clips = after.value("clips").toArray();
        QCOMPARE(clips.size(), 2);
        const auto title = clips.last().toObject();
        QCOMPARE(title.value("id").toString(), QString("title"));
        QCOMPARE(title.value("trackId").toString(), QString("top"));
        QCOMPARE(title.value("mediaType").toString(), QString("text"));
        QCOMPARE(title.value("startMs").toDouble(), 1000.0);
        QCOMPARE(title.value("durationMs").toDouble(), 2000.0);
        QCOMPARE(title.value("textStyle").toObject().value("text").toString(), QString("Hello"));
    }
    void addTextOnTopInsertsTitles_data() {
        QTest::addColumn<QJsonObject>("top");
        QTest::addColumn<QJsonArray>("clips");
        const QJsonArray none;
        QTest::newRow("audio") << QJsonObject{{"id", "top"}, {"type", "audio"}} << none;
        QTest::newRow("locked") << QJsonObject{{"id", "top"}, {"type", "video"}, {"locked", true}} << none;
        QTest::newRow("occupied") << QJsonObject{{"id", "top"}, {"type", "overlay"}}
            << QJsonArray{QJsonObject{{"id", "c"}, {"trackId", "top"}, {"startMs", 500}, {"durationMs", 1000}}};
        QTest::newRow("occupied after") << QJsonObject{{"id", "top"}, {"type", "video"}}
            << QJsonArray{QJsonObject{{"id", "c"}, {"trackId", "top"}, {"startMs", 3999}, {"durationMs", 1000}}};
    }
    void addTextOnTopInsertsTitles() {
        QFETCH(QJsonObject, top);
        QFETCH(QJsonArray, clips);
        const auto edit = nt::app::findEdit("addTextOnTop");
        QVERIFY(edit);
        const QJsonObject raw{{"tracks", QJsonArray{top, QJsonObject{{"id", "low"}, {"type", "video"}}}}, {"clips", clips}};
        const auto after = edit(raw, {{"atMs", 1000}, {"clipId", "title"}});
        const auto tracks = after.value("tracks").toArray();
        QCOMPARE(tracks.size(), 3);
        const auto titles = tracks.first().toObject();
        QCOMPARE(titles.value("name").toString(), QString("Titles"));
        QCOMPARE(titles.value("type").toString(), QString("overlay"));
        QVERIFY(!titles.value("id").toString().isEmpty());
        QCOMPARE(tracks[1].toObject().value("id").toString(), QString("top"));
        const auto added = after.value("clips").toArray();
        QCOMPARE(added.size(), clips.size() + 1);
        const auto title = added.last().toObject();
        QCOMPARE(title.value("trackId"), titles.value("id"));
        QCOMPARE(title.value("startMs").toDouble(), 1000.0);
        QCOMPARE(title.value("durationMs").toDouble(), 3000.0);
        QCOMPARE(title.value("name").toString(), QString("Text"));
    }
    void addTextOnTopEmptyAndRefused() {
        const auto edit = nt::app::findEdit("addTextOnTop");
        QVERIFY(edit);
        const auto empty = edit(QJsonObject{{"tracks", QJsonArray{}}, {"clips", QJsonArray{}}}, {{"atMs", 0}});
        QCOMPARE(empty.value("tracks").toArray().size(), 1);
        QCOMPARE(empty.value("clips").toArray().first().toObject().value("trackId"),
                 empty.value("tracks").toArray().first().toObject().value("id"));
        const QJsonObject raw{{"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}}}}, {"clips", QJsonArray{}}};
        for (const auto& payload : {QJsonObject{}, QJsonObject{{"atMs", -1}}, QJsonObject{{"atMs", 0}, {"durationMs", 0}},
                                    QJsonObject{{"atMs", 0}, {"text", ""}}}) {
            QCOMPARE(edit(raw, payload), raw);
        }
    }
    void addTextOnTopIsOneUndoStep() {
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(R"({"name":"Fixture","width":640,"height":360,"fps":30,"durationMs":5000,
            "tracks":[{"id":"a","name":"Audio","type":"audio","index":0,"visible":true,"locked":false},
                      {"id":"v","name":"Video","type":"video","index":1,"visible":true,"locked":false}],
            "clips":[{"id":"c","trackId":"v","name":"Clip","startMs":0,"durationMs":5000,"mediaType":"video"}]})");
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        const auto before = QJsonDocument::fromJson(model.documentJson()).object();
        QVERIFY(model.applyEdit("addTextOnTop", {{"atMs", 1000}, {"clipId", "title"}}));
        const auto after = QJsonDocument::fromJson(model.documentJson()).object();
        const auto tracks = after.value("tracks").toArray();
        QCOMPARE(tracks.size(), 3);
        QCOMPARE(tracks.first().toObject().value("name").toString(), QString("Titles"));
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo();
        QCOMPARE(QJsonDocument::fromJson(model.documentJson()).object(), before);
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
