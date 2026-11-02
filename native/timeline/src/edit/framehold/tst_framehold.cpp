// Behaviour ported from FilmCraft (https://github.com/storytold/filmcraft), MIT OR Apache-2.0.
#include "edit/ClipOps.h"
#include "edit/EditActions.h"
#include "edit/keys/AudioCrossfade.h"
#include "FrameHold.h"
#include "FrameHoldController.h"
#include "model/TimelineJson.h"
#include "edit/targeting/TrackTargeting.h"
#include "edit/speed/TimeRemap.h"
#include "preview/SceneEval.h"
#include "audio/Mixer.h"
#include <array>
#include <limits>
#include <QJsonDocument>
#include <QJsonArray>
#include <QtTest>

namespace {
QJsonObject document(bool linked = false, double speed = 1) {
    auto raw = QJsonDocument::fromJson(R"({"fps":30,"width":640,"height":360,"durationMs":3000,
        "tracks":[{"id":"v","type":"video","index":0},{"id":"a","type":"audio","index":1}],
        "clips":[{"id":"c","trackId":"v","mediaType":"video","startMs":1000,"durationMs":1000,
        "inPointMs":200,"outPointMs":2200,"status":"generated","mediaPath":"unused.mp4"}]})").object();
    auto clips = raw.value("clips").toArray();
    auto clip = clips[0].toObject();
    clip.insert("speedMultiplier", speed);
    if (linked) { clip.insert("linkId", "L"); }
    clips[0] = clip;
    if (linked) {
        clip.insert("id", "audio"); clip.insert("trackId", "a"); clip.insert("mediaType", "audio");
        clip.remove("speedMultiplier");
        clips.append(clip);
    }
    raw.insert("clips", clips);
    return raw;
}
QJsonObject byId(const QJsonObject& raw, const QString& id) {
    for (const auto& value : raw.value("clips").toArray()) {
        if (value.toObject().value("id") == id) { return value.toObject(); }
    }
    return {};
}
}
class TestFrameHold : public QObject {
    Q_OBJECT
private slots:
    void addFrameHold_data() {
        QTest::addColumn<double>("at");
        QTest::addColumn<double>("rate");
        QTest::addColumn<bool>("linked");
        QTest::addColumn<double>("expectedSource");
        QTest::newRow("mid") << 1500.0 << 1.0 << false << 700.0;
        QTest::newRow("speed and in point") << 1500.0 << 2.0 << false << 1200.0;
        QTest::newRow("start") << 1000.0 << 1.0 << false << 200.0;
        QTest::newRow("linked audio") << 1500.0 << 1.0 << true << 700.0;
    }
    void addFrameHold() {
        QFETCH(double, at); QFETCH(double, rate); QFETCH(bool, linked); QFETCH(double, expectedSource);
        const auto raw = document(linked, rate);
        const auto result = nt::framehold::addFrameHold(raw, {"c"}, at);
        QVERIFY2(result.ok(), qPrintable(result.error));
        QCOMPARE(result.clipIds.size(), 1);
        const auto held = byId(result.doc, result.clipIds[0]);
        QVERIFY(nt::framehold::isHold(held));
        QCOMPARE(nt::framehold::sourceMsAt(held, at), expectedSource);
        QCOMPARE(nt::framehold::sourceMsAt(held, 1999), expectedSource);
        QCOMPARE(held.value("startMs").toDouble(), at);
        QCOMPARE(held.value("durationMs").toDouble(), 2000 - at);
        const auto clips = result.doc.value("clips").toArray();
        QCOMPARE(clips.size(), (at == 1000 ? 1 : 2) * (linked ? 2 : 1));
        if (at == 1000) { QCOMPARE(result.clipIds[0], QString("c")); }
        else {
            auto expectedLeft = byId(raw, "c");
            auto left = clips[0].toObject();
            expectedLeft.insert("id", left.value("id"));
            expectedLeft.insert("durationMs", 500);
            expectedLeft.insert("outPointMs", expectedSource);
            if (linked) { expectedLeft.insert("linkId", left.value("linkId")); }
            QCOMPARE(left, expectedLeft);
        }
        if (linked) {
            const auto audio = clips[3].toObject();
            QVERIFY(!audio.contains("timeRemap"));
            QCOMPARE(audio.value("inPointMs").toDouble(), 700.0);
            QCOMPARE(audio.value("linkId"), held.value("linkId"));
        }
    }
    void insertAndUndo() {
        auto raw = document(true);
        auto tracks = raw.value("tracks").toArray();
        tracks.append(QJsonObject{{"id", "sync"}, {"type", "video"}, {"index", 2}});
        tracks.append(QJsonObject{{"id", "off"}, {"type", "video"}, {"index", 3}});
        raw.insert("tracks", tracks);
        auto clips = raw.value("clips").toArray();
        auto source = clips[0].toObject();
        source.insert("caption", QJsonObject{{"words", QJsonArray{}}});
        source.insert("animations", QJsonArray{}); source.insert("markers", QJsonArray{});
        source.insert("fadeInMs", 20); source.insert("fadeOutMs", 20);
        source.insert("transitionIn", QJsonObject{{"type", "crossfade"}, {"durationMs", 20}});
        source.insert("effects", QJsonArray{QJsonObject{{"id", "grade"}, {"type", "color"}}});
        clips[0] = source;
        for (const auto& track : {"sync", "off"}) {
            clips.append(QJsonObject{{"id", track}, {"trackId", track}, {"mediaType", "video"},
                {"startMs", 1500}, {"durationMs", 500}, {"status", "generated"}});
        }
        raw.insert("clips", clips);
        auto& targeting = nt::targeting::TrackTargeting::current();
        targeting.setTrackSyncLocked("off", false);
        TimelineModel model;
        auto parsed = nt::parseTimeline(raw); QVERIFY(parsed.timeline); model.setTimeline(*parsed.timeline);
        const auto before = model.documentJson();
        QVERIFY(model.applyEdit("frameHold.insertSegment", {{"clipId", "c"}, {"atMs", 1500}, {"durationMs", 500}}));
        QCOMPARE(model.undoStack()->count(), 1);
        const auto after = model.documentJson();
        const auto edited = model.timeline().raw;
        QCOMPARE(byId(edited, "sync").value("startMs").toDouble(), 2000.0);
        QCOMPARE(byId(edited, "off").value("startMs").toDouble(), 1500.0);
        int holds = 0;
        QString videoLink, audioLink;
        for (const auto& v : edited.value("clips").toArray()) {
            const auto c = v.toObject();
            if (nt::framehold::isHold(c)) {
                ++holds;
                QCOMPARE(c.value("startMs").toDouble(), 1500.0);
                QCOMPARE(c.value("durationMs").toDouble(), 500.0);
                QCOMPARE(c.value("inPointMs").toDouble(), 700.0);
                QCOMPARE(c.value("outPointMs").toDouble(), 1200.0);
                QCOMPARE(c.value("effects"), source.value("effects"));
                for (const auto& key : {"linkId", "caption", "animations", "markers", "transitionIn", "fadeInMs", "fadeOutMs"}) {
                    QVERIFY2(!c.contains(key), key);
                }
            }
            if (c.value("startMs").toDouble() == 2000) {
                if (c.value("trackId") == "v") videoLink = c.value("linkId").toString();
                if (c.value("mediaType") == "audio") {
                    audioLink = c.value("linkId").toString();
                    QVERIFY(!c.contains("timeRemap")); QCOMPARE(c.value("inPointMs").toDouble(), 700.0);
                }
            }
            if (c.value("mediaType") == "audio") {
                QVERIFY(c.value("startMs").toDouble() >= 2000 || nt::edit::clipEndMs(c) <= 1500);
            }
        }
        QCOMPARE(holds, 1); QVERIFY(!videoLink.isEmpty()); QCOMPARE(videoLink, audioLink);
        model.undoStack()->undo(); QCOMPARE(model.documentJson(), before);
        model.undoStack()->redo(); QCOMPARE(model.documentJson(), after);
        const auto shortHold = nt::framehold::insertFrameHoldSegment(document(), "c", 1000, 1);
        QVERIFY(shortHold.ok());
        QCOMPARE(byId(shortHold.doc, shortHold.clipIds[0]).value("durationMs").toDouble(), 1000.0 / 30);
        auto blocked = raw;
        auto linkedClips = blocked.value("clips").toArray();
        for (qsizetype i = 2; i < linkedClips.size(); ++i) {
            auto c = linkedClips[i].toObject(); c.insert("linkId", "blocked"); linkedClips[i] = c;
        }
        blocked.insert("clips", linkedClips);
        auto lockedRipple = nt::parseTimeline(blocked); QVERIFY(lockedRipple.timeline); model.setTimeline(*lockedRipple.timeline);
        const auto unshifted = model.documentJson();
        QVERIFY(!model.applyEdit("frameHold.insertSegment", {{"clipId", "c"}, {"atMs", 1500}, {"durationMs", 500}}));
        QCOMPARE(model.undoStack()->count(), 0); QCOMPARE(model.documentJson(), unshifted);
        targeting.setTrackSyncLocked("off", true);
    }
    void insertKeepsValidSourceBounds() {
        // A hold set outside the clip's own source window, by Source time.
        auto raw = document(false, 1);
        auto c = byId(raw, "c");
        c.insert("startMs", 0); c.insert("durationMs", 1000); c.insert("inPointMs", 0); c.insert("outPointMs", 1000);
        c.insert("timeRemap", QJsonObject{{"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"sourceMs", 4000}},
            QJsonObject{{"t", 1}, {"sourceMs", 4000}}}}});
        raw.insert("clips", QJsonArray{c});
        const auto result = nt::framehold::insertFrameHoldSegment(raw, "c", 500, 500);
        QVERIFY2(result.ok(), qPrintable(result.error));
        const auto segment = byId(result.doc, result.clipIds.first());
        QVERIFY2(segment.value("inPointMs").toDouble() < segment.value("outPointMs").toDouble(),
            qPrintable(QString("%1 %2").arg(segment.value("inPointMs").toDouble()).arg(segment.value("outPointMs").toDouble())));
        QCOMPARE(nt::framehold::sourceMsAt(segment, 700), 4000.0);
    }
    void insertAtTheVideoStartSplitsLinkedAudioThatSpansIt() {
        auto raw = document(true, 1);
        auto v = byId(raw, "c");
        v.insert("startMs", 1000); v.insert("durationMs", 1000); v.insert("inPointMs", 0); v.insert("outPointMs", 1000); v.insert("linkId", "L");
        auto a = byId(raw, "audio");
        a.insert("startMs", 0); a.insert("durationMs", 3000); a.insert("inPointMs", 0); a.insert("outPointMs", 3000); a.insert("linkId", "L");
        raw.insert("clips", QJsonArray{v, a});
        const auto result = nt::framehold::insertFrameHoldSegment(raw, "c", 1000, 500);
        QVERIFY2(result.ok(), qPrintable(result.error));
        QCOMPARE(byId(result.doc, "c").value("startMs").toDouble(), 1500.0);
        const auto segment = byId(result.doc, result.clipIds.first());
        QJsonObject before, after;
        for (const auto& value : result.doc.value("clips").toArray()) {
            const auto clip = value.toObject();
            if (clip.value("mediaType") != "audio") { continue; }
            if (clip.value("startMs").toDouble() < 1000) { before = clip; } else { after = clip; }
            // Sound never runs under the hold.
            const double start = clip.value("startMs").toDouble();
            QVERIFY(start >= 1500 || start + clip.value("durationMs").toDouble() <= 1000);
        }
        QCOMPARE(before.value("startMs").toDouble(), 0.0);
        QCOMPARE(before.value("durationMs").toDouble(), 1000.0);
        QCOMPARE(before.value("outPointMs").toDouble(), 1000.0);
        QCOMPARE(after.value("startMs").toDouble(), 1500.0);
        QCOMPARE(after.value("inPointMs").toDouble(), 1000.0);
        QCOMPARE(after.value("durationMs").toDouble(), 2000.0);
        QCOMPARE(after.value("linkId").toString(), byId(result.doc, "c").value("linkId").toString());
        QVERIFY(before.value("linkId").toString() != after.value("linkId").toString());
        QVERIFY(!segment.contains("linkId"));
    }
    void splittingAHoldKeepsItsSourceCurve() {
        auto raw = document(false, 1);
        auto c = byId(raw, "c");
        c.insert("startMs", 0); c.insert("durationMs", 1000); c.insert("inPointMs", 0); c.insert("outPointMs", 1000);
        c.insert("timeRemap", QJsonObject{{"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"sourceMs", 250}},
            QJsonObject{{"t", 1}, {"sourceMs", 250}}}}});
        c.insert("animations", QJsonArray{QJsonObject{{"id", "m"}, {"preset", "custom"}, {"role", "emphasis"}, {"durationMs", 1000},
            {"custom", QJsonObject{{"timeBase", "source"}, {"curves", QJsonArray{QJsonObject{{"property", "offsetY"},
                {"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"sourceMs", 0}, {"value", 0}},
                                         QJsonObject{{"t", 1}, {"sourceMs", 1000}, {"value", 100}}}}}}}}}}});
        const auto [left, right] = nt::edit::splitClip(c, 500);
        for (const auto& half : {left, right}) {
            const auto frames = half.value("animations").toArray().first().toObject().value("custom").toObject()
                .value("curves").toArray().first().toObject().value("keyframes").toArray();
            QVERIFY2(frames.size() == 2, qPrintable(QJsonDocument(frames).toJson()));
            QCOMPARE(frames.first().toObject().value("sourceMs").toDouble(), 0.0);
            QCOMPARE(frames.last().toObject().value("sourceMs").toDouble(), 1000.0);
        }
    }
    void aHoldRunningPastItsMediaCannotChooseAFramePastIt() {
        auto raw = document(false, 1);
        auto c = byId(raw, "c");
        c.insert("startMs", 1000); c.insert("durationMs", 3000); c.insert("inPointMs", 200); c.insert("outPointMs", 700);
        c.insert("timeRemap", QJsonObject{{"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"sourceMs", 200}},
            QJsonObject{{"t", 1}, {"sourceMs", 200}}}}});
        raw.insert("clips", QJsonArray{c});
        for (const auto* mode : {"playhead", "sequenceTime", "out"}) {
            const auto result = nt::framehold::setFrameHoldOptions(raw, {{"c"}, true, mode, 3500, 3500});
            QVERIFY2(result.ok(), qPrintable(result.error));
            QVERIFY2(nt::framehold::sourceMsAt(byId(result.doc, "c"), 1000) <= 700, mode);
        }
    }
    void disablingARunPastHoldEndsWithItsSourceWindow() {
        auto raw = document(false, 1);
        auto c = byId(raw, "c");
        c.insert("startMs", 0); c.insert("durationMs", 5000); c.insert("inPointMs", 0); c.insert("outPointMs", 1000);
        c.insert("timeRemap", QJsonObject{{"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"sourceMs", 0}},
            QJsonObject{{"t", 1}, {"sourceMs", 0}}}}});
        raw.insert("clips", QJsonArray{c});
        const auto result = nt::framehold::setFrameHoldOptions(raw, {{"c"}, false});
        QVERIFY2(result.ok(), qPrintable(result.error));
        const auto next = byId(result.doc, "c");
        QVERIFY(!next.contains("timeRemap"));
        QCOMPARE(next.value("durationMs").toDouble(), 1000.0);
        QCOMPARE(next.value("outPointMs").toDouble(), 1000.0);
        // At twice the speed the same window lasts half as long.
        c.insert("speedMultiplier", 2);
        raw.insert("clips", QJsonArray{c});
        QCOMPARE(byId(nt::framehold::setFrameHoldOptions(raw, {{"c"}, false}).doc, "c").value("durationMs").toDouble(), 500.0);
    }
    void insertAtTheStartRefusesToOrphanMotionTracking() {
        auto raw = document(true, 1);
        auto v = byId(raw, "c");
        v.insert("startMs", 1000); v.insert("linkId", "L");
        auto a = byId(raw, "audio");
        a.insert("startMs", 0); a.insert("durationMs", 3000); a.insert("linkId", "L");
        raw.insert("clips", QJsonArray{v, a});
        raw.insert("mediaTracks", QJsonArray{QJsonObject{{"id", "m"}, {"clipId", "audio"}, {"sourceStartMs", 0},
            {"sourceEndMs", 1000}, {"samples", QJsonArray{}}}});
        const auto result = nt::framehold::insertFrameHoldSegment(raw, "c", 1000, 500);
        QVERIFY2(!result.ok(), "the split would leave mediaTracks[].clipId dangling");
        QCOMPARE(result.doc, raw);
    }
    void aSteppedClipHoldsTheFrameOnScreen() {
        auto raw = document(false, 1);
        auto c = byId(raw, "c");
        c.insert("startMs", 0); c.insert("inPointMs", 0); c.insert("durationMs", 2000); c.insert("outPointMs", 2000);
        c.insert("steppedTime", QJsonObject{{"fps", 2}});
        raw.insert("clips", QJsonArray{c});
        const auto held = nt::framehold::addFrameHold(raw, {"c"}, 400);
        QVERIFY(held.ok());
        QCOMPARE(byId(held.doc, held.clipIds.first()).value("timeRemap").toObject().value("keyframes").toArray()
            .first().toObject().value("sourceMs").toDouble(), 0.0);
    }
    void aHoldKeepsTheSourceWindowOfAClipWithoutOutPoints() {
        auto raw = document(false, 1);
        auto c = byId(raw, "c");
        c.remove("outPointMs"); c.remove("inPointMs");
        c.insert("startMs", 0); c.insert("durationMs", 1000);
        raw.insert("clips", QJsonArray{c});
        const auto held = nt::framehold::setFrameHoldOptions(raw, {{"c"}, true, "in"});
        QVERIFY2(held.ok(), qPrintable(held.error));
        auto extended = byId(held.doc, "c");
        QCOMPARE(extended.value("outPointMs").toDouble(), 1000.0);
        extended.insert("durationMs", 6000);
        auto next = raw;
        next.insert("clips", QJsonArray{extended});
        const auto disabled = nt::framehold::setFrameHoldOptions(next, {{"c"}, false});
        QVERIFY2(disabled.ok(), qPrintable(disabled.error));
        QCOMPARE(byId(disabled.doc, "c").value("durationMs").toDouble(), 1000.0);
        // Add at the clip's first frame does the same.
        const auto added = nt::framehold::addFrameHold(raw, {"c"}, 0);
        QVERIFY2(added.ok(), qPrintable(added.error));
        QCOMPARE(byId(added.doc, "c").value("outPointMs").toDouble(), 1000.0);
    }
    void anUnchangedOptionsApplyIsNotAnEdit() {
        auto raw = document(false, 1);
        auto c = byId(raw, "c");
        c.insert("timeRemap", QJsonObject{{"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"sourceMs", 50}},
            QJsonObject{{"t", 1}, {"sourceMs", 50}}}}});
        raw.insert("clips", QJsonArray{c});
        const auto result = nt::framehold::setFrameHoldOptions(raw, {{"c"}, true, "sourceTime", 0, 50});
        QVERIFY(!result.ok());
        QVERIFY(result.unchanged);
        QCOMPARE(result.doc, raw);
    }
    void aSteppedHoldKeepsTheCurveAtTheHeldFrame() {
        auto raw = document(false, 1);
        auto c = byId(raw, "c");
        c.insert("startMs", 0); c.insert("inPointMs", 0); c.insert("durationMs", 2000); c.insert("outPointMs", 2000);
        c.insert("steppedTime", QJsonObject{{"fps", 2}});
        c.insert("animations", QJsonArray{QJsonObject{{"id", "m"}, {"preset", "custom"}, {"role", "emphasis"}, {"durationMs", 2000},
            {"custom", QJsonObject{{"timeBase", "source"}, {"curves", QJsonArray{QJsonObject{{"property", "offsetY"},
                {"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"sourceMs", 0}, {"value", 0}},
                                         QJsonObject{{"t", 1}, {"sourceMs", 2000}, {"value", 200}}}}}}}}}}});
        raw.insert("clips", QJsonArray{c});
        const auto held = nt::framehold::addFrameHold(raw, {"c"}, 400);
        QVERIFY2(held.ok(), qPrintable(held.error));
        const auto piece = byId(held.doc, held.clipIds.first());
        const auto frames = piece.value("animations").toArray().first().toObject().value("custom").toObject()
            .value("curves").toArray().first().toObject().value("keyframes").toArray();
        QVERIFY(!frames.isEmpty());
        // The curve still starts at the held frame, whose value the picture showed.
        QCOMPARE(frames.first().toObject().value("sourceMs").toDouble(), 0.0);
        QCOMPARE(frames.first().toObject().value("value").toDouble(), 0.0);
        QVERIFY(piece.value("animations").toArray().first().toObject().value("id").toString() != "m");
    }
    void options_data() {
        QTest::addColumn<QString>("mode"); QTest::addColumn<double>("expected");
        QTest::newRow("in") << QString("in") << 200.0;
        QTest::newRow("out") << QString("out") << (2200.0 - 2000.0 / 30);
        QTest::newRow("playhead") << QString("playhead") << 1200.0;
        QTest::newRow("sequenceTime") << QString("sequenceTime") << 1400.0;
        QTest::newRow("sourceTime") << QString("sourceTime") << 1600.0;
        QTest::newRow("disable") << QString("disable") << 0.0;
    }
    void options() {
        QFETCH(QString, mode); QFETCH(double, expected);
        auto raw = document(false, 2);
        auto c = byId(raw, "c");
        c.insert("timeRemap", QJsonObject{{"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"sourceMs", 999}},
            QJsonObject{{"t", 1}, {"sourceMs", 999}}}}});
        raw.insert("clips", QJsonArray{c});
        const nt::framehold::OptionsRequest request{{"c"}, mode != "disable", mode, 1500, 1600};
        const auto result = nt::framehold::setFrameHoldOptions(raw, request);
        QVERIFY2(result.ok(), qPrintable(result.error));
        QCOMPARE(result.clipIds, QStringList{"c"});
        const auto repeated = nt::framehold::setFrameHoldOptions(result.doc, request);
        QVERIFY(!repeated.ok()); QCOMPARE(repeated.doc, result.doc);
        const auto next = byId(result.doc, "c");
        QCOMPARE(next.value("inPointMs"), c.value("inPointMs"));
        QCOMPARE(next.value("outPointMs"), c.value("outPointMs"));
        QCOMPARE(next.value("durationMs"), c.value("durationMs"));
        if (mode == "disable") { QVERIFY(!next.contains("timeRemap")); }
        else { QVERIFY(std::abs(nt::framehold::sourceMsAt(next, 1700) - expected) < 1e-6); }
        auto curve = c;
        curve.insert("timeRemap", QJsonObject{{"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"sourceMs", 100}},
            QJsonObject{{"t", 1}, {"sourceMs", 1100}}}}});
        raw.insert("clips", QJsonArray{curve});
        const auto disabled = nt::framehold::setFrameHoldOptions(raw, {{"c"}, false});
        QVERIFY(!disabled.ok()); QCOMPARE(disabled.doc, raw);
        const auto curved = nt::framehold::setFrameHoldOptions(raw, {{"c"}, true, "playhead", 1500});
        QVERIFY(curved.ok()); QCOMPARE(nt::framehold::sourceMsAt(byId(curved.doc, "c"), 1600), 600.0);
    }
    void controllerAndRefusals() {
        TimelineModel model;
        auto raw = document(true);
        auto parsed = nt::parseTimeline(raw); QVERIFY(parsed.timeline); model.setTimeline(*parsed.timeline);
        FrameHoldController controller; controller.setTimeline(&model);
        QCOMPARE(controller.targetsAt({}, 1500), QStringList{"c"});
        QCOMPARE(controller.targetsAt({"audio", "c"}, 1500), QStringList{"c"});
        QCOMPARE(controller.targetsAt({"c"}, 2000), QStringList{});
        nt::targeting::TrackTargeting::current().setTrackTargeted("v", false);
        QCOMPARE(controller.targetsAt({}, 1500), QStringList{});
        QCOMPARE(controller.targetsAt({"c"}, 1500), QStringList{"c"});
        nt::targeting::TrackTargeting::current().setTrackTargeted("v", true);
        auto stacked = raw;
        auto tracks = stacked.value("tracks").toArray();
        tracks.append(QJsonObject{{"id", "top"}, {"type", "video"}, {"index", -1}}); stacked.insert("tracks", tracks);
        auto stackedClips = stacked.value("clips").toArray();
        auto upper = byId(raw, "c"); upper.insert("id", "upper"); upper.insert("trackId", "top"); upper.remove("linkId");
        stackedClips.append(upper); stacked.insert("clips", stackedClips);
        auto parsedStack = nt::parseTimeline(stacked); QVERIFY(parsedStack.timeline); model.setTimeline(*parsedStack.timeline);
        QCOMPARE(controller.targetsAt({}, 1500), QStringList{"upper"});
        model.setTimeline(*parsed.timeline);
        const auto result = controller.add({"c"}, 1500);
        QVERIFY(result.value("ok").toBool());
        QCOMPARE(model.undoStack()->count(), 1);
        const auto ids = result.value("clipIds").toStringList();
        QCOMPARE(ids.size(), 1); QVERIFY(nt::framehold::isHold(byId(model.timeline().raw, ids[0])));
        QVERIFY(controller.setOptions({{"clipIds", ids}, {"enabled", false}}).value("ok").toBool());
        QCOMPARE(model.undoStack()->count(), 2);
        auto curve = byId(raw, "c");
        curve.insert("timeRemap", QJsonObject{{"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"sourceMs", 100}},
            QJsonObject{{"t", 1}, {"sourceMs", 1100}}}}});
        for (const auto& reason : {"locked track", "locked clip", "image", "audio", "text", "group", "outside", "curve", "zero", "nan"}) {
            auto refused = raw;
            auto c = reason == QString("curve") ? curve : byId(raw, "c");
            if (reason == QString("locked track")) {
                auto tracks = refused.value("tracks").toArray(); auto t = tracks[0].toObject();
                t.insert("locked", true); tracks[0] = t; refused.insert("tracks", tracks);
            }
            if (reason == QString("locked clip")) c.insert("locked", true);
            if (QStringList{"image", "audio", "text", "group"}.contains(reason)) c.insert("mediaType", reason);
            refused.insert("clips", QJsonArray{c});
            auto p = nt::parseTimeline(refused); QVERIFY(p.timeline); model.setTimeline(*p.timeline);
            const auto before = model.documentJson();
            const double at = reason == QString("outside") ? 2000 : 1500;
            const double duration = reason == QString("zero") ? 0 : reason == QString("nan")
                ? std::numeric_limits<double>::quiet_NaN() : 500;
            QVERIFY(!controller.insertSegment("c", at, duration).value("ok").toBool());
            QVERIFY(!nt::framehold::insertFrameHoldSegment(refused, "c", at, duration).ok());
            QVERIFY(!model.applyEdit("frameHold.insertSegment", {{"clipId", "c"}, {"atMs", at}, {"durationMs", duration}}));
            if (reason == QString("curve")) {
                QVERIFY(!model.applyEdit("frameHold.options", {{"clipIds", QJsonArray{"c"}}, {"enabled", false}}));
            }
            if (duration == 500) {
                const auto add = nt::framehold::addFrameHold(refused, {"c"}, at);
                QVERIFY(!add.ok());
                QVERIFY(!model.applyEdit("frameHold.add", {{"clipIds", QJsonArray{"c"}}, {"atMs", at}}));
                if (reason == QString("curve")) QCOMPARE(add.error, QString("Clear the time remap on this clip first."));
            }
            QCOMPARE(model.undoStack()->count(), 0); QCOMPARE(model.documentJson(), before);
        }
        auto large = document();
        QJsonArray many; QStringList manyIds;
        for (int i = 0; i < 10000; ++i) {
            auto c = byId(raw, "c"); const auto id = QString::number(i);
            c.insert("id", id); c.remove("linkId"); many.append(c); manyIds.append(id);
        }
        large.insert("clips", many);
        const auto held = nt::framehold::addFrameHold(large, manyIds, 1000);
        QVERIFY(held.ok()); QCOMPARE(held.clipIds.size(), 10000);
        QCOMPARE(held.doc.value("clips").toArray().size(), 10000);
        auto parsedLarge = nt::parseTimeline(large); QVERIFY(parsedLarge.timeline); model.setTimeline(*parsedLarge.timeline);
        QCOMPARE(controller.targetsAt(manyIds, 1500).size(), 10000);
    }
    void holdPlanAndEmbeddedAudio() {
        const auto result = nt::framehold::addFrameHold(document(), {"c"}, 1000);
        QVERIFY(result.ok());
        auto clip = byId(result.doc, result.clipIds[0]);
        QVERIFY(nt::framehold::isHold(clip));
        const auto again = nt::framehold::addFrameHold(result.doc, result.clipIds, 1500);
        QVERIFY(again.ok()); QCOMPARE(nt::framehold::sourceMsAt(byId(again.doc, again.clipIds[0]), 1800), 200.0);
        const auto inserted = nt::framehold::insertFrameHoldSegment(result.doc, result.clipIds[0], 1500, 100);
        QVERIFY(inserted.ok()); QCOMPARE(nt::framehold::sourceMsAt(byId(inserted.doc, inserted.clipIds[0]), 1550), 200.0);
        const auto [left, right] = nt::edit::splitClip(clip, 1500);
        clip = nt::edit::trimClip(right, "start", 1500, 2200);
        clip = nt::edit::trimClip(clip, "end", 10000, 2200);
        for (const auto& piece : {left, right, clip}) {
            QVERIFY(nt::framehold::isHold(piece));
            for (double t : {nt::edit::clipStartMs(piece), nt::edit::clipEndMs(piece) - 1}) {
                QCOMPARE(nt::framehold::sourceMsAt(piece, t), 200.0);
            }
        }
        auto raw = result.doc; raw.insert("clips", QJsonArray{clip});
        const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson()); QVERIFY(parsed.timeline);
        const auto& typed = parsed.timeline->clips[0];
        for (double t : {0.0, 2000.0, 5000.0, 11000.0}) {
            QCOMPARE(nt::speed::clipRemapSourceMs(typed, t).value_or(-1), 200.0);
            const auto scene = nt::evaluateScene(*parsed.timeline, t);
            QCOMPARE(scene.layers.size(), size_t{1}); QCOMPARE(scene.layers[0].sourceTimeMs, 200.0);
        }
        const auto segments = nt::speed::timeRemapAudioSegments(typed);
        QCOMPARE(segments.size(), size_t{1}); QCOMPARE(segments[0].rate, 0.0); QVERIFY(segments[0].reverse);
        const auto plan = nt::audio::buildMixPlan(*parsed.timeline);
        QCOMPARE(plan.voices.size(), size_t{1}); QVERIFY(plan.voices[0].videoOwnAudio); QVERIFY(plan.voices[0].silent);
        std::array<float, 2000> input; input.fill(0.5f);
        nt::audio::VoicePcm pcm; pcm.linear = input.data(); pcm.linearCount = 1000;
        std::array<float, 200> output; output.fill(1);
        nt::audio::MixStats stats;
        nt::audio::mixBlock(plan, &pcm, 1000, 0, 1, 100, output.data(), stats);
        for (float value : output) QCOMPARE(value, 0.0f);
    }
    void splitAndTrimHold() {
        QJsonObject hold{{"id", "c"}, {"mediaType", "video"}, {"startMs", 1000}, {"durationMs", 400},
            {"inPointMs", 200}, {"outPointMs", 600}, {"timeRemap", QJsonObject{{"keyframes", QJsonArray{
                QJsonObject{{"t", 0}, {"sourceMs", 333}}, QJsonObject{{"t", 1}, {"sourceMs", 333}}}}}}};
        QVERIFY_THROWS_NO_EXCEPTION(nt::edit::splitClip(hold, 1200));
        const auto [left, right] = nt::edit::splitClip(hold, 1200);
        for (const auto& piece : {left, right, nt::edit::trimClip(hold, "start", 1000, 600),
                                 nt::edit::trimClip(hold, "end", 5000, 600)}) {
            QCOMPARE(piece.value("timeRemap"), hold.value("timeRemap"));
            QCOMPARE(piece.value("inPointMs").toDouble(), 200.0);
            QCOMPARE(piece.value("outPointMs").toDouble(), 600.0);
        }
        QCOMPARE(nt::edit::clampEndTrimDeltaToSource(hold, 5000, 600), 5000.0);
        hold.insert("trackId", "a"); hold.insert("mediaType", "audio");
        auto next = hold; next.insert("id", "next"); next.insert("startMs", 1400);
        nt::edit::AudioCrossfadeOptions options;
        options.sourceDurationMs = [](const QJsonObject&) { return std::optional<double>{600}; };
        const auto crossfade = nt::edit::applyAudioCrossfades({hold, next}, {"c", "next"}, 100, options);
        QCOMPARE(crossfade[0].value("durationMs").toDouble(), 500.0);
    }
};
QTEST_GUILESS_MAIN(TestFrameHold)
#include "tst_framehold.moc"
