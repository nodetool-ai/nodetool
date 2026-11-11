#include "SourceEdit.h"
#include "SourceViewerState.h"
#include "SourceMonitor.h"
#include "app/Preferences/PreferencesSettings.h"
#include "wiring/WiringFixture.h"
#include <QFile>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QSignalSpy>
#include <cmath>

class TestSourceViewer : public WiringFixture {
    Q_OBJECT
    SourceViewerState* state = nullptr;
    QJsonObject asset{{"id", "source"}, {"name", "Take"}, {"content_type", "video/mp4"}, {"duration", 10}};
    static QJsonObject normalize(QJsonObject document, const QJsonObject& before) {
        QSet<QString> known;
        for (const auto& c : before.value("clips").toArray()) { known.insert(c.toObject().value("id").toString()); }
        QHash<QString, QString> names;
        QJsonArray clips;
        for (const auto& value : document.value("clips").toArray()) {
            auto c = value.toObject();
            const auto id = c.value("id").toString();
            if (!known.contains(id)) {
                if (!names.contains(id)) { names.insert(id, "new" + QString::number(names.size())); }
                c.insert("id", names.value(id));
            }
            clips.append(c);
        }
        document.insert("clips", clips);
        return document;
    }
    void scrub(double fraction) {
        auto* bar = item("sourceScrub"); QVERIFY(bar);
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier,
                          bar->mapToScene({bar->width() * fraction, bar->height() / 2}).toPoint());
    }
    void type(const QString& name, const QString& value) {
        auto* pill = item(name); QVERIFY(pill);
        QQuickItem* input = nullptr;
        for (auto* child : pill->childItems()) {
            if (child->inherits("QQuickTextInput")) { input = child; break; }
        }
        QVERIFY(input);
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(input));
        QTest::keyClick(view.get(), Qt::Key_A, Qt::ControlModifier);
        for (const auto c : value) {
            QTest::keyClick(view.get(), c == '.' ? Qt::Key_Period : static_cast<Qt::Key>(Qt::Key_0 + c.digitValue()));
        }
        QTest::keyClick(view.get(), Qt::Key_Return);
    }
