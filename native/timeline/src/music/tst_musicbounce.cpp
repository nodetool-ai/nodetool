// The context bounce of MUSIC-MODE.md 14.3 and its MM5 exit items:
//   - exit 3: the dry bounce of a 48 kHz clip whose fader, pan, clip gain,
//     fades, effects, automation and master level are all off unity equals
//     the asset's PCM within 1e-6 over the window;
//   - exit 4: the mix bounce equals a null-device recording of the same range
//     with the target track muted, within 1e-6 per sample;
//   - the float WAV writer holds samples bit for bit, beyond 16-bit range;
//   - `--music-bounce` writes the same window as a float WAV;
//   - MusicBounce renders on its worker, uploads the WAV with the
//     generation-context mark (MR10), and cancels.

#include "../../tests/TestHttpServer.h"
#include "assets/AssetWav.h"
#include "audio/AudioEngine.h"
#include "music/MusicBounce.h"
#include "music/MusicTime.h"
#include "playback/AudioClockFeed.h"

#include <QElapsedTimer>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QProcess>
#include <QSignalSpy>
#include <QTcpServer>
#include <QTemporaryDir>
#include <QtTest>

#include <chrono>
#include <cmath>
#include <cstring>
#include <random>
#include <thread>

using namespace nt;
using namespace nt::music;

namespace {

constexpr std::int64_t kRate = 48000;
constexpr int kPeriod = 480;

std::vector<float> noise(std::int64_t frames, unsigned seed, float level) {
    std::mt19937 rng(seed);
    std::uniform_real_distribution<float> dist(-level, level);
    std::vector<float> out(static_cast<std::size_t>(frames) * 2);
    for (auto& sample : out) sample = dist(rng);
    return out;
}

// The float WAV's samples, read back from the file's data chunk.
std::vector<float> readFloatWav(const QString& path) {
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly)) return {};
    const auto bytes = file.readAll();
    const auto at = bytes.indexOf("data");
    if (at < 0 || bytes.mid(20, 2) != QByteArray::fromHex("0300")) return {};
    quint32 size = 0;
    std::memcpy(&size, bytes.constData() + at + 4, 4);
    std::vector<float> out(size / 4);
    std::memcpy(out.data(), bytes.constData() + at + 8, size);
    return out;
}

Track audioTrack(const std::string& id) {
    Track t;
    t.id = id;
    t.type = TrackType::Audio;
    t.raw = QJsonObject{{"id", QString::fromStdString(id)}, {"type", "audio"}};
    return t;
}

Clip audioClip(const std::string& id, const std::string& track, const QString& path, double startMs, double durationMs) {
    Clip c;
    c.id = id;
    c.trackId = track;
    c.mediaType = MediaType::Audio;
    c.status = "generated";
    c.startMs = startMs;
    c.durationMs = durationMs;
    c.mediaPath = path.toStdString();
    c.raw = QJsonObject{{"id", QString::fromStdString(id)}, {"trackId", QString::fromStdString(track)}, {"mediaType", "audio"}};
    return c;
}

QJsonArray gainEffect(double db) {
    return {QJsonObject{{"id", "fx"}, {"type", "gain"}, {"enabled", true}, {"gainDb", db}}};
}

QJsonArray panAutomation() {
    return {QJsonObject{{"target", QJsonObject{{"kind", "mixer"}, {"param", "pan"}}},
                        {"points", QJsonArray{QJsonObject{{"timeMs", 0}, {"value", -1}},
                                              QJsonObject{{"timeMs", 20000}, {"value", 1}}}}}};
}

double worstDifference(const std::vector<float>& a, const float* b, std::size_t count) {
    double worst = 0;
    for (std::size_t i = 0; i < count; ++i) worst = std::max(worst, static_cast<double>(std::abs(a[i] - b[i])));
    return worst;
}

std::int64_t steadyNs() {
    return std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now().time_since_epoch())
        .count();
}

}  // namespace

class TestMusicBounce : public QObject {
    Q_OBJECT
    QTemporaryDir m_dir;
    QString m_target;  // 12 s of noise, the asset of the target clip
    QString m_other;
    std::vector<float> m_targetPcm;

