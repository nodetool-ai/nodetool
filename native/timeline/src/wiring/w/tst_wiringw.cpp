#include "wiring/WiringFixture.h"
#include "app/EditRegistry.h"
#include "app/Menus/ShellMenus.h"
#include "edit/Keymap.h"
#include "export/ExportController.h"
#include "export/ExportQueue.h"
#include <QScopeGuard>
#include <QAccessible>
#include <QElapsedTimer>
#include <QJSValue>
#include <QFile>
#include <QTemporaryDir>
#include <algorithm>

class TestWiringW : public WiringFixture {
    Q_OBJECT
    QByteArray fixtureDocument;
    QElapsedTimer suiteTimer;
    QElapsedTimer stepTimer;
    QStringList timings;
    void checkpoint(const QString& label) {
        const auto elapsed = stepTimer.restart();
        const auto timing = QStringLiteral("%1=%2ms").arg(label).arg(elapsed);
        timings.append(timing);
        if (elapsed > 1000) { qInfo().noquote() << timing; }
    }
    QString diagnostics() const {
        auto* focus = view ? view->activeFocusItem() : nullptr;
        return QStringLiteral("selection=[%1], activeFocusItem=%2(%3), windowActive=%4, speedDurationHost=%5; %6")
            .arg(view && gestures() ? gestures()->selection().join(',') : QStringLiteral("no gestures"))
            .arg(focus ? QString::fromLatin1(focus->metaObject()->className()) : QStringLiteral("null"))
            .arg(focus ? focus->objectName() : QString())
            .arg(view && view->isActive())
            .arg(view && object("speedDurationHost") != nullptr)
            .arg(timings.join(", "));
    }
    void click(const QString& name, Qt::KeyboardModifiers mods = Qt::NoModifier) {
        WiringFixture::click(name, mods);
        checkpoint("click " + name);
    }
    static QObject* ownedInScene(QQuickItem* root, const QString& name) {
        if (root->objectName() == name) { return root; }
        if (auto* found = root->findChild<QObject*>(name)) { return found; }
        for (auto* child : root->childItems()) {
            if (auto* found = ownedInScene(child, name)) { return found; }
        }
        return nullptr;
    }
    QObject* object(const QString& name) const { return ownedInScene(view->contentItem(), name); }
    static QQuickItem* shortcutRow(QQuickItem* root) {
        const auto data = root->property("modelData");
        const auto row = data.canConvert<QJSValue>() ? data.value<QJSValue>().toVariant().toMap() : data.toMap();
        if (row.value("id") == "speedDuration") { return root; }
        for (auto* child : root->childItems()) {
            if (auto* found = shortcutRow(child)) { return found; }
        }
        return nullptr;
    }
    QJsonArray effects(const QString& id = "a") const { return track(id).value("effects").toArray(); }
    QString effectId(int index = 0) const { return effects().at(index).toObject().value("id").toString(); }
    nt::MixerReturn::Snapshot gainOverride(const QString& id) const {
        const auto snapshot = model.snapshot();
        const auto* channel = snapshot->findTrack("a");
        nt::MixerReturn::Snapshot value;
        if (channel) {
            for (const auto& parameter : channel->deviceParameters) {
                if (parameter.deviceId == id.toStdString() && parameter.name == "gainDb") {
                    parameter.state->volumeReturn.read(value);
                    break;
                }
            }
        }
        return value;
    }
    void add(const QString& type) { click("fx-add-a"); click("fx-add-type-a-" + type); }
private slots:
    void initTestCase() {
        suiteTimer.start();
        stepTimer.start();
        // Keep one real editor and render context, as in the app. Reset the
        // document between cases instead of rebuilding the entire scene/QRhi.
        open();
        QVERIFY(view);
        QVERIFY(view->rootObject());
        fixtureDocument = model.documentJson();
        view->resize(1800, 1500);
        QTRY_COMPARE(view->rootObject()->size(), QSizeF(view->size()));
        checkpoint("open and resize");
    }
    void init() {
        timings.clear();
        stepTimer.restart();
        auto parsed = nt::parseTimelineJson(fixtureDocument);
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        gestures()->setSelection({});
        clock.seek(1500);
        gestures()->viewState()->zoomTo(10, 0);
        gestures()->viewState()->setScrollLeftPx(0);
        gestures()->viewState()->setScrollTopPx(0);
        gestures()->viewState()->flush();
        // Exposure does not imply activation on X11. Only the test requests it.
        view->requestActivate();
        QVERIFY2(QTest::qWaitForWindowActive(view.get()), qPrintable(diagnostics()));
        view->rootObject()->forceActiveFocus();
        QTRY_VERIFY2(view->rootObject()->hasActiveFocus(), qPrintable(diagnostics()));
        checkpoint("reset and activate");
    }
    void cleanup() {
        const bool failed = QTest::currentTestFailed();
        checkpoint("assertions");
        // On a platform with no native file dialog this is a modal popup, which would take every
        // click of the next case.
        if (auto* saveDialog = object("exportSaveDialog"); saveDialog && saveDialog->property("visible").toBool()) {
            QVERIFY(QMetaObject::invokeMethod(saveDialog, "close"));
            QTRY_VERIFY(!saveDialog->property("visible").toBool());
        }
        // Close dialogs, menus and the shortcut sheet through their real keys.
        QTest::keyClick(view.get(), Qt::Key_Escape);
        QTest::keyClick(view.get(), Qt::Key_Escape);
        for (const auto* id : {"a", "v", "w"}) {
            auto* button = item("track-fx-" + QString::fromLatin1(id));
            if (button && button->property("expanded").toBool()) { click(button->objectName()); }
        }
        if (failed || suiteTimer.elapsed() > 45000) { qInfo().noquote() << diagnostics(); }
    }
    void cleanupTestCase() {
        view.reset();
        checkpoint("destroy editor");
    }
    void exportButton() {
        QTRY_VERIFY(item("exportButton"));
        auto* button = item("exportButton");
        QCOMPARE(button->property("text").toString(), QString("Export"));
        auto* bar = item("documentBar"); QVERIFY(bar);
        // Export sits to the left of the project settings, the last control in the bar.
        QTRY_VERIFY(item("projectSettingsButton"));
        auto* settings = item("projectSettingsButton");
        QVERIFY(button->mapToItem(bar, {button->width(), 0}).x() < settings->mapToItem(bar, {0, 0}).x());
        QCOMPARE(settings->mapToItem(bar, {settings->width(), 0}).x(), bar->width() - 8);
        QVERIFY(button->height() >= 28.0);
        auto* controller = qobject_cast<ExportController*>(object("exportController")); QVERIFY(controller);
        QSignalSpy opened(controller, &ExportController::openRequested);
        click("exportButton");
        QCOMPARE(opened.count(), 1);
        QVERIFY(object("exportVideoDialog")->property("visible").toBool());
        QTest::keyClick(view.get(), Qt::Key_Escape);
        // A process fixture keeps running without rendering, network or audio.
        // The queue runs it in the background, and the editor keeps its Export button.
        auto* queue = qobject_cast<ExportQueue*>(object("exportQueue")); QVERIFY(queue);
        QTemporaryDir temporary;
        queue->setExecutable(QCoreApplication::applicationFilePath());
        const auto id = queue->enqueue(temporary.filePath("out.wav"), {{"format", "wav"}});
        QVERIFY2(!id.isEmpty(), qPrintable(queue->lastError()));
        QTRY_VERIFY(queue->running());
        QCOMPARE(button->property("text").toString(), QString("Export"));
        QVERIFY(button->isEnabled());
        QVERIFY(!button->property("loading").toBool());
        click("exportButton");
        QCOMPARE(opened.count(), 2);
        QVERIFY(object("exportVideoDialog")->property("visible").toBool());
        QTest::keyClick(view.get(), Qt::Key_Escape);
        queue->cancel(id);
        QTRY_VERIFY(!queue->running());
    }
    void exportMenu() {
        // Premiere binds Ctrl+M to Add Marker at In and Out, so the export key
        // is checked under the Final Cut preset.
        const auto menus = nt::app::shellMenuDescription("fcp");
        const auto& items = menus.front().items;
        QVERIFY(items.size() >= 3);
        const auto recentItem = items.begin();
        const auto exportItem = std::ranges::find(items, QString("exportVideo"), &nt::app::ShellMenuItem::action);
        const auto settingsItem = std::ranges::find(items, QString("settings"), &nt::app::ShellMenuItem::action);
        QVERIFY(exportItem != items.end());
        QVERIFY(settingsItem != items.end());
        QCOMPARE(recentItem->label, QString("Open Recent"));
        QCOMPARE(exportItem->label, QString("Export…"));
        QCOMPARE(exportItem->action, QString("exportVideo"));
        QCOMPARE(exportItem->sequence, QKeySequence(Qt::CTRL | Qt::Key_M));
        QCOMPARE(settingsItem->label, QString("Settings…"));
        QVERIFY(recentItem < exportItem);
        QVERIFY(exportItem < settingsItem);
        auto* shell = item("appShell"); QVERIFY(shell);
        auto* menu = shell->findChild<nt::app::ShellMenus*>(); QVERIFY(menu);
        auto* controller = qobject_cast<ExportController*>(object("exportController")); QVERIFY(controller);
        QSignalSpy opened(controller, &ExportController::openRequested);
        QVERIFY(menu->trigger("exportVideo"));
        QCOMPARE(opened.count(), 1);
        QVERIFY(object("exportVideoDialog")->property("visible").toBool());
    }
    void exportShortcutRangeAndPresets() {
        auto* panel = object("exportPanel"); QVERIFY(panel);
        auto* dialog = object("exportVideoDialog"); QVERIFY(dialog);
        const auto settings = [&] {
            QVariant value;
            QMetaObject::invokeMethod(panel, "currentSettings", Q_RETURN_ARG(QVariant, value));
            return value.value<QJSValue>().toVariant().toMap();
        };
        // Ctrl+M opens the full dialog where the preset leaves it free. With no marks it exports the whole timeline.
        gestures()->setKeyboardPreset("fcp");
        const auto restorePreset = qScopeGuard([this] { gestures()->setKeyboardPreset("premiere"); });
        clock.clearRange();
        QTest::keyClick(view.get(), Qt::Key_M, Qt::ControlModifier);
        QTRY_VERIFY(dialog->property("visible").toBool());
        QCOMPARE(panel->property("rangeMode").toString(), QString("all"));
        QCOMPARE(settings().value("startMs").toDouble(), 0.0);
        QCOMPARE(settings().value("endMs").toDouble(), -1.0);
        QTest::keyClick(view.get(), Qt::Key_Escape);
        QTRY_VERIFY(!dialog->property("visible").toBool());
        // With marks it defaults to In to Out, and a preset sets the picture.
        clock.setRangeIn(1000);
        clock.setRangeOut(2500);
        QTest::keyClick(view.get(), Qt::Key_M, Qt::ControlModifier);
        QTRY_VERIFY(dialog->property("visible").toBool());
        QCOMPARE(panel->property("rangeMode").toString(), QString("inout"));
        QCOMPARE(settings().value("startMs").toDouble(), 1000.0);
        QCOMPARE(settings().value("endMs").toDouble(), 2500.0);
        QVERIFY(QMetaObject::invokeMethod(panel, "applyPreset", Q_ARG(QVariant, QString("vertical-9x16"))));
        QCOMPARE(settings().value("width").toInt(), 1080);
        QCOMPARE(settings().value("height").toInt(), 1920);
        QCOMPARE(panel->property("presetId").toString(), QString("vertical-9x16"));
        QVERIFY(panel->setProperty("format", "webm"));
        QCOMPARE(panel->property("presetId").toString(), QString());
        QCOMPARE(panel->property("rangeSummary").toString().contains("45 frames"), true);
        QSignalSpy requested(panel, SIGNAL(exportRequested(QVariant)));
        QVERIFY(QMetaObject::invokeMethod(panel, "confirmExport"));
        QCOMPARE(requested.count(), 1);
        // Without a native file dialog this is a modal popup over the editor, as on any platform's offscreen plugin.
        auto* saveDialog = object("exportSaveDialog"); QVERIFY(saveDialog);
        QTRY_VERIFY(saveDialog->property("visible").toBool());
        QVERIFY(QMetaObject::invokeMethod(saveDialog, "close"));
        QTRY_VERIFY(!saveDialog->property("visible").toBool());
        const auto sent = requested.first().first().toMap();
        QCOMPARE(sent.value("format").toString(), QString("webm"));
        QCOMPARE(sent.value("startMs").toDouble(), 1000.0);
        QCOMPARE(sent.value("height").toInt(), 1920);
        QCOMPARE(sent.value("scaleMode").toString(), QString("fit"));
        // The Quick Export button repeats the last settings over the marked range.
        QVERIFY(item("quickExportButton"));
        requested.clear();
        click("quickExportButton");
        QCOMPARE(requested.count(), 1);
        const auto quick = requested.first().first().toMap();
        QCOMPARE(quick.value("format").toString(), QString("webm"));
        QCOMPARE(quick.value("width").toInt(), 1080);
        QCOMPARE(quick.value("startMs").toDouble(), 1000.0);
        QCOMPARE(quick.value("endMs").toDouble(), 2500.0);
        QTRY_VERIFY(saveDialog->property("visible").toBool());
        QVERIFY(QMetaObject::invokeMethod(saveDialog, "close"));
        QTRY_VERIFY(!saveDialog->property("visible").toBool());
        clock.clearRange();
    }
    void panelPlacement() {
        QVERIFY(item("track-fx-a"));
        auto* header = item("track-fx-a");
        auto* accessible = QAccessible::queryAccessibleInterface(header); QVERIFY(accessible);
        QCOMPARE(accessible->text(QAccessible::Name), QString("Show effects chain"));
        QCOMPARE(header->property("tone").toString(), QString("dim"));
        QCOMPARE(header->property("toolTip").toString(), QString("Effects chain (empty)"));
        const auto before = item("lanesContent")->height();
        click("track-fx-a");
        QTRY_VERIFY(item("track-effects-panel-a") && item("track-effects-panel-a")->isVisible());
        QVERIFY(item("dockTab_trackEffects") && item("dockTab_trackEffects")->isVisible());
        // Effect chain opens in its own dock panel rather than expanding under the track lane.
        QCOMPARE(item("lanesContent")->height(), before);
        QVERIFY(item("trackLane-a") && item("trackLane-a")->isVisible());
        QCOMPARE(accessible->text(QAccessible::Name), QString("Hide effects chain"));
        QVERIFY(accessible->state().checked);
        QCOMPARE(header->property("tone").toString(), QString("idle"));
        click("track-fx-a");
        QTRY_VERIFY(!item("track-effects-panel-a") || !item("track-effects-panel-a")->isVisible());
        QCOMPARE(item("lanesContent")->height(), before);
        click("track-fx-a");
        QTRY_VERIFY(item("track-effects-panel-a") && item("track-effects-panel-a")->isVisible());
        click("track-fx-v");
        QTRY_VERIFY(item("track-effects-panel-v") && item("track-effects-panel-v")->isVisible());
        QVERIFY(!item("track-effects-panel-a"));
        click("fx-add-v");
        for (const auto* type : {"colorCorrection", "videoBlur", "sharpen", "vignette", "chromaKey"}) {
            QVERIFY(item("fx-add-type-v-" + QString::fromLatin1(type)));
        }
        QVERIFY(!item("fx-add-type-v-gain"));
    }
    void cancelKnobDragRestoresDraft() {
        QVERIFY(item("track-fx-a")); click("track-fx-a"); add("gain");
        const auto id = effectId();
        const auto before = doc();
        const int undoCount = model.undoStack()->count();
        auto *knob = item("fx-knob-" + id + "-gainDb"); QVERIFY(knob);
        const auto from = knob->mapToScene({knob->width() / 2, 20}).toPoint();
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, from);
        QTest::mouseMove(view.get(), from - QPoint(0, 10), 20);
        QVERIFY(knob->property("dragging").toBool());
        QCOMPARE(doc(), before);
        QVERIFY(gainOverride(id).active(0));
        QVERIFY(gainOverride(id).at(0) != 0);
        QCOMPARE(model.undoStack()->count(), undoCount);
        knob->setEnabled(false);
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, from - QPoint(0, 10));
        QCOMPARE(doc(), before);
        QVERIFY(!gainOverride(id).active(0));
        QCOMPARE(model.undoStack()->count(), undoCount);
        knob->setEnabled(true);
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, from);
        QTest::mouseMove(view.get(), from - QPoint(0, 10), 20);
        QCOMPARE(doc(), before);
        QVERIFY(gainOverride(id).active(0));
        QVERIFY(gainOverride(id).at(0) != 0);
        QTest::keyClick(view.get(), Qt::Key_Escape);
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, from - QPoint(0, 10));
        QCOMPARE(doc(), before);
        QVERIFY(!gainOverride(id).active(0));
        QCOMPARE(model.undoStack()->count(), undoCount);
    }
    void cancelCurveDragRestoresDraft_data() {
        QTest::addColumn<QString>("effectType");
        QTest::addColumn<QString>("handleName");
        QTest::newRow("EQ") << QString("eq3") << QString("mid");
        QTest::newRow("Compressor") << QString("compressor") << QString("threshold");
    }
    void cancelCurveDragRestoresDraft() {
        QFETCH(QString, effectType);
        QFETCH(QString, handleName);
        QVERIFY(item("track-fx-a")); click("track-fx-a");
        QVERIFY(model.applyEdit("addTrackEffect", {{"trackId", "a"}, {"effect", effectType}}));
        QTRY_COMPARE(effects().size(), 1);
        const auto id = effectId();
        const auto before = doc();
        const int undoCount = model.undoStack()->count();
        const auto handleId = "fx-handle-" + id + "-" + handleName;
        QTRY_VERIFY(item(handleId));
        auto *handle = item(handleId);
        const auto from = center(handle);
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, from);
        QTest::mouseMove(view.get(), from - QPoint(0, 15), 20);
        handle->setEnabled(false);
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, from - QPoint(0, 15));
        QCOMPARE(doc(), before);
        QCOMPARE(model.undoStack()->count(), undoCount);
        handle->setEnabled(true);
    }
    void cancelCurveKeyRestoresDraft_data() { cancelCurveDragRestoresDraft_data(); }
    void cancelCurveKeyRestoresDraft() {
        QFETCH(QString, effectType);
        QFETCH(QString, handleName);
        QVERIFY(item("track-fx-a")); click("track-fx-a");
        QVERIFY(model.applyEdit("addTrackEffect", {{"trackId", "a"}, {"effect", effectType}}));
        QTRY_COMPARE(effects().size(), 1);
        const auto id = effectId();
        const auto before = doc();
        const int undoCount = model.undoStack()->count();
        const auto handleId = "fx-handle-" + id + "-" + handleName;
        QTRY_VERIFY(item(handleId));
        auto *handle = item(handleId);
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(handle));
        QTest::keyPress(view.get(), Qt::Key_Up);
        QTest::keyClick(view.get(), Qt::Key_Escape);
        QTest::keyRelease(view.get(), Qt::Key_Up);
        QCOMPARE(doc(), before);
        QCOMPARE(model.undoStack()->count(), undoCount);
    }
    void saveShot(const QString& name) {
        const auto dir = qEnvironmentVariable("NT_SHOT_DIR");
        if (dir.isEmpty()) { return; }
        QVERIFY(view->grabWindow().save(dir + "/" + name + ".png"));
    }
    static QStringList menuSections(QQuickItem* list) {
        QStringList out;
        for (const auto& line : list->property("model").toList()) {
            const auto row = line.toMap();
            if (row.value("kind") == "header") { out.append(row.value("label").toString()); }
        }
        return out;
    }
    void instrumentMenu() {
        auto document = QJsonDocument::fromJson(fixtureDocument).object();
        auto tracks = document.value("tracks").toArray();
        tracks.append(QJsonObject{{"id", "m"}, {"name", "Keys"}, {"type", "midi"}, {"index", 3}, {"heightPx", 80},
                                  {"visible", true}, {"locked", false}, {"muted", false}, {"solo", false},
                                  {"instrument", QJsonObject{{"type", "subtractive"}}}});
        document.insert("tracks", tracks);
        auto parsed = nt::parseTimelineJson(QJsonDocument(document).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        const auto instrument = [this] { return track("m").value("instrument").toObject(); };
        QTRY_VERIFY(item("track-fx-m"));
        click("track-fx-m");
        QTRY_VERIFY(item("instrument-menu-m") && item("instrument-menu-m")->isVisible());
        QVERIFY(item("subtractive-note"));
        const auto before = doc();
        const auto undoBase = model.undoStack()->count();
        click("instrument-menu-m");
        QTRY_VERIFY(item("instrument-item-m-list") && item("instrument-item-m-list")->isVisible());
        QCOMPARE(menuSections(item("instrument-item-m-list")), QStringList({"Built-in", "Plug-ins"}));
        for (const auto* type : {"drum", "bass", "wavetable", "sampler", "modal", "subtractive"}) {
            QTRY_VERIFY2(item("instrument-item-m-" + QString::fromLatin1(type)), type);
        }
        saveShot("instrument-menu");
        click("instrument-item-m-bass");
        QTRY_COMPARE(instrument().value("type").toString(), QString("bass"));
        QVERIFY(!instrument().value("preset").toString().isEmpty());
        QCOMPARE(model.undoStack()->count(), undoBase + 1);
        QTRY_VERIFY(item("bassSynthPanel") && item("bassSynthPanel")->isVisible());
        saveShot("instrument-bass-panel");
        // The search field filters both groups.
        click("instrument-menu-m");
        QTRY_VERIFY(item("instrument-item-m-list") && item("instrument-item-m-list")->isVisible());
        const auto lines = item("instrument-item-m-list")->property("model").toList();
        QString vstKey;
        for (const auto& line : lines) {
            const auto row = line.toMap();
            if (row.value("kind") == "vst") { vstKey = row.value("key").toString(); break; }
        }
        QVERIFY(!vstKey.isEmpty());
        click("instrument-item-m-" + vstKey);
        QTRY_COMPARE(instrument().value("type").toString(), QString("vst"));
        QCOMPARE(model.undoStack()->count(), undoBase + 2);
        click("instrument-menu-m");
        QTRY_VERIFY(item("instrument-item-m-drum"));
        click("instrument-item-m-drum");
        QTRY_COMPARE(instrument().value("type").toString(), QString("drum"));
        QTRY_VERIFY(item("drumKitPanel") && item("drumKitPanel")->isVisible());
        QCOMPARE(model.undoStack()->count(), undoBase + 3);
        model.undoStack()->undo();
        QTRY_COMPARE(instrument().value("type").toString(), QString("vst"));
        model.undoStack()->undo();
        QTRY_COMPARE(instrument().value("type").toString(), QString("bass"));
        model.undoStack()->undo();
        QCOMPARE(doc(), before);
        // The effect menu lists built-in and FableSynth effects with the plug-ins.
        click("fx-add-m");
        QTRY_VERIFY(item("fx-add-type-m-list") && item("fx-add-type-m-list")->isVisible());
        QCOMPARE(menuSections(item("fx-add-type-m-list")), QStringList({"Built-in", "Plug-ins"}));
        QVERIFY(item("fx-add-type-m-reverb"));
        QVERIFY(item("fx-add-type-m-search") && item("fx-add-type-m-search")->isVisible());
        saveShot("effect-menu");
        for (const char key : {'v', 'e', 'r', 'b'}) { QTest::keyClick(view.get(), key); }
        QTRY_COMPARE(item("fx-add-type-m-list")->property("model").toList().size(), 2);
        QTest::keyClick(view.get(), Qt::Key_Return);
        QTRY_COMPARE(effects("m").size(), 1);
        QCOMPARE(effects("m").at(0).toObject().value("type").toString(), QString("fable"));
    }
    void effectEdits() {
        QVERIFY(item("track-fx-a")); click("track-fx-a");
        const auto before = doc();
        add("gain");
        QTRY_COMPARE(effects().size(), 1);
        auto effect = effects()[0].toObject();
        QCOMPARE(effect.value("type").toString(), QString("gain"));
        QCOMPARE(effect.value("gainDb").toDouble(), 0.0);
        QVERIFY(effect.value("enabled").toBool());
        QCOMPARE(model.undoStack()->count(), 1);
        const auto id = effectId();
        auto* unchangedKnob = item("fx-knob-" + id + "-gainDb"); QVERIFY(unchangedKnob);
        QTest::mouseDClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(unchangedKnob));
        QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(item("track-fx-a")->property("toolTip").toString(), QString("Effects chain (1 effect)"));
        click("fx-power-" + id);
        QCOMPARE(effects()[0].toObject().value("enabled").toBool(), false);
        QCOMPARE(model.undoStack()->count(), 2);
        click("track-fx-a");
        QCOMPARE(item("track-fx-a")->property("tone").toString(), QString("dim"));
        click("track-fx-a");
        click("fx-power-" + id);
        auto* knob = item("fx-knob-" + id + "-gainDb"); QVERIFY(knob);
        const auto from = knob->mapToScene({knob->width() / 2, 20}).toPoint();
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, from);
        QTest::mouseMove(view.get(), from - QPoint(0, 10), 20);
        QTest::mouseMove(view.get(), from - QPoint(0, 20), 20);
        QCOMPARE(model.undoStack()->count(), 3);
        QCOMPARE(effects()[0].toObject().value("gainDb").toDouble(), 0.0);
        QVERIFY(gainOverride(id).active(0));
        const double previewGain = gainOverride(id).at(0);
        QVERIFY(previewGain != 0);
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, from - QPoint(0, 20));
        QTRY_COMPARE(effects()[0].toObject().value("gainDb").toDouble(), previewGain);
        QCOMPARE(model.undoStack()->count(), 4);
        add("filter"); QCOMPARE(model.undoStack()->count(), 5);
        click("fx-grip-" + id);
        QTest::keyClick(view.get(), Qt::Key_Right, Qt::AltModifier);
        QTRY_COMPARE(effectId(1), id);
        QCOMPARE(model.undoStack()->count(), 6);
        // Out-of-range reorder has no document or history effect.
        const auto ordered = doc();
        click("fx-grip-" + id);
        QTest::keyClick(view.get(), Qt::Key_Right, Qt::AltModifier);
        QCOMPARE(doc(), ordered); QCOMPARE(model.undoStack()->count(), 6);
        const auto otherId = effectId();
        const auto dropPoint = item("effect-" + otherId)->mapToScene({30,16}).toPoint();
        drag(center(item("fx-grip-" + id)), dropPoint);
        QTRY_COMPARE(effectId(), id);
        QCOMPARE(model.undoStack()->count(), 7);
        click("undoButton"); QCOMPARE(doc(), ordered);
        click("fx-remove-" + id); QCOMPARE(effects().size(), 1);
        click("fx-remove-" + effectId()); QCOMPARE(effects().size(), 0);
        QCOMPARE(model.undoStack()->count(), 8);
        click("undoButton"); QCOMPARE(effects().size(), 1);
        for (int i = 0; i < 7; ++i) { click("undoButton"); }
        QCOMPARE(doc(), before);
    }
    void parameterEditors_data() {
        QTest::addColumn<QString>("trackId");
        QTest::addColumn<QString>("type");
        QTest::addColumn<QString>("field");
        QTest::newRow("EQ curve") << QString("a") << QString("eq3") << QString("midGainDb");
        QTest::newRow("Compressor curve") << QString("a") << QString("compressor") << QString("thresholdDb");
        QTest::newRow("Color") << QString("v") << QString("colorCorrection") << QString("brightness");
        QTest::newRow("Exposure") << QString("v") << QString("colorCorrection") << QString("exposure");
        QTest::newRow("Highlight roll-off") << QString("v") << QString("colorCorrection") << QString("rolloff");
        QTest::newRow("Whites") << QString("v") << QString("colorCorrection") << QString("whites");
        QTest::newRow("Blur") << QString("v") << QString("videoBlur") << QString("radius");
        QTest::newRow("Sharpen") << QString("v") << QString("sharpen") << QString("amount");
        QTest::newRow("Vignette") << QString("v") << QString("vignette") << QString("intensity");
        QTest::newRow("Chroma key") << QString("v") << QString("chromaKey") << QString("tolerance");
    }
    void parameterEditors() {
        QFETCH(QString, trackId); QFETCH(QString, type); QFETCH(QString, field);
        QVERIFY(item("track-fx-" + trackId));
        click("track-fx-" + trackId);
        click("fx-add-" + trackId);
        if (type == "eq3" || type == "compressor") {
            // The menu offers Fable EQ/comp; legacy documents still use these editors.
            QVERIFY(!item("fx-add-type-" + trackId + "-" + type));
            QVERIFY(item("fx-add-type-" + trackId + "-" + (type == "eq3" ? "eq" : "comp")));
            QTest::keyClick(view.get(), Qt::Key_Escape);
            QVERIFY(model.applyEdit("addTrackEffect", {{"trackId", trackId}, {"effect", type}}));
        } else {
            click("fx-add-type-" + trackId + "-" + type);
        }
        QTRY_COMPARE(effects(trackId).size(), 1);
        QCOMPARE(model.undoStack()->count(), 1);
        const auto effect = effects(trackId)[0].toObject();
        const auto id = effect.value("id").toString();
        const auto before = doc();
        const auto target = type == "eq3" ? "fx-handle-" + id + "-mid"
            : type == "compressor" ? "fx-handle-" + id + "-threshold" : "fx-knob-" + id + "-" + field;
        QTRY_VERIFY(item(target));
        const auto from = center(item(target));
        drag(from, from + QPoint(12,-12));
        QTRY_VERIFY(effects(trackId)[0].toObject().value(field) != effect.value(field));
        QCOMPARE(model.undoStack()->count(), 2);
        click("undoButton"); QCOMPARE(doc(), before);
    }
    void softVignettePreset() {
        click("track-fx-v"); click("fx-add-v"); click("fx-add-type-v-vignette");
        QTRY_COMPARE(effects("v").size(),1);
        const auto effect=effects("v")[0].toObject();
        const auto before=doc();
        click("fx-soft-vignette-"+effect["id"].toString());
        const auto changed=effects("v")[0].toObject();
        QCOMPARE(changed["radius"].toDouble(),1.5); QCOMPARE(changed["softness"].toDouble(),1.0);
        QCOMPARE(changed["intensity"],effect["intensity"]);
        QCOMPARE(model.undoStack()->count(),2);
        click("undoButton"); QCOMPARE(doc(),before);
    }
    void numericParameterEditing() {
        click("track-fx-a"); add("gain");
        const auto id = effectId();
        const auto fieldName = "fx-value-" + id + "-gainDb";
        const int before = model.undoStack()->count();
        const auto typeValue = [&](const QByteArray& text) {
            QTRY_VERIFY(item(fieldName));
            click(fieldName);
            QTest::keyClick(view.get(), Qt::Key_A, Qt::ControlModifier);
            for (const char ch : text) { QTest::keyClick(view.get(), ch); }
        };
        typeValue("3.5");
        QCOMPARE(effects()[0].toObject()["gainDb"].toDouble(), 0.0);
        QVERIFY(gainOverride(id).active(0));
        QCOMPARE(gainOverride(id).at(0), 3.5);
        QCOMPARE(model.undoStack()->count(), before);
        QTest::keyClick(view.get(), Qt::Key_Return);
        QCOMPARE(effects()[0].toObject()["gainDb"].toDouble(), 3.5);
        QCOMPARE(model.undoStack()->count(), before + 1);
        model.undoStack()->undo(); QCOMPARE(effects()[0].toObject()["gainDb"].toDouble(), 0.0);
        model.undoStack()->redo(); QCOMPARE(effects()[0].toObject()["gainDb"].toDouble(), 3.5);
        typeValue("999");
        QTest::keyClick(view.get(), Qt::Key_Return);
        QCOMPARE(model.undoStack()->count(), before + 1);
        QTest::keyClick(view.get(), Qt::Key_Escape);
        QCOMPARE(effects()[0].toObject()["gainDb"].toDouble(), 3.5);
        typeValue("-2.4");
        QVERIFY(gainOverride(id).active(0));
        QCOMPARE(gainOverride(id).at(0), -2.4);
        QCOMPARE(effects()[0].toObject()["gainDb"].toDouble(), 3.5);
        QTest::keyClick(view.get(), Qt::Key_Escape);
        QCOMPARE(effects()[0].toObject()["gainDb"].toDouble(), 3.5);
        QVERIFY(!gainOverride(id).active(0));
        const bool wasPlaying = clock.playing();
        click(fieldName);
        QTest::keyClick(view.get(), Qt::Key_Space);
        QCOMPARE(clock.playing(), wasPlaying);
        QTest::keyClick(view.get(), Qt::Key_Escape);
        QCOMPARE(model.undoStack()->count(), before + 1);
    }
    QString addFable(const QString& kind) {
        const auto count = effects().size();
        add(kind);
        if (effects().size() != count + 1) { return {}; }
        return effects().last().toObject().value("id").toString();
    }
    QJsonObject fableParams() const { return effects()[0].toObject().value("params").toObject(); }
    void fableEditors_data() {
        QTest::addColumn<QString>("kind");
        QTest::addColumn<QString>("knob");
        for (const auto& [kind, knob] : std::initializer_list<std::pair<const char*, const char*>>{
                 {"eq", "fx.eq.mid"}, {"ott", "fx.ott.depth"}, {"comp", "fx.comp.thr"}, {"drive", "fx.drive.amt"}, {"lab", "fx.crush.bits"},
                 {"chorus", "fx.chorus.rate"}, {"echo", "fx.delay.fb"}, {"reverb", "fx.reverb.size"}, {"limiter", "fx.limit.ceil"}}) {
            QTest::newRow(kind) << QString(kind) << QString(knob);
        }
    }
    void fableEditors() {
        QFETCH(QString, kind); QFETCH(QString, knob);
        click("track-fx-a");
        const auto id = addFable(kind);
        QVERIFY(!id.isEmpty());
        QTRY_VERIFY(item("fable-editor-" + id));
        // Every parameter has a knob, a choice or a switch.
        const auto params = fableParams();
        QVERIFY(!params.isEmpty());
        for (auto it = params.begin(); it != params.end(); ++it) {
            const auto suffix = id + "-" + it.key();
            QVERIFY2(item("fable-knob-" + suffix) || item("fable-enum-" + suffix) || item("fable-toggle-" + suffix), qPrintable(suffix));
        }
        saveShot("fable-" + kind);
        // One drag is one undo step that changes only that parameter.
        const auto before = params;
        const int undoCount = model.undoStack()->count();
        auto* dial = item("fable-knob-" + id + "-" + knob);
        QVERIFY(dial); QVERIFY(dial->isEnabled());
        const auto from = dial->mapToScene({dial->width() / 2, 20}).toPoint();
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, from);
        QTest::mouseMove(view.get(), from - QPoint(0, 15), 20);
        QTest::mouseMove(view.get(), from - QPoint(0, 30), 20);
        QCOMPARE(model.undoStack()->count(), undoCount);
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, from - QPoint(0, 30));
        QTRY_COMPARE(model.undoStack()->count(), undoCount + 1);
        const auto after = fableParams();
        QVERIFY(after.value(knob).toDouble() != before.value(knob).toDouble());
        for (auto it = before.begin(); it != before.end(); ++it) {
            if (it.key() != knob) { QCOMPARE(after.value(it.key()), it.value()); }
        }
        model.undoStack()->undo();
        QCOMPARE(fableParams(), before);
    }
    void fableChoicesAndSwitches() {
        click("track-fx-a");
        const auto id = addFable("echo");
        QVERIFY(!id.isEmpty());
        QTRY_VERIFY(item("fable-enum-" + id + "-fx.delay.mode"));
        const int undoCount = model.undoStack()->count();
        // A long choice is a select. Its commit is one undo step.
        QVERIFY(QMetaObject::invokeMethod(item("fable-enum-" + id + "-fx.delay.mode"), "valueCommitted", Q_ARG(QVariant, 1)));
        QTRY_COMPARE(fableParams().value("fx.delay.mode").toDouble(), 1.0);
        QCOMPARE(model.undoStack()->count(), undoCount + 1);
        // SYNC enables the division and disables the free time knob.
        QVERIFY(item("fable-knob-" + id + "-fx.delay.time")->isEnabled());
        click("fable-toggle-" + id + "-fx.delay.sync");
        QTRY_COMPARE(fableParams().value("fx.delay.sync").toDouble(), 1.0);
        QCOMPARE(model.undoStack()->count(), undoCount + 2);
        QTRY_VERIFY(!item("fable-knob-" + id + "-fx.delay.time")->isEnabled());
        model.undoStack()->undo();
        QCOMPARE(fableParams().value("fx.delay.sync").toDouble(), 0.0);
        // A section switch turns its knobs off.
        QVERIFY(model.applyEdit("removeTrackEffect", {{"trackId", "a"}, {"effectId", id}}));
        QTRY_COMPARE(effects().size(), 0);
        const auto labId = addFable("lab");
        QTRY_VERIFY(item("fable-toggle-" + labId + "-fx.reso.on"));
        QVERIFY(!item("fable-knob-" + labId + "-fx.reso.decay")->isEnabled());
        // The rack may keep a scroll offset from earlier cases, so toggle without a pointer.
        auto* reso = item("fable-toggle-" + labId + "-fx.reso.on");
        QVERIFY(QMetaObject::invokeMethod(reso, "toggle"));
        QVERIFY(QMetaObject::invokeMethod(reso, "toggled"));
        QTRY_VERIFY(item("fable-knob-" + labId + "-fx.reso.decay")->isEnabled());
        QCOMPARE(effects()[0].toObject().value("params").toObject().value("fx.reso.on").toDouble(), 1.0);
        // A short choice is a segmented control.
        QVERIFY(model.applyEdit("removeTrackEffect", {{"trackId", "a"}, {"effectId", labId}}));
        QTRY_COMPARE(effects().size(), 0);
        const auto reverbId = addFable("reverb");
        QTRY_VERIFY(item("fable-enum-" + reverbId + "-fx.reverb.type-1"));
        const int beforeType = model.undoStack()->count();
        click("fable-enum-" + reverbId + "-fx.reverb.type-1");
        QTRY_COMPARE(fableParams().value("fx.reverb.type").toDouble(), 1.0);
        QCOMPARE(model.undoStack()->count(), beforeType + 1);
    }
    void speedDuration() {
        click("timeRuler"); QTest::keyClick(view.get(), Qt::Key_R, Qt::ControlModifier);
        checkpoint("Ctrl+R without selection");
        QVERIFY2(gestures()->selection().isEmpty(), qPrintable(diagnostics()));
        QVERIFY(!object("speedDurationDialog") || !object("speedDurationDialog")->property("visible").toBool());
        click("clip-c");
        QVERIFY2(gestures()->selection() == QStringList{"c"}, qPrintable(diagnostics()));
        QVERIFY2(object("speedDurationHost"), qPrintable(diagnostics()));
        QVERIFY2(view->isActive() && view->activeFocusItem(), qPrintable(diagnostics()));
        QTest::keyClick(view.get(), Qt::Key_R, Qt::ControlModifier);
        checkpoint("Ctrl+R with selection");
        QTRY_VERIFY2(object("speedDurationDialog") && object("speedDurationDialog")->property("visible").toBool(), qPrintable(diagnostics()));
        QCOMPARE(object("speedDurationDialog")->property("editingIds").toStringList(), QStringList{"c"});
        QTest::keyClick(view.get(), Qt::Key_Escape);
        QTest::mouseClick(view.get(), Qt::RightButton, Qt::NoModifier, center(item("clip-c")));
        QTRY_VERIFY(item("registryMenu-clip-speedDuration"));
        click("registryMenu-clip-speedDuration");
        QTRY_VERIFY(object("speedDurationDialog")->property("visible").toBool());
        QTest::keyClick(view.get(), Qt::Key_Escape);
        click("helpButton");
        QTRY_VERIFY(shortcutRow(view->contentItem()));
        QVERIFY(shortcutRow(view->contentItem())->property("available").toBool());
    }
};
int main(int argc, char** argv) {
    QGuiApplication app(argc, argv);
    if (app.arguments().contains("--export")) {
        const auto args = app.arguments();
        const auto at = args.indexOf("--cancel-file");
        if (at < 0 || at + 1 >= args.size()) { return 1; }
        const auto cancelPath = args[at + 1];
        QTimer poll;
        QObject::connect(&poll, &QTimer::timeout, &app, [&app, cancelPath] {
            if (QFile::exists(cancelPath)) { app.exit(3); }
        });
        poll.start(10);
        QTimer::singleShot(10000, &app, &QCoreApplication::quit);
        return app.exec();
    }
    if (app.arguments().contains("--effects-oracle")) {
        QFile input;
        if (!input.open(stdin, QIODevice::ReadOnly)) { return 1; }
        const auto cases = QJsonDocument::fromJson(input.readAll()).array();
        QJsonArray result;
        for (const auto& value : cases) {
            const auto test = value.toObject();
            const auto edit = nt::app::findEdit(test.value("name").toString());
            result.append(edit ? edit(test.value("before").toObject(), test.value("payload").toObject()) : QJsonObject{});
        }
        QFile output;
        if (!output.open(stdout, QIODevice::WriteOnly)) { return 1; }
        output.write(QJsonDocument(result).toJson(QJsonDocument::Compact));
        return 0;
    }
    TestWiringW test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_wiringw.moc"
