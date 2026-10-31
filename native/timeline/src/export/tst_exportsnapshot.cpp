#include "export/ExportController.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include <QJsonDocument>
#include <QtTest>
#include <utility>

class ExportSnapshotTest : public QObject {
    Q_OBJECT
private slots:
    void sameProxyKeepsDistinctOriginalsThroughEdit() {
        const QJsonObject first{{"id", "first"}, {"trackId", "v"}, {"mediaType", "image"},
            {"durationMs", 1000}, {"mediaPath", "proxy.png"}, {"originalMediaPath", "a.png"}};
        QJsonObject second = first;
        second.insert("id", "second");
        second.insert("originalMediaPath", "b.png");
        const QJsonObject raw{{"width", 64}, {"height", 64}, {"fps", 30},
            {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}}}},
            {"clips", QJsonArray{first, second}}};
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson(), "/fixtures");
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        QVERIFY(model.moveClip("first", 200));
        const auto clips = nt::exporting::exportSnapshot(model).value("clips").toArray();
        QCOMPARE(clips[0].toObject().value("mediaPath").toString(), QString("/fixtures/a.png"));
        QCOMPARE(clips[1].toObject().value("mediaPath").toString(), QString("/fixtures/b.png"));
        model.undoStack()->undo();
        const auto undone = nt::exporting::exportSnapshot(model).value("clips").toArray();
        QCOMPARE(undone[0].toObject().value("mediaPath").toString(), QString("/fixtures/a.png"));
        QCOMPARE(undone[1].toObject().value("mediaPath").toString(), QString("/fixtures/b.png"));
    }
    void originalPictureKeepsSeparateAudio() {
        const QJsonObject clip{{"id", "c"}, {"trackId", "v"}, {"mediaType", "video"},
            {"startMs", 0}, {"durationMs", 1000}, {"mediaPath", "proxy.png"},
            {"originalMediaPath", "original.png"}, {"audioPath", "separate.wav"}};
        const QJsonObject raw{{"width", 64}, {"height", 64}, {"fps", 30},
            {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}}}},
            {"clips", QJsonArray{clip}}};
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson(), "/fixtures");
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        QVERIFY(model.resolvedMediaPaths().contains("/fixtures/proxy.png"));
        QVERIFY(model.resolvedMediaPaths().contains("/fixtures/original.png"));
        QVERIFY(model.resolvedMediaPaths().contains("/fixtures/separate.wav"));
        const auto before = model.documentJson();
        const auto snapshot = nt::exporting::exportSnapshot(model);
        const auto exported = snapshot.value("clips").toArray().first().toObject();
        QCOMPARE(exported.value("mediaPath").toString(), QString("/fixtures/original.png"));
        QCOMPARE(exported.value("audioPath").toString(), QString("/fixtures/separate.wav"));
        QCOMPARE(model.documentJson(), before);
        QVERIFY(model.moveClip("c", 200));
        QCOMPARE(nt::exporting::exportSnapshot(model).value("clips").toArray().first().toObject()
                     .value("mediaPath").toString(), QString("/fixtures/original.png"));
        model.undoStack()->undo();
        QCOMPARE(nt::exporting::exportSnapshot(model).value("clips").toArray().first().toObject()
                     .value("audioPath").toString(), QString("/fixtures/separate.wav"));
    }
    void duration_data() {
        QTest::addColumn<double>("authored");
        QTest::addColumn<double>("clipDuration");
        QTest::addColumn<double>("expected");
        QTest::newRow("shortened-content") << 10000.0 << 1000.0 << 2000.0;
        QTest::newRow("extended-content") << 1000.0 << 5000.0 << 6000.0;
        QTest::newRow("empty-sequence") << 4000.0 << 0.0 << 4000.0;
    }
    void duration() {
        QFETCH(double, authored);
        QFETCH(double, clipDuration);
        QFETCH(double, expected);
        QJsonArray clips;
        if (clipDuration > 0) {
            clips.append(QJsonObject{{"id", "c"}, {"trackId", "v"}, {"mediaType", "shape"},
                {"startMs", 1000}, {"durationMs", clipDuration}, {"unknown", 42}});
        }
        const QJsonObject raw{{"width", 64}, {"height", 64}, {"fps", 30}, {"durationMs", authored},
            {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}}}}, {"clips", clips}};
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        const auto before = model.documentJson();
        const auto snapshot = nt::exporting::exportSnapshot(model);
        QCOMPARE(snapshot.value("durationMs").toDouble(), expected);
        QCOMPARE(snapshot.value("clips").toArray(), clips);
        QCOMPARE(model.documentJson(), before);
    }
};
QTEST_GUILESS_MAIN(ExportSnapshotTest)
#include "tst_exportsnapshot.moc"
