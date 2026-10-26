#include "assets/AssetClip.h"
#include "assets/AssetDrop.h"
#include "assets/AssetWav.h"
#include <QTemporaryDir>
#include <QtEndian>
#include <array>
#include <algorithm>
#include <functional>
#include <limits>
#include <optional>
#include <vector>
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <QtTest>

namespace {
constexpr auto chunkFrames = nt::assets::stereoWavChunkFrames;

std::optional<quint64> writeFromReader(const QString& path, const nt::assets::StereoWavReader& read,
                                      const std::function<bool()>& interrupted,
                                      std::size_t& peakSamples,
                                      quint32 maxDataBytes = std::numeric_limits<quint32>::max() - 36) {
    return nt::assets::writeStereoWavStream(path, [&](std::span<float> buffer) {
        peakSamples = std::max(peakSamples, buffer.size());
        return read(buffer);
    }, interrupted, maxDataBytes);
}
}

class TestAssets : public QObject {
    Q_OBJECT
private slots:
    void wavStreamingMatchesWholeWriter() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        std::vector<float> samples((chunkFrames * 2 + 17) * 2);
        const std::array<float, 8> values{-2, -1, -0.5f, 0, 0.5f, 1, 2,
            std::numeric_limits<float>::quiet_NaN()};
        for (std::size_t i = 0; i < samples.size(); ++i) { samples[i] = values[i % values.size()]; }
        QVERIFY(nt::assets::writeStereoWav(dir.filePath("whole.wav"), samples));
        std::size_t offset = 0;
        std::size_t peakSamples = 0;
        int reads = 0;
        const auto frames = writeFromReader(dir.filePath("stream.wav"), [&](std::span<float> buffer) {
            ++reads;
            const auto count = std::min(buffer.size(), samples.size() - offset);
            std::copy_n(samples.begin() + offset, count, buffer.begin());
            offset += count;
            return static_cast<qint64>(count / 2);
        }, [] { return false; }, peakSamples);
        QVERIFY(frames);
        QCOMPARE(*frames, samples.size() / 2);
        QVERIFY(reads >= 4); // Includes a partial final chunk and EOF.
        QFile whole(dir.filePath("whole.wav"));
        QFile stream(dir.filePath("stream.wav"));
        QVERIFY(whole.open(QIODevice::ReadOnly));
        QVERIFY(stream.open(QIODevice::ReadOnly));
        QCOMPARE(stream.readAll(), whole.readAll());
    }
    void wavStreamingKeepsOneChunk() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        std::size_t peakSamples = 0;
        int reads = 0;
        const auto frames = writeFromReader(dir.filePath("bounded.wav"), [&](std::span<float> buffer) {
            if (++reads > 16) { return qint64(0); }
            std::fill(buffer.begin(), buffer.end(), 0.25f);
            return static_cast<qint64>(buffer.size() / 2);
        }, [] { return false; }, peakSamples);
        QVERIFY(frames);
        QVERIFY2(peakSamples <= chunkFrames * 2, qPrintable(QString("peak buffered samples %1 exceed one chunk (%2)")
            .arg(peakSamples).arg(chunkFrames * 2)));
    }
    void wavStreamingInterruptsEndlessReader() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const auto path = dir.filePath("cancelled.wav");
        std::size_t peakSamples = 0;
        int reads = 0;
        constexpr int cancelAfter = 3;
        const auto frames = writeFromReader(path, [&](std::span<float> buffer) {
            if (++reads > 16) { return qint64(0); } // Hang guard for the old readAll path.
            std::fill(buffer.begin(), buffer.end(), 0.25f);
            return static_cast<qint64>(buffer.size() / 2);
        }, [&] { return reads >= cancelAfter; }, peakSamples);
        QVERIFY(!frames);
        QVERIFY(!QFile::exists(path));
        QVERIFY2(reads <= cancelAfter + 1, qPrintable(QString("interruption read %1 chunks, expected at most %2")
            .arg(reads).arg(cancelAfter + 1)));
    }
    void wavStreamingRejectsOverLimit() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const auto path = dir.filePath("too-large.wav");
        std::size_t peakSamples = 0;
        int reads = 0;
        const auto frames = writeFromReader(path, [&](std::span<float> buffer) {
            if (++reads > 2) { return qint64(0); }
            std::fill_n(buffer.begin(), 8, 0.25f);
            return qint64(4);
        }, [] { return false; }, peakSamples, 16);
        QVERIFY2(!frames, "WAV exceeding the data byte limit must fail");
        QVERIFY(!QFile::exists(path));
        QCOMPARE(reads, 2);
    }
    void wavStreamingRejectsBadReads_data() {
        QTest::addColumn<qint64>("lastRead");
        QTest::addColumn<bool>("dataFirst");
        QTest::newRow("empty") << qint64(0) << false;
        QTest::newRow("decode-error") << qint64(-1) << false;
        QTest::newRow("decode-error-after-data") << qint64(-1) << true;
        QTest::newRow("oversized-read") << qint64(chunkFrames + 1) << false;
    }
    void wavStreamingRejectsBadReads() {
        QFETCH(qint64, lastRead);
        QFETCH(bool, dataFirst);
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const auto path = dir.filePath("preserved.wav");
        QFile previous(path);
        QVERIFY(previous.open(QIODevice::WriteOnly));
        QCOMPARE(previous.write("original"), 8);
        previous.close();
        int reads = 0;
        const auto frames = nt::assets::writeStereoWavStream(path, [&](std::span<float> buffer) {
            if (++reads == 1 && dataFirst) {
                std::fill(buffer.begin(), buffer.end(), 0.25f);
                return static_cast<qint64>(buffer.size() / 2);
            }
            return lastRead;
        }, [] { return false; });
        QVERIFY(!frames);
        QVERIFY(previous.open(QIODevice::ReadOnly));
        QCOMPARE(previous.readAll(), QByteArray("original"));
    }
    void wavStreamingCancelsAtReadBoundaries_data() {
        QTest::addColumn<int>("cancelAtRead");
        QTest::newRow("before-first-read") << 0;
        QTest::newRow("after-data-read") << 1;
        QTest::newRow("at-eof") << 2;
    }
    void wavStreamingCancelsAtReadBoundaries() {
        QFETCH(int, cancelAtRead);
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const auto path = dir.filePath("cancelled.wav");
        int reads = 0;
        const auto frames = nt::assets::writeStereoWavStream(path, [&](std::span<float> buffer) {
            std::fill(buffer.begin(), buffer.end(), 0.25f);
            return ++reads == 1 ? qint64(1) : qint64(0);
        }, [&] { return reads >= cancelAtRead; });
        QVERIFY(!frames);
        QVERIFY(!QFile::exists(path));
        QCOMPARE(reads, cancelAtRead);
    }
    void wavStreamingAcceptsExactLimit() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const auto path = dir.filePath("exact.wav");
        int reads = 0;
        const auto frames = nt::assets::writeStereoWavStream(path, [&](std::span<float> buffer) {
            if (++reads > 2) { return qint64(0); }
            std::fill_n(buffer.begin(), 8, 0.25f);
            return qint64(4);
        }, [] { return false; }, 32);
        QVERIFY(frames);
        QCOMPARE(*frames, 8U);
        QFile wav(path);
        QVERIFY(wav.open(QIODevice::ReadOnly));
        const auto bytes = wav.readAll();
        QCOMPARE(bytes.size(), 76);
        QCOMPARE(qFromLittleEndian<quint32>(bytes.constData() + 4), 68U);
        QCOMPARE(qFromLittleEndian<quint32>(bytes.constData() + 40), 32U);
    }
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
