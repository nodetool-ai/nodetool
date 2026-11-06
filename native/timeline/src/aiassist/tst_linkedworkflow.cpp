#include "aiassist/LinkedWorkflow.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <QFile>
#include <QFileInfo>
#include <QtTest>
class LinkedWorkflowTest : public QObject {
    Q_OBJECT
private:
    static QJsonObject line(const QString& id, const QString& asset = "asset") {
        return {{"id", id}, {"text", "Hello"}, {"currentTakeId", "take"}, {"pauseAfterMs", 100},
            {"takes", QJsonArray{QJsonObject{{"id", "take"}, {"assetId", asset}, {"durationMs", 1000},
                {"createdAt", "2020-01-01T00:00:00Z"}, {"words", QJsonArray{QJsonObject{{"word", "Hello"}, {"startMs", 0}, {"endMs", 1000}, {"kind", "filler"}}}}}}}};
    }
    static QJsonObject script(QJsonArray lines) {
        return {{"id", "script"}, {"document", QJsonObject{{"cast", QJsonArray{}}, {"sections", QJsonArray{QJsonObject{{"lines", lines}}}}}}};
    }
private slots:
    void webReconciliationFixture() {
        QFile file(QFileInfo(QString::fromUtf8(__FILE__)).absolutePath() + "/fixtures/reconcile-web.json");
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto fixture = QJsonDocument::fromJson(file.readAll()).object();
        QVERIFY(!fixture.isEmpty());
        QCOMPARE(nt::aiassist::reconcileScript(fixture.value("timeline").toObject(), fixture.value("script").toObject()), fixture.value("expected").toObject());
    }
    void freshAndIdempotent() {
        const QJsonObject timeline{{"id", "timeline"}, {"tracks", QJsonArray{}}, {"clips", QJsonArray{}}, {"untouched", 42}};
        const auto result = nt::aiassist::reconcileScript(timeline, script({line("one"), line("two")}));
        const auto clips = result.value("clips").toArray();
        QCOMPARE(clips.size(), 2);
        QCOMPARE(clips.at(0).toObject().value("startMs").toDouble(), 0);
        QCOMPARE(clips.at(1).toObject().value("startMs").toDouble(), 1100);
        QCOMPARE(result.value("untouched").toInt(), 42);
        QCOMPARE(nt::aiassist::reconcileScript(result, script({line("one"), line("two")})), result);
        const auto word = clips.at(0).toObject().value("caption").toObject().value("words").toArray().at(0).toObject();
        QVERIFY(!word.contains("kind"));
    }
    void replacementKeepsPlacementAndOtherMedia() {
        QJsonObject original{{"id", "clip"}, {"trackId", "audio"}, {"scriptId", "script"}, {"scriptLineId", "one"},
            {"startMs", 9000}, {"durationMs", 500}, {"currentAssetId", "old"}, {"inPointMs", 40}, {"outPointMs", 80}, {"opacity", 0.7}};
        const QJsonObject unrelated{{"id", "music"}, {"trackId", "audio"}, {"startMs", 10000}, {"durationMs", 2000}};
        const QJsonObject timeline{{"tracks", QJsonArray{QJsonObject{{"id", "audio"}}}}, {"clips", QJsonArray{original, unrelated}}};
        const auto result = nt::aiassist::reconcileScript(timeline, script({line("one"), line("two")}));
        const auto clips = result.value("clips").toArray();
        const auto updated = clips.at(0).toObject();
        QCOMPARE(updated.value("startMs").toInt(), 9000);
        QCOMPARE(updated.value("durationMs").toInt(), 1000);
        QVERIFY(!updated.contains("inPointMs"));
        QCOMPARE(updated.value("opacity").toDouble(), 0.7);
        QCOMPARE(updated.value("versions").toArray().size(), 1);
        QCOMPARE(clips.at(1).toObject(), unrelated);
        QCOMPARE(clips.at(2).toObject().value("startMs").toInt(), 12000);
        QCOMPARE(result.value("tracks"), timeline.value("tracks"));
    }
    void removedLinesLeaveTrackAndUnrelatedClips() {
        const QJsonObject music{{"id", "music"}, {"trackId", "audio"}};
        const QJsonObject timeline{{"tracks", QJsonArray{QJsonObject{{"id", "audio"}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "clip"}, {"trackId", "audio"}, {"scriptId", "script"}, {"scriptLineId", "removed"}}, music}}};
        const auto result = nt::aiassist::reconcileScript(timeline, script({line("new")}));
        QCOMPARE(result.value("tracks"), timeline.value("tracks"));
        QCOMPARE(result.value("clips").toArray().at(0).toObject(), music);
        QCOMPARE(result.value("clips").toArray().size(), 2);
    }
    void shotTakeWebFixture() {
        QFile file(QFileInfo(QString::fromUtf8(__FILE__)).absolutePath() + "/fixtures/shot-take-web.json");
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto cases = QJsonDocument::fromJson(file.readAll()).object().value("cases").toArray();
        QVERIFY(!cases.isEmpty());
        for (const auto& value : cases) {
            const auto test = value.toObject();
            QCOMPARE(nt::aiassist::syncStoryboardShot(test.value("timeline").toObject(), test.value("payload").toObject()), test.value("expected").toObject());
        }
    }
    void shotLocksAndCanonicalPrefixes() {
        const QString board = "123456789abc123456789abc12345678";
        const QString shot = "abcdef123456abcdef123456abcdef12";
        const QJsonObject source{{"id", "source"}, {"trackId", "picture"}, {"mediaType", "video"}, {"storyboardBoardId", board}, {"storyboardShotId", shot}, {"linkId", "linked"}, {"currentAssetId", "old"}, {"durationMs", 1000}};
        const QJsonObject twin{{"id", "twin"}, {"trackId", "sound"}, {"mediaType", "audio"}, {"storyboardBoardId", board}, {"storyboardShotId", shot}, {"linkId", "linked"}, {"currentAssetId", "old"}, {"durationMs", 1000}};
        QJsonObject timeline{{"tracks", QJsonArray{QJsonObject{{"id", "picture"}, {"type", "video"}}, QJsonObject{{"id", "sound"}, {"type", "audio"}, {"locked", true}}}}, {"clips", QJsonArray{source, twin}}};
        const QJsonObject payload{{"boardId", board.left(12)}, {"shotId", shot.left(12)}, {"assetId", "new"}, {"durationMs", 500}};
        QCOMPARE(nt::aiassist::syncStoryboardShot(timeline, payload), timeline);
        timeline.insert("tracks", QJsonArray{QJsonObject{{"id", "picture"}, {"type", "video"}}, QJsonObject{{"id", "sound"}, {"type", "audio"}}});
        const auto updated = nt::aiassist::syncStoryboardShot(timeline, payload);
        QCOMPARE(updated.value("clips").toArray().at(0).toObject().value("currentAssetId").toString(), QString("new"));
        QCOMPARE(updated.value("clips").toArray().at(1).toObject().value("durationMs").toInt(), 500);
        auto clips = timeline.value("clips").toArray();
        const QJsonObject group{{"id", "group"}, {"mediaType", "group"}, {"linkId", "linked"}};
        const QJsonObject lockedChild{{"id", "locked-child"}, {"mediaType", "text"}, {"parentId", "group"}, {"locked", true}};
        clips.append(group); clips.append(lockedChild); timeline.insert("clips", clips);
        QCOMPARE(nt::aiassist::syncStoryboardShot(timeline, payload), timeline);
    }
    void shotSyncProtectsFinishedLayers() {
        QJsonArray clips;
        for (const auto& element : {"$source", "$source-audio", "title", "voice"}) {
            QJsonObject clip{{"id", element}, {"storyboardBoardId", "board"}, {"storyboardShotId", "shot"},
                {"storyboardElementId", element}, {"mediaType", QString(element) == "$source" ? "video" : "audio"}, {"currentAssetId", "old"}, {"startMs", 500}};
            if (QString(element) == "voice") { clip.insert("scriptLineId", "line"); }
            clips.append(clip);
        }
        const QJsonObject timeline{{"clips", clips}};
        const auto result = nt::aiassist::syncStoryboardShot(timeline, {{"boardId", "board"}, {"shotId", "shot"}, {"assetId", "new"}});
        const auto updated = result.value("clips").toArray();
        QCOMPARE(updated.at(0).toObject().value("currentAssetId").toString(), QString("new"));
        QCOMPARE(updated.at(1).toObject().value("currentAssetId").toString(), QString("new"));
        QCOMPARE(updated.at(2), clips.at(2));
        QCOMPARE(updated.at(3), clips.at(3));
        QCOMPARE(updated.at(0).toObject().value("startMs").toInt(), 500);
        QCOMPARE(nt::aiassist::syncStoryboardShot(timeline, {{"boardId", "other"}, {"shotId", "shot"}, {"assetId", "new"}}), timeline);
    }
    void manyLines() {
        QJsonArray lines;
        for (int i = 0; i < 10000; ++i) { lines.append(line(QString::number(i))); }
        const auto result = nt::aiassist::reconcileScript({{"tracks", QJsonArray{}}, {"clips", QJsonArray{}}}, script(lines));
        QCOMPARE(result.value("clips").toArray().size(), 10000);
        QCOMPARE(nt::aiassist::reconcileScript(result, script(lines)), result);
    }
};
QTEST_GUILESS_MAIN(LinkedWorkflowTest)
#include "tst_linkedworkflow.moc"
