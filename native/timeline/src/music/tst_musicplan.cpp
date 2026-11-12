// The C++ music planner and frame math on the spec's own examples
// (docs/MUSIC-MODE.md MD8, GN-4 to GN-6, MD6, MD9). The oracle
// (music-oracle.test.ts) holds the same functions to the TypeScript.
#include "music/MusicPlan.h"
#include "music/MusicTime.h"

#include <QJsonArray>
#include <QtTest>

using namespace nt::music;

namespace {
const PlanTempo k120{};
std::int64_t bar(std::int64_t n) { return barStartFrame(n, k120); }

PlanClip clip(const char* id, const char* track, std::int64_t start, std::int64_t end) {
    PlanClip c;
    c.id = id;
    c.trackId = track;
    c.startMs = frameToMs(start);
    c.durationMs = frameToMs(end - start);
    c.mediaType = "audio";
    c.currentAssetId = std::string("asset-") + id;
    return c;
}

PlanInput input(std::int64_t start, std::int64_t end, std::vector<PlanClip> clips) {
    PlanInput in;
    in.tempo = k120;
    in.tracks = {{"bass", "audio", false, false, "bass"}, {"drums", "audio", false, false, "drums"}};
    in.clips = std::move(clips);
    in.selection = {"bass", static_cast<double>(start), static_cast<double>(end)};
    return in;
}
} // namespace

class MusicPlanTests : public QObject {
    Q_OBJECT
private slots:
    void barStartFrameCountsFramesFromTheBarNumber() {
        QCOMPARE(barStartFrame(1, k120), 0);
        QCOMPARE(barStartFrame(2, k120), 96000);
        QCOMPARE(barStartFrame(13, k120) - barStartFrame(5, k120), 768000);
        QCOMPARE(barStartFrame(2, MusicTempo{120, 0, 6, 8}), 72000);
        QCOMPARE(barStartFrame(0, MusicTempo{120, 250, 4, 4}), 12000 - 96000);
        // 9999 bars at 87 BPM: round(9999 * 4 * 60 * 48000 / 87) computed exactly.
        QCOMPARE(barStartFrame(10000, MusicTempo{87, 0, 4, 4}), static_cast<std::int64_t>((9999LL * 240 * 48000 * 2 + 87) / (2 * 87)));
        QCOMPARE(beatLengthFrames(MusicTempo{120, 0, 6, 8}), 12000);
        QCOMPARE(msToFrame(frameToMs(123457)), 123457);
        QCOMPARE(jsRound(-2.5), -2.0);
        QCOMPARE(jsRound(0.49999999999999994), 0.0);
        QCOMPARE(snapFrameToGrid(48000, k120, GridDivision::Bar), 0);
        QCOMPARE(snapFrameToGrid(48001, k120, GridDivision::Bar), 96000);
        QVERIFY_THROWS_EXCEPTION(std::invalid_argument, (void)barStartFrame(1, MusicTempo{0, 0, 4, 4}));
    }

    void inferenceTableRows() {
        const auto inside = planMusicOperation(input(bar(3), bar(5), {clip("b", "bass", bar(1), bar(9))}));
        QCOMPARE(inside.inferred, std::optional(MusicTask::Repaint));
        QCOMPARE(inside.valid, std::vector{MusicTask::Repaint});
        const auto withDrums = planMusicOperation(input(bar(3), bar(5), {clip("d", "drums", bar(1), bar(9))}));
        QCOMPARE(withDrums.inferred, std::optional(MusicTask::Lego));
        QCOMPARE(withDrums.trackRole, std::optional<std::string>("bass"));
        const auto empty = planMusicOperation(input(bar(3), bar(5), {}));
        QCOMPARE(empty.inferred, std::optional(MusicTask::Text2Music));
        const auto partial = planMusicOperation(input(bar(7), bar(11), {clip("b", "bass", bar(1), bar(9))}));
        QVERIFY(!partial.inferred);
        QCOMPARE(partial.refusal, std::string("partial_overlap"));
        QVERIFY(partial.valid.empty());
    }

