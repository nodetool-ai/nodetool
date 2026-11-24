// Native Step Sequencer expander parity and audio stage tests (SQ9-SQ21, SQ41-SQ42, SQ47, SQ60).
// Runs the pinned TS oracle vectors (native/timeline/src/midi/fixtures/step-pattern-oracle.json)
// through nt::midi::PatternExpand and verifies exact equality, plus real-time-safe device
// automation playback through PatternAudioStage.

#include "../../tests/RequireValue.h"
#include "audio/Mixer.h"
#include "audio/TestAllocationCounter.h"
#include "audio/automation/AutomationCurves.h"
#include "audio/effects/Effects.h"
#include "midi/PatternAudioStage.h"
#include "midi/PatternExpand.h"
#include "midi/PatternOps.h"
#include "model/TimelineJson.h"

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QScopeGuard>
#include <QSet>
#include <QProcess>
#include <QCoreApplication>
#include <QtTest>

#include <algorithm>
#include <array>
#include <cmath>
#include <memory>
#include <vector>

using namespace nt::midi;

namespace {

QJsonObject loadOracle() {
    QFile file(QStringLiteral(NT_PATTERN_ORACLE_FIXTURE));
    if (!file.open(QIODevice::ReadOnly)) {
        return {};
    }
    return QJsonDocument::fromJson(file.readAll()).object();
}

// Constant DC generator processor for testing insert effect automation gain.
// Owned by TrackPlan::processors, whose registry interface requires shared_ptr.
// Thread affinity: control-thread constructed, audio-thread process() (no locks/allocs).
class ConstantToneProcessor final : public nt::audio::BlockProcessor {
public:
    ConstantToneProcessor() { id = "test-tone"; }
    bool hasPendingOutput(int) const noexcept override { return true; }
    void process(std::span<float> stereo, const nt::audio::BlockContext&) noexcept override {
        for (float& s : stereo) {
            s = 0.5f;
        }
    }
};

// Test-owned probe, constructed and destroyed on the test thread. process()
// and setParameter() use only scalar state on the simulated callback thread.
class ParameterProbe final : public nt::audio::BlockProcessor {
public:
    int writes = 0;
    double last = 0;
    bool finite = true;
    bool setParameter(std::string_view, double value) noexcept override {
        ++writes; last = value; finite = finite && std::isfinite(value); return true;
    }
    void process(std::span<float>, const nt::audio::BlockContext&) noexcept override {}
};

}  // namespace

