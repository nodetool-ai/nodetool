#include "assets/AssetClip.h"
#include "assets/AssetDrop.h"
#include "assets/AssetWav.h"
#include <QTemporaryDir>
#include <QtEndian>
#include <array>
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <QtTest>

class TestAssets : public QObject {
    Q_OBJECT
private slots:
    void wavHeaderAndSamples() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const auto path = dir.filePath("audio.wav");
        const std::array<float, 4> samples{-1.0f, 1.0f, 0.0f, 0.5f};
        QVERIFY(nt::assets::writeStereoWav(path, samples));
        QFile file(path);
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto bytes = file.readAll();
        QCOMPARE(bytes.size(), 52);
        QCOMPARE(bytes.first(4), QByteArray("RIFF"));
        QCOMPARE(qFromLittleEndian<quint32>(bytes.constData() + 4), 44U);
        QCOMPARE(bytes.mid(8, 8), QByteArray("WAVEfmt "));
        QCOMPARE(qFromLittleEndian<quint32>(bytes.constData() + 16), 16U);
        QCOMPARE(qFromLittleEndian<quint16>(bytes.constData() + 20), 1U);
        QCOMPARE(qFromLittleEndian<quint16>(bytes.constData() + 22), 2U);
        QCOMPARE(qFromLittleEndian<quint32>(bytes.constData() + 24), 48000U);
        QCOMPARE(qFromLittleEndian<quint32>(bytes.constData() + 28), 192000U);
        QCOMPARE(qFromLittleEndian<quint16>(bytes.constData() + 32), 4U);
        QCOMPARE(qFromLittleEndian<quint16>(bytes.constData() + 34), 16U);
        QCOMPARE(bytes.mid(36, 4), QByteArray("data"));
        QCOMPARE(qFromLittleEndian<quint32>(bytes.constData() + 40), 8U);
        QCOMPARE(qFromLittleEndian<qint16>(bytes.constData() + 44), -32768);
        QCOMPARE(qFromLittleEndian<qint16>(bytes.constData() + 46), 32767);
        QCOMPARE(qFromLittleEndian<qint16>(bytes.constData() + 48), 0);
        QCOMPARE(qFromLittleEndian<qint16>(bytes.constData() + 50), 16384);
        QVERIFY(!nt::assets::writeStereoWav(path, std::span(samples).first(3)));
    }
    void settleOutcomes() {
        const auto dropped = nt::assets::dropAsset({{"tracks", QJsonArray{}}, {"clips", QJsonArray{}}},
            {{"asset", QJsonObject{{"id", "v"}, {"name", "take.mp4"}, {"content_type", "video/mp4"}, {"duration", 2}}}});
        const auto id = dropped.value("clips").toArray()[1].toObject().value("id");
        const auto settled = nt::assets::settleLinkedAudio(dropped, {{"audioClipId", id}, {"outcome", "audio"},
            {"asset", QJsonObject{{"id", "wav"}, {"duration", 1.2345}}}});
        const auto audio = settled.value("clips").toArray()[1].toObject();
        QCOMPARE(audio.value("status").toString(), QString("generated"));
        QCOMPARE(audio.value("currentAssetId").toString(), QString("wav"));
        QCOMPARE(audio.value("durationMs").toInt(), 1235);
        const auto fallback = nt::assets::settleLinkedAudio(dropped, {{"audioClipId", id}, {"outcome", "audio"},
            {"asset", QJsonObject{{"id", "wav"}}}});
        QCOMPARE(fallback.value("clips").toArray()[1].toObject().value("durationMs").toInt(), 2000);
        const auto failed = nt::assets::settleLinkedAudio(dropped, {{"audioClipId", id}, {"outcome", "failed"}});
        QCOMPARE(failed.value("clips").toArray()[1].toObject().value("status").toString(), QString("failed"));
        const auto silent = nt::assets::settleLinkedAudio(dropped, {{"audioClipId", id}, {"outcome", "silent"}});
        QCOMPARE(silent.value("clips").toArray().size(), 1);
        QVERIFY(!silent.value("clips").toArray()[0].toObject().contains("linkId"));
        QCOMPARE(silent.value("tracks"), dropped.value("tracks"));
        QCOMPARE(nt::assets::settleLinkedAudio(dropped, {{"audioClipId", "missing"}, {"outcome", "silent"}}), dropped);
    }
    void importedClip() {
        const auto clip = nt::assets::assetToClip({{"id", "asset"}, {"name", "take.mp4"},
            {"content_type", "video/mp4"}, {"duration", 1.2345}}, "video", 200);
        QVERIFY2(clip.has_value(), "supported video asset must produce a clip");
        QCOMPARE(clip->value("durationMs").toInt(), 1235);
    }
    void linkedVideoAudioIsOneUndoCommand_data() {
        QTest::addColumn<QString>("mode");
        QTest::addColumn<bool>("occupied");
        for (const auto& mode : {QStringLiteral("overlap"), QStringLiteral("overwrite"), QStringLiteral("insert")}) {
            QTest::newRow(qPrintable(mode + "-free")) << mode << false;
            QTest::newRow(qPrintable(mode + "-occupied")) << mode << true;
        }
    }
    void linkedVideoAudioIsOneUndoCommand() {
        QFETCH(QString, mode);
        QFETCH(bool, occupied);
        auto parsed = nt::parseTimelineJson(R"({"fps":30,"width":640,"height":360,"durationMs":10000,
            "tracks":[{"id":"v","name":"Video","type":"video","index":0},
                      {"id":"a","name":"Audio","type":"audio","index":1}],"clips":[]})");
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        if (occupied) {
            model.replaceClips(QJsonArray{QJsonObject{{"id", "existing"}, {"trackId", "a"},
                {"mediaType", "audio"}, {"startMs", 0}, {"durationMs", 9000}}});
        }
        const auto before = model.documentJson();
        QVERIFY2(model.applyEdit("assets.dropAsset", {{"asset", QJsonObject{{"id", "media"},
            {"name", "take.mp4"}, {"content_type", "video/mp4"}, {"duration", 2.0}}},
            {"trackId", "v"}, {"startMs", 1000}, {"mode", mode}}),
            "video drop must create a linked video and audio pair");
        const auto clips = model.clipsJson();
        QCOMPARE(clips.size(), occupied ? 3 : 2);
        const auto video = clips[occupied ? 1 : 0].toObject();
        const auto audio = clips[occupied ? 2 : 1].toObject();
        QCOMPARE(video.value("currentAssetId").toString(), QString("media"));
        QVERIFY(!video.value("linkId").toString().isEmpty());
        QCOMPARE(audio.value("linkId"), video.value("linkId"));
        QCOMPARE(audio.value("name").toString(), QString("take.mp4 (audio)"));
        QCOMPARE(audio.value("mediaType").toString(), QString("audio"));
        QCOMPARE(audio.value("sourceType").toString(), QString("imported"));
        QCOMPARE(audio.value("status").toString(), QString("generating"));
        QCOMPARE(audio.value("startMs"), video.value("startMs"));
        QCOMPARE(audio.value("durationMs"), video.value("durationMs"));
        QVERIFY(!audio.contains("currentAssetId"));
        QCOMPARE(audio.value("trackId").toString() == "a", !occupied);
        QCOMPARE(model.tracks()->rowCount(), occupied ? 3 : 2);
        if (occupied) { QCOMPARE(clips.first().toObject().value("durationMs").toInt(), 9000); }
        QCOMPARE(model.undoStack()->count(), 1);
        const auto after = model.documentJson();
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
        model.undoStack()->redo();
        QCOMPARE(model.documentJson(), after);
    }
    void emptyAreaAndRefusals() {
        const QJsonObject raw{{"tracks", QJsonArray{}}, {"clips", QJsonArray{}}, {"custom", "kept"}};
        const QJsonObject payload{{"asset", QJsonObject{{"id", "media"}, {"name", "take.mp4"},
            {"content_type", "video/mp4"}}}, {"startMs", 120}, {"mode", "overlap"}};
        const auto dropped = nt::assets::dropAsset(raw, payload);
        QCOMPARE(dropped.value("tracks").toArray().size(), 2);
        QCOMPARE(dropped.value("clips").toArray().size(), 2);
        QCOMPARE(dropped.value("custom").toString(), QString("kept"));
        auto onto = payload;
        onto.insert("trackId", "target");
        auto document = raw;
        document.insert("tracks", QJsonArray{QJsonObject{{"id", "target"}, {"type", "audio"}}});
        QCOMPARE(nt::assets::dropAsset(document, onto), document);
        document.insert("tracks", QJsonArray{QJsonObject{{"id", "target"}, {"type", "video"}, {"locked", true}}});
        QCOMPARE(nt::assets::dropAsset(document, onto), document);
        document.insert("tracks", QJsonArray{QJsonObject{{"id", "target"}, {"type", "overlay"}}});
        QCOMPARE(nt::assets::dropAsset(document, onto).value("clips").toArray().size(), 1);
    }
    void largeOccupiedAudioTrackList() {
        QJsonArray tracks{QJsonObject{{"id", "v"}, {"type", "video"}, {"index", 0}}};
        QJsonArray clips;
        for (int i = 0; i < 32000; ++i) {
            const auto id = QString::number(i);
            tracks.append(QJsonObject{{"id", "a" + id}, {"type", "audio"}, {"index", i + 1}});
            clips.append(QJsonObject{{"id", "c" + id}, {"trackId", "a" + id}, {"mediaType", "audio"},
                {"startMs", 0}, {"durationMs", 8000}});
        }
        const auto dropped = nt::assets::dropAsset({{"tracks", tracks}, {"clips", clips}},
            {{"asset", QJsonObject{{"id", "media"}, {"name", "take.mp4"}, {"content_type", "video/mp4"}}},
             {"trackId", "v"}, {"startMs", 1000}, {"mode", "overlap"}});
        QCOMPARE(dropped.value("tracks").toArray().size(), 32002);
        QCOMPARE(dropped.value("clips").toArray().size(), 32002);
    }
    void emptyAreaReindexesLikeWebAddTrack() {
        const QJsonObject raw{{"tracks", QJsonArray{
            QJsonObject{{"id", "first"}, {"type", "video"}, {"index", 4}},
            QJsonObject{{"id", "second"}, {"type", "audio"}, {"index", 8}}}}, {"clips", QJsonArray{}}};
        const auto dropped = nt::assets::dropAsset(raw,
            {{"asset", QJsonObject{{"id", "media"}, {"name", "still.png"}, {"content_type", "image/png"}}}});
        const auto tracks = dropped.value("tracks").toArray();
        QCOMPARE(tracks.size(), 3);
        QCOMPARE(tracks[0].toObject().value("index").toInt(), 0);
        QCOMPARE(tracks[1].toObject().value("index").toInt(), 1);
        QCOMPARE(tracks[2].toObject().value("index").toInt(), 2);
    }
};
QTEST_GUILESS_MAIN(TestAssets)
#include "tst_assets.moc"
