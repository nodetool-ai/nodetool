// Take switching in the mounted editor, with real key and pointer events and a
// real frame helper. Cases follow FilmCraft's crates/engine/src/multicam_tests.rs
// (https://github.com/storytold/filmcraft), MIT. See licenses/FilmCraft-MIT.txt.
#include "app/MenuRegistry.h"
#include "takes/TakeGrid.h"
#include "takes/TakeSwitcher.h"
#include "export/FrameCapture.h"
#include "ui/MonitorViewState.h"
#include "wiring/WiringFixture.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QSignalSpy>
#include <QUndoStack>

namespace {
QJsonObject take(const QString& id, double durationMs = 9000) {
    return {{"id", id}, {"assetId", "asset-" + id}, {"status", "success"}, {"durationMs", durationMs},
            {"dependencyHash", "hash"}, {"paramOverridesSnapshot", QJsonObject{}}};
}
QJsonArray fourTakes() { return {take("a"), take("b"), take("short", 1000), take("d")}; }
QString mediaFor(const QString& assetId) {
    static const QHash<QString, QString> files{{"asset-a", "numbered-a-1080p30.mp4"}, {"asset-b", "numbered-b-1080p30.mp4"},
                                               {"asset-d", "numbered-d-1080p30.mp4"}};
    return QStringLiteral(NT_FIXTURES_DIR "/media/") + files.value(assetId, QStringLiteral("numbered-a-1080p30.mp4"));
}
}

