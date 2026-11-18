// The loudness meter inside the real audio engine, on the null device (no sound): the device callback fills the
// readout while other threads read it and ask for resets. Run under ThreadSanitizer (the `tsan` preset) to check
// that the audio path has no race.

#include "audio/AudioEngine.h"
#include "audio/loudness/LiveLoudness.h"
#include "model/TimelineTypes.h"
#include "playback/AudioClockFeed.h"

#include <QCoreApplication>
#include <QDir>
#include <QFile>
#include <QTemporaryDir>
#include <QtTest>

#include <atomic>
#include <chrono>
#include <cmath>
#include <memory>
#include <thread>

using namespace nt;

namespace {
constexpr int kRate = 48000;

void writeToneWav(const QString& path, double seconds, double hz, float amp) {
    QFile file(path);
    QVERIFY2(file.open(QIODevice::WriteOnly), "open wav");
    const auto frames = static_cast<std::uint32_t>(seconds * kRate);
    const auto bytes = frames * 8;
    const auto put32 = [&](std::uint32_t v) { file.write(reinterpret_cast<const char*>(&v), 4); };
    const auto put16 = [&](std::uint16_t v) { file.write(reinterpret_cast<const char*>(&v), 2); };
    file.write("RIFF"); put32(36 + bytes); file.write("WAVEfmt "); put32(16); put16(3); put16(2); put32(kRate); put32(kRate * 8);
    put16(8); put16(32); file.write("data"); put32(bytes);
    for (std::uint32_t i = 0; i < frames; ++i) {
        const float v = static_cast<float>(amp * std::sin(2.0 * M_PI * hz * i / kRate));
        file.write(reinterpret_cast<const char*>(&v), 4);
        file.write(reinterpret_cast<const char*>(&v), 4);
    }
}
}  // namespace

class TestLoudnessEngine : public QObject {
    Q_OBJECT
private slots:
    void readersAndResetsRaceTheCallbackSafely() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const auto path = dir.filePath("tone.wav");
        writeToneWav(path, 6, 997, 0.1f);
        auto timeline = std::make_shared<Timeline>();
        Track track;
        track.id = "a";
        track.type = TrackType::Audio;
        timeline->tracks = {track};
        Clip clip;
        clip.id = "c";
        clip.trackId = "a";
        clip.mediaType = MediaType::Audio;
        clip.status = "generated";
        clip.startMs = 0;
        clip.durationMs = 6000;
        clip.mediaPath = path.toStdString();
        timeline->clips = {clip};
        timeline->durationMs = 6000;

        audio::LoudnessReadout readout;
        audio::AudioEngine engine;
        engine.setTimeline(timeline);
        audio::AudioEngine::Options options;
        options.backend = audio::AudioEngine::Backend::Null;
        options.sampleRate = kRate;
        options.loudness = &readout;
        std::string error;
        QVERIFY2(engine.start(options, &error), error.c_str());
        playback::TransportCommand command;
        command.seq = 1;
        command.playing = true;
        command.rate = 1.0;
        command.seekSeq = 1;
        command.seekMs = 0;
        command.seekIssuedNs = std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now().time_since_epoch()).count();
        engine.feed().command.store(command);

        std::atomic<bool> stop{false};
        std::atomic<int> bad{0};
        std::atomic<std::uint64_t> lastBlocks{0};
        const auto reader = [&] {
            std::uint64_t seen = 0;
            while (!stop.load()) {
                const auto r = readout.read();
                if (r.blocks < seen) ++bad;
                seen = r.blocks;
                for (double v : {r.momentary, r.shortTerm, r.integrated, r.truePeakDb}) {
                    if (std::isnan(v) || v > 30.0) ++bad;
                }
                lastBlocks.store(r.blocks);
            }
        };
        std::thread a(reader), b(reader), resets([&] {
            while (!stop.load()) {
                readout.requestReset();
                std::this_thread::sleep_for(std::chrono::milliseconds(40));
            }
        });
        QTest::qWait(3500);
        stop.store(true);
        a.join();
        b.join();
        resets.join();
        engine.stop();
        QCOMPARE(bad.load(), 0);
        QVERIFY2(lastBlocks.load() > 50, "the callback published while playing");
    }
};

QTEST_GUILESS_MAIN(TestLoudnessEngine)
#include "tst_loudnessengine.moc"