    // The target clip on "b" starts at 1 s and plays the asset from 0.5 s.
    // Everything on and around it is off unity.
    Timeline document() const {
        Timeline tl;
        tl.tracks = {audioTrack("a"), audioTrack("b"), audioTrack("c")};
        tl.tracks[0].pan = -0.5;
        tl.tracks[0].volumeDb = -3;
        tl.tracks[0].raw.insert("effects", gainEffect(-2));
        tl.tracks[1].volumeDb = -6;
        tl.tracks[1].pan = 0.4;
        tl.tracks[1].raw.insert("effects", gainEffect(-5));
        tl.tracks[1].raw.insert("automation", panAutomation());
        tl.tracks[2].volumeDb = 2;
        Clip a = audioClip("a", "a", m_other, 0, 11000);
        a.fadeInMs = 40;
        Clip b = audioClip("b", "b", m_target, 1000, 10000);
        b.inPointMs = 500;
        b.volumeDb = -4;
        b.fadeInMs = 50;
        b.fadeOutMs = 80;
        b.raw.insert("audioEffects", gainEffect(-1));
        Clip c = audioClip("c", "c", m_other, 2000, 3000);
        c.inPointMs = 100;
        c.fadeOutMs = 30;
        tl.clips = {a, b, c};
        tl.masterVolumeDb = -1.5;
        tl.raw = QJsonObject{{"master", QJsonObject{{"volumeDb", -1.5}, {"effects", gainEffect(-1)}}}};
        tl.durationMs = 12000;
        tl.indexClips();
        return tl;
    }

private slots:
    void initTestCase() {
        qRegisterMetaType<nt::music::BounceResult>();
        QVERIFY(m_dir.isValid());
        m_target = m_dir.filePath("target.wav");
        m_other = m_dir.filePath("other.wav");
        // Peaks past 1.0: a 16-bit writer would clip them; the float one must not.
        m_targetPcm = noise(12 * kRate, 7, 1.4f);
        QVERIFY(nt::assets::writeStereoFloatWav(m_target, m_targetPcm));
        QVERIFY(nt::assets::writeStereoFloatWav(m_other, noise(12 * kRate, 11, 0.5f)));
    }

    void floatWavHoldsSamplesBitForBit() {
        const auto back = readFloatWav(m_target);
        QCOMPARE(back.size(), m_targetPcm.size());
        QCOMPARE(std::memcmp(back.data(), m_targetPcm.data(), back.size() * sizeof(float)), 0);
        QFile file(m_target);
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto header = file.read(58);
        // The server's encodeFloatWav layout: fmt 18 bytes, format 3, 2 channels, 48 kHz, 32 bits, fact.
        QCOMPARE(header.mid(12, 4), QByteArray("fmt "));
        QCOMPARE(header.mid(16, 4), QByteArray::fromHex("12000000"));
        QCOMPARE(header.mid(20, 4), QByteArray::fromHex("03000200"));
        QCOMPARE(header.mid(24, 4), QByteArray::fromHex("80bb0000"));
        QCOMPARE(header.mid(34, 2), QByteArray::fromHex("2000"));
        QCOMPARE(header.mid(38, 4), QByteArray("fact"));
        QCOMPARE(header.mid(50, 4), QByteArray("data"));
        QVERIFY(!nt::assets::writeStereoFloatWav(m_dir.filePath("odd.wav"), std::vector<float>(3)));
    }

