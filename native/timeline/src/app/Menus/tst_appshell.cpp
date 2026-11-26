#include "../../../tests/TestAssetCacheRoot.h"
#include "ShellMenus.h"
#include "app/MenuRegistry.h"
#include "app/Preferences/Preferences.h"
#include "app/PanelRegistry.h"
#include <QScopeGuard>
#include "edit/Keymap.h"
#include "edit/ClipGestureController.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "ui/TimelineViewState.h"
#include <QFile>
#include <QFileInfo>
#include <QKeyEvent>
#ifdef Q_OS_MACOS
#include <CoreFoundation/CoreFoundation.h>
#endif
#include <QGuiApplication>
#include <QClipboard>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QJsonArray>
#include <QJSValue>
#include <QQuickView>
#include <QSettings>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QtTest>
#include <algorithm>
#include <limits>
#include <memory>
#include <type_traits>
#include <private/qguiapplication_p.h>
#include <qpa/qplatformmenu.h>
#include <qpa/qplatformtheme.h>
using namespace nt::app;
namespace {
// UI thread only.
class PopupKeyCounter : public QObject {
public:
    int count = 0;
    bool eventFilter(QObject*, QEvent* event) override {
        if (event->type() == QEvent::KeyPress && static_cast<QKeyEvent*>(event)->key() == Qt::Key_Space) {
            ++count;
            event->accept();
            return true;
        }
        return false;
    }
};
// A platform menu bar that records what ShellMenus builds. No QPA plugin on
// this machine has one, so the native path would otherwise run on macOS only.
class RecordingItem : public QPlatformMenuItem {
    Q_OBJECT
public:
    QString text;
    QPlatformMenu* submenu = nullptr;
    QKeySequence shortcut;
    bool separator = false, checkable = false, checked = false, enabled = true;
    void setText(const QString& value) override { text = value; }
    void setIcon(const QIcon&) override {}
    void setMenu(QPlatformMenu* value) override { submenu = value; }
    void setVisible(bool) override {}
    void setIsSeparator(bool value) override { separator = value; }
    void setFont(const QFont&) override {}
    void setRole(MenuRole) override {}
    void setCheckable(bool value) override { checkable = value; }
    void setChecked(bool value) override { checked = value; }
    void setShortcut(const QKeySequence& value) override { shortcut = value; }
    void setEnabled(bool value) override { enabled = value; }
    void setIconSize(int) override {}
};
class RecordingMenu : public QPlatformMenu {
    Q_OBJECT
public:
    QString text;
    QList<RecordingItem*> items;
    int synced = 0;
    void insertMenuItem(QPlatformMenuItem* item, QPlatformMenuItem*) override { items.append(static_cast<RecordingItem*>(item)); }
    void removeMenuItem(QPlatformMenuItem* item) override { items.removeAll(static_cast<RecordingItem*>(item)); }
    void syncMenuItem(QPlatformMenuItem*) override { ++synced; }
    void syncSeparatorsCollapsible(bool) override {}
    void setText(const QString& value) override { text = value; }
    void setIcon(const QIcon&) override {}
    void setEnabled(bool) override {}
    void setVisible(bool) override {}
    QPlatformMenuItem* menuItemAt(int position) const override { return items.value(position); }
    QPlatformMenuItem* menuItemForTag(quintptr) const override { return nullptr; }
    // native-rules #4: returns a raw owning pointer that the caller must free
    QPlatformMenuItem* createMenuItem() const override { return new RecordingItem; }
    RecordingItem* named(const QString& label) const {
        for (auto* item : items) {
            if (item->text == label) { return item; }
        }
        return nullptr;
    }
};
class RecordingBar : public QPlatformMenuBar {
    Q_OBJECT
public:
    // native-rules #14: test-only static
    static inline QPointer<RecordingBar> last;
    QList<RecordingMenu*> menus;
    RecordingBar() { last = this; }
    void insertMenu(QPlatformMenu* menu, QPlatformMenu*) override { menus.append(static_cast<RecordingMenu*>(menu)); }
    void removeMenu(QPlatformMenu* menu) override { menus.removeAll(static_cast<RecordingMenu*>(menu)); }
    void syncMenu(QPlatformMenu*) override {}
    void handleReparent(QWindow*) override {}
    QPlatformMenu* menuForTag(quintptr) const override { return nullptr; }
    RecordingMenu* named(const QString& label) const {
        for (auto* menu : menus) {
            if (menu->text == label) { return menu; }
        }
        return nullptr;
    }
};
class RecordingTheme : public QPlatformTheme {
public:
    // native-rules #4: returns a raw owning pointer that the caller must free
    QPlatformMenuItem* createPlatformMenuItem() const override { return new RecordingItem; }
    // native-rules #4: returns a raw owning pointer that the caller must free
    QPlatformMenu* createPlatformMenu() const override { return new RecordingMenu; }
    // native-rules #4: returns a raw owning pointer that the caller must free
    QPlatformMenuBar* createPlatformMenuBar() const override { return new RecordingBar; }
};
}
// UI thread only. The visual parent owns the item.
class DefaultAcceptedEscapeItem : public QQuickItem {
public:
    using QQuickItem::QQuickItem;
    int escapes = 0;
    bool acceptedOnDelivery = false;
protected:
    bool event(QEvent* event) override {
        if (event->type() == QEvent::KeyPress && static_cast<QKeyEvent*>(event)->key() == Qt::Key_Escape) {
            ++escapes;
            acceptedOnDelivery = event->isAccepted();
            return true;
        }
        return QQuickItem::event(event);
    }
};

class TestAppShell : public QObject {
    Q_OBJECT
    TestAssetCacheRoot m_testCache;
    QQuickItem* shellItem(QQuickItem* item) {
        if (item->objectName() == "appShell") {
            return item;
        }
        for (auto* child : item->childItems()) {
            if (auto* found = shellItem(child)) {
                return found;
            }
        }
        return nullptr;
    }
    QQuickItem* named(QQuickItem* root, const QString& name) {
        if (root->objectName() == name) { return root; }
        for (auto* child : root->childItems()) {
            if (auto* found = named(child, name)) { return found; }
        }
        return nullptr;
    }
    void loadEditor(QQuickView& view, TimelineModel& model, PlaybackClock& clock) {
        m_testCache.install(*view.engine());
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        QFile file(QStringLiteral(NT_FIXTURES_DIR "/av-sync.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        auto parsed = nt::parseTimelineJson(file.readAll());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        view.setInitialProperties({{"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)}});
        view.loadFromModule("NodeTool.Timeline", "TimelineEditor");
        QVERIFY2(view.status() == QQuickView::Ready, qPrintable(view.errors().isEmpty() ? QString() : view.errors().first().toString()));
        view.resize(1200, 800);
        view.show();
        QVERIFY(QTest::qWaitForWindowExposed(&view));
        view.rootObject()->forceActiveFocus();
        QCoreApplication::processEvents();
    }
