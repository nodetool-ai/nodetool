#include "audio/Mixer.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <QtTest>
#include <array>
#include <memory>
#include <cmath>
#include <span>

using namespace nt;
using namespace nt::audio;

namespace {
Timeline document() {
    Timeline tl;
    Track track;
    track.id = "track";
    track.type = TrackType::Audio;
    tl.tracks.push_back(track);
    Clip clip;
    clip.id = "clip";
    clip.trackId = track.id;
    clip.mediaType = MediaType::Audio;
    clip.mediaPath = "memory.wav";
    clip.status = "generated";
    clip.durationMs = 1000;
    tl.clips.push_back(clip);
    return tl;
}

class Scale final : public BlockProcessor {
public:
    explicit Scale(float scale) : scale_(scale) {}
    void process(std::span<float> stereo, const BlockContext&) noexcept override {
        for (auto& sample : stereo) { sample *= scale_; }
    }
private:
    float scale_;
};
}

class TestAudioEffects : public QObject {
    Q_OBJECT
private slots:
    void arbitraryBlocks_data() {
        QTest::addColumn<QString>("json");
        QTest::newRow("echo-dry-distortion") << QString(R"({"type":"echo","delayMs":5000,"feedback":0.8,"mix":0.5,"followDistortion":true,"dryTest":true})");
        QTest::newRow("echo-distortion") << QString(R"({"type":"echo","delayMs":1,"feedback":0.8,"mix":1,"followDistortion":true})");
        QTest::newRow("echo") << QString(R"({"type":"echo","delayMs":11.3,"feedback":0.8,"mix":1})");
        QTest::newRow("reverb") << QString(R"({"type":"reverb","decaySec":0.15,"mix":1})");
        QTest::newRow("distortion") << QString(R"({"type":"distortion","driveDb":24,"outputDb":-6})");
        QTest::newRow("compressor") << QString(R"({"type":"compressor","thresholdDb":-30,"ratio":8,"attackMs":2,"releaseMs":100,"kneeDb":12})");
    }
    void arbitraryBlocks() {
        QFETCH(QString, json);
        auto tl = document();
        auto effect = QJsonDocument::fromJson(json.toUtf8()).object();
        effect.insert("id", "fx"); effect.insert("enabled", true);
        tl.clips[0].durationMs = effect.value("followDistortion").toBool() && !effect.value("dryTest").toBool() ? 1 : 40;
        QJsonArray chain{effect};
        if (effect.value("followDistortion").toBool()) {
            chain.append(QJsonObject{{"id", "drive"}, {"enabled", true}, {"type", "distortion"}, {"driveDb", 12}, {"outputDb", -6}});
        }
        tl.clips[0].raw.insert("audioEffects", chain);
        const auto whole = buildMixPlan(tl), fragmented = buildMixPlan(tl);
        std::vector<float> input(8192), expected(8192), actual(8192);
        for (std::size_t i = 0; i < input.size(); ++i) { input[i] = .3f * std::sin(i * .123); }
        if (effect.value("followDistortion").toBool()) { std::ranges::fill(input, 0.f); input[0] = .8f; input[1] = -.4f; }
        if (effect.value("dryTest").toBool()) { input[258] = .5f; input[259] = -.25f; }
        VoicePcm pcm; pcm.linear = input.data(); pcm.linearCount = 4096;
        MixStats stats;
        mixBlock(whole, &pcm, 48000, 0, 1000. / 48000, 4096, expected.data(), stats);
        int offset = 0;
        const auto blocks = effect.value("dryTest").toBool() ? std::vector<int>{129,3967} : std::vector<int>{1,7,127,3,509,101,2048,1300};
        for (const int count : blocks) {
            mixBlock(fragmented, &pcm, 48000, offset * 1000. / 48000, 1000. / 48000, count, actual.data() + 2 * offset, stats);
            offset += count;
        }
        QCOMPARE(offset, 4096);
        QCOMPARE(stats.preparations, 0);
        for (std::size_t i = 0; i < actual.size(); ++i) { QCOMPARE(actual[i], expected[i]); }
    }
    void seekResetsClipsButKeepsMaster() {
        auto tl = document();
        const QJsonObject echo{{"id", "e"}, {"type", "echo"}, {"enabled", true}, {"delayMs", 10}, {"feedback", 0}, {"mix", 1}};
        tl.clips[0].raw.insert("audioEffects", QJsonArray{echo});
        auto clipPlan = buildMixPlan(tl);
        tl.clips[0].raw.remove("audioEffects");
        tl.raw.insert("master", QJsonObject{{"effects", QJsonArray{echo}}});
        auto masterPlan = buildMixPlan(tl);
        std::vector<float> input(2048, 0), out(2048, 0);
        input[0] = 1; input[1] = .5f;
        VoicePcm pcm; pcm.linear = input.data(); pcm.linearCount = 1024;
        MixStats stats;
        for (auto* plan : {&clipPlan, &masterPlan}) {
            mixBlock(*plan, &pcm, 48000, 0, 1000. / 48000, 256, out.data(), stats);
            // A discontinuity with silent source frames. The master retains
            // its delayed impulse, while the clip's chain starts fresh.
            mixBlock(*plan, &pcm, 48000, 100, 1000. / 48000, 256, out.data(), stats);
            if (plan == &clipPlan) {
                for (int i = 0; i < 512; ++i) { QCOMPARE(out[i], 0.f); }
            } else { QVERIFY(out[448] > .99f); }
        }
    }
    void automationUsesPreparedInsert() {
        auto tl = document();
        tl.clips[0].raw.insert("audioEffects", QJsonArray{QJsonObject{{"id", "gain"}, {"type", "gain"}, {"enabled", true}, {"gainDb", 0}}});
        const auto plan = buildMixPlan(tl);
        QCOMPARE(plan.voices[0].processors.size(), std::size_t(1));
        auto& processor = *plan.voices[0].processors[0];
        QCOMPARE(processor.id, std::string("gain"));
        QVERIFY(processor.setParameter("gainDb", -6));
        QVERIFY(!processor.setParameter("frequency", 200));
        std::array<float, 2> samples{1, 1};
        processor.process(samples, {48000, 0, 1000. / 48000});
        QVERIFY(std::abs(samples[0] - std::pow(10.f, -.3f)) < 1e-6);
    }
    void maximumDelayPreservesStereoAndLiveTailCap() {
        auto tl = document(); tl.clips[0].durationMs = 1;
        tl.clips[0].raw.insert("audioEffects", QJsonArray{QJsonObject{{"id", "echo"}, {"type", "echo"}, {"enabled", true},
            {"delayMs", 5000}, {"feedback", .95}, {"mix", 1}}});
        const auto offline = buildMixPlan(tl), live = buildMixPlan(tl);
        QCOMPARE(offline.voices[0].tailMs, 20000.);
        std::array<float, 2> impulse{1, .25f};
        VoicePcm linear; linear.linear = impulse.data(); linear.linearCount = 1;
        PcmRing ring(128, 0); QCOMPARE(ring.write(impulse.data(), 1), std::int64_t(1)); ring.markEnd(1);
        VoicePcm device; device.ring = &ring;
        // Five repeats. The fifth exceeds the web's 20-second live cap but
        // remains connected in its OfflineAudioContext renderer.
        std::vector<float> file(1200128 * 2), callback(file.size());
        MixStats stats;
        mixBlock(offline, &linear, 48000, 0, 1000. / 48000, 1200128, file.data(), stats);
        mixBlock(live, &device, 48000, 0, 1000. / 48000, 1200128, callback.data(), stats);
        QCOMPARE(file[240000 * 2], 1.f); QCOMPARE(file[240000 * 2 + 1], .25f);
        QCOMPARE(callback[240000 * 2], 1.f); QCOMPARE(callback[240000 * 2 + 1], .25f);
        QVERIFY(file[1200000 * 2] > .8f); QCOMPARE(callback[1200000 * 2], 0.f);
    }
    void sampleRatePreparation() {
        const auto token = registerMixPlanStage("test.rate", [](const Timeline&, MixPlan& plan) {
            plan.processors.push_back(std::make_shared<Scale>(0.5f));
        });
        auto plan = buildMixPlan(document());
        unregisterMixPlanStage(token);
        prepareMixPlan(plan, 48000);
        std::array<float, 32> input;
        input.fill(0.5f);
        std::array<float, 16> output{};
        VoicePcm pcm;
        pcm.linear = input.data(); pcm.linearCount = 16;
        MixStats stats;
        mixBlock(plan, &pcm, 48000, 0, 1000.0 / 48000, 8, output.data(), stats);
        QCOMPARE(stats.preparations, 0);
        mixBlock(plan, &pcm, 44100, 0, 1000.0 / 44100, 8, output.data(), stats);
        QCOMPARE(stats.preparations, 1);
        for (float sample : output) { QCOMPARE(sample, 0.25f); }
        mixBlock(plan, &pcm, 44100, 8 * 1000.0 / 44100, 1000.0 / 44100, 8, output.data(), stats);
        QCOMPARE(stats.preparations, 1);
    }
    void externalPlanStage() {
        // This translation unit is a consumer of Mixer, as P2 will be.
        const auto token = registerMixPlanStage("test.external", [](const Timeline&, MixPlan& plan) {
            plan.voices[0].processors.push_back(std::make_shared<Scale>(0.5f));
            plan.tracks[0].processors.push_back(std::make_shared<Scale>(0.5f));
            plan.processors.push_back(std::make_shared<Scale>(0.5f));
        });
        const auto plan = buildMixPlan(document());
        unregisterMixPlanStage(token);
        std::array<float, 16> input;
        input.fill(0.5f);
        std::array<float, 16> output{};
        VoicePcm pcm;
        pcm.linear = input.data();
        pcm.linearCount = 8;
        MixStats stats;
        mixBlock(plan, &pcm, 48000, 0, 1000.0 / 48000, 8, output.data(), stats);
        for (float sample : output) { QCOMPARE(sample, 0.0625f); }
    }
};
QTEST_APPLESS_MAIN(TestAudioEffects)
#include "tst_audioeffects.moc"
