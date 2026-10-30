#include "DockLayoutStore.h"
#include "app/PanelRegistry.h"
#include "edit/ClipGestureController.h"
#include "model/TimelineJson.h"
#include "playback/PlaybackClock.h"
#include "runtime/ChatSession.h"
#include "edit/sourceEdit/SourceViewerState.h"
#include <QMouseEvent>
#include <QQuickItem>
#include <QQuickRenderControl>
#include <QQuickRenderTarget>
#include <QQuickWindow>
#include <QQmlComponent>
#include <QQmlContext>
#include <QQmlEngine>
#include <QTemporaryDir>
#include <QtTest>
#include <array>
#include <memory>

namespace {
QQuickItem* named(QQuickItem* root, const QString& name) {
    QList<QQuickItem*> pending{root};
    while (!pending.isEmpty()) {
        auto* item = pending.takeLast();
        if (item->objectName() == name) { return item; }
        pending.append(item->childItems());
    }
    return nullptr;
}
}
class TestDockUi : public QObject {
    Q_OBJECT
    QTemporaryDir preferences;
private slots:
    void init() {
        QVERIFY(preferences.isValid());
        qputenv("NODETOOL_TIMELINE_PREFERENCES", QFile::encodeName(preferences.filePath("ui.ini")));
        QFile::remove(preferences.filePath("ui.ini"));
    }
    void mountedWorkspacesAndStablePanels() {
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(R"({"name":"Dock","width":640,"height":360,"fps":30,"durationMs":10000,"tracks":[],"clips":[]})");
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        PlaybackClock clock;
        const auto document = model.documentJson();
        QQmlEngine engine;
        nt::chat::ChatSession chat;
        const QString threadId = QStringLiteral("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        chat.upsertThread({{"id", threadId}, {"title", "Draft"}});
        chat.selectThread(threadId);
        chat.setDraft(QStringLiteral("Keep this draft"));
        engine.rootContext()->setContextProperty("nativeChatSession", &chat);
        QQuickRenderControl control;
        QQuickWindow window(&control);
        window.resize(1500, 900);
        QQmlComponent component(&engine);
        component.loadFromModule("NodeTool.Timeline", "TimelineEditor");
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> editor(component.createWithInitialProperties({
            {"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)},
            {"width", 1500}, {"height", 900}}));
        QVERIFY2(editor, qPrintable(component.errorString()));
        auto* root = qobject_cast<QQuickItem*>(editor.get());
        QVERIFY(root);
        root->setParentItem(window.contentItem());
        QImage image(1500, 900, QImage::Format_ARGB32_Premultiplied);
        window.setRenderTarget(QQuickRenderTarget::fromPaintDevice(&image));
        auto render = [&] {
            QCoreApplication::processEvents();
            control.polishItems();
            control.sync();
            control.render();
        };
        render();
        auto mouse = [&](QEvent::Type type, QPoint position, Qt::MouseButton button, Qt::MouseButtons buttons) {
            QMouseEvent event(type, QPointF(position), QPointF(position), button, buttons, Qt::NoModifier);
            QCoreApplication::sendEvent(&window, &event);
            QCoreApplication::processEvents();
        };
        auto click = [&](QQuickItem* item) {
            const auto position = item->mapToScene({item->width() / 2, item->height() / 2}).toPoint();
            mouse(QEvent::MouseButtonPress, position, Qt::LeftButton, Qt::LeftButton);
            mouse(QEvent::MouseButtonRelease, position, Qt::LeftButton, Qt::NoButton);
        };
        auto* dock = named(root, "dockCanvas");
        QVERIFY2(dock, "TimelineEditor must render DockCanvas");
        auto* store = editor->findChild<DockLayoutStore*>();
        QVERIFY(store);
        for (const auto& slot : {"left", "right", "bottom", "overlay"}) {
            QVERIFY(named(root, "panelSlot_" + QString::fromLatin1(slot)));
        }
        auto* tracks = named(root, "tracksRegion");
        auto* inspector = named(root, "timelineInspector");
        auto* scriptPanel = named(root, "timelineScriptPanel");
        auto* storyboardPanel = named(root, "timelineStoryboardPanel");
        QVERIFY(tracks);
        QVERIFY(inspector);
        QVERIFY(scriptPanel);
        QVERIFY(storyboardPanel);
        QVERIFY(scriptPanel != storyboardPanel);
        QVERIFY(named(root, "timelineAssistantPanel"));
        auto* chatLoader = named(root, "nativeChatPanel");
        QVERIFY(chatLoader);
        QCOMPARE(chatLoader->property("status").toInt(), 1);
        auto* chatPanel = named(root, "chatPanel");
        QVERIFY(chatPanel);
        auto* scriptDrafts = scriptPanel->findChild<QObject*>("scriptDrafts");
        auto* storyboardDrafts = storyboardPanel->findChild<QObject*>("storyboardDrafts");
        QVERIFY(scriptDrafts);
        QVERIFY(storyboardDrafts);
        QVERIFY(scriptDrafts != storyboardDrafts);
        QVERIFY(named(root, "sourceViewer"));
        auto* gestures = qobject_cast<ClipGestureController*>(named(root, "clipGestures"));
        QVERIFY(gestures);
        const auto sheet = gestures->shortcutSheet();
        const auto shortcutGroups = sheet.value("groups").toList();
        QCOMPARE(shortcutGroups.size(), 11);
        const auto workspaceRows = shortcutGroups.at(9).toMap();
        QCOMPARE(workspaceRows.value("title").toString(), QString("Workspaces"));
        const QStringList ordinals{"first", "second", "third", "fourth"};
        for (int i = 0; i < 4; ++i) {
            const auto row = workspaceRows.value("rows").toList().at(i + 2).toMap();
            QCOMPARE(row.value("id").toString(), "workspace" + QString::number(i + 1));
            QCOMPARE(row.value("label").toString(), "Switch to the " + ordinals[i] + " workspace");
            QVERIFY(row.value("available").toBool());
        }
        auto* monitor = named(root, "previewCompositor");
        QVERIFY(monitor);
        auto* program = monitor->parentItem()->parentItem()->parentItem();
        const std::array<int, 4> rightSizes{360, 320, 500, 0};
        const std::array<int, 4> bottomSizes{300, 240, 260, 220};
        for (int i = 0; i < 4; ++i) {
            QVERIFY(gestures->handleKey(Qt::Key_1 + i, {}, int(Qt::AltModifier | Qt::ShiftModifier), false));
            render();
            QCOMPARE(store->workspace(), store->workspaces()[i]);
            const auto visible = dock->property("visiblePanels").toStringList();
            QVERIFY(visible.contains("program"));
            QVERIFY(visible.contains("tracks"));
            const bool inspectorVisible = i == 0 || i == 1;
            QCOMPARE(visible.contains("inspector"), inspectorVisible);
            QCOMPARE(visible.contains("assistant"), i == 2);
            QCOMPARE(visible.contains("storyboard"), i == 0);
            QCOMPARE(visible.contains("script"), i == 1);
            for (const auto& unavailable : {"transcript", "shot", "instruments", "history", "code"}) {
                QVERIFY(!visible.contains(QString::fromLatin1(unavailable)));
            }
            QCOMPARE(dock->property("bottomExtent").toInt(), bottomSizes[i]);
            QCOMPARE(inspector->isVisible(), inspectorVisible);
            QVERIFY(program->isVisible());
            QVERIFY(program->width() > 0);
            QCOMPARE(tracks->height(), double(bottomSizes[i] - 28));
            QCOMPARE(dock->property("rightExtent").toInt(), rightSizes[i]);
            if (inspectorVisible) { QCOMPARE(inspector->width(), double(rightSizes[i])); }
            QCOMPARE(named(root, "tracksRegion"), tracks);
            QCOMPARE(named(root, "timelineInspector"), inspector);
        }
        QVERIFY(QMetaObject::invokeMethod(scriptDrafts, "setJsonDraft",
            Q_ARG(QString, QString()), Q_ARG(QString, QStringLiteral("test")),
            Q_ARG(QString, QStringLiteral("{unfinished"))));
        QVERIFY(scriptDrafts->property("dirty").toBool());
        QCOMPARE(chat.draft(), QStringLiteral("Keep this draft"));
        QCOMPARE(named(root, "chatPanel"), chatPanel);
        QVERIFY(!storyboardDrafts->property("dirty").toBool());
        QVERIFY(store->dispatch({{"type", "reveal"}, {"panelId", "script"}}));
        render();
        QVERIFY(scriptPanel->isVisible());
        QVERIFY(store->dispatch({{"type", "reveal"}, {"panelId", "storyboard"}}));
        render();
        QVERIFY(storyboardPanel->isVisible());
        QVERIFY(scriptDrafts->property("dirty").toBool());
        auto* storyboardEditor = named(storyboardPanel, "storyWorkspaceEditor");
        QVERIFY(storyboardEditor);
        QVERIFY(QMetaObject::invokeMethod(storyboardEditor, "openResource",
            Q_ARG(QVariant, QVariant(QStringLiteral("linked-script"))),
            Q_ARG(QVariant, QVariant(QStringLiteral("scripts")))));
        render();
        QVERIFY(scriptPanel->isVisible());
        QVERIFY(scriptDrafts->property("dirty").toBool());
        QVERIFY(store->dispatch({{"type", "hide"}, {"panelId", "script"}}));
        QVERIFY(store->dispatch({{"type", "reveal"}, {"panelId", "script"}}));
        render();
        QCOMPARE(named(root, "timelineScriptPanel"), scriptPanel);
        QVERIFY(scriptDrafts->property("dirty").toBool());
        auto* scriptEditor = named(scriptPanel, "storyWorkspaceEditor");
        QVERIFY(scriptEditor);
        QVERIFY(QMetaObject::invokeMethod(scriptEditor, "openResource",
            Q_ARG(QVariant, QVariant(QStringLiteral("linked-board"))),
            Q_ARG(QVariant, QVariant(QStringLiteral("storyboards")))));
        render();
        QVERIFY(storyboardPanel->isVisible());
        QVERIFY(scriptDrafts->property("dirty").toBool());
        QVERIFY(store->dispatch({{"type", "move"}, {"panelId", "tracks"}, {"region", "viewport"},
            {"groupId", "viewport-program"}, {"index", 1}}));
        render();
        QVERIFY(tracks->isVisible());
        QCOMPARE(named(root, "tracksRegion"), tracks);
        QVERIFY(!dock->property("visiblePanels").toStringList().contains("program"));
        store->resetWorkspace();
        store->resizeRegion("bottom", 1000, dock->width(), dock->height());
        render();
        QVERIFY(dock->property("bottomExtent").toDouble() <= dock->height() * 0.75);
        auto* layoutMenu = named(root, "dockLayoutMenu");
        QVERIFY(layoutMenu);
        QVERIFY(QMetaObject::invokeMethod(layoutMenu, "clicked"));
        render();
        auto* scriptAction = named(window.contentItem(), "dockWorkspace_Script");
        QVERIFY(scriptAction);
        QVERIFY2(scriptAction->width() > 0 && scriptAction->height() > 0, "Workspace menu items must be laid out");
        click(scriptAction);
        render();
        QCOMPARE(store->workspace(), QString("Script"));
        QVERIFY(QMetaObject::invokeMethod(layoutMenu, "clicked"));
        render();
        auto* requiredPanel = named(window.contentItem(), "dockToggle_program");
        QVERIFY(requiredPanel);
        QVERIFY(!requiredPanel->isEnabled());
        auto* inspectorToggle = named(window.contentItem(), "dockToggle_inspector");
        QVERIFY(inspectorToggle);
        click(inspectorToggle);
        render();
        QVERIFY(!inspector->isVisible());
        QVERIFY(store->layout().value("hidden").toStringList().contains("inspector"));
        QVERIFY(QMetaObject::invokeMethod(layoutMenu, "clicked"));
        render();
        click(inspectorToggle);
        render();
        QVERIFY(inspector->isVisible());
        store->resizeRegion("left", 600, dock->width(), dock->height());
        QVERIFY(QMetaObject::invokeMethod(layoutMenu, "clicked"));
        render();
        auto* resetAction = named(window.contentItem(), "dockResetWorkspace");
        QVERIFY(resetAction);
        click(resetAction);
        render();
        QCOMPARE(store->layout().value("sizes").toMap().value("left").toInt(), 480);
        store->switchWorkspace(0);
        store->resetWorkspace();
        auto* sourceState = engine.singletonInstance<SourceViewerState*>("NodeTool.Timeline", "SourceViewerState");
        QVERIFY(sourceState);
        sourceState->setAsset({{"id", "source-fixture"}, {"name", "Still"}, {"content_type", "image/png"}});
        render();
        auto* source = named(root, "sourceViewer");
        QVERIFY(source->isVisible());
        QVERIFY(source->width() > 0);
        QVERIFY(std::abs(program->width() / source->width() - 1.6) < 0.001);
        QVERIFY(QMetaObject::invokeMethod(dock, "toggleMaximize", Q_ARG(QVariant, QVariant(QStringLiteral("viewport-source")))));
        render();
        QVERIFY(!program->isVisible());
        QVERIFY(store->dispatch({{"type", "hide"}, {"panelId", "source"}}));
        render();
        QVERIFY2(program->isVisible(), "Closing a maximized optional panel must restore the required panels");
        QVERIFY(store->dispatch({{"type", "reveal"}, {"panelId", "source"}}));
        render();
        root->setWidth(400);
        render();
        auto* groupResize = named(root, "dockResizeGroups_viewport_0");
        QVERIFY(groupResize);
        const double pairLength = program->width() + source->width();
        QVERIFY(pairLength < 128);
        QCOMPARE(groupResize->property("minimum").toDouble(), pairLength / 2);
        QCOMPARE(groupResize->property("maximum").toDouble(), pairLength / 2);
        root->setWidth(1500);
        render();
        auto* tab = named(root, "dockTab_program");
        QVERIFY(tab);
        const auto start = tab->mapToScene({tab->width() / 2, tab->height() / 2}).toPoint();
        const auto finish = inspector->mapToScene({inspector->width() / 2, inspector->height() / 2}).toPoint();
        mouse(QEvent::MouseButtonPress, start, Qt::LeftButton, Qt::LeftButton);
        mouse(QEvent::MouseMove, finish, Qt::NoButton, Qt::LeftButton);
        mouse(QEvent::MouseButtonRelease, finish, Qt::LeftButton, Qt::NoButton);
        render();
        const auto right = store->layout().value("regions").toMap().value("right").toList();
        QVERIFY(right.first().toMap().value("panels").toStringList().contains("program"));
        QVERIFY(program->mapToItem(dock, QPointF{}).x() >= dock->width() - dock->property("rightExtent").toDouble());
        QCOMPARE(named(root, "timelineInspector"), inspector);
        clock.seek(1300);
        QCOMPARE(model.documentJson(), document);
        QCOMPARE(model.undoStack()->count(), 0);
        QVERIFY(image.pixelColor(10, 10).alpha() > 0);
        window.setRenderTarget({});
        root->setParentItem(nullptr);
        control.invalidate();
    }
};
QTEST_MAIN(TestDockUi)
#include "tst_dockui.moc"
