#include "aiassist/TranscriptBeats.h"
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonArray>
#include <QSet>
#include <QtTest>
class TranscriptBeatsTest : public QObject {
    Q_OBJECT
private slots:
    void webFixture() {
        QFile file(QFileInfo(QString::fromUtf8(__FILE__)).absolutePath() + "/fixtures/beats-web.json");
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto fixture = QJsonDocument::fromJson(file.readAll()).object();
        QVERIFY(!fixture.value("cases").toArray().isEmpty());
        for (const auto& value : fixture.value("cases").toArray()) {
            const auto test = value.toObject();
            QCOMPARE(nt::aiassist::reflowTranscript(test.value("timeline").toObject(), test.value("payload").toObject()), test.value("expected").toObject());
        }
        const auto added = fixture.value("added").toObject();
        QCOMPARE(nt::aiassist::addTranscriptBeat(added.value("timeline").toObject(), added.value("payload").toObject()), added.value("expected").toObject());
        const auto deleted = fixture.value("deleted").toObject();
        const auto original = deleted.value("timeline").toObject();
        auto actual = nt::aiassist::deleteTranscriptParagraph(original, deleted.value("payload").toObject());
        QSet<QString> originalIds;
        for (const auto& clip : original.value("clips").toArray()) { originalIds.insert(clip.toObject().value("id").toString()); }
        auto clips = actual.value("clips").toArray(); int generated = 0;
        for (qsizetype i = 0; i < clips.size(); ++i) {
            auto clip = clips.at(i).toObject();
            if (!originalIds.contains(clip.value("id").toString())) { clip.insert("id", "generated-" + QString::number(generated++)); clips[i] = clip; }
        }
        actual.insert("clips", clips);
        QCOMPARE(actual, deleted.value("expected").toObject());
    }
    void editsAndTakeReflow() {
        const QJsonObject first{{"id", "first"}, {"trackId", "audio"}, {"bindingKind", "text-to-audio"}, {"prompt", "Hello"}, {"startMs", 0}, {"durationMs", 3000}, {"currentAssetId", "old"}};
        const QJsonObject second{{"id", "second"}, {"trackId", "audio"}, {"bindingKind", "text-to-audio"}, {"startMs", 3500}, {"durationMs", 3000}};
        const QJsonObject timeline{{"clips", QJsonArray{first, second}}, {"tracks", QJsonArray{QJsonObject{{"id", "audio"}, {"type", "audio"}}}}};
        const auto edited = nt::aiassist::setTranscriptBeatText(timeline, {{"clipId", "first"}, {"text", "Changed"}});
        QCOMPARE(edited.value("clips").toArray().at(0).toObject().value("status").toString(), QString("stale"));
        const QJsonObject payload{{"clipId", "first"}, {"assetId", "new"}, {"versionId", "version"}, {"createdAt", "date"}, {"durationMs", 1000}, {"promptSnapshot", "Hello"}, {"words", QJsonArray{QJsonObject{{"word", "Hello"}, {"startMs", 0}, {"endMs", 1000}}}}};
        const auto result = nt::aiassist::applyTranscriptBeatTake(timeline, payload);
        const auto clips = result.value("clips").toArray();
        QCOMPARE(clips.at(1).toObject().value("startMs").toInt(), 1500);
        QCOMPARE(clips.at(0).toObject().value("activeTakeId").toString(), QString("version"));
        QCOMPARE(clips.at(0).toObject().value("versions").toArray().at(0).toObject().value("paramOverridesSnapshot").toObject().value("prompt").toString(), QString("Hello"));
        QCOMPARE(nt::aiassist::applyTranscriptBeatTake(edited, payload), edited);
        auto locked = timeline;
        locked.insert("tracks", QJsonArray{QJsonObject{{"id", "audio"}, {"type", "audio"}, {"locked", true}}});
        QCOMPARE(nt::aiassist::applyTranscriptBeatTake(locked, payload), locked);
    }
    void trailingNewlineDoesNotCreateResourcePrefix() {
        const QString full = QStringLiteral("123456789abc123456789abc12345678");
        const auto legacy = full + "\n";
        const QJsonObject clip{{"id", legacy}, {"bindingKind", "text-to-audio"}, {"startMs", 0}, {"durationMs", 3000}, {"prompt", "Original"}};
        const QJsonObject document{{"clips", QJsonArray{clip}}};
        QCOMPARE(nt::aiassist::setTranscriptBeatText(document, {{"clipId", full.left(12)}, {"text", "Changed"}}), document);
        QVERIFY(nt::aiassist::setTranscriptBeatText(document, {{"clipId", legacy}, {"text", "Changed"}}) != document);
        auto canonicalClip = clip; canonicalClip.insert("id", full);
        const QJsonObject canonical{{"clips", QJsonArray{canonicalClip}}};
        for (const auto& input : QStringList{full.left(11), full.left(13), full.left(12) + "\n", full.left(11) + "\n"}) {
            QCOMPARE(nt::aiassist::setTranscriptBeatText(canonical, {{"clipId", input}, {"text", "Changed"}}), canonical);
        }
    }
    void malformedLegacyIdHasNoPrefixAlias() {
        const QString legacy = QStringLiteral("123456789abc") + QString(20, QChar(u'z'));
        const QJsonObject clip{{"id", legacy}, {"bindingKind", "text-to-audio"}, {"startMs", 0}, {"durationMs", 3000}, {"prompt", "Original"}};
        const QJsonObject document{{"clips", QJsonArray{clip}}};
        const auto refused = nt::aiassist::setTranscriptBeatText(document, {{"clipId", legacy.left(12)}, {"text", "Changed"}});
        QCOMPARE(refused, document);
        const auto accepted = nt::aiassist::setTranscriptBeatText(document, {{"clipId", legacy}, {"text", "Changed"}});
        QCOMPARE(accepted.value("clips").toArray().at(0).toObject().value("prompt").toString(), QString("Changed"));
    }
    void reflowManyShortIds() {
        QJsonArray clips, order;
        for (int i = 0; i < 10000; ++i) {
            const auto full = QString::number(i, 16).rightJustified(12, QChar(u'0')) + QString(20, QChar(u'0'));
            clips.append(QJsonObject{{"id", full}, {"bindingKind", "text-to-audio"}, {"startMs", i * 3000.0}, {"durationMs", 3000}});

        }
        for (qsizetype i = clips.size(); i > 0; --i) { order.append(clips.at(i - 1).toObject().value("id").toString().left(12)); }
        const auto result = nt::aiassist::reflowTranscript({{"clips", clips}}, {{"orderedClipIds", order}});
        QCOMPARE(result.value("clips").toArray().size(), 10000);
        QCOMPARE(result.value("durationMs").toDouble(), 30000000);
    }
};
QTEST_GUILESS_MAIN(TranscriptBeatsTest)
#include "tst_transcriptbeats.moc"
