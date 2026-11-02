// The document side of Scene Edit Detection: cuts as splits with linked audio,
// the clips it refuses, and the cut markers.
#include "scenedetect/SceneEditPlan.h"

#include <QtTest>

#include <algorithm>

using namespace nt::shots;
using nt::edit::EditDoc;

namespace {
QJsonObject clip(const QString& id, const QString& track, double start, double duration, const QJsonObject& extra = {}) {
    QJsonObject c{{"id", id}, {"trackId", track}, {"name", id}, {"startMs", start}, {"durationMs", duration},
                  {"inPointMs", 0}, {"mediaType", track == "a" ? "audio" : "video"}};
    for (auto it = extra.begin(); it != extra.end(); ++it) { c.insert(it.key(), it.value()); }
    return c;
}
QJsonObject track(const QString& id, const QString& type, bool locked = false) {
    return {{"id", id}, {"type", type}, {"locked", locked}};
}
EditDoc docOf(const QJsonArray& clips, const QJsonArray& tracks) {
    return editDocOf({{"clips", clips}, {"tracks", tracks}});
}
CutRequest request(const QJsonObject& c, std::vector<double> at) {
    return {c.value("id").toString(), c.value("startMs").toDouble(), c.value("durationMs").toDouble(),
            c.value("inPointMs").toDouble(), std::move(at)};
}
// The clips on a track, in time order.
std::vector<QJsonObject> onTrack(const nt::edit::ClipList& clips, const QString& id) {
    std::vector<QJsonObject> out;
    for (const auto& c : clips) {
        if (c.value("trackId").toString() == id) { out.push_back(c); }
    }
    std::sort(out.begin(), out.end(), [](const auto& a, const auto& b) { return a.value("startMs").toDouble() < b.value("startMs").toDouble(); });
    return out;
}
}  // namespace