private slots:
    void globalShortcutAfterControlClick_data() {
        QTest::addColumn<QString>("control");
        for (const auto& name : {"Button", "Slider", "ComboBox", "ListView", "dock", "stepSequencer", "manyItems"}) {
            QTest::newRow(name) << QString::fromLatin1(name);
        }
    }
    void globalShortcutAfterControlClick() {
        QFETCH(QString, control);
        TimelineModel model;
        PlaybackClock clock;
        QQuickView view;
        loadEditor(view, model, clock);
        QQmlComponent component(view.engine());
        std::unique_ptr<QObject> object;
        QQuickItem* item = nullptr;
        if (control == "dock") {
            item = named(view.rootObject(), "dockTab_tracks");
        } else {
            if (control == "stepSequencer") {
                component.loadFromModule("NodeTool.Timeline", "StepSequencerPanel");
            } else {
                const QString type = control == "manyItems" ? QString("Item") : control;
                const QString children = control == "manyItems" ? QString("Repeater { model: 10000; Item {} }") : QString();
                component.setData(("import QtQuick\nimport QtQuick.Controls\n" + type +
                    " { width: 180; height: 40; focus: true; " + children + " }").toUtf8(), QUrl());
            }
            object.reset(component.create());
            QVERIFY2(object, qPrintable(component.errorString()));
            item = qobject_cast<QQuickItem*>(object.get());
            QVERIFY(item);
            item->setParentItem(view.rootObject());
            item->setSize(QSizeF(400, 240));
            item->setZ(1000);
        }
        QVERIFY(item);
        QCoreApplication::processEvents();
        QTest::mouseClick(&view, Qt::LeftButton, {}, item->mapToScene(control == "stepSequencer" ? QPointF(395, 235) : QPointF(30, 20)).toPoint());
        if (control == "ComboBox") {
            if (auto* popup = item->property("popup").value<QObject*>()) {
                QMetaObject::invokeMethod(popup, "close");
                QTRY_VERIFY(!popup->property("visible").toBool());
            }
        }
        if (control == "Button" || control == "Slider" || control == "ComboBox" || control == "ListView") {
            item->forceActiveFocus(Qt::TabFocusReason);
            clock.seek(0);
            QTest::keyClick(&view, Qt::Key_Right);
            QVERIFY(clock.currentTimeMs() > 0);
            clock.seek(0);
        }
        const bool before = clock.playing();
        QTest::keyClick(&view, Qt::Key_Space);
        QCOMPARE(clock.playing(), !before);
        item->forceActiveFocus(Qt::TabFocusReason);
        QTest::keyClick(&view, Qt::Key_Space);
        QCOMPARE(clock.playing(), before);
    }
    void focusedLocalKeys_data() {
        QTest::addColumn<QString>("handler");
        QTest::addColumn<int>("key");
        QTest::newRow("pressed") << QString("Keys.onPressed: event => { if (event.key === Qt.Key_Right) { hits++; event.accepted = true } }") << int(Qt::Key_Right);
        QTest::newRow("specific") << QString("Keys.onRightPressed: hits++") << int(Qt::Key_Right);
        QTest::newRow("override") << QString("Keys.onShortcutOverride: event => { if (event.key === Qt.Key_Right) event.accepted = true } Keys.onRightPressed: hits++") << int(Qt::Key_Right);
        QTest::newRow("shortcut") << QString("Shortcut { sequence: \"Space\"; enabled: localItem.activeFocus; onActivated: localItem.hits++ }") << int(Qt::Key_Space);
        QTest::newRow("afterItem") << QString("Keys.priority: Keys.AfterItem; Keys.onRightPressed: hits++") << int(Qt::Key_Right);
        QTest::newRow("space") << QString("Keys.onSpacePressed: hits++") << int(Qt::Key_Space);
    }
    void focusedLocalKeys() {
        QFETCH(QString, handler);
        QFETCH(int, key);
        TimelineModel model;
        PlaybackClock clock;
        QQuickView view;
        loadEditor(view, model, clock);
        QQmlComponent component(view.engine());
        component.setData(("import QtQuick\nItem { id: localItem; width: 100; height: 100; property int hits: 0; " + handler + " }").toUtf8(), QUrl());
        std::unique_ptr<QObject> object(component.create());
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* item = qobject_cast<QQuickItem*>(object.get());
        QVERIFY(item);
        item->setParentItem(view.rootObject());
        item->forceActiveFocus();
        QTest::keyClick(&view, static_cast<Qt::Key>(key));
        QCOMPARE(item->property("hits").toInt(), 1);
        QCOMPARE(clock.currentTimeMs(), 0);
        QVERIFY(!clock.playing());
        QTest::keyClick(&view, key == Qt::Key_Space ? Qt::Key_Right : Qt::Key_Space);
        if (key == Qt::Key_Space) { QVERIFY(clock.currentTimeMs() > 0); }
        else { QVERIFY(clock.playing()); }
        QCOMPARE(item->property("hits").toInt(), 1);
    }
    void textEditorsKeepSpace_data() {
        QTest::addColumn<QString>("control");
        for (const auto& type : {"TextField", "TextArea", "TextInput", "TextEdit", "SpinBox", "ComboBox"}) {
            QTest::newRow(type) << QString::fromLatin1(type);
        }
    }
    void textEditorsKeepSpace() {
        QFETCH(QString, control);
        TimelineModel model;
        PlaybackClock clock;
        QQuickView view;
        loadEditor(view, model, clock);
        QQmlComponent component(view.engine());
        component.setData(("import QtQuick\nimport QtQuick.Controls\n" + control +
            " { width: 200; height: 100; " + ((control == "SpinBox" || control == "ComboBox") ? "editable: true" : "") + " }").toUtf8(), QUrl());
        std::unique_ptr<QObject> object(component.create());
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* field = qobject_cast<QQuickItem*>(object.get());
        QVERIFY(field);
        field->setParentItem(view.rootObject());
        auto* input = (control == "SpinBox" || control == "ComboBox") ? field->property("contentItem").value<QQuickItem*>() : field;
        QVERIFY(input);
        input->forceActiveFocus();
        QTest::keyClick(&view, Qt::Key_Space);
        QVERIFY(!clock.playing());
        QVERIFY(input->hasActiveFocus());
        if (control != "SpinBox") { QCOMPARE(input->property("text").toString(), QString(" ")); }
    }
    void globalShortcutKindsAndTextOwnership() {
        TimelineModel model;
        PlaybackClock clock;
        QQuickView view;
        loadEditor(view, model, clock);
        auto* gestures = view.rootObject()->findChild<ClipGestureController*>("clipGestures");
        QVERIFY(gestures);
        QQmlComponent component(view.engine());
        component.setData(R"(import QtQuick
import QtQuick.Controls
import NodeTool.UiPrimitives as Ui
Item {
    width: 300; height: 160
    Ui.EditorButton { objectName: "button"; width: 100; height: 40; property int activations: 0; onClicked: activations++ }
    TextField { objectName: "text"; y: 50; width: 200 }
    Popup { objectName: "popup"; modal: true; focus: true; width: 100; height: 100 }
    Menu { objectName: "menu"; MenuItem { text: "Local menu item" } }
})", QUrl());
        std::unique_ptr<QObject> object(component.create());
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* surface = qobject_cast<QQuickItem*>(object.get());
        surface->setParentItem(view.rootObject());
        surface->setZ(1000);
        auto* button = surface->findChild<QQuickItem*>("button");
        auto* text = surface->findChild<QQuickItem*>("text");
        auto* popup = surface->findChild<QObject*>("popup");
        auto* menu = surface->findChild<QObject*>("menu");
        QVERIFY(button && text && popup && menu);
        QObject saveProbe;
        saveProbe.setProperty("count", 0);
        const QPointer<QObject> saveGuard(&saveProbe);
        QVERIFY(registerShellMenuItem({"Help", "test.key1Save", "Test save shortcut", "Ctrl+S", {}, {}, 0, {}, {},
            [saveGuard](const QVariantMap&) {
                if (!saveGuard) { return false; }
                saveGuard->setProperty("count", saveGuard->property("count").toInt() + 1);
                return true;
            }}));
        const auto removeSave = qScopeGuard([] { unregisterShellMenuItem("test.key1Save"); });
        button->forceActiveFocus(Qt::TabFocusReason);
        QTest::keyClick(&view, Qt::Key_S, Qt::ControlModifier);
        QCOMPARE(saveProbe.property("count").toInt(), 1);
        QTest::keyClick(&view, Qt::Key_S, Qt::MetaModifier);
        QCOMPARE(saveProbe.property("count").toInt(), 1);
        gestures->setActiveTool("razor");
        QTest::keyClick(&view, Qt::Key_V);
        QCOMPARE(gestures->activeTool(), QString("select"));
        clock.seek(0);
        QTest::keyClick(&view, Qt::Key_Right);
        QVERIFY(clock.currentTimeMs() > 0);
        const auto clips = model.clipsJson();
        QVERIFY(!clips.isEmpty());
        gestures->setSelection({clips.first().toObject().value("id").toString()});
        QTest::keyClick(&view, Qt::Key_Escape);
        QVERIFY(gestures->selection().isEmpty());
        gestures->setSelection({clips.first().toObject().value("id").toString()});
        QTest::keyClick(&view, Qt::Key_Delete);
        QVERIFY(model.clipsJson().size() < clips.size());
        QTest::keyClick(&view, Qt::Key_Z, Qt::ControlModifier);
        QCOMPARE(model.clipsJson(), clips);
        QVERIFY(button->hasActiveFocus());
        QTest::keyClick(&view, Qt::Key_Return);
        QCOMPARE(button->property("activations").toInt(), 1);
        QVERIFY(model.applyEdit("addMarker", {{"id", "key1-text-undo"}, {"timeMs", 100}}));
        const auto documentBeforeTyping = model.documentJson();
        text->forceActiveFocus();
        QTest::keyClick(&view, Qt::Key_Z, Qt::MetaModifier);
        QCOMPARE(model.documentJson(), documentBeforeTyping);
        QTest::keyClick(&view, Qt::Key_Z, Qt::ControlModifier);
        QCOMPARE(model.documentJson(), documentBeforeTyping);
        QTest::keyClick(&view, Qt::Key_A);
        QTest::keyClick(&view, Qt::Key_Space);
        QTest::keyClick(&view, Qt::Key_B);
        QCOMPARE(text->property("text").toString(), QString("a b"));
        QTest::keyClick(&view, Qt::Key_Z, Qt::ControlModifier);
        QCOMPARE(model.clipsJson(), clips);
        QVERIFY(!clock.playing());
        QTest::keyClick(&view, Qt::Key_S, Qt::ControlModifier);
        QCOMPARE(saveProbe.property("count").toInt(), 2);
        text->forceActiveFocus();
        QTest::keyClick(&view, Qt::Key_A, Qt::ControlModifier);
        QTest::keyClick(&view, Qt::Key_Delete);
        QCOMPARE(text->property("text").toString(), QString());
        QCOMPARE(model.clipsJson(), clips);
        QMetaObject::invokeMethod(popup, "open");
        QTRY_VERIFY(popup->property("visible").toBool());
        QTest::keyClick(&view, Qt::Key_Space);
        QVERIFY(!clock.playing());
        QTest::keyClick(&view, Qt::Key_S, Qt::ControlModifier);
        QCOMPARE(saveProbe.property("count").toInt(), 2);
        QTest::keyClick(&view, Qt::Key_Escape);
        QTRY_VERIFY(!popup->property("visible").toBool());
        QMetaObject::invokeMethod(menu, "open");
        QTRY_VERIFY(menu->property("visible").toBool());
        QTest::keyClick(&view, Qt::Key_S, Qt::ControlModifier);
        QCOMPARE(saveProbe.property("count").toInt(), 2);
        QTest::keyClick(&view, Qt::Key_Space);
        QVERIFY(!clock.playing());
        QMetaObject::invokeMethod(menu, "close");
    }
    void reviewRegression_data() {
        QTest::addColumn<QString>("scenario");
        for (const auto* scenario : {"F2-textEscape", "F2-toggleSpace", "F1-defaultAcceptedEscape", "E2-focusedNonmodal", "E2-popupOrder", "E6-exactSymbol", "E6-exactMinus", "E5-selectFocus", "E4-localShortcut", "E2-select", "D2-orphanModal", "D2-menuReset", "D3-escape", "D3-disabled", "D4-symbol", "D5-repeat", "D6-click", "D6-toggle", "D6-switch", "D6-radio", "D7-registry"}) {
            QTest::newRow(scenario) << QString::fromLatin1(scenario);
        }
    }
    void reviewRegression() {
        QFETCH(QString, scenario);
        if (scenario == "D7-registry") {
            QVERIFY(std::none_of(shellMenuEntries().begin(), shellMenuEntries().end(), [](const auto& entry) {
                return entry.action == "test.key1Save";
            }));
            return;
        }
        TimelineModel model;
        PlaybackClock clock;
        QQuickView view;
        loadEditor(view, model, clock);
        QQmlComponent component(view.engine());
        component.setData(R"(import QtQuick
import QtQuick.Controls
import NodeTool.UiPrimitives as Ui
Item {
    id: reviewSurface
    width: 300; height: 200
    property int globalActivations: 0
    Shortcut { sequence: "F33"; enabled: localPopup.visible; onActivated: reviewSurface.globalActivations++ }
    property int escapes: 0
    property int keys: 0
    Keys.onEscapePressed: event => { escapes++; event.accepted = true }
    Keys.onPressed: event => { if (event.key === Qt.Key_F34) { keys++; event.accepted = true } }
    Ui.EditorButton { objectName: "chrome"; width: 100; height: 40 }
    CheckBox { objectName: "toggle"; y: 60 }
    Switch { objectName: "switch"; y: 100 }
    RadioButton { objectName: "radio"; y: 140 }
    Popup { objectName: "orphan"; modal: true; focus: false; parent: Overlay.overlay; width: 100; height: 100 }
    TextField { objectName: "textA"; x: 160; width: 100; height: 32 }
    TextField { objectName: "textB"; x: 160; y: 50; width: 100; height: 32 }
    Ui.Select {
        objectName: "select"; y: 100; width: 150
        options: [{label: "One", value: 1}, {label: "Two", value: 2}]; value: 1
        popup.exit: Transition { PauseAnimation { duration: 40 } }
    }
    Popup {
        id: localPopup
        objectName: "localPopup"; modal: true; focus: true; width: 100; height: 100
        property int activations: 0
        contentItem: Item {
            focus: true
            Shortcut { sequence: "Space"; context: Qt.WindowShortcut; enabled: localPopup.visible; onActivated: localPopup.activations++ }
        }
    }
    Popup { objectName: "nonmodal"; modal: false; focus: false; width: 100; height: 100; contentItem: Item {} }
    Popup { objectName: "higher"; z: 20; modal: true; focus: false; width: 100; height: 100 }
    Popup { objectName: "lower"; z: 10; modal: true; focus: false; width: 100; height: 100 }
    ToolTip { objectName: "tip"; text: "Hint" }
})", QUrl());
        std::unique_ptr<QObject> object(component.create());
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* surface = qobject_cast<QQuickItem*>(object.get());
        surface->setParentItem(view.rootObject());
        surface->setZ(1000);
        surface->forceActiveFocus();
        if (scenario == "F2-textEscape" || scenario == "F2-toggleSpace") {
            auto* background = surface->findChild<QQuickItem*>(scenario == "F2-textEscape" ? "textA" : "toggle");
            background->forceActiveFocus(Qt::TabFocusReason);
            QVERIFY(background->hasActiveFocus());
            auto* popup = surface->findChild<QObject*>("orphan");
            QMetaObject::invokeMethod(popup, "open");
            QTRY_VERIFY(popup->property("visible").toBool());
            QCOMPARE(view.activeFocusItem(), background);
            if (scenario == "F2-textEscape") {
                QTest::keyClick(&view, Qt::Key_Escape);
                QTRY_VERIFY(!popup->property("visible").toBool());
            } else {
                QVERIFY(background->property("visualFocus").toBool());
                QTest::keyClick(&view, Qt::Key_Space);
                QVERIFY(!background->property("checked").toBool());
                QVERIFY(!clock.playing());
                QMetaObject::invokeMethod(popup, "close");
            }
        } else if (scenario == "F1-defaultAcceptedEscape") {
            DefaultAcceptedEscapeItem control(view.rootObject());
            control.forceActiveFocus();
            auto* gestures = view.rootObject()->findChild<ClipGestureController*>("clipGestures");
            const QString id = model.clipsJson().first().toObject().value("id").toString();
            gestures->setSelection({id});
            QTest::keyClick(&view, Qt::Key_Escape);
            QCOMPARE(control.escapes, 1);
            QVERIFY(control.acceptedOnDelivery);
            QCOMPARE(gestures->selection(), QStringList{id});
        } else if (scenario == "E2-focusedNonmodal") {
            auto* popup = surface->findChild<QObject*>("nonmodal");
            QMetaObject::invokeMethod(popup, "open");
            QTRY_VERIFY(popup->property("visible").toBool());
            auto* content = popup->property("contentItem").value<QQuickItem*>();
            QVERIFY(content);
            content->forceActiveFocus();
            QTRY_VERIFY(content->hasActiveFocus());
            QTest::keyClick(&view, Qt::Key_Space);
            QVERIFY(!clock.playing());
            QMetaObject::invokeMethod(popup, "close");
        } else if (scenario == "E2-popupOrder") {
            auto* higher = surface->findChild<QObject*>("higher");
            auto* lower = surface->findChild<QObject*>("lower");
            QMetaObject::invokeMethod(higher, "open");
            QMetaObject::invokeMethod(lower, "open");
            QTRY_VERIFY(higher->property("visible").toBool() && lower->property("visible").toBool());
            surface->forceActiveFocus();
            PopupKeyCounter highKeys;
            PopupKeyCounter lowKeys;
            auto* highContent = higher->property("contentItem").value<QQuickItem*>();
            auto* lowContent = lower->property("contentItem").value<QQuickItem*>();
            QVERIFY(highContent && lowContent && highContent->parentItem() && lowContent->parentItem());
            highContent->parentItem()->installEventFilter(&highKeys);
            lowContent->parentItem()->installEventFilter(&lowKeys);
            QTest::keyClick(&view, Qt::Key_Space);
            QCOMPARE(highKeys.count, 1);
            QCOMPARE(lowKeys.count, 0);
            QVERIFY(!clock.playing());
            QMetaObject::invokeMethod(higher, "close");
            QMetaObject::invokeMethod(lower, "close");
        } else if (scenario == "E6-exactSymbol" || scenario == "E6-exactMinus") {
            const auto symbolKey = scenario == "E6-exactMinus" ? Qt::Key_Minus : Qt::Key_Equal;
            const QString symbol = scenario == "E6-exactMinus" ? "-" : "=";
            QQuickWindow shortcutWindow;
            shortcutWindow.resize(300, 200);
            shortcutWindow.show();
            QVERIFY(QTest::qWaitForWindowExposed(&shortcutWindow));
            ShellMenus menus;
            menus.setAnchor(shortcutWindow.contentItem());
            QObject probe;
            const QPointer<QObject> guard(&probe);
            for (const auto& name : {QString("exact"), QString("plain")}) {
                probe.setProperty(name.toUtf8().constData(), 0);
                QVERIFY(registerShellMenuItem({"Help", "test." + name, name, (name == "exact" ? "Ctrl+Shift+" : "Ctrl+") + symbol, {}, {}, 0, {}, {},
                    [guard, name](const QVariantMap&) {
                        if (!guard) { return false; }
                        const auto property = name.toUtf8();
                        guard->setProperty(property.constData(), guard->property(property.constData()).toInt() + 1);
                        return true;
                    }}));
            }
            const auto remove = qScopeGuard([] {
                unregisterShellMenuItem("test.exact");
                unregisterShellMenuItem("test.plain");
            });
            QTest::keyClick(&shortcutWindow, symbolKey, Qt::ControlModifier | Qt::ShiftModifier);
            QCOMPARE(probe.property("exact").toInt(), 1);
            QCOMPARE(probe.property("plain").toInt(), 0);
        } else if (scenario == "E5-selectFocus") {
            auto* textA = surface->findChild<QQuickItem*>("textA");
            auto* textB = surface->findChild<QQuickItem*>("textB");
            auto* select = surface->findChild<QQuickItem*>("select");
            auto* popup = select->property("popup").value<QObject*>();
            QTest::mouseClick(&view, Qt::LeftButton, {}, textA->mapToScene(QPointF(20, 16)).toPoint());
            QTRY_VERIFY(textA->hasActiveFocus());
            QTest::mouseClick(&view, Qt::LeftButton, {}, select->mapToScene(QPointF(20, 16)).toPoint());
            QTRY_VERIFY(popup->property("visible").toBool());
            QTest::mouseClick(&view, Qt::LeftButton, {}, textB->mapToScene(QPointF(20, 16)).toPoint());
            QTRY_VERIFY(!popup->property("visible").toBool());
            QTRY_VERIFY(textB->hasActiveFocus());
            QTest::mouseClick(&view, Qt::LeftButton, {}, select->mapToScene(QPointF(20, 16)).toPoint());
            QTRY_VERIFY(popup->property("visible").toBool());
            QTest::keyClick(&view, Qt::Key_Escape);
            QTRY_VERIFY(!popup->property("visible").toBool());
            QTRY_VERIFY(textB->hasActiveFocus());
        } else if (scenario == "E4-localShortcut") {
            auto* popup = surface->findChild<QObject*>("localPopup");
            QMetaObject::invokeMethod(popup, "open");
            QTRY_VERIFY(popup->property("visible").toBool());
            QTest::keyClick(&view, Qt::Key_Space);
            QCOMPARE(popup->property("activations").toInt(), 1);
            QTest::keyClick(&view, Qt::Key_F33);
            QCOMPARE(surface->property("globalActivations").toInt(), 0);
            QVERIFY(!clock.playing());
            QMetaObject::invokeMethod(popup, "close");
        } else if (scenario == "E2-select") {
            auto* select = surface->findChild<QQuickItem*>("select");
            auto* popup = select->property("popup").value<QObject*>();
            QMetaObject::invokeMethod(popup, "open");
            QTRY_VERIFY(popup->property("visible").toBool());
            QTest::keyClick(&view, Qt::Key_Down);
            QTest::keyClick(&view, Qt::Key_Space);
            QVERIFY(!clock.playing());
            QTRY_VERIFY(!popup->property("visible").toBool());
        } else if (scenario == "D2-orphanModal") {
            auto* popup = surface->findChild<QObject*>("orphan");
            QVERIFY(popup);
            const auto reparent = qScopeGuard([&] { popup->setParent(surface); });
            popup->setParent(nullptr);
            QMetaObject::invokeMethod(popup, "open");
            QTRY_VERIFY(popup->property("visible").toBool());
            QTest::keyClick(&view, Qt::Key_Space);
            QVERIFY(!clock.playing());
            QMetaObject::invokeMethod(popup, "close");
            auto* tip = surface->findChild<QObject*>("tip");
            QMetaObject::invokeMethod(tip, "open");
            QTest::keyClick(&view, Qt::Key_Space);
            QVERIFY(clock.playing());
        } else if (scenario == "D2-menuReset") {
            RecordingTheme theme;
            auto* original = QGuiApplicationPrivate::platform_theme;
            QGuiApplicationPrivate::platform_theme = &theme;
            const auto restore = qScopeGuard([original] { QGuiApplicationPrivate::platform_theme = original; });
            for (auto* installed : view.rootObject()->findChildren<ShellMenus*>()) {
                QCoreApplication::instance()->removeEventFilter(installed);
            }
            ShellMenus menus;
            menus.setAnchor(view.rootObject());
            auto* menu = RecordingBar::last->named("File");
            QVERIFY(menu);
            // AppKit validates shortcuts without ever starting menu tracking.
            emit menu->aboutToShow();
            emit menu->aboutToShow();
            auto* text = surface->findChild<QQuickItem*>("textA");
            text->forceActiveFocus();
            QTest::keyClick(&view, Qt::Key_A);
            QCOMPARE(text->property("text").toString(), QString("a"));
            surface->forceActiveFocus();
            QTest::keyClick(&view, Qt::Key_Space);
#ifdef Q_OS_MACOS
            QVERIFY(clock.playing());
#else
            QVERIFY(!clock.playing());
#endif
            emit menu->aboutToHide();
            QTest::keyClick(&view, Qt::Key_Space);
#ifndef Q_OS_MACOS
            QVERIFY(clock.playing());
            QTest::keyClick(&view, Qt::Key_Space);
#endif
            QVERIFY(!clock.playing());
#ifdef Q_OS_MACOS
            CFRunLoopTimerContext context{0, &view, nullptr, nullptr, nullptr};
            const std::unique_ptr<std::remove_pointer_t<CFRunLoopTimerRef>, decltype(&CFRelease)> timer(CFRunLoopTimerCreate(nullptr, CFAbsoluteTimeGetCurrent(), 0, 0, 0,
                [](CFRunLoopTimerRef, void* data) {
                    auto* window = static_cast<QQuickView*>(data);
                    QEvent deactivate(QEvent::WindowDeactivate);
                    QCoreApplication::sendEvent(window, &deactivate);
                    QTest::keyClick(window, Qt::Key_Space);
                    CFRunLoopStop(CFRunLoopGetCurrent());
                }, &context), &CFRelease);
            CFRunLoopAddTimer(CFRunLoopGetCurrent(), timer.get(), CFSTR("NSEventTrackingRunLoopMode"));
            CFRunLoopRunInMode(CFSTR("NSEventTrackingRunLoopMode"), 1, false);
            CFRunLoopTimerInvalidate(timer.get());
            QVERIFY(!clock.playing());
            QTest::keyClick(&view, Qt::Key_Space);
            QVERIFY(clock.playing());
#endif
        } else if (scenario == "D3-escape") {
            auto* gestures = view.rootObject()->findChild<ClipGestureController*>("clipGestures");
            const QString id = model.clipsJson().first().toObject().value("id").toString();
            gestures->setSelection({id});
            QTest::keyClick(&view, Qt::Key_Escape);
            QCOMPARE(surface->property("escapes").toInt(), 1);
            QCOMPARE(gestures->selection(), QStringList({id}));
        } else if (scenario == "D6-click") {
            auto* button = surface->findChild<QQuickItem*>("chrome");
            QTest::mouseClick(&view, Qt::LeftButton, {}, button->mapToScene(QPointF(20, 20)).toPoint());
            QCOMPARE(button->property("focusPolicy").toInt(), int(Qt::TabFocus));
            QVERIFY(!button->hasActiveFocus());
            button->forceActiveFocus(Qt::TabFocusReason);
            QVERIFY(button->hasActiveFocus());
        } else if (scenario == "D6-toggle" || scenario == "D6-switch" || scenario == "D6-radio") {
            const QString name = scenario == "D6-switch" ? "switch" : scenario == "D6-radio" ? "radio" : "toggle";
            auto* toggle = surface->findChild<QQuickItem*>(name);
            toggle->forceActiveFocus(Qt::TabFocusReason);
            QTest::keyClick(&view, Qt::Key_Space);
            QVERIFY(toggle->property("checked").toBool());
            QVERIFY(!clock.playing());
        } else {
            int runs = 0;
            const QPointer<QObject> guard(surface);
            const QString action = "test." + scenario;
            QVERIFY(registerShellMenuItem({"Help", action, "Review probe", scenario == "D4-symbol" ? "Ctrl++" : scenario == "D5-repeat" ? "F35" : "F34", {}, {}, 0,
                [scenario](const QVariantMap&) { return scenario != "D3-disabled"; }, {},
                [guard, &runs](const QVariantMap&) { if (guard) { ++runs; } return true; }}));
            const auto removeProbe = qScopeGuard([action] { unregisterShellMenuItem(action); });
            if (scenario == "D3-disabled") {
                QTest::keyClick(&view, Qt::Key_F34);
                QCOMPARE(surface->property("keys").toInt(), 1);
            } else if (scenario == "D4-symbol") {
                QKeyEvent key(QEvent::KeyPress, Qt::Key_Plus, Qt::ShiftModifier | Qt::ControlModifier, "+");
                QCoreApplication::sendEvent(&view, &key);
                QCOMPARE(runs, 1);
            } else {
                QTest::keyClick(&view, Qt::Key_F35);
                QCOMPARE(runs, 1);
                QKeyEvent repeat(QEvent::KeyPress, Qt::Key_F35, Qt::NoModifier, {}, true);
                QCoreApplication::sendEvent(&view, &repeat);
                QCOMPARE(runs, 1);
                const double before = clock.currentTimeMs();
                QKeyEvent step(QEvent::KeyPress, Qt::Key_Right, Qt::NoModifier, {}, true);
                QCoreApplication::sendEvent(&view, &step);
                QVERIFY(clock.currentTimeMs() > before);
            }
        }
    }
    void chromePrimitivesKeepClickFocus_data() {
        QTest::addColumn<QString>("control");
        for (const auto* control : {"EditorButton", "CheckBox", "Toggle", "Select", "TabBar"}) {
            QTest::newRow(control) << QString::fromLatin1(control);
        }
    }
    void chromePrimitivesKeepClickFocus() {
        QFETCH(QString, control);
        TimelineModel model;
        PlaybackClock clock;
        QQuickView view;
        loadEditor(view, model, clock);
        QQmlComponent component(view.engine());
        const QString properties = control == "TabBar" ? "tabs: [{label: 'One', value: 1}]; value: 1;" : "";
        component.setData(("import QtQuick; import NodeTool.UiPrimitives as Ui\nUi." + control
            + " { width: 200; height: 40; " + properties + " }").toUtf8(), QUrl());
        std::unique_ptr<QObject> object(component.create());
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* item = qobject_cast<QQuickItem*>(object.get());
        item->setParentItem(view.rootObject());
        item->setZ(1000);
        view.rootObject()->forceActiveFocus();
        const QPointer<QQuickItem> priorFocus = view.activeFocusItem();
        QTest::mouseClick(&view, Qt::LeftButton, {}, item->mapToScene(QPointF(20, 20)).toPoint());
        if (auto* popup = item->property("popup").value<QObject*>()) {
            QMetaObject::invokeMethod(popup, "close");
            QTRY_VERIFY(!popup->property("visible").toBool());
        }
        QCOMPARE(view.activeFocusItem(), priorFocus.data());
        QVERIFY(!item->hasActiveFocus());
        QTest::keyClick(&view, Qt::Key_Space);
        QVERIFY(clock.playing());
    }
    void readOnlyTextKeepsSelection_data() {
        QTest::addColumn<QString>("control");
        QTest::newRow("TextField") << QString("TextField");
        QTest::newRow("TextArea") << QString("TextArea");
    }
    void readOnlyTextKeepsSelection() {
        QFETCH(QString, control);
        TimelineModel model;
        PlaybackClock clock;
        QQuickView view;
        loadEditor(view, model, clock);
        QQmlComponent component(view.engine());
        component.setData(("import QtQuick; import QtQuick.Controls\n" + control + " { width: 200; text: \"Copy this\"; readOnly: true; selectByMouse: true }").toUtf8(), QUrl());
        std::unique_ptr<QObject> object(component.create());
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* text = qobject_cast<QQuickItem*>(object.get());
        text->setParentItem(view.rootObject());
        text->forceActiveFocus();
        QTest::keyClick(&view, Qt::Key_A, Qt::ControlModifier);
        QCOMPARE(text->property("selectedText").toString(), QString("Copy this"));
        QGuiApplication::clipboard()->clear();
        QTest::keyClick(&view, Qt::Key_C, Qt::ControlModifier);
        QCOMPARE(QGuiApplication::clipboard()->text(), QString("Copy this"));
        auto* gestures = view.rootObject()->findChild<ClipGestureController*>("clipGestures");
        const auto before = model.clipsJson();
        gestures->setSelection({before.first().toObject().value("id").toString()});
        QVERIFY(gestures->runAction("copy"));
        QVERIFY(model.applyEdit("addMarker", {{"id", "readonly-history"}, {"timeMs", 100}}));
        const auto documentBefore = model.documentJson();
        for (const auto key : {Qt::Key_X, Qt::Key_V, Qt::Key_Z, Qt::Key_Delete, Qt::Key_Backspace}) {
            QTest::keyClick(&view, key, key == Qt::Key_Delete || key == Qt::Key_Backspace ? Qt::NoModifier : Qt::ControlModifier);
            QCOMPARE(model.documentJson(), documentBefore);
        }
        ShellMenus menus;
        menus.setAnchor(view.rootObject());
        for (const auto* action : {"cut", "paste", "undo", "redo", "deleteSelected"}) {
            QVERIFY(!menus.trigger(QString::fromLatin1(action)));
            QCOMPARE(model.documentJson(), documentBefore);
        }
        QCOMPARE(text->property("text").toString(), QString("Copy this"));
        QTest::keyClick(&view, Qt::Key_Space);
        QVERIFY(clock.playing());
        QCOMPARE(view.activeFocusItem(), text);
        QCOMPARE(text->property("selectedText").toString(), QString("Copy this"));
        QGuiApplication::clipboard()->clear();
        QTest::keyClick(&view, Qt::Key_C, Qt::ControlModifier);
        QCOMPARE(QGuiApplication::clipboard()->text(), QString("Copy this"));
        clock.pause();
        clock.seek(1500);
        QCoreApplication::processEvents();
        const double time = clock.currentTimeMs();
        QTest::keyClick(&view, Qt::Key_Left);
        QCOMPARE(clock.currentTimeMs(), time);
        QVERIFY(menus.trigger("playPause"));
        QCOMPARE(view.activeFocusItem(), text);
    }
    void editMenuKeepsTextFocus_data() {
        QTest::addColumn<QString>("action");
        for (const auto& action : {"cut", "copy", "paste", "selectAll", "undo", "deleteSelected"}) {
            QTest::newRow(action) << QString::fromLatin1(action);
        }
    }
    void editMenuKeepsTextFocus() {
        QFETCH(QString, action);
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.UiPrimitives as Ui
Item {
    property bool timeline: true
    width: 300; height: 100
    Ui.TextField { objectName: "rename"; width: 200; value: "Clip" }
})", QUrl());
        std::unique_ptr<QObject> surface(component.create());
        QVERIFY2(surface, qPrintable(component.errorString()));
        auto* root = qobject_cast<QQuickItem*>(surface.get());
        QVERIFY(root);
        QQuickWindow window;
        window.resize(300, 100);
        root->setParentItem(window.contentItem());
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        auto* input = root->findChild<QQuickItem*>("rename");
        QVERIFY(input);
        input->forceActiveFocus();
        QTest::keyClick(&window, Qt::Key_End);
        QTest::keyClick(&window, Qt::Key_S);
        QTest::keyClick(&window, Qt::Key_A, Qt::ControlModifier);
        QGuiApplication::clipboard()->setText("Pasted");
        ShellMenus menus;
        menus.setAnchor(root);
        QVERIFY(menus.trigger(action));
        QVERIFY(input->hasActiveFocus());
        if (action == "cut" || action == "deleteSelected") {
            QCOMPARE(input->property("text").toString(), QString());
        } else if (action == "paste") {
            QCOMPARE(input->property("text").toString(), QString("Pasted"));
        } else if (action == "undo") {
            QCOMPARE(input->property("text").toString(), QString("Clip"));
        } else if (action == "copy") {
            QCOMPARE(QGuiApplication::clipboard()->text(), QString("Clips"));
        } else {
            QCOMPARE(input->property("selectedText").toString(), QString("Clips"));
        }
    }
    void viewMenuRunsItsTimelineCommandWhileTyping() {
        TimelineModel model;
        PlaybackClock clock;
        QQuickView view;
        loadEditor(view, model, clock);
        auto* root = view.rootObject();
        QVERIFY(root);
        QQmlComponent component(view.engine());
        component.setData(R"(import QtQuick
import NodeTool.UiPrimitives as Ui
Ui.TextField { property string draft: "Clip"; width: 200; value: draft; onValueCommitted: next => draft = next })", QUrl());
        std::unique_ptr<QObject> field(component.create());
        QVERIFY2(field, qPrintable(component.errorString()));
        auto* input = qobject_cast<QQuickItem*>(field.get());
        QVERIFY(input);
        input->setParentItem(root);
        input->forceActiveFocus();
        QTest::keyClick(&view, Qt::Key_End);
        QTest::keyClick(&view, Qt::Key_S);
        auto* gestures = root->findChild<ClipGestureController*>("clipGestures");
        QVERIFY(gestures);
        auto* state = gestures->viewState();
        QVERIFY(state);
        const double zoom = state->msPerPx();
        ShellMenus menus;
        menus.setAnchor(root);
        QVERIFY(menus.trigger("zoomIn"));
        QVERIFY(state->msPerPx() < zoom);
        QVERIFY(!input->hasActiveFocus());
        QCOMPARE(input->property("draft").toString(), QString("Clips"));
    }
    void shellRegistration() {
        const auto panels = PanelRegistry().forSlot("overlay");
        QVariantList shellPanels;
        for (const auto& candidate : panels) {
            if (candidate.toMap().value("id").toString() == "appShell") {
                shellPanels.append(candidate);
            }
        }
        QCOMPARE(shellPanels.size(), 1);
        const auto panel = shellPanels.first().toMap();
        QCOMPARE(panel.value("id").toString(), QString("appShell"));
        QCOMPARE(panel.value("source").toUrl(), QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/Preferences/AppShell.qml"));
        QCOMPARE(panel.value("order").toInt(), 100);
        QCOMPARE(panel.value("title").toString(), QString("App shell"));
        TimelineModel model;
        PlaybackClock clock;
        QQuickView view;
        loadEditor(view, model, clock);
        auto* shell = shellItem(view.contentItem());
        QVERIFY(shell);
        QVERIFY(shell->isVisible());
        QVERIFY(shell->width() > 0);
        QCOMPARE(shell->parentItem()->parentItem()->objectName(), QString("panelSlot_overlay"));
    }
    void menus() {
        const auto menus = shellMenuDescription("premiere");
        QStringList names;
        for (const auto& menu : menus) {
            names << menu.label;
        }
        QCOMPARE(names, QStringList({"File", "Edit", "Clip", "Sequence", "Markers", "View", "Playback", "Window", "Help"}));
        const auto registered = [](const ShellMenuItem& item) {
            const auto& entries = shellMenuEntries();
            return item.separator || !item.children.empty() ||
                std::any_of(entries.begin(), entries.end(), [&](const auto& e) { return e.action == item.action; });
        };
        const auto named = [&menus](const QString& label) -> const Menu& {
            return *std::find_if(menus.begin(), menus.end(), [&](const Menu& m) { return m.label == label; });
        };
        QCOMPARE(named("Edit").items[0].label, QString("Undo"));
        const auto labels = [&named](const QString& menu) {
            QStringList out;
            for (const auto& item : named(menu).items) { out << item.action; }
            return out;
        };
        // Marks and markers moved to Markers, and left Playback.
        for (const auto* action : {"markIn", "markOut", "goToIn", "goToOut", "clearRange", "addMarker", "nextMarker", "prevMarker"}) {
            QVERIFY2(labels("Markers").contains(action), action);
            QVERIFY2(!labels("Playback").contains(action), action);
        }
        QVERIFY(labels("Sequence").contains("zoomFit"));
        QVERIFY(labels("Help").contains("toggleShortcuts"));
        for (const auto& menu : menus) {
            for (const auto& item : menu.items) {
                if (menu.label == "File" || !registered(item) || item.separator || !item.children.empty()) {
                    continue;
                }
                const auto preset = nt::edit::formatActionShortcut("premiere", item.action);
                if (!preset.isEmpty()) {
                    QCOMPARE(item.shortcut, preset);
                }
            }
        }
        // Nothing here is open, so an item that needs the editor is off and says why.
        int off = 0;
        for (const auto& menu : menus) {
            for (const auto& item : menu.items) {
                if (menu.label != "File" && !item.separator && item.children.empty() && !item.enabled && !item.action.startsWith("test.")) {
                    ++off;
                    QVERIFY2(!item.disabledReason.isEmpty(), qPrintable(item.action));
                }
            }
        }
        QVERIFY(off > 40);
    }
    // Two items with one key would fight over it in a native menu bar.
    void shortcutsAreNotShared() {
        const auto visit = [](auto&& self, const std::vector<ShellMenuItem>& items, QHash<QKeySequence, QString>& seen, QStringList& clashes) -> void {
            for (const auto& item : items) {
                if (!item.sequence.isEmpty()) {
                    if (seen.contains(item.sequence)) {
                        clashes << item.sequence.toString() + ": " + seen.value(item.sequence) + " and " + item.action;
                    }
                    seen.insert(item.sequence, item.action);
                }
                self(self, item.children, seen, clashes);
            }
        };
        for (const QString preset : {"premiere", "fcp"}) {
            QHash<QKeySequence, QString> seen;
            QStringList clashes;
            for (const auto& menu : shellMenuDescription(preset)) { visit(visit, menu.items, seen, clashes); }
            QVERIFY2(clashes.isEmpty(), qPrintable(preset + ": " + clashes.join(", ")));
            QVERIFY(seen.size() > 30);
        }
    }
    void conversions() {
        QCOMPARE(bindingCombination({"Ctrl", "Shift", "Z"}), QKeyCombination(Qt::ControlModifier | Qt::ShiftModifier, Qt::Key_Z));
        QCOMPARE(bindingCombination({"Shift", "+"}), QKeyCombination(Qt::Key_Plus));
        QCOMPARE(bindingCombination({"Shift", "="}), QKeyCombination(Qt::ShiftModifier, Qt::Key_Equal));
        QCOMPARE(bindingCombination({"Shift", ";"}), QKeyCombination(Qt::ShiftModifier, Qt::Key_Semicolon));
        QCOMPARE(bindingCombination({"Alt", "←"}), QKeyCombination(Qt::AltModifier, Qt::Key_Left));
        QCOMPARE(bindingCombination({"Page Down"}), QKeyCombination(Qt::Key_PageDown));
        int inspected = 0;
        const QHash<int, QString> dom{{Qt::Key_Left,"ArrowLeft"},{Qt::Key_Right,"ArrowRight"},
            {Qt::Key_Up,"ArrowUp"},{Qt::Key_Down,"ArrowDown"},{Qt::Key_Delete,"Delete"},
            {Qt::Key_Backspace,"Backspace"},{Qt::Key_Home,"Home"},{Qt::Key_End,"End"},
            {Qt::Key_PageUp,"PageUp"},{Qt::Key_PageDown,"PageDown"},{Qt::Key_Escape,"Escape"},{Qt::Key_Space," "}};
        for (const QString preset : {"premiere", "fcp"}) {
            for (const auto& menu : shellMenuDescription(preset)) {
                for (const auto& item : menu.items) {
                    if (menu.label == "File" || item.action == "playPause" || item.separator) {
                        continue;
                    }
                    for (const auto& binding : nt::edit::actionBindingKeys(preset, item.action)) {
                        ++inspected;
                        const auto key = bindingCombination(binding);
                        QVERIFY(key.key() != Qt::Key_unknown);
                        nt::edit::KeyEventLike event;
                        event.key = dom.value(key.key());
                        if (event.key.isEmpty() && key.key() >= Qt::Key_Space && key.key() <= Qt::Key_AsciiTilde) {
                            event.key = QString(QChar(static_cast<char16_t>(key.key()))).toLower();
                        }
                        event.ctrlKey = key.keyboardModifiers().testFlag(Qt::ControlModifier);
                        event.altKey = key.keyboardModifiers().testFlag(Qt::AltModifier);
                        event.shiftKey = key.keyboardModifiers().testFlag(Qt::ShiftModifier);
                        QCOMPARE(nt::edit::resolveTimelineAction(event, preset), item.action);
                    }
                }
            }
        }
        QVERIFY(inspected > 100);
    }
    void init() {
        QFile::remove(qEnvironmentVariable("NODETOOL_TIMELINE_PREFERENCES"));
    }
    void preferencesStore() {
        Preferences store;
        QCOMPARE(store.keyboardLayout(), QString("premiere"));
        QCOMPARE(store.cacheBudgetMb(), qint64(20480));
        QCOMPARE(store.cacheFolder(), QString());
        QCOMPARE(store.decoderMode(), QString("sw"));
        QCOMPARE(store.audioDevice(), QString());
        store.setKeyboardLayout("fcp");
        store.setCacheFolder("/tmp/timeline-cache");
        store.setCacheBudgetMb(512);
        store.setDecoderMode("auto");
        store.setAudioDevice("Test playback device");
        Preferences loaded;
        QCOMPARE(loaded.keyboardLayout(), QString("fcp"));
        QCOMPARE(loaded.cacheFolder(), QString("/tmp/timeline-cache"));
        QCOMPARE(loaded.cacheBudgetMb(), qint64(512));
        QCOMPARE(preferredDecodeMode(), QString("auto"));
        QCOMPARE(preferredAudioDevice(), QString("Test playback device"));
        store.setKeyboardLayout("invalid");
        store.setDecoderMode("invalid");
        QCOMPARE(store.keyboardLayout(), QString("fcp"));
        QCOMPARE(store.decoderMode(), QString("auto"));
        store.setCacheBudgetMb(0);
        QCOMPARE(store.cacheBudgetMb(), qint64(0));
        store.setCacheBudgetMb(-1);
        QCOMPARE(store.cacheBudgetMb(), qint64(-1));
        store.setCacheFolder("");
        QCOMPARE(store.cacheFolder(), QString());
    }
    void removedNodeToolLayoutFallsBackToPremiere() {
        {
            QSettings raw(qEnvironmentVariable("NODETOOL_TIMELINE_PREFERENCES"), QSettings::IniFormat);
            raw.setValue("keyboardLayout", "nodetool");
        }
        QCOMPARE(Preferences().keyboardLayout(), QString("premiere"));
    }
    void appearancePreferences() {
        Preferences store;
        QCOMPARE(store.themePreference(), QString("System"));
        QCOMPARE(store.uiScale(), 1.0);
        QCOMPARE(store.textScale(), 1.0);
        QCOMPARE(store.motionPreference(), QString("System"));
        QVERIFY(!store.reducedMotion());
        QSignalSpy changed(&store, &Preferences::changed);
        store.setThemePreference("Light");
        store.setUiScale(1.25);
        store.setTextScale(1.5);
        store.setMotionPreference("Reduce");
        QCOMPARE(changed.size(), 4);
        Preferences loaded;
        QCOMPARE(loaded.themePreference(), QString("Light"));
        QCOMPARE(loaded.uiScale(), 1.25);
        QCOMPARE(loaded.textScale(), 1.5);
        QCOMPARE(loaded.motionPreference(), QString("Reduce"));
        QVERIFY(loaded.reducedMotion());
        store.setThemePreference("invalid");
        store.setUiScale(2.01);
        store.setUiScale(std::numeric_limits<double>::quiet_NaN());
        store.setTextScale(0.99);
        store.setMotionPreference("invalid");
        QCOMPARE(changed.size(), 4);
        QSettings raw(qEnvironmentVariable("NODETOOL_TIMELINE_PREFERENCES"), QSettings::IniFormat);
        raw.setValue("appearance/themePreference", "invalid");
        raw.setValue("appearance/uiScale", "nan");
        raw.setValue("appearance/textScale", 3.0);
        raw.setValue("appearance/motionPreference", "invalid");
        raw.sync();
        Preferences corrupted;
        QCOMPARE(corrupted.themePreference(), QString("System"));
        QCOMPARE(corrupted.uiScale(), 1.0);
        QCOMPARE(corrupted.textScale(), 1.0);
        QCOMPARE(corrupted.motionPreference(), QString("System"));
    }
    void cacheEnvironment() {
        const auto folder = qgetenv("NODETOOL_TIMELINE_CACHE_DIR");
        const auto budget = qgetenv("NODETOOL_TIMELINE_CACHE_BUDGET_MB");
        const auto restore = qScopeGuard([folder, budget]() {
            if (folder.isNull()) {
                qunsetenv("NODETOOL_TIMELINE_CACHE_DIR");
            } else {
                qputenv("NODETOOL_TIMELINE_CACHE_DIR", folder);
            }
            if (budget.isNull()) {
                qunsetenv("NODETOOL_TIMELINE_CACHE_BUDGET_MB");
            } else {
                qputenv("NODETOOL_TIMELINE_CACHE_BUDGET_MB", budget);
            }
        });
        qunsetenv("NODETOOL_TIMELINE_CACHE_DIR");
        qunsetenv("NODETOOL_TIMELINE_CACHE_BUDGET_MB");
        Preferences store;
        applyCachePreferences(store);
        QVERIFY(!qEnvironmentVariableIsSet("NODETOOL_TIMELINE_CACHE_BUDGET_MB"));
        store.setCacheFolder("/tmp/preferences-cache");
        store.setCacheBudgetMb(300);
        applyCachePreferences(store);
        QCOMPARE(qgetenv("NODETOOL_TIMELINE_CACHE_DIR"), QByteArray("/tmp/preferences-cache"));
        QCOMPARE(qgetenv("NODETOOL_TIMELINE_CACHE_BUDGET_MB"), QByteArray("300"));
        qputenv("NODETOOL_TIMELINE_CACHE_DIR", "/explicit");
        qputenv("NODETOOL_TIMELINE_CACHE_BUDGET_MB", "450");
        applyCachePreferences(store);
        QCOMPARE(qgetenv("NODETOOL_TIMELINE_CACHE_DIR"), QByteArray("/explicit"));
        QCOMPARE(qgetenv("NODETOOL_TIMELINE_CACHE_BUDGET_MB"), QByteArray("450"));
        // The Windows CRT removes an environment variable assigned an empty value.
        qputenv("NODETOOL_TIMELINE_CACHE_BUDGET_MB", "");
        const QByteArray expected = qEnvironmentVariableIsSet("NODETOOL_TIMELINE_CACHE_BUDGET_MB") ? "" : "300";
        applyCachePreferences(store);
        QCOMPARE(qgetenv("NODETOOL_TIMELINE_CACHE_BUDGET_MB"), expected);
    }
    void keyboardSync() {
        Preferences saved;
        saved.setKeyboardLayout("premiere");
        TimelineModel model;
        PlaybackClock clock;
        QQuickView view;
        loadEditor(view, model, clock);
        auto* shell = shellItem(view.contentItem());
        QVERIFY(shell);
        auto* preferences = shell->findChild<Preferences*>("shellPreferences");
        QVERIFY(preferences);
        auto* gestures = view.contentItem()->findChild<ClipGestureController*>();
        QVERIFY(gestures);
        QTRY_COMPARE(gestures->keyboardPreset(), QString("premiere"));
        ClipGestureController second(view.contentItem());
        preferences->setKeyboardLayout("fcp");
        QCOMPARE(gestures->keyboardPreset(), QString("fcp"));
        QCOMPARE(second.keyboardPreset(), QString("fcp"));
        gestures->setKeyboardPreset("premiere");
        QCOMPARE(preferences->keyboardLayout(), QString("premiere"));
        QCOMPARE(second.keyboardPreset(), QString("premiere"));
        QCOMPARE(Preferences().keyboardLayout(), QString("premiere"));
    }
    void preferencesDialog() {
        TimelineModel model;
        PlaybackClock clock;
        QQuickView view;
        loadEditor(view, model, clock);
        auto* shell = shellItem(view.contentItem());
        QVERIFY(shell);
        auto* dialog = shell->findChild<QObject*>("preferencesDialog");
        QVERIFY(dialog);
        QVERIFY(!dialog->property("visible").toBool());
        QTest::keyClick(&view, Qt::Key_Comma, Qt::ControlModifier);
        QTRY_VERIFY(dialog->property("visible").toBool());
        if (const auto screenshot = qEnvironmentVariable("NT_PREFERENCES_SCREENSHOT"); !screenshot.isEmpty()) {
            QVERIFY(view.grabWindow().save(screenshot));
        }
        for (const QString name : {"themePreference", "uiScale", "textScale", "motionPreference",
                                   "keyboardLayout", "cacheFolder", "resetCacheFolder", "cacheBudgetMb", "decoderMode", "audioDevice"}) {
            QVERIFY2(dialog->findChild<QObject*>(name), qPrintable(name));
        }
        QVERIFY(QMetaObject::invokeMethod(dialog->findChild<QObject*>("themePreference"), "change", Q_ARG(QString, "Light")));
        QVERIFY(QMetaObject::invokeMethod(dialog->findChild<QObject*>("uiScale"), "change", Q_ARG(QString, "1.25")));
        QVERIFY(QMetaObject::invokeMethod(dialog->findChild<QObject*>("textScale"), "change", Q_ARG(QString, "1.5")));
        QVERIFY(QMetaObject::invokeMethod(dialog->findChild<QObject*>("motionPreference"), "change", Q_ARG(QString, "Reduce")));
        auto* keyboard = dialog->findChild<QObject*>("keyboardLayout");
        QVERIFY(QMetaObject::invokeMethod(keyboard, "change", Q_ARG(QString, "premiere")));
        QCOMPARE(Preferences().keyboardLayout(), QString("premiere"));
        QVERIFY(QMetaObject::invokeMethod(dialog->findChild<QObject*>("cacheFolder"), "commit", Q_ARG(QString, "/tmp/ui-cache")));
        QVERIFY(QMetaObject::invokeMethod(dialog->findChild<QObject*>("cacheBudgetMb"), "commit", Q_ARG(QString, "1024")));
        QVERIFY(QMetaObject::invokeMethod(dialog->findChild<QObject*>("decoderMode"), "change", Q_ARG(QString, "hw")));
        QVERIFY(QMetaObject::invokeMethod(dialog->findChild<QObject*>("audioDevice"), "change", Q_ARG(QString, "Test audio")));
        Preferences loaded;
        QCOMPARE(loaded.cacheFolder(), QString("/tmp/ui-cache"));
        QCOMPARE(loaded.cacheBudgetMb(), qint64(1024));
        QCOMPARE(loaded.decoderMode(), QString("hw"));
        QCOMPARE(loaded.audioDevice(), QString("Test audio"));
        QCOMPARE(loaded.themePreference(), QString("Light"));
        QCOMPARE(loaded.uiScale(), 1.25);
        QCOMPARE(loaded.textScale(), 1.5);
        QCOMPARE(loaded.motionPreference(), QString("Reduce"));
        const auto* folder = dialog->findChild<QObject*>("cacheFolder");
        auto* input = folder->findChild<QQuickItem*>();
        QVERIFY(input);
        input->forceActiveFocus();
        QTest::keyClick(&view, Qt::Key_Escape);
        QTRY_VERIFY(!dialog->property("visible").toBool());
        QVERIFY(view.rootObject()->hasActiveFocus());
        auto* menus = shell->findChild<ShellMenus*>();
        QVERIFY(menus);
        QCOMPARE(menus->keyboardPreset(), QString("premiere"));
        QVERIFY(menus->trigger("settings"));
        QTRY_VERIFY(dialog->property("visible").toBool());
    }
    // Issue #7086: audio while scrubbing and pitch kept while shuttling. Both default to on.
    void playbackAudioSwitches() {
        QVERIFY(Preferences().scrubAudio());
        QVERIFY(Preferences().shuttleKeepsPitch());
        TimelineModel model;
        PlaybackClock clock;
        QQuickView view;
        loadEditor(view, model, clock);
        auto* shell = shellItem(view.contentItem());
        QVERIFY(shell);
        auto* preferences = shell->findChild<Preferences*>("shellPreferences");
        auto* gestures = view.contentItem()->findChild<ClipGestureController*>();
        QVERIFY(preferences && gestures);
        QTRY_VERIFY(clock.scrubAudio() && clock.keepShuttlePitch());
        // Shift+S toggles the clock, and the store keeps it.
        QTest::keyClick(&view, Qt::Key_S, Qt::ShiftModifier);
        QVERIFY(!clock.scrubAudio());
        QVERIFY(!preferences->scrubAudio());
        QVERIFY(!Preferences().scrubAudio());
        QTest::keyClick(&view, Qt::Key_S, Qt::ShiftModifier);
        QVERIFY(clock.scrubAudio());
        QVERIFY(Preferences().scrubAudio());
        // The menu shows the state and runs the same action.
        ShellMenus menus;
        menus.setAnchor(view.rootObject());
        const auto find = [&](const QString& action) -> ShellMenuItem {
            QVariantMap context{{"gestures", QVariant::fromValue<QObject*>(gestures)}, {"timeline", QVariant::fromValue<QObject*>(&model)}};
            for (const auto& menu : shellMenuDescription("premiere", {}, context)) {
                for (const auto& item : menu.items) {
                    if (item.action == action) { return item; }
                }
            }
            return {};
        };
        auto scrub = find("toggleScrubAudio");
        QCOMPARE(scrub.action, QString("toggleScrubAudio"));
        QVERIFY(scrub.checkable && scrub.checked);
        QCOMPARE(scrub.shortcut, QKeySequence(Qt::SHIFT | Qt::Key_S).toString(QKeySequence::NativeText));
        QVERIFY(menus.trigger("toggleScrubAudio"));
        QVERIFY(!clock.scrubAudio());
        QVERIFY(!find("toggleScrubAudio").checked);
        QVERIFY(menus.trigger("toggleShuttleKeepsPitch"));
        QVERIFY(!clock.keepShuttlePitch());
        QVERIFY(!Preferences().shuttleKeepsPitch());
        QVERIFY(!find("toggleShuttleKeepsPitch").checked);
        // The transport button is the visible state.
        auto* button = view.contentItem()->findChild<QQuickItem*>("transportScrubAudio");
        QVERIFY(button);
        QCOMPARE(button->property("active").toBool(), false);
        QTest::mouseClick(&view, Qt::LeftButton, {}, button->mapToScene(QPointF(button->width() / 2, button->height() / 2)).toPoint());
        QVERIFY(clock.scrubAudio());
        QCOMPARE(button->property("active").toBool(), true);
        QVERIFY(Preferences().scrubAudio());
        // The settings dialog writes through the store to the clock.
        auto* dialog = shell->findChild<QObject*>("preferencesDialog");
        QVERIFY(dialog);
        QVERIFY(QMetaObject::invokeMethod(dialog->findChild<QObject*>("scrubAudio"), "change", Q_ARG(bool, false)));
        QVERIFY(!clock.scrubAudio());
        QVERIFY(QMetaObject::invokeMethod(dialog->findChild<QObject*>("shuttleKeepsPitch"), "change", Q_ARG(bool, true)));
        QVERIFY(clock.keepShuttlePitch());
        QVERIFY(Preferences().shuttleKeepsPitch());
        menus.setAnchor(nullptr);
    }
    void decoderLabels() {
        TimelineModel model;
        PlaybackClock clock;
        QQuickView view;
        loadEditor(view, model, clock);
        auto* shell = shellItem(view.contentItem());
        QVERIFY(shell);
        auto* decoder = shell->findChild<QObject*>("decoderMode");
        QVERIFY(decoder);
        const auto options = decoder->property("options").value<QJSValue>().toVariant().toList();
        QCOMPARE(options.size(), 3);
        QStringList labels;
        QStringList values;
        for (const auto& option : options) {
            labels << option.toMap().value("label").toString();
            values << option.toMap().value("value").toString();
        }
        QCOMPARE(values, QStringList({"sw", "hw", "auto"}));
        QCOMPARE(labels, QStringList({"Software (FFmpeg)", "Hardware (a failure fails the clip)",
            "Auto (hardware, else software)"}));
    }
    void recentOrdering() {
        Preferences preferences;
        QTemporaryDir fixtures;
        QVERIFY(fixtures.isValid());
        for (int i = 0; i < 12; ++i) {
            preferences.addRecentFile(QString("Timeline %1").arg(i), fixtures.filePath(QString("%1.json").arg(i)));
        }
        QCOMPARE(preferences.recentTimelines().size(), 10);
        QCOMPARE(preferences.recentTimelines().first().toMap().value("label").toString(), QString("Timeline 11"));
        preferences.addRecentFile("Reopened", fixtures.filePath("5.json"));
        QCOMPARE(preferences.recentTimelines().size(), 10);
        QCOMPARE(preferences.recentTimelines().first().toMap().value("label").toString(), QString("Reopened"));
        nt::server::SaveTarget target;
        target.server = QUrl("https://user:password@example.test/base?token=url-secret#secret");
        target.timelineId = "0123456789abcdef0123456789abcdef";
        target.token = "do-not-store-this-token";
        preferences.addRecentServer("Server timeline", target);
        const auto entry = preferences.recentTimelines().first().toMap();
        QCOMPARE(recentTimelineArguments(entry), QStringList({"--server", "https://example.test/base", "--timeline", target.timelineId}));
        QCOMPARE(entry.size(), 4);
        QVERIFY(!entry.contains("token"));
        QFile settings(qEnvironmentVariable("NODETOOL_TIMELINE_PREFERENCES"));
        QVERIFY(settings.open(QIODevice::ReadOnly));
        const auto bytes = settings.readAll();
        QVERIFY(!bytes.contains("do-not-store-this-token"));
        QVERIFY(!bytes.contains("url-secret"));
        QVERIFY(!bytes.contains("password"));
        QCOMPARE(Preferences().recentTimelines(), preferences.recentTimelines());
        preferences.clearRecentTimelines();
        QVERIFY(Preferences().recentTimelines().isEmpty());
    }
    void recentMenu() {
        Preferences preferences;
        QTemporaryDir fixtures;
        QVERIFY(fixtures.isValid());
        const auto path = fixtures.filePath("available.json");
        QFile file(path);
        QVERIFY(file.open(QIODevice::WriteOnly));
        file.close();
        preferences.addRecentFile("Same name", path);
        preferences.addRecentFile("Same name", fixtures.filePath("missing.json"));
        nt::server::SaveTarget target;
        target.server = QUrl("https://example.test");
        target.timelineId = "full-timeline-id";
        preferences.addRecentServer("Same name", target);
        const auto menus = shellMenuDescription("premiere", preferences.recentTimelines());
        const auto& recent = menus[0].items[0].children;
        QCOMPARE(recent.size(), size_t(4));
        QCOMPARE(recent[0].label, QString("Same name (example.test)"));
        QVERIFY(recent[0].enabled);
        QCOMPARE(recent[1].label, QString("Same name (missing.json)"));
        QVERIFY(!recent[1].enabled);
        QCOMPARE(recent[2].label, QString("Same name (available.json)"));
        QVERIFY(recent[2].enabled);
        QCOMPARE(recent[3].label, QString("Clear Menu"));
        const auto entries = preferences.recentTimelines();
        QCOMPARE(recentTimelineArguments(entries[2].toMap()), QStringList({QFileInfo(path).absoluteFilePath()}));
        ShellMenus installer;
        installer.setPreferences(&preferences);
        QVERIFY(!installer.trigger("recent:1")); // Missing file. No process is started.
        QVERIFY(installer.trigger("clearRecent"));
        QVERIFY(preferences.recentTimelines().isEmpty());
    }
    // A cloud timeline reopens with its server, id and role, and only over HTTPS.
    void recentCloud() {
        Preferences preferences;
        preferences.clearRecentTimelines();
        nt::server::CloudSource cloud{QUrl("https://user:secret@cloud.example/ignored?q=1"), "cloud-id", "viewer"};
        QVERIFY(recordOpenedTimeline(preferences, {"timeline", "https://cloud.example#cloud_timeline=cloud-id"}, true,
                                     "Shared cut", std::nullopt, cloud));
        const auto entry = Preferences().recentTimelines().first().toMap();
        QCOMPARE(entry.value("kind").toString(), QString("cloud"));
        QCOMPARE(recentTimelineArguments(entry), QStringList({"--cloud-server", "https://cloud.example", "--cloud-timeline",
                                                              "cloud-id", "--cloud-role", "viewer"}));
        const auto menus = shellMenuDescription("premiere", preferences.recentTimelines());
        QCOMPARE(menus[0].items[0].children[0].label, QString("Shared cut (cloud.example)"));
        QVERIFY(menus[0].items[0].children[0].enabled);
        // A plain HTTP address or an unknown role never becomes a cloud open.
        QVERIFY(recentTimelineArguments({{"kind", "cloud"}, {"server", "http://cloud.example"}, {"timelineId", "x"},
                                         {"role", "owner"}}).isEmpty());
        QVERIFY(recentTimelineArguments({{"kind", "cloud"}, {"server", "https://cloud.example"}, {"timelineId", "x"},
                                         {"role", "admin"}}).isEmpty());
        // Opening it again moves it to the top instead of adding a second entry.
        QVERIFY(recordOpenedTimeline(preferences, {"timeline", "x"}, true, "Shared cut", std::nullopt, cloud));
        QCOMPARE(preferences.recentTimelines().size(), 1);
        QFile settings(qEnvironmentVariable("NODETOOL_TIMELINE_PREFERENCES"));
        QVERIFY(settings.open(QIODevice::ReadOnly));
        const auto bytes = settings.readAll();
        QVERIFY(bytes.contains("cloud-id"));
        QVERIFY(!bytes.contains("secret"));
        preferences.clearRecentTimelines();
    }
    void recentBatchSafety() {
        Preferences preferences;
        const QString file = QStringLiteral(NT_FIXTURES_DIR "/av-sync.json");
        QVERIFY(!recordOpenedTimeline(preferences, {"timeline", file}, false, "Inactive"));
        for (const QString mode : {"--dump-plan", "--bench", "--screenshot", "--stills", "--play-stills", "--dump", "--conformance", "--ui-bench", "--probe-media", "--frame-server"}) {
            for (const auto& option : {mode, mode + "=output"}) {
                QVERIFY2(!interactiveTimelineRun({"timeline", file, option}), qPrintable(option));
                QVERIFY(!recordOpenedTimeline(preferences, {"timeline", file, option}, true, "Batch"));
            }
        }
        QVERIFY(preferences.recentTimelines().isEmpty());
        QVERIFY(!QFileInfo::exists(qEnvironmentVariable("NODETOOL_TIMELINE_PREFERENCES")));
        QVERIFY(interactiveTimelineRun({"timeline", file, "--decode=auto", "--size", "1200x800"}));
        QVERIFY(recordOpenedTimeline(preferences, {"timeline", file}, true, "Interactive"));
        QCOMPARE(preferences.recentTimelines().size(), 1);
        QCOMPARE(recentTimelineArguments(preferences.recentTimelines().first().toMap()), QStringList({file}));
    }
    void recentBundledServer() {
        // A timeline on the bundled server: the server takes a new port at every launch.
        Preferences preferences;
        preferences.clearRecentTimelines();
        QTemporaryDir users;
        QVERIFY(users.isValid());
        qputenv("NT_BUNDLED_SERVER_USERS", QFile::encodeName(users.path()));
        qputenv("NT_BUNDLED_SERVER_URL", "http://127.0.0.1:41001");
        nt::server::SaveTarget target;
        target.server = QUrl("http://127.0.0.1:41001");
        target.timelineId = "0123456789abcdef0123456789abcdef";
        preferences.addRecentServer("Bundled", target);
        QVERIFY(preferences.recentTimelines().first().toMap().value("bundled").toBool());
        // The next launch: the same timeline opens on the server that runs now.
        qputenv("NT_BUNDLED_SERVER_URL", "http://127.0.0.1:52002");
        const auto reopened = Preferences().recentTimelines();
        QCOMPARE(recentTimelineArguments(reopened.first().toMap()),
                 QStringList({"--server", "http://127.0.0.1:52002", "--timeline", target.timelineId}));
        // Opening it again from the new port keeps one entry.
        target.server = QUrl("http://127.0.0.1:52002");
        preferences.addRecentServer("Bundled", target);
        QCOMPARE(preferences.recentTimelines().size(), 1);
        // Another server on this machine is not the bundled one.
        target.server = QUrl("http://localhost:7777");
        preferences.addRecentServer("Dev server", target);
        QVERIFY(!preferences.recentTimelines().first().toMap().contains("bundled"));
        qunsetenv("NT_BUNDLED_SERVER_USERS");
        qunsetenv("NT_BUNDLED_SERVER_URL");
        // Without a bundled server the entry keeps the address it was saved with.
        QCOMPARE(recentTimelineArguments(preferences.recentTimelines()[1].toMap()),
                 QStringList({"--server", "http://127.0.0.1:52002", "--timeline", "0123456789abcdef0123456789abcdef"}));
        preferences.clearRecentTimelines();
    }
    void dispatch() {
        QFile file(QStringLiteral(NT_FIXTURES_DIR "/av-sync.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        auto parsed = nt::parseTimelineJson(file.readAll());
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        PlaybackClock clock;
        QQuickView view;
        m_testCache.install(*view.engine());
        view.setInitialProperties({{"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)}});
        view.loadFromModule("NodeTool.Timeline", "TimelineEditor");
        QVERIFY2(view.status() == QQuickView::Ready, qPrintable(view.errors().isEmpty() ? QString() : view.errors().first().toString()));
        view.resize(1200, 800);
        view.show();
        QVERIFY(QTest::qWaitForWindowExposed(&view));
        view.rootObject()->forceActiveFocus();
        auto* gestures = view.contentItem()->findChild<ClipGestureController*>();
        QVERIFY(gestures);
        QSignalSpy shortcuts(gestures, &ClipGestureController::shortcutsToggled);
        ShellMenus menus;
        menus.setAnchor(view.rootObject());
        auto* state = gestures->viewState();
        QVERIFY(state);
        const double zoom = state->msPerPx();
        QVERIFY(menus.trigger("zoomIn"));
        QVERIFY(state->msPerPx() < zoom);
        const double menuZoom = state->msPerPx();
        state->zoomTo(zoom, 0);
        QTest::keyClick(&view, Qt::Key_Equal);
        QCOMPARE(state->msPerPx(), menuZoom);
        const auto before = model.documentJson();
        QVERIFY(model.applyEdit("addMarker", {{"id", "menu-test"}, {"timeMs", 100}}));
        QVERIFY(model.documentJson() != before);
        QVERIFY(menus.trigger("undo"));
        QCOMPARE(model.documentJson(), before);
        QVERIFY(menus.trigger("toggleShortcuts"));
        QCOMPARE(shortcuts.count(), 1);
        auto* sheet = view.contentItem()->findChild<QObject*>("shortcutsSheet");
        QVERIFY(sheet);
        QVERIFY(sheet->property("open").toBool());
        // A disabled item does not run. With what it needs, it does.
        QVERIFY(!menus.trigger("pasteAttributes"));
        QVERIFY(!menus.trigger("linkClips"));
        auto clips = model.clipsJson();
        auto second = clips.first().toObject();
        second.insert("id", "second-clip");
        second.insert("startMs", second.value("startMs").toDouble() + second.value("durationMs").toDouble());
        clips.append(second);
        model.replaceClips(clips);
        gestures->setSelection({clips.first().toObject().value("id").toString(), "second-clip"});
        QVERIFY(menus.trigger("linkClips"));
        bool playing = clock.playing();
        QVERIFY(menus.trigger("playPause"));
        QCOMPARE(clock.playing(), !playing);
        QVERIFY(menus.trigger("playPause"));
        QCOMPARE(clock.playing(), playing);
    }
    void registeredEntriesRefuseBadInput() {
        QVERIFY(!registerShellMenuItem({"Nonsense", "test.badMenu", "Bad menu"}));
        QVERIFY(!registerShellMenuItem({"Edit", "", "No action"}));
        QVERIFY(!registerShellMenuItem({"Edit", "test.noLabel", ""}));
        QVERIFY(registerShellMenuItem({"Help", "test.once", "Once"}));
        QVERIFY(!registerShellMenuItem({"Edit", "test.once", "Twice"}));
    }
    void registeredEntriesInDescription() {
        // Registered out of order: the description sorts by group and order.
        QVERIFY(registerShellMenuItem({"Markers", "test.later", "Later", "F7", {}, "second", 30}));
        QVERIFY(registerShellMenuItem({"Markers", "test.first", "First", {}, {}, "first", 10}));
        QVERIFY(registerShellMenuItem({"Markers", "test.alsoFirst", "Also first", {}, {}, "first", 40}));
        QVERIFY(registerShellMenuItem({"Markers", "test.inSub", "In submenu", {}, "More", "second", 50}));
        QVERIFY(registerShellMenuItem({"File", "test.fileItem", "Export Thing…", {}, {}, "exporting", 0}));
        // A preset binding wins over the shortcut the entry names.
        QVERIFY(registerShellMenuItem({"Clip", "nudgeLeft", "Link here", "F9", {}, {}, 0,
            [](const QVariantMap& context) { return context.value("allow").toBool(); },
            [](const QVariantMap& context) { return context.value("tick").toBool(); }}));
        const auto menus = shellMenuDescription("premiere");
        QStringList names;
        for (const auto& menu : menus) {
            names << menu.label;
        }
        QVERIFY2(names.indexOf("Clip") > names.indexOf("Edit") && names.indexOf("Markers") > names.indexOf("Clip") &&
                 names.indexOf("View") > names.indexOf("Markers") && names.last() == "Help", qPrintable(names.join(',')));
        const auto menu = [&menus](const QString& label) -> const Menu& {
            return *std::find_if(menus.begin(), menus.end(), [&](const Menu& m) { return m.label == label; });
        };
        // The Markers menu also holds the items of the markers module, so only this test's items are compared.
        QStringList markers;
        std::vector<const ShellMenuItem*> own;
        qsizetype separatorsBetween = 0;
        for (const auto& item : menu("Markers").items) {
            if (item.separator) {
                separatorsBetween += !markers.isEmpty() && markers.last() == "Also first";
            } else if (item.action.startsWith("test.") || item.label == "More") {
                markers << item.label;
                own.push_back(&item);
            }
        }
        QCOMPARE(markers, QStringList({"First", "Also first", "Later", "More"}));
        QVERIFY2(separatorsBetween >= 1, "a group of this test starts after a separator");
        QCOMPARE(own[2]->shortcut, QString("F7"));
        QCOMPARE(own[2]->sequence, QKeySequence(Qt::Key_F7));
        QCOMPARE(own[3]->children.size(), size_t(1));
        QCOMPARE(own[3]->children[0].action, QString("test.inSub"));
        QStringList file;
        for (const auto& item : menu("File").items) {
            file << (item.separator ? QString("---") : item.label);
        }
        QCOMPARE(file.mid(3), QStringList({"---", "Export Thing…", "---", "Project Settings…", "---", "Publish to Cloud…", "Synchronize…", "---",
            "Sign In to NodeTool Cloud…", "Sign In to Another Server…", "Switch Cloud Server…", "Share…", "---", "Settings…", "Quit"}));
        const auto inClip = [](const Menu& clipMenu) -> const ShellMenuItem& {
            return *std::find_if(clipMenu.items.begin(), clipMenu.items.end(), [](const ShellMenuItem& item) { return item.action == "nudgeLeft"; });
        };
        const auto& linkHere = inClip(menu("Clip"));
        QCOMPARE(linkHere.shortcut, nt::edit::formatActionShortcut("premiere", "nudgeLeft"));
        QVERIFY(linkHere.shortcut != "F9");
        QVERIFY(linkHere.checkable);
        QVERIFY(!linkHere.enabled);
        QVERIFY(!linkHere.checked);
        const auto allowed = shellMenuDescription("premiere", {}, {{"allow", true}, {"tick", true}});
        const auto clip = std::find_if(allowed.begin(), allowed.end(), [](const Menu& m) { return m.label == "Clip"; });
        QVERIFY(inClip(*clip).enabled);
        QVERIFY(inClip(*clip).checked);
    }
    void registeredEntryDispatch() {
        QFile file(QStringLiteral(NT_FIXTURES_DIR "/av-sync.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        auto parsed = nt::parseTimelineJson(file.readAll());
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        PlaybackClock clock;
        QQuickView view;
        loadEditor(view, model, clock);
        ShellMenus menus;
        menus.setAnchor(view.rootObject());
        // The registry outlives this test, so what its entries capture must too.
        // `run` receives the editor's objects.
        // native-rules #14: test-only static
        static QVariantMap seen;
        QVERIFY(registerShellMenuItem({"Clip", "test.run", "Run", {}, {}, {}, 0, {}, {},
            [](const QVariantMap& context) { seen = context; return true; }}));
        QVERIFY(menus.trigger("test.run"));
        QCOMPARE(seen.value("kind").toString(), QString("shell"));
        QCOMPARE(seen.value("timeline").value<QObject*>(), &model);
        QVERIFY(qobject_cast<ClipGestureController*>(seen.value("gestures").value<QObject*>()));
        // A disabled entry does not run.
        // native-rules #14: test-only static counter
        static int runs = 0;
        // native-rules #14: test-only static gate
        static bool allowed = false;
        QVERIFY(registerShellMenuItem({"Clip", "test.guarded", "Guarded", {}, {}, {}, 0,
            [](const QVariantMap&) { return allowed; }, {},
            [](const QVariantMap&) { ++runs; return true; }}));
        QVERIFY(!menus.trigger("test.guarded"));
        QCOMPARE(runs, 0);
        allowed = true;
        QVERIFY(menus.trigger("test.guarded"));
        QCOMPARE(runs, 1);
        // Without `run` the entry goes through the gesture dispatcher.
        QVERIFY(registerShellMenuItem({"Sequence", "test.unknownAction", "Unknown"}));
        QVERIFY(!menus.trigger("test.unknownAction"));
        const auto before = model.documentJson();
        QVERIFY(model.applyEdit("addMarker", {{"id", "shell-test"}, {"timeMs", 100}}));
        const int index = model.undoStack()->index();
        QVERIFY(menus.trigger("undo"));
        QCOMPARE(model.documentJson(), before);
        QCOMPARE(model.undoStack()->index(), index - 1);
    }
    void registeredEntriesInPlatformMenus() {
        QFile file(QStringLiteral(NT_FIXTURES_DIR "/av-sync.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        auto parsed = nt::parseTimelineJson(file.readAll());
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        PlaybackClock clock;
        QQuickView view;
        loadEditor(view, model, clock);
        RecordingTheme theme;
        auto* original = QGuiApplicationPrivate::platform_theme;
        QGuiApplicationPrivate::platform_theme = &theme;
        const auto restore = qScopeGuard([original] { QGuiApplicationPrivate::platform_theme = original; });
        // native-rules #14: test-only static gate
        static bool on = false;
        // native-rules #14: test-only static counter
        static int runs = 0;
        QVERIFY(registerShellMenuItem({"Window", "test.toggle", "Toggle thing", {}, {}, {}, 0,
            [](const QVariantMap&) { return on; }, [](const QVariantMap&) { return on; },
            [](const QVariantMap&) { ++runs; return true; }}));
        ShellMenus menus;
        menus.setAnchor(view.rootObject());
        auto bar = RecordingBar::last;
        QVERIFY(bar);
        auto* window = bar->named("Window");
        QVERIFY(window);
        auto* toggle = window->named("Toggle thing");
        QVERIFY(toggle);
        QVERIFY(toggle->checkable);
        QVERIFY(!toggle->enabled);
        QVERIFY(!toggle->checked);
        emit toggle->activated();
        QCOMPARE(runs, 0);
        // State is read again each time the menu opens, with no rebuild.
        on = true;
        emit window->aboutToShow();
        QCOMPARE(RecordingBar::last.data(), bar.data());
        QVERIFY(toggle->enabled);
        QVERIFY(toggle->checked);
        QVERIFY(window->synced >= 1);
        emit toggle->activated();
        QCOMPARE(runs, 1);
        // Separators and submenus reach the platform menu.
        auto* markers = bar->named("Markers");
        QVERIFY(markers);
        QVERIFY(std::any_of(markers->items.begin(), markers->items.end(), [](auto* item) { return item->separator; }));
        auto* more = markers->named("More");
        QVERIFY(more && more->submenu);
        QVERIFY(static_cast<RecordingMenu*>(more->submenu)->named("In submenu"));
        menus.setAnchor(nullptr);
    }
};
int main(int argc, char** argv) {
    QTemporaryDir settings;
    if (!settings.isValid()) {
        return 1;
    }
    qputenv("NODETOOL_TIMELINE_PREFERENCES", QFile::encodeName(settings.filePath("settings.ini")));
    QGuiApplication app(argc, argv);
    TestAppShell test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_appshell.moc"
