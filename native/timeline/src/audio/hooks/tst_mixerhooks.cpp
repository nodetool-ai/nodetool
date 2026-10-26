#include "audio/hooks/MixerHooks.h"
#include "audio/AudioEngine.h"
#include "audio/hooks/OutputDevice.h"
#include <QtTest>
#include <array>
#include <atomic>
#include <thread>
#include <chrono>
#include <QJsonArray>
#include <cmath>

namespace {
nt::Timeline document() {
    nt::Timeline timeline;
    nt::Track track; track.id = "a"; track.type = nt::TrackType::Audio;
    timeline.tracks.push_back(track);
    nt::Clip clip; clip.id = "clip"; clip.trackId = "a"; clip.mediaType = nt::MediaType::Audio;
    clip.status = "generated"; clip.mediaPath = "unused.wav"; clip.durationMs = 8;
    timeline.clips.push_back(clip);
    return timeline;
}
void play(nt::audio::AudioEngine& engine) {
    nt::playback::TransportCommand command;
    command.seq = command.seekSeq = 1; command.playing = true; command.rate = 1;
    command.seekMs = 350;
    command.seekIssuedNs = std::chrono::duration_cast<std::chrono::nanoseconds>(
        std::chrono::steady_clock::now().time_since_epoch()).count();
    engine.feed().command.store(command);
}
nt::Timeline deviceDocument() {
    auto timeline = document();
    timeline.durationMs = timeline.clips[0].durationMs = 1000;
    timeline.clips[0].mediaPath = NT_FIXTURES_DIR "/media/tone-220-48k-mono.wav";
    return timeline;
}
class HalfGain : public nt::audio::ParameterSource {
public:
    double valueAt(double, double base) const noexcept override { return base * 0.5; }
};
}
class TestMixerHooks : public QObject {
    Q_OBJECT
    std::vector<nt::audio::MixPlanStageToken> m_tokens;
private slots:
    void cleanup() {
        for (auto token : m_tokens) { nt::audio::unregisterMixPlanStage(token); }
        m_tokens.clear();
        nt::audio::clearOutputDeviceProvider();
    }
    void selectsNullDeviceByName() {
        using namespace nt::audio;
        std::string picked;
        registerOutputDeviceProvider([&picked](std::span<const std::string> names) {
            if (!names.empty()) { picked = names.front(); }
            return picked;
        });
        AudioEngine engine;
        std::string error;
        QVERIFY2(engine.start({}, &error), error.c_str());
        const auto stats = engine.stats();
        engine.stop();
        QVERIFY2(!picked.empty(), "AudioEngine must ask the device provider before initialization");
        QVERIFY(stats.selectedDevice);
        QCOMPARE(stats.deviceName, picked);
        registerOutputDeviceProvider([](std::span<const std::string>) { return "missing device"; });
        AudioEngine fallback;
        QVERIFY2(fallback.start({}, &error), error.c_str());
        const auto defaultStats = fallback.stats();
        fallback.stop();
        QVERIFY(!defaultStats.selectedDevice);
        QCOMPARE(defaultStats.deviceName, picked);
    }
    void expandsAndSilencesSegments() {
        using namespace nt::audio;
        m_tokens.push_back(registerVoiceExpander("test", [](const nt::Clip&, const VoicePlan&) {
            return std::vector<VoiceSegment>{{0, 4, 0, 2, false}, {4, 4, 0, -1, true}};
        }));
        const auto plan = buildMixPlan(document());
        QCOMPARE(plan.voices.size(), std::size_t(2));
        QCOMPARE(plan.voices.front().sourceFrameAt(2, 1000), 4.0);
        std::array<float, 32> input; input.fill(1);
        std::array<VoicePcm, 2> pcm{};
        for (auto& voice : pcm) { voice.linear = input.data(); voice.linearCount = 16; }
        std::array<float, 16> output{};
        MixStats stats;
        mixBlock(plan, pcm.data(), 1000, 0, 1, 8, output.data(), stats);
        for (int i = 0; i < 8; ++i) { QCOMPARE(output[i], 1.0f); }
        for (int i = 8; i < 16; ++i) { QCOMPARE(output[i], 0.0f); }
    }
    void publishedHooksSurviveConcurrentRegistration() {
        using namespace nt::audio;
        const auto token = registerGainEnvelope("snapshot", [](const nt::Clip&, const VoicePlan&) {
            return std::make_shared<const HalfGain>();
        });
        const auto plan = buildMixPlan(document());
        unregisterMixPlanStage(token);
        std::array<float, 16> input; input.fill(1);
        std::atomic<bool> ready{false}, valid{true};
        std::jthread audio([&] {
            VoicePcm pcm; pcm.linear = input.data(); pcm.linearCount = 8;
            std::array<float, 16> output{};
            MixStats stats;
            ready.store(true, std::memory_order_release);
            for (int i = 0; i < 1000; ++i) {
                mixBlock(plan, &pcm, 48000, 0, 1000.0/48000, 8, output.data(), stats);
                for (float sample : output) {
                    if (sample != 0.5f) { valid.store(false); }
                }
            }
            if (stats.preparations != 0) { valid.store(false); }
        });
        while (!ready.load(std::memory_order_acquire)) { std::this_thread::yield(); }
        for (int i = 0; i < 1000; ++i) {
            const auto other = registerGainEnvelope("new", [](const nt::Clip&, const VoicePlan&) {
                return std::make_shared<const HalfGain>();
            });
            unregisterMixPlanStage(other);
        }
        audio.join();
        QVERIFY(valid.load());
    }
    void expandedVoicesKeepTheClipFadeWindow() {
        using namespace nt::audio;
        m_tokens.push_back(registerVoiceExpander("fade segments", [](const nt::Clip&, const VoicePlan&) {
            return std::vector<VoiceSegment>{{0,4,0,1,false}, {4,4,4,1,false}};
        }));
        auto timeline = document(); timeline.clips[0].fadeInMs = 8;
        const auto plan = buildMixPlan(timeline);
        std::array<float, 16> input; input.fill(1);
        std::array<VoicePcm, 2> pcm{};
        for (auto& source : pcm) { source.linear = input.data(); source.linearCount = 8; }
        std::array<float, 16> output{};
        MixStats stats;
        mixBlock(plan, pcm.data(), 1000, 0, 1, 8, output.data(), stats);
        QCOMPARE(output[8], 0.5f);
        QCOMPARE(output[14], 0.875f);
    }
    void expandedClipSharesCompressorState_data() {
        QTest::addColumn<int>("splitFrame");
        QTest::addColumn<int>("secondOffset");
        QTest::addColumn<bool>("silentFirst");
        QTest::newRow("quantum boundary") << 2048 << 0 << false;
        QTest::newRow("inside quantum") << 2037 << 0 << false;
        QTest::newRow("gap") << 2037 << 256 << false;
        QTest::newRow("overlap") << 2037 << -256 << false;
        QTest::newRow("silent first segment") << 2037 << 0 << true;
    }
    void expandedClipSharesCompressorState() {
        using namespace nt::audio;
        QFETCH(int, splitFrame);
        QFETCH(int, secondOffset);
        QFETCH(bool, silentFirst);
        constexpr int frames = 8192;
        constexpr int renderFrames = frames + 2048;
        constexpr double rate = 48000;
        constexpr double step = 1000 / rate;
        auto timeline = document();
        timeline.clips[0].durationMs = frames * step;
        timeline.clips[0].raw.insert("audioEffects", QJsonArray{QJsonObject{
            {"id", "compress"}, {"type", "compressor"}, {"enabled", true},
            {"thresholdDb", -30}, {"ratio", 12}, {"attackMs", 10}, {"releaseMs", 200}}});
        const auto reference = buildMixPlan(timeline);
        m_tokens.push_back(registerVoiceExpander("segments", [=](const nt::Clip&, const VoicePlan& voice) {
            const double split = splitFrame * step;
            const double second = (splitFrame + secondOffset) * step;
            return std::vector<VoiceSegment>{{0, split, 0, 1, silentFirst},
                {second, voice.durationMs - second, second, 1, false}};
        }));
        const auto expanded = buildMixPlan(timeline);
        QCOMPARE(expanded.voices.size(), std::size_t{2});
        std::vector<float> input(frames * 2, 0.8f), referenceInput(input);
        std::vector<float> expected(renderFrames * 2), actual(renderFrames * 2);
        for (int f = 0; f < frames; ++f) {
            const float value = (f < splitFrame && !silentFirst ? 0.8f : 0) +
                (f >= splitFrame + secondOffset ? 0.8f : 0);
            referenceInput[2 * f] = referenceInput[2 * f + 1] = value;
        }
        VoicePcm source; source.linear = referenceInput.data(); source.linearCount = frames;
        auto segmentSource = source; segmentSource.linear = input.data();
        std::array<VoicePcm, 2> sources{segmentSource, segmentSource};
        MixStats stats;
        mixBlock(reference, &source, rate, 0, step, renderFrames, expected.data(), stats);
        mixBlock(expanded, sources.data(), rate, 0, step, renderFrames, actual.data(), stats);
        const auto matches = [&] {
            for (std::size_t i = 0; i < actual.size(); ++i) {
                if (!std::isfinite(actual[i]) || !std::isfinite(expected[i]) ||
                    std::abs(actual[i] - expected[i]) > 1e-6f) { return false; }
            }
            return true;
        };
        QVERIFY2(matches(), "expanded clip must match the unsplit compressor, including its segment boundary and tail");
        QCOMPARE(expanded.voices[0].processors.size() + expanded.voices[1].processors.size(), std::size_t{1});
        // A discontinuous seek must reset the clip's sole chain.
        mixBlock(expanded, sources.data(), rate, 0, step, renderFrames, actual.data(), stats);
        QVERIFY2(matches(), "seek must reset the shared compressor state");
    }
    void manyVoicesExpandInDocumentOrder() {
        using namespace nt::audio;
        m_tokens.push_back(registerVoiceExpander("many", [](const nt::Clip&, const VoicePlan& voice) {
            return std::vector<VoiceSegment>{{voice.startMs,4,0,1,false}, {voice.startMs+4,4,4,1,false}};
        }));
        auto timeline = document();
        const auto clip = timeline.clips.front();
        timeline.clips.clear();
        for (int i = 0; i < 4096; ++i) {
            auto next = clip; next.id = std::to_string(i); next.startMs = i * 8;
            timeline.clips.push_back(std::move(next));
        }
        const auto plan = buildMixPlan(timeline);
        QCOMPARE(plan.voices.size(), std::size_t(8192));
        QCOMPARE(plan.voices.front().clipId, std::string("0"));
        QCOMPARE(plan.voices.back().clipId, std::string("4095"));
        QCOMPARE(plan.voices.back().startMs, 32764.0);
    }
    void liveEditRetainsExpandedVoice() {
        using namespace nt::audio;
        m_tokens.push_back(registerVoiceExpander("device segments", [](const nt::Clip&, const VoicePlan&) {
            return std::vector<VoiceSegment>{{0,250,0,1,false}, {250,750,500,2,false}};
        }));
        auto timeline = deviceDocument();
        AudioEngine engine; engine.setTimeline(std::make_shared<const nt::Timeline>(timeline));
        std::string error;
        QVERIFY2(engine.start({}, &error), error.c_str());
        play(engine);
        QTRY_VERIFY(engine.stats().playedFrames >= 480);
        const auto before = engine.stats().ringsRetained;
        timeline.clips[0].volumeDb = -6;
        engine.setTimeline(std::make_shared<const nt::Timeline>(timeline));
        const auto after = engine.stats().ringsRetained;
        engine.stop();
        QVERIFY2(after > before, "a gain edit must retain the later segment's PCM ring");
    }
    void silentSegmentReleasesDecoder() {
        using namespace nt::audio;
        bool silent = false;
        m_tokens.push_back(registerVoiceExpander("silence", [&silent](const nt::Clip&, const VoicePlan&) {
            return std::vector<VoiceSegment>{{0,1000,0,1,silent}};
        }));
        auto timeline = std::make_shared<const nt::Timeline>(deviceDocument());
        AudioEngine engine; engine.setTimeline(timeline);
        std::string error;
        QVERIFY2(engine.start({}, &error), error.c_str());
        play(engine);
        QTRY_VERIFY(engine.stats().playedFrames >= 480);
        QCOMPARE(engine.stats().openSources, std::int64_t(1));
        silent = true;
        engine.setTimeline(timeline);
        QTRY_COMPARE_WITH_TIMEOUT(engine.stats().openSources, std::int64_t(0), 500);
        engine.stop();
    }
    void envelopeScalesGain() {
        using namespace nt::audio;
        m_tokens.push_back(registerGainEnvelope("half", [](const nt::Clip&, const VoicePlan&) {
            return std::make_shared<const HalfGain>();
        }));
        auto timeline = document(); timeline.clips[0].volumeDb = -6.020599913279624;
        const auto plan = buildMixPlan(timeline);
        std::array<float, 16> input; input.fill(1);
        VoicePcm pcm; pcm.linear = input.data(); pcm.linearCount = 8;
        std::array<float, 16> output{};
        MixStats stats;
        mixBlock(plan, &pcm, 1000, 0, 1, 8, output.data(), stats);
        for (float value : output) { QCOMPARE(value, 0.25f); }
    }
};
QTEST_GUILESS_MAIN(TestMixerHooks)
#include "tst_mixerhooks.moc"