class TestSceneEditPlan : public QObject {
    Q_OBJECT
private slots:
    void cutsOneClipAtEveryTime() {
        const auto v = clip("v", "v", 1000, 4000, {{"inPointMs", 500}});
        const auto doc = docOf({v}, {track("v", "video")});
        const auto plan = planCuts(doc, {request(v, {2000, 3500, 4000})});
        QCOMPARE(plan.outcomes.at(0), CutOutcome::Cut);
        QCOMPARE(plan.points, 3);
        QCOMPARE(plan.clipsCut, 1);
        const auto pieces = onTrack(plan.clips, "v");
        QCOMPARE(pieces.size(), size_t(4));
        const double starts[] = {1000, 2000, 3500, 4000};
        const double durations[] = {1000, 1500, 500, 1000};
        const double inPoints[] = {500, 1500, 3000, 3500};
        QStringList ids;
        for (size_t i = 0; i < pieces.size(); ++i) {
            QCOMPARE(pieces[i].value("startMs").toDouble(), starts[i]);
            QCOMPARE(pieces[i].value("durationMs").toDouble(), durations[i]);
            QCOMPARE(pieces[i].value("inPointMs").toDouble(), inPoints[i]);
            ids << pieces[i].value("id").toString();
        }
        ids.removeDuplicates();
        QCOMPARE(ids.size(), 4);
        // The pieces tile the clip with no gap and no overlap.
        QCOMPARE(pieces.back().value("startMs").toDouble() + pieces.back().value("durationMs").toDouble(), 5000.0);
        QCOMPARE(doc.clips.size(), size_t(1));  // the input document is not touched
    }
    void cutsLinkedAudioWithItsVideo() {
        const auto v = clip("v", "v", 0, 3000, {{"linkId", "L"}});
        const auto a = clip("a", "a", 0, 3000, {{"linkId", "L"}});
        const auto plan = planCuts(docOf({v, a}, {track("v", "video"), track("a", "audio")}), {request(v, {1000, 2000})});
        QCOMPARE(plan.outcomes.at(0), CutOutcome::Cut);
        QCOMPARE(plan.points, 2);
        const auto video = onTrack(plan.clips, "v");
        const auto audio = onTrack(plan.clips, "a");
        QCOMPARE(video.size(), size_t(3));
        QCOMPARE(audio.size(), size_t(3));
        QSet<QString> links;
        for (size_t i = 0; i < 3; ++i) {
            QCOMPARE(audio[i].value("startMs").toDouble(), video[i].value("startMs").toDouble());
            QCOMPARE(audio[i].value("durationMs").toDouble(), video[i].value("durationMs").toDouble());
            QVERIFY(!video[i].value("linkId").toString().isEmpty());
            QCOMPARE(audio[i].value("linkId").toString(), video[i].value("linkId").toString());
            links.insert(video[i].value("linkId").toString());
        }
        QCOMPARE(links.size(), 3);  // each piece pair is its own link
    }
    void aSpeedChangedClipKeepsItsRateInEachHalf() {
        const auto v = clip("v", "v", 1000, 2000, {{"inPointMs", 1000}, {"speedMultiplier", 2}, {"outPointMs", 5000}});
        const auto plan = planCuts(docOf({v}, {track("v", "video")}), {request(v, {1500})});
        QCOMPARE(plan.outcomes.at(0), CutOutcome::Cut);
        const auto pieces = onTrack(plan.clips, "v");
        QCOMPARE(pieces.size(), size_t(2));
        QCOMPARE(pieces[0].value("outPointMs").toDouble(), 2000.0);  // 1000 + 500 ms * 2
        QCOMPARE(pieces[1].value("inPointMs").toDouble(), 2000.0);
        QCOMPARE(pieces[1].value("outPointMs").toDouble(), 5000.0);
        QCOMPARE(pieces[0].value("speedMultiplier").toDouble(), 2.0);
        QCOMPARE(pieces[1].value("speedMultiplier").toDouble(), 2.0);
        QCOMPARE(pieces[1].value("durationMs").toDouble(), 1500.0);
    }
    void refusesLockedClips() {
        const auto lockedClip = clip("c", "v", 0, 2000, {{"locked", true}});
        auto plan = planCuts(docOf({lockedClip}, {track("v", "video")}), {request(lockedClip, {1000})});
        QCOMPARE(plan.outcomes.at(0), CutOutcome::Locked);
        QCOMPARE(plan.points, 0);
        QCOMPARE(plan.clips.size(), size_t(1));

        const auto onLockedTrack = clip("c", "v", 0, 2000);
        plan = planCuts(docOf({onLockedTrack}, {track("v", "video", true)}), {request(onLockedTrack, {1000})});
        QCOMPARE(plan.outcomes.at(0), CutOutcome::Locked);

        // The audio partner sits on a locked track, so the pair is not cut.
        const auto v = clip("v", "v", 0, 2000, {{"linkId", "L"}});
        const auto a = clip("a", "a", 0, 2000, {{"linkId", "L"}});
        plan = planCuts(docOf({v, a}, {track("v", "video"), track("a", "audio", true)}), {request(v, {1000})});
        QCOMPARE(plan.outcomes.at(0), CutOutcome::Locked);
        QCOMPARE(plan.clips.size(), size_t(2));
    }
    void onlyTheUnlockedRequestIsCut() {
        const auto open = clip("open", "v", 0, 2000);
        const auto shut = clip("shut", "w", 0, 2000, {{"locked", true}});
        const auto plan = planCuts(docOf({open, shut}, {track("v", "video"), track("w", "video")}),
            {request(shut, {1000}), request(open, {1000})});
        QCOMPARE(plan.outcomes.at(0), CutOutcome::Locked);
        QCOMPARE(plan.outcomes.at(1), CutOutcome::Cut);
        QCOMPARE(plan.points, 1);
        QCOMPARE(onTrack(plan.clips, "v").size(), size_t(2));
        QCOMPARE(onTrack(plan.clips, "w").size(), size_t(1));
    }
    void refusesATimeRemap() {
        const auto remapped = clip("c", "v", 0, 2000,
            {{"timeRemap", QJsonObject{{"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"v", 0}}, QJsonObject{{"t", 1}, {"v", 1}}}}}}});
        const auto plan = planCuts(docOf({remapped}, {track("v", "video")}), {request(remapped, {1000})});
        QCOMPARE(plan.outcomes.at(0), CutOutcome::CannotSplit);
        QCOMPARE(plan.points, 0);
        QCOMPARE(plan.clips.size(), size_t(1));
    }
    void refusesAClipThatChangedSinceTheAnalysis() {
        const auto v = clip("v", "v", 0, 2000);
        const auto doc = docOf({v}, {track("v", "video")});
        auto moved = request(v, {1000});
        moved.startMs = 500;
        QCOMPARE(planCuts(doc, {moved}).outcomes.at(0), CutOutcome::Changed);
        auto trimmed = request(v, {1000});
        trimmed.durationMs = 1500;
        QCOMPARE(planCuts(doc, {trimmed}).outcomes.at(0), CutOutcome::Changed);
        auto slipped = request(v, {1000});
        slipped.inPointMs = 40;
        QCOMPARE(planCuts(doc, {slipped}).outcomes.at(0), CutOutcome::Changed);
        auto gone = request(v, {1000});
        gone.clipId = "missing";
        const auto plan = planCuts(doc, {gone});
        QCOMPARE(plan.outcomes.at(0), CutOutcome::Changed);
        QCOMPARE(plan.points, 0);
    }
    void ignoresTimesThatAreNotInsideTheClip() {
        const auto v = clip("v", "v", 1000, 2000);
        const auto doc = docOf({v}, {track("v", "video")});
        QCOMPARE(planCuts(doc, {request(v, {})}).outcomes.at(0), CutOutcome::NoCuts);
        QCOMPARE(planCuts(doc, {request(v, {1000, 3000, 500, 9000, -1})}).outcomes.at(0), CutOutcome::NoCuts);
        const auto plan = planCuts(doc, {request(v, {2000, 2000, 1000, 3000})});
        QCOMPARE(plan.points, 1);  // a repeated time is one cut, the clip's own edges are not cuts
        QCOMPARE(onTrack(plan.clips, "v").size(), size_t(2));
    }
    void aGroupAndAMediaTrackAreRefused() {
        const auto group = clip("g", "v", 0, 2000, {{"mediaType", "group"}});
        QCOMPARE(planCuts(docOf({group}, {track("v", "video")}), {request(group, {1000})}).outcomes.at(0), CutOutcome::CannotSplit);
        const auto owner = clip("m", "v", 0, 2000);
        auto doc = docOf({owner}, {track("v", "video")});
        doc.clipsWithMediaTracks.insert("m");
        QCOMPARE(planCuts(doc, {request(owner, {1000})}).outcomes.at(0), CutOutcome::CannotSplit);
    }
    void cutsTwoClipsOnTwoTracks() {
        const auto one = clip("one", "v", 0, 2000);
        const auto two = clip("two", "w", 0, 2000);
        const auto plan = planCuts(docOf({one, two}, {track("v", "video"), track("w", "video")}),
            {request(one, {500, 1500}), request(two, {1000})});
        QCOMPARE(plan.points, 3);
        QCOMPARE(plan.clipsCut, 2);
        QCOMPARE(onTrack(plan.clips, "v").size(), size_t(3));
        QCOMPARE(onTrack(plan.clips, "w").size(), size_t(2));
    }

    void markersAreAddedAtEveryCutOnce() {
        const double times[] = {3000, 1000, 2000, 1000};
        const auto after = addCutMarkers({}, times, 30);
        QCOMPARE(after.size(), 3);
        QCOMPARE(after[0].toObject().value("timeMs").toDouble(), 1000.0);
        QCOMPARE(after[2].toObject().value("timeMs").toDouble(), 3000.0);
        QCOMPARE(after[0].toObject().value("label").toString(), QString("Scene cut"));
        QVERIFY(!after[0].toObject().value("color").toString().isEmpty());
        QVERIFY(!after[0].toObject().value("id").toString().isEmpty());
    }
    void markersSkipPlacesThatAlreadyHaveOne() {
        const QJsonArray existing{QJsonObject{{"id", "m"}, {"timeMs", 1010}, {"label", "Mine"}}};
        const double times[] = {1000, 2000};  // 10 ms is inside half a frame at 30 fps (16.7 ms)
        const auto after = addCutMarkers(existing, times, 30);
        QCOMPARE(after.size(), 2);
        QCOMPARE(after[0].toObject().value("label").toString(), QString("Mine"));
        const double wide[] = {1100};  // 90 ms away: a marker of its own
        QCOMPARE(addCutMarkers(existing, wide, 30).size(), 2);
        const double same[] = {1010};
        QCOMPARE(addCutMarkers(existing, same, 30), existing);
    }
    void markersIgnoreBadTimes() {
        const double times[] = {std::numeric_limits<double>::quiet_NaN(), -5, std::numeric_limits<double>::infinity()};
        QVERIFY(addCutMarkers({}, times, 30).isEmpty());
        QVERIFY(addCutMarkers({}, std::span<const double>{}, 30).isEmpty());
    }
};

QTEST_APPLESS_MAIN(TestSceneEditPlan)
#include "tst_sceneeditplan.moc"