    void generateWindowsFollowGn6() {
        const auto plan = planMusicOperation(input(bar(5), bar(7), {}));
        QVERIFY(plan.refusal.empty());
        QCOMPARE(plan.windowStartFrame, std::optional<std::int64_t>(bar(5)));
        QCOMPARE(plan.requestFrames, std::optional<std::int64_t>(3 * 192000 + 24000));
        QVERIFY(plan.segments && plan.segments->size() == 3);
        QCOMPARE(plan.segments->at(2).startFrame, 384000);
        QCOMPARE(plan.segments->at(2).endFrame, 576000);
        QCOMPARE(plan.beatPhaseFrames, std::optional<std::int64_t>(0));
    }

    void contextWindowsFollowGn5() {
        auto in = input(bar(3), bar(5), {clip("b", "bass", bar(1), bar(9))});
        in.clips[0].inPointMs = 1500;
        const auto plan = planMusicOperation(in);
        QCOMPARE(plan.windowStartFrame, std::optional<std::int64_t>(0));
        QCOMPARE(plan.requestFrames, std::optional<std::int64_t>(480000));
        QVERIFY(plan.region);
        QCOMPARE(plan.region->startFrame, 192000);
        QCOMPARE(plan.region->endFrame, 384000);
        QVERIFY(plan.splice);
        QCOMPARE(plan.splice->parentAssetId, std::string("asset-b"));
        QCOMPARE(plan.splice->startFrame, 72000 + 192000);
        QCOMPARE(plan.splice->endFrame, 72000 + 384000);
    }

    void refusalsNameTheReason() {
        auto fast = input(bar(3), bar(5), {clip("b", "bass", bar(1), bar(9))});
        fast.clips[0].speedMultiplier = 1.5;
        QCOMPARE(planMusicOperation(fast).refusal, std::string("speed"));
        fast.clips[0].speedBaked = true;
        QVERIFY(planMusicOperation(fast).refusal.empty());
        auto remapped = input(bar(3), bar(5), {clip("b", "bass", bar(1), bar(9))});
        remapped.clips[0].timeRemap = true;
        QCOMPARE(planMusicOperation(remapped).reason,
                 std::string("Regenerate cannot replace bars in a clip with a time remap."));
        const auto tooLong = planMusicOperation(input(0, 600 * 48000, {}));
        QCOMPARE(tooLong.refusal, std::string("window_too_long"));
        auto noRole = input(bar(1), bar(3), {clip("d", "drums", bar(1), bar(9))});
        noRole.tracks[0].musicRole.clear();
        const auto missing = planMusicOperation(noRole);
        QCOMPARE(missing.refusal, std::string("missing_role"));
        QCOMPARE(missing.valid, std::vector{MusicTask::Text2Music});
        auto fractional = input(0, bar(2), {});
        fractional.tempo.bpm = 87.5;
        QCOMPARE(planMusicOperation(fractional).refusal, std::string("tempo"));
    }

    void tempoRules() {
        QVERIFY(musicTempoRefusal(MusicTempo{87, 0, 6, 8}).empty());
        QCOMPARE(musicTempoRefusal(MusicTempo{87.5, 0, 4, 4}), std::string(kMusicTempoBpmMessage));
        QCOMPARE(musicTempoRefusal(MusicTempo{120, 0, 5, 4}), std::string(kMusicTempoSignatureMessage));
        const QJsonObject t120{{"bpm", 120}, {"offsetMs", 0}, {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}}};
        auto t90 = t120;
        t90["bpm"] = 90;
        const QJsonObject withAudio{{"tempo", t120}, {"clips", QJsonArray{QJsonObject{{"mediaType", "audio"}}}}};
        const QJsonObject withVideo{{"tempo", t120}, {"clips", QJsonArray{QJsonObject{{"mediaType", "video"}}}}};
        QVERIFY(isTempoLocked(withAudio));
        QVERIFY(!isTempoLocked(withVideo));
        QCOMPARE(tempoChangeRefusal(withAudio, t90), QString::fromUtf8(kTempoLockedMessage.data()));
        QVERIFY(tempoChangeRefusal(withAudio, t120).isEmpty());
        QVERIFY(tempoChangeRefusal(withVideo, t90).isEmpty());
        auto music = withVideo;
        music["music"] = QJsonObject{};
        auto fractional = t120;
        fractional["bpm"] = 87.5;
        QCOMPARE(tempoChangeRefusal(music, fractional), QString::fromUtf8(kMusicTempoBpmMessage.data()));
    }
};

QTEST_GUILESS_MAIN(MusicPlanTests)
#include "tst_musicplan.moc"
