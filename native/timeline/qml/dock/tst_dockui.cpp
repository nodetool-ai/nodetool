#include "DockLayoutStore.h"
#include "app/PanelRegistry.h"
#include "app/Preferences/PreferencesSettings.h"
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
#include <QDir>
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
        // Resize feedback must be visible before releasing the pointer, without
        // synchronously saving preferences for every motion event.
        for (const auto& region : {QStringLiteral("left"), QStringLiteral("right"), QStringLiteral("bottom")}) {
            auto* handle = named(root, "dockResize_" + region);
            QVERIFY(handle);
            QVERIFY(handle->isVisible());
            const auto extent = (region + "Extent").toUtf8();
            const double before = dock->property(extent.constData()).toDouble();
            const auto saved = nt::app::openTimelinePreferences()->value("nodetool.timeline-layout.v1");
            const auto start = handle->mapToScene({handle->width() / 2, handle->height() / 2}).toPoint();
            const QPoint delta = region == "bottom" ? QPoint(0, 40) : QPoint(region == "left" ? -40 : 40, 0);
            mouse(QEvent::MouseButtonPress, start, Qt::LeftButton, Qt::LeftButton);
            mouse(QEvent::MouseMove, start + delta, Qt::NoButton, Qt::LeftButton);
            render();
            QCOMPARE(dock->property(extent.constData()).toDouble(), before - 40);
            QCOMPARE(nt::app::openTimelinePreferences()->value("nodetool.timeline-layout.v1"), saved);
            mouse(QEvent::MouseMove, start + delta / 2, Qt::NoButton, Qt::LeftButton);
            render();
            QCOMPARE(dock->property(extent.constData()).toDouble(), before - 20);
            mouse(QEvent::MouseButtonRelease, start + delta / 2, Qt::LeftButton, Qt::NoButton);
            render();
            DockLayoutStore restored;
            QCOMPARE(restored.layout().value("sizes").toMap().value(region).toDouble(), before - 20);
            const auto committed = nt::app::openTimelinePreferences()->value("nodetool.timeline-layout.v1");
            const auto cancelStart = handle->mapToScene({handle->width() / 2, handle->height() / 2}).toPoint();
            mouse(QEvent::MouseButtonPress, cancelStart, Qt::LeftButton, Qt::LeftButton);
            mouse(QEvent::MouseMove, cancelStart + delta, Qt::NoButton, Qt::LeftButton);
            render();
            QCOMPARE(dock->property(extent.constData()).toDouble(), before - 60);
            QTest::keyClick(&window, Qt::Key_Escape);
            render();
            QCOMPARE(dock->property(extent.constData()).toDouble(), before - 20);
            mouse(QEvent::MouseButtonRelease, cancelStart + delta, Qt::LeftButton, Qt::NoButton);
            render();
            QCOMPARE(dock->property(extent.constData()).toDouble(), before - 20);
            QCOMPARE(nt::app::openTimelinePreferences()->value("nodetool.timeline-layout.v1"), committed);
            store->resizeRegion(region, before, dock->width(), dock->height());
            render();
        }
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
        QVERIFY(named(root, "timelineEntitiesPanel"));
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
            QCOMPARE(tracks->height() + named(root, "dockTab_tracks")->height(), double(bottomSizes[i]));
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
        // The Entities panel is visible only while its tab is selected, which is what lets it load on first show.
        auto* entitiesPanel = named(root, "timelineEntitiesPanel");
        QVERIFY(entitiesPanel);
        QVERIFY(!entitiesPanel->isVisible());
        QVERIFY(store->dispatch({{"type", "reveal"}, {"panelId", "entities"}}));
        render();
        QVERIFY(entitiesPanel->isVisible());
        QVERIFY(!storyboardPanel->isVisible());
        QVERIFY(store->dispatch({{"type", "reveal"}, {"panelId", "storyboard"}}));
        render();
        QVERIFY(storyboardPanel->isVisible());
        QVERIFY(!entitiesPanel->isVisible());
        // At the default left width the Entities tab does not fit, so the group menu lists it and reaches it.
        auto* entitiesTab = named(root, "dockTab_entities");
        QVERIFY(entitiesTab);
        QQuickItem* strip = entitiesTab;
        while (strip && strip->objectName() != "dockTabStrip") strip = strip->parentItem();
        QVERIFY(strip);
        QQuickItem* group = strip;
        while (group && !group->objectName().startsWith("dockGroup_")) group = group->parentItem();
        QVERIFY(group);
        QVERIFY2(strip->property("hiddenIds").toStringList().contains("entities"), "Entities must overflow the default left dock");
        // A window driven by a render control is never shown, so give its popup layer the window's size before a menu opens in it.
        auto sizePopupLayer = [&] {
            for (auto* child : group->findChildren<QObject*>()) {
                if (!QByteArray(child->metaObject()->className()).contains("ContextMenu")) continue;
                if (auto* overlay = qobject_cast<QQuickItem*>(qvariant_cast<QObject*>(child->property("parent")))) { overlay->setPosition(QPointF(0, 0)); overlay->setSize(window.size()); }
            }
        };
        auto showMenu = [&] {
            sizePopupLayer();
            QVERIFY(QMetaObject::invokeMethod(group, "openMenu", Q_ARG(QVariant, QVariant(QStringLiteral("storyboard"))),
                Q_ARG(QVariant, strip->property("optionsButton")), Q_ARG(QVariant, QVariant(true))));
            render();
        };
        showMenu();
        auto* hiddenEntry = named(window.contentItem(), "dockHiddenTab_entities");
        QVERIFY(hiddenEntry);
        render();
        for (int attempt = 0; attempt < 20 && (hiddenEntry->width() <= 0 || hiddenEntry->height() <= 0); ++attempt) { QTest::qWait(20); render(); }
        QVERIFY2(hiddenEntry->width() > 0 && hiddenEntry->height() > 0, "The hidden-tab entry must be laid out");
        QCOMPARE(hiddenEntry->property("text").toString(), QString("Entities"));
        const auto capture = qEnvironmentVariable("NT_ENTITY_CAPTURE_DIR");
        if (!capture.isEmpty()) {
            QDir().mkpath(capture);
            auto* theme = engine.singletonInstance<QObject*>("NodeTool.UiPrimitives", "Theme");
            QVERIFY(theme);
            for (const auto& [name, preference] : {std::pair{QString("dark"), 2}, std::pair{QString("light"), 3}}) {
                theme->setProperty("preference", preference);
                for (int pass = 0; pass < 4; ++pass) { QTest::qWait(30); render(); }
                QVERIFY(image.copy(0, 0, 700, 520).save(QDir(capture).filePath(name + "-dock-overflow-menu.png")));
            }
            theme->setProperty("preference", 2);
            render();
        }
        click(hiddenEntry);
        render();
        QVERIFY(entitiesPanel->isVisible());
        QVERIFY(!strip->property("hiddenIds").toStringList().contains("entities"));
        // Revealing a tab scrolls it into view, as the layout menu does.
        QVERIFY(store->dispatch({{"type", "reveal"}, {"panelId", "storyboard"}}));
        render();
        QVERIFY(store->dispatch({{"type", "reveal"}, {"panelId", "entities"}}));
        render();
        QVERIFY(!strip->property("hiddenIds").toStringList().contains("entities"));
        // The Library hands an image to the Entities panel through the editor.
        QVERIFY(QMetaObject::invokeMethod(root, "openEntityEditor", Q_ARG(QVariant, QVariant(QStringLiteral("asset-1"))), Q_ARG(QVariant, QVariant(false))));
        render();
        auto* entityEditor = entitiesPanel->findChild<QObject*>("entityEditorDialog");
        QVERIFY(entityEditor);
        QTRY_VERIFY(entityEditor->property("opened").toBool());
        QCOMPARE(entityEditor->property("title").toString(), QString("New entity"));
        QCOMPARE(entityEditor->property("referenceAssetId").toString(), QString("asset-1"));
        QVERIFY(entitiesPanel->isVisible());
        QVERIFY(QMetaObject::invokeMethod(entityEditor, "close"));
        render();
        // After an entity changes, the editor reloads the Library so its menu names the right action.
        auto* explorer = named(root, "assetExplorer");
        QVERIFY(explorer);
        QObject* libraryBrowser = nullptr;
        for (auto* child : explorer->findChildren<QObject*>()) {
            if (child->metaObject()->indexOfSignal("assetsChanged()") >= 0) { libraryBrowser = child; break; }
        }
        QVERIFY(libraryBrowser && libraryBrowser->metaObject()->indexOfSignal("assetsChanged()") >= 0);
        QSignalSpy refreshed(libraryBrowser, SIGNAL(assetsChanged()));
        QVERIFY(QMetaObject::invokeMethod(root, "refreshLibrary"));
        QVERIFY2(refreshed.count() >= 1, "refreshLibrary must reload the Library");
        QVERIFY(store->dispatch({{"type", "reveal"}, {"panelId", "storyboard"}}));
        render();
        QVERIFY(!entitiesPanel->isVisible());
        QVERIFY(QMetaObject::invokeMethod(root, "openEntityEditor", Q_ARG(QVariant, QVariant(QStringLiteral("asset-2"))), Q_ARG(QVariant, QVariant(true))));
        render();
        QVERIFY(entitiesPanel->isVisible());
        QVERIFY(QMetaObject::invokeMethod(entityEditor, "close"));
        render();
        QVERIFY(store->dispatch({{"type", "reveal"}, {"panelId", "storyboard"}}));
        render();
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
        QTRY_VERIFY2(scriptAction->width() > 0 && scriptAction->height() > 0, "Workspace menu items must be laid out");
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
        render();
        // The menu of a group on the right opens inside that group, from the options button and from a right-clicked tab.
        {
            auto* inspectorTab = named(root, "dockTab_inspector");
            QVERIFY(inspectorTab);
            QQuickItem* rightGroup = inspectorTab;
            while (rightGroup && !rightGroup->objectName().startsWith("dockGroup_")) rightGroup = rightGroup->parentItem();
            QVERIFY(rightGroup);
            const double groupLeft = rightGroup->mapToScene({0, 0}).x(), groupRight = groupLeft + rightGroup->width();
            QVERIFY2(groupLeft > dock->width() / 2, "The inspector group must be on the right");
            QObject* groupMenu = nullptr;
            for (auto* child : rightGroup->findChildren<QObject*>()) {
                if (QByteArray(child->metaObject()->className()).contains("ContextMenu")) { groupMenu = child; break; }
            }
            QVERIFY(groupMenu);
            // A window driven by a render control is never shown, so give its popup layer the window's size first.
            if (auto* overlay = qobject_cast<QQuickItem*>(qvariant_cast<QObject*>(groupMenu->property("parent")))) {
                overlay->setPosition(QPointF(0, 0));
                overlay->setSize(window.size());
            }
            auto checkMenu = [&](const char* how, QQuickItem* anchor) {
                QTRY_VERIFY2(groupMenu->property("opened").toBool(), how);
                render();
                const double menuLeft = groupMenu->property("x").toDouble(), menuRight = menuLeft + groupMenu->property("width").toDouble();
                QVERIFY2(menuLeft >= groupLeft - 0.5 && menuRight <= groupRight + 0.5,
                    qPrintable(QString("%1: menu %2..%3 is outside the group %4..%5").arg(how).arg(menuLeft).arg(menuRight).arg(groupLeft).arg(groupRight)));
                // It hangs from the anchor rather than from the group's corner.
                const double anchorBottom = anchor->mapToScene({0, anchor->height()}).y();
                QVERIFY2(std::abs(groupMenu->property("y").toDouble() - anchorBottom) <= 1, how);
                QVERIFY(QMetaObject::invokeMethod(groupMenu, "close"));
                render();
                QTRY_VERIFY(!groupMenu->property("visible").toBool());
            };
            QVERIFY(QMetaObject::invokeMethod(rightGroup, "openMenu", Q_ARG(QVariant, QVariant(QStringLiteral("inspector"))),
                Q_ARG(QVariant, strip->property("optionsButton")), Q_ARG(QVariant, QVariant(true))));
            render();
            QQuickItem* strip = inspectorTab;
            while (strip && strip->objectName() != "dockTabStrip") strip = strip->parentItem();
            QVERIFY(strip);
            checkMenu("options button", qobject_cast<QQuickItem*>(qvariant_cast<QObject*>(strip->property("optionsButton"))));
            mouse(QEvent::MouseButtonPress, inspectorTab->mapToScene({inspectorTab->width() / 2, inspectorTab->height() / 2}).toPoint(), Qt::RightButton, Qt::RightButton);
            mouse(QEvent::MouseButtonRelease, inspectorTab->mapToScene({inspectorTab->width() / 2, inspectorTab->height() / 2}).toPoint(), Qt::RightButton, Qt::NoButton);
            render();
            checkMenu("right-clicked tab", inspectorTab);
        }
        auto* sourceState = engine.singletonInstance<SourceViewerState*>("NodeTool.Timeline", "SourceViewerState");
        QVERIFY(sourceState);
        sourceState->setAsset({{"id", "source-fixture"}, {"name", "Still"}, {"content_type", "image/png"}});
        render();
        auto* source = named(root, "sourceViewer");
        QVERIFY(source->isVisible());
        QVERIFY(source->width() > 0);
        QVERIFY(std::abs(program->width() / source->width() - 1.6) < 0.001);
        auto* pairHandle = named(root, "dockResizeGroups_viewport_0");
        QVERIFY(pairHandle);
        const double programWidth = program->width(), sourceWidth = source->width();
        const auto pairStart = pairHandle->mapToScene({pairHandle->width() / 2, pairHandle->height() / 2}).toPoint();
        const auto savedPair = nt::app::openTimelinePreferences()->value("nodetool.timeline-layout.v1");
        mouse(QEvent::MouseButtonPress, pairStart, Qt::LeftButton, Qt::LeftButton);
        mouse(QEvent::MouseMove, pairStart + QPoint(30, 0), Qt::NoButton, Qt::LeftButton);
        render();
        QVERIFY(std::abs(program->width() - programWidth - 30) < 0.001);
        QVERIFY(std::abs(source->width() - sourceWidth + 30) < 0.001);
        QCOMPARE(nt::app::openTimelinePreferences()->value("nodetool.timeline-layout.v1"), savedPair);
        mouse(QEvent::MouseButtonRelease, pairStart + QPoint(30, 0), Qt::LeftButton, Qt::NoButton);
        render();
        DockLayoutStore restoredPair;
        QCOMPARE(restoredPair.layout(), store->layout());
        QCOMPARE(named(root, "previewCompositor"), monitor);
        QCOMPARE(monitor->parentItem()->parentItem()->parentItem(), program);
        QCOMPARE(named(root, "sourceViewer"), source);
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
        auto* programGroup = named(root, "dockTab_program")->parentItem();
        while (programGroup && !programGroup->objectName().startsWith("dockGroup_")) programGroup = programGroup->parentItem();
        QVERIFY(programGroup);
        const auto groupId = programGroup->objectName().mid(QStringLiteral("dockGroup_").size());
        auto* options = named(root, "dockPanelOptions_" + groupId);
        QVERIFY(options);
        click(options);
        render();
        auto* closeItem = named(window.contentItem(), "dockMenuClose_" + groupId);
        QVERIFY(closeItem);
        QTRY_VERIFY2(closeItem->isVisible() && closeItem->width() > options->width() * 2, "Panel options menu must show its items");
        QTest::keyClick(&window, Qt::Key_Escape);
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
