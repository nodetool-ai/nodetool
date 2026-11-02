// The remix edit as pure functions on the raw document: the take it appends, the
// clip it changes, what it refuses and how revert restores the source.
#include "remix/clip/RemixEdit.h"

#include <QtTest>

using namespace nt::remix;

namespace {
QJsonObject track(const QString& id, const QString& type, bool locked = false) {
    return {{"id", id}, {"name", id + " name"}, {"type", type}, {"index", 0}, {"locked", locked}};
}
QJsonObject audioClip(const QString& id, double startMs, double durationMs, const QJsonObject& extra = {}) {
    QJsonObject clip{{"id", id}, {"trackId", "a1"}, {"name", id}, {"mediaType", "audio"}, {"startMs", startMs},
                     {"durationMs", durationMs}, {"currentAssetId", "asset-src"}, {"status", "generated"},
                     {"sourceType", "generated"}, {"versions", QJsonArray{}}};
    for (auto it = extra.begin(); it != extra.end(); ++it) { clip.insert(it.key(), it.value()); }
    return clip;
}
QJsonObject doc(const QJsonArray& clips) {
    return {{"id", "doc"}, {"fps", 30}, {"durationMs", 120000}, {"tracks", QJsonArray{track("a1", "audio"), track("a2", "audio", true), track("v1", "video")}},
            {"clips", clips}};
}
QJsonObject ofClip(const QString& id) { return {{"clipId", id}}; }
QJsonObject prompt() { return {{"prompt", "x"}}; }
QJsonObject clipOf(const QJsonObject& raw, const QString& id) {
    for (const auto& value : raw.value("clips").toArray()) {
        if (value.toObject().value("id").toString() == id) { return value.toObject(); }
    }
    return {};
}
QJsonObject payload(const QString& clipId, double durationMs, const QString& takeId = "take-1", const QString& assetId = "asset-remix") {
    return {{"clipId", clipId}, {"assetId", assetId}, {"takeId", takeId}, {"createdAt", "2026-11-02T10:00:00.000Z"},
            {"durationMs", durationMs}, {"sourceDurationMs", 40000.0},
            {"remix", QJsonObject{{"targetMs", durationMs}, {"segments", 50}, {"variations", 50}, {"bpm", 120.0},
                                  {"beats", 80}, {"cuts", QJsonArray{QJsonObject{{"outMs", 12000.0}, {"inMs", 4000.0}}}}, {"stretch", 1.001}}}};
}
}  // namespace

