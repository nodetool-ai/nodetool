#include "aiassist/TranscriptRequest.h"
#include <QJsonArray>
#include <QTemporaryDir>
#include <QFile>
#include <QtTest>
#include "model/TimelineJson.h"
#include <QJsonDocument>
class TranscriptTest : public QObject {
    Q_OBJECT
private slots:
    void replacementPreservesStagedRecovery() {
        QTemporaryDir folder;
        QVERIFY(folder.isValid());
        const auto path = folder.filePath("candidate.json");
        QFile file(path); QVERIFY(file.open(QIODevice::WriteOnly)); file.write("{}"); file.close();
        TimelineModel model;
        TranscriptRequest request;
        request.setTimeline(&model);
        request.m_recoveryFile = path;
        nt::Timeline replacement;
        replacement.raw = {{"id", "replacement"}, {"tracks", QJsonArray{}}, {"clips", QJsonArray{}}};
        model.setTimeline(replacement);
        QVERIFY(QFile::exists(path));
        request.m_recoveryFile = path;
        request.cancel();
        QVERIFY(!QFile::exists(path));
    }
    void candidateStagesAndRejectsChangedDocument() {
        TimelineModel model;
        nt::Timeline timeline;
        timeline.raw = {{"id", "sequence"}, {"clips", QJsonArray{QJsonObject{{"id", "clip"}, {"mediaType", "audio"}}}}};
        {
            auto raw = timeline.raw;
            if (!raw.value("clips").toArray().isEmpty()) {
                raw.insert("tracks", QJsonArray{QJsonObject{{"id", "audio"}, {"type", "audio"}, {"index", 0}}});
                auto clips = raw.value("clips").toArray();
                for (qsizetype i = 0; i < clips.size(); ++i) {
                    auto clip = clips[i].toObject();
                    clip.insert("trackId", "audio");
                    if (!clip.contains("mediaType")) { clip.insert("mediaType", "audio"); }
                    if (!clip.contains("durationMs")) { clip.insert("durationMs", 1000); }
                    clips[i] = clip;
                }
                raw.insert("clips", clips);
            }
            const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
            QVERIFY2(parsed.timeline.has_value(), qPrintable(parsed.error));
            model.setTimeline(*parsed.timeline);
        }
        TranscriptRequest request;
        request.setTimeline(&model);
        request.m_busy = true; request.m_requestId = "request"; request.m_clipId = "clip";
        request.m_generation = model.documentGeneration(); request.m_observed = model.timeline().raw;
        request.receive({{"request_id", "request"}, {"result", QJsonObject{{"words", QJsonArray{QJsonObject{{"word", "hello"}, {"startMs", 0}, {"endMs", 100}}}}}}});
        QVERIFY(request.hasCandidate());
        QCOMPARE(model.undoStack()->count(), 0);
        QVERIFY(request.apply());
        QCOMPARE(model.undoStack()->count(), 1);
        request.m_candidate = {{"words", QJsonArray{}}};
        QVERIFY(!request.apply());
    }
    void captionsAreOneUndoAndStaleResultsRefused() {
        TimelineModel model;
        nt::Timeline timeline;
        timeline.raw = {{"id", "sequence"}, {"clips", QJsonArray{QJsonObject{{"id", "clip"}, {"mediaType", "audio"}, {"currentAssetId", "asset"}}}}};
        {
            auto raw = timeline.raw;
            if (!raw.value("clips").toArray().isEmpty()) {
                raw.insert("tracks", QJsonArray{QJsonObject{{"id", "audio"}, {"type", "audio"}, {"index", 0}}});
                auto clips = raw.value("clips").toArray();
                for (qsizetype i = 0; i < clips.size(); ++i) {
                    auto clip = clips[i].toObject();
                    clip.insert("trackId", "audio");
                    if (!clip.contains("mediaType")) { clip.insert("mediaType", "audio"); }
                    if (!clip.contains("durationMs")) { clip.insert("durationMs", 1000); }
                    clips[i] = clip;
                }
                raw.insert("clips", clips);
            }
            const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
            QVERIFY2(parsed.timeline.has_value(), qPrintable(parsed.error));
            model.setTimeline(*parsed.timeline);
        }
        const QJsonObject payload{{"clipId", "clip"}, {"words", QJsonArray{QJsonObject{{"word", "hello"}, {"startMs", 0}, {"endMs", 100}}, QJsonObject{{"text", "invalid"}}}}};
        QVERIFY(model.applyEdit("assist.applyTranscription", payload));
        QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(model.timeline().raw.value("clips").toArray().first().toObject().value("caption").toObject().value("words").toArray().size(), 1);
        model.undoStack()->undo();
        QVERIFY(!model.timeline().raw.value("clips").toArray().first().toObject().contains("caption"));
        TranscriptRequest request;
        request.setTimeline(&model);
        request.receive({{"request_id", "other"}, {"result", QJsonObject{{"words", QJsonArray{}}}}});
        QVERIFY(!request.hasCandidate());
        QVERIFY(!request.apply());
    }
};
QTEST_GUILESS_MAIN(TranscriptTest)
#include "tst_transcriptrequest.moc"
