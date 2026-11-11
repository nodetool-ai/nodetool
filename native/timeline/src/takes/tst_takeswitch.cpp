// Switching takes on the clips, with no model. Cases follow FilmCraft's
// crates/engine/src/multicam_tests.rs (https://github.com/storytold/filmcraft), MIT. See licenses/FilmCraft-MIT.txt.
#include "takes/TakeSwitch.h"

#include <QJsonArray>
#include <QtTest>

using namespace nt::takes;
using nt::edit::EditDoc;

namespace {
QJsonObject take(const QString& id, double durationMs = 5000, const QString& status = "success") {
    return {{"id", id}, {"assetId", "asset-" + id}, {"status", status}, {"durationMs", durationMs},
            {"dependencyHash", "hash"}, {"paramOverridesSnapshot", QJsonObject{{"seed", id}}}};
}
QJsonObject baseClip() {
    return {{"id", "clip"}, {"trackId", "v1"}, {"name", "Shot"}, {"mediaType", "video"}, {"startMs", 1000}, {"durationMs", 4000},
            {"inPointMs", 200}, {"outPointMs", 4200}, {"currentAssetId", "asset-a"}, {"activeTakeId", "a"},
            {"dependencyHash", "hash"}, {"status", "generated"}, {"versions", QJsonArray{take("a"), take("b"), take("c", 2000)}},
            {"opacity", 0.5}, {"transform", QJsonObject{{"rotation", 12}}}, {"effects", QJsonArray{QJsonObject{{"id", "blur"}}}},
            {"fadeInMs", 100}, {"fadeOutMs", 300}, {"linkId", QJsonValue::Null}};
}
EditDoc docOf(std::vector<QJsonObject> clips) {
    EditDoc doc;
    doc.clips = std::move(clips);
    doc.tracks = {{"v2", "video", false}, {"v1", "video", false}, {"off", "video", false}};
    return doc;
}
QJsonObject clipIn(const nt::edit::ClipList& clips, const QString& id) {
    for (const auto& clip : clips) {
        if (clip.value("id").toString() == id) { return clip; }
    }
    return {};
}
Lookup lookupAt(double timeMs, QStringList selection = {}) {
    return {std::move(selection), {"v1", "v2"}, {"v2", "v1", "off"}, timeMs};
}
}

