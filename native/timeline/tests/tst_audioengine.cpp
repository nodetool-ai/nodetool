// The audio engine around the mix, on miniaudio's null backend (no sound):
//   - the audio mode a command line selects, from the parsed options, so
//     `--opt value` and `--opt=value` agree (review F2);
//   - a `stopped` then `started` notification: the device facts come back
//     running, under a new generation (F5);
//   - decoders close once their clip has played out, and a clip whose file
//     cannot be opened is reported (F6).

#include "audio/AudioEngine.h"
#include "audio/AudioMode.h"

#include <QCommandLineParser>
#include <QtTest>

#include <chrono>
#include <thread>

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
    for (const char* flag : {"bench", "play", "background", "ui-bench", "teardown-test", "on-top", "audio-dry-run"}) {
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
    void audioModeFromParsedOptions() {
        QCOMPARE(modeFor({}), QStringLiteral("system"));
        QCOMPARE(modeFor({"--play"}), QStringLiteral("system"));
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
};

QTEST_GUILESS_MAIN(TstAudioEngine)
#include "tst_audioengine.moc"
