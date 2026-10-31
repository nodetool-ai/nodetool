#include "export/ExportController.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include <QJsonDocument>
#include <QtTest>
#include <utility>

class ExportSnapshotTest : public QObject {
    Q_OBJECT
private slots:
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
