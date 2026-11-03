#include "wiring/WiringFixture.h"
#include "app/MenuRegistry.h"
#include "app/Menus/ShellMenus.h"
#include "edit/clipboard/ClipboardOps.h"
#include "server/FieldAudit.h"
#include "wiring/KeyActions.h"
#include <QJSValue>
#include <QQmlEngine>
#include <QTemporaryDir>
#include <algorithm>
#include <cmath>

class TestMenus : public WiringFixture {
    Q_OBJECT
    QPointer<QObject> activeMenu;
    QTemporaryDir settings;
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
        if (name.startsWith("laneMenu-") || name.startsWith("registryMenu-lane-") || name.startsWith("registryMenu-gap-")) { QCOMPARE(triggered.count(), 1); }
    }
    // The bar entries whose action no one runs. An entry with `run` runs itself.
    static QStringList unknownActions(const std::vector<nt::app::ShellMenuEntry>& entries) {
        const auto known = ClipGestureController::availableActions();
        QStringList unknown;
        for (const auto& entry : entries) {
            if (!entry.run && !known.contains(entry.action)) { unknown << entry.menu + ": " + entry.action; }
        }
        return unknown;
    }
    void restore(const QJsonObject& raw) {
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        QCoreApplication::processEvents();
    }
    // A key can run only what someone already knows about. These stay off the menus on purpose.
    static const QSet<QString>& keyOnlyCommands() {
        static const QSet<QString> commands = [] {
            // Steps made to be pressed again and again. Premiere keeps them on the keyboard too.
            QSet<QString> set{"nudgeLeft", "nudgeRight", "nudgeLeftLarge", "nudgeRightLarge", "slideLeft", "slideRight",
                              "trimEditLeft", "trimEditRight", "trimEditLeftLarge", "trimEditRightLarge",
                              "clipVolumeUp", "clipVolumeDown", "clipVolumeUpMore", "clipVolumeDownMore",
                              // What a held key changes in a pointer gesture.
                              "rollCut", "disableSnapping", "insertOnDrop", "selectEditPoint",
                              // Backs out of whatever is under way.
                              "escape",
                              // A second way to something that has a menu item: the Audio workspace, and Ripple Delete on a gap.
                              "toggleDawMode", "closeGapAt"};
            // The number keys, while the Program monitor's take grid is the way to them with a pointer.
            for (int number = 1; number <= 9; ++number) {
                set.insert(QString("takeSwitch%1").arg(number));
                set.insert(QString("takeCut%1").arg(number));
            }
            return set;
        }();
        return commands;
    }
    // The commands with no menu item, and the listed ones that have one or no longer exist.
    static QStringList commandsOffTheMenus(const QSet<QString>& commands, const QSet<QString>& inMenus, const QSet<QString>& keyOnly) {
        QStringList problems;
        for (const auto& command : commands) {
            if (!inMenus.contains(command) && !keyOnly.contains(command)) { problems << command + " is in no menu"; }
        }
        for (const auto& command : keyOnly) {
            if (inMenus.contains(command)) { problems << command + " is in a menu and listed as key only"; }
            if (!commands.contains(command)) { problems << command + " is listed as key only and does not exist"; }
        }
        problems.sort();
        return problems;
    }
    // The menu bar's labels are in title case, as Premiere's are. A context menu's are in sentence case.
    static QStringList labelsNotInTitleCase(const std::vector<nt::app::ShellMenuItem>& items) {
        static const QSet<QString> smallWords{"a", "an", "and", "as", "at", "for", "from", "in", "of", "on", "or", "the", "to", "with"};
        QStringList problems;
        for (const auto& item : items) {
            if (item.separator) { continue; }
            const auto words = item.label.split(' ', Qt::SkipEmptyParts);
            for (qsizetype i = 0; i < words.size(); ++i) {
                if (words[i].front().isLower() && (i == 0 || !smallWords.contains(words[i]))) { problems << item.label; break; }
            }
            problems << labelsNotInTitleCase(item.children);
        }
        return problems;
    }
    static QStringList itemLabels(const std::vector<nt::app::ShellMenuItem>& items) {
        QStringList labels;
        for (const auto& item : items) { labels << (item.separator ? QString("---") : item.label); }
        return labels;
    }
    std::vector<nt::app::Menu> openMenus(const QString& preset = "nodetool") {
        return nt::app::shellMenuDescription(preset, {}, {{"kind", "shell"}, {"gestures", QVariant::fromValue<QObject*>(gestures())},
                                                          {"timeline", QVariant::fromValue<QObject*>(&model)}});
    }
    static const std::vector<nt::app::ShellMenuItem>& itemsOf(const std::vector<nt::app::Menu>& menus, const QString& path) {
        static const std::vector<nt::app::ShellMenuItem> none;
        const auto parts = path.split(" > ");
        for (const auto& menu : menus) {
            if (menu.label != parts.front()) { continue; }
            const auto* items = &menu.items;
            for (qsizetype i = 1; i < parts.size(); ++i) {
                const auto found = std::find_if(items->begin(), items->end(), [&](const auto& item) { return item.label == parts[i]; });
                if (found == items->end()) { return none; }
                items = &found->children;
            }
            return *items;
        }
        return none;
    }