    // MM5 exit 3.
    void dryBounceEqualsAssetPcm() {
        const auto tl = document();
        const std::int64_t start = kRate;          // the clip start
        const std::int64_t frames = 10 * kRate;    // the whole clip
        std::vector<std::string> problems;
        const auto dry = renderBounce(tl, BounceKind::Dry, "b", start, frames, &problems);
        QVERIFY2(problems.empty(), problems.empty() ? "" : problems.front().c_str());
        QCOMPARE(dry.size(), static_cast<std::size_t>(frames) * 2);
        // The clip reads the asset from 500 ms: frame 24000.
        const float* asset = m_targetPcm.data() + 24000 * 2;
        const double worst = worstDifference(dry, asset, dry.size());
        QVERIFY2(worst <= 1e-6, qPrintable(QString::number(worst)));
        // The check has something to find: playback of the same window is not the asset.
        const auto mix = audio::renderOffline(tl, static_cast<int>(kRate), 1000, 10000);
        QVERIFY(worstDifference(mix, asset, mix.size()) > 0.01);
        // A window that starts before the clip is silent there.
        const auto early = renderBounce(tl, BounceKind::Dry, "b", kRate / 2, kRate);
        QCOMPARE(early.size(), static_cast<std::size_t>(kRate) * 2);
        for (std::size_t i = 0; i < static_cast<std::size_t>(kRate); ++i) QCOMPARE(early[i], 0.0f);
        QVERIFY(worstDifference(std::vector<float>(early.begin() + kRate, early.end()), m_targetPcm.data() + 24000 * 2,
                                static_cast<std::size_t>(kRate)) <= 1e-6);
    }

    void bounceCopiesLeaveTheSourceAlone() {
        const auto tl = document();
        const auto dry = bounceTimeline(tl, BounceKind::Dry, "b");
        QCOMPARE(dry.tracks.size(), std::size_t(1));
        QCOMPARE(dry.clips.size(), std::size_t(1));
        QVERIFY(!dry.tracks[0].raw.contains("effects"));
        QVERIFY(!dry.tracks[0].raw.contains("automation"));
        QVERIFY(!dry.clips[0].raw.contains("audioEffects"));
        QVERIFY(!dry.raw.value("master").toObject().contains("effects"));
        QCOMPARE(dry.clips[0].inPointMs, 500.0);
        const auto mix = bounceTimeline(tl, BounceKind::Mix, "b");
        QCOMPARE(mix.tracks.size(), std::size_t(3));
        QVERIFY(mix.tracks[1].muted);
        QVERIFY(!mix.tracks[0].muted && !mix.tracks[2].muted);
        QCOMPARE(mix.tracks[1].volumeDb, -6.0);
        QCOMPARE(mix.clips.size(), std::size_t(3));
        QVERIFY(!tl.tracks[1].muted);
        QCOMPARE(tl.tracks[1].raw.value("effects").toArray().size(), 1);
    }

    // MM5 exit 4, on the null device in real time.
    void mixBounceEqualsMutedRecording() {
        const auto tl = document();
        const double fromMs = 1500;
        const std::int64_t start = msToFrame(fromMs);
        const std::int64_t frames = kRate;  // 1 s over clips a and c and the muted b
        const auto bounce = renderBounce(tl, BounceKind::Mix, "b", start, frames);
        QCOMPARE(bounce.size(), static_cast<std::size_t>(frames) * 2);

        // The recording side mutes "b" by hand, not through bounceTimeline.
        auto muted = std::make_shared<Timeline>(tl);
        muted->tracks[1].muted = true;
        audio::AudioEngine engine;
        engine.setTimeline(muted);
        audio::AudioEngine::Options options;
        options.backend = audio::AudioEngine::Backend::Null;
        options.sampleRate = static_cast<int>(kRate);
        options.periodFrames = kPeriod;
        options.recordSeconds = 2.0;
        std::string error;
        QVERIFY2(engine.start(options, &error), error.c_str());
        playback::TransportCommand command;
        command.seq = 1;
        command.seekSeq = 1;
        command.rate = 1.0;
        command.seekMs = fromMs;
        command.seekIssuedNs = steadyNs();
        engine.feed().command.store(command);
        std::this_thread::sleep_for(std::chrono::milliseconds(150));
        command.seq = 2;
        command.seekSeq = 2;
        command.playing = true;
        command.seekIssuedNs = steadyNs();
        engine.feed().command.store(command);
        QTRY_VERIFY_WITH_TIMEOUT(engine.stats().framesRendered >= 2 * kRate, 8000);
        const playback::CallbackState cb = engine.feed().callback.load();
        const auto stats = engine.stats();
        engine.stop();
        const auto recording = engine.recording();
        std::int64_t first = -1;
        for (int i = 0; i < cb.anchorCount; ++i) {
            const auto& anchor = cb.anchors[i];
            if (anchor.playing && anchor.seek && anchor.timelineMs == fromMs) first = anchor.frame;
        }
        QVERIFY2(first >= 0, "no play anchor at the range start");
        QVERIFY(static_cast<std::size_t>((first + frames) * 2) <= recording.size());
        QCOMPARE(stats.underruns, std::int64_t(0));
        const double worst = worstDifference(bounce, recording.data() + first * 2, bounce.size());
        QVERIFY2(worst <= 1e-6, qPrintable(QString::number(worst)));
        // The muted track was audible in the window, so the mute was tested.
        const auto unmuted = audio::renderOffline(tl, static_cast<int>(kRate), fromMs, 1000);
        QVERIFY(worstDifference(unmuted, bounce.data(), bounce.size()) > 0.01);
    }

