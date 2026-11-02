// The caption edits, the action that reaches the panel, and its place in the Window menu.
#include "app/EditRegistry.h"
#include "app/MenuRegistry.h"
#include "edit/ClipGestureController.h"
#include "transcript/TranscriptDocument.h"
#include "wiring/KeyActions.h"

namespace {
QQuickItem* editorOf(ClipGestureController& gestures) {
    for (QQuickItem* item = &gestures; item; item = item->parentItem()) {
        if (item->property("dockCanvas").isValid()) { return item; }
    }
    return nullptr;
}
const bool registered = [] {
    nt::app::registerEdit("captions.setText", nt::transcript::setCueText);
    nt::app::registerEdit("captions.setTimes", nt::transcript::setCueTimes);
    nt::app::registerEdit("captions.split", nt::transcript::splitCue);
    nt::app::registerEdit("captions.merge", nt::transcript::mergeCue);
    nt::app::registerEdit("captions.delete", nt::transcript::deleteCue);
    nt::app::registerEdit("captions.add", nt::transcript::addCue);
    nt::wiring::registerKeyAction({"panelText", "Go to Text", {}, [](ClipGestureController& gestures, const QVariantMap&) {
        auto* editor = editorOf(gestures);
        QVariant result;
        return editor && QMetaObject::invokeMethod(editor, "focusPanel", Q_RETURN_ARG(QVariant, result), Q_ARG(QVariant, QStringLiteral("transcript"))) && result.toBool();
    }, QStringLiteral("Workspaces")});
    nt::app::registerShellMenuItem({"Window", "panelText", "Text"});
    return true;
}();
}
