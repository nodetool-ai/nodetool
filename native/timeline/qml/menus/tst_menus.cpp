#include "wiring/WiringFixture.h"
#include "app/MenuRegistry.h"

class TestMenus : public WiringFixture {
    Q_OBJECT
    QPointer<QObject> activeMenu;
    void patch(const QString& id, const QJsonObject& fields) {
        auto clips = model.clipsJson();
        for (qsizetype i = 0; i < clips.size(); ++i) {
            auto c = clips[i].toObject();
            if (c.value("id") != id) { continue; }
            for (auto it = fields.begin(); it != fields.end(); ++it) { c.insert(it.key(), it.value()); }
            clips[i] = c;
        }
        model.replaceClips(clips);
        QCoreApplication::processEvents();
    }
    QObject* popup(const QString& kind, const QString& target, double x = -1) {
        auto* surface = item(target);
        if (!surface) { return nullptr; }
        QTest::mouseClick(view.get(), Qt::RightButton, Qt::NoModifier,
            surface->mapToScene({x < 0 ? surface->width() / 2 : x, surface->height() / 2}).toPoint());
        QCoreApplication::processEvents();
        activeMenu = surface->findChild<QObject*>(kind == "track" ? "trackHeaderMenu" : "registryContextMenu-" + kind);
        return activeMenu;
    }
    QStringList entries(QObject* menu) {
        QStringList result;
        if (!menu) { return result; }
        for (int i = 0; i < menu->property("count").toInt(); ++i) {
            QQuickItem* entry = nullptr;
            if (!QMetaObject::invokeMethod(menu, "itemAt", Q_RETURN_ARG(QQuickItem*, entry), Q_ARG(int, i)) || !entry) { continue; }
            result.append(entry->objectName() + ":" + entry->property("text").toString());
        }
        return result;
    }
    void trigger(const QString& name) {
        QTRY_VERIFY(activeMenu && activeMenu->property("opened").toBool());
        QSignalSpy frame(view.get(), &QQuickWindow::frameSwapped);
        view->update();
        QVERIFY(!frame.isEmpty() || frame.wait(1000));
        auto* entry = item(name);
        QVERIFY2(entry, qPrintable("Missing menu item " + name));
        QVERIFY2(entry->isVisible(), qPrintable("Hidden menu item " + name));
        QSignalSpy triggered(entry, SIGNAL(triggered()));
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(entry));
        QCoreApplication::processEvents();
        if (name.startsWith("laneMenu-") || name.startsWith("registryMenu-lane-")) { QCOMPARE(triggered.count(), 1); }
    }
    void restore(const QJsonObject& raw) {
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        QCoreApplication::processEvents();
    }