class TakeSwitchUi : public WiringFixture {
    Q_OBJECT
    double nowMs = 1000;
    TakeSwitcher* switcher() { return TakeSwitcher::forTimeline(&model); }
    MonitorViewState* monitor() const { return view->rootObject()->findChild<MonitorViewState*>("monitorViewState"); }
    TakeGrid* grid() const { return view->rootObject()->findChild<TakeGrid*>("takeGrid"); }
    QUndoStack* undo() { return model.undoStack(); }
    QString assetOf(const QString& id) const { return clip(id).value("currentAssetId").toString(); }
    void mount(const QJsonArray& versions = fourTakes()) {
        // The monitor's controls sit under the take grid, so the timeline leaves them room.
        open(320);
        QVERIFY(!QTest::currentTestFailed());
        QJsonObject shot{{"id", "shot"}, {"trackId", "v"}, {"name", "Shot"}, {"mediaType", "video"}, {"sourceType", "generated"},
                         {"startMs", 1000}, {"durationMs", 4000}, {"inPointMs", 0}, {"outPointMs", 4000}, {"status", "generated"},
                         {"currentAssetId", "asset-a"}, {"activeTakeId", "a"}, {"dependencyHash", "hash"}, {"versions", versions},
                         {"opacity", 0.5}, {"fadeOutMs", 200}, {"transform", QJsonObject{{"rotation", 12}}}};
        QJsonObject plain{{"id", "plain"}, {"trackId", "w"}, {"name", "Plain"}, {"mediaType", "video"}, {"sourceType", "imported"},
                          {"startMs", 1000}, {"durationMs", 4000}, {"status", "generated"}};
        auto document = doc();
        document.insert("clips", QJsonArray{shot, plain});
        auto parsed = nt::parseTimelineJson(QJsonDocument(document).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        clock.seek(2000);
        undo()->clear();
        gestures()->setSelection({});
        view->rootObject()->property("frameCapture").value<FrameCapture*>()->setExecutable(QStringLiteral(NT_TIMELINE_BINARY));
        switcher()->setMediaResolver([](const QJsonObject& raw, const QString& assetId) {
            nt::Clip media;
            media.raw = raw;
            media.mediaType = nt::MediaType::Video;
            media.mediaPath = mediaFor(assetId).toStdString();
            return media;
        });
        view->requestActivate();
        (void)QTest::qWaitForWindowActive(view.get());
        QCoreApplication::processEvents();
    }
    void key(Qt::Key k, Qt::KeyboardModifiers mods = Qt::NoModifier) {
        QTest::keyClick(view.get(), k, mods);
        QCoreApplication::processEvents();
    }
    void startPlaying() {
        nowMs = 1000;
        clock.setNowSource([this] { return static_cast<std::int64_t>(nowMs * 1e6); });
        clock.play();
        QVERIFY(clock.playing());
    }
    void playTo(double timeMs) {
        nowMs += timeMs - clock.currentTimeMs();
        clock.tick();
        QCoreApplication::processEvents();
    }
    // The parts on the shot's track as [start, asset], in time order.
    QList<QPair<int, QString>> parts() const {
        QList<QPair<int, QString>> result;
        for (const auto& value : model.clipsJson()) {
            const auto c = value.toObject();
            if (c.value("trackId") == "v") { result.append({c.value("startMs").toInt(), c.value("currentAssetId").toString()}); }
        }
        std::ranges::sort(result);
        return result;
    }
    using Parts = QList<QPair<int, QString>>;
private slots:
    void cleanup() {
        if (switcher()->recording() && view) { switcher()->toggleRecording(*gestures()); }
        clock.pause();
        clock.setNowSource({});
        view.reset();
    }
    void aNumberSwitchesTheSelectedClip() {
        mount();
        gestures()->setSelection({"shot"});
        const auto before = clip("shot");
        key(Qt::Key_2);
        QCOMPARE(assetOf("shot"), QString("asset-b"));
        QCOMPARE(undo()->count(), 1);
        QCOMPARE(undo()->text(0), QString("Switch take"));
        const auto after = clip("shot");
        for (const auto* field : {"startMs", "durationMs", "inPointMs", "outPointMs", "opacity", "fadeOutMs", "transform", "versions"}) {
            QVERIFY2(after.value(field) == before.value(field), field);
        }
        // The new take's file reaches the clip the compositor reads.
        QTRY_COMPARE(QString::fromStdString(model.timeline().findClip("shot")->mediaPath), mediaFor("asset-b"));
        undo()->undo();
        QCOMPARE(clip("shot"), before);
    }
    void aNumberSwitchesTheClipAtThePlayheadOnATargetedTrack() {
        mount();
        key(Qt::Key_4);
        QCOMPARE(assetOf("shot"), QString("asset-d"));
        undo()->undo();
        nt::targeting::TrackTargeting::current().setTrackTargeted("v", false);
        key(Qt::Key_4);
        nt::targeting::TrackTargeting::current().setTrackTargeted("v", true);
        QCOMPARE(assetOf("shot"), QString("asset-a"));
        QVERIFY(switcher()->message().startsWith("No clip with takes"));
    }
    void aRefusedSwitchShowsAMessageAndChangesNothing() {
        mount();
        const auto before = model.clipsJson();
        key(Qt::Key_3);
        QCOMPARE(model.clipsJson(), before);
        QCOMPARE(undo()->count(), 0);
        QCOMPARE(switcher()->message(), QString("Take is shorter than the current cut."));
        auto* status = item("takeMessage");
        QVERIFY(status);
        QVERIFY(status->isVisible());
        QCOMPARE(status->property("message").toString(), QString("Take is shorter than the current cut."));
        key(Qt::Key_9);
        QCOMPARE(switcher()->message(), QString("Take 9 does not exist. This clip has 4 takes."));
        QCOMPARE(model.clipsJson(), before);
        key(Qt::Key_2);
        QCOMPARE(switcher()->message(), QString());
        QVERIFY(!status->isVisible());
    }
    void ctrlNumberSplitsAndSwitchesThePartAfter() {
        mount();
        clock.seek(3000);
        const auto before = model.clipsJson();
        key(Qt::Key_2, Qt::ControlModifier);
        QCOMPARE(parts(), (Parts{{1000, "asset-a"}, {3000, "asset-b"}}));
        QCOMPARE(undo()->count(), 1);
        QCOMPARE(undo()->text(0), QString("Cut to take"));
        // At the new edit the part after it switches and no new edit appears.
        key(Qt::Key_4, Qt::ControlModifier);
        QCOMPARE(parts(), (Parts{{1000, "asset-a"}, {3000, "asset-d"}}));
        QCOMPARE(undo()->count(), 2);
        undo()->undo();
        undo()->undo();
        QCOMPARE(model.clipsJson(), before);
        // A refused cut splits nothing.
        key(Qt::Key_3, Qt::ControlModifier);
        QCOMPARE(model.clipsJson(), before);
        QCOMPARE(switcher()->message(), QString("Take is shorter than the current cut."));
    }
    void aHeldKeyIsOnePress() {
        mount();
        QVERIFY(gestures()->handleKey(Qt::Key_2, "2", 0, true));
        QCOMPARE(assetOf("shot"), QString("asset-a"));
        QVERIFY(gestures()->handleKey(Qt::Key_0, "0", 0, true));
        QVERIFY(!switcher()->recording());
    }
    void aLivePassIsOneUndoEntry() {
        mount();
        const auto base = model.clipsJson();
        const auto seekSerial = clock.seekSerial();
        key(Qt::Key_0);
        QVERIFY(switcher()->recording());
        auto* armed = item("takeRecordingStatus");
        QVERIFY(armed);
        QVERIFY(armed->isVisible());
        startPlaying();
        playTo(2000);
        key(Qt::Key_2);
        QCOMPARE(parts(), (Parts{{1000, "asset-a"}, {2000, "asset-b"}}));
        // An autosave moves the undo stack's clean mark, which stops ordinary command merges.
        undo()->setClean();
        playTo(3000);
        key(Qt::Key_4);
        QCOMPARE(parts(), (Parts{{1000, "asset-a"}, {2000, "asset-b"}, {3000, "asset-d"}}));
        // A second press of the same take adds no edit.
        playTo(3500);
        key(Qt::Key_4);
        QCOMPARE(parts().size(), 3);
        // A refused press adds no edit and playback carries on.
        playTo(3600);
        key(Qt::Key_3);
        QCOMPARE(parts().size(), 3);
        QCOMPARE(switcher()->message(), QString("Take is shorter than the current cut."));
        // Off the frame grid, a cut lands on a frame edge.
        playTo(4017);
        key(Qt::Key_1);
        QCOMPARE(parts(), (Parts{{1000, "asset-a"}, {2000, "asset-b"}, {3000, "asset-d"}, {4033, "asset-a"}}));
        QVERIFY(clock.playing());
        QCOMPARE(clock.seekSerial(), seekSerial);
        clock.pause();
        QCOMPARE(undo()->count(), 1);
        QCOMPARE(undo()->text(0), QString("Record takes"));
        // The parts run on in source time, as one clip played through.
        const auto clips = model.clipsJson();
        double covered = 0;
        for (const auto& value : clips) {
            const auto c = value.toObject();
            if (c.value("trackId") != "v") { continue; }
            QCOMPARE(c.value("inPointMs").toDouble(), c.value("startMs").toDouble() - 1000);
            covered += c.value("durationMs").toDouble();
        }
        QCOMPARE(covered, 4000.0);
        // A second pass is its own entry.
        clock.play();
        playTo(2500);
        key(Qt::Key_4);
        clock.pause();
        QCOMPARE(undo()->count(), 2);
        undo()->undo();
        QCOMPARE(parts().size(), 4);
        undo()->undo();
        QCOMPARE(model.clipsJson(), base);
    }
    void undoDuringAPassStartsANewEntry() {
        mount();
        const auto base = model.clipsJson();
        key(Qt::Key_0);
        startPlaying();
        playTo(2000);
        key(Qt::Key_2);
        undo()->undo();
        QCOMPARE(model.clipsJson(), base);
        playTo(3000);
        key(Qt::Key_4);
        QCOMPARE(parts(), (Parts{{1000, "asset-a"}, {3000, "asset-d"}}));
        QCOMPARE(undo()->count(), 1);
        undo()->undo();
        QCOMPARE(model.clipsJson(), base);
    }
    void anotherEditDuringAPassKeepsBothEntries() {
        mount();
        key(Qt::Key_0);
        startPlaying();
        playTo(2000);
        key(Qt::Key_2);
        QCOMPARE(undo()->count(), 1);
        QVERIFY(model.addMarker(1500, "note").size() > 0);
        const int entries = undo()->count();
        playTo(3000);
        key(Qt::Key_4);
        QCOMPARE(undo()->count(), entries + 1);
        QCOMPARE(parts().size(), 3);
        QCOMPARE(model.markers().size(), 1);
    }
    void withoutRecordingANumberSwitchesDuringPlayback() {
        mount();
        startPlaying();
        playTo(2000);
        key(Qt::Key_2);
        QCOMPARE(parts(), (Parts{{1000, "asset-b"}}));
        QVERIFY(clock.playing());
    }
    void aSelectedClipFollowsThePass() {
        mount();
        gestures()->setSelection({"shot"});
        key(Qt::Key_0);
        startPlaying();
        playTo(2000);
        key(Qt::Key_2);
        QCOMPARE(gestures()->selection().size(), 1);
        const auto selected = clip(gestures()->selection().first());
        QCOMPARE(selected.value("startMs").toInt(), 2000);
        playTo(3000);
        key(Qt::Key_4);
        QCOMPARE(parts().size(), 3);
    }
    void theGridSwitchesOnClickAndShowsFrames() {
        mount();
        monitor()->setDisplayMode("takes");
        QTRY_VERIFY(grid());
        QTRY_COMPARE(grid()->takeCount(), 4);
        QCOMPARE(grid()->clipId(), QString("shot"));
        QTRY_VERIFY(item("takeCell_4"));
        QVERIFY(!item("takeCell_5"));
        QCOMPARE(named(item("takeCell_2"), "takeCellName")->property("text").toString(), QString("Take 2"));
        QCOMPARE(grid()->takes().at(0).toMap().value("active").toBool(), true);
        // Each take shows its own frame at the playhead.
        QTRY_VERIFY_WITH_TIMEOUT(!grid()->frame("a").isNull() && !grid()->frame("b").isNull() && !grid()->frame("d").isNull(), 60000);
        QVERIFY(grid()->frame("a") != grid()->frame("b"));
        QVERIFY(grid()->frame("a").width() <= 640);
        // A left click switches and is one undo entry.
        click("takeCell_2");
        QCOMPARE(assetOf("shot"), QString("asset-b"));
        QCOMPARE(undo()->count(), 1);
        QTRY_VERIFY(grid()->takes().at(1).toMap().value("active").toBool());
        // Ctrl+click cuts at the playhead.
        clock.seek(3000);
        click("takeCell_4", Qt::ControlModifier);
        QCOMPARE(parts(), (Parts{{1000, "asset-b"}, {3000, "asset-d"}}));
        // The Record button arms a pass.
        click("takeGridRecord");
        QVERIFY(switcher()->recording());
        click("takeGridRecord");
        QVERIFY(!switcher()->recording());
    }
    void theGridPagesPastNine() {
        QJsonArray versions;
        for (int i = 0; i < 12; ++i) { versions.append(take(QStringLiteral("t%1").arg(i + 1))); }
        mount(versions);
        monitor()->setDisplayMode("takes");
        QTRY_VERIFY(grid());
        QTRY_COMPARE(grid()->takeCount(), 12);
        QCOMPARE(grid()->pageCount(), 2);
        QCOMPARE(grid()->takes().size(), 9);
        QTRY_VERIFY(item("takeCell_9"));
        QVERIFY(!item("takeGridPreviousPage")->isEnabled());
        click("takeGridNextPage");
        QCOMPARE(grid()->page(), 1);
        QTRY_COMPARE(grid()->takes().size(), 3);
        QCOMPARE(grid()->takes().at(0).toMap().value("number").toInt(), 10);
        QCOMPARE(named(item("takeCell_1"), "takeCellName")->property("text").toString(), QString("Take 10"));
        // A number picks from the shown page: 2 is take 11.
        key(Qt::Key_2);
        QCOMPARE(clip("shot").value("activeTakeId").toString(), QString("t11"));
        QCOMPARE(grid()->page(), 1);
        click("takeGridPreviousPage");
        QCOMPARE(grid()->page(), 0);
        key(Qt::Key_2);
        QCOMPARE(clip("shot").value("activeTakeId").toString(), QString("t2"));
        // With the grid closed a number means that take of the whole list.
        click("takeGridNextPage");
        monitor()->setDisplayMode("composite");
        QTRY_VERIFY(!grid());
        key(Qt::Key_3);
        QCOMPARE(clip("shot").value("activeTakeId").toString(), QString("t3"));
    }
    void theGridHasAnEmptyState() {
        mount();
        clock.seek(0);
        monitor()->setDisplayMode("takes");
        QTRY_VERIFY(grid());
        auto* empty = item("takeGridEmpty");
        QTRY_VERIFY(empty && empty->isVisible());
        // The clip under the playhead fills it, and leaving the clip empties it.
        clock.seek(2000);
        clock.tick();
        QTRY_COMPARE(grid()->takeCount(), 4);
        QTRY_VERIFY(!empty->isVisible());
    }
    void theCellMenuSwitchesAndCuts() {
        mount();
        monitor()->setDisplayMode("takes");
        QTRY_VERIFY(item("takeCell_2"));
        clock.seek(3000);
        QTest::mouseClick(view.get(), Qt::RightButton, Qt::NoModifier, center(item("takeCell_2")));
        QCoreApplication::processEvents();
        auto* menu = view->rootObject()->findChild<QObject*>("takeCellMenu");
        QVERIFY(menu);
        QTRY_VERIFY(menu->property("opened").toBool());
        QCOMPARE(menu->property("number").toInt(), 2);
        QMetaObject::invokeMethod(menu, "close");
    }
    void stoppingAPassReturnsNumbersToSwitching() {
        mount();
        key(Qt::Key_0);
        startPlaying();
        playTo(2000);
        key(Qt::Key_2);
        QCOMPARE(parts().size(), 2);
        key(Qt::Key_0);
        QVERIFY(!switcher()->recording());
        QVERIFY(clock.playing());
        playTo(4000);
        key(Qt::Key_4);
        QCOMPARE(parts(), (Parts{{1000, "asset-a"}, {2000, "asset-d"}}));
        QCOMPARE(undo()->count(), 2);
    }
    void aMessageClearsItself() {
        mount();
        key(Qt::Key_3);
        QVERIFY(!switcher()->message().isEmpty());
        QTRY_VERIFY_WITH_TIMEOUT(switcher()->message().isEmpty(), 7000);
    }
    void takeMediaFailureIsReported() {
        mount({take("a"), take("unreachable")});
        switcher()->setMediaResolver([](const QJsonObject&, const QString&) { return nt::Clip{}; });
        key(Qt::Key_2);
        QCOMPARE(assetOf("shot"), QString("asset-unreachable"));
        QTRY_COMPARE(switcher()->message(), QString("The take's media could not be loaded. Check the server connection."));
    }
    void theMenuEntriesAreInTheClipMenu() {
        mount();
        bool record = false;
        bool grid = false;
        const QVariantMap context{{"kind", "shell"}, {"gestures", QVariant::fromValue<QObject*>(gestures())},
                                  {"timeline", QVariant::fromValue<QObject*>(&model)}};
        for (const auto& entry : nt::app::shellMenuEntries()) {
            if (entry.menu != "Clip" || entry.submenu != "Takes") { continue; }
            QVERIFY(entry.enabled(context));
            if (entry.action == "takeRecord") {
                record = true;
                QVERIFY(!entry.checked(context));
                QVERIFY(gestures()->runAction(entry.action, context));
                QVERIFY(entry.checked(context));
                QVERIFY(gestures()->runAction(entry.action, context));
            }
            if (entry.action == "takeGrid") {
                grid = true;
                QVERIFY(!entry.checked(context));
                QVERIFY(gestures()->runAction(entry.action, context));
                QVERIFY(entry.checked(context));
                QVERIFY(gestures()->runAction(entry.action, context));
            }
        }
        QVERIFY(record);
        QVERIFY(grid);
    }
    void theBadgeShowsTheTakeAndTheCount() {
        mount();
        auto* badge = item("takeBadge-shot");
        QTRY_VERIFY(badge);
        QVERIFY(badge->isVisible());
        QCOMPARE(named(badge, "takeBadgeText")->property("text").toString(), QString("1/4"));
        QVERIFY(!item("takeBadge-plain") || !item("takeBadge-plain")->isVisible());
        key(Qt::Key_2);
        QTRY_COMPARE(named(item("takeBadge-shot"), "takeBadgeText")->property("text").toString(), QString("2/4"));
    }
    void playbackTouchesNoModel() {
        mount();
        monitor()->setDisplayMode("takes");
        QTRY_VERIFY(grid());
        QSignalSpy clips(&model, &TimelineModel::clipsChanged);
        QSignalSpy timeline(&model, &TimelineModel::timelineChanged);
        QSignalSpy gridChanges(grid(), &TakeGrid::changed);
        startPlaying();
        for (int t = 2000; t < 3000; t += 100) { playTo(t); }
        clock.pause();
        QCOMPARE(clips.count(), 0);
        QCOMPARE(timeline.count(), 0);
        QCOMPARE(gridChanges.count(), 0);
    }
    void theMenuItemsRun() {
        mount();
        QVERIFY(gestures()->runAction("takeRecord"));
        QVERIFY(switcher()->recording());
        QVERIFY(gestures()->runAction("takeRecord"));
        QVERIFY(!switcher()->recording());
        QVERIFY(gestures()->runAction("takeGrid"));
        QCOMPARE(monitor()->displayMode(), QString("takes"));
        QVERIFY(gestures()->runAction("takeGrid"));
        QCOMPARE(monitor()->displayMode(), QString("composite"));
    }
};
QTEST_MAIN(TakeSwitchUi)
#include "tst_takeswitchui.moc"
