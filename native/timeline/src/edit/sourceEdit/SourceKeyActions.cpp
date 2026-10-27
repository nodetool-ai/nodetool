#include "SourceViewerState.h"
#include "wiring/KeyActions.h"
#include <QQmlEngine>

namespace {
const bool registered = [] {
    const std::pair<const char*, const char*> actions[] = {
        {"append", "Append source range to the end"},
        {"insert", "Insert source range at playhead"},
        {"overwrite", "Overwrite with source range at playhead"}};
    for (const auto& [name, label] : actions) {
        const QString kind = QString::fromLatin1(name);
        nt::wiring::registerKeyAction({"source" + kind.first(1).toUpper() + kind.sliced(1),
            QString::fromLatin1(label), {}, [kind](ClipGestureController& gestures, const QVariantMap&) {
                auto* engine = qmlEngine(&gestures);
                if (!engine) { return false; }
                auto* state = engine->singletonInstance<SourceViewerState*>("NodeTool.Timeline", "SourceViewerState");
                return state && state->perform(kind, &gestures);
            }});
    }
    return true;
}();
}
