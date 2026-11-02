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
#include <QGuiApplication>
#include <QJsonArray>
#include <QJSValue>
#include <QQuickView>
#include <QSettings>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QtTest>
#include <algorithm>
#include <limits>
#include <private/qguiapplication_p.h>
#include <qpa/qplatformmenu.h>
#include <qpa/qplatformtheme.h>
using namespace nt::app;
namespace {
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
    QPlatformMenuItem* createPlatformMenuItem() const override { return new RecordingItem; }
    QPlatformMenu* createPlatformMenu() const override { return new RecordingMenu; }
    QPlatformMenuBar* createPlatformMenuBar() const override { return new RecordingBar; }
};
}
class TestAppShell : public QObject {
    Q_OBJECT
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
    void loadEditor(QQuickView& view, TimelineModel& model, PlaybackClock& clock) {
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
        const auto menus = shellMenuDescription("nodetool");
        QStringList names;
        for (const auto& menu : menus) {
            names << menu.label;
        }
        // Modules add menus and items through registerShellMenuItem. Only the built-ins are checked here.
        for (const auto& entry : shellMenuEntries()) {
            if (!QStringList({"File", "Edit", "View", "Playback", "Help"}).contains(entry.menu)) {
                names.removeAll(entry.menu);
            }
        }
        QCOMPARE(names, QStringList({"File", "Edit", "View", "Playback", "Help"}));
        const auto registered = [](const ShellMenuItem& item) {
            const auto& entries = shellMenuEntries();
            return item.separator || !item.children.empty() ||
                std::any_of(entries.begin(), entries.end(), [&](const auto& e) { return e.action == item.action; });
        };
        const auto named = [&menus](const QString& label) -> const Menu& {
            return *std::find_if(menus.begin(), menus.end(), [&](const Menu& m) { return m.label == label; });
        };
        QCOMPARE(named("Edit").items[0].label, QString("Undo"));
        QCOMPARE(named("View").items[2].label, QString("Zoom to fit content"));
        for (const auto& menu : menus) {
            for (const auto& item : menu.items) {
                if (item.action == "playPause" || menu.label == "File" || registered(item)) {
                    continue;
                }
                QCOMPARE(item.enabled, ClipGestureController::availableActions().contains(item.action));
                QCOMPARE(item.shortcut, nt::edit::formatActionShortcut("nodetool", item.action));
            }
        }
    }
    void conversions() {
        QCOMPARE(bindingCombination({"Ctrl", "Shift", "Z"}), QKeyCombination(Qt::ControlModifier | Qt::ShiftModifier, Qt::Key_Z));
        QCOMPARE(bindingCombination({"Shift", "+"}), QKeyCombination(Qt::Key_Plus));
        QCOMPARE(bindingCombination({"Alt", "←"}), QKeyCombination(Qt::AltModifier, Qt::Key_Left));
        QCOMPARE(bindingCombination({"Page Down"}), QKeyCombination(Qt::Key_PageDown));
        int inspected = 0;
        const QHash<int, QString> dom{{Qt::Key_Left,"ArrowLeft"},{Qt::Key_Right,"ArrowRight"},
            {Qt::Key_Up,"ArrowUp"},{Qt::Key_Down,"ArrowDown"},{Qt::Key_Delete,"Delete"},
            {Qt::Key_Backspace,"Backspace"},{Qt::Key_Home,"Home"},{Qt::Key_End,"End"},
            {Qt::Key_PageUp,"PageUp"},{Qt::Key_PageDown,"PageDown"},{Qt::Key_Escape,"Escape"},{Qt::Key_Space," "}};
        for (const QString preset : {"nodetool", "premiere", "fcp"}) {
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
        QCOMPARE(store.keyboardLayout(), QString("nodetool"));
        QCOMPARE(store.cacheBudgetMb(), qint64(20480));
        QCOMPARE(store.cacheFolder(), QString());
        QCOMPARE(store.decoderMode(), QString("sw"));
        QCOMPARE(store.audioDevice(), QString());
        store.setKeyboardLayout("premiere");
        store.setCacheFolder("/tmp/timeline-cache");
        store.setCacheBudgetMb(512);
        store.setDecoderMode("auto");
        store.setAudioDevice("Test playback device");
        Preferences loaded;
        QCOMPARE(loaded.keyboardLayout(), QString("premiere"));
        QCOMPARE(loaded.cacheFolder(), QString("/tmp/timeline-cache"));
        QCOMPARE(loaded.cacheBudgetMb(), qint64(512));
        QCOMPARE(preferredDecodeMode(), QString("auto"));
        QCOMPARE(preferredAudioDevice(), QString("Test playback device"));
        store.setKeyboardLayout("invalid");
        store.setDecoderMode("invalid");
        QCOMPARE(store.keyboardLayout(), QString("premiere"));
        QCOMPARE(store.decoderMode(), QString("auto"));
        store.setCacheBudgetMb(0);
        QCOMPARE(store.cacheBudgetMb(), qint64(0));
        store.setCacheBudgetMb(-1);
        QCOMPARE(store.cacheBudgetMb(), qint64(-1));
        store.setCacheFolder("");
        QCOMPARE(store.cacheFolder(), QString());
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
        qputenv("NODETOOL_TIMELINE_CACHE_BUDGET_MB", "");
        applyCachePreferences(store);
        QCOMPARE(qgetenv("NODETOOL_TIMELINE_CACHE_DIR"), QByteArray("/explicit"));
        QCOMPARE(qgetenv("NODETOOL_TIMELINE_CACHE_BUDGET_MB"), QByteArray(""));
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
        gestures->setKeyboardPreset("nodetool");
        QCOMPARE(preferences->keyboardLayout(), QString("nodetool"));
        QCOMPARE(second.keyboardPreset(), QString("nodetool"));
        QCOMPARE(Preferences().keyboardLayout(), QString("nodetool"));
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
        const auto menus = shellMenuDescription("nodetool", preferences.recentTimelines());
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
    void dispatch() {
        QFile file(QStringLiteral(NT_FIXTURES_DIR "/av-sync.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        auto parsed = nt::parseTimelineJson(file.readAll());
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        PlaybackClock clock;
        QQuickView view;
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
        QTest::keyClick(&view, Qt::Key_Plus);
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
        QVERIFY(menus.trigger("pasteAttributes"));
        QVERIFY(menus.trigger("linkClips"));
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
        QVERIFY(registerShellMenuItem({"Clip", "linkClips", "Link here", "F9", {}, {}, 0,
            [](const QVariantMap& context) { return context.value("allow").toBool(); },
            [](const QVariantMap& context) { return context.value("tick").toBool(); }}));
        const auto menus = shellMenuDescription("nodetool");
        QStringList names;
        for (const auto& menu : menus) {
            names << menu.label;
        }
        QVERIFY2(names.indexOf("Clip") > names.indexOf("Edit") && names.indexOf("Markers") > names.indexOf("Clip") &&
                 names.indexOf("View") > names.indexOf("Markers") && names.last() == "Help", qPrintable(names.join(',')));
        const auto menu = [&menus](const QString& label) -> const Menu& {
            return *std::find_if(menus.begin(), menus.end(), [&](const Menu& m) { return m.label == label; });
        };
        QStringList markers;
        for (const auto& item : menu("Markers").items) {
            markers << (item.separator ? QString("---") : item.label);
        }
        QCOMPARE(markers, QStringList({"First", "Also first", "---", "Later", "More"}));
        QCOMPARE(menu("Markers").items[3].shortcut, QString("F7"));
        QCOMPARE(menu("Markers").items[3].sequence, QKeySequence(Qt::Key_F7));
        QCOMPARE(menu("Markers").items[4].children.size(), size_t(1));
        QCOMPARE(menu("Markers").items[4].children[0].action, QString("test.inSub"));
        QStringList file;
        for (const auto& item : menu("File").items) {
            file << (item.separator ? QString("---") : item.label);
        }
        QCOMPARE(file.mid(3), QStringList({"Export…", "---", "Export Thing…", "---", "Settings…", "Quit"}));
        const auto& linkHere = menu("Clip").items[0];
        QCOMPARE(linkHere.shortcut, nt::edit::formatActionShortcut("nodetool", "linkClips"));
        QVERIFY(linkHere.shortcut != "F9");
        QVERIFY(linkHere.checkable);
        QVERIFY(!linkHere.enabled);
        QVERIFY(!linkHere.checked);
        const auto allowed = shellMenuDescription("nodetool", {}, {{"allow", true}, {"tick", true}});
        const auto clip = std::find_if(allowed.begin(), allowed.end(), [](const Menu& m) { return m.label == "Clip"; });
        QVERIFY(clip->items[0].enabled);
        QVERIFY(clip->items[0].checked);
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
        // `run` receives the editor's objects.
        QVariantMap seen;
        QVERIFY(registerShellMenuItem({"Clip", "test.run", "Run", {}, {}, {}, 0, {}, {},
            [&seen](const QVariantMap& context) { seen = context; return true; }}));
        QVERIFY(menus.trigger("test.run"));
        QCOMPARE(seen.value("kind").toString(), QString("shell"));
        QCOMPARE(seen.value("timeline").value<QObject*>(), &model);
        QVERIFY(qobject_cast<ClipGestureController*>(seen.value("gestures").value<QObject*>()));
        // A disabled entry does not run.
        int runs = 0;
        bool allowed = false;
        QVERIFY(registerShellMenuItem({"Clip", "test.guarded", "Guarded", {}, {}, {}, 0,
            [&allowed](const QVariantMap&) { return allowed; }, {},
            [&runs](const QVariantMap&) { ++runs; return true; }}));
        QVERIFY(!menus.trigger("test.guarded"));
        QCOMPARE(runs, 0);
        allowed = true;
        QVERIFY(menus.trigger("test.guarded"));
        QCOMPARE(runs, 1);
        // Without `run` the entry goes through the gesture dispatcher.
        QVERIFY(registerShellMenuItem({"Sequence", "test.unknownAction", "Unknown"}));
        QVERIFY(!menus.trigger("test.unknownAction"));
        QVERIFY(registerShellMenuItem({"Sequence", "undo", "Undo from here"}));
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
        bool on = false;
        int runs = 0;
        QVERIFY(registerShellMenuItem({"Window", "test.toggle", "Toggle thing", {}, {}, {}, 0,
            [&on](const QVariantMap&) { return on; }, [&on](const QVariantMap&) { return on; },
            [&runs](const QVariantMap&) { ++runs; return true; }}));
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
