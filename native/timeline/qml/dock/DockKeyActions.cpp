#include "DockLayoutStore.h"
#include "app/MenuRegistry.h"
#include "edit/ClipGestureController.h"
#include "wiring/KeyActions.h"

#include <QJSValue>
#include <algorithm>

namespace {
QQuickItem* editorOf(ClipGestureController& gestures) {
    for (QQuickItem* item = &gestures; item; item = item->parentItem()) {
        if (item->property("dockCanvas").isValid()) { return item; }
    }
    return nullptr;
}
bool callEditor(ClipGestureController& gestures, const char* method, const QVariant& argument = {}) {
    auto* editor = editorOf(gestures);
    QVariant result;
    const bool called = editor && (argument.isValid()
        ? QMetaObject::invokeMethod(editor, method, Q_RETURN_ARG(QVariant, result), Q_ARG(QVariant, argument))
        : QMetaObject::invokeMethod(editor, method, Q_RETURN_ARG(QVariant, result)));
    return called && result.toBool();
}
DockLayoutStore* storeOf(ClipGestureController& gestures) {
    auto* editor = editorOf(gestures);
    return editor ? qobject_cast<DockLayoutStore*>(editor->property("dockStore").value<QObject*>()) : nullptr;
}
ClipGestureController* gesturesIn(const QVariantMap& context) {
    return qobject_cast<ClipGestureController*>(context.value("gestures").value<QObject*>());
}
QQuickItem* editorOf(const QVariantMap& context) {
    auto* gestures = gesturesIn(context);
    return gestures ? editorOf(*gestures) : nullptr;
}
DockLayoutStore* storeOf(const QVariantMap& context) {
    auto* gestures = gesturesIn(context);
    return gestures ? storeOf(*gestures) : nullptr;
}
bool editorOpen(const QVariantMap& context) { return editorOf(context) != nullptr; }
// availablePanels leaves out a panel with nothing to show, which focusPanel refuses.
bool panelAvailable(const QVariantMap& context, const QString& panel) {
    auto* editor = editorOf(context);
    return editor && editor->property("availablePanels").value<QJSValue>().toVariant().toStringList().contains(panel);
}
bool panelShown(const QVariantMap& context, const QString& panel) {
    auto* store = storeOf(context);
    return store && panelAvailable(context, panel) && !store->layout().value("hidden").toStringList().contains(panel);
}
bool sideShown(const QVariantMap& context, const char* collapsed) {
    auto* editor = editorOf(context);
    auto* canvas = editor ? editor->property("dockCanvas").value<QObject*>() : nullptr;
    return canvas && !canvas->property(collapsed).toBool();
}
const QString openTimeline = QStringLiteral("Open a timeline first.");
const bool registered = [] {
    const QStringList ordinals{"first", "second", "third", "fourth", "fifth", "sixth", "seventh"};
    for (int index = 0; index < ordinals.size(); ++index) {
        nt::wiring::registerKeyAction({"workspace" + QString::number(index + 1), "Switch to the " + ordinals[index] + " workspace",
            {QKeySequence::fromString("Alt+Shift+" + QString::number(index + 1), QKeySequence::PortableText)},
            [index](ClipGestureController& gestures, const QVariantMap&) {
                auto* store = storeOf(gestures);
                if (store) { store->switchWorkspace(index); }
                return store != nullptr;
            }, QStringLiteral("Workspaces")});
    }
    const struct { const char* id; const char* title; const char* keys; const char* side; } sides[] = {
        {"toggleLeftPanels", "Show or hide the left panels", "Ctrl+B", "left"},
        {"toggleRightPanels", "Show or hide the right panels", "Ctrl+Alt+B", "right"}};
    for (const auto& entry : sides) {
        const QString side = entry.side;
        nt::wiring::registerKeyAction({entry.id, entry.title, {QKeySequence::fromString(entry.keys, QKeySequence::PortableText)},
            [side](ClipGestureController& gestures, const QVariantMap&) {
                for (QQuickItem* item = &gestures; item; item = item->parentItem()) {
                    auto* canvas = item->property("dockCanvas").value<QObject*>();
                    if (canvas) { return QMetaObject::invokeMethod(canvas, "toggleSide", Q_ARG(QVariant, side)); }
                }
                return false;
            }, QStringLiteral("Workspaces")});
    }
    using C = ClipGestureController&;
    using V = const QVariantMap&;
    const QString workspaces = QStringLiteral("Workspaces");
    nt::wiring::registerKeyAction({"resetWorkspace", "Reset to the saved workspace", {}, [](C gestures, V) {
        auto* store = storeOf(gestures);
        if (store) { store->resetWorkspace(); }
        return store != nullptr;
    }, workspaces});
    // The web's DAW layout has no native counterpart yet. The Audio workspace is the
    // closest, and the key comes back to the workspace it left.
    nt::wiring::registerKeyAction({"toggleDawMode", "Switch between the video and DAW layouts", {}, [](C gestures, V context) {
        auto* store = storeOf(gestures);
        if (!store) { return false; }
        if (context.value("autoRepeat").toBool()) { return true; }
        const auto names = store->workspaces();
        if (store->workspace() == "Audio") {
            store->switchWorkspace(std::max(0, static_cast<int>(names.indexOf(store->property("workspaceBeforeAudio").toString()))));
        } else {
            store->setProperty("workspaceBeforeAudio", store->workspace());
            store->switchWorkspace(static_cast<int>(names.indexOf("Audio")));
        }
        return true;
    }, QStringLiteral("Zoom & view")});
    nt::wiring::registerKeyAction({"maximizePanel", "Maximize or restore the focused panel group", {}, [](C gestures, V context) {
        return context.value("autoRepeat").toBool() || callEditor(gestures, "toggleFocusedGroup");
    }, workspaces});
    nt::wiring::registerKeyAction({"toggleProgramFullscreen", "Program monitor full screen", {}, [](C gestures, V context) {
        return context.value("autoRepeat").toBool() || callEditor(gestures, "toggleProgramFullscreen");
    }, workspaces});
    // The last column is the panel's name in the Window menu.
    const struct { const char* action; const char* title; const char* panel; const char* menuLabel; } panels[] = {
        {"panelAssets", "Go to the Library", "assets", "Library"}, {"panelEffects", "Go to Effects", "effects", "Effects"},
        {"panelSource", "Go to Source", "source", "Source"},
        {"panelTimeline", "Go to the Timeline", "tracks", "Timeline"}, {"panelProgram", "Go to Program", "program", "Program"},
        {"panelReference", "Go to Reference", "reference", "Reference"},
        {"panelInspector", "Go to the Inspector", "inspector", "Inspector"}, {"panelMixer", "Go to the Mixer", "mixer", "Mixer"},
        {"panelAudio", "Go to Audio", "audio", "Audio"},
        {"panelScript", "Go to Scripts", "script", "Scripts"}, {"panelStoryboard", "Go to Storyboards", "storyboard", "Storyboards"},
        {"panelText", "Go to Text", "transcript", "Text"},
        {"panelEffectControls", "Go to Effect Controls", "effectControls", "Effect Controls"},
        {"panelMotion", "Go to Motion", "motion", "Motion"},
        {"panelColor", "Go to Color", "color", "Color"}, {"panelScopes", "Go to Scopes", "scopes", "Scopes"},
        {"panelEntities", "Go to Entities", "entities", "Entities"}, {"panelMarkers", "Go to Markers", "markers", "Markers"},
        {"panelAssistant", "Go to the Assistant", "assistant", "Assistant"}, {"panelAi", "Go to AI", "ai", "AI"},
        {"panelActivity", "Go to Activity", "activity", "Activity"}, {"panelMusic", "Go to Music", "music", "Music"}};
    int panelOrder = 100;
    for (const auto& entry : panels) {
        const QString panel = entry.panel;
        nt::wiring::registerKeyAction({entry.action, entry.title, {}, [panel](C gestures, V) {
            return callEditor(gestures, "focusPanel", panel);
        }, workspaces});
        nt::app::registerShellMenuItem({"Window", entry.action, entry.menuLabel, {}, {}, "panels", panelOrder++,
            [panel](V context) { return panelAvailable(context, panel); },
            [panel](V context) { return panelShown(context, panel); }, {},
            panel == "source" ? QStringLiteral("Open a clip in Source first.") : QStringLiteral("Open a timeline first.")});
    }
    // Workspaces, in the order of DockLayout.js workspaceNames() that workspace1 to 7 switch through.
    const QStringList workspaceNames{"Editing", "Script", "Assistant", "Review", "Color", "Audio", "Music"};
    for (int index = 0; index < workspaceNames.size(); ++index) {
        const QString name = workspaceNames[index];
        nt::app::registerShellMenuItem({"Window", "workspace" + QString::number(index + 1), name, {}, "Workspaces", "workspaces", index,
            editorOpen, [name](V context) { auto* store = storeOf(context); return store && store->workspace() == name; }, {}, openTimeline});
    }
    nt::app::registerShellMenuItem({"Window", "resetWorkspace", "Reset to Saved Layout", {}, "Workspaces", "workspaces", 8, editorOpen, {}, {}, openTimeline});
    nt::app::registerShellMenuItem({"Window", "maximizePanel", "Maximize Frame", {}, {}, "frame", 10, editorOpen, {}, {}, openTimeline});
    nt::app::registerShellMenuItem({"Window", "nextPanel", "Next Panel", {}, {}, "frame", 11, editorOpen, {}, {}, openTimeline});
    nt::app::registerShellMenuItem({"Window", "prevPanel", "Previous Panel", {}, {}, "frame", 12, editorOpen, {}, {}, openTimeline});
    nt::app::registerShellMenuItem({"Window", "toggleLeftPanels", "Left Panels", {}, {}, "frame", 13, editorOpen,
        [](V context) { return sideShown(context, "leftCollapsed"); }, {}, openTimeline});
    nt::app::registerShellMenuItem({"Window", "toggleRightPanels", "Right Panels", {}, {}, "frame", 14, editorOpen,
        [](V context) { return sideShown(context, "rightCollapsed"); }, {}, openTimeline});
    nt::app::registerShellMenuItem({"View", "toggleProgramFullscreen", "Program Monitor Full Screen", {}, {}, "program", 0, editorOpen,
        [](V context) { auto* editor = editorOf(context); return editor && editor->property("programFullscreen").toBool(); }, {}, openTimeline});
    nt::wiring::registerKeyAction({"nextPanel", "Go to the next panel", {}, [](C gestures, V) {
        return callEditor(gestures, "cyclePanel", 1);
    }, workspaces});
    nt::wiring::registerKeyAction({"prevPanel", "Go to the previous panel", {}, [](C gestures, V) {
        return callEditor(gestures, "cyclePanel", -1);
    }, workspaces});
    return true;
}();
}
