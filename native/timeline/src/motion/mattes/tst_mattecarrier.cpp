#include "export/OffscreenFrames.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "preview/layers/TestStill.h"
#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QTemporaryDir>
#include <QtTest>

namespace {
nt::Timeline fixture(bool carrier) {
    const QDir directory(QStringLiteral(NT_MATTE_FIXTURE_DIR));
    QFile file(directory.filePath("generated-matte.json"));
    if (!file.open(QIODevice::ReadOnly)) { return {}; }
    auto document = QJsonDocument::fromJson(file.readAll()).object();
    auto clips = document.value("clips").toArray();
    auto clip = clips[0].toObject();
    clip.insert("mediaPath", directory.absoluteFilePath(clip.value("mediaPath").toString()));
    clip.insert("repeater", QJsonObject{{"count", 3}, {"positionStep", QJsonObject{{"x", 190}, {"y", 0}}}, {"timeStepMs", 100}});
    clip.insert("transform", QJsonObject{{"position", QJsonObject{{"x", -190}, {"y", 0}}},
        {"scale", QJsonObject{{"x", 0.35}, {"y", 0.55}}}, {"rotation", 0},
        {"anchor", QJsonObject{{"x", 0.5}, {"y", 0.5}}}});
    clip.insert("timeRemap", QJsonObject{{"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"sourceMs", 100}},
        QJsonObject{{"t", 1}, {"sourceMs", 1700}}}}});
    auto matte = clip.value("generatedMatte").toObject();
    const auto path = directory.absoluteFilePath(matte.value("mediaPath").toString());
    matte.insert("assetId", "cccccccccccccccccccccccccccccccc");
    matte.insert("strength", 0.65);
    matte.insert("unknown", QJsonObject{{"kept", true}});
    if (carrier) { matte.remove("mediaPath"); }
    else { matte.insert("mediaPath", path); }
    clip.insert("generatedMatte", matte);
    clips[0] = clip;
    document.insert("clips", clips);
    auto parsed = nt::parseTimelineJson(QJsonDocument(document).toJson());
    if (!parsed.timeline) { return {}; }
    if (carrier) { parsed.timeline->clips[0].generatedMattePath = path.toStdString(); }
    return std::move(*parsed.timeline);
}
}
class TestMatteCarrier : public QObject {
    Q_OBJECT
private slots:
    void previewAndPngExport() {
        auto a = fixture(true), b = fixture(false);
        QVERIFY(!a.clips.empty()); QVERIFY(!b.clips.empty());
        const auto original = QJsonDocument(a.raw).toJson(QJsonDocument::Compact);
        TimelineModel assetModel, pathModel;
        assetModel.setTimeline(std::move(a)); pathModel.setTimeline(std::move(b));
        PlaybackClock clock;
        clock.setDurationMs(2000); clock.seek(700);
        nt::test::Still assetPreview, pathPreview;
        QVERIFY(assetPreview.initialize(assetModel)); QVERIFY(pathPreview.initialize(pathModel));
        assetPreview.setClock(&clock); pathPreview.setClock(&clock);
        const auto previewA = assetPreview.capture(15000), previewB = pathPreview.capture(15000);
        QVERIFY(!previewA.isNull()); QVERIFY(!previewB.isNull());
        QCOMPARE(previewA, previewB);
        nt::exporting::OffscreenFrames assetExport(assetModel), pathExport(pathModel);
        QTemporaryDir dir; QVERIFY(dir.isValid());
        QImage first;
        for (const int frame : {0, 21, 42}) {
            const auto exportA = assetExport.capture(frame, 30, [] { return false; });
            const auto exportB = pathExport.capture(frame, 30, [] { return false; });
            QVERIFY(!exportA.isNull()); QVERIFY(!exportB.isNull()); QCOMPARE(exportA, exportB);
            if (frame == 0) { first = exportA; }
            if (frame == 42) { QVERIFY(exportA != first); }
            const auto png = dir.filePath(QString::number(frame) + ".png");
            QVERIFY(exportA.save(png)); QCOMPARE(QImage(png).convertToFormat(QImage::Format_RGBA8888), exportB.convertToFormat(QImage::Format_RGBA8888));
        }
        QCOMPARE(assetModel.documentJson(), original);
    }
};
QTEST_MAIN(TestMatteCarrier)
#include "tst_mattecarrier.moc"
