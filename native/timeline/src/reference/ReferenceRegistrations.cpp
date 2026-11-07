#include "app/MenuRegistry.h"
#include "edit/ClipGestureController.h"
#include "model/TimelineModel.h"
#include "reference/ReferenceController.h"
#include "ui/MonitorViewRegistry.h"
#include "wiring/KeyActions.h"
#include <QJsonArray>
#include <QJsonObject>

namespace {
using C = ClipGestureController&;
using V = const QVariantMap&;

ReferenceController* referenceOf(C gestures) { return ReferenceController::forOwner(&gestures); }
QString clipOf(C gestures, V context) {
    const auto clipId = context.value("clipId").toString();
    if (!clipId.isEmpty()) return clipId;
    return gestures.selection().size() == 1 ? gestures.selection().first() : QString();
}
QJsonObject rawClip(V context) { return QJsonObject::fromVariantMap(context.value("clip").toMap()); }
bool hasPicture(V context) { return rawClip(context).value("mediaType").toString() != "audio"; }
// Sets the reference and brings the panel forward, as the menu's user cannot see it otherwise.
template <typename Set> bool setting(C gestures, Set set) {
    auto* reference = referenceOf(gestures);
    if (!reference || !set(*reference)) return false;
    emit reference->revealRequested();
    return true;
}
bool clipFrame(C gestures, V context, bool last) {
    return setting(gestures, [&](ReferenceController& r) { return r.useClipFrame(clipOf(gestures, context), last); });
}

const bool registered = [] {
    nt::ui::registerMonitorView({QStringLiteral("comparison"),
                                 QUrl(QStringLiteral("qrc:/qt/qml/NodeTool/Timeline/qml/reference/ComparisonView.qml")),
                                 10, QStringLiteral("Comparison")});
    const QString group = QStringLiteral("Reference");
    nt::wiring::registerKeyAction({"setReferenceFrame", "Set reference frame", {},
        [](C g, V) { return setting(g, [](ReferenceController& r) { r.matchPlayhead(); return r.hasReference(); }); }, group});
    nt::wiring::registerKeyAction({"referenceClipFirstFrame", "Use the clip's first frame as the reference", {},
        [](C g, V c) { return clipFrame(g, c, false); }, group});
    nt::wiring::registerKeyAction({"referenceClipLastFrame", "Use the clip's last frame as the reference", {},
        [](C g, V c) { return clipFrame(g, c, true); }, group});
    nt::wiring::registerKeyAction({"referenceClipTake", "Compare another take of the clip", {},
        [](C g, V c) { return setting(g, [&](ReferenceController& r) { return r.useTake(clipOf(g, c)); }); }, group});
    nt::wiring::registerKeyAction({"referenceMarker", "Use the marker as the reference", {},
        [](C g, V c) {
            if (!c.contains("timeMs")) return false;
            QString label;
            for (const auto& value : g.timeline()->markersJson()) {
                const auto marker = value.toObject();
                if (marker.value("id").toString() == c.value("markerId").toString()) label = marker.value("label").toString();
            }
            return setting(g, [&](ReferenceController& r) { r.useMarker(c.value("timeMs").toDouble(), label); return r.hasReference(); });
        }, group});

    const auto always = [](V) { return true; };
    const QString useAsReference = QStringLiteral("Use as reference");
    nt::app::registerMenuItem({"clip", "referenceClipFirstFrame", "First frame", {}, always, "reference", 90, {}, {}, useAsReference, hasPicture});
    nt::app::registerMenuItem({"clip", "referenceClipLastFrame", "Last frame", {}, always, "reference", 91, {}, {}, useAsReference, hasPicture});
    nt::app::registerMenuItem({"clip", "referenceClipTake", "Compare another take", {},
        always, "reference", 92, {}, {}, useAsReference, [](V c) { return !ReferenceController::takesOf(rawClip(c)).isEmpty(); }});
    nt::app::registerMenuItem({"marker", "referenceMarker", "Use as reference", {}, [](V) { return true; }, "reference", 30});
    nt::app::registerShellMenuItem({"View", "setReferenceFrame", "Set Reference Frame", {}, {}, "reference", 900,
        [](V c) { return c.value("gestures").value<QObject*>() != nullptr; }, {}, {}, QStringLiteral("Open a sequence to set a reference frame.")});
    return true;
}();
}
