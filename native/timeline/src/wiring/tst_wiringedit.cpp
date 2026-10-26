#include "wiring/WiringFixture.h"

class TestWiringEdit : public WiringFixture {
    Q_OBJECT
private slots:
    void init() { open(); }
    void cleanup() { view.reset(); }
    void headerToggles_data() {
        QTest::addColumn<QString>("id"); QTest::addColumn<QString>("field"); QTest::addColumn<bool>("value");
        QTest::newRow("B9-visible") << QString("v") << QString("visible") << false;
        QTest::newRow("B9-lock") << QString("v") << QString("locked") << true;
        QTest::newRow("B9-mute") << QString("a") << QString("muted") << true;
        QTest::newRow("B9-solo") << QString("a") << QString("solo") << true;
    }
    void headerToggles() {
        QFETCH(QString, id); QFETCH(QString, field); QFETCH(bool, value);
        const auto before = doc();
        click("track-" + field + "-" + id);
        QCOMPARE(track(id).value(field).toBool(), value);
        QCOMPARE(model.undoStack()->count(), 1);
        auto expected = before;
        auto tracks = before.value("tracks").toArray();
        for (int i = 0; i < tracks.size(); ++i) {
            auto t = tracks[i].toObject();
            if (t.value("id") == id) { t.insert(field, value); tracks[i] = t; }
        }
        expected.insert("tracks", tracks);
        QCOMPARE(doc(), expected);
        click("undoButton"); QCOMPARE(doc(), before);
    }
    void deleteConfirmation() {
        const auto before = doc();
        click("track-delete-v");
        QTRY_VERIFY(item("deleteTrackContent") && item("deleteTrackContent")->isVisible());
        QCOMPARE(item("deleteTrackContent")->property("text").toString(), QString("Track \"Video\" and all its clips are deleted."));
        QCOMPARE(doc(), before); QCOMPARE(model.undoStack()->count(), 0);
        click("cancelDeleteTrack"); QCOMPARE(doc(), before);
        click("track-delete-v"); click("confirmDeleteTrack");
        QCOMPARE(model.tracks()->rowCount(), 2); QCOMPARE(model.clipCount(), 3);
        QCOMPARE(model.undoStack()->count(), 1);
        click("undoButton"); QCOMPARE(doc(), before);
    }
    void reorder() {
        auto* grip = item("trackGrip-v"); QVERIFY(grip);
        auto* target = item("trackHeader-w"); QVERIFY(target);
        const auto before = doc();
        const auto from = center(grip);
        const auto to = target->mapToScene({20, target->height() - 10}).toPoint();
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, from);
        QTest::mouseMove(view.get(), to, 20);
        QTRY_VERIFY(item("trackDropLine")->isVisible());
        QCOMPARE(item("trackDropLine")->height(), 2.0);
        QCOMPARE(model.undoStack()->count(), 0);
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, to);
        QCOMPARE(doc().value("tracks").toArray()[0].toObject().value("id").toString(), QString("w"));
        QCOMPARE(model.undoStack()->count(), 1);
        click("undoButton"); QCOMPARE(doc(), before);
        grip = item("trackGrip-v"); target = item("trackHeader-a");
        drag(center(grip), center(target));
        QCOMPARE(doc(), before); QCOMPARE(model.undoStack()->count(), 1);
    }
    void resize_data() {
        QTest::addColumn<double>("zoom"); QTest::addColumn<int>("delta"); QTest::addColumn<double>("expected");
        QTest::newRow("B11-zoom") << 2.0 << 40 << 100.0;
        QTest::newRow("B11-min") << 1.0 << -70 << 48.0;
        QTest::newRow("B11-max") << 1.0 << 280 << 300.0;
    }
    void resize() {
        QFETCH(double, zoom); QFETCH(int, delta); QFETCH(double, expected);
        view->resize(1500, 1400);
        QCoreApplication::processEvents();
        gestures()->viewState()->setVerticalZoom(zoom); QCoreApplication::processEvents();
        auto* separator = item("trackResize-v"); QVERIFY(separator); QCOMPARE(separator->height(), 6.0);
        const auto before = doc(); const auto from = center(separator); const auto to = from + QPoint(0, delta);
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, from);
        QTest::mouseMove(view.get(), to, 20); QCOMPARE(model.undoStack()->count(), 0);
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, to);
        QCOMPARE(track("v").value("heightPx").toDouble(), expected); QCOMPARE(model.undoStack()->count(), 1);
        click("undoButton"); QCOMPARE(doc(), before);
    }
    void resizeKeyboard() {
        click("trackResize-v");
        QTest::keyClick(view.get(), Qt::Key_Down);
        QCOMPARE(track("v").value("heightPx").toDouble(), 88.0);
        QTRY_VERIFY(item("trackResize-v")->hasActiveFocus());
        QTest::keyClick(view.get(), Qt::Key_Up, Qt::ShiftModifier);
        QCOMPARE(track("v").value("heightPx").toDouble(), 56.0);
        QCOMPARE(model.undoStack()->count(), 2);
    }
    void targetingSplit() {
        const auto before = doc(); click("trackTarget-v");
        QVERIFY(!nt::targeting::TrackTargeting::current().isTargeted("v"));
        QVERIFY(item("trackTarget-v")->property("opacity").toDouble() < 1);
        QCOMPARE(doc(), before); QCOMPARE(model.undoStack()->count(), 0);
        click("timeRuler"); clock.seek(1500);
        QTest::keyClick(view.get(), Qt::Key_S);
        QCOMPARE(clip("c").value("durationMs").toDouble(), 2000.0);
        QVERIFY(clip("e").isEmpty()); QCOMPARE(model.clipCount(), 6); QCOMPARE(model.undoStack()->count(), 1);
        click("undoButton"); QCOMPARE(doc(), before);
        QTest::keyClick(view.get(), Qt::Key_K, Qt::ControlModifier | Qt::ShiftModifier);
        QVERIFY(clip("c").isEmpty()); QVERIFY(clip("e").isEmpty()); QCOMPARE(model.clipCount(), 7);
        QCOMPARE(model.undoStack()->count(), 1);
    }
    void rangeEdits_data() {
        QTest::addColumn<int>("key"); QTest::addColumn<double>("later"); QTest::addColumn<bool>("marks");
        QTest::newRow("B27-lift") << int(Qt::Key_Semicolon) << 5000.0 << true;
        QTest::newRow("B27-extract") << int(Qt::Key_Apostrophe) << 3000.0 << true;
        QTest::newRow("B27-trim-prev") << int(Qt::Key_BracketLeft) << 4500.0 << false;
        QTest::newRow("B27-trim-next") << int(Qt::Key_BracketRight) << 3500.0 << false;
    }
    void rangeEdits() {
        QFETCH(int, key); QFETCH(double, later); QFETCH(bool, marks);
        click("trackTarget-w"); click("trackSync-w"); click("trackTarget-a");
        const auto before = doc();
        if (marks) {
            click("timeRuler"); clock.seek(1000); QTest::keyClick(view.get(), Qt::Key_I);
            clock.seek(3000); QTest::keyClick(view.get(), Qt::Key_O);
        } else { click("timeRuler"); clock.seek(1500); }
        QTest::keyClick(view.get(), static_cast<Qt::Key>(key));
        QCOMPARE(clip("d").value("startMs").toDouble(), later);
        QCOMPARE(clip("f").value("startMs").toDouble(), 5000.0);
        QCOMPARE(clip("s").value("startMs").toDouble(), later);
        QCOMPARE(model.undoStack()->count(), 1);
        if (marks) { QCOMPARE(gestures()->viewState()->rangeInMs(), -1.0); QCOMPARE(clock.time(), 1000.0); }
        click("undoButton"); QCOMPARE(doc(), before);
    }
    void syncRippleDelete() {
        QVERIFY(item("trackSync-w"));
        click("trackSync-w");
        QCOMPARE(item("trackSync-w")->property("tone").toString(), QString("warning"));
        const auto before = doc(); click("clip-c"); QTest::keyClick(view.get(), Qt::Key_Delete, Qt::ShiftModifier);
        QCOMPARE(clip("d").value("startMs").toDouble(), 3000.0);
        QCOMPARE(clip("f").value("startMs").toDouble(), 5000.0);
        QCOMPARE(model.undoStack()->count(), 1);
        click("undoButton"); QCOMPARE(doc(), before);
    }
    void clipboard_data() {
        QTest::addColumn<QString>("operation");
        for (const auto& name : {"paste", "pasteInsert", "cut", "duplicate", "duplicateWithGap"}) {
            QTest::newRow(name) << QString(name);
        }
    }
    void clipboard() {
        QFETCH(QString, operation); const auto before = doc(); click("clip-c");
        if (operation == "duplicate" || operation == "duplicateWithGap") {
            QTest::keyClick(view.get(), Qt::Key_D, operation == "duplicate" ? Qt::ControlModifier : Qt::ControlModifier | Qt::ShiftModifier);
            QCOMPARE(model.clipCount(), 6);
            QCOMPARE(clip(gestures()->selection().value(0)).value("startMs").toDouble(), operation == "duplicate" ? 3000.0 : 4000.0);
        } else {
            QTest::keyClick(view.get(), operation == "cut" ? Qt::Key_X : Qt::Key_C, Qt::ControlModifier);
            if (operation == "cut") { QCOMPARE(model.clipCount(), 4); QVERIFY(clip("c").isEmpty()); }
            else {
                QCOMPARE(model.undoStack()->count(), 0); click("trackTarget-v"); clock.seek(5000);
                QTest::keyClick(view.get(), Qt::Key_V, operation == "paste" ? Qt::ControlModifier : Qt::ControlModifier | Qt::ShiftModifier);
                const auto pasted = clip(gestures()->selection().value(0));
                QCOMPARE(pasted.value("trackId").toString(), QString("w")); QCOMPARE(pasted.value("startMs").toDouble(), 5000.0);
                QCOMPARE(clip("f").isEmpty(), operation == "paste");
                if (operation == "pasteInsert") { QCOMPARE(clip("f").value("startMs").toDouble(), 7000.0); }
            }
        }
        QCOMPARE(model.undoStack()->count(), 1); click("undoButton"); QCOMPARE(doc(), before);
    }
    void pasteAttributes() {
        click("clip-c"); QTest::keyClick(view.get(), Qt::Key_C, Qt::ControlModifier);
        click("clip-e"); const auto before = doc();
        QTest::keyClick(view.get(), Qt::Key_V, Qt::ControlModifier | Qt::AltModifier);
        QTRY_VERIFY(item("pasteButton") && item("pasteButton")->isVisible());
        QCOMPARE(model.undoStack()->count(), 0); click("pasteButton");
        QCOMPARE(clip("e").value("opacity").toDouble(), 0.4); QCOMPARE(model.undoStack()->count(), 1);
        click("undoButton"); QCOMPARE(doc(), before);
    }
    void grouping() {
        const auto before = doc(); click("clip-c"); click("clip-e", Qt::ShiftModifier);
        QTest::keyClick(view.get(), Qt::Key_G, Qt::ControlModifier);
        QCOMPARE(model.clipCount(), 6); QCOMPARE(gestures()->selection().size(), 1);
        const auto group = gestures()->selection().first(); QCOMPARE(clip(group).value("mediaType").toString(), QString("group"));
        QTRY_VERIFY(item("groupBracket-" + group));
        QCOMPARE(item("groupBracket-" + group)->height(), 8.0);
        QCOMPARE(item("groupBracket-" + group)->width(), 200.0);
        QCOMPARE(clip("c").value("parentId").toString(), group); QCOMPARE(model.undoStack()->count(), 1);
        QTest::keyClick(view.get(), Qt::Key_G, Qt::ControlModifier | Qt::ShiftModifier);
        QCOMPARE(model.clipCount(), 5); QVERIFY(!clip("c").contains("parentId")); QVERIFY(gestures()->selection().isEmpty());
        QCOMPARE(model.undoStack()->count(), 2); QCOMPARE(doc(), before);
    }
    void altDrag_data() {
        QTest::addColumn<bool>("snap"); QTest::addColumn<bool>("cancel");
        QTest::newRow("B19-snap-on") << true << false;
        QTest::newRow("B19-snap-off") << false << false;
        QTest::newRow("B19-cancel") << true << true;
    }
    void altDrag() {
        QFETCH(bool, snap); QFETCH(bool, cancel);
        const auto before = doc();
        if (!snap) { click("snapToggle"); }
        auto* c = item("clip-c"); QVERIFY(c);
        const auto from = center(c); const auto to = from + QPoint(197, 0);
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::AltModifier, from);
        QTest::mouseMove(view.get(), to, 20);
        QCOMPARE(model.clipCount(), 6); QCOMPARE(model.undoStack()->count(), 0);
        if (cancel) {
            QTest::keyClick(view.get(), Qt::Key_Escape);
            QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::AltModifier, to);
            QCOMPARE(doc(), before); QCOMPARE(model.undoStack()->count(), 0);
            return;
        }
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::AltModifier, to);
        QCOMPARE(model.clipCount(), 6); QCOMPARE(clip("c").value("startMs").toDouble(), snap ? 3000.0 : 2970.0);
        int originals = 0;
        for (const auto& value : model.clipsJson()) { const auto c = value.toObject(); if (c.value("trackId") == "v" && c.value("startMs").toDouble() == 1000) { ++originals; } }
        QCOMPARE(originals, 1); QCOMPARE(model.undoStack()->count(), 1); click("undoButton"); QCOMPARE(doc(), before);
    }
    void marquee_data() {
        QTest::addColumn<int>("mods");
        QTest::addColumn<bool>("large");
        QTest::newRow("B26-replace") << int(Qt::NoModifier) << false;
        QTest::newRow("B26-shift") << int(Qt::ShiftModifier) << false;
        QTest::newRow("B26-command") << int(Qt::ControlModifier) << false;
        QTest::newRow("B26-large") << int(Qt::NoModifier) << true;
    }
    void marquee() {
        QFETCH(int, mods); QFETCH(bool, large);
        if (large) {
            auto fixture = doc();
            QJsonArray clips;
            for (int i = 0; i < 20000; ++i) {
                clips.append(QJsonObject{{"id", "many" + QString::number(i)}, {"trackId", i % 2 ? "w" : "v"},
                    {"name", "Still"}, {"mediaType", "image"}, {"startMs", i * 500}, {"durationMs", 100}});
            }
            fixture.insert("clips", clips);
            fixture.insert("durationMs", 10000000);
            auto parsed = nt::parseTimelineJson(QJsonDocument(fixture).toJson());
            QVERIFY(parsed.timeline);
            model.setTimeline(std::move(*parsed.timeline));
            QCoreApplication::processEvents();
        } else { click("clip-d"); }
        const auto before = doc();
        auto* lane = item("trackLane-v"); auto* other = item("trackLane-w"); QVERIFY(lane); QVERIFY(other);
        const auto from = lane->mapToScene({50, 10}).toPoint(); const auto to = other->mapToScene({250, 40}).toPoint();
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::KeyboardModifiers(mods), from);
        QTest::mouseMove(view.get(), to, 20);
        QTRY_VERIFY(item("rubberBand") && item("rubberBand")->isVisible());
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::KeyboardModifiers(mods), to);
        auto selected = gestures()->selection(); selected.sort();
        const auto expected = large ? QStringList({"many1", "many2", "many3", "many4"})
                                    : mods ? QStringList({"c", "d", "e"}) : QStringList({"c", "e"});
        QCOMPARE(selected, expected);
        QVERIFY(!item("rubberBand")->isVisible()); QCOMPARE(doc(), before); QCOMPARE(model.undoStack()->count(), 0);
    }
    void gapDelete() {
        const auto before = doc(); auto* lane = item("trackLane-v"); QVERIFY(lane);
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, lane->mapToScene({400, 40}).toPoint());
        QTRY_VERIFY(item("selectedGap-v") && item("selectedGap-v")->isVisible());
        QCOMPARE(model.undoStack()->count(), 0); QTest::keyClick(view.get(), Qt::Key_Delete);
        QCOMPARE(clip("d").value("startMs").toDouble(), 3000.0); QCOMPARE(model.undoStack()->count(), 1);
        click("undoButton"); QCOMPARE(doc(), before);
    }
};
QTEST_MAIN(TestWiringEdit)
#include "tst_wiringedit.moc"
