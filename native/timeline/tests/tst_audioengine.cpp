// The audio engine around the mix, on miniaudio's null backend (no sound):
//   - the audio mode a command line selects, from the parsed options, so
//     `--opt value` and `--opt=value` agree (review F2);
//   - a `stopped` then `started` notification: the device facts come back
//     running, under a new generation (F5);
//   - decoders close once their clip has played out, and a clip whose file
//     cannot be opened is reported (F6).

#include "audio/AudioEngine.h"
#include "audio/AudioMode.h"
#include "audio/AudioSource.h"
#include <QProcess>
#include <QTemporaryDir>

#include <QCommandLineParser>
#include <QtTest>

#include <algorithm>
#include <atomic>
#include <cmath>
#include <chrono>
#include <thread>
#ifdef Q_OS_UNIX
#include <sys/stat.h>
#endif

using namespace nt;
using namespace nt::audio;

namespace {

// The options main() declares that matter here, with the same names.
QString modeFor(const QStringList& args) {
    QCommandLineParser parser;
    parser.addPositionalArgument(QStringLiteral("fixture"), QString());
    for (const char* valued : {"audio", "play-stills", "stills", "still-frames", "size", "seek", "screenshot",
                               "scrub-script", "realtime", "frames", "audio-latency-ms", "audio-report", "decode"}) {
        parser.addOption(QCommandLineOption(QString::fromLatin1(valued), QString(), QStringLiteral("V")));
    }
    for (const char* flag : {"bench", "play", "background", "ui-bench", "teardown-test", "on-top", "audio-dry-run", "chat"}) {
        parser.addOption(QCommandLineOption(QString::fromLatin1(flag), QString()));
    }
    QStringList argv{QStringLiteral("nodetool-timeline"), QStringLiteral("f.json")};
    argv << args;
    if (!parser.parse(argv)) return QStringLiteral("parse error: ") + parser.errorText();
    return resolveAudioMode(parser);
}

std::int64_t nowNs() {
    return std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now().time_since_epoch())
        .count();
}

void play(AudioEngine& engine, double fromMs) {
    playback::TransportCommand cmd;
    cmd.seq = 1;
    cmd.playing = true;
    cmd.rate = 1.0;
    cmd.seekSeq = 1;
    cmd.seekMs = fromMs;
    cmd.seekIssuedNs = nowNs();
    engine.feed().command.store(cmd);
}

}  // namespace

class TstAudioEngine : public QObject {
    Q_OBJECT

private slots:
    void specialFilesDoNotBlockAudioOpen() {
#ifdef Q_OS_UNIX
        QTemporaryDir dir;
        const auto path = dir.filePath("blocked.wav").toStdString();
        QCOMPARE(::mkfifo(path.c_str(), 0600), 0);
        std::string error;
        auto source = AudioSource::open(path, 48000, &error);
        QVERIFY(!source);
        QCOMPARE(error, std::string("audio source must be a regular file"));
#else
        QSKIP("POSIX FIFO coverage");
#endif
    }
    void delayedAudioKeepsContainerOffset() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const auto path = dir.filePath("delayed.mp4");
        QProcess ffmpeg;
        ffmpeg.start("ffmpeg", {"-v", "error", "-f", "lavfi", "-i", "color=c=black:s=64x64:r=30:d=2",
            "-itsoffset", "1", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1",
            "-c:v", "mpeg4", "-c:a", "aac", "-y", path});
        QVERIFY(ffmpeg.waitForFinished(10000));
        QCOMPARE(ffmpeg.exitCode(), 0);
        std::string error;
        auto source = AudioSource::open(path.toStdString(), 48000, &error);
        QVERIFY2(source, error.c_str());
        const auto pcm = source->readAll();
        QVERIFY(pcm.size() >= 57600 * 2);
        const auto peak = [&](int from, int to) {
            float result = 0;
            for (int i = from * 48 * 2; i < to * 48 * 2; ++i) { result = std::max(result, std::abs(pcm.at(i))); }
            return result;
        };
        QCOMPARE(peak(0, 900), 0.f);
        QVERIFY(peak(1100, 1200) > .05f);
        QVERIFY(source->seek(24000));
        std::vector<float> middle(4800 * 2);
        QCOMPARE(source->read(middle.data(), 4800), std::int64_t(4800));
        QVERIFY(std::ranges::all_of(middle, [](float x) { return x == 0; }));

