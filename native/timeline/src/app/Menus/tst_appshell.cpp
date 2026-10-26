#include "ShellMenus.h"
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
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QtTest>
using namespace nt::app;
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
        QCOMPARE(menus.size(), size_t(5));
        QStringList names;
        for (const auto& menu : menus) {
            names << menu.label;
        }
        QCOMPARE(names, QStringList({"File", "Edit", "View", "Playback", "Help"}));
        QCOMPARE(menus[1].items[0].label, QString("Undo"));
        QCOMPARE(menus[2].items[2].label, QString("Zoom to fit content"));
        for (const auto& menu : menus) {
            for (const auto& item : menu.items) {
                if (item.action == "playPause" || menu.label == "File") {
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
                    if (menu.label == "File" || item.action == "playPause") {
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
        for (const QString name : {"keyboardLayout", "cacheFolder", "resetCacheFolder", "cacheBudgetMb", "decoderMode", "audioDevice"}) {
            QVERIFY2(dialog->findChild<QObject*>(name), qPrintable(name));
        }
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
        for (const QString mode : {"--dump-plan", "--bench", "--screenshot", "--stills", "--play-stills", "--dump", "--conformance", "--ui-bench", "--probe-media"}) {
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
        QVERIFY(!menus.trigger("pasteAttributes"));
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