    void cliWritesTheWindow() {
        QJsonObject document{{"id", "music"}, {"name", "Music"}, {"fps", 30}, {"width", 640}, {"height", 360}, {"durationMs", 12000},
            {"tracks", QJsonArray{QJsonObject{{"id", "a"}, {"type", "audio"}, {"index", 0}, {"volumeDb", -3}},
                                  QJsonObject{{"id", "b"}, {"type", "audio"}, {"index", 1}, {"volumeDb", -6}, {"pan", 0.4}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "a"}, {"trackId", "a"}, {"name", "a"}, {"mediaType", "audio"}, {"startMs", 0}, {"durationMs", 11000},
                                             {"mediaPath", m_other}, {"status", "generated"}, {"locked", false}, {"versions", QJsonArray{}}},
                                 QJsonObject{{"id", "b"}, {"trackId", "b"}, {"name", "b"}, {"mediaType", "audio"}, {"startMs", 1000}, {"durationMs", 10000},
                                             {"inPointMs", 500}, {"fadeInMs", 50}, {"volumeDb", -4}, {"mediaPath", m_target},
                                             {"status", "generated"}, {"locked", false}, {"versions", QJsonArray{}}}}},
            {"markers", QJsonArray{}}};
        const auto fixture = m_dir.filePath("music.json");
        {
            QFile file(fixture);
            QVERIFY(file.open(QIODevice::WriteOnly));
            file.write(QJsonDocument(document).toJson());
        }
        const auto out = m_dir.filePath("dry.wav");
        QProcess process;
        process.start(QStringLiteral(NT_TIMELINE_BINARY), {fixture, "--music-bounce", out, "--kind", "dry", "--track", "b",
                                                           "--start-frame", "48000", "--frames", "96000"});
        QVERIFY(process.waitForFinished(60000));
        QVERIFY2(process.exitCode() == 0, process.readAllStandardError().constData());
        const auto report = QJsonDocument::fromJson(process.readAllStandardOutput().trimmed()).object();
        QCOMPARE(report.value("frames").toInteger(), 96000);
        QVERIFY(report.value("problems").toArray().isEmpty());
        const auto written = readFloatWav(out);
        QCOMPARE(written.size(), std::size_t(96000 * 2));
        QVERIFY(worstDifference(written, m_targetPcm.data() + 24000 * 2, written.size()) <= 1e-6);
        QProcess bad;
        bad.start(QStringLiteral(NT_TIMELINE_BINARY), {fixture, "--music-bounce", out, "--kind", "wet", "--track", "b", "--frames", "10"});
        QVERIFY(bad.waitForFinished(60000));
        QCOMPARE(bad.exitCode(), 2);
    }

    void workerUploadsWithTheContextMark() {
        TestHttpServer http;
        QByteArray uploaded;
        http.setPost([&](const QByteArray& path, const QByteArray& body) {
            if (path == "/api/assets") uploaded = body;
            return QByteArray(R"({"id":"0123456789abcdef0123456789abcdef","name":"bounce.wav","content_type":"audio/wav"})");
        });
        MusicBounce bounce;
        QSignalSpy finished(&bounce, &MusicBounce::finished);
        MusicBounce::Job job;
        job.timeline = document();
        job.kind = BounceKind::Dry;
        job.targetTrackId = "b";
        job.startFrame = kRate;
        job.frames = kRate;
        job.upload = nt::server::SaveTarget{http.base(), {}, "timeline", m_dir.path()};
        job.metadata = QJsonObject{{"music_job_id", "job"}};
        QVERIFY(bounce.start(job));
        QVERIFY(bounce.running());
        QVERIFY(!bounce.start(job));
        QTRY_COMPARE_WITH_TIMEOUT(finished.count(), 1, 30000);
        const auto result = finished.first().first().value<BounceResult>();
        QVERIFY2(result.ok, qPrintable(result.error));
        QCOMPARE(result.assetId, QStringLiteral("0123456789abcdef0123456789abcdef"));
        QVERIFY(!bounce.running());
        QVERIFY(uploaded.contains(R"("generation_context":"music")"));
        QVERIFY(uploaded.contains(R"("music_job_id":"job")"));
        QVERIFY(uploaded.contains(R"("bounce":"dry")"));
        // The multipart file part is the float WAV of the window.
        const auto riff = uploaded.indexOf("RIFF");
        QVERIFY(riff >= 0);
        QCOMPARE(uploaded.mid(riff + 20, 2), QByteArray::fromHex("0300"));
    }

    // Backlog M12: Cancel, a document switch or quitting destroys a bounce on
    // the GUI thread. The destructor joins the worker, so an upload that does
    // not stop on interruption freezes the window until the upload ends. The
    // server here accepts the connection and never reads, as a slow link does
    // with a large window: the upload stalls with the request half sent.
    void destroyingAStalledUploadReturnsQuickly_data() {
        QTest::addColumn<QString>("expectedInstance");
        QTest::newRow("plain upload") << QString();
        // The bundled server's path: the instance proof goes over a raw socket.
        QTest::newRow("instance-checked upload") << QStringLiteral("instance");
    }

    void destroyingAStalledUploadReturnsQuickly() {
        QFETCH(QString, expectedInstance);
        QTcpServer stalled;
        QVERIFY(stalled.listen(QHostAddress::LocalHost));
        auto bounce = std::make_unique<MusicBounce>();
        MusicBounce::Job job;
        job.timeline = document();
        job.kind = BounceKind::Mix;
        job.targetTrackId = "b";
        job.startFrame = 0;
        // 40 s of float stereo, 15 MB: far more than the socket buffers hold.
        job.frames = 40 * kRate;
        job.upload = nt::server::SaveTarget{QUrl(QStringLiteral("http://127.0.0.1:%1").arg(stalled.serverPort())), {},
                                            "timeline", m_dir.path(), expectedInstance};
        QVERIFY(bounce->start(job));
        QVERIFY(stalled.waitForNewConnection(60000));
        // Let the client fill the socket buffers and block on the write.
        QTest::qWait(500);
        QVERIFY(bounce->running());
        QElapsedTimer elapsed;
        elapsed.start();
        bounce.reset();
        QVERIFY2(elapsed.elapsed() < 1000, qPrintable(QStringLiteral("the destructor took %1 ms").arg(elapsed.elapsed())));
    }

    void destroyingARunningBounceJoinsIt() {
        {
            MusicBounce bounce;
            QSignalSpy finished(&bounce, &MusicBounce::finished);
            MusicBounce::Job job;
            job.timeline = document();
            job.kind = BounceKind::Mix;
            job.targetTrackId = "b";
            job.startFrame = 0;
            job.frames = 11 * kRate;
            job.wavPath = m_dir.filePath("cancelled.wav");
            QVERIFY(bounce.start(job));
            bounce.cancel();
            QTRY_COMPARE_WITH_TIMEOUT(finished.count(), 1, 30000);
            const auto result = finished.first().first().value<BounceResult>();
            QVERIFY(!result.ok);
            QVERIFY(result.cancelled);
            QVERIFY(bounce.start(job));
        }
        // The second bounce was running; the destructor interrupted and joined it.
        QCoreApplication::processEvents();
    }
};

QTEST_GUILESS_MAIN(TestMusicBounce)
#include "tst_musicbounce.moc"