class TestPatternExpand : public QObject {
    Q_OBJECT

private slots:
    void reviewF3NativeInstrumentCallbackAllocations_data() {
        QTest::addColumn<int>("noteCount");
        QTest::newRow("one-note") << 1;
        QTest::newRow("4096-overlapping-notes") << 4096;
    }
    void reviewF3NativeInstrumentCallbackAllocations() {
        QFETCH(int, noteCount);
        const auto pattern = normalizePattern({{"lengthSteps", 1}, {"rows", QJsonArray{
            QJsonObject{{"id", "n"}, {"assignment", QJsonObject{{"type", "note"}, {"pitch", 60}}}, {"steps", QJsonArray{QJsonObject{{"on", true}}}}},
            QJsonObject{{"id", "a"}, {"assignment", QJsonObject{{"type", "automation"}, {"target", QJsonObject{{"kind", "device"}, {"deviceId", "instrument"}, {"param", "filter.cutoff"}}}}},
                {"steps", QJsonArray{QJsonObject{{"on", true}, {"value", 1200}}}}}}}});
        QJsonArray clips{QJsonObject{{"id", "c"}, {"trackId", "t"}, {"mediaType", "midi"},
            {"startMs", 0}, {"durationMs", 1000}, {"pattern", pattern}}};
        if (noteCount > 1) {
            QJsonArray notes;
            for (int i = 1; i < noteCount; ++i) {
                notes.append(QJsonObject{{"id", QString("extra-%1").arg(i)}, {"pitch", 60}, {"velocity", 100},
                    {"startTick", 0}, {"durationTick", 1920}});
            }
            clips.append(QJsonObject{{"id", "extra"}, {"trackId", "t"}, {"mediaType", "midi"},
                {"startMs", 0}, {"durationMs", 1000}, {"notes", notes}});
        }
        const auto parsed = nt::parseTimeline(QJsonObject{{"tracks", QJsonArray{QJsonObject{{"id", "t"}, {"type", "midi"},
            {"instrument", QJsonObject{{"type", "subtractive"}, {"waveform", "saw"}, {"cutoffHz", 18000}, {"resonance", 0.707},
                {"attackMs", 0}, {"decayMs", 0}, {"sustain", 1}, {"releaseMs", 0}, {"gainDb", 0}}}}}},
            {"clips", clips}});
        QVERIFY(parsed.timeline);
        auto plan = nt::audio::buildMixPlan(requireValue(parsed.timeline));
        nt::audio::prepareMixPlan(plan, 48000);
        QVERIFY(nt::testing::countsAnAllocation());
        std::array<float, 256> samples{}; nt::audio::MixStats stats{};
        nt::testing::allocations = 0; nt::testing::countAllocations = true;
        nt::audio::mixBlock(plan, nullptr, 48000, 0, 1000.0/48000, 128, samples.data(), stats);
        for (auto& bus : plan.tracks) { for (auto& processor : bus.processors) { processor->reset(); } }
        nt::testing::countAllocations = false;
        const auto allocationCount = nt::testing::allocations;
        QCOMPARE(allocationCount, std::size_t{0});
        QVERIFY(std::ranges::any_of(samples, [](float v) { return std::abs(v) > 1e-4f; }));
    }
    void reviewF2OversizedEqGainClampsAtDspBoundary() {
        nt::audio::effects::ensureRegistered();
        const auto tone = nt::audio::registerMixPlanStage("review-eq-tone",
            [](const nt::Timeline&, nt::audio::MixPlan& plan) {
                nt::audio::TrackPlan bus; bus.trackId = "m1";
                bus.processors.push_back(std::make_shared<ConstantToneProcessor>());
                plan.tracks.push_back(std::move(bus));
            }, -10);
        const auto cleanup = qScopeGuard([tone] { nt::audio::unregisterMixPlanStage(tone); });
        const auto pattern = normalizePattern({{"lengthSteps", 1}, {"rows", QJsonArray{QJsonObject{
            {"id", "eq-row"}, {"assignment", QJsonObject{{"type", "automation"}, {"target", QJsonObject{
                {"kind", "device"}, {"deviceId", "eq"}, {"param", "lowGainDb"}}}}},
            {"steps", QJsonArray{QJsonObject{{"on", true}, {"value", 1e300}}}}}}}});
        const auto makePlan = [&](bool automated) {
            const QJsonObject effect{{"id", "eq"}, {"type", "eq3"}, {"enabled", true}, {"lowGainDb", automated ? 0.0 : 24.0}};
            const QJsonObject raw{{"tracks", QJsonArray{QJsonObject{{"id", "m1"}, {"type", "midi"}, {"effects", QJsonArray{effect}}}}},
                {"clips", automated ? QJsonArray{QJsonObject{{"id", "c"}, {"trackId", "m1"}, {"mediaType", "midi"},
                    {"startMs", 0}, {"durationMs", 1000}, {"pattern", pattern}}} : QJsonArray{}}};
            const auto parsed = nt::parseTimeline(raw);
            if (!parsed.timeline) qFatal("%s", qPrintable(parsed.error));
            auto plan = nt::audio::buildMixPlan(*parsed.timeline);
            runPatternDeviceAutomationStage(*parsed.timeline, plan);
            nt::audio::prepareMixPlan(plan, 48000);
            return plan;
        };
        auto actual = makePlan(true), reference = makePlan(false);
        std::array<float, 256> got{}, want{};
        for (int block = 0; block < 20; ++block) {
            nt::audio::MixStats a{}, b{};
            const double ms = block * 128 * 1000.0 / 48000;
            nt::audio::mixBlock(actual, nullptr, 48000, ms, 1000.0/48000, 128, got.data(), a);
            nt::audio::mixBlock(reference, nullptr, 48000, ms, 1000.0/48000, 128, want.data(), b);
        }
        QVERIFY(std::isfinite(got.back()));
        QVERIFY(std::abs(want.back()) > 1.0f);
        QVERIFY(std::abs(got.back() - want.back()) < 1e-4f);
    }
    void reviewF12RejectsInvalidRateDirectly() {
        const auto result = midiToPattern({}, {}, {{"stepRate", "1/12"}});
        QVERIFY(result.contains("error"));
        QVERIFY(!result.contains("pattern"));
    }
    void reviewF17HugeSeedAndTonic() {
        QCOMPARE(normalizePattern({{"seed", 1e20}}).value("seed").toDouble(), 1661992960.0);
        QCOMPARE(resolveStepKey(QJsonObject{{"tonic", 1e20}, {"mode", "major"}}).tonic, 4);
    }
    void reviewF18LargeCycleCounter() {
        QJsonObject fixture;
        for (const auto& value : loadOracle().value("fixtures").toArray()) {
            if (value.toObject().value("id").toString() == "review_F18_large_cycle") fixture = value.toObject();
        }
        QVERIFY(!fixture.isEmpty());
        QCOMPARE(expandPattern(fixture.value("pattern").toObject(), fixture.value("ctx").toObject()), fixture.value("expected").toObject());
    }
    void reviewF24PlaybackAndOverlayOracle() {
        const auto oracle = loadOracle();
        const auto playback = oracle.value("reviewPlayback").toArray();
        QVERIFY(!playback.isEmpty());
        for (const auto& value : playback) {
            const auto v = value.toObject();
            const auto got = expandPatternClipForPlayback(v.value("clip").toObject(), v.value("doc").toObject());
            QCOMPARE(got.value("notes"), v.value("notes"));
            QCOMPARE(got.value("controllers"), v.value("controllers"));
        }
        const auto overlays = oracle.value("reviewDerivedAutomation").toArray();
        QVERIFY(!overlays.isEmpty());
        for (const auto& value : overlays) {
            const auto v = value.toObject();
            const auto got = deriveTrackAutomationFromPatterns(v.value("track").toObject(), v.value("clips").toArray(), v.value("doc").toObject());
            QCOMPARE(got, v.value("expected").toArray());
        }
    }
    void reviewF24EveryFactoryEntryCreatesOnTrack() {
        const auto entries = loadOracle().value("reviewFactory").toArray();
        QVERIFY(!entries.isEmpty());
        QCOMPARE(factoryStepPatternLibrary().size(), entries.size());
        for (const auto& value : entries) {
            const auto entry = value.toObject();
            const QJsonObject doc{{"tracks", QJsonArray{QJsonObject{{"id", "t"}, {"type", "midi"}}}}, {"clips", QJsonArray{}}};
            const auto result = runStepPatternOp(doc, "apply_step_pattern", {{"trackId", "t"}, {"atBar", 2}, {"pattern", entry.value("id")}});
            QVERIFY2(result.ok, qPrintable(result.error));
            const auto clip = result.nextDocument.value("clips").toArray().first().toObject();
            QCOMPARE(clip.value("startMs").toDouble(), 2000.0);
            const auto pattern = clip.value("pattern").toObject();
            QVERIFY2(validateStepPattern(pattern).isEmpty(), qPrintable(entry.value("id").toString()));
            auto expected = entry.value("pattern").toObject(); expected.insert("seed", pattern.value("seed"));
            QCOMPARE(pattern, expected);
            if (entry.contains("instrument")) {
                QVERIFY(result.result.value("instrumentApplied").toBool());
                QCOMPARE(result.nextDocument.value("tracks").toArray().first().toObject().value("instrument"), entry.value("instrument"));
            }
        }
    }
    void reviewF24ConversionCaps() {
        const auto cases = loadOracle().value("reviewConversions").toArray();
        QVERIFY(!cases.isEmpty());
        for (const auto& value : cases) {
            const auto c = value.toObject();
            QCOMPARE(midiToPattern(c.value("notes").toArray(), c.value("controllers").toArray(), c.value("options").toObject()), c.value("expected").toObject());
        }
    }
    void reviewF24PlaybackRegionParams() {
        const auto pattern = normalizePattern({{"lengthSteps", 1}, {"rows", QJsonArray{QJsonObject{
            {"id", "r"}, {"assignment", QJsonObject{{"type", "note"}, {"pitch", 60}}},
            {"steps", QJsonArray{QJsonObject{{"on", true}, {"velocity", 100}}}}}}}});
        const QJsonObject clip{{"id", "c"}, {"trackId", "t"}, {"mediaType", "midi"}, {"durationMs", 125},
            {"transpose", 2}, {"velocityOffset", -10}, {"pattern", pattern}};
        const auto notes = expandPatternClipForPlayback(clip).value("notes").toArray();
        QCOMPARE(notes.size(), 1);
        QCOMPARE(notes.first().toObject().value("pitch").toInt(), 62);
        QCOMPARE(notes.first().toObject().value("velocity").toInt(), 90);
    }
    void reviewAudioRouting_data() {
        QTest::addColumn<QString>("device"); QTest::addColumn<double>("value"); QTest::addColumn<int>("expectedWrites");
        QTest::addColumn<QString>("effectType"); QTest::addColumn<QString>("param"); QTest::addColumn<bool>("stored");
        QTest::newRow("F1-one-writer") << QString("g") << -6.0 << 1 << QString("gain") << QString("gainDb") << true;
        QTest::newRow("F2-finite-gain") << QString("g") << 800.0 << 1 << QString("gain") << QString("gainDb") << false;
        QTest::newRow("F3-instrument") << QString("instrument") << 1000.0 << 1 << QString("gain") << QString("filter.cutoff") << false;
        QTest::newRow("F24-filter") << QString("g") << 1200.0 << 1 << QString("filter") << QString("frequency") << true;
        QTest::newRow("F24-eq3") << QString("g") << -6.0 << 1 << QString("eq3") << QString("midGainDb") << true;
        QTest::newRow("F24-compressor") << QString("g") << 4.0 << 1 << QString("compressor") << QString("ratio") << true;
    }
    void reviewAudioRouting() {
        QFETCH(QString, device); QFETCH(double, value); QFETCH(int, expectedWrites);
        QFETCH(QString, effectType); QFETCH(QString, param); QFETCH(bool, stored);
        const QJsonObject target{{"kind", "device"}, {"deviceId", device}, {"param", param}};
        const auto pattern = normalizePattern({{"lengthSteps", 2}, {"automationMode", "slide"}, {"rows", QJsonArray{QJsonObject{
            {"id", "r"}, {"assignment", QJsonObject{{"type", "automation"}, {"target", target}}},
            {"steps", QJsonArray{QJsonObject{{"on", true}, {"value", value}}, QJsonObject{{"on", true}, {"value", value * 2}}}}}}}});
        const QJsonObject raw{{"tracks", QJsonArray{QJsonObject{{"id", "t"}, {"type", "midi"},
            {"effects", QJsonArray{QJsonObject{{"id", "g"}, {"type", effectType}, {"gainDb", 0}}}},
            {"automation", QJsonArray{QJsonObject{{"id", "stored"}, {"target", target}, {"points", QJsonArray{QJsonObject{{"timeMs", 0}, {"value", value / 2}}}}}}}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "c"}, {"trackId", "t"}, {"mediaType", "midi"}, {"startMs", 0}, {"durationMs", 250}, {"pattern", pattern}}}}};
        const auto parsed = nt::parseTimeline(raw); QVERIFY2(parsed.timeline.has_value(), qPrintable(parsed.error));
        nt::audio::MixPlan plan;
        nt::audio::TrackPlan bus; bus.trackId = "t";
        // Shared because both the plan and test inspect the same processor.
        auto probe = std::make_shared<ParameterProbe>(); probe->id = device.toStdString();
        bus.processors.push_back(probe); plan.tracks.push_back(std::move(bus));
        runPatternDeviceAutomationStage(requireValue(parsed.timeline), plan);
        if (stored) nt::audio::applyMixPlanStage("automation", requireValue(parsed.timeline), plan);
        std::array<float, 2> sample{};
        nt::audio::BlockContext ctx{}; ctx.timelineMs = 25; ctx.msPerFrame = 1000.0/48000; ctx.sampleRate = 48000;
        plan.tracks.front().processors.front()->process(sample, ctx);
        QCOMPARE(probe->writes, expectedWrites);
        QVERIFY(probe->finite);
        if (device == "instrument" || effectType != "gain") {
            QVERIFY(std::abs(probe->last - value * 1.2) < 1e-3);
        }
    }
    void reviewF4BootstrapAvailable() {
        QVERIFY(nt::audio::hasMixPlanStage("patternDeviceAutomation"));
    }
    void reviewF4RegistrationIdempotent() {
        const bool alreadyRegistered = nt::audio::hasMixPlanStage("patternDeviceAutomation");
        const auto first = registerPatternAutomationStage();
        const auto second = registerPatternAutomationStage();
        if (!alreadyRegistered) nt::audio::unregisterMixPlanStage(first);
        if (first != second) nt::audio::unregisterMixPlanStage(second);
        QCOMPARE(first, second);
    }
    void reviewF6NegativeCycle() {
        if (!qEnvironmentVariableIsSet("SQ1C_CYCLE_CHILD")) {
            QProcess child;
            auto env = QProcessEnvironment::systemEnvironment(); env.insert("SQ1C_CYCLE_CHILD", "1");
            child.setProcessEnvironment(env);
            child.start(QCoreApplication::applicationFilePath(), {"reviewF6NegativeCycle"});
            const bool finished = child.waitForFinished(1500);
            if (!finished) { child.kill(); child.waitForFinished(); }
            QVERIFY2(finished, "Negative wander cycle hangs in playOrder");
            QCOMPARE(child.exitCode(), 0);
            return;
        }
        const auto pattern = normalizePattern({{"lengthSteps", 2}, {"playback", "wander"}, {"rows", QJsonArray{QJsonObject{
            {"id", "r"}, {"assignment", QJsonObject{{"type", "note"}, {"pitch", 60}}},
            {"steps", QJsonArray{QJsonObject{{"on", true}}, QJsonObject{{"on", true}}}}}}}});
        const auto got = expandPattern(pattern, {{"clipLengthTicks", 480}, {"rowCycles", QJsonObject{{"r", QJsonObject{{"cycleOffset", -1}}}}}});
        QVERIFY(!got.value("notes").toArray().isEmpty());
    }
    void reviewF18BoundsExpansionWork() {
        const auto pattern = normalizePattern();
        const auto result = expandPattern(pattern, {{"clipLengthTicks", 6912000}, {"loopLengthTicks", 1}});
        QVERIFY2(result.contains("error"), "Excessive loop segmentation must return an explicit resource error");
    }
    void reviewF23FixtureExercisesLast() {
        bool lastCovered = false;
        for (const auto& fv : loadOracle().value("fixtures").toArray()) {
            const auto f = fv.toObject();
            for (const auto& rv : f.value("pattern").toObject().value("rows").toArray()) {
                const auto row = rv.toObject();
                const auto steps = row.value("steps").toArray();
                for (qsizetype i = 0; i < steps.size(); ++i) {
                    if (steps.at(i).toObject().value("condition").toObject().value("type").toString() != "last") continue;
                    for (const auto& nv : f.value("expected").toObject().value("notes").toArray()) {
                        const auto id = nv.toObject().value("id").toString().split(':');
                        if (id.size() >= 6 && id.at(1) == row.value("id").toString() && id.at(4).toInt() == i) lastCovered = true;
                    }
                }
            }
        }
        QVERIFY(lastCovered);
    }
    void reviewF8FirstChordTrackWins() {
        const auto pattern = normalizePattern({{"pitchSource", "chords"}, {"rows", QJsonArray{QJsonObject{
            {"id", "r"}, {"assignment", QJsonObject{{"type", "degree"}, {"degree", "root"}, {"octave", 3}}},
            {"steps", QJsonArray{QJsonObject{{"on", true}}}}}}}});
        const QJsonObject clip{{"id", "c"}, {"trackId", "t"}, {"mediaType", "midi"}, {"durationMs", 500}, {"pattern", pattern}};
        const QJsonObject chord{{"id", "ch"}, {"startTick", 0}, {"durationTick", 3840}, {"root", 0}, {"quality", "maj"}};
        const QJsonObject doc{{"tracks", QJsonArray{QJsonObject{{"id", "empty"}, {"type", "chord"}},
            QJsonObject{{"id", "full"}, {"type", "chord"}, {"chords", QJsonArray{chord}}}}}};
        QVERIFY(expandPatternClip(clip, doc).value("notes").toArray().isEmpty());
    }
    void reviewF11AtBarAndInstrument() {
        const QJsonObject doc{{"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 100}}},
            {"tracks", QJsonArray{QJsonObject{{"id", "t"}, {"type", "midi"}}}}, {"clips", QJsonArray{}}};
        const auto out = runStepPatternOp(doc, "apply_step_pattern", {{"trackId", "t"}, {"atBar", 5}, {"pattern", "Boom Bap"}});
        QVERIFY2(out.ok, qPrintable(out.error));
        QCOMPARE(out.nextDocument.value("clips").toArray().first().toObject().value("startMs").toDouble(), 8100.0);
        QVERIFY(out.result.value("instrumentApplied").toBool());
        QCOMPARE(out.result.value("instrumentPreset").toString(), QString("dr1-tr-void"));
        QVERIFY(out.nextDocument.value("tracks").toArray().first().toObject().value("instrument").isObject());
    }
    void reviewF16BakedIdsUnique_data() {
        QTest::addColumn<bool>("automation");
        QTest::addColumn<int>("stepCount"); QTest::addColumn<double>("clipDuration");
        QTest::newRow("notes") << false << 2 << 1000.0;
        QTest::newRow("controller-points") << true << 2 << 1000.0;
        QTest::newRow("large-notes") << false << 64 << 512000.0;
    }
    void reviewF16BakedIdsUnique() {
        QFETCH(bool, automation); QFETCH(int, stepCount); QFETCH(double, clipDuration);
        QJsonArray steps;
        for (int i = 0; i < stepCount; ++i) steps.append(QJsonObject{{"on", true}, {"value", i}});
        const QJsonObject assignment = automation
            ? QJsonObject{{"type", "automation"}, {"target", QJsonObject{{"kind", "cc"}, {"cc", 74}}}}
            : QJsonObject{{"type", "note"}, {"pitch", 60}};
        const auto pattern = normalizePattern({{"lengthSteps", stepCount}, {"playback", "pingPong"}, {"rows", QJsonArray{QJsonObject{
            {"id", "r"}, {"assignment", assignment},
            {"steps", steps}}}}});
        const QJsonObject doc{{"tracks", QJsonArray{QJsonObject{{"id", "t"}, {"type", "midi"}}}}, {"clips", QJsonArray{
            QJsonObject{{"id", "c"}, {"trackId", "t"}, {"mediaType", "midi"}, {"durationMs", clipDuration}, {"pattern", pattern}}}}};
        const auto out = runStepPatternOp(doc, "convert_pattern_to_midi", {{"clipIds", QJsonArray{"c"}}});
        QVERIFY2(out.ok, qPrintable(out.error));
        QSet<QString> ids;
        const auto baked = out.nextDocument.value("clips").toArray().first().toObject();
        const auto notes = automation ? baked.value("controllers").toArray().first().toObject().value("points").toArray()
                                      : baked.value("notes").toArray();
        for (const auto& n : notes) { const auto id = n.toObject().value("id").toString(); QVERIFY(!ids.contains(id)); ids.insert(id); }
        QVERIFY(notes.size() > 2);
    }
    void reviewF17LargeClipLength() {
        const auto converted = midiToPattern({}, {}, {{"clipLengthTicks", 1e20}, {"stepRate", "1/64"}});
        QCOMPARE(converted.value("pattern").toObject().value("lengthSteps").toInt(), 64);
    }
    void reviewF19LoadValidation_data() {
        QTest::addColumn<QJsonObject>("patch");
        QTest::newRow("null-pattern") << QJsonObject{{"pattern", QJsonValue::Null}};
        QTest::newRow("null-notes") << QJsonObject{{"notes", QJsonValue::Null}};
        QTest::newRow("invalid-pattern") << QJsonObject{{"pattern", QJsonObject{{"version", 99}, {"rows", "bad"}}}};
        QTest::newRow("negative-phase") << QJsonObject{{"patternPhaseTicks", -1}};
        QTest::newRow("fractional-cycle") << QJsonObject{{"patternRowCycles", QJsonObject{{"r", QJsonObject{{"cycleOffset", 1.5}}}}}};
    }
    void reviewF19LoadValidation() {
        QFETCH(QJsonObject, patch);
        QJsonObject clip{{"id", "c"}, {"trackId", "t"}, {"mediaType", "midi"}, {"durationMs", 2000}, {"startMs", 0}};
        for (auto it = patch.begin(); it != patch.end(); ++it) clip.insert(it.key(), it.value());
        const auto parsed = nt::parseTimeline({{"tracks", QJsonArray{QJsonObject{{"id", "t"}, {"type", "midi"}}}}, {"clips", QJsonArray{clip}}});
        QVERIFY(!parsed.timeline.has_value());
    }
    void reviewF15KeySchema() {
        bool found = false;
        for (const auto& value : stepPatternAssistantTools()) {
            const auto tool = value.toMap();
            if (tool.value("name") == "ui_timeline_set_pattern") {
                found = true;
                QVERIFY(tool.value("parameters").toMap().value("properties").toMap().contains("key"));
            }
        }
        QVERIFY(found);
    }
    void reviewInvalidInputs_data() {
        QTest::addColumn<QString>("operation");
        QTest::addColumn<QJsonObject>("args");
        QTest::newRow("F9-fractional-length") << QString("set_pattern") << QJsonObject{{"lengthSteps", 16.5}};
        QTest::newRow("F12-rate") << QString("convert_midi_to_pattern") << QJsonObject{{"clipIds", QJsonArray{"c"}}, {"stepRate", "1/12"}};
        QTest::newRow("F13-scope") << QString("clear_pattern") << QJsonObject{{"scope", "step"}};
        QTest::newRow("F13-mode") << QString("clear_pattern") << QJsonObject{{"mode", "garbage"}};
        QTest::newRow("F13-rowType") << QString("clear_pattern") << QJsonObject{{"rowType", "garbage"}};
        QTest::newRow("F14-pitchSource") << QString("set_pattern") << QJsonObject{{"pitchSource", "chord"}};
        QTest::newRow("F14-key") << QString("set_pattern") << QJsonObject{{"key", QJsonObject{{"tonic", "C"}, {"mode", "dorian"}}}};
        QTest::newRow("F14-empty-rows") << QString("add_pattern_rows") << QJsonObject{{"rows", QJsonArray{}}};
        QTest::newRow("F14-null-step-field") << QString("set_steps") << QJsonObject{{"row", "r"}, {"steps", "1"}, {"values", QJsonObject{{"velocity", QJsonValue::Null}}}};
        QTest::newRow("F14-step-rate") << QString("set_steps") << QJsonObject{{"row", "r"}, {"steps", "1"}, {"values", QJsonObject{{"stepRate", "1/5"}}}};
        QTest::newRow("F14-ramp") << QString("set_steps") << QJsonObject{{"row", "r"}, {"steps", "1"}, {"ramp", QJsonObject{{"field", "velocity"}, {"from", "20"}, {"to", "80"}}}};
    }
    void reviewInvalidInputs() {
        QFETCH(QString, operation);
        QFETCH(QJsonObject, args);
        const auto pat = nt::midi::normalizePattern({{"rows", QJsonArray{QJsonObject{{"id", "r"}, {"name", "r"}, {"assignment", QJsonObject{{"type", "note"}, {"pitch", 60}}}}}}});
        QJsonObject clip{{"id", "c"}, {"trackId", "t"}, {"mediaType", "midi"}, {"durationMs", 2000}, {"pattern", pat}};
        if (operation == "convert_midi_to_pattern") { clip.remove("pattern"); clip.insert("notes", QJsonArray{}); }
        const auto doc = QJsonObject{{"tracks", QJsonArray{QJsonObject{{"id", "t"}, {"type", "midi"}}}}, {"clips", QJsonArray{clip}}};
        args.insert("clipId", "c");
        const auto out = nt::midi::runStepPatternOp(doc, operation, args);
        QVERIFY2(!out.ok, qPrintable(operation + " accepted invalid input"));
    }
    void reviewF7LocaleTieBreak() {
        QJsonArray rows;
        for (const auto& id : {QString("Kick"), QString("alt"), QString("ALT"), QString("_alt"), QString("-alt"), QString("a2"), QString("a10"), QString::fromUtf8("ä"), QString::fromUtf8("é")}) {
            rows.append(QJsonObject{{"id", id}, {"assignment", QJsonObject{{"type", "note"}, {"pitch", 36}}},
                {"steps", QJsonArray{QJsonObject{{"on", true}}}}});
        }
        const auto pattern = normalizePattern({{"lengthSteps", 1}, {"rows", rows}});
        const auto notes = expandPattern(pattern, {{"clipLengthTicks", 240}}).value("notes").toArray();
        QCOMPARE(notes.size(), rows.size());
        // Execute the comparator in packages/timeline/src/midi/notes.ts verbatim.
        QProcess node;
        node.start("node", {"-e", "const fs = require('node:fs'); const notes = JSON.parse(fs.readFileSync(0, 'utf8')); notes.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch || a.id.localeCompare(b.id)); process.stdout.write(JSON.stringify(notes));"});
        QVERIFY(node.waitForStarted());
        QJsonArray reversed;
        for (qsizetype i = notes.size(); i > 0; --i) { reversed.append(notes.at(i - 1)); }
        node.write(QJsonDocument(reversed).toJson(QJsonDocument::Compact)); node.closeWriteChannel();
        QVERIFY(node.waitForFinished()); QCOMPARE(node.exitCode(), 0);
        QCOMPARE(notes, QJsonDocument::fromJson(node.readAllStandardOutput()).array());
    }

    void reviewF10TsAlsoActivatesAndPromotesNull() {
        const auto pattern = normalizePattern({{"lengthSteps", 1}, {"rows", QJsonArray{QJsonObject{
            {"id", "r"}, {"assignment", QJsonObject{{"type", "note"}, {"pitch", 60}}}}}}});
        const auto row = pattern.value("rows").toArray().first().toObject();
        const auto result = setStepValue(row, 0, {{"octave", QJsonValue::Null}, {"velocity", QJsonValue::Null}});
        QCOMPARE(result.value("assignment").toObject().value("type").toString(), QString("melodic"));
        QVERIFY(result.value("steps").toArray().first().toObject().value("on").toBool());
    }

    void reviewF17LargeMidiDuration() {
        const auto result = midiToPattern(QJsonArray{QJsonObject{{"id", "n"}, {"pitch", 60},
            {"velocity", 100}, {"startTick", 0}, {"durationTick", 200000000000.0}}}, {},
            {{"stepRate", "1/64"}, {"clipLengthTicks", 3840}});
        const auto steps = result.value("pattern").toObject().value("rows").toArray().first().toObject().value("steps").toArray();
        QVERIFY(steps.at(1).toObject().value("tie").toBool());
    }

    void reviewF20ContainerValidation() {
        auto pattern = normalizePattern();
        pattern.insert("rows", "corrupt");
        QVERIFY(!validateStepPattern(pattern).isEmpty());
    }

    void stepRateTicksMatchesAll22Vectors() {
        const auto oracle = loadOracle();
        QVERIFY2(!oracle.isEmpty(), "Failed to load step-pattern-oracle.json");
        const auto rates = oracle.value(u"stepRateTicks").toObject();
        QCOMPARE(rates.size(), 22);
        for (auto it = rates.begin(); it != rates.end(); ++it) {
            const auto key = it.key().toStdString();
            const auto got = stepRateTicks(key);
            QVERIFY2(got.has_value(), qPrintable(it.key()));
            QCOMPARE(requireValue(got), it.value().toInt());
        }
        QVERIFY(!stepRateTicks("1/5").has_value());
        QCOMPARE(nudgeStepRate("1/16", 1), std::string_view("8T"));
        QCOMPARE(nudgeStepRate("1/64", -1), std::string_view("1/64"));
        QCOMPARE(nudgeStepRate("4", 1), std::string_view("4"));
    }

    void stepHashMatchesPinnedVectorsAndDistribution() {
        const auto oracle = loadOracle();
        const auto hashes = oracle.value(u"rowKeyHash").toObject();
        QCOMPARE(rowKeyHash("r1"), static_cast<std::uint32_t>(hashes.value(u"r1").toDouble()));
        QCOMPARE(rowKeyHash("kick"), static_cast<std::uint32_t>(hashes.value(u"kick").toDouble()));
        QCOMPARE(rowKeyHash("über"), static_cast<std::uint32_t>(hashes.value(u"über").toDouble()));

        const auto pinned = oracle.value(u"stepHash").toArray();
        QCOMPARE(pinned.size(), 8);
        for (int step = 0; step < 8; ++step) {
            const double got = stepHash(1u, "r1", static_cast<std::uint32_t>(step), 0u);
            const double want = pinned.at(step).toDouble();
            QCOMPARE(got, want);
        }

        int hits = 0;
        for (std::uint32_t cycle = 0; cycle < 1000; ++cycle) {
            if (stepHash(7u, "r1", 0u, cycle) * 100.0 < 50.0) {
                ++hits;
            }
        }
        QVERIFY2(hits >= 450 && hits <= 550, qPrintable(QStringLiteral("hits=%1").arg(hits)));
    }

    void playOrderMatchesPinnedVectors() {
        const auto oracle = loadOracle();
        const auto po = oracle.value(u"playOrder").toObject();
        auto toVec = [](const QJsonArray& a) {
            std::vector<int> out;
            out.reserve(static_cast<std::size_t>(a.size()));
            for (const auto& v : a) out.push_back(v.toInt());
            return out;
        };
        QCOMPARE(playOrder(4, "forward", 1, 0), toVec(po.value(u"forward_4").toArray()));
        QCOMPARE(playOrder(4, "backward", 1, 0), toVec(po.value(u"backward_4").toArray()));
        QCOMPARE(playOrder(4, "pingPong", 1, 0), toVec(po.value(u"pingPong_4").toArray()));
        QCOMPARE(playOrder(4, "pendulum", 1, 0), toVec(po.value(u"pendulum_4").toArray()));
        QCOMPARE(playOrder(8, "shuffle", 7, 0, "r1"), toVec(po.value(u"shuffle_8_7_0_r1").toArray()));
        QCOMPARE(playOrder(8, "random", 7, 0, "r1"), toVec(po.value(u"random_8_7_0_r1").toArray()));
        QCOMPARE(playOrder(8, "wander", 7, 0, "r1"), toVec(po.value(u"wander_8_7_0_r1").toArray()));
        QCOMPARE(playOrder(8, "wander", 7, 1, "r1"), toVec(po.value(u"wander_8_7_1_r1").toArray()));
        QCOMPARE(playOrder(8, "wander", 7, 2, "r1"), toVec(po.value(u"wander_8_7_2_r1").toArray()));
    }

    void rowScheduleAndMusicalLength() {
        const auto oracle = loadOracle();
        const auto rs = oracle.value(u"rowSchedule").toObject();
        auto checkSched = [](const std::vector<RowScheduleEntry>& got, const QJsonArray& want) {
            QCOMPARE(static_cast<qsizetype>(got.size()), want.size());
            for (qsizetype i = 0; i < want.size(); ++i) {
                const auto o = want.at(i).toObject();
                QCOMPARE(got[static_cast<std::size_t>(i)].stepIndex, o.value(u"stepIndex").toInt());
                QCOMPARE(got[static_cast<std::size_t>(i)].startTick,
                         static_cast<std::int64_t>(o.value(u"startTick").toDouble()));
                QCOMPARE(got[static_cast<std::size_t>(i)].lengthTicks, o.value(u"lengthTicks").toInt());
            }
        };
        const auto plainRow = QJsonObject{{"id", "r1"}, {"loopStart", 0}, {"loopEnd", 4}, {"stepRate", "1/16"},
                                          {"playback", "forward"}, {"lengthSteps", 4},
                                          {"steps", QJsonArray{QJsonObject{}, QJsonObject{}, QJsonObject{}, QJsonObject{}}}};
        checkSched(rowSchedule(plainRow, 1, 0), rs.value(u"plain_4").toArray());

        auto skipRow = plainRow;
        skipRow.insert("steps", QJsonArray{QJsonObject{}, QJsonObject{{"skip", true}}, QJsonObject{}, QJsonObject{}});
        checkSched(rowSchedule(skipRow, 1, 0), rs.value(u"skip_1").toArray());

        auto ratedRow = plainRow;
        ratedRow.insert("steps", QJsonArray{QJsonObject{}, QJsonObject{{"stepRate", "1/8"}}, QJsonObject{}, QJsonObject{}});
        checkSched(rowSchedule(ratedRow, 1, 0), rs.value(u"rate_1_8").toArray());

        const auto fixtures = oracle.value(u"fixtures").toArray();
        QJsonObject polyPattern;
        for (const auto& entry : fixtures) {
            if (entry.toObject().value(u"id").toString() == u"10_polymeter_16_12") {
                polyPattern = entry.toObject().value(u"pattern").toObject();
            }
        }
        QVERIFY(!polyPattern.isEmpty());
        QCOMPARE(patternMusicalLengthTicks(polyPattern),
                 static_cast<std::int64_t>(oracle.value(u"musicalLengthPolymeter").toDouble()));
    }

    void swingDelayAndRepeats() {
        const auto oracle = loadOracle();
        for (const auto& v : oracle.value(u"swingDelay").toArray()) {
            const auto o = v.toObject();
            QCOMPARE(swingDelay(static_cast<std::int64_t>(o.value(u"tick").toDouble()),
                                o.value(u"division").toString().toStdString(), o.value(u"swing").toInt()),
                     static_cast<std::int64_t>(o.value(u"expected").toDouble()));
        }
        for (const auto& v : oracle.value(u"repeatPositions").toArray()) {
            const auto o = v.toObject();
            const auto got = repeatPositions(static_cast<std::int64_t>(o.value(u"totalTicks").toDouble()),
                                             o.value(u"repeat").toInt(), o.value(u"distribution").toInt());
            const auto want = o.value(u"expected").toArray();
            QCOMPARE(static_cast<qsizetype>(got.size()), want.size());
            for (qsizetype i = 0; i < want.size(); ++i) {
                QCOMPARE(got[static_cast<std::size_t>(i)], static_cast<std::int64_t>(want.at(i).toDouble()));
            }
        }
        for (const auto& v : oracle.value(u"repeatVelocities").toArray()) {
            const auto o = v.toObject();
            const auto got = repeatVelocities(o.value(u"velocity").toInt(), o.value(u"repeat").toInt(),
                                              o.value(u"ramp").toInt(), o.value(u"curve").toInt());
            const auto want = o.value(u"expected").toArray();
            QCOMPARE(static_cast<qsizetype>(got.size()), want.size());
            for (qsizetype i = 0; i < want.size(); ++i) {
                QCOMPARE(got[static_cast<std::size_t>(i)], want.at(i).toInt());
            }
        }
    }

    void stepPitchAndNormalization() {
        const auto oracle = loadOracle();
        for (const auto& v : oracle.value(u"stepPitch").toArray()) {
            const auto o = v.toObject();
            const auto got = stepPitch(o.value(u"row").toObject(), o.value(u"step").toObject(), {});
            QVERIFY(got.has_value());
            QCOMPARE(requireValue(got), o.value(u"expected").toInt());
        }
        const auto defPat = normalizePattern({});
        QCOMPARE(defPat.value(u"version").toInt(), 1);
        QCOMPARE(defPat.value(u"seed").toInt(), 1);
        QCOMPARE(defPat.value(u"lengthSteps").toInt(), 16);
        QCOMPARE(defPat.value(u"stepRate").toString(), QStringLiteral("1/16"));
        QCOMPARE(defPat.value(u"playback").toString(), QStringLiteral("forward"));
        QCOMPARE(defPat.value(u"swingDivision").toString(), QStringLiteral("1/16"));
        QCOMPARE(defPat.value(u"pitchSource").toString(), QStringLiteral("off"));
        QCOMPARE(defPat.value(u"scale").toString(), QStringLiteral("chromatic"));
        QCOMPARE(defPat.value(u"midiChannel").toInt(), 1);
        QCOMPARE(defPat.value(u"automationMode").toString(), QStringLiteral("latch"));
        QCOMPARE(defPat.value(u"name").toString(), QStringLiteral("Pattern"));
        QCOMPARE(defPat.value(u"rows").toArray().size(), 0);

        const auto norm = normalizeStep({});
        QCOMPARE(norm.value(u"velocity").toInt(), 100);
        QCOMPARE(norm.value(u"gate").toInt(), 100);
        QCOMPARE(norm.value(u"chance").toInt(), 100);
        QCOMPARE(compactStep(norm), QJsonObject{});
        QCOMPARE(compactStep({{"on", true}, {"velocity", 100}, {"gate", 80}}),
                 (QJsonObject{{"on", true}, {"gate", 80}}));
    }

    void patternTextAndMidiToPattern() {
        const auto oracle = loadOracle();
        const auto pt = oracle.value(u"patternText").toObject();
        QString err;
        const auto parsed = patternFromText(QStringLiteral("Kick: x.x- ..X."), {}, &err);
        QVERIFY2(err.isEmpty(), qPrintable(err));
        QCOMPARE(parsed, pt.value(u"parsed").toObject());

        const auto rt = patternFromText(pt.value(u"roundTripInput").toString(), {}, &err);
        QVERIFY2(err.isEmpty(), qPrintable(err));
        QCOMPARE(patternToText(rt), pt.value(u"roundTripOutput").toString());

        const auto m2p = oracle.value(u"midiToPattern").toObject();
        const auto gotM2p = midiToPattern(m2p.value(u"notes").toArray(), m2p.value(u"controllers").toArray(),
                                          m2p.value(u"options").toObject());
        QCOMPARE(gotM2p, m2p.value(u"expected").toObject());
    }

    // Compare the numbered SQ60 vectors and TS-generated regression fixtures.
    void oracleFixturesExactParity() {
        const auto oracle = loadOracle();
        const auto fixtures = oracle.value(u"fixtures").toArray();
        QVERIFY2(fixtures.size() >= 19, qPrintable(QStringLiteral("Expected >=19 fixtures, got %1").arg(fixtures.size())));

        int oracleCount = 0;
        for (const auto& entry : fixtures) {
            const auto fx = entry.toObject();
            const auto id = fx.value(u"id").toString();
            if (fx.contains(u"oracleNumber")) ++oracleCount;
            const auto actual = expandPattern(fx.value(u"pattern").toObject(), fx.value(u"ctx").toObject());
            const auto expected = fx.value(u"expected").toObject();
            const auto actualJson = QJsonDocument(actual).toJson(QJsonDocument::Compact);
            const auto expectedJson = QJsonDocument(expected).toJson(QJsonDocument::Compact);
            QVERIFY2(actual == expected,
                     qPrintable(QStringLiteral("Fixture %1 mismatch!\nActual:   %2\nExpected: %3")
                                    .arg(id, QString::fromUtf8(actualJson), QString::fromUtf8(expectedJson))));
        }
        QCOMPARE(oracleCount, 13);  // 12 numbered SQ60 fixtures (fixture 4 has 4a and 4b)
    }

    void deriveTrackAutomationMatchesPinnedTs() {
        const auto oracle = loadOracle();
        const auto da = oracle.value(u"deriveTrackAutomation").toObject();
        const auto got = deriveTrackAutomationFromPatterns(
            da.value(u"track").toObject(), da.value(u"clips").toArray(),
            QJsonObject{{"tracks", QJsonArray{da.value(u"track").toObject()}}, {"tempo", da.value(u"tempo").toObject()}});
        const auto want = da.value(u"expected").toArray();
        QCOMPARE(got.size(), want.size());
        for (qsizetype i = 0; i < got.size(); ++i) {
            auto gotLane = got.at(i).toObject(), wantLane = want.at(i).toObject();
            gotLane.remove("points"); wantLane.remove("points");
            QCOMPARE(gotLane, wantLane);
        }
        const auto gotPts = got.at(0).toObject().value(u"points").toArray();
        const auto wantPts = want.at(0).toObject().value(u"points").toArray();
        QCOMPARE(gotPts.size(), wantPts.size());
        for (qsizetype i = 0; i < wantPts.size(); ++i) {
            const auto gp = gotPts.at(i).toObject();
            const auto wp = wantPts.at(i).toObject();
            QVERIFY(std::abs(gp.value(u"timeMs").toDouble() - wp.value(u"timeMs").toDouble()) < 1e-6);
            QVERIFY(std::abs(gp.value(u"value").toDouble() - wp.value(u"value").toDouble()) < 1e-6);
            QCOMPARE(gp.value(u"easing").toString(), wp.value(u"easing").toString());
        }
    }

    void patternDeviceAutomationStageDrivesTrackInsertRealTime() {
        nt::audio::effects::ensureRegistered();
        const auto toneStage = nt::audio::registerMixPlanStage(
            "test-pattern-auto-tone",
            [](const nt::Timeline& tl, nt::audio::MixPlan& plan) {
                for (const auto& t : tl.tracks) {
                    if (t.id == "m1") {
                        nt::audio::TrackPlan bus;
                        bus.trackId = t.id;
                        bus.processors.push_back(std::make_shared<ConstantToneProcessor>());
                        plan.tracks.push_back(std::move(bus));
                    }
                }
            },
            -10);
        const auto cleanup = qScopeGuard([toneStage] {
            nt::audio::unregisterMixPlanStage(toneStage);
        });

        // Pattern clip [1000ms..3000ms) drives insert "g1" gainDb in latch mode:
        // beat 1 (1000ms): -6 dB (~0.501x), beat 3 (2000ms): 0 dB (1.0x).
        // Stored track automation holds -12 dB (~0.251x) outside the clip.
        const QJsonObject pattern = normalizePattern({
            {"lengthSteps", 4},
            {"stepRate", "1/4"},
            {"rows", QJsonArray{QJsonObject{
                {"id", "g_row"},
                {"assignment", QJsonObject{{"type", "automation"},
                                           {"target", QJsonObject{{"kind", "device"}, {"deviceId", "g1"}, {"param", "gainDb"}}}}},
                {"lengthSteps", 4},
                {"loopStart", 0},
                {"loopEnd", 4},
                {"stepRate", "1/4"},
                {"automationMode", "latch"},
                {"steps", QJsonArray{QJsonObject{{"on", true}, {"value", -6.0}}, QJsonObject{},
                                     QJsonObject{{"on", true}, {"value", 0.0}}, QJsonObject{}}}}}}});
        const QJsonObject raw{
            {"id", "tl"}, {"name", "AutoTest"}, {"fps", 30}, {"width", 1920}, {"height", 1080}, {"durationMs", 4000},
            {"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 0},
                                  {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}}}},
            {"tracks", QJsonArray{QJsonObject{
                {"id", "m1"}, {"name", "Synth"}, {"type", "midi"}, {"index", 0},
                {"effects", QJsonArray{QJsonObject{{"id", "g1"}, {"type", "gain"}, {"enabled", true},
                                                   {"gainDb", 0.0}}}},
                {"automation", QJsonArray{QJsonObject{
                    {"id", "stored"}, {"enabled", true},
                    {"target", QJsonObject{{"kind", "device"}, {"deviceId", "g1"}, {"param", "gainDb"}}},
                    {"points", QJsonArray{QJsonObject{{"timeMs", 0.0}, {"value", -12.0}}}}}}}}}},
            {"clips", QJsonArray{QJsonObject{
                {"id", "c1"}, {"trackId", "m1"}, {"name", "Pat"}, {"mediaType", "midi"},
                {"startMs", 1000.0}, {"durationMs", 2000.0}, {"inPointMs", 0.0}, {"outPointMs", 2000.0},
                {"pattern", pattern}}}}};
        const auto parsed = nt::parseTimeline(raw);
        QVERIFY2(parsed.timeline.has_value(), qPrintable(parsed.error));

        auto plan = nt::audio::buildMixPlan(requireValue(parsed.timeline));
        nt::audio::prepareMixPlan(plan, 48000.0);

        // Render blocks and verify zero audio-thread allocations.
        QVERIFY(nt::testing::countsAnAllocation());
        std::size_t totalAllocs = 0;
        auto sampleAt = [&](double ms) -> float {
            std::array<float, std::size_t{128} * 2> buf{};
            nt::audio::MixStats stats{};
            nt::testing::allocations = 0;
            nt::testing::countAllocations = true;
            nt::audio::mixBlock(plan, nullptr, 48000.0, ms, 1000.0 / 48000.0, 128, buf.data(), stats);
            nt::testing::countAllocations = false;
            totalAllocs += nt::testing::allocations;
            return buf[std::size_t{64} * 2];
        };

        const float beforeClip = sampleAt(500.0);    // stored -12 dB => 0.5 * 10^(-12/20) ~= 0.1256
        const float firstHalf = sampleAt(1500.0);    // pattern -6 dB => 0.5 * 10^(-6/20)  ~= 0.2506
        const float secondHalf = sampleAt(2500.0);   // pattern  0 dB => 0.5 * 1.0          = 0.5000
        const float afterClip = sampleAt(3500.0);    // stored -12 dB => 0.5 * 10^(-12/20) ~= 0.1256
        QCOMPARE(totalAllocs, std::size_t{0});

        const float wantStored = static_cast<float>(0.5 * std::pow(10.0, -12.0 / 20.0));
        const float wantMinus6 = static_cast<float>(0.5 * std::pow(10.0, -6.0 / 20.0));
        const float wantZero = 0.5f;

        QVERIFY2(std::abs(beforeClip - wantStored) < 0.01f,
                 qPrintable(QStringLiteral("beforeClip=%1 want=%2").arg(beforeClip).arg(wantStored)));
        QVERIFY2(std::abs(firstHalf - wantMinus6) < 0.01f,
                 qPrintable(QStringLiteral("firstHalf=%1 want=%2").arg(firstHalf).arg(wantMinus6)));
        QVERIFY2(std::abs(secondHalf - wantZero) < 0.01f,
                 qPrintable(QStringLiteral("secondHalf=%1 want=%2").arg(secondHalf).arg(wantZero)));
        QVERIFY2(std::abs(afterClip - wantStored) < 0.01f,
                 qPrintable(QStringLiteral("afterClip=%1 want=%2").arg(afterClip).arg(wantStored)));
    }
};

QTEST_GUILESS_MAIN(TestPatternExpand)
#include "tst_patternexpand.moc"
