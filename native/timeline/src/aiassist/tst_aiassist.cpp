#include "aiassist/AssistDocument.h"
#include <QtTest>
#include <QJsonDocument>
#include "model/TimelineModel.h"
#include "model/TimelineJson.h"
#include "app/EditRegistry.h"
class AssistTest : public QObject {
    Q_OBJECT
private slots:
    void oneUndoPerCorrection() {
        TimelineModel model;
        nt::Timeline timeline;
        timeline.raw = {{"id", "sequence"}, {"clips", QJsonArray{QJsonObject{{"id", "clip"}, {"caption", QJsonObject{{"words", QJsonArray{QJsonObject{{"word", "helo"}, {"startMs", 0}, {"endMs", 100}}}}}}}}}};
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
        QVERIFY(model.applyEdit("assist.correctTranscript", {{"clipId", "clip"}, {"wordIndex", 0}, {"text", "hello"}}));
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo();
        QCOMPARE(nt::aiassist::transcript(model.timeline().raw).first().toObject().value("word").toString(), QString("helo"));
    }
    void beatEditsPreserveLockedUnits() {
        const QJsonObject beat{{"id", "beat"}, {"trackId", "audio"}, {"mediaType", "audio"}, {"bindingKind", "text-to-audio"}, {"prompt", "old"}, {"startMs", 0}, {"durationMs", 3000}, {"linkId", "pair"}};
        auto sibling = beat; sibling.insert("id", "lockedSibling"); sibling.insert("locked", true);
        const QJsonObject document{{"tracks", QJsonArray{QJsonObject{{"id", "audio"}, {"type", "audio"}}}}, {"clips", QJsonArray{beat, sibling}}};
        const auto edit = nt::app::findEdit("assist.setBeatText");
        QVERIFY(static_cast<bool>(edit));
        QCOMPARE(edit(document, {{"clipId", "beat"}, {"text", "new"}}), document);
    }
    void identity() {
        const QString full = "123456789abc123456789abc12345678";
        QCOMPARE(nt::aiassist::resolveId(full.left(12), {full}), std::optional<QString>(full));
        QVERIFY(!nt::aiassist::resolveId(full.left(11), {full}));
        QVERIFY(!nt::aiassist::resolveId(full.left(12), {full, "123456789abc00000000000000000000"}));
        QCOMPARE(nt::aiassist::resolveId("legacy", {"legacy"}), std::optional<QString>("legacy"));
        const QString legacy = "123456789abc" + QString(20, 'z');
        QVERIFY(!nt::aiassist::resolveId(legacy.left(12), {legacy}));
        QCOMPARE(nt::aiassist::resolveId(legacy, {legacy}), std::optional<QString>(legacy));
        const auto newlineLegacy = full + "\n";
        QVERIFY(!nt::aiassist::resolveId(full.left(12), {newlineLegacy}));
        QCOMPARE(nt::aiassist::resolveId(newlineLegacy, {newlineLegacy}), std::optional<QString>(newlineLegacy));
        QVERIFY(!nt::aiassist::resolveId(full.left(12) + "\n", {full}));
        QVERIFY(!nt::aiassist::resolveId(full.left(11) + "\n", {full}));
        QVERIFY(!nt::aiassist::resolveId(full.left(13), {full}));
    }
    void rippleTranscript() {
        QJsonObject doc{{"id", "sequence"}, {"clips", QJsonArray{
            QJsonObject{{"id", "voice"}, {"trackId", "audio"}, {"mediaType", "audio"}, {"startMs", 0}, {"durationMs", 1000}, {"inPointMs", 0}, {"caption", QJsonObject{{"words", QJsonArray{
                QJsonObject{{"word", "um"}, {"startMs", 100}, {"endMs", 200}},
                QJsonObject{{"word", "hello"}, {"startMs", 200}, {"endMs", 500}}
            }}}}},
            QJsonObject{{"id", "broll"}, {"trackId", "video"}, {"startMs", 1200}, {"durationMs", 500}}
        }}};
        const auto changed = nt::aiassist::removeFillers(doc, {});
        const auto clips = changed.value("clips").toArray();
        QCOMPARE(clips.size(), 3);
        QCOMPARE(clips.last().toObject().value("startMs").toDouble(), 1100.0);
        auto locked = doc;
        auto values = locked.value("clips").toArray();
        auto clip = values.first().toObject(); clip.insert("locked", true); values[0] = clip;
        locked.insert("clips", values);
        QCOMPARE(nt::aiassist::removeFillers(locked, {}), locked);
    }
    void correctionPreservesTiming() {
        QJsonObject doc{{"id", "sequence"}, {"clips", QJsonArray{QJsonObject{{"id", "clip"}, {"caption", QJsonObject{{"words", QJsonArray{QJsonObject{{"word", "helo"}, {"startMs", 50}, {"endMs", 100}}}}}}}}}};
        const auto updated = nt::aiassist::correctTranscript(doc, {{"clipId", "clip"}, {"wordIndex", 0}, {"text", "hello"}});
        QCOMPARE(nt::aiassist::transcript(updated).at(0).toObject().value("word").toString(), QString("hello"));
        QCOMPARE(nt::aiassist::transcript(updated).at(0).toObject().value("startMs").toInt(), 50);
        QVERIFY(!nt::aiassist::acceptsResult(doc, updated));
        QVERIFY(nt::aiassist::acceptsResult(doc, doc));
        QCOMPARE(nt::aiassist::correctTranscript(doc, {{"clipId", "clip"}, {"wordIndex", 1e100}, {"text", "hello"}}), doc);
    }
};
QTEST_GUILESS_MAIN(AssistTest)
#include "tst_aiassist.moc"