        const auto audioPath = dir.filePath("audio-only.mka");
        ffmpeg.start("ffmpeg", {"-v", "error", "-itsoffset", "2", "-f", "lavfi", "-i",
            "sine=frequency=440:sample_rate=48000:duration=1", "-c:a", "pcm_s16le", "-y", audioPath});
        QVERIFY(ffmpeg.waitForFinished(10000));
        QCOMPARE(ffmpeg.exitCode(), 0);
        auto audioOnly = AudioSource::open(audioPath.toStdString(), 48000, &error);
        QVERIFY2(audioOnly, error.c_str());
        const auto standalone = audioOnly->readAll();
        QVERIFY(standalone.size() >= 4800 * 2 && standalone.size() <= 48100 * 2);
        QVERIFY(std::ranges::any_of(standalone.begin(), standalone.begin() + 4800 * 2,
            [](float x) { return std::abs(x) > .05f; }));

        const auto delayedVideo = dir.filePath("delayed-video.mp4");
        ffmpeg.start("ffmpeg", {"-v", "error", "-itsoffset", "1", "-f", "lavfi", "-i",
            "color=c=black:s=64x64:r=30:d=1", "-f", "lavfi", "-i",
            "sine=frequency=440:sample_rate=48000:duration=2", "-c:v", "mpeg4", "-fps_mode", "passthrough", "-c:a", "aac", "-y", delayedVideo});
        QVERIFY(ffmpeg.waitForFinished(10000));
        QCOMPARE(ffmpeg.exitCode(), 0);
        auto preroll = AudioSource::open(delayedVideo.toStdString(), 48000, &error);
        QVERIFY2(preroll, error.c_str());
        const auto trimmed = preroll->readAll();
        QVERIFY(trimmed.size() >= 47000 * 2 && trimmed.size() < 49000 * 2);
    }
    void audioModeFromParsedOptions() {
        QCOMPARE(modeFor({}), QStringLiteral("system"));
        QCOMPARE(modeFor({"--play"}), QStringLiteral("system"));
        QCOMPARE(modeFor({"--chat", "--play"}), QStringLiteral("system"));
        QCOMPARE(modeFor({"--size", "800x600", "--seek=500", "--play"}), QStringLiteral("system"));
        // Both spellings of every automated mode select no audio.
        QCOMPARE(modeFor({"--play-stills", "/tmp/x", "--still-frames", "1"}), QStringLiteral("none"));
        QCOMPARE(modeFor({"--play-stills=/tmp/x", "--still-frames=1"}), QStringLiteral("none"));
        QCOMPARE(modeFor({"--stills=/tmp/x"}), QStringLiteral("none"));
        QCOMPARE(modeFor({"--screenshot=/tmp/x.png"}), QStringLiteral("none"));
        QCOMPARE(modeFor({"--scrub-script=s.json"}), QStringLiteral("none"));
        QCOMPARE(modeFor({"--bench"}), QStringLiteral("none"));
        QCOMPARE(modeFor({"--background"}), QStringLiteral("none"));
        QCOMPARE(modeFor({"--ui-bench"}), QStringLiteral("none"));
        QCOMPARE(modeFor({"--frames=10"}), QStringLiteral("none"));
        // An explicit --audio wins, in both spellings.
        QCOMPARE(modeFor({"--play-stills=/tmp/x", "--audio=null"}), QStringLiteral("null"));
        QCOMPARE(modeFor({"--audio", "none"}), QStringLiteral("none"));
    }

    void startedAfterStoppedRunsAgain() {
        AudioEngine engine;
        AudioEngine::Options options;
        options.backend = AudioEngine::Backend::Null;
        std::string error;
        QVERIFY2(engine.start(options, &error), error.c_str());
        const auto before = engine.feed().device.load();
        QVERIFY(before.running);
        // The first `started` (the device start itself) changes nothing.
        engine.simulateDeviceNotification(true);
        QCOMPARE(engine.feed().device.load().generation, before.generation);
        engine.simulateDeviceNotification(false);
        QVERIFY(!engine.feed().device.load().running);
        engine.simulateDeviceNotification(true);
        const auto after = engine.feed().device.load();
        QVERIFY(after.running);
        QCOMPARE(after.generation, before.generation + 1);
        engine.stop();
    }

    // 100 clips of 100 ms back to back and one clip with no file. After 4 s
    // of play the decoders of the clips that played out are closed.
    void decodersCloseAndFailuresAreReported() {
        auto tl = std::make_shared<Timeline>();
        Track t;
        t.id = "a";
        t.type = TrackType::Audio;
        tl->tracks = {t};
        for (int i = 0; i < 100; ++i) {
            Clip c;
            c.id = "c" + std::to_string(i);
            c.trackId = "a";
            c.mediaType = MediaType::Audio;
            c.status = "generated";
            c.startMs = i * 100.0;
            c.durationMs = 100.0;
            c.inPointMs = (i % 50) * 100.0;
            c.mediaPath = NT_FIXTURES_DIR "/media/tone-220-48k-mono.wav";
            tl->clips.push_back(c);
        }
        Clip missing = tl->clips[0];
        missing.id = "missing";
        missing.startMs = 200.0;
        missing.mediaPath = NT_FIXTURES_DIR "/media/no-such-file.wav";
        tl->clips.push_back(missing);
        tl->durationMs = 10000.0;

        AudioEngine engine;
        engine.setTimeline(tl);
        AudioEngine::Options options;
        options.backend = AudioEngine::Backend::Null;
        std::string error;
        QVERIFY2(engine.start(options, &error), error.c_str());
        play(engine, 0.0);
        std::this_thread::sleep_for(std::chrono::milliseconds(4000));
        const AudioEngine::Stats s = engine.stats();
        engine.stop();
        qInfo("opened %lld, evicted %lld, open %lld, open failures %lld", static_cast<long long>(s.sourcesOpened),
              static_cast<long long>(s.sourcesEvicted), static_cast<long long>(s.openSources),
              static_cast<long long>(s.openFailures));
        // About 70 clips came within the 3 s lookahead; those that played
        // out (about 40) are closed again.
        QVERIFY(s.sourcesOpened >= 60);
        QVERIFY(s.sourcesEvicted >= 30);
        QVERIFY(s.openSources <= 35);
        QCOMPARE(s.openFailures, std::int64_t(1));
        QCOMPARE(s.failures.size(), std::size_t(1));
        QVERIFY(QString::fromStdString(s.failures[0]).startsWith(QStringLiteral("missing: ")));
        QCOMPARE(s.underruns, std::int64_t(0));
    }

    // N2: Control-thread timeline edits must share a single serialized writer to feed.device
    // with device notifications and must not overwrite a stopped device state back to running.
    void n2_deviceSeqlockSingleWriterAndStoppedStatePreserved() {
        auto off = std::make_shared<Timeline>();
        off->durationMs = 1000.0;
        off->raw.insert(QStringLiteral("master"), QJsonObject{{QStringLiteral("volumeDb"), 0.0},
                                                              {QStringLiteral("limiter"), false}});
        auto on = std::make_shared<Timeline>(*off);
        on->raw.insert(QStringLiteral("master"), QJsonObject{{QStringLiteral("volumeDb"), 0.0},
                                                             {QStringLiteral("limiter"), true}});

        AudioEngine engine;
        engine.setTimeline(off);
        AudioEngine::Options opts;
        opts.backend = AudioEngine::Backend::Manual;
        opts.sampleRate = 48000;
        opts.simulatedLatencySec = 0.010;
        std::string err;
        QVERIFY2(engine.start(opts, &err), err.c_str());

        // Part A: If the OS notified the engine that the device stopped, a subsequent timeline edit
        // must not re-publish running=true over the stopped state.
        engine.simulateDeviceNotification(false);
        QVERIFY(!engine.feed().device.load().running);
        engine.setTimeline(on);
        QVERIFY2(!engine.feed().device.load().running,
                 "publishPlan overwrote stopped device state back to running=true");
        engine.simulateDeviceNotification(true);
        QVERIFY(engine.feed().device.load().running);

        // Part B: Concurrent control-thread edits and device reroute notifications must never
        // corrupt the DeviceInfo seqlock sequence counter or publish negative/torn latency.
        std::atomic<bool> done{false};
        std::thread rerouter([&] {
            for (int i = 0; i < 4000; ++i) {
                engine.simulateDeviceChange((i & 1) ? 0.020 : 0.010);
            }
            done.store(true, std::memory_order_release);
        });
        std::thread editor([&] {
            for (int i = 0; !done.load(std::memory_order_acquire) && i < 4000; ++i) {
                engine.setTimelineAsync((i & 1) ? on : off);
            }
        });
        std::uint64_t lastGen = 0;
        bool readerFailed = false;
        bool tornLatency = false;
        while (!done.load(std::memory_order_acquire)) {
            playback::DeviceInfo info;
            if (!engine.feed().device.tryLoad(info, 50000)) {
                readerFailed = true;
                break;
            }
            if (info.generation < lastGen) {
                readerFailed = true;
                break;
            }
            lastGen = info.generation;
            if (!std::isfinite(info.outputLatencySec) || info.outputLatencySec < 0.009) {
                tornLatency = true;
                break;
            }
        }
        rerouter.join();
        editor.join();
        playback::DeviceInfo finalInfo;
        const bool coherentAfter = engine.feed().device.tryLoad(finalInfo, 50000);
        engine.stop();
        QVERIFY2(!readerFailed && coherentAfter, "DeviceInfo seqlock corrupted or stuck odd under concurrent writes");
        QVERIFY2(!tornLatency, "DeviceInfo published torn outputLatencySec");
    }

    // Round 3 N2: Device notifications must hand feed.device publication to the non-audio worker thread
    // instead of acquiring a mutex and publishing directly on the notification thread.
    void r3_n2_deviceNotificationHandedToNonAudioWriter() {
        AudioEngine engine;
        AudioEngine::Options opts;
        opts.backend = AudioEngine::Backend::Manual;
        opts.sampleRate = 48000;
        opts.simulatedLatencySec = 0.010;
        std::string err;
        QVERIFY2(engine.start(opts, &err), err.c_str());
        // Let the worker settle into idle wait.
        QTest::qWait(30);
        const std::int64_t wakesBefore = engine.stats().workerWakes;
        const std::uint64_t genBefore = engine.feed().device.load().generation;
        for (int i = 0; i < 10; ++i) {
            engine.simulateDeviceNotification(false);
            QVERIFY(!engine.feed().device.load().running);
            engine.simulateDeviceNotification(true);
            QVERIFY(engine.feed().device.load().running);
        }
        const std::int64_t wakesAfter = engine.stats().workerWakes;
        const std::uint64_t genAfter = engine.feed().device.load().generation;
        QCOMPARE(genAfter, genBefore + 10);
        QVERIFY2(wakesAfter >= wakesBefore + 20,
                 qPrintable(QStringLiteral("N2 device notifications did not hand publication to the non-audio worker "
                                           "(workerWakes delta=%1, expected >= 20)")
                                .arg(wakesAfter - wakesBefore)));

        // Lock-free audio-loop notification path (PulseAudio): invoking notification handler
        // without blocking or locking while control-thread edits run still hands publication
        // to the non-audio worker thread cleanly.
        auto off = std::make_shared<Timeline>();
        off->durationMs = 1000.0;
        off->raw.insert(QStringLiteral("master"), QJsonObject{{QStringLiteral("volumeDb"), 0.0},
                                                              {QStringLiteral("limiter"), false}});
        auto on = std::make_shared<Timeline>(*off);
        on->raw.insert(QStringLiteral("master"), QJsonObject{{QStringLiteral("volumeDb"), 0.0},
                                                             {QStringLiteral("limiter"), true}});

        std::atomic<bool> stopEdits{false};
        std::thread editor([&] {
            for (int i = 0; !stopEdits.load(std::memory_order_acquire) && i < 2000; ++i) {
                engine.setTimelineAsync((i & 1) ? on : off);
            }
        });
        engine.simulateDeviceNotificationAsync(false);
        QTRY_VERIFY(!engine.feed().device.load().running);
        const std::uint64_t genStopped = engine.feed().device.load().generation;
        engine.simulateDeviceNotificationAsync(true);
        QTRY_VERIFY(engine.feed().device.load().running);
        QCOMPARE(engine.feed().device.load().generation, genStopped + 1);
        stopEdits.store(true, std::memory_order_release);
        editor.join();
        engine.stop();
    }
};

QTEST_GUILESS_MAIN(TstAudioEngine)
#include "tst_audioengine.moc"
