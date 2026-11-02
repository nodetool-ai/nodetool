#include "SourceEdit.h"
#include <QtTest>
#include <QJsonArray>

using namespace nt::sourceedit;
class TestSourcePlacement : public QObject {
    Q_OBJECT
    QJsonObject raw{{"tracks", QJsonArray{
        QJsonObject{{"id", "v"}, {"name", "Video 1"}, {"type", "video"}, {"index", 0}},
        QJsonObject{{"id", "v2"}, {"type", "video"}, {"index", 1}},
        QJsonObject{{"id", "a"}, {"name", "Audio 1"}, {"type", "audio"}, {"index", 2}},
        QJsonObject{{"id", "a2"}, {"type", "audio"}, {"index", 3}}}}, {"clips", QJsonArray{}}};
    QJsonObject asset{{"id", "take"}, {"name", "Take"}, {"content_type", "video/mp4"}, {"duration", 10}};
private slots:
    void destinations() {
        auto d = sourceDropDestinations(raw, "v2", true, true);
        QCOMPARE(d.videoTrackId, QString("v2")); QCOMPARE(d.audioTrackId, QString("a2")); QVERIFY(d.error.isEmpty());
        d = sourceDropDestinations(raw, "a", true, true);
        QCOMPARE(d.videoTrackId, QString("v")); QCOMPARE(d.audioTrackId, QString("a"));
        QVERIFY(!sourceDropDestinations(raw, "a", true, false).error.isEmpty());
        QVERIFY(!sourceDropDestinations(raw, "missing", true, true).error.isEmpty());
        d = sourceDropDestinations(raw, {}, true, true); QVERIFY(d.newVideoTrack); QVERIFY(d.newAudioTrack);
        auto locked = raw; auto tracks = locked.value("tracks").toArray();
        auto audio = tracks[2].toObject(); audio.insert("locked", true); tracks[2] = audio; locked.insert("tracks", tracks);
        QCOMPARE(sourceDropDestinations(locked, "v", true, true).error,
                 QString("Audio 1 is locked. Unlock it to place this clip here."));
        tracks.removeAt(3); locked.insert("tracks", tracks);
        d = sourceDropDestinations(locked, "v2", true, true); QVERIFY(d.newAudioTrack);
    }
    void insertRipplesBothAndSyncLockedTracks() {
        auto doc = raw;
        QJsonArray clips;
        for (const auto& id : {"v", "a", "v2", "a2"}) {
            clips.append(QJsonObject{{"id", QString(id) + "old"}, {"trackId", id}, {"mediaType", QString(id).startsWith('a') ? "audio" : "video"},
                {"startMs", 5000}, {"durationMs", 1000}});
        }
        doc.insert("clips", clips);
        Placement p; p.asset = asset; p.inMs = 1000; p.outMs = 3000;
        p.videoTrackId = "v"; p.audioTrackId = "a"; p.startMs = 4000; p.mode = "insert";
        nt::targeting::TargetingState state; state.syncLockOffTrackIds.insert("a2");
        const auto result = placeSource(doc, state, p); QVERIFY(result);
        const auto placed = result->doc.value("clips").toArray(); QCOMPARE(placed.size(), 6);
        QString link;
        for (const auto& value : placed) {
            const auto c = value.toObject();
            if (c.value("id").toString().endsWith("old")) {
                QCOMPARE(c.value("startMs").toDouble(), c.value("trackId") == "a2" ? 5000.0 : 7000.0);
            } else {
                QVERIFY(!c.value("linkId").toString().isEmpty());
                if (link.isEmpty()) { link = c.value("linkId").toString(); }
                QCOMPARE(c.value("linkId").toString(), link);
                QCOMPARE(c.value("durationMs").toDouble(), 2000.0);
                if (c.value("mediaType") == "audio") { QVERIFY(!c.contains("currentAssetId")); QCOMPARE(c.value("status").toString(), QString("generating")); }
            }
        }
    }
    void exactStartIsKept() {
        Placement p; p.asset = asset; p.inMs = 1000; p.outMs = 3000; p.videoTrackId = "v"; p.startMs = 200.0 / 3; p.mode = "overwrite";
        const auto result = placeSource(raw, {}, p); QVERIFY(result);
        QCOMPARE(result->doc.value("clips").toArray().first().toObject().value("startMs").toDouble(), 200.0 / 3);
    }
    void aRefusedEditPlacesNothing() {
        // The clip at the insert point is linked to a clip on a locked track, so the ripple refuses.
        auto doc = raw; auto tracks = doc.value("tracks").toArray();
        auto locked = tracks[3].toObject(); locked.insert("locked", true); tracks[3] = locked; doc.insert("tracks", tracks);
        doc.insert("clips", QJsonArray{
            QJsonObject{{"id", "picture"}, {"trackId", "v"}, {"mediaType", "video"}, {"startMs", 5000}, {"durationMs", 1000}, {"linkId", "pair"}},
            QJsonObject{{"id", "sound"}, {"trackId", "a2"}, {"mediaType", "audio"}, {"startMs", 5000}, {"durationMs", 1000}, {"linkId", "pair"}}});
        Placement p; p.asset = asset; p.inMs = 1000; p.outMs = 3000; p.videoTrackId = "v"; p.audioTrackId = "a"; p.startMs = 5000; p.mode = "insert";
        QString error;
        QVERIFY(!placeSource(doc, {}, p, &error));
        QVERIFY(!error.isEmpty());
        // A clip linked to a locked clip counts as locked and stays. An insert into the gap before it fits, and one that would run into it refuses.
        p.startMs = 1000; const auto fitted = placeSource(doc, {}, p); QVERIFY(fitted);
        for (const auto& value : fitted->doc.value("clips").toArray()) {
            if (value.toObject().value("id") == "picture") { QCOMPARE(value.toObject().value("startMs").toDouble(), 5000.0); }
        }
        p.startMs = 4000; QVERIFY(!placeSource(doc, {}, p, &error));
        // A pair across a track with sync lock off is not locked, but it cannot move together, so the ripple refuses.
        auto unlocked = doc; tracks = unlocked.value("tracks").toArray();
        locked = tracks[3].toObject(); locked.insert("locked", false); tracks[3] = locked; unlocked.insert("tracks", tracks);
        nt::targeting::TargetingState syncOff; syncOff.syncLockOffTrackIds.insert("a2");
        p.startMs = 1000;
        QVERIFY(!placeSource(unlocked, syncOff, p, &error)); QVERIFY(!error.isEmpty());
        p.audioTrackId.clear(); QVERIFY(!placeSource(unlocked, syncOff, p, &error));
        // Nothing after the insert point: nothing has to move.
        p.startMs = 7000; QVERIFY(placeSource(unlocked, syncOff, p));
        p.audioTrackId = "a"; p.startMs = 5000;
        // A locked clip under an overwrite refuses the same way.
        auto lockedClip = raw; lockedClip.insert("clips", QJsonArray{
            QJsonObject{{"id", "kept"}, {"trackId", "v"}, {"mediaType", "video"}, {"startMs", 5000}, {"durationMs", 1000}, {"locked", true}}});
        p.audioTrackId.clear(); p.mode = "overwrite";
        QVERIFY(!placeSource(lockedClip, {}, p, &error));
        // Insert with nothing in the way succeeds, and an overlap stays what was asked for.
        p.startMs = 7000; QVERIFY(placeSource(lockedClip, {}, p));
        p.startMs = 5000; p.mode = "overlap"; QVERIFY(placeSource(lockedClip, {}, p));
    }
    void appendAndImage() {
        Placement p; p.asset = asset; p.inMs = 1000; p.outMs = 3000; p.newVideoTrack = true; p.newAudioTrack = true;
        const auto result = placeSource(raw, {}, p); QVERIFY(result); QCOMPARE(result->doc.value("tracks").toArray().size(), 6);
        p = {}; p.asset = asset; p.asset.insert("content_type", "image/png"); p.videoTrackId = "v";
        const auto image = placeSource(raw, {}, p); QVERIFY(image);
        const auto c = image->doc.value("clips").toArray().first().toObject(); QVERIFY(!c.contains("inPointMs")); QVERIFY(!c.contains("outPointMs"));
        p.asset = asset; QVERIFY(!placeSource(raw, {}, p));
        auto doc = raw; doc.insert("clips", QJsonArray{
            QJsonObject{{"id", "laterVideo"}, {"trackId", "v"}, {"startMs", 5000}, {"durationMs", 1000}},
            QJsonObject{{"id", "laterAudio"}, {"trackId", "a"}, {"startMs", 7000}, {"durationMs", 1000}}});
        p.asset = asset; p.inMs = 1000; p.outMs = 3000; p.audioTrackId = "a"; p.mode = "append";
        const auto appended = placeSource(doc, {}, p); QVERIFY(appended);
        for (const auto& value : appended->doc.value("clips").toArray()) {
            const auto clip = value.toObject();
            if (clip.value("id").toString() == appended->id) { QCOMPARE(clip.value("startMs").toDouble(), 8000.0); }
        }
        p.mode = "overwrite"; p.startMs = 6010; p.snapMs = 50;
        const auto snapped = placeSource(doc, {}, p); QVERIFY(snapped);
        for (const auto& value : snapped->doc.value("clips").toArray()) {
            const auto clip = value.toObject();
            if (clip.value("id").toString() == snapped->id) { QCOMPARE(clip.value("startMs").toDouble(), 6000.0); }
        }
    }
};
QTEST_GUILESS_MAIN(TestSourcePlacement)
#include "tst_sourceplacement.moc"