class TestRemixEdit : public QObject {
    Q_OBJECT
private slots:
    void aRemixAddsTheOriginalAndTheNewTake() {
        const auto raw = doc({audioClip("m", 2000, 40000, {{"inPointMs", 5000.0}, {"outPointMs", 45000.0}, {"paramOverrides", QJsonObject{{"prompt", "x"}}}})});
        QVERIFY(refusal(raw, "m", 30000).isEmpty());
        const auto after = applyRemix(raw, payload("m", 30000));
        QVERIFY(after != raw);
        const auto clip = clipOf(after, "m");
        QCOMPARE(clip.value("currentAssetId").toString(), QString("asset-remix"));
        QCOMPARE(clip.value("durationMs").toDouble(), 30000.0);
        QCOMPARE(clip.value("inPointMs").toDouble(), 0.0);
        QCOMPARE(clip.value("outPointMs").toDouble(), 30000.0);
        QCOMPARE(clip.value("startMs").toDouble(), 2000.0);
        QCOMPARE(clip.value("activeTakeId").toString(), QString("take-1"));
        QCOMPARE(clip.value("paramOverrides").toObject(), prompt());
        const auto versions = clip.value("versions").toArray();
        QCOMPARE(versions.size(), 2);
        const auto baseline = versions.at(0).toObject();
        const auto take = versions.at(1).toObject();
        QCOMPARE(baseline.value("assetId").toString(), QString("asset-src"));
        QCOMPARE(baseline.value("status").toString(), QString("success"));
        // The source's window has the length of the remix, which is what lets the web put it back with its start.
        QCOMPARE(baseline.value("sourceMapping").toObject().value("inPointMs").toDouble(), 5000.0);
        QCOMPARE(baseline.value("sourceMapping").toObject().value("outPointMs").toDouble(), 35000.0);
        QCOMPARE(baseline.value("durationMs").toDouble(), 40000.0);
        QCOMPARE(baseline.value("id").toString().size(), 32);
        QCOMPARE(take.value("id").toString(), QString("take-1"));
        QCOMPARE(take.value("assetId").toString(), QString("asset-remix"));
        QCOMPARE(take.value("parentTakeId").toString(), baseline.value("id").toString());
        QCOMPARE(take.value("label").toString(), QString("Remix 0:30"));
        QCOMPARE(take.value("status").toString(), QString("success"));
        QCOMPARE(take.value("durationMs").toDouble(), 30000.0);
        // Every field the web schema requires of a take is there.
        for (const auto* field : {"id", "createdAt", "jobId", "assetId", "workflowUpdatedAt", "dependencyHash", "paramOverridesSnapshot", "status"}) {
            QVERIFY2(take.contains(field) && baseline.contains(field), field);
        }
        // The snapshot keeps the clip's own overrides: choosing the take copies it onto the clip.
        QCOMPARE(take.value("paramOverridesSnapshot").toObject().value("prompt").toString(), QString("x"));
        QCOMPARE(baseline.value("paramOverridesSnapshot").toObject(), prompt());
        const auto meta = take.value("paramOverridesSnapshot").toObject().value("remix").toObject();
        QCOMPARE(meta.value("sourceAssetId").toString(), QString("asset-src"));
        QCOMPARE(meta.value("sourceTakeId").toString(), baseline.value("id").toString());
        QCOMPARE(meta.value("originalDurationMs").toDouble(), 40000.0);
        QCOMPARE(meta.value("originalInPointMs").toDouble(), 5000.0);
        QCOMPARE(meta.value("originalOutPointMs").toDouble(), 45000.0);
        QCOMPARE(meta.value("bpm").toDouble(), 120.0);
        QCOMPARE(activeRemix(clip), meta);
        // No other clip or document field changes.
        QCOMPARE(after.value("tracks"), raw.value("tracks"));
        QCOMPARE(after.value("durationMs"), raw.value("durationMs"));
    }
    void aClipThatAlreadyHasItsSourceTakeKeepsIt() {
        const QJsonObject generated{{"id", "gen-take"}, {"assetId", "asset-src"}, {"status", "success"}, {"createdAt", "t"}, {"jobId", "j"},
                                    {"workflowUpdatedAt", "t"}, {"dependencyHash", "h"}, {"paramOverridesSnapshot", QJsonObject{}}};
        const auto raw = doc({audioClip("m", 0, 40000, {{"versions", QJsonArray{generated}}, {"activeTakeId", "gen-take"}})});
        const auto clip = clipOf(applyRemix(raw, payload("m", 20000)), "m");
        const auto versions = clip.value("versions").toArray();
        QCOMPARE(versions.size(), 2);
        // Its window is now the remix's length, so the web puts it back with the clip's own start.
        auto source = versions.at(0).toObject();
        QCOMPARE(source.take("sourceMapping").toObject(), (QJsonObject{{"inPointMs", 0.0}, {"outPointMs", 20000.0}}));
        QCOMPARE(source, generated);
        QCOMPARE(versions.at(1).toObject().value("parentTakeId").toString(), QString("gen-take"));
        QCOMPARE(activeRemix(clip).value("sourceTakeId").toString(), QString("gen-take"));
        QVERIFY(!clip.contains("inPointMs") || clip.value("inPointMs").toDouble() == 0.0);
    }
    void aNewTargetRemixesTheSourceAgainNotTheRemix() {
        const auto raw = doc({audioClip("m", 0, 40000, {{"inPointMs", 5000.0}})});
        const auto first = applyRemix(raw, payload("m", 30000));
        const auto window = sourceWindow(clipOf(first, "m"));
        QVERIFY(window);
        QCOMPARE(window->assetId, QString("asset-src"));
        QCOMPARE(window->startMs, 5000.0);
        QCOMPARE(window->durationMs, 40000.0);
        const auto second = applyRemix(first, payload("m", 20000, "take-2", "asset-remix-2"));
        const auto clip = clipOf(second, "m");
        QCOMPARE(clip.value("versions").toArray().size(), 3);
        QCOMPARE(clip.value("durationMs").toDouble(), 20000.0);
        const auto meta = activeRemix(clip);
        QCOMPARE(meta.value("sourceAssetId").toString(), QString("asset-src"));
        QCOMPARE(meta.value("originalDurationMs").toDouble(), 40000.0);
        QCOMPARE(meta.value("originalInPointMs").toDouble(), 5000.0);
        QCOMPARE(clip.value("versions").toArray().at(2).toObject().value("parentTakeId").toString(), meta.value("sourceTakeId").toString());
    }
    void anUnplayedSourceWindowIsTheClipAsItPlaysNow() {
        const auto window = sourceWindow(audioClip("m", 0, 12000, {{"inPointMs", 250.0}}));
        QVERIFY(window);
        QCOMPARE(window->assetId, QString("asset-src"));
        QCOMPARE(window->startMs, 250.0);
        QCOMPARE(window->durationMs, 12000.0);
        QVERIFY(activeRemix(audioClip("m", 0, 12000)).isEmpty());
    }
    void revertGivesTheOriginalBack() {
        const auto raw = doc({audioClip("m", 2000, 40000, {{"inPointMs", 5000.0}, {"outPointMs", 45000.0}})});
        const auto remixed = applyRemix(raw, payload("m", 30000));
        QVERIFY(revertRefusal(remixed, "m").isEmpty());
        const auto reverted = revertRemix(remixed, ofClip("m"));
        QVERIFY(reverted != remixed);
        auto clip = clipOf(reverted, "m");
        auto original = clipOf(raw, "m");
        const auto meta = activeRemix(clipOf(remixed, "m"));
        QCOMPARE(clip.value("activeTakeId").toString(), meta.value("sourceTakeId").toString());
        QCOMPARE(clip.value("versions").toArray().size(), 2);  // the history stays
        clip.remove("versions");
        clip.remove("activeTakeId");
        original.remove("versions");
        QCOMPARE(clip, original);
        // Nothing to revert twice.
        QVERIFY(!revertRefusal(reverted, "m").isEmpty());
        QCOMPARE(revertRemix(reverted, ofClip("m")), reverted);
    }
    void aTakeSwitchOnTheWebLeavesNoRemixKeyAfterRevert() {
        const auto raw = doc({audioClip("m", 0, 40000, {{"paramOverrides", prompt()}})});
        auto remixed = applyRemix(raw, payload("m", 30000));
        // The web copied the remix take's snapshot onto the clip.
        auto clips = remixed.value("clips").toArray();
        auto clip = clips.at(0).toObject();
        clip.insert("paramOverrides", clip.value("versions").toArray().at(1).toObject().value("paramOverridesSnapshot"));
        clips.replace(0, clip);
        remixed.insert("clips", clips);
        const auto reverted = clipOf(revertRemix(remixed, ofClip("m")), "m");
        QCOMPARE(reverted.value("paramOverrides").toObject(), prompt());
    }
    void revertRemovesPointsThatWereNotThere() {
        const auto raw = doc({audioClip("m", 0, 40000)});
        const auto reverted = revertRemix(applyRemix(raw, payload("m", 30000)), ofClip("m"));
        const auto clip = clipOf(reverted, "m");
        QVERIFY(!clip.contains("inPointMs"));
        QVERIFY(!clip.contains("outPointMs"));
        QCOMPARE(clip.value("durationMs").toDouble(), 40000.0);
    }
    void refusesWhenTheResultWouldOverlapTheNextClip() {
        const auto raw = doc({audioClip("m", 0, 20000), audioClip("n", 40000, 5000), audioClip("o", 100000, 5000, {{"trackId", "v1"}, {"mediaType", "video"}})});
        QVERIFY(refusal(raw, "m", 39000).isEmpty());
        const auto reason = refusal(raw, "m", 41000);
        QVERIFY2(reason.contains("overlap") && reason.contains("a1 name") && reason.contains("41.00"), qPrintable(reason));
        QCOMPARE(applyRemix(raw, payload("m", 41000)), raw);
        // The next clip on another track does not count.
        QVERIFY(refusal(raw, "m", 90000).isEmpty() == false);  // n is still on the track
        const auto single = doc({audioClip("m", 0, 20000), audioClip("x", 5000, 2000, {{"trackId", "v1"}, {"mediaType", "video"}})});
        QVERIFY(refusal(single, "m", 90000).isEmpty());
        // A clip that already overlaps may shrink or stay.
        const auto tight = doc({audioClip("m", 0, 30000), audioClip("n", 20000, 5000)});
        // The overlap was there before, so a remix that does not grow it makes nothing worse.
        QVERIFY(refusal(tight, "m", 25000).isEmpty());
        QVERIFY(!refusal(tight, "m", 35000).isEmpty());
    }
    void revertIsRefusedWhenTheOriginalWouldOverlap() {
        const auto raw = doc({audioClip("m", 0, 40000), audioClip("n", 50000, 5000)});
        auto remixed = applyRemix(raw, payload("m", 20000));
        auto clips = remixed.value("clips").toArray();
        auto next = clips.at(1).toObject();
        next.insert("startMs", 25000.0);
        clips.replace(1, next);
        remixed.insert("clips", clips);
        const auto reason = revertRefusal(remixed, "m");
        QVERIFY2(reason.contains("overlap"), qPrintable(reason));
        QCOMPARE(revertRemix(remixed, ofClip("m")), remixed);
    }
    void refusesClipsItCannotRemix() {
        QVERIFY(refusal(doc({}), "nope", 1000).contains("no longer exists"));
        QVERIFY(refusal(doc({audioClip("v", 0, 1000, {{"mediaType", "video"}, {"trackId", "v1"}})}), "v", 1000).contains("audio"));
        QVERIFY(refusal(doc({audioClip("m", 0, 1000, {{"locked", true}})}), "m", 1000).contains("Unlock"));
        QVERIFY(refusal(doc({audioClip("m", 0, 1000, {{"trackId", "a2"}})}), "m", 1000).contains("Unlock"));
        QVERIFY(refusal(doc({audioClip("m", 0, 1000, {{"speedMultiplier", 1.5}})}), "m", 1000).contains("speed"));
        QVERIFY(refusal(doc({audioClip("m", 0, 1000, {{"timeRemap", QJsonObject{{"keyframes", QJsonArray{QJsonObject{{"t", 0}}}}}}})}), "m", 1000).contains("speed"));
        QVERIFY(refusal(doc({audioClip("m", 0, 1000, {{"currentAssetId", ""}})}), "m", 1000).contains("no audio"));
        QVERIFY(refusal(doc({audioClip("m", 0, 1000)}), "m", 0).isEmpty());
        // A baked speed or a speed of 1 is not a speed change.
        QVERIFY(refusal(doc({audioClip("m", 0, 1000, {{"speedMultiplier", 2.0}, {"speedBaked", true}})}), "m", 1000).isEmpty());
        QVERIFY(refusal(doc({audioClip("m", 0, 1000, {{"speedMultiplier", 1.0}})}), "m", 1000).isEmpty());
    }
    void aRefusedEditChangesNothing() {
        const auto raw = doc({audioClip("m", 0, 20000), audioClip("n", 25000, 5000)});
        QCOMPARE(applyRemix(raw, payload("m", 30000)), raw);
        QCOMPARE(applyRemix(raw, payload("nope", 1000)), raw);
        auto missing = payload("m", 10000);
        missing.remove("assetId");
        QCOMPARE(applyRemix(raw, missing), raw);
        auto noTake = payload("m", 10000);
        noTake.remove("takeId");
        QCOMPARE(applyRemix(raw, noTake), raw);
        auto zero = payload("m", 0);
        QCOMPARE(applyRemix(raw, zero), raw);
        auto nan = payload("m", 10000);
        nan.insert("durationMs", std::numeric_limits<double>::quiet_NaN());
        QCOMPARE(applyRemix(raw, nan), raw);
        // Running the same take twice adds nothing.
        const auto once = applyRemix(raw, payload("m", 10000));
        QCOMPARE(applyRemix(once, payload("m", 10000)), once);
    }
    void takeLabelsAreMinutesAndSeconds() {
        QCOMPARE(takeLabel(30000), QString("Remix 0:30"));
        QCOMPARE(takeLabel(30400), QString("Remix 0:30"));
        QCOMPARE(takeLabel(30600), QString("Remix 0:31"));
        QCOMPARE(takeLabel(125000), QString("Remix 2:05"));
    }
};
QTEST_APPLESS_MAIN(TestRemixEdit)
#include "tst_remixedit.moc"