private slots:
    void initTestCase() {
        const auto path = qEnvironmentVariable("NODETOOL_TIMELINE_PREFERENCES");
        QVERIFY2(!path.isEmpty(),
                 "NODETOOL_TIMELINE_PREFERENCES must be set and non-empty: the test must not write the user's real Timeline.conf");
        QVERIFY2(!QFile::exists(path) || QFile::remove(path), "Could not remove the test preferences file");
    }
    void init() {
        QFile::remove(qEnvironmentVariable("NODETOOL_TIMELINE_PREFERENCES"));
        open(300);
        view->resize(1800, 1200);
        state = view->engine()->singletonInstance<SourceViewerState*>("NodeTool.Timeline", "SourceViewerState");
        QVERIFY(state);
        state->reloadMarksForTest();
        QCoreApplication::processEvents();
        state->setAsset(asset.toVariantMap());
        QCoreApplication::processEvents();
        auto* panel = item("sourceViewer"); QVERIFY(panel);
        QTRY_VERIFY(panel->isVisible() && panel->height() > 0 &&
                    panel->mapToScene({panel->width(), panel->height()}).y() <= view->height());
    }
    void cleanup() { state = nullptr; view.reset(); }

    void marksPersistPerAsset() {
        state->markIn(1000); state->markOut(3000);
        auto other = asset; other.insert("id", "unmarked");
        state->setAsset(other.toVariantMap());
        QCOMPARE(state->inMs(), 0.0); QVERIFY(!state->hasMarks());
        auto settings = nt::app::openTimelinePreferences();
        QVERIFY(settings->value("source/marks").toByteArray().contains("\"source\""));
        QVERIFY(!settings->value("source/marks").toByteArray().contains("unmarked"));
        state->setAsset(asset.toVariantMap());
        QCOMPARE(state->inMs(), 1000.0); QCOMPARE(state->outMs(), 3000.0);
        SourceViewerState reopened; reopened.setAsset(asset.toVariantMap());
        QCOMPARE(reopened.inMs(), 1000.0); QCOMPARE(reopened.outMs(), 3000.0);
        reopened.clearMarks(); state->reloadMarksForTest(); QVERIFY(!state->hasMarks());
    }
    void marksKeepRecentChangesWithinLimit() {
        QJsonArray full;
        for (int i = 0; i < 500; ++i) { full.append(QJsonObject{{"id", QString::number(i)}, {"inMs", 1000}}); }
        auto settings = nt::app::openTimelinePreferences();
        settings->setValue("source/marks", QJsonDocument(full).toJson(QJsonDocument::Compact)); settings->sync();
        state->reloadMarksForTest();
        auto next = asset; next.insert("id", "0"); state->setAsset(next.toVariantMap()); state->markIn(2000);
        next.insert("id", "new"); state->setAsset(next.toVariantMap()); state->markOut(3000);
        settings->sync();
        const auto saved = QJsonDocument::fromJson(settings->value("source/marks").toByteArray()).array();
        QCOMPARE(saved.size(), 500);
        QCOMPARE(saved.first().toObject().value("id").toString(), QString("2"));
        QCOMPARE(saved[498].toObject().value("id").toString(), QString("0"));
        QCOMPARE(saved[499].toObject().value("id").toString(), QString("new"));
    }
    void marksUseFramesAndDiscoveredDuration() {
        auto unknown = asset; unknown.insert("id", "unknown-duration"); unknown.remove("duration"); state->setAsset(unknown.toVariantMap());
        state->monitor()->openLocal(unknown.toVariantMap(), QStringLiteral(NT_FIXTURES_DIR "/media/numbered-a-1080p30.mp4"), {});
        QTRY_VERIFY(state->monitor()->ready()); QCOMPARE(state->durationMs(), 20000.0);
        state->markIn(1001); QCOMPARE(state->inMs(), 1000.0); QVERIFY(!state->sourceRange().contains("outMs"));
        state->markOut(2001); QVERIFY(std::abs(state->outMs() - 61000.0 / 30) < 1e-8);
        state->markIn(3000); QVERIFY(!state->sourceRange().contains("outMs"));
        state->markOut(1000); QVERIFY(!state->sourceRange().contains("inMs"));
        state->clearMarks(); state->monitor()->seek(1000); QVERIFY(state->runAction("markIn", false));
        state->monitor()->seek(2000); QVERIFY(state->runAction("markOut", false));
        QVERIFY(state->runAction("goToOut", false)); QCOMPARE(state->monitor()->clock()->time(), 2000.0);
        QVERIFY(!state->runAction("playInToOut", false));
        state->setAsset(unknown.toVariantMap()); QCOMPARE(state->durationMs(), 20000.0);
        auto image = asset; image.insert("content_type", "image/png"); state->setAsset(image.toVariantMap());
        const auto before = state->sourceRange(); state->markIn(5000); QCOMPARE(state->sourceRange(), before);
        QVERIFY(!state->runAction("markIn", false));
    }
    void rangeDragPreviewAndCancel() {
        state->markIn(1000); state->markOut(3000);
        QSignalSpy changes(&model, &TimelineModel::clipsChanged);
        state->beginRangeDrag("in"); state->updateRangeDrag(500);
        QVERIFY(state->rangeDragging()); QCOMPARE(state->inMs(), 1500.0);
        state->cancelRangeDrag(); QCOMPARE(state->inMs(), 1000.0);
        state->beginRangeDrag("move"); state->updateRangeDrag(1000); state->commitRangeDrag();
        QCOMPARE(state->inMs(), 2000.0); QCOMPARE(state->outMs(), 4000.0);
        state->beginRangeDrag("in"); state->updateRangeDrag(1e18);
        QVERIFY(state->outMs() > state->inMs()); state->commitRangeDrag();
        QCOMPARE(model.undoStack()->count(), 0); QCOMPARE(changes.count(), 0);
        state->clearMarks(); state->beginRangeDrag("in"); state->updateRangeDrag(1000); state->commitRangeDrag();
        QVERIFY(state->sourceRange().contains("inMs")); QVERIFY(!state->sourceRange().contains("outMs"));
    }
    void linkedPlacementOneUndo() {
        state->markIn(1000); state->markOut(3000);
        const auto before = doc();
        state->setMediaBrowser(nullptr);
        QVERIFY(state->place("overwrite", "v", 8000, 0, true, true, state->captureRange(), gestures()));
        QCOMPARE(model.undoStack()->count(), 1); QCOMPARE(gestures()->selection().size(), 2);
        const auto first = clip(gestures()->selection()[0]); const auto second = clip(gestures()->selection()[1]);
        QVERIFY(!first.value("linkId").toString().isEmpty()); QCOMPARE(first.value("linkId"), second.value("linkId"));
        const auto after = doc(); model.undoStack()->undo(); QCOMPARE(doc(), before);
        model.undoStack()->redo(); QCOMPARE(doc(), after); model.undoStack()->undo();
        QVERIFY(state->place("overwrite", "v", 8000, 0, true, false, state->captureRange(), gestures()));
        QCOMPARE(gestures()->selection().size(), 1); QVERIFY(clip(gestures()->selection().first()).value("muted").toBool());
        model.undoStack()->undo();
        QVERIFY(state->place("overwrite", "a", 8000, 0, false, true, state->captureRange(), gestures()));
        QCOMPARE(gestures()->selection().size(), 1); QCOMPARE(clip(gestures()->selection().first()).value("mediaType").toString(), QString("audio"));
        QVERIFY(!model.applyEdit("source.place", QJsonObject{{"asset", asset}, {"inMs", "bad"}}));
    }
    void aLiftKeepsItsAssetWhenSourceChanges() {
        state->setMediaBrowser(nullptr);
        state->markIn(1000); state->markOut(3000);
        const auto lifted = state->captureRange();
        auto other = asset; other.insert("id", "another"); other.insert("name", "Another");
        state->setAsset(other.toVariantMap());
        QVERIFY(state->place("overwrite", "v", 8000, 0, true, false, lifted, gestures()));
        const auto placed = clip(gestures()->selection().first());
        QCOMPARE(placed.value("currentAssetId").toString(), QString("source"));
        QCOMPARE(placed.value("inPointMs").toDouble(), 1000.0);
        model.undoStack()->undo();
        QVERIFY(!state->place("overwrite", "v", 8000, 0, true, false, {{"inMs", 0}, {"outMs", 1000}}, gestures()));
        QCOMPARE(model.undoStack()->count(), 1);
    }
    void lockedDestinationPlacesNothing() {
        auto raw = doc(); auto tracks = raw.value("tracks").toArray();
        auto a = tracks[2].toObject(); a.insert("locked", true); tracks[2] = a; raw.insert("tracks", tracks);
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson()); QVERIFY(parsed.timeline); model.setTimeline(*parsed.timeline);
        const auto before = doc();
        QVERIFY(!state->place("overwrite", "v", 8000, 0, true, true, state->captureRange(), gestures()));
        QVERIFY(!state->lastError().isEmpty()); QCOMPARE(doc(), before); QCOMPARE(model.undoStack()->count(), 0);
        QVERIFY(!state->place("overwrite", "a", 8000, 0, true, false, state->captureRange(), gestures()));
        QCOMPARE(doc(), before); QCOMPARE(model.undoStack()->count(), 0);
    }
    void patchingChosenTrack() {
        auto raw = doc(); auto tracks = raw.value("tracks").toArray();
        tracks.append(QJsonObject{{"id", "a2"}, {"name", "Audio 2"}, {"type", "audio"}, {"index", 3}});
        raw.insert("tracks", tracks);
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson()); QVERIFY(parsed.timeline); model.setTimeline(*parsed.timeline);
        state->setMediaBrowser(nullptr);
        state->togglePatch("video", "w");
        QVERIFY(state->perform("insert", gestures())); QCOMPARE(gestures()->selection().size(), 1);
        const auto picture = clip(gestures()->selection().first()); QCOMPARE(picture.value("trackId").toString(), QString("w")); QVERIFY(picture.value("muted").toBool());
        model.undoStack()->undo();
        state->togglePatch("audio", "a2");
        QVERIFY(state->perform("insert", gestures())); QCOMPARE(gestures()->selection().size(), 2);
        QSet<QString> destinations;
        for (const auto& id : gestures()->selection()) { destinations.insert(clip(id).value("trackId").toString()); }
        QCOMPARE(destinations, (QSet<QString>{"w", "a2"})); model.undoStack()->undo();
        state->togglePatch("video", "w"); state->togglePatch("audio", "a2");
        const auto before = doc();
        const auto expected = nt::sourceedit::performSourceEdit("insert", before, nt::targeting::TrackTargeting::current().state(), {}, clock.time(), asset);
        QVERIFY(expected); QVERIFY(state->perform("insert", gestures())); QCOMPARE(normalize(doc(), before), normalize(expected->doc, before));
        model.undoStack()->undo();
        // A patched track that went away reports once and places nothing, rather than landing elsewhere.
        const auto unpatched = doc();
        const auto entries = model.undoStack()->count();
        state->togglePatch("video", "removed");
        QVERIFY(!state->perform("insert", gestures()));
        QVERIFY(state->lastError().contains("no longer"));
        QCOMPARE(doc(), unpatched); QCOMPARE(model.undoStack()->count(), entries);
        QVERIFY(state->patchedVideoTrackId().isEmpty());
        QVERIFY(state->perform("insert", gestures())); QVERIFY(state->lastError().isEmpty());
        model.undoStack()->undo();
        tracks = raw.value("tracks").toArray(); auto v = tracks[1].toObject(); v.insert("locked", true); tracks[1] = v; raw.insert("tracks", tracks);
        parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson()); QVERIFY(parsed.timeline); model.setTimeline(*parsed.timeline);
        state->togglePatch("video", "w");
        QVERIFY(!state->perform("insert", gestures())); QVERIFY(!state->lastError().isEmpty()); QCOMPARE(model.undoStack()->count(), 0);
    }
    // Real pointer drags on the ruler. The bottom half holds the marked range.
    void rangePointerPreviewsCommitsAndCancels() {
        state->markIn(1000); state->markOut(3000);
        const auto before = doc();
        auto* bar = item("sourceScrub"); QVERIFY(bar);
        const auto at = [&](double ms) {
            return bar->mapToScene({bar->width() * ms / 10000, bar->height() * 0.75}).toPoint();
        };
        const auto top = [&](double ms) {
            return bar->mapToScene({bar->width() * ms / 10000, bar->height() * 0.25}).toPoint();
        };
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, at(1000));
        QVERIFY(item("sourceViewer")->property("sourceFocused").toBool());
        QTest::mouseMove(view.get(), at(1500)); QTest::mouseMove(view.get(), at(2000));
        QVERIFY(state->rangeDragging());
        QVERIFY(std::abs(state->inMs() - 2000) < 40);
        const double parked = item("sourceViewer")->property("playerTimeMs").toDouble();
        QTest::keyClick(view.get(), Qt::Key_Escape);
        QVERIFY(!state->rangeDragging()); QCOMPARE(state->inMs(), 1000.0);
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, at(2000));
        QCOMPARE(state->inMs(), 1000.0); QCOMPARE(state->outMs(), 3000.0);
        QCOMPARE(item("sourceViewer")->property("playerTimeMs").toDouble(), parked);
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, at(1000));
        QTest::mouseMove(view.get(), at(1500));
        QTest::keyClick(view.get(), Qt::Key_Escape);
        QTest::mouseMove(view.get(), at(2500));
        QCOMPARE(state->inMs(), 1000.0);
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, at(2500));
        QCOMPARE(state->inMs(), 1000.0); QCOMPARE(state->outMs(), 3000.0);
        QCOMPARE(item("sourceViewer")->property("playerTimeMs").toDouble(), parked);

        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, at(3000));
        QTest::mouseMove(view.get(), at(3500)); QTest::mouseMove(view.get(), at(5000));
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, at(5000));
        QVERIFY(std::abs(state->outMs() - 5000) < 40);
        QCOMPARE(state->inMs(), 1000.0);
        const double out = state->outMs();

        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, at(2000));
        QTest::mouseMove(view.get(), at(2500)); QTest::mouseMove(view.get(), at(4000));
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, at(4000));
        QVERIFY(std::abs(state->inMs() - 3000) < 40);
        QVERIFY(std::abs((state->outMs() - state->inMs()) - (out - 1000)) < 1e-6);

        // Past the end the handle stops a frame short of the other mark.
        const double movedIn = state->inMs(), movedOut = state->outMs();
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, at(movedIn));
        QTest::mouseMove(view.get(), at(movedIn + 500)); QTest::mouseMove(view.get(), at(9900));
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, at(9900));
        QVERIFY(state->inMs() < movedOut); QCOMPARE(state->outMs(), movedOut);

        // A click in the band and a drag in the top half both scrub, and write no mark.
        const auto marks = state->sourceRange();
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, top(7000));
        QVERIFY(std::abs(item("sourceViewer")->property("playerTimeMs").toDouble() - 7000) < 40);
        QCOMPARE(state->sourceRange(), marks);
        QCOMPARE(doc(), before); QCOMPARE(model.undoStack()->count(), 0);
    }
    void patchChipsChooseTheTrack() {
        auto* chip = item("sourcePatch-v"); QVERIFY(chip);
        QVERIFY(chip->isVisible());
        QCOMPARE(chip->property("text").toString(), QString("V"));
        QCOMPARE(item("sourcePatch-a")->property("text").toString(), QString("A"));
        click("sourcePatch-v");
        QCOMPARE(state->patchedVideoTrackId(), QString("v"));
        QVERIFY(item("sourceRangeSummary")->property("text").toString().contains("patched tracks"));
        const auto before = doc();
        state->setMediaBrowser(nullptr);
        click("sourceOverwrite");
        QTRY_COMPARE(model.undoStack()->count(), 1);
        const auto placed = clip(gestures()->selection().first());
        QCOMPARE(placed.value("trackId").toString(), QString("v"));
        QVERIFY(placed.value("muted").toBool());
        QVERIFY(doc() != before);
        click("sourcePatch-v");
        QVERIFY(state->patchedVideoTrackId().isEmpty());
        // A document save never carries the patch.
        QVERIFY(!QJsonDocument(doc()).toJson().contains("patch"));
    }
    void lockedPatchReportsInThePanel() {
        click("sourcePatch-a");
        auto raw = doc(); auto tracks = raw.value("tracks").toArray();
        auto a = tracks[2].toObject(); a.insert("locked", true); tracks[2] = a; raw.insert("tracks", tracks);
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson()); QVERIFY(parsed.timeline); model.setTimeline(*parsed.timeline);
        const auto before = doc();
        state->setMediaBrowser(nullptr);
        click("sourceInsert");
        QCOMPARE(doc(), before); QCOMPARE(model.undoStack()->count(), 0);
        QTRY_VERIFY(item("sourceError")->isVisible());
        QVERIFY(item("sourceError")->property("text").toString().contains("locked"));
        state->togglePatch("audio", "a");
    }
    void dragIconsPlaceOnATrack_data() {
        QTest::addColumn<QString>("icon"); QTest::addColumn<int>("clips");
        QTest::newRow("both") << QString("sourceDragBoth") << 2;
        QTest::newRow("video") << QString("sourceDragVideo") << 1;
        QTest::newRow("picture") << QString("sourcePicture") << 2;
    }
    void dragIconsPlaceOnATrack() {
        QFETCH(QString, icon); QFETCH(int, clips);
        state->setMediaBrowser(nullptr);
        state->monitor()->openLocal(asset.toVariantMap(), QStringLiteral(NT_FIXTURES_DIR "/media/flash-beep-720p30.mov"), {});
        QTRY_VERIFY_WITH_TIMEOUT(state->monitor()->ready() && !state->monitor()->busy(), 10000);
        QVERIFY(state->monitor()->hasAudio());
        state->markIn(1000); state->markOut(3000);
        const auto before = doc();
        const auto beforeClips = before.value("clips").toArray().size();
        auto* source = item(icon); QVERIFY(source); QVERIFY(source->isEnabled());
        auto* lane = item("trackLane-v"); QVERIFY(lane);
        const QPoint from = center(source);
        const QPoint to = item("assetLaneDropArea")->mapToScene({item("assetLaneDropArea")->width() - 8, lane->height() / 2}).toPoint();
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, from);
        for (int i = 1; i <= 6; ++i) { QTest::mouseMove(view.get(), from + (to - from) * i / 6); QCoreApplication::processEvents(); }
        QVERIFY(!state->monitor()->clock()->playing());
        // Escape puts it back, and the rest of that press cannot lift it again.
        QTest::keyClick(view.get(), Qt::Key_Escape);
        QTest::mouseMove(view.get(), to - QPoint(8, 0)); QCoreApplication::processEvents();
        QTest::mouseMove(view.get(), to); QCoreApplication::processEvents();
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, to);
        QCOMPARE(doc(), before); QCOMPARE(model.undoStack()->count(), 0);
        // The range is captured when the lift starts. The panel may have laid out again since the first press.
        const QPoint grip = center(source);
        QTest::mouseMove(view.get(), grip); QCoreApplication::processEvents();
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, grip);
        for (int i = 1; i <= 6; ++i) { QTest::mouseMove(view.get(), grip + (to - grip) * i / 6); QCoreApplication::processEvents(); }
        QVERIFY2(item("assetLaneDropArea")->property("containsDrag").toBool(),
                 qPrintable(QString("no lift: first press at (%1,%2), second at (%3,%4)").arg(from.x()).arg(from.y()).arg(grip.x()).arg(grip.y())));
        state->markIn(2000);
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, to);
        QTRY_VERIFY2(model.undoStack()->count() == 1, qPrintable(QString("undo entries %1, last error \"%2\", warning \"%3\", from (%4,%5) to (%6,%7)")
            .arg(model.undoStack()->count()).arg(state->lastError(), item("assetDropOverlay")->property("warning").toString())
            .arg(from.x()).arg(from.y()).arg(to.x()).arg(to.y())));
        const auto placed = doc().value("clips").toArray();
        QCOMPARE(gestures()->selection().size(), clips);
        QCOMPARE(placed.size(), beforeClips + clips);
        const auto first = clip(gestures()->selection().first());
        QCOMPARE(first.value("inPointMs").toDouble(), 1000.0);
        QCOMPARE(first.value("trackId").toString(), QString("v"));
        if (clips == 2) {
            QVERIFY(!first.value("linkId").toString().isEmpty());
            QCOMPARE(clip(gestures()->selection().last()).value("linkId"), first.value("linkId"));
            QCOMPARE(clip(gestures()->selection().last()).value("trackId").toString(), QString("a"));
        }
        model.undoStack()->undo(); QCOMPARE(doc(), before);
    }
    void dropOnALockedTrackReportsAndPlacesNothing() {
        state->setMediaBrowser(nullptr);
        state->monitor()->openLocal(asset.toVariantMap(), QStringLiteral(NT_FIXTURES_DIR "/media/flash-beep-720p30.mov"), {});
        QTRY_VERIFY_WITH_TIMEOUT(state->monitor()->ready() && !state->monitor()->busy(), 10000);
        auto raw = doc(); auto tracks = raw.value("tracks").toArray();
        auto a = tracks[2].toObject(); a.insert("locked", true); tracks[2] = a; raw.insert("tracks", tracks);
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson()); QVERIFY(parsed.timeline); model.setTimeline(*parsed.timeline);
        const auto before = doc();
        auto* source = item("sourceDragBoth");
        auto* lane = item("trackLane-v"); QVERIFY(lane);
        const QPoint from = center(source);
        const QPoint to = item("assetLaneDropArea")->mapToScene({item("assetLaneDropArea")->width() - 8, lane->height() / 2}).toPoint();
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, from);
        for (int i = 1; i <= 6; ++i) { QTest::mouseMove(view.get(), from + (to - from) * i / 6); QCoreApplication::processEvents(); }
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, to);
        QCOMPARE(doc(), before); QCOMPARE(model.undoStack()->count(), 0);
        QVERIFY(state->lastError().contains("locked"));
        QTRY_VERIFY(item("sourceError")->isVisible());
    }
    void keysActOnSourceWhenFocused_data() {
        QTest::addColumn<QString>("preset");
        for (const auto* preset : {"nodetool", "premiere", "fcp"}) { QTest::newRow(preset) << QString(preset); }
    }
    void keysActOnSourceWhenFocused() {
        QFETCH(QString, preset);
        gestures()->setKeyboardPreset(preset);
        auto* monitor = state->monitor();
        monitor->openLocal(asset.toVariantMap(), QStringLiteral(NT_FIXTURES_DIR "/media/numbered-a-1080p30.mp4"), {});
        QTRY_VERIFY_WITH_TIMEOUT(monitor->ready() && !monitor->busy(), 10000);
        auto* source = monitor->clock();
        item("sourceViewer")->forceActiveFocus();
        clock.seek(100);
        const double programTime = clock.time();

        QTest::keyClick(view.get(), Qt::Key_Space);
        QVERIFY(source->playing()); QVERIFY(!clock.playing()); QCOMPARE(source->rate(), 1.0);
        QTest::keyClick(view.get(), Qt::Key_Space); QVERIFY(!source->playing());
        QTest::keyClick(view.get(), Qt::Key_L); QVERIFY(source->playing()); QCOMPARE(source->rate(), 1.0);
        QTest::keyClick(view.get(), Qt::Key_L); QCOMPARE(source->rate(), 2.0); QVERIFY(!monitor->audible());
        QTest::keyClick(view.get(), Qt::Key_K); QVERIFY(!source->playing()); QCOMPARE(source->rate(), 1.0);
        monitor->seek(2000);
        QTest::keyClick(view.get(), Qt::Key_J); QVERIFY(source->playing()); QCOMPARE(source->rate(), -1.0);
        QTest::keyClick(view.get(), Qt::Key_K);

        monitor->seek(2000);
        QTest::keyClick(view.get(), Qt::Key_Right);
        QVERIFY(std::abs(source->time() - 61000.0 / 30) < 1e-6);
        QTest::keyClick(view.get(), Qt::Key_Left);
        QCOMPARE(source->time(), 2000.0);
        QTest::keyClick(view.get(), Qt::Key_Right, Qt::ShiftModifier);
        QVERIFY(std::abs(source->time() - 65000.0 / 30) < 1e-6);
        QTest::keyClick(view.get(), Qt::Key_Left, Qt::ShiftModifier);
        QCOMPARE(source->time(), 2000.0);

        QTest::keyClick(view.get(), Qt::Key_I);
        QCOMPARE(state->inMs(), 2000.0);
        monitor->seek(3000);
        QTest::keyClick(view.get(), Qt::Key_O);
        QVERIFY(std::abs(state->outMs() - 91000.0 / 30) < 1e-6);

        QCOMPARE(clock.time(), programTime); QVERIFY(!clock.playing());
        QCOMPARE(model.undoStack()->count(), 0);

        // An edit key is not a Source key, so it still reaches the editor.
        state->setMediaBrowser(nullptr);
        QTest::keySequence(view.get(), QKeySequence(state->shortcut("overwrite", preset)));
        QTRY_COMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo();

        // With the timeline focused, the same keys drive Program.
        click("timeRuler");
        QVERIFY(!item("sourceViewer")->property("sourceFocused").toBool());
        QTest::keyClick(view.get(), Qt::Key_L);
        QVERIFY(clock.playing()); QVERIFY(!source->playing());
        QTest::keyClick(view.get(), Qt::Key_K);
        QVERIFY(!clock.playing());
    }
    void transportStopsTheOtherMonitor() {
        auto* monitor = state->monitor();
        monitor->openLocal(asset.toVariantMap(), QStringLiteral(NT_FIXTURES_DIR "/media/numbered-a-1080p30.mp4"), {});
        QTRY_VERIFY_WITH_TIMEOUT(monitor->ready() && !monitor->busy(), 10000);
        QTRY_COMPARE(monitor->programClock(), &clock);
        clock.play();
        click("sourcePlay");
        QVERIFY(monitor->clock()->playing()); QVERIFY(!clock.playing());
        clock.play();
        QVERIFY(!monitor->clock()->playing()); QVERIFY(clock.playing());
        clock.pause();
        click("sourcePlay"); QVERIFY(monitor->clock()->playing());
        // A hidden monitor does not play.
        item("sourceViewer")->setVisible(false);
        QVERIFY(!monitor->clock()->playing());
        item("sourceViewer")->setVisible(true);
    }
    void audioOnlyWaveformMovesThePlayhead() {
        auto sound = asset; sound.insert("id", "sound"); sound.insert("content_type", "audio/wav"); sound.remove("duration");
        state->setAsset(sound.toVariantMap());
        auto* monitor = state->monitor();
        monitor->openLocal(sound.toVariantMap(), QStringLiteral(NT_FIXTURES_DIR "/media/clicks-48k.wav"), QStringLiteral(NT_FIXTURES_DIR "/media/clicks-48k.wav"));
        QTRY_VERIFY_WITH_TIMEOUT(monitor->ready() && !monitor->busy(), 10000);
        auto* wave = item("sourceWaveform"); QVERIFY(wave); QVERIFY(wave->isVisible());
        QTRY_VERIFY_WITH_TIMEOUT(wave->property("loaded").toBool(), 10000);
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, wave->mapToScene({wave->width() / 2, wave->height() / 2}).toPoint());
        QVERIFY(std::abs(monitor->clock()->time() - monitor->durationMs() / 2) < monitor->durationMs() / 50);
        QVERIFY(item("sourceMarkIn")->isVisible());
        QVERIFY(!item("sourceDragBoth")->isEnabled()); QVERIFY(!item("sourceDragVideo")->isEnabled());
        QVERIFY(item("sourceDragAudio")->isEnabled());
        // A horizontal drag scrubs, a vertical one lifts the sound.
        const auto y = wave->height() / 2;
        const auto from = wave->mapToScene({wave->width() * 0.25, y}).toPoint();
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, from);
        QTest::mouseMove(view.get(), from + QPoint(wave->width() / 8, 0));
        QTest::mouseMove(view.get(), from + QPoint(wave->width() / 4, 0));
        QVERIFY(std::abs(monitor->clock()->time() - monitor->durationMs() / 2) < monitor->durationMs() / 50);
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, from + QPoint(wave->width() / 4, 0));
        QCOMPARE(model.undoStack()->count(), 0);
        // Escape puts the playhead back and ends the scrub.
        monitor->seek(1000);
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, from);
        QTest::mouseMove(view.get(), from + QPoint(wave->width() / 8, 0));
        QVERIFY(monitor->clock()->time() > 2000);
        QTest::keyClick(view.get(), Qt::Key_Escape);
        QCOMPARE(monitor->clock()->time(), 1000.0);
        QTest::mouseMove(view.get(), from + QPoint(wave->width() / 4, 0));
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, from + QPoint(wave->width() / 4, 0));
        QCOMPARE(monitor->clock()->time(), 1000.0);
    }
    void mediaResolutionBrowserSurvivesHiddenLibrary() {
        QTRY_VERIFY(state->mediaBrowser());
        auto* browser = state->mediaBrowser();
        QCOMPARE(browser->timeline(), &model);
        auto* library = item("assetExplorer");
        QVERIFY(library);
        library->setVisible(false);
        QVERIFY(QMetaObject::invokeMethod(item("sourceViewer"), "attach"));
        QCoreApplication::processEvents();
        QCOMPARE(state->mediaBrowser(), browser);
    }
    void marking() {
        const auto before = doc();
        QSignalSpy modelChanges(&model, &TimelineModel::clipsChanged);
        QSignalSpy trackChanges(model.tracks(), &QAbstractItemModel::modelReset);
        auto* lane = item("trackLane-v"); QVERIFY(lane);
        auto* laneModel = lane->property("clipModel").value<QObject*>(); QVERIFY(laneModel);
        QSignalSpy laneChanges(laneModel, SIGNAL(recomputed()));
        auto* delegate = item("clip-c"); QVERIFY(delegate);
        QVERIFY(item("sourceMarkIn"));
        scrub(0.25); click("sourceMarkIn");
        QCOMPARE(state->inMs(), item("sourceViewer")->property("playerTimeMs").toDouble());
        QVERIFY(state->inMs() > 1000);
        scrub(0.75); click("sourceMarkOut");
        QCOMPARE(state->outMs(), item("sourceViewer")->property("playerTimeMs").toDouble());
        QVERIFY(state->outMs() > 6000);
        scrub(0.3); item("sourceViewer")->forceActiveFocus(); QTest::keyClick(view.get(), Qt::Key_I);
        QCOMPARE(state->inMs(), item("sourceViewer")->property("playerTimeMs").toDouble());
        scrub(0.6); item("sourceViewer")->forceActiveFocus(); QTest::keyClick(view.get(), Qt::Key_O);
        QCOMPARE(state->outMs(), item("sourceViewer")->property("playerTimeMs").toDouble());
        const auto marks = state->sourceRange();
        for (const auto modifier : {Qt::ShiftModifier, Qt::ControlModifier, Qt::AltModifier, Qt::MetaModifier}) {
            QTest::keyClick(view.get(), Qt::Key_I, modifier);
            QTest::keyClick(view.get(), Qt::Key_O, modifier);
            QCOMPARE(state->sourceRange(), marks);
        }
        // Ctrl+O opens the modal timeline list and takes focus from the source viewer.
        auto* actions = item("TimelineDocumentActions");
        QVERIFY(actions);
        auto* popup = actions->findChild<QObject*>("timelineListPopup");
        QVERIFY(popup);
        QTRY_VERIFY(popup->property("visible").toBool());
        QTest::keyClick(view.get(), Qt::Key_Escape);
        QTRY_VERIFY(!popup->property("visible").toBool());
        type("sourceIn", "1.25"); type("sourceOut", "4.50");
        QCOMPARE(state->inMs(), 1250.0); QCOMPARE(state->outMs(), 4500.0);
        type("sourceIn", "9.00"); QCOMPARE(state->inMs(), 4500.0);
        type("sourceOut", "99.00"); QCOMPARE(state->outMs(), 10000.0);
        state->setIn("bad"); state->setOut("-1");
        QCOMPARE(state->inMs(), 4500.0); QCOMPARE(state->outMs(), 10000.0);
        state->setAsset(asset.toVariantMap()); QCOMPARE(state->inMs(), 4500.0);
        auto other = asset; other.insert("id", "another"); state->setAsset(other.toVariantMap());
        QCOMPARE(state->inMs(), 0.0); QCOMPARE(state->outMs(), 10000.0);
        QCOMPARE(doc(), before); QCOMPARE(model.undoStack()->count(), 0);
        QCOMPARE(modelChanges.count(), 0); QCOMPARE(trackChanges.count(), 0);
        QCOMPARE(laneChanges.count(), 0); QCOMPARE(item("clip-c"), delegate);
    }
    void mediaAndEmptyState() {
        const auto before = doc();
        state->setAsset({});
        QTRY_VERIFY(item("sourceEmptyState")->isVisible());
        QVERIFY(item("sourceViewer")->isVisible());
        QVERIFY(!item("sourceStage")->isVisible());
        QVERIFY(!item("sourceAppend")->isVisible());
        QCOMPARE(item("sourceEmptyState")->property("text").toString(),
                 QString("Select an asset in the library to view it here"));
        for (const auto& type : {"audio/wav", "image/png", "text/plain"}) {
            auto next = asset;
            next.insert("content_type", type);
            state->setAsset(next.toVariantMap());
            QTRY_VERIFY(!item("sourceEmptyState")->isVisible());
            QVERIFY(!item("sourceMarkIn")->isVisible());
            QVERIFY(!item("sourceMarkOut")->isVisible());
            QCOMPARE(item("sourceScrub")->isVisible(), QString(type) == "audio/wav");
            QCOMPARE(item("sourcePoster")->isVisible(), QString(type) == "image/png");
            item("sourceViewer")->setProperty("playerTimeMs", 3000);
            item("sourceViewer")->forceActiveFocus();
            const auto marks = state->sourceRange();
            QTest::keyClick(view.get(), Qt::Key_I);
            QTest::keyClick(view.get(), Qt::Key_O);
            QCOMPARE(state->sourceRange(), marks);
            for (const auto& name : {"sourceAppend", "sourceInsert", "sourceOverwrite"}) {
                QCOMPARE(item(name)->isEnabled(), QString(type) != "text/plain");
            }
        }
        QCOMPARE(doc(), before);
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void edits_data() {
        QTest::addColumn<QString>("kind"); QTest::addColumn<QString>("preset"); QTest::addColumn<bool>("keyboard");
        for (const auto& kind : {"append", "insert", "overwrite"}) {
            QTest::newRow(qPrintable(QString(kind) + "-pointer")) << QString(kind) << QString("nodetool") << false;
            for (const auto& preset : {"nodetool", "premiere", "fcp"}) {
                QTest::newRow(qPrintable(QString(kind) + "-" + preset)) << QString(kind) << QString(preset) << true;
            }
        }
    }
    void edits() {
        QFETCH(QString, kind); QFETCH(QString, preset); QFETCH(bool, keyboard);
        state->markIn(1000); state->markOut(3000);
        nt::targeting::TrackTargeting::current().setTrackTargeted("v", false);
        nt::targeting::TrackTargeting::current().setTrackSyncLocked("a", false);
        clock.seek(1500);
        const auto before = doc();
        const auto expected = nt::sourceedit::performSourceEdit(kind, before, nt::targeting::TrackTargeting::current().state(),
            QJsonObject::fromVariantMap(state->sourceRange()), clock.time(), asset);
        QVERIFY(expected);
        gestures()->setKeyboardPreset(preset);
        if (keyboard) {
            click("timeRuler"); clock.seek(1500);
            const auto key = state->shortcut(kind, preset);
            QVERIFY(!key.isEmpty());
            QTest::keySequence(view.get(), QKeySequence(key));
        } else { click("source" + kind.first(1).toUpper() + kind.sliced(1)); }
        QTRY_COMPARE(model.undoStack()->count(), 1);
        QCOMPARE(normalize(doc(), before), normalize(expected->doc, before));
        QCOMPARE(gestures()->selection().size(), 1);
        const auto selectedId = gestures()->selection().first();
        QVERIFY(!clip(selectedId).isEmpty());
        for (const auto& old : before.value("clips").toArray()) {
            QVERIFY(old.toObject().value("id").toString() != selectedId);
        }
        const auto selected = clip(selectedId);
        QCOMPARE(selected.value("currentAssetId").toString(), QString("source"));
        QCOMPARE(selected.value("inPointMs").toDouble(), 1000.0);
        model.undoStack()->undo(); QCOMPARE(doc(), before);
        model.undoStack()->redo(); QCOMPARE(normalize(doc(), before), normalize(expected->doc, before));
    }
    void libraryDiscovery() {
        state->setAsset({});
        QQmlComponent component(view->engine());
        component.setData(R"(import QtQuick
Item {
    objectName: "assetExplorer"
    Item {
        objectName: "testLibraryGrid"
        property string selectedId: "from-library"
        property QtObject browser: QtObject {
            property var assets: [{id:"from-library", name:"Library take", content_type:"video/mp4", duration:8}]
        }
    }
})", QUrl("qrc:/SourceLibrary.qml"));
        std::unique_ptr<QObject> tree(component.create());
        QVERIFY2(tree, qPrintable(component.errorString()));
        auto* visual = qobject_cast<QQuickItem*>(tree.get()); QVERIFY(visual);
        visual->setParentItem(view->rootObject());
        tree->setParent(view->rootObject()); tree.release();
        QVERIFY(QMetaObject::invokeMethod(item("sourceViewer"), "attach"));
        QTRY_COMPARE(state->asset().value("id").toString(), QString("from-library"));
        QVERIFY(!item("sourceEmptyState")->isVisible());
        auto* grid = item("testLibraryGrid"); QVERIFY(grid);
        state->markIn(2000);
        grid->setProperty("selectedId", "");
        QTRY_VERIFY(item("sourceEmptyState")->isVisible());
        grid->setProperty("selectedId", "from-library");
        QTRY_VERIFY(!item("sourceEmptyState")->isVisible());
        QCOMPARE(state->inMs(), 2000.0);
        auto fields = asset.toVariantMap(); fields.insert("content_type", "text/plain");
        state->setAsset(fields); QCoreApplication::processEvents();
        QVERIFY(!item("sourceAppend")->isEnabled());
    }
};
QTEST_MAIN(TestSourceViewer)
#include "tst_sourceviewer.moc"