private slots:
    // The items below change panels and workspaces, which the editor saves. They must
    // not reach the settings of the person running the test.
    void initTestCase() {
        QVERIFY(settings.isValid());
        qputenv("NODETOOL_TIMELINE_PREFERENCES", QFile::encodeName(settings.filePath("settings.ini")));
    }
    void init() {
        QFile::remove(settings.filePath("settings.ini"));
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
    // A timeline must not pay for a menu or its registered items before someone opens them.
    void clipMenuBuildsItsRegisteredItemsWhenItOpens() {
        const auto registered = [this](QObject* menu) {
            auto list = entries(menu);
            list.removeIf([](const QString& entry) { return !entry.startsWith("registryMenu-clip-"); });
            return list;
        };
        QVERIFY(!item("clip-c")->findChild<QObject*>("registryContextMenu-clip"));
        auto* menu = popup("clip", "clip-c");
        QVERIFY(menu);
        QVERIFY(!registered(menu).isEmpty());
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
        QStringList expected{"clipMenu-splitAtPlayhead:Split at playhead", "clipMenu-duplicate:Duplicate", "clipMenu-cut:Cut", "clipMenu-copy:Copy",
                             "registryMenuGroup-clip-transition:"};
        bool stateStarted = false;
        for (const auto& value : middle) {
            if (!stateStarted && value.startsWith("toggleClipLock")) {
                expected.append("registryMenuGroup-clip-state:");
                stateStarted = true;
            }
            expected.append("clipMenu-" + value);
        }
        expected.append({"clipMenu-labelDivider:", "clipMenu-label:Label", "clipMenu-afterLabelDivider:",
                         "registryMenu-clip-addMarker:Add marker", "registryMenuGroup-clip-:",
                         "registryMenu-clip-speedDuration:Speed / Duration…", "registryMenuGroup-clip-frame:",
                         "registryMenu-clip-fitToFrame:Fit to frame", "registryMenu-clip-fillFrame:Fill frame",
                         "registryMenuGroup-clip-reveal:", "registryMenu-clip-revealInProject:Reveal in Library",
                         "clipMenu-deleteDivider:", "clipMenu-rippleDeleteSelected:Ripple delete", "clipMenu-deleteSelected:Delete"});
        // Features register their own clip items and groups: the list pins the built-in ones and those of this menu.
        // clipMenuFollowsTheClip checks the rows that depend on the clip.
        auto actual = entries(menu);
        actual.removeIf([&expected](const QString& entry) {
            return (entry.startsWith("registryMenu-clip-") || entry.startsWith("registryMenuGroup-clip-") ||
                    entry.startsWith("clipMenu-Use as reference") || entry.startsWith("clipMenu-Audio role")) &&
                   !expected.contains(entry);
        });
        QCOMPARE(actual, expected);
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
        const auto before = doc();
        const auto unselected = clip("d");
        auto other = clip("e");
        gestures()->setSelection({"c", "e"});
        popup("clip", "clip-c"); trigger("clipMenu-" + action);
        // 43499b8e26 made a selected clip's menu act on the whole selection.
        if (action == "splitAtPlayhead" || action == "deleteSelected") {
            other = {};
        } else if (action == "applyDefaultTransition") {
            other.insert("transitionIn", QJsonObject{{"type", "crossfade"}, {"durationMs", 500}});
        } else if (action == "toggleClipEnabled") {
            other.insert("hidden", true);
            other.insert("muted", true);
        } else if (action == "linkClips") {
            const auto link = clip("c").value("linkId").toString();
            QVERIFY(!link.isEmpty());
            QVERIFY(link != "pair");
            other.insert("linkId", link);
        }
        QCOMPARE(clip("e"), other); QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(clip("d"), unselected);
        model.undoStack()->undo();
        QCOMPARE(doc(), before);
    }
    void deleteWithRippleMode_data() {
        QTest::addColumn<bool>("contextMenu");
        QTest::addColumn<double>("laterStartMs");
        QTest::newRow("context-menu") << true << 5000.0;
        QTest::newRow("keyboard") << false << 3000.0;
    }
    void deleteWithRippleMode() {
        QFETCH(bool, contextMenu);
        QFETCH(double, laterStartMs);
        const auto before = doc();
        gestures()->setRippleMode(true);
        gestures()->setSelection({"c"});
        QCOMPARE(model.undoStack()->count(), 0);
        if (contextMenu) {
            QVERIFY(popup("clip", "clip-c"));
            trigger("clipMenu-deleteSelected");
        } else {
            view->rootObject()->forceActiveFocus();
            QVERIFY(view->rootObject()->hasActiveFocus());
            QTest::keyClick(view.get(), Qt::Key_Delete);
        }
        QVERIFY(clip("c").isEmpty());
        QCOMPARE(clip("d").value("startMs").toDouble(), laterStartMs);
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo();
        QCOMPARE(doc(), before);
    }
    void splitOutside() {
        clock.seek(4500); const auto before = doc();
        popup("clip", "clip-c"); trigger("clipMenu-splitAtPlayhead");
        QCOMPARE(doc(), before); QCOMPARE(model.undoStack()->count(), 0);
        auto* split = item("clipMenu-splitAtPlayhead"); QVERIFY(split);
        QVERIFY(!split->isEnabled());
        QCOMPARE(split->property("reasonText").toString(), QString("Move the playhead over this clip first."));
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
        const QString gapItem = "registryMenu-gap-rippleDeleteSelected:Ripple delete";
        QTest::newRow("video-gap") << QString("video") << 4000.0 << QStringList{"laneMenu-addText:Add text", ":", gapItem};
        QTest::newRow("video-after-end") << QString("video") << 7000.0 << QStringList{"laneMenu-addText:Add text"};
        QTest::newRow("overlay") << QString("overlay") << 4000.0 << QStringList{"laneMenu-addText:Add text", ":", gapItem};
        for (const auto& type : {"audio", "subtitle", "midi", "chord"}) {
            QTest::newRow(type) << QString(type) << 4000.0 << QStringList{gapItem};
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
        popup("lane", "trackLane-v", 400); trigger("registryMenu-gap-rippleDeleteSelected");
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
        QCOMPARE(entries(menu), QStringList({"laneMenu-addText:Add text", ":", "registryMenu-gap-rippleDeleteSelected:Ripple delete",
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
    QStringList rulerList() {
        QStringList expected;
        MenuRegistry registry;
        for (const auto& value : registry.query("ruler", {})) {
            const auto entry = value.toMap();
            if (entry.value("separatorBefore").toBool()) {
                expected.append("registryMenuGroup-ruler-" + entry.value("group").toString() + ":");
            }
            expected.append("registryMenu-ruler-" + entry.value("action").toString() + ":" + entry.value("label").toString());
        }
        return expected;
    }
private slots:
    void rulerRegisteredActionsThenExtension() {
        auto expected = rulerList();
        auto* menu = popup("ruler", "timeRuler"); QVERIFY(menu);
        QCOMPARE(menu->property("visible").toBool(), !expected.isEmpty());
        QCOMPARE(entries(menu), expected);
        QVERIFY(QMetaObject::invokeMethod(menu, "close"));
        QTRY_VERIFY(!menu->property("visible").toBool());
        QVERIFY(nt::app::registerMenuItem({"ruler", "selectAll", "Select all clips", "Ctrl+A", {}, "zExtension", 200}));
        menu = popup("ruler", "timeRuler"); QVERIFY(menu);
        QTRY_VERIFY(menu->property("visible").toBool());
        expected = rulerList();
        QVERIFY(expected.endsWith("registryMenu-ruler-selectAll:Select all clips"));
        QCOMPARE(entries(menu), expected);
        trigger("registryMenu-ruler-selectAll"); QCOMPARE(gestures()->selection().size(), 5);
    }

    void aMenuTallerThanTheWindowStaysInside() {
        view->resize(1800, 300);
        QTRY_COMPARE(view->rootObject()->height(), 300.0);
        auto* surface = item("clip-c");
        if (!surface || !surface->isVisible()) { QSKIP("the small window hides the Timeline"); }
        auto* menu = popup("clip", "clip-c"); QVERIFY(menu);
        QTRY_VERIFY(menu->property("opened").toBool());
        QVERIFY(menu->property("y").toDouble() >= 0);
        QVERIFY(menu->property("y").toDouble() + menu->property("height").toDouble() <= view->height());
    }
    void menusOpenAtThePointer() {
        auto* surface = item("clip-c"); QVERIFY(surface);
        const auto at = center(surface);
        auto* menu = popup("clip", "clip-c"); QVERIFY(menu);
        QTRY_VERIFY(menu->property("opened").toBool());
        QCOMPARE(int(menu->property("x").toDouble()), at.x());
        QVERIFY(menu->property("y").toDouble() + menu->property("height").toDouble() <= view->height());
    }
    void shortcutsFollowThePreset() {
        popup("clip", "clip-c");
        QTRY_VERIFY(activeMenu && activeMenu->property("opened").toBool());
        QCOMPARE(item("clipMenu-splitAtPlayhead")->property("shortcutText").toString(), gestures()->shortcutFor("splitAtPlayhead"));
        QCOMPARE(item("registryMenu-clip-addMarker")->property("shortcutText").toString(), QString("M"));
        QVERIFY(QMetaObject::invokeMethod(activeMenu, "close"));
        QTRY_VERIFY(!activeMenu->property("visible").toBool());
        const auto before = gestures()->shortcutFor("splitAtPlayhead");
        gestures()->setKeyboardPreset("premiere");
        const auto premiere = gestures()->shortcutFor("splitAtPlayhead");
        QVERIFY(premiere != before);
        popup("clip", "clip-c");
        QTRY_VERIFY(activeMenu && activeMenu->property("opened").toBool());
        QCOMPARE(item("clipMenu-splitAtPlayhead")->property("shortcutText").toString(), premiere);
        const auto bar = nt::app::shellMenuDescription("premiere");
        QStringList shortcuts;
        for (const auto& menu : bar) {
            for (const auto& entry : menu.items) {
                if (entry.action == "splitAtPlayhead") { shortcuts << entry.shortcut; }
            }
        }
        QCOMPARE(shortcuts, QStringList{premiere});
    }
    void fitAndFillFrame() {
        patch("c", {{"width", 320}, {"height", 360}, {"transform", QJsonObject{{"position", QJsonObject{{"x", 40}, {"y", 9}}},
            {"scale", QJsonObject{{"x", -0.5}, {"y", 0.5}}}, {"rotation", 0.25}, {"anchor", QJsonObject{{"x", 0}, {"y", 1}}}}}});
        const auto before = doc();
        popup("clip", "clip-c"); trigger("registryMenu-clip-fillFrame");
        auto transform = clip("c").value("transform").toObject();
        // 320x360 in 640x360 is contained at half width, so the fill doubles it. The flip stays.
        QCOMPARE(transform.value("scale").toObject(), QJsonObject({{"x", -2}, {"y", 2}}));
        QCOMPARE(transform.value("position").toObject(), QJsonObject({{"x", 0}, {"y", 0}}));
        QCOMPARE(transform.value("anchor").toObject(), QJsonObject({{"x", 0.5}, {"y", 0.5}}));
        QCOMPARE(transform.value("rotation").toDouble(), 0.25);
        QCOMPARE(model.undoStack()->count(), 1);
        popup("clip", "clip-c"); trigger("registryMenu-clip-fitToFrame");
        QCOMPARE(clip("c").value("transform").toObject().value("scale").toObject(), QJsonObject({{"x", -1}, {"y", 1}}));
        QCOMPARE(model.undoStack()->count(), 2);
        model.undoStack()->undo(); model.undoStack()->undo();
        QCOMPARE(doc(), before);
    }
    void fitReplacesFramingKeyframes() {
        const QJsonArray curves{QJsonObject{{"property", "scale"}, {"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"value", 2}}}}},
                                QJsonObject{{"property", "opacity"}, {"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"value", 1}}}}}};
        patch("c", {{"animations", QJsonArray{QJsonObject{{"id", "k"}, {"custom", QJsonObject{{"curves", curves}}}}}}});
        gestures()->setSelection({"c"});
        QVERIFY(gestures()->runAction("fitToFrame"));
        const auto kept = clip("c").value("animations").toArray().first().toObject().value("custom").toObject().value("curves").toArray();
        QCOMPARE(kept.size(), 1);
        QCOMPARE(kept.first().toObject().value("property").toString(), QString("opacity"));
    }
    void frameItemsSayWhyTheyAreOff_data() {
        QTest::addColumn<QString>("target");
        QTest::addColumn<QJsonObject>("fields");
        QTest::addColumn<bool>("fit");
        QTest::addColumn<bool>("fill");
        QTest::newRow("no-size") << "c" << QJsonObject{} << true << false;
        QTest::newRow("sized") << "c" << QJsonObject{{"width", 100}, {"height", 100}} << true << true;
        QTest::newRow("locked") << "c" << QJsonObject{{"width", 100}, {"height", 100}, {"locked", true}} << false << false;
        QTest::newRow("audio") << "s" << QJsonObject{} << false << false;
    }
    void frameItemsSayWhyTheyAreOff() {
        QFETCH(QString, target); QFETCH(QJsonObject, fields); QFETCH(bool, fit); QFETCH(bool, fill);
        patch(target, fields);
        popup("clip", "clip-" + target);
        QTRY_VERIFY(activeMenu && activeMenu->property("opened").toBool());
        auto* fitItem = item("registryMenu-clip-fitToFrame");
        auto* fillItem = item("registryMenu-clip-fillFrame");
        QVERIFY(fitItem && fillItem);
        QCOMPARE(fitItem->isEnabled(), fit);
        QCOMPARE(fillItem->isEnabled(), fill);
        QCOMPARE(fitItem->property("reasonText").toString().isEmpty(), fit);
        QCOMPARE(fillItem->property("reasonText").toString().isEmpty(), fill);
        if (!fill) {
            auto* reason = named(fillItem, "menuItemReason");
            QVERIFY(reason && reason->isVisible());
        }
    }
    void labelSubmenu() {
        const auto before = doc();
        gestures()->setSelection({"c", "e"});
        auto* menu = popup("clip", "clip-c"); QVERIFY(menu);
        QTRY_VERIFY(menu->property("opened").toBool());
        QVERIFY(entries(menu).contains("clipMenu-label:Label"));
        auto* row = item("clipMenu-label"); QVERIFY(row);
        auto* arrow = named(row, "menuItemSubmenuArrow");
        QVERIFY(arrow && arrow->isVisible());
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(row));
        QTRY_VERIFY(item("clipLabelMenu-clipLabel.red") && item("clipLabelMenu-clipLabel.red")->isVisible());
        QTRY_VERIFY(item("clipLabelMenu-clipLabel.red")->width() > 0);
        // The submenu opens beside its row, not somewhere else in the window.
        const auto rowRight = row->mapToScene({row->width(), row->height() / 2});
        const auto redLeft = item("clipLabelMenu-clipLabel.red")->mapToScene({0, 0});
        QVERIFY2(std::abs(redLeft.x() - rowRight.x()) < 40, qPrintable(QString::number(redLeft.x() - rowRight.x())));
        QVERIFY2(std::abs(redLeft.y() - rowRight.y()) < 120, qPrintable(QString::number(redLeft.y() - rowRight.y())));
        QSignalSpy frame(view.get(), &QQuickWindow::frameSwapped);
        view->update();
        QVERIFY(!frame.isEmpty() || frame.wait(1000));
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("clipLabelMenu-clipLabel.red")));
        QCoreApplication::processEvents();
        // The clip menu acts on the selection, as its other items do. One edit, one undo entry.
        QCOMPARE(clip("c").value("labelColor").toString(), QString("#E5484D"));
        QCOMPARE(clip("e").value("labelColor").toString(), QString("#E5484D"));
        QCOMPARE(model.undoStack()->count(), 1);
        auto* tint = named(item("clip-c"), "clipTint"); QVERIFY(tint);
        QTRY_COMPARE(tint->property("color").value<QColor>().rgb(), QColor("#E5484D").rgb());
        popup("clip", "clip-c");
        QTRY_VERIFY(activeMenu && activeMenu->property("opened").toBool());
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("clipMenu-label")));
        QTRY_VERIFY(item("clipLabelMenu-clipLabel.red"));
        QVERIFY(item("clipLabelMenu-clipLabel.red")->property("checked").toBool());
        QVERIFY(!item("clipLabelMenu-clipLabel.none")->property("checked").toBool());
        QVERIFY(QMetaObject::invokeMethod(activeMenu, "close"));
        QVERIFY(gestures()->runAction("clipLabel.none", {{"clipIds", QStringList{"c"}}}));
        QVERIFY(!clip("c").contains("labelColor"));
        model.undoStack()->undo(); model.undoStack()->undo();
        QCOMPARE(doc(), before);
    }
    void clipLabelSurvivesAParseAndAnEmptyTarget() {
        patch("c", {{"labelColor", "#3E63DD"}});
        const auto raw = doc();
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson()); QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        QCOMPARE(clip("c").value("labelColor").toString(), QString("#3E63DD"));
        gestures()->setSelection({});
        QVERIFY(!gestures()->runAction("clipLabel.red"));
        QCOMPARE(clip("c").value("labelColor").toString(), QString("#3E63DD"));
        // The field audit knows the field.
        const auto audit = QJsonDocument(nt::server::auditTimelineFields(raw)).toJson(QJsonDocument::Compact);
        QVERIFY2(!audit.contains("labelColor"), audit.constData());
    }
    void addMarkerFromTheClipMenu() {
        const auto before = doc();
        popup("clip", "clip-c"); trigger("registryMenu-clip-addMarker");
        const auto markers = model.markersJson();
        QCOMPARE(markers.size(), 1);
        QCOMPARE(markers.first().toObject().value("timeMs").toDouble(), 1500.0);
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo();
        QVERIFY(model.markersJson().isEmpty());
        QCOMPARE(doc().value("clips"), before.value("clips"));
    }
    void revealNamesTheClickedClip() {
        patch("c", {{"currentAssetId", "asset-c"}});
        clock.seek(5500);  // Over another clip, so a playhead lookup would find no asset.
        popup("clip", "clip-c");
        QTRY_VERIFY(activeMenu && activeMenu->property("opened").toBool());
        QVERIFY(item("registryMenu-clip-revealInProject")->isEnabled());
        QVERIFY(QMetaObject::invokeMethod(activeMenu, "close"));
        QTRY_VERIFY(!activeMenu->property("visible").toBool());
        QVERIFY(gestures()->runAction("revealInProject", {{"clipIds", QStringList{"c"}}}));
        QVERIFY(!gestures()->runAction("revealInProject", {{"clipIds", QStringList{"d"}}}));
        popup("clip", "clip-d");
        QTRY_VERIFY(activeMenu && activeMenu->property("opened").toBool());
        auto* off = item("registryMenu-clip-revealInProject");
        QVERIFY(!off->isEnabled());
        QVERIFY(!off->property("reasonText").toString().isEmpty());
    }
    void gapMenuSelectsAndRippleDeletes() {
        const auto before = doc();
        gestures()->setSelection({"e"});
        auto* menu = popup("lane", "trackLane-v", 400); QVERIFY(menu);
        QTRY_VERIFY(menu->property("opened").toBool());
        // The right-click selects the gap, as a click does.
        QCOMPARE(gestures()->selectedGap().value("trackId").toString(), QString("v"));
        QVERIFY(gestures()->selection().isEmpty());
        QVERIFY(item("selectedGap-v")->isVisible());
        auto* entry = item("registryMenu-gap-rippleDeleteSelected"); QVERIFY(entry);
        QCOMPARE(entry->property("shortcutText").toString(), gestures()->shortcutFor("rippleDeleteSelected"));
        QVERIFY(!entry->property("shortcutText").toString().isEmpty());
        QVERIFY(QMetaObject::invokeMethod(menu, "close"));
        QTRY_VERIFY(!menu->property("visible").toBool());
        popup("lane", "trackLane-v", 400);
        trigger("registryMenu-gap-rippleDeleteSelected");
        QCOMPARE(clip("d").value("startMs").toDouble(), 3000.0);
        QVERIFY(gestures()->selectedGap().isEmpty());
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo(); QCOMPARE(doc(), before);
        // A press on a clip-free lane past the last clip offers no gap.
        popup("lane", "trackLane-v", 800);
        QVERIFY(gestures()->selectedGap().isEmpty());
    }
    void rulerMarks() {
        gestures()->viewState()->clearRange();
        auto* menu = popup("ruler", "timeRuler"); QVERIFY(menu);
        QTRY_VERIFY(menu->property("opened").toBool());
        auto* goToIn = item("registryMenu-ruler-goToIn"); QVERIFY(goToIn);
        QVERIFY(!goToIn->isEnabled());
        QCOMPARE(goToIn->property("reasonText").toString(), QString("Set an In point first."));
        QVERIFY(!item("registryMenu-ruler-clearRange")->isEnabled());
        QCOMPARE(item("registryMenu-ruler-markIn")->property("shortcutText").toString(), gestures()->shortcutFor("markIn"));
        trigger("registryMenu-ruler-markIn");
        QCOMPARE(gestures()->viewState()->rangeInMs(), 1500.0);
        QCOMPARE(model.undoStack()->count(), 0);
        clock.seek(9000);
        popup("ruler", "timeRuler");
        QTRY_VERIFY(activeMenu && activeMenu->property("opened").toBool());
        QVERIFY(item("registryMenu-ruler-goToIn")->isEnabled());
        QVERIFY(!item("registryMenu-ruler-goToOut")->isEnabled());
        trigger("registryMenu-ruler-goToIn");
        QCOMPARE(clock.time(), 1500.0);
        popup("ruler", "timeRuler"); trigger("registryMenu-ruler-addMarker");
        QCOMPARE(model.markersJson().size(), 1);
        QCOMPARE(model.undoStack()->count(), 1);
        popup("ruler", "timeRuler"); trigger("registryMenu-ruler-clearRange");
        QCOMPARE(gestures()->viewState()->rangeInMs(), -1.0);
    }
    void editPointMenu() {
        // c ends where d starts, so this cut has a clip on both sides.
        patch("d", {{"startMs", 3000}});
        const auto before = doc();
        auto* edge = named(item("clip-c"), "clipTrimEnd"); QVERIFY(edge);
        const auto rightClickEdge = [&](QQuickItem* target) {
            QTest::mouseClick(view.get(), Qt::RightButton, Qt::NoModifier, center(target));
            QCoreApplication::processEvents();
            activeMenu = item("trackLane-v")->findChild<QObject*>("registryContextMenu-editPoint");
        };
        rightClickEdge(edge);
        QTRY_VERIFY(activeMenu && activeMenu->property("opened").toBool());
        QCOMPARE(entries(activeMenu), QStringList({"registryMenu-editPoint-editPoint.rippleIn:Ripple trim in",
            "registryMenu-editPoint-editPoint.rippleOut:Ripple trim out", "registryMenu-editPoint-editPoint.roll:Roll edit",
            "registryMenu-editPoint-editPoint.trimIn:Trim in", "registryMenu-editPoint-editPoint.trimOut:Trim out",
            "registryMenuGroup-editPoint-transition:", "registryMenu-editPoint-applyDefaultTransition:Apply default transition"}));
        trigger("registryMenu-editPoint-editPoint.roll");
        QCOMPARE(gestures()->selectedEdit().value("clipId").toString(), QString("c"));
        QCOMPARE(gestures()->selectedEdit().value("edge").toString(), QString("end"));
        QCOMPARE(gestures()->activeTool(), QString("roll"));
        QCOMPARE(model.undoStack()->count(), 0);
        // The checkmark shows the current type when the menu opens again.
        rightClickEdge(edge);
        QTRY_VERIFY(activeMenu->property("opened").toBool());
        QVERIFY(item("registryMenu-editPoint-editPoint.roll")->property("checked").toBool());
        QVERIFY(!item("registryMenu-editPoint-editPoint.trimOut")->property("checked").toBool());
        QVERIFY(QMetaObject::invokeMethod(activeMenu, "close"));
        QTRY_VERIFY(!activeMenu->property("visible").toBool());
        // The selected type is what the trim keys do: a roll moves both sides of the cut.
        view->rootObject()->forceActiveFocus();
        QVERIFY(gestures()->runAction("trimEditRight"));
        QVERIFY(clip("c").value("durationMs").toDouble() > 2000);
        QCOMPARE(clip("d").value("startMs").toDouble(), clip("c").value("startMs").toDouble() + clip("c").value("durationMs").toDouble());
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo(); QCOMPARE(doc(), before);
        gestures()->setActiveTool("select");
        // Ripple moves the later clips.
        rightClickEdge(edge);
        trigger("registryMenu-editPoint-editPoint.rippleOut");
        QCOMPARE(gestures()->activeTool(), QString("ripple"));
        QVERIFY(gestures()->runAction("trimEditLeft"));
        QVERIFY(clip("d").value("startMs").toDouble() < 3000);
        model.undoStack()->undo(); QCOMPARE(doc(), before);
        gestures()->setActiveTool("select");
        // The default transition goes on the clip after the cut, as one entry.
        rightClickEdge(edge);
        trigger("registryMenu-editPoint-applyDefaultTransition");
        QVERIFY(clip("d").contains("transitionIn"));
        QVERIFY(!clip("c").contains("transitionIn"));
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo(); QCOMPARE(doc(), before);
    }
    void editPointMenuAtTheEndOfAGap() {
        auto* edge = named(item("clip-c"), "clipTrimEnd"); QVERIFY(edge);
        QTest::mouseClick(view.get(), Qt::RightButton, Qt::NoModifier, center(edge));
        activeMenu = item("trackLane-v")->findChild<QObject*>("registryContextMenu-editPoint");
        QTRY_VERIFY(activeMenu && activeMenu->property("opened").toBool());
        for (const auto* action : {"editPoint.rippleIn", "editPoint.roll", "editPoint.trimIn", "applyDefaultTransition"}) {
            auto* entry = item(QString("registryMenu-editPoint-") + action); QVERIFY(entry);
            QVERIFY2(!entry->isEnabled(), action);
            QVERIFY2(!entry->property("reasonText").toString().isEmpty(), action);
        }
        QVERIFY(item("registryMenu-editPoint-editPoint.rippleOut")->isEnabled());
        QVERIFY(item("registryMenu-editPoint-editPoint.trimOut")->isEnabled());
        QVERIFY(QMetaObject::invokeMethod(activeMenu, "close"));
        // A locked clip's edge keeps the clip menu.
        patch("c", {{"locked", true}});
        QTest::mouseClick(view.get(), Qt::RightButton, Qt::NoModifier, center(edge));
        QCoreApplication::processEvents();
        QVERIFY(!activeMenu->property("visible").toBool());
    }
    // Every item of every menu names an action the editor has.
    void everyMenuItemNamesAKnownAction() {
        const auto problems = unknownActions(nt::app::shellMenuEntries());
        QVERIFY2(problems.isEmpty(), qPrintable(problems.join(", ")));
        // The check works: it names an action no one registered.
        QCOMPARE(unknownActions({{"Edit", "no.such.action", "Nothing"}}), QStringList{"Edit: no.such.action"});
        // The same for the items of the context menus.
        MenuRegistry registry;
        const auto known = ClipGestureController::availableActions();
        int inspected = 0;
        for (const auto* kind : {"clip", "track", "lane", "ruler", "asset", "marker", "gap", "editPoint"}) {
            for (const auto& value : registry.query(kind, {})) {
                ++inspected;
                const auto action = value.toMap().value("action").toString();
                QVERIFY2(known.contains(action), qPrintable(QString(kind) + ": " + action));
            }
        }
        QVERIFY(inspected > 30);
        // And for the items QML adds, while the menus are open.
        for (const auto& [kind, target] : std::vector<std::pair<QString, QString>>{{"clip", "clip-c"}}) {
            auto* menu = popup(kind, target); QVERIFY(menu);
            QTRY_VERIFY(menu->property("opened").toBool());
            int named = 0;
            for (int i = 0; i < menu->property("count").toInt(); ++i) {
                QQuickItem* entry = nullptr;
                QVERIFY(QMetaObject::invokeMethod(menu, "itemAt", Q_RETURN_ARG(QQuickItem*, entry), Q_ARG(int, i)));
                const auto action = entry->property("actionName").toString();
                if (action.isEmpty()) { continue; }
                ++named;
                QVERIFY2(known.contains(action), qPrintable(action));
            }
            QVERIFY(named > 8);
        }
    }
    void everyMenuBarItemRunsOrSaysWhy_data() {
        QTest::addColumn<bool>("rich");
        QTest::newRow("nothing-selected") << false;
        QTest::newRow("everything-available") << true;
    }
    // An enabled item runs. A disabled one gives its reason.
    void everyMenuBarItemRunsOrSaysWhy() {
        QFETCH(bool, rich);
        nt::app::ShellMenus menus;
        menus.setAnchor(view->rootObject());
        const auto context = [&] {
            return QVariantMap{{"kind", "shell"}, {"gestures", QVariant::fromValue<QObject*>(gestures())},
                               {"timeline", QVariant::fromValue<QObject*>(&model)}};
        };
        auto* store = qobject_cast<DockLayoutStore*>(view->rootObject()->property("dockStore").value<QObject*>());
        const auto workspace = store->workspace();
        auto* source = qmlEngine(gestures())->singletonInstance<QObject*>("NodeTool.Timeline", "SourceViewerState");
        if (rich) {
            model.applyEdit("addMarker", {{"id", "m"}, {"timeMs", 1500}});
            patch("c", {{"mediaType", "video"}, {"width", 100}, {"height", 100}, {"fadeInMs", 100}, {"linkId", "pair"},
                        {"currentAssetId", "asset-c"}, {"transitionIn", QJsonObject{{"type", "crossfade"}, {"durationMs", 200}}}});
            patch("e", {{"linkId", "pair"}, {"currentAssetId", "asset-e"}});
            source->setProperty("asset", QVariantMap{{"id", "asset-c"}, {"name", "Clip"}, {"content_type", "video/*"}, {"duration", 5}});
        }
        const auto base = doc();
        const int baseIndex = model.undoStack()->index();
        // Undo puts the document back, far faster than loading it again for each item.
        const auto reset = [&] {
            while (model.undoStack()->index() > baseIndex) { model.undoStack()->undo(); }
            if (doc() != base) { restore(base); }
            nt::edit::clipboard::clearClipClipboard();
            gestures()->setSelection({});
            gestures()->setActiveTool("select");
            gestures()->viewState()->clearRange();
            clock.pause();
            clock.seek(1500);
            if (store->workspace() != workspace) { store->switchWorkspace(int(store->workspaces().indexOf(workspace))); }
            if (!rich) { return; }
            gestures()->setSelection({"c", "e"});
            QVERIFY(gestures()->runAction("copy"));
            gestures()->selectEdit("c", "end");
            gestures()->viewState()->setRangeIn(1200);
            gestures()->viewState()->setRangeOut(1800);
        };
        reset();
        QStringList problems;
        int ran = 0, off = 0;
        const auto visit = [&](auto&& self, const std::vector<nt::app::ShellMenuItem>& items, const QString& path) -> void {
            for (const auto& entry : items) {
                if (entry.separator) { continue; }
                const auto name = path + " > " + entry.label;
                if (!entry.children.empty()) { self(self, entry.children, name); continue; }
                if (!entry.enabled) {
                    ++off;
                    if (entry.disabledReason.isEmpty()) { problems << name + " is off with no reason"; }
                    continue;
                }
                // Quitting ends this test, and the recent list needs the settings file of a person.
                if (entry.action == "quit" || entry.action == "clearRecent") { continue; }
                ++ran;
                if (!menus.trigger(entry.action)) { problems << name + " (" + entry.action + ") is on and did not run"; }
                if (entry.action == "toggleProgramFullscreen") { menus.trigger(entry.action); }
                reset();
            }
        };
        // The list is read once: running an item changes only what reset() restores.
        for (const auto& menu : nt::app::shellMenuDescription("nodetool", {}, context())) {
            visit(visit, menu.items, menu.label);
        }
        QVERIFY2(problems.isEmpty(), qPrintable(problems.join("\n")));
        QVERIFY(ran > 40);
        // Off even with everything available: the trim mode items until it is on, the keyframe items
        // while two clips are selected, and Remove Filler Words with no filler word.
        if (rich) { QVERIFY2(off < 15, qPrintable(QString::number(off))); } else { QVERIFY(off > 10); }
        source->setProperty("asset", QVariantMap{});
    }
    void toggleItemsShowACheckmark() {
        const auto find = [&](const QString& action) {
            const QVariantMap context{{"kind", "shell"}, {"gestures", QVariant::fromValue<QObject*>(gestures())},
                                      {"timeline", QVariant::fromValue<QObject*>(&model)}};
            nt::app::ShellMenuItem found;
            const auto visit = [&](auto&& self, const std::vector<nt::app::ShellMenuItem>& items) -> void {
                for (const auto& entry : items) {
                    if (entry.action == action) { found = entry; }
                    self(self, entry.children);
                }
            };
            for (const auto& menu : nt::app::shellMenuDescription("nodetool", {}, context)) { visit(visit, menu.items); }
            return found;
        };
        const auto snap = gestures()->snapEnabled();
        QVERIFY(find("toggleSnap").checkable);
        QCOMPARE(find("toggleSnap").checked, snap);
        gestures()->setSnapEnabled(!snap);
        QCOMPARE(find("toggleSnap").checked, !snap);
        gestures()->setSnapEnabled(snap);
        QVERIFY(find("rippleTool").checkable);
        QVERIFY(!find("rippleTool").checked);
        gestures()->setActiveTool("ripple");
        QVERIFY(find("rippleTool").checked);
        gestures()->setActiveTool("select");
        QVERIFY(find("toggleLoop").checkable);
        QVERIFY(find("panelTimeline").checked);
        QVERIFY(find("workspace1").checked);
        QVERIFY(!find("workspace2").checked);
        gestures()->setSelection({"c"});
        QVERIFY(find("toggleClipEnabled").checked);
        patch("c", {{"hidden", true}});
        QVERIFY(!find("toggleClipEnabled").checked);
        QVERIFY(!find("clipLabel.red").checked);
        QVERIFY(find("clipLabel.none").checked);
    }
    void windowMenuListsPanelsAndWorkspaces() {
        nt::app::ShellMenus menus;
        menus.setAnchor(view->rootObject());
        const auto& entries = nt::app::shellMenuEntries();
        const auto store = qobject_cast<DockLayoutStore*>(view->rootObject()->property("dockStore").value<QObject*>());
        QStringList names;
        for (int i = 1; i <= store->workspaces().size(); ++i) {
            for (const auto& entry : entries) {
                if (entry.action == "workspace" + QString::number(i)) { names << entry.label; }
            }
        }
        // The labels are in the order the workspace actions switch through.
        QCOMPARE(names, store->workspaces());
        QVERIFY(menus.trigger("workspace5"));
        QCOMPARE(store->workspace(), store->workspaces().at(4));
        QVERIFY(menus.trigger("workspace1"));
        QStringList unlisted;
        const auto panels = view->rootObject()->property("dockPanels").value<QJSValue>().toVariant().toList();
        QVERIFY(panels.size() > 10);
        for (const auto& value : panels) {
            const auto title = value.toMap().value("title").toString();
            const bool listed = std::any_of(entries.begin(), entries.end(), [&](const auto& entry) {
                return entry.menu == "Window" && entry.submenu.isEmpty() && entry.label == title;
            });
            if (!listed) { unlisted << title; }
        }
        QVERIFY2(unlisted.isEmpty(), qPrintable("The Window menu does not list " + unlisted.join(", ")));
        QVERIFY(menus.trigger("panelMarkers"));
        QTRY_VERIFY(!store->layout().value("hidden").toStringList().contains("markers"));
    }
    // The final check of the menu pass: a command is in a menu, or it is listed above with why it is not.
    void everyCommandIsInAMenu() {
        QSet<QString> inMenus;
        for (const auto& entry : nt::app::shellMenuEntries()) { inMenus.insert(entry.action); }
        for (const auto& entry : nt::app::menuItems()) { inMenus.insert(entry.action); }
        // The lane menu builds this one in QML.
        auto* menu = popup("lane", "trackLane-v", 400); QVERIFY(menu);
        QTRY_VERIFY(menu->property("visible").toBool());
        QVERIFY(entries(menu).contains("laneMenu-addText:Add text"));
        inMenus.insert("addText");
        const auto commands = ClipGestureController::availableActions();
        const auto problems = commandsOffTheMenus(commands, inMenus, keyOnlyCommands());
        QVERIFY2(problems.isEmpty(), qPrintable(problems.join("\n")));
        // The check works: it finds a command with no item, a listed one with an item, and a stale one.
        QCOMPARE(commandsOffTheMenus({"a", "b"}, {"b"}, {"b", "c"}), QStringList({"a is in no menu", "b is in a menu and listed as key only",
                                                                                 "c is listed as key only and does not exist"}));
    }
    void menuBarLabelsAreInTitleCase() {
        QStringList problems;
        for (const auto& menu : openMenus()) { problems << labelsNotInTitleCase(menu.items); }
        QVERIFY2(problems.isEmpty(), qPrintable(problems.join(", ")));
        QCOMPARE(labelsNotInTitleCase({{"Exit trim mode"}, {"in Short"}, {"Go to In"}}), QStringList({"Exit trim mode", "in Short"}));
    }
    // With no timeline open, an item needs one to run, says so, or works without one.
    void withNoTimelineOpenAnItemIsOffOrWorks() {
        const QStringList worksAlone{"recent", "clearRecent", "openTimeline", "newTimeline", "settings", "quit"};
        QStringList problems;
        int off = 0;
        const auto visit = [&](auto&& self, const std::vector<nt::app::ShellMenuItem>& items, const QString& path) -> void {
            for (const auto& entry : items) {
                if (entry.separator) { continue; }
                const auto name = path + " > " + entry.label;
                if (!entry.children.empty()) { self(self, entry.children, name); continue; }
                if (entry.enabled) {
                    if (!worksAlone.contains(entry.action)) { problems << name + " is on and has no timeline to work on"; }
                } else {
                    ++off;
                    if (entry.disabledReason.isEmpty()) { problems << name + " is off with no reason"; }
                }
            }
        };
        for (const auto& menu : nt::app::shellMenuDescription("nodetool", {}, {{"kind", "shell"}})) { visit(visit, menu.items, menu.label); }
        QVERIFY2(problems.isEmpty(), qPrintable(problems.join("\n")));
        QVERIFY(off > 100);
    }
    // The registered items of the context menus, on the targets that turn the most of them off.
    void contextItemsSayWhyTheyAreOff() {
        MenuRegistry registry;
        patch("e", {{"mediaType", "audio"}, {"locked", true}});
        const QVariantMap base{{"gestures", QVariant::fromValue<QObject*>(gestures())}, {"timeline", QVariant::fromValue<QObject*>(&model)}};
        const auto with = [&](const QVariantMap& fields) {
            auto context = base;
            for (auto it = fields.begin(); it != fields.end(); ++it) { context.insert(it.key(), it.value()); }
            return context;
        };
        const QList<std::pair<QString, QVariantMap>> targets{
            {"clip", with({{"clipId", "e"}, {"clipIds", QStringList{"e"}}, {"mediaType", "audio"}, {"editable", false},
                           {"clip", clip("e").toVariantMap()}})},
            {"ruler", base}, {"marker", with({{"markerId", "none"}, {"timeMs", 0}})}, {"gap", with({{"trackId", "v"}, {"timeMs", 0}})},
            {"editPoint", with({{"leftId", ""}, {"rightId", ""}})}};
        QStringList problems;
        int off = 0;
        for (const auto& [kind, context] : targets) {
            for (const auto& value : registry.query(kind, context)) {
                const auto entry = value.toMap();
                if (entry.value("enabled").toBool()) { continue; }
                ++off;
                if (entry.value("reason").toString().isEmpty()) { problems << kind + ": " + entry.value("action").toString(); }
            }
        }
        QVERIFY2(problems.isEmpty(), qPrintable(problems.join(", ")));
        QVERIFY(off > 15);
    }
    // In a native menu bar, two items with one key fight over it. tst_appshell checks the
    // standard items. This one has every module's.
    void noTwoMenuBarItemsShareAKey() {
        const auto visit = [](auto&& self, const std::vector<nt::app::ShellMenuItem>& items, QHash<QKeySequence, QString>& seen, QStringList& clashes) -> void {
            for (const auto& item : items) {
                if (!item.sequence.isEmpty()) {
                    if (seen.contains(item.sequence)) { clashes << item.sequence.toString() + ": " + seen.value(item.sequence) + " and " + item.action; }
                    seen.insert(item.sequence, item.action);
                }
                self(self, item.children, seen, clashes);
            }
        };
        for (const QString preset : {"nodetool", "premiere", "fcp"}) {
            QHash<QKeySequence, QString> seen;
            QStringList clashes;
            for (const auto& menu : openMenus(preset)) { visit(visit, menu.items, seen, clashes); }
            QVERIFY2(clashes.isEmpty(), qPrintable(preset + ": " + clashes.join(", ")));
            QVERIFY(seen.size() > 40);
        }
    }
    // Where the commands the other modules added went, in the order of a Premiere menu.
    void menuBarGroups_data() {
        QTest::addColumn<QString>("path");
        QTest::addColumn<QStringList>("labels");
        QTest::newRow("file") << "File" << QStringList{"Open Recent", "Open Timeline…", "New Timeline", "---",
            "Export…", "Quick Export…", "Export Frame…", "---", "Import Premiere XML…", "Export to Premiere Pro…", "---",
            "Project Settings…", "---", "Settings…", "Quit"};
        QTest::newRow("edit") << "Edit" << QStringList{"Undo", "Redo", "---", "Cut", "Copy", "Paste", "Paste Insert", "Paste Attributes…", "---",
            "Delete", "Ripple Delete", "Duplicate", "Duplicate with Gap", "---",
            "Select All", "Deselect All", "Select Clips at Playhead", "Select Next Clip", "Select Previous Clip", "---", "Label"};
        QTest::newRow("clip") << "Clip" << QStringList{"Video Options", "Audio Options", "Audio Role", "Speed / Duration…", "Scene Edit Detection…", "---",
            "Insert", "Overwrite", "Append to End", "---", "Remix…", "Revert Remix", "---",
            "Enable", "Link", "Group", "Ungroup", "Lock", "---", "Keyframes", "---", "Takes", "---", "Reveal in Library"};
        QTest::newRow("video-options") << "Clip > Video Options" << QStringList{"Frame Hold Options…", "Add Frame Hold", "Insert Frame Hold Segment…", "---", "Fit to Frame", "Fill Frame"};
        QTest::newRow("audio-options") << "Clip > Audio Options" << QStringList{"Audio Gain…", "Match Loudness", "Duck Music Under Dialogue"};
        QTest::newRow("audio-role") << "Clip > Audio Role" << QStringList{"Dialogue", "Music", "SFX", "Ambience", "No Role"};
        QTest::newRow("keyframes") << "Clip > Keyframes" << QStringList{"Add or Remove Keyframe", "Next Keyframe", "Previous Keyframe"};
        QTest::newRow("takes") << "Clip > Takes" << QStringList{"Show Takes in the Program Monitor", "Record Take Switches"};
        QTest::newRow("sequence") << "Sequence" << QStringList{"Match Frame", "---", "Add Edit", "Add Edit to All Tracks", "---",
            "Trim Edit", "Toggle Trim Type", "Exit Trim Mode", "Extend Selected Edit to Playhead", "Extend Previous Edit to Playhead", "Extend Next Edit to Playhead",
            "Ripple Trim Previous Edit to Playhead", "Ripple Trim Next Edit to Playhead", "---",
            "Apply Video Transition", "Apply Audio Transition", "Remove Transition", "Fade In and Out", "Remove Fades", "---",
            "Lift", "Extract", "---", "Remove Filler Words", "---", "Zoom In", "Zoom Out", "Zoom to Fit Content", "Zoom to Selection", "---", "Go to Gap", "---", "Tools", "---",
            "Snap in Timeline", "Linked Selection"};
        QTest::newRow("view") << "View" << QStringList{"Monitor Display", "Monitor Zoom", "Playback Resolution", "Paused Resolution", "Monitor Overlays", "---",
            "Program Monitor Full Screen", "---", "Timecode Ruler", "Make Tracks Taller", "Make Tracks Shorter", "Expand All Tracks", "Minimize All Tracks",
            "Make Audio Tracks Taller", "Make Audio Tracks Shorter", "---", "Set Reference Frame"};  // Scrub Clips in the Library is linked only into the app.
        QTest::newRow("playback-go-to") << "Playback" << QStringList{"Play / Pause", "Play In to Out", "Play In to Out with Preroll/Postroll", "Play to Out", "Play Around", "Loop", "---",
            "Shuttle Left", "Shuttle Stop", "Shuttle Right", "Shuttle Slow Left", "Shuttle Slow Right", "---",
            "Step Back 1 Frame", "Step Forward 1 Frame", "Step Back 5 Frames", "Step Forward 5 Frames", "---",
            "Go to Previous Edit Point", "Go to Next Edit Point", "Go to Previous Edit on Any Track", "Go to Next Edit on Any Track",
            "Go to Sequence Start", "Go to Sequence End", "Go to Selection Start", "Go to Selection End", "---",
            "Play Audio While Scrubbing", "Keep Pitch While Shuttling"};
        QTest::newRow("window") << "Window" << QStringList{"Workspaces", "---", "Maximize Frame", "Next Panel", "Previous Panel", "Left Panels", "Right Panels", "---",
            "Library", "Effects", "Source", "Timeline", "Program", "Reference", "Inspector", "Mixer", "Audio", "Scripts", "Storyboards", "Text", "Effect Controls", "Motion", "Color", "Scopes",
            "Entities", "Markers", "Assistant", "AI", "Activity"};
    }
    void menuBarGroups() {
        QFETCH(QString, path);
        QFETCH(QStringList, labels);
        const auto menus = openMenus();
        QCOMPARE(itemLabels(itemsOf(menus, path)).join(" | "), labels.join(" | "));
    }
    void projectSettingsAndTextPanelItemsRun() {
        nt::app::ShellMenus menus;
        menus.setAnchor(view->rootObject());
        QVERIFY(menus.trigger("projectSettings"));
        QTRY_VERIFY(item("ProjectSettingsDialog")->property("opened").toBool());
        QVERIFY(QMetaObject::invokeMethod(item("ProjectSettingsDialog"), "close"));
        QTRY_VERIFY(!item("ProjectSettingsDialog")->property("opened").toBool());
        QVERIFY(menus.trigger("panelText"));
        const auto store = qobject_cast<DockLayoutStore*>(view->rootObject()->property("dockStore").value<QObject*>());
        QTRY_VERIFY(!store->layout().value("hidden").toStringList().contains("transcript"));
    }
    void removeFillerWordsIsOffUntilThereAreSome() {
        const auto off = [&] {
            const auto menus = openMenus();
            const auto& items = itemsOf(menus, "Sequence");
            const auto row = std::find_if(items.begin(), items.end(), [](const auto& item) { return item.action == "assist.removeFillers"; });
            return row != items.end() && !row->enabled && !row->disabledReason.isEmpty();
        };
        QVERIFY(off());
        patch("c", {{"caption", QJsonObject{{"words", QJsonArray{QJsonObject{{"word", "um"}, {"startMs", 1100}, {"endMs", 1200}}}}}}});
        QVERIFY(!off());
        nt::app::ShellMenus menus;
        menus.setAnchor(view->rootObject());
        const int before = model.undoStack()->count();
        QVERIFY(menus.trigger("assist.removeFillers"));
        QCOMPARE(model.undoStack()->count(), before + 1);
    }
    // What the clip's context menu adds in this pass, with real clicks. Each runs on the clicked clip.
    void clipMenuCopyAndCutTheSelection() {
        gestures()->setSelection({"c", "e"});
        auto* menu = popup("clip", "clip-c"); QVERIFY(menu);
        QVERIFY(!entries(menu).contains("clipMenu-pasteAttributes:Paste attributes…"));
        trigger("clipMenu-copy");
        QVERIFY(nt::edit::clipboard::hasClipboardClips());
        menu = popup("clip", "clip-c"); QVERIFY(menu);
        QVERIFY(entries(menu).contains("clipMenu-pasteAttributes:Paste attributes…"));
        trigger("clipMenu-cut");
        QVERIFY(clip("c").isEmpty());
        QVERIFY(clip("e").isEmpty());
        QCOMPARE(model.undoStack()->count(), 1);
        nt::edit::clipboard::clearClipClipboard();
    }
    void clipMenuGroupsTheSelection() {
        patch("e", {{"locked", false}});
        auto* menu = popup("clip", "clip-c"); QVERIFY(menu);
        QVERIFY(!entries(menu).contains("clipMenu-groupClips:Group"));
        QVERIFY(QMetaObject::invokeMethod(menu, "close"));
        QTRY_VERIFY(!menu->property("visible").toBool());
        gestures()->setSelection({"c", "e"});
        menu = popup("clip", "clip-c"); QVERIFY(menu);
        trigger("clipMenu-groupClips");
        QCOMPARE(gestures()->selection().size(), 1);
        const auto group = gestures()->selection().first();
        menu = popup("clip", "clip-" + group); QVERIFY(menu);
        trigger("clipMenu-ungroupClips");
        QVERIFY(gestures()->selection().isEmpty());
        QCOMPARE(model.undoStack()->count(), 2);
    }
    // A row that can never work on this clip stays out of its menu. It keeps the menu short.
    void clipMenuFollowsTheClip_data() {
        QTest::addColumn<QString>("mediaType");
        QTest::addColumn<QStringList>("present");
        QTest::addColumn<QStringList>("absent");
        QTest::newRow("video") << "video"
            << QStringList{"clipMenu-Use as reference:Use as reference", "registryMenu-clip-frameHoldAdd:Add frame hold",
                           "registryMenu-clip-audioGain:Audio gain…", "registryMenu-clip-sceneEditDetection:Scene edit detection…"}
            << QStringList{"registryMenu-clip-remixClip:Remix…"};
        QTest::newRow("audio") << "audio"
            << QStringList{"clipMenu-Audio role:Audio role", "registryMenu-clip-audioGain:Audio gain…", "registryMenu-clip-remixClip:Remix…"}
            << QStringList{"clipMenu-Use as reference:Use as reference", "registryMenu-clip-frameHoldAdd:Add frame hold",
                           "registryMenu-clip-sceneEditDetection:Scene edit detection…"};
        QTest::newRow("image") << "image"
            << QStringList{"clipMenu-Use as reference:Use as reference"}
            << QStringList{"clipMenu-Audio role:Audio role", "registryMenu-clip-frameHoldAdd:Add frame hold",
                           "registryMenu-clip-audioGain:Audio gain…", "registryMenu-clip-remixClip:Remix…"};
    }
    void clipMenuFollowsTheClip() {
        QFETCH(QString, mediaType);
        QFETCH(QStringList, present);
        QFETCH(QStringList, absent);
        patch("c", {{"mediaType", mediaType}});
        auto* menu = popup("clip", "clip-c"); QVERIFY(menu);
        const auto list = entries(menu);
        for (const auto& row : present) { QVERIFY2(list.contains(row), qPrintable(row + " in " + list.join(", "))); }
        for (const auto& row : absent) { QVERIFY2(!list.contains(row), qPrintable(row)); }
        // In a window of this size, nothing is cut off.
        QTRY_VERIFY(menu->property("opened").toBool());
        QVERIFY(menu->property("height").toDouble() < view->height());
        QVERIFY2(menu->property("implicitHeight").toDouble() <= view->height(), qPrintable(QString::number(menu->property("implicitHeight").toDouble())));
    }
    void clipMenuAudioRoleSubmenu() {
        patch("c", {{"mediaType", "audio"}});
        auto* menu = popup("clip", "clip-c"); QVERIFY(menu);
        QTRY_VERIFY(menu->property("opened").toBool());
        QVERIFY(item("clipMenu-Audio role"));
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("clipMenu-Audio role")));
        QTRY_VERIFY(item("clipSubmenu-audioRole.music") && item("clipSubmenu-audioRole.music")->isVisible());
        QTRY_VERIFY(item("clipSubmenu-audioRole.music")->width() > 0);
        QVERIFY(item("clipSubmenu-audioRole.music")->isEnabled());
        QSignalSpy frame(view.get(), &QQuickWindow::frameSwapped);
        view->update();
        QVERIFY(!frame.isEmpty() || frame.wait(1000));
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("clipSubmenu-audioRole.music")));
        QTRY_COMPARE(model.undoStack()->count(), 1);
        QCOMPARE(clip("c").value("audioRole").toString(), QString("music"));
    }
    void clipMenuReferenceSubmenu() {
        auto* menu = popup("clip", "clip-c"); QVERIFY(menu);
        QTRY_VERIFY(menu->property("opened").toBool());
        QVERIFY(item("clipMenu-Use as reference"));
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("clipMenu-Use as reference")));
        QTRY_VERIFY(item("clipSubmenu-referenceClipFirstFrame") && item("clipSubmenu-referenceClipFirstFrame")->isVisible());
        QCOMPARE(item("clipSubmenu-referenceClipFirstFrame")->property("text").toString(), QString("First frame"));
        // A submenu's row stays once when the menu opens again on another clip.
        QVERIFY(QMetaObject::invokeMethod(menu, "dismiss"));
        QTRY_VERIFY(!menu->property("visible").toBool());
        menu = popup("clip", "clip-c"); QVERIFY(menu);
        QCOMPARE(entries(menu).count("clipMenu-Use as reference:Use as reference"), 1);
    }
    void clipMenuOpensAudioGain() {
        patch("c", {{"mediaType", "audio"}});
        auto* menu = popup("clip", "clip-c"); QVERIFY(menu);
        trigger("registryMenu-clip-audioGain");
        auto* host = item("audioGainHost"); QVERIFY(host);
        auto* dialog = host->findChild<QObject*>("audioGainDialog"); QVERIFY(dialog);
        QTRY_VERIFY(dialog->property("visible").toBool());
    }
    void clipMenuRippleDelete() {
        auto* menu = popup("clip", "clip-c"); QVERIFY(menu);
        trigger("clipMenu-rippleDeleteSelected");
        QVERIFY(clip("c").isEmpty());
        QCOMPARE(clip("d").value("startMs").toDouble(), 3000.0);
        QCOMPARE(model.undoStack()->count(), 1);
    }
    void rulerMarkerRows() {
        auto* menu = popup("ruler", "timeRuler"); QVERIFY(menu);
        QTRY_VERIFY(menu->property("opened").toBool());
        // With no In and Out, this is off and says why.
        auto* inOut = item("registryMenu-ruler-addMarkerInOut"); QVERIFY(inOut);
        QVERIFY(!inOut->isEnabled());
        QVERIFY(!inOut->property("reasonText").toString().isEmpty());
        // Remove filler words is left out until there is a filler word.
        QVERIFY(!item("registryMenu-ruler-assist.removeFillers"));
        trigger("registryMenu-ruler-addRangeMarker");
        QCOMPARE(model.markersJson().size(), 1);
        QVERIFY(model.markersJson().first().toObject().value("durationMs").toDouble() > 0);
    }
    // With NT_MENU_SHOTS set to a folder, saves how the new menus look, for a person to check.
    void menuPictures() {
        const auto folder = qEnvironmentVariable("NT_MENU_SHOTS");
        if (folder.isEmpty()) { QSKIP("NT_MENU_SHOTS is not set"); }
        const auto save = [&](const QString& name) {
            QSignalSpy frame(view.get(), &QQuickWindow::frameSwapped);
            view->update();
            QCoreApplication::processEvents();
            frame.wait(500);
            QVERIFY(view->grabWindow().save(folder + "/" + name + ".png"));
        };
        patch("c", {{"labelColor", "#E5484D"}, {"width", 320}, {"height", 360}});
        patch("e", {{"labelColor", "#3E63DD"}, {"locked", true}});
        auto* menu = popup("clip", "clip-c"); QVERIFY(menu);
        QTRY_VERIFY(menu->property("opened").toBool());
        save("clip-menu");
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("clipMenu-label")));
        QTRY_VERIFY(item("clipLabelMenu-clipLabel.red"));
        save("clip-label-submenu");
        QVERIFY(QMetaObject::invokeMethod(menu, "close"));
        QTRY_VERIFY(!menu->property("visible").toBool());
        menu = popup("clip", "clip-e"); QVERIFY(menu);
        QTRY_VERIFY(menu->property("opened").toBool());
        save("clip-menu-locked");
        QVERIFY(QMetaObject::invokeMethod(menu, "close"));
        QTRY_VERIFY(!menu->property("visible").toBool());
        menu = popup("ruler", "timeRuler"); QVERIFY(menu);
        QTRY_VERIFY(menu->property("opened").toBool());
        save("ruler-menu");
        QVERIFY(QMetaObject::invokeMethod(menu, "close"));
        QTRY_VERIFY(!menu->property("visible").toBool());
        menu = popup("lane", "trackLane-v", 400); QVERIFY(menu);
        QTRY_VERIFY(menu->property("opened").toBool());
        save("gap-menu");
        QVERIFY(QMetaObject::invokeMethod(menu, "close"));
        QTRY_VERIFY(!menu->property("visible").toBool());
        QTest::mouseClick(view.get(), Qt::RightButton, Qt::NoModifier, center(named(item("clip-c"), "clipTrimEnd")));
        menu = item("trackLane-v")->findChild<QObject*>("registryContextMenu-editPoint"); QVERIFY(menu);
        QTRY_VERIFY(menu->property("opened").toBool());
        save("edit-point-menu");
    }
    // These two change the registry for the rest of the process, so they stay last.
    void groupsAndOrderInRulerMenu() {
        MenuRegistry registry;
        nt::app::registerMenuItem({"ruler", "selectAll", "Select all clips", "Ctrl+A", {}, "zExtension", 200});  // may be registered already
        QVERIFY(nt::app::registerMenuItem({"ruler", "test.ruler.later", "Later", {}, {}, "second", 30}));
        QVERIFY(nt::app::registerMenuItem({"ruler", "test.ruler.first", "First", {}, {}, "first", 20}));
        QVERIFY(nt::app::registerMenuItem({"ruler", "test.ruler.alsoFirst", "Also first", {}, {}, "first", 40}));
        QVERIFY(nt::app::registerMenuItem({"ruler", "test.ruler.tick", "Tick", {}, {}, "second", 50,
            [](const QVariantMap&) { return true; }}));
        QStringList expected;
        for (const auto& value : registry.query("ruler", {})) {
            const auto entry = value.toMap();
            if (entry.value("separatorBefore").toBool()) {
                expected.append("registryMenuGroup-ruler-" + entry.value("group").toString() + ":");
            }
            expected.append("registryMenu-ruler-" + entry.value("action").toString() + ":" + entry.value("label").toString());
        }
        const auto first = expected.indexOf("registryMenu-ruler-test.ruler.first:First");
        QCOMPARE(expected.at(first + 1), QString("registryMenu-ruler-test.ruler.alsoFirst:Also first"));
        const auto second = expected.indexOf("registryMenuGroup-ruler-second:");
        QCOMPARE(expected.mid(second + 1, 2), QStringList({"registryMenu-ruler-test.ruler.later:Later",
            "registryMenu-ruler-test.ruler.tick:Tick"}));
        QVERIFY(first < second);
        auto* menu = popup("ruler", "timeRuler"); QVERIFY(menu);
        QTRY_VERIFY(menu->property("visible").toBool());
        QCOMPARE(entries(menu), expected);
        QVERIFY(item("registryMenu-ruler-test.ruler.tick")->property("checkable").toBool());
        QVERIFY(item("registryMenu-ruler-test.ruler.tick")->property("checked").toBool());
        QVERIFY(!item("registryMenu-ruler-test.ruler.first")->property("checkable").toBool());
        // Reopening does not add a second set of separators.
        QVERIFY(QMetaObject::invokeMethod(menu, "close"));
        QTRY_VERIFY(!menu->property("visible").toBool());
        menu = popup("ruler", "timeRuler"); QVERIFY(menu);
        QTRY_VERIFY(menu->property("visible").toBool());
        QCOMPARE(entries(menu), expected);
        trigger("registryMenu-ruler-selectAll"); QCOMPARE(gestures()->selection().size(), 5);
    }
    void groupsInClipMenuStayAboveDelete() {
        QVERIFY(nt::app::registerMenuItem({"clip", "selectAll", "Select all clips", {}, {}, "zSelect", 100}));
        auto* menu = popup("clip", "clip-c"); QVERIFY(menu);
        QTRY_VERIFY(menu->property("visible").toBool());
        const auto list = entries(menu);
        const auto group = list.indexOf("registryMenuGroup-clip-zSelect:");
        QVERIFY2(group > 0, qPrintable(list.join(',')));
        QCOMPARE(list.at(group + 1), QString("registryMenu-clip-selectAll:Select all clips"));
        QCOMPARE(list.mid(group + 2), QStringList({"clipMenu-deleteDivider:", "clipMenu-rippleDeleteSelected:Ripple delete", "clipMenu-deleteSelected:Delete"}));
        trigger("registryMenu-clip-selectAll"); QCOMPARE(gestures()->selection().size(), 5);
        // The separator goes with its item when the menu's model changes.
        patch("c", {{"locked", true}});
        menu = popup("clip", "clip-c"); QVERIFY(menu);
        QTRY_VERIFY(menu->property("visible").toBool());
        const auto changed = entries(menu);
        QVERIFY(!changed.contains("clipMenu-toggleClipEnabled:Disable"));
        QCOMPARE(changed.count("registryMenuGroup-clip-zSelect:"), 1);
        QCOMPARE(changed.mid(changed.indexOf("registryMenuGroup-clip-zSelect:") + 1, 1),
                 QStringList("registryMenu-clip-selectAll:Select all clips"));
    }
};
QTEST_MAIN(TestMenus)
#include "tst_menus.moc"
