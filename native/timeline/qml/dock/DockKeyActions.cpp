#include "DockLayoutStore.h"
#include "edit/ClipGestureController.h"
#include "wiring/KeyActions.h"

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
const bool registered = [] {
    const QStringList ordinals{"first", "second", "third", "fourth", "fifth", "sixth"};
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
    const struct { const char* action; const char* title; const char* panel; } panels[] = {
        {"panelAssets", "Go to the Library", "assets"}, {"panelSource", "Go to Source", "source"},
        {"panelTimeline", "Go to the Timeline", "tracks"}, {"panelProgram", "Go to Program", "program"},
        {"panelInspector", "Go to the Inspector", "inspector"}, {"panelMixer", "Go to the Mixer", "mixer"},
        {"panelScript", "Go to Scripts", "script"}, {"panelStoryboard", "Go to Storyboards", "storyboard"}};
    for (const auto& entry : panels) {
        const QString panel = entry.panel;
        nt::wiring::registerKeyAction({entry.action, entry.title, {}, [panel](C gestures, V) {
            return callEditor(gestures, "focusPanel", panel);
        }, workspaces});
    }
    nt::wiring::registerKeyAction({"nextPanel", "Go to the next panel", {}, [](C gestures, V) {
        return callEditor(gestures, "cyclePanel", 1);
    }, workspaces});
    nt::wiring::registerKeyAction({"prevPanel", "Go to the previous panel", {}, [](C gestures, V) {
        return callEditor(gestures, "cyclePanel", -1);
    }, workspaces});
    return true;
}();
}