private slots:
    void init() {
        open();
        gestures()->setKeyboardPreset("nodetool");
        patch("c", {{"mediaType", "video"}});
    }
    void cleanup() { view.reset(); nt::edit::setIdGenerator({}); }
    void shortcutSheetListsOnlyShortcuts_data() {
        QTest::addColumn<QString>("action");
        QTest::addColumn<QString>("groupTitle");
        for (const auto* action : {"toggleClipLock", "removeFades", "removeTransition", "closeGapAt", "addText"}) {
            QTest::newRow(action) << QString(action) << QString{};
        }
        for (const auto* action : {"splitAtPlayhead", "duplicate", "deleteSelected", "applyDefaultTransition",
                                   "applyFades", "toggleClipEnabled", "linkClips", "speedDuration"}) {
            QTest::newRow(action) << QString(action) << QString("Editing");
        }
    }
    void shortcutSheetListsOnlyShortcuts() {
        QFETCH(QString, action);
        QFETCH(QString, groupTitle);
        int matches = 0;
        const auto groups = gestures()->shortcutSheet().value("groups").toList();
        for (const auto& group : groups) {
            const auto data = group.toMap();
            for (const auto& row : data.value("rows").toList()) {
                const auto entry = row.toMap();
                if (entry.value("id").toString() != action) { continue; }
                ++matches;
                QCOMPARE(data.value("title").toString(), groupTitle);
                QVERIFY(entry.value("available").toBool());
                QVERIFY(!gestures()->shortcutFor(action).isEmpty());
            }
        }
        QCOMPARE(matches, groupTitle.isEmpty() ? 0 : 1);
    }
    void clipList_data() {
        QTest::addColumn<QJsonObject>("fields");
        QTest::addColumn<QStringList>("middle");
        QTest::newRow("plain-video") << QJsonObject{} << QStringList{"applyDefaultTransition:Cross-fade in", "applyFades:Fade in and out", "toggleClipLock:Lock", "toggleClipEnabled:Disable"};
        QTest::newRow("locked") << QJsonObject{{"locked", true}} << QStringList{"applyDefaultTransition:Cross-fade in", "applyFades:Fade in and out", "toggleClipLock:Unlock"};
        QTest::newRow("disabled") << QJsonObject{{"hidden", true}} << QStringList{"applyDefaultTransition:Cross-fade in", "applyFades:Fade in and out", "toggleClipLock:Lock", "toggleClipEnabled:Enable"};
        QTest::newRow("transition") << QJsonObject{{"transitionIn", QJsonObject{{"type", "wipe"}, {"durationMs", 300}}}} << QStringList{"removeTransition:Remove transition", "applyFades:Fade in and out", "toggleClipLock:Lock", "toggleClipEnabled:Disable"};
        QTest::newRow("audio-fades") << QJsonObject{{"mediaType", "audio"}, {"fadeInMs", 100}, {"fadeOutMs", 200}} << QStringList{"applyDefaultTransition:Cross-fade in", "removeFades:Remove fades", "toggleClipLock:Lock", "toggleClipEnabled:Disable"};
        QTest::newRow("linked") << QJsonObject{{"linkId", "pair"}} << QStringList{"applyDefaultTransition:Cross-fade in", "applyFades:Fade in and out", "toggleClipLock:Lock", "toggleClipEnabled:Disable", "linkClips:Unlink"};
        QTest::newRow("image-no-fades") << QJsonObject{{"mediaType", "image"}} << QStringList{"applyDefaultTransition:Cross-fade in", "toggleClipLock:Lock", "toggleClipEnabled:Disable"};
    }
    void clipList() {
        QFETCH(QJsonObject, fields); QFETCH(QStringList, middle);
        patch("c", fields);
        auto* menu = popup("clip", "clip-c"); QVERIFY(menu);
        QStringList expected{"clipMenu-splitAtPlayhead:Split at playhead", "clipMenu-duplicate:Duplicate"};
        for (const auto& value : middle) { expected.append("clipMenu-" + value); }
        expected.append({"registryMenu-clip-speedDuration:Speed / Duration…", "clipMenu-deleteDivider:", "clipMenu-deleteSelected:Delete"});
        QCOMPARE(entries(menu), expected);
    }
    void shortcutParity_data() {
        QTest::addColumn<QString>("action"); QTest::addColumn<int>("key"); QTest::addColumn<int>("mods");
        QTest::newRow("split") << QString("splitAtPlayhead") << int(Qt::Key_S) << int(Qt::NoModifier);
        QTest::newRow("duplicate") << QString("duplicate") << int(Qt::Key_D) << int(Qt::ControlModifier);
        QTest::newRow("transition") << QString("applyDefaultTransition") << int(Qt::Key_T) << int(Qt::ControlModifier);
        QTest::newRow("fades") << QString("applyFades") << int(Qt::Key_T) << int(Qt::AltModifier);
        QTest::newRow("enable") << QString("toggleClipEnabled") << int(Qt::Key_E) << int(Qt::ControlModifier | Qt::ShiftModifier);
        QTest::newRow("unlink") << QString("linkClips") << int(Qt::Key_L) << int(Qt::ControlModifier);
        QTest::newRow("delete") << QString("deleteSelected") << int(Qt::Key_Delete) << int(Qt::NoModifier);
    }
    void shortcutParity() {
        QFETCH(QString, action); QFETCH(int, key); QFETCH(int, mods);
        if (action == "linkClips") { patch("c", {{"linkId", "pair"}}); patch("s", {{"linkId", "pair"}}); }
        const auto before = doc();
        nt::edit::setIdGenerator([n = 0]() mutable { return QString("%1").arg(++n, 32, 16, QChar('0')); });
        popup("clip", "clip-c");
        trigger("clipMenu-" + action);
        const auto menuResult = doc();
        QVERIFY(menuResult != before); QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo(); QCOMPARE(doc(), before);
        restore(before);
        nt::edit::setIdGenerator([n = 0]() mutable { return QString("%1").arg(++n, 32, 16, QChar('0')); });
        click("timeRuler"); clock.seek(1500);
        gestures()->setSelection({"c"});
        view->rootObject()->forceActiveFocus();
        QVERIFY(view->rootObject()->hasActiveFocus());
        QTest::keyClick(view.get(), static_cast<Qt::Key>(key), Qt::KeyboardModifiers(mods));
        QCOMPARE(doc(), menuResult); QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo(); QCOMPARE(doc(), before);
    }
    void clickedClipScope_data() { shortcutParity_data(); }
    void clickedClipScope() {
        QFETCH(QString, action);
        if (action == "linkClips") { patch("c", {{"linkId", "pair"}}); patch("s", {{"linkId", "pair"}}); }
        const auto other = clip("e");
        gestures()->setSelection({"c", "e"});
        popup("clip", "clip-c"); trigger("clipMenu-" + action);
        QCOMPARE(clip("e"), other); QCOMPARE(model.undoStack()->count(), 1);
    }
    void splitOutside() {
        clock.seek(4500); const auto before = doc();
        popup("clip", "clip-c"); trigger("clipMenu-splitAtPlayhead");
        QCOMPARE(doc(), before); QCOMPARE(model.undoStack()->count(), 0);
    }
    void shortcutResults() {
        const auto before = doc();
        gestures()->setSelection({"c"});
        QVERIFY(gestures()->runAction("applyDefaultTransition"));
        QCOMPARE(clip("c").value("transitionIn").toObject(), QJsonObject({{"type", "crossfade"}, {"durationMs", 500}}));
        model.undoStack()->undo(); QCOMPARE(doc(), before);
        QVERIFY(gestures()->runAction("applyFades"));
        QCOMPARE(clip("c").value("fadeInMs").toDouble(), 500.0);
        QCOMPARE(clip("c").value("fadeOutMs").toDouble(), 500.0);
        model.undoStack()->undo(); QCOMPARE(doc(), before);
        QVERIFY(gestures()->runAction("toggleClipEnabled"));
        QCOMPARE(clip("c").value("hidden").toBool(), true);
        QCOMPARE(clip("c").value("muted").toBool(), true);
        model.undoStack()->undo(); QCOMPARE(doc(), before);
        patch("s", {{"durationMs", 301}});
        gestures()->setSelection({"s"}); QVERIFY(gestures()->runAction("applyFades"));
        QCOMPARE(clip("s").value("fadeInMs").toDouble(), 150.0);
        model.undoStack()->undo();
        QVERIFY(gestures()->runAction("toggleClipEnabled"));
        QVERIFY(clip("s").value("muted").toBool()); QVERIFY(!clip("s").contains("hidden"));
    }
    void transitionGrowsPredecessor() {
        patch("d", {{"startMs", 3000}, {"durationMs", 200}});
        const auto before = doc();
        gestures()->setSelection({"d"});
        QVERIFY(gestures()->runAction("applyDefaultTransition"));
        QCOMPARE(clip("c").value("durationMs").toDouble(), 2200.0);
        QCOMPARE(clip("d").value("transitionIn").toObject(), QJsonObject({{"type", "crossfade"}, {"durationMs", 200}}));
        QCOMPARE(model.undoStack()->count(), 1); model.undoStack()->undo(); QCOMPARE(doc(), before);
    }
    void linkAndUnlink() {
        const auto before = doc();
        gestures()->setSelection({"c", "e"});
        click("timeRuler"); QTest::keyClick(view.get(), Qt::Key_L, Qt::ControlModifier);
        const auto link = clip("c").value("linkId").toString(); QVERIFY(!link.isEmpty());
        QCOMPARE(clip("e").value("linkId").toString(), link);
        QCOMPARE(model.undoStack()->count(), 1); model.undoStack()->undo(); QCOMPARE(doc(), before);
        model.undoStack()->redo();
        popup("clip", "clip-c"); trigger("clipMenu-linkClips");
        QVERIFY(!clip("c").contains("linkId")); QVERIFY(!clip("e").contains("linkId"));
        QCOMPARE(model.undoStack()->count(), 2);
    }
    void speedDialogParity() {
        const auto before = doc();
        popup("clip", "clip-c"); trigger("registryMenu-clip-speedDuration");
        auto* host = item("speedDurationHost"); QVERIFY(host);
        auto* dialog = host->findChild<QObject*>("speedDurationDialog"); QVERIFY(dialog);
        QTRY_VERIFY(dialog->property("visible").toBool());
        QCOMPARE(dialog->property("editingIds").toStringList(), QStringList{"c"});
        QVERIFY(QMetaObject::invokeMethod(dialog, "close"));
        click("timeRuler"); gestures()->setSelection({"c"});
        QTest::keyClick(view.get(), Qt::Key_R, Qt::ControlModifier);
        QTRY_VERIFY(dialog->property("visible").toBool());
        QCOMPARE(dialog->property("editingIds").toStringList(), QStringList{"c"});
        QCOMPARE(doc(), before); QCOMPARE(model.undoStack()->count(), 0);
    }
    void registeredClipExtension() {
        patch("c", {{"mediaType", "image"}});
        view->resize(1800, 1500);
        QTRY_COMPARE(view->rootObject()->size(), QSizeF(view->size()));
        restore(doc());
        gestures()->setSelection({});
        view->requestActivate();
        QVERIFY(QTest::qWaitForWindowActive(view.get()));
        view->rootObject()->forceActiveFocus();
        click("timeRuler");
        QTest::keyClick(view.get(), Qt::Key_R, Qt::ControlModifier);
        click("clip-c");
        QTest::keyClick(view.get(), Qt::Key_R, Qt::ControlModifier);
        auto* host = item("speedDurationHost"); QVERIFY(host);
        auto* dialog = host->findChild<QObject*>("speedDurationDialog"); QVERIFY(dialog);
        QTRY_VERIFY(dialog->property("visible").toBool());
        QTest::keyClick(view.get(), Qt::Key_Escape);
        QVERIFY(!dialog->property("visible").toBool());
        // Click immediately after popup, as the production wiring harness does.
        QTest::mouseClick(view.get(), Qt::RightButton, Qt::NoModifier, center(item("clip-c")));
        auto* entry = item("registryMenu-clip-speedDuration"); QVERIFY(entry);
        QSignalSpy triggered(entry, SIGNAL(triggered()));
        click("registryMenu-clip-speedDuration");
        QCOMPARE(triggered.count(), 1);
        QTRY_VERIFY(dialog->property("visible").toBool());
        QCOMPARE(dialog->property("editingIds").toStringList(), QStringList{"c"});
    }
    void noShortcutEdits_data() {
        QTest::addColumn<QString>("action");
        QTest::newRow("lock") << QString("toggleClipLock");
        QTest::newRow("remove-fades") << QString("removeFades");
        QTest::newRow("remove-transition") << QString("removeTransition");
    }
    void noShortcutEdits() {
        QFETCH(QString, action);
        patch("c", {{"fadeInMs", 100}, {"fadeOutMs", 200}, {"transitionIn", QJsonObject{{"type", "crossfade"}, {"durationMs", 200}}}});
        const auto before = doc(); auto expected = clip("c");
        if (action == "toggleClipLock") { expected.insert("locked", true); }
        if (action == "removeFades") { expected.insert("fadeInMs", 0); expected.insert("fadeOutMs", 0); }
        if (action == "removeTransition") { expected.remove("transitionIn"); }
        popup("clip", "clip-c"); trigger("clipMenu-" + action);
        QCOMPARE(clip("c"), expected); QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo(); QCOMPARE(doc(), before);
    }
    void laneList_data() {
        QTest::addColumn<QString>("type"); QTest::addColumn<double>("at"); QTest::addColumn<QStringList>("expected");
        QTest::newRow("video-gap") << QString("video") << 4000.0 << QStringList{"laneMenu-addText:Add text", "laneMenu-closeGap:Close gap"};
        QTest::newRow("video-after-end") << QString("video") << 7000.0 << QStringList{"laneMenu-addText:Add text"};
        QTest::newRow("overlay") << QString("overlay") << 4000.0 << QStringList{"laneMenu-addText:Add text", "laneMenu-closeGap:Close gap"};
        for (const auto& type : {"audio", "subtitle", "midi", "chord"}) {
            QTest::newRow(type) << QString(type) << 4000.0 << QStringList{"laneMenu-closeGap:Close gap"};
        }
    }
    void laneList() {
        QFETCH(QString, type); QFETCH(double, at); QFETCH(QStringList, expected);
        auto raw = doc(); auto tracks = raw.value("tracks").toArray(); auto t = tracks[0].toObject();
        t.insert("type", type); tracks[0] = t; raw.insert("tracks", tracks); restore(raw);
        auto* menu = popup("lane", "trackLane-v", at / gestures()->viewState()->msPerPx()); QVERIFY(menu);
        QCOMPARE(entries(menu), expected);
    }
    void laneEdits() {
        const auto before = doc();
        popup("lane", "trackLane-v", 400); trigger("laneMenu-closeGap");
        QCOMPARE(clip("d").value("startMs").toDouble(), 3000.0);
        QCOMPARE(model.undoStack()->count(), 1); model.undoStack()->undo(); QCOMPARE(doc(), before);
        popup("lane", "trackLane-v", 400); trigger("laneMenu-addText");
        QCOMPARE(model.clipCount(), 6); QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(gestures()->selection().size(), 1);
        const auto added = clip(gestures()->selection().first());
        QCOMPARE(added, QJsonObject({{"id", added.value("id")}, {"trackId", "v"}, {"name", "Text"}, {"mediaType", "text"},
            {"sourceType", "imported"}, {"status", "generated"}, {"startMs", 4000}, {"durationMs", 3000},
            {"locked", false}, {"versions", QJsonArray{}},
            {"textStyle", QJsonObject{{"text", "Text"}, {"fontSizePx", 96}, {"color", "#FFFFFF"}}}}));
        model.undoStack()->undo(); QCOMPARE(doc(), before);
    }
    void lockedLane() {
        auto raw = doc(); auto tracks = raw.value("tracks").toArray(); auto t = tracks[0].toObject();
        t.insert("locked", true); tracks[0] = t; raw.insert("tracks", tracks); restore(raw);
        auto* menu = popup("lane", "trackLane-v", 400); QVERIFY(menu);
        QVERIFY(!menu->property("visible").toBool());
    }
    void laneExtension() {
        QVERIFY(nt::app::registerMenuItem({"lane", "selectAll", "Select all clips", "Ctrl+A", {}}));
        auto* menu = popup("lane", "trackLane-v", 400); QVERIFY(menu);
        QCOMPARE(entries(menu), QStringList({"laneMenu-addText:Add text", "laneMenu-closeGap:Close gap",
                                             "registryMenu-lane-selectAll:Select all clips"}));
        trigger("registryMenu-lane-selectAll"); QCOMPARE(gestures()->selection().size(), 5);
    }
    void largeSelection() {
        auto raw = doc(); QJsonArray clips; QStringList ids;
        for (int i = 0; i < 10000; ++i) {
            const auto id = QString::number(i);
            ids.append(id);
            clips.append(QJsonObject{{"id", id}, {"trackId", "a"}, {"mediaType", "audio"},
                {"name", "Sound"}, {"startMs", i * 1000}, {"durationMs", 1000}});
        }
        raw.insert("clips", clips);
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson()); QVERIFY(parsed.timeline);
        TimelineModel bulk; bulk.setTimeline(std::move(*parsed.timeline));
        ClipGestureController controller; controller.setTimeline(&bulk); controller.setSelection(ids);
        QVERIFY(controller.runAction("linkClips")); QCOMPARE(bulk.undoStack()->count(), 1);
        const auto link = bulk.clipsJson().first().toObject().value("linkId").toString(); QVERIFY(!link.isEmpty());
        for (const auto& value : bulk.clipsJson()) { QCOMPARE(value.toObject().value("linkId").toString(), link); }
        QVERIFY(controller.runAction("applyFades")); QCOMPARE(bulk.undoStack()->count(), 2);
        for (const auto& value : bulk.clipsJson()) { QCOMPARE(value.toObject().value("fadeInMs").toDouble(), 500.0); }
        bulk.undoStack()->undo(); bulk.undoStack()->undo(); QCOMPARE(bulk.clipsJson(), clips);
    }
    void trackLabels_data() {
        QTest::addColumn<QString>("type"); QTest::addColumn<QString>("label");
        for (const auto& type : {"video", "audio", "overlay", "midi", "subtitle", "chord"}) {
            const QString label = QString(type) == "midi" ? "MIDI" : QString(type) == "subtitle" ? "text" : QString(type) == "chord" ? "chords" : type;
            QTest::newRow(type) << QString(type) << label;
        }
    }
    void trackLabels() {
        QFETCH(QString, type); QFETCH(QString, label);
        QTest::mouseClick(view.get(), Qt::RightButton, Qt::NoModifier, center(item("trackHeader-v")));
        auto* menu = view->rootObject()->findChild<QObject*>("trackHeaderMenu"); QVERIFY(menu);
        menu->setProperty("trackType", type);
        QCOMPARE(entries(menu), QStringList({"trackMenu-rename:Rename", "trackMenu-duplicate:Duplicate track",
            "trackMenu-insertAbove:Insert " + label + " track above", "trackMenu-insertBelow:Insert " + label + " track below",
            "trackMenu-deleteDivider:", "trackMenu-remove:Delete track"}));
    }
    void rulerEmptyThenExtension() {
        auto* menu = popup("ruler", "timeRuler"); QVERIFY(menu);
        QVERIFY(!menu->property("visible").toBool());
        QVERIFY(nt::app::registerMenuItem({"ruler", "selectAll", "Select all clips", "Ctrl+A", {}}));
        menu = popup("ruler", "timeRuler"); QVERIFY(menu);
        QTRY_VERIFY(menu->property("visible").toBool());
        QCOMPARE(entries(menu), QStringList{"registryMenu-ruler-selectAll:Select all clips"});
        trigger("registryMenu-ruler-selectAll"); QCOMPARE(gestures()->selection().size(), 5);
    }
};
QTEST_MAIN(TestMenus)
#include "tst_menus.moc"