class TakeSwitchTest : public QObject {
    Q_OBJECT
private slots:
    void listsOnlyFinishedTakes() {
        auto clip = baseClip();
        clip.insert("versions", QJsonArray{take("a"), take("failed", 5000, "failed"), take("b"), QJsonObject{{"id", "empty"}, {"status", "success"}}});
        const auto takes = selectableTakes(clip);
        QCOMPARE(takes.size(), 2);
        QCOMPARE(takes[1].value("id").toString(), QString("b"));
    }
    void findsTheActiveTake() {
        auto clip = baseClip();
        QCOMPARE(activeTakeIndex(clip), 0);
        clip.insert("activeTakeId", "b");
        clip.insert("currentAssetId", "asset-b");
        QCOMPARE(activeTakeIndex(clip), 1);
        // The asset decides when the stored id disagrees, as Take.cpp's deleteTake does.
        clip.insert("activeTakeId", "a");
        QCOMPARE(activeTakeIndex(clip), 1);
        clip.insert("currentAssetId", "elsewhere");
        QCOMPARE(activeTakeIndex(clip), -1);
        clip.remove("currentAssetId");
        QCOMPARE(activeTakeIndex(clip), 0);
    }
    void namesAndBadges() {
        auto named = take("a");
        QCOMPARE(takeName(named, 3), QString("Take 3"));
        named.insert("label", "Wide");
        QCOMPARE(takeName(named, 3), QString("Wide"));
        QCOMPARE(takeBadge(baseClip()), QString("1/3"));
        auto single = baseClip();
        single.insert("versions", QJsonArray{take("a")});
        QCOMPARE(takeBadge(single), QString());
        single.remove("versions");
        QCOMPARE(takeBadge(single), QString());
    }
    void selectionComesBeforeThePlayhead() {
        auto top = baseClip();
        top.insert("id", "top");
        top.insert("trackId", "v2");
        auto plain = baseClip();
        plain.insert("id", "plain");
        plain.remove("versions");
        auto later = baseClip();
        later.insert("id", "later");
        later.insert("startMs", 9000);
        const auto doc = docOf({plain, baseClip(), top, later});
        // Nothing selected: the top clip with takes at the playhead.
        QCOMPARE(switchTargets(doc, lookupAt(2000)), QStringList{"top"});
        QCOMPARE(cutTarget(doc, lookupAt(2000)), QString("top"));
        // A selected clip is used wherever the playhead is, but a cut needs it under the playhead.
        QCOMPARE(switchTargets(doc, lookupAt(2000, {"later"})), QStringList{"later"});
        QCOMPARE(cutTarget(doc, lookupAt(2000, {"later"})), QString("top"));
        QCOMPARE(cutTarget(doc, lookupAt(2000, {"clip"})), QString("clip"));
        // A selected clip with no takes does not count.
        QCOMPARE(switchTargets(doc, lookupAt(2000, {"plain"})), QStringList{"top"});
        // Every selected clip with takes switches.
        QCOMPARE(switchTargets(doc, lookupAt(2000, {"clip", "top"})), (QStringList{"clip", "top"}));
        // An untargeted track is skipped.
        auto lookup = lookupAt(2000);
        lookup.targetedTracks = {"v1"};
        QCOMPARE(cutTarget(doc, lookup), QString("clip"));
        lookup.targetedTracks = {};
        QCOMPARE(switchTargets(doc, lookup), QStringList{});
        // No clip at the time.
        QVERIFY(cutTarget(doc, lookupAt(100)).isEmpty());
    }
    void switchKeepsTheEdit() {
        const auto clip = baseClip();
        const auto edit = switchTake(docOf({clip}), "clip", 1);
        QVERIFY2(edit.error.isEmpty(), qPrintable(edit.error));
        QVERIFY(edit.changed);
        const auto result = clipIn(edit.clips, "clip");
        QCOMPARE(result.value("currentAssetId").toString(), QString("asset-b"));
        QCOMPARE(result.value("activeTakeId").toString(), QString("b"));
        for (const auto* field : {"id", "trackId", "name", "startMs", "durationMs", "inPointMs", "outPointMs", "opacity",
                                  "transform", "effects", "fadeInMs", "fadeOutMs", "versions"}) {
            QVERIFY2(result.value(field) == clip.value(field), field);
        }
    }
    void aShorterTakeIsRefused() {
        const auto clip = baseClip();
        const auto edit = switchTake(docOf({clip}), "clip", 2);
        QCOMPARE(edit.error, QString("Take is shorter than the current cut."));
        QVERIFY(!edit.changed);
        QCOMPARE(clipIn(edit.clips, "clip"), clip);
    }
    void otherRefusals() {
        auto clip = baseClip();
        auto missing = switchTake(docOf({clip}), "clip", 5);
        QCOMPARE(missing.error, QString("Take 6 does not exist. This clip has 3 takes."));
        QVERIFY(!missing.changed);
        QVERIFY(!switchTake(docOf({clip}), "gone", 0).error.isEmpty());
        auto locked = clip;
        locked.insert("locked", true);
        QCOMPARE(switchTake(docOf({locked}), "clip", 1).error, QString("Unlock the clip to switch its take."));
        auto lockedTrack = docOf({clip});
        lockedTrack.tracks[1].locked = true;
        QCOMPARE(switchTake(lockedTrack, "clip", 1).error, QString("Unlock the clip to switch its take."));
        // The take the clip already shows is no edit and no refusal.
        const auto same = switchTake(docOf({clip}), "clip", 0);
        QVERIFY(same.error.isEmpty());
        QVERIFY(!same.changed);
    }
    void cutSplitsAndSwitchesThePartAfter() {
        const auto clip = baseClip();
        const auto edit = cutToTake(docOf({clip}), "clip", 3000, 1, true);
        QVERIFY2(edit.error.isEmpty(), qPrintable(edit.error));
        QVERIFY(edit.changed);
        QCOMPARE(edit.clips.size(), size_t(2));
        const auto right = clipIn(edit.clips, edit.resultId);
        QVERIFY(!right.isEmpty());
        const auto left = edit.clips[0].value("id") == edit.resultId ? edit.clips[1] : edit.clips[0];
        // Before the cut: the old take. After it: the new one.
        QCOMPARE(left.value("currentAssetId").toString(), QString("asset-a"));
        QCOMPARE(left.value("activeTakeId").toString(), QString("a"));
        QCOMPARE(right.value("currentAssetId").toString(), QString("asset-b"));
        QCOMPARE(right.value("activeTakeId").toString(), QString("b"));
        // The timing and the source window carry on across the cut.
        QCOMPARE(left.value("startMs").toDouble(), 1000.0);
        QCOMPARE(left.value("durationMs").toDouble(), 2000.0);
        QCOMPARE(right.value("startMs").toDouble(), 3000.0);
        QCOMPARE(right.value("durationMs").toDouble(), 2000.0);
        QCOMPARE(left.value("outPointMs").toDouble(), 2200.0);
        QCOMPARE(right.value("inPointMs").toDouble(), 2200.0);
        QCOMPARE(right.value("outPointMs").toDouble(), 4200.0);
        // The fades stay at the outer ends, and the look on both parts.
        QCOMPARE(left.value("fadeInMs").toDouble(), 100.0);
        QVERIFY(!left.contains("fadeOutMs"));
        QVERIFY(!right.contains("fadeInMs"));
        QCOMPARE(right.value("fadeOutMs").toDouble(), 300.0);
        for (const auto& part : {left, right}) {
            for (const auto* field : {"trackId", "name", "opacity", "transform", "effects", "versions"}) {
                QVERIFY2(part.value(field) == clip.value(field), field);
            }
        }
    }
    void aCutFollowsTheTakesSourceMapping() {
        auto clip = baseClip();
        auto mapped = take("m", 9000);
        mapped.insert("sourceMapping", QJsonObject{{"inPointMs", 1000}, {"outPointMs", 5000}});
        clip.insert("versions", QJsonArray{take("a"), mapped});
        const auto edit = cutToTake(docOf({clip}), "clip", 3000, 1, true);
        QVERIFY2(edit.error.isEmpty(), qPrintable(edit.error));
        const auto right = clipIn(edit.clips, edit.resultId);
        QCOMPARE(right.value("inPointMs").toDouble(), 3000.0);
        QCOMPARE(right.value("outPointMs").toDouble(), 5000.0);
    }
    void aRefusedCutSplitsNothing() {
        const auto clip = baseClip();
        const auto edit = cutToTake(docOf({clip}), "clip", 3000, 2, true);
        QCOMPARE(edit.error, QString("Take is shorter than the current cut."));
        QVERIFY(!edit.changed);
        QCOMPARE(edit.clips.size(), size_t(1));
        QCOMPARE(clipIn(edit.clips, "clip"), clip);
        auto doc = docOf({clip});
        doc.clipsWithMediaTracks.insert("clip");
        const auto owner = cutToTake(doc, "clip", 3000, 1, true);
        QCOMPARE(owner.error, QString("This clip cannot be cut at the playhead."));
        QCOMPARE(owner.clips.size(), size_t(1));
    }
    void cutAtAnEditSwitchesTheWholeClip() {
        const auto edit = cutToTake(docOf({baseClip()}), "clip", 1000, 1, true);
        QVERIFY(edit.changed);
        QCOMPARE(edit.clips.size(), size_t(1));
        QCOMPARE(edit.resultId, QString("clip"));
        QCOMPARE(clipIn(edit.clips, "clip").value("currentAssetId").toString(), QString("asset-b"));
    }
    void theSameTakeOnlySplitsWhenAsked() {
        const auto live = cutToTake(docOf({baseClip()}), "clip", 3000, 0, false);
        QVERIFY(!live.changed);
        QCOMPARE(live.clips.size(), size_t(1));
        const auto stopped = cutToTake(docOf({baseClip()}), "clip", 3000, 0, true);
        QVERIFY(stopped.changed);
        QCOMPARE(stopped.clips.size(), size_t(2));
        QCOMPARE(clipIn(stopped.clips, stopped.resultId).value("currentAssetId").toString(), QString("asset-a"));
    }
    void aLinkedPartnerSplitsAndKeepsItsMedia() {
        auto video = baseClip();
        video.insert("linkId", "link");
        auto audio = baseClip();
        audio.insert("id", "audio");
        audio.insert("trackId", "a1");
        audio.insert("mediaType", "audio");
        audio.insert("linkId", "link");
        audio.remove("versions");
        auto doc = docOf({video, audio});
        doc.tracks.push_back({"a1", "audio", false});
        const auto edit = cutToTake(doc, "clip", 3000, 1, true);
        QVERIFY2(edit.error.isEmpty(), qPrintable(edit.error));
        QCOMPARE(edit.clips.size(), size_t(4));
        int oldAudio = 0;
        for (const auto& clip : edit.clips) {
            if (clip.value("mediaType") == "audio" && clip.value("currentAssetId") == "asset-a") { ++oldAudio; }
        }
        QCOMPARE(oldAudio, 2);
    }
    void sourceTimeFollowsTheShownTake() {
        const auto clip = baseClip();
        QCOMPARE(takeSourceMs(clip, "b", 2000), 1200.0);
        // Clamped to the clip when the playhead is elsewhere.
        QCOMPARE(takeSourceMs(clip, "b", 0), 200.0);
        QCOMPARE(takeSourceMs(clip, "b", 99000), 4200.0);
        auto fast = clip;
        fast.insert("speedMultiplier", 2.0);
        QCOMPARE(takeSourceMs(fast, "refused", 2000), 2200.0);
    }
};
QTEST_APPLESS_MAIN(TakeSwitchTest)
#include "tst_takeswitch.moc"
