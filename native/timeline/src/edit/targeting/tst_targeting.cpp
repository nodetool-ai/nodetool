#include "app/EditRegistry.h"
#include "edit/targeting/TrackTargeting.h"
#include <QJsonArray>
#include <QSignalSpy>
#include <QTest>

namespace {
QJsonObject clip(const QString& id, const QString& track, double start, double duration = 1000) {
    return {{"id", id}, {"trackId", track}, {"startMs", start}, {"durationMs", duration}, {"mediaType", "video"}};
}
QJsonObject document() {
    return {{"tracks", QJsonArray{QJsonObject{{"id", "v1"}, {"type", "video"}},
                                  QJsonObject{{"id", "v2"}, {"type", "video"}},
                                  QJsonObject{{"id", "locked"}, {"type", "video"}, {"locked", true}}}},
            {"clips", QJsonArray{clip("edit", "v1", 1000), clip("later1", "v1", 4000),
                                 clip("other", "v2", 1000), clip("later2", "v2", 4000), clip("fixed", "locked", 4000)}},
            {"mediaTracks", QJsonArray{}}, {"extra", "keep"}};
}
double startOf(const QJsonObject& doc, const QString& id) {
    for (const auto& value : doc.value("clips").toArray()) {
        if (value.toObject().value("id") == id) { return value.toObject().value("startMs").toDouble(); }
    }
    return -1;
}
}
class TestTargeting : public QObject {
    Q_OBJECT
private slots:
    void init() {
        for (const auto& id : {"v1", "v2", "locked"}) {
            nt::targeting::TrackTargeting::current().setTrackTargeted(id, true);
            nt::targeting::TrackTargeting::current().setTrackSyncLocked(id, true);
        }
    }
    void untargetedRangeIsSkipped() {
        const auto edit = nt::app::findEdit("removeRange");
        QVERIFY(edit);
        const auto result = edit(document(), {{"startMs", 1000}, {"endMs", 2000}, {"ripple", false},
                                               {"untargetedTrackIds", QJsonArray{"v2"}}});
        QCOMPARE(startOf(result, "edit"), -1);
        QCOMPARE(startOf(result, "other"), 1000);
        QCOMPARE(result.value("extra"), QJsonValue("keep"));
    }
    void syncLockOffOnlyFreezesOtherTracks() {
        const auto edit = nt::app::findEdit("rippleDeleteSelected");
        QVERIFY(edit);
        const QJsonObject targeting{{"syncLockOffTrackIds", QJsonArray{"v2"}}, {"selectedIds", QJsonArray{"edit"}}};
        auto doc = document();
        auto clips = doc.value("clips").toArray();
        clips[2] = clip("other", "v2", 0);
        doc.insert("clips", clips);
        const auto result = edit(doc, targeting);
        QCOMPARE(startOf(result, "later1"), 3000);
        QCOMPARE(startOf(result, "later2"), 4000);
        auto own = targeting;
        own.insert("selectedIds", QJsonArray{"other"});
        QCOMPARE(startOf(edit(doc, own), "later2"), 3000);
    }
    void lockedTrackNeverMoves() {
        const auto edit = nt::app::findEdit("rippleDeleteSelected");
        QVERIFY(edit);
        QCOMPARE(startOf(edit(document(), {{"selectedIds", QJsonArray{"edit"}}}), "fixed"), 4000);
        const auto close = nt::app::findEdit("closeGapAt");
        QVERIFY(close);
        QCOMPARE(startOf(close(document(), {{"trackId", "locked"}, {"timeMs", 0}}), "fixed"), 4000);
    }
    void editorSettersOnlySignalChanges() {
        nt::targeting::TrackTargeting state;
        QSignalSpy changed(&state, &nt::targeting::TrackTargeting::changed);
        QVERIFY(state.isTargeted("v1"));
        QVERIFY(state.isSyncLocked("v1"));
        state.setTrackTargeted("v1", true);
        state.setTrackSyncLocked("v1", true);
        QCOMPARE(changed.size(), 0);
        state.setTrackTargeted("v1", false);
        QVERIFY(!state.isTargeted("v1"));
        state.setTrackTargeted("v1", false);
        state.setTrackSyncLocked("v1", false);
        QVERIFY(!state.isSyncLocked("v1"));
        state.setTrackSyncLocked("v1", false);
        QCOMPARE(changed.size(), 2);
        state.setTrackTargeted("v1", true);
        state.setTrackSyncLocked("v1", true);
        QCOMPARE(changed.size(), 4);
        QVERIFY(state.state().untargetedTrackIds.empty());
        QVERIFY(state.state().syncLockOffTrackIds.empty());
    }
    void payloadOverridesEditorStatePerSet() {
        auto& state = nt::targeting::TrackTargeting::current();
        state.setTrackTargeted("v2", false);
        state.setTrackSyncLocked("v2", false);
        const auto remove = nt::app::findEdit("removeRange");
        QVERIFY(remove);
        const QJsonObject range{{"startMs", 1000}, {"endMs", 2000}, {"ripple", false}};
        QCOMPARE(startOf(remove(document(), range), "other"), 1000);
        auto explicitTargets = range;
        explicitTargets.insert("untargetedTrackIds", QJsonArray{});
        QCOMPARE(startOf(remove(document(), explicitTargets), "other"), -1);
        const auto ripple = nt::app::findEdit("rippleDeleteSelected");
        QVERIFY(ripple);
        auto doc = document();
        auto clips = doc.value("clips").toArray();
        clips[2] = clip("other", "v2", 0);
        doc.insert("clips", clips);
        const QJsonObject selected{{"selectedIds", QJsonArray{"edit"}}, {"untargetedTrackIds", QJsonArray{}}};
        QCOMPARE(startOf(ripple(doc, selected), "later2"), 4000);
        auto explicitSync = selected;
        explicitSync.insert("syncLockOffTrackIds", QJsonArray{});
        QCOMPARE(startOf(ripple(doc, explicitSync), "later2"), 3000);
    }
    void mediaOwnerDropGuard() {
        auto doc = document();
        doc.insert("clips", QJsonArray{clip("owner", "v1", 0, 4000), clip("mover", "v1", 1000)});
        doc.insert("mediaTracks", QJsonArray{QJsonObject{{"id", "mt"}, {"clipId", "owner"}}});
        const auto edit = nt::app::findEdit("resolveDropAction");
        QVERIFY(edit);
        for (const auto& mode : {"insert", "overwrite"}) {
            QCOMPARE(edit(doc, {{"selectedIds", QJsonArray{"mover"}}, {"mode", mode}}), doc);
        }
    }
};
QTEST_GUILESS_MAIN(TestTargeting)
#include "tst_targeting.moc"
