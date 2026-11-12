// What the Markers feature adds to the editor: three document edits (one undo
// entry each, so a bulk edit is one step), the key actions behind the Markers
// menu and the marker context menu, and their menu items.
#include "app/EditRegistry.h"
#include "app/MenuRegistry.h"
#include "edit/ClipGestureController.h"
#include "markers/MarkerOps.h"
#include "markers/MarkerSession.h"
#include "model/TimelineModel.h"
#include "ui/TimelineViewState.h"
#include "wiring/KeyActions.h"

#include <QQmlEngine>

#include <algorithm>
#include <cmath>

namespace {
using namespace nt::markers;

constexpr double RANGE_MARKER_MS = 1000;

QStringList idsOf(const QJsonValue& value) {
    QStringList ids;
    for (const auto& id : value.toArray()) { ids.append(id.toString()); }
    return ids;
}
double playhead(const ClipGestureController& g) { return g.clock()->currentTimeMs(); }
double frameMs(const ClipGestureController& g) { return 1000.0 / std::max(1.0, g.timeline()->fps()); }
MarkerSession* sessionOf(ClipGestureController& g) {
    auto* engine = qmlEngine(&g);
    return engine ? engine->singletonInstance<MarkerSession*>("NodeTool.Timeline", "MarkerSession") : nullptr;
}
QString defaultName(const TimelineModel& model) { return QStringLiteral("Marker %1").arg(model.markersJson().size() + 1); }

// The markers an action works on: the one under the pointer (and the whole
// selection when it is part of it), else the selection, else the marker at the
// playhead.
QStringList targets(ClipGestureController& g, const QVariantMap& context) {
    const auto markers = g.timeline()->markers();
    auto* session = sessionOf(g);
    const auto selected = session ? session->selectedIn(markers) : QStringList{};
    const auto under = context.value("markerId").toString();
    if (!under.isEmpty()) { return selected.contains(under) ? selected : QStringList{under}; }
    if (!selected.isEmpty()) { return selected; }
    const double reach = frameMs(g) / 2;
    for (const auto& m : g.timeline()->markersJson()) {
        if (std::abs(m.toObject().value("timeMs").toDouble() - playhead(g)) <= reach) { return {m.toObject().value("id").toString()}; }
    }
    return {};
}
bool edit(ClipGestureController& g, const QString& name, const QJsonObject& payload) {
    return g.timeline()->applyEdit(name, payload) != 0;
}
bool addMarker(ClipGestureController& g, double at, double duration, const QVariantMap& context) {
    if (context.value("autoRepeat").toBool()) { return true; }
    const auto id = newId();
    QJsonObject fields{{"id", id}, {"timeMs", at}, {"label", defaultName(*g.timeline())}};
    if (duration > 0) { fields.insert("durationMs", duration); }
    if (!edit(g, "markers.add", fields)) { return false; }
    if (auto* session = sessionOf(g)) { session->select(id); }
    return true;
}
bool setColor(ClipGestureController& g, const QVariantMap& context, const QString& css) {
    const auto ids = targets(g, context);
    if (ids.isEmpty()) { return false; }
    // The colour a marker already has changes nothing, and is still the colour asked for.
    edit(g, "markers.update", {{"ids", QJsonArray::fromStringList(ids)}, {"patch", QJsonObject{{"color", css}}}});
    return true;
}
bool hasMarkers(const QVariantMap& context) {
    auto* model = qobject_cast<TimelineModel*>(context.value("timeline").value<QObject*>());
    return model && !model->markersJson().isEmpty();
}
bool inOutSet(const QVariantMap& context) {
    auto* gestures = qobject_cast<ClipGestureController*>(context.value("gestures").value<QObject*>());
    return gestures && gestures->viewState() && gestures->viewState()->rangeInMs() >= 0 && gestures->viewState()->rangeOutMs() > gestures->viewState()->rangeInMs();
}
bool editorOpen(const QVariantMap& context) { return qobject_cast<TimelineModel*>(context.value("timeline").value<QObject*>()) != nullptr; }
// The menu bar names no marker, so these items need a target the action can find.
bool markerTargeted(const QVariantMap& context) {
    auto* gestures = qobject_cast<ClipGestureController*>(context.value("gestures").value<QObject*>());
    return gestures && gestures->timeline() && !targets(*gestures, context).isEmpty();
}
bool markerAtPlayhead(const QVariantMap& context) {
    auto* gestures = qobject_cast<ClipGestureController*>(context.value("gestures").value<QObject*>());
    if (!gestures || !gestures->timeline()) { return false; }
    const double reach = frameMs(*gestures) / 2;
    const auto markers = gestures->timeline()->markersJson();
    return std::any_of(markers.begin(), markers.end(), [&](const QJsonValue& m) {
        return std::abs(m.toObject().value("timeMs").toDouble() - playhead(*gestures)) <= reach;
    });
}
bool currentColor(const QVariantMap& context, const QString& css) {
    return !css.isEmpty() ? context.value("color").toString().compare(css, Qt::CaseInsensitive) == 0 : context.value("color").toString().isEmpty();
}

const bool registered = [] {
    nt::app::registerEdit("markers.add", [](QJsonObject raw, const QJsonObject& payload) {
        raw.insert("markers", add(raw.value("markers").toArray(), payload));
        return raw;
    });
    nt::app::registerEdit("markers.update", [](QJsonObject raw, const QJsonObject& payload) {
        raw.insert("markers", update(raw.value("markers").toArray(), idsOf(payload.value("ids")), payload.value("patch").toObject()));
        return raw;
    });
    nt::app::registerEdit("markers.remove", [](QJsonObject raw, const QJsonObject& payload) {
        raw.insert("markers", remove(raw.value("markers").toArray(), idsOf(payload.value("ids"))));
        return raw;
    });

    using C = ClipGestureController&;
    using V = const QVariantMap&;
    const QString group = QStringLiteral("Playback");
    // The keys are in the Premiere preset (edit/KeymapOverlay.h). Ctrl+Shift+M stays Previous Marker
    // there, as in Premiere and the web table, so a range marker is Alt+Shift+M. No other preset
    // binds them: a default key would add rows to the web shortcut sheet.
    nt::wiring::registerKeyAction({"addRangeMarker", "Add a range marker at the playhead", {},
        [](C g, V c) { return addMarker(g, playhead(g), RANGE_MARKER_MS, c); }, group});
    nt::wiring::registerKeyAction({"addMarkerInOut", "Add a marker from in to out", {},
        [](C g, V c) {
            const double in = g.viewState()->rangeInMs();
            const double out = g.viewState()->rangeOutMs();
            return in >= 0 && out > in && addMarker(g, in, out - in, c);
        }, group});
    nt::wiring::registerKeyAction({"editMarker", "Edit the marker at the playhead", {},
        [](C g, V c) {
            auto* session = sessionOf(g);
            const auto ids = targets(g, c);
            if (!session || ids.isEmpty()) { return false; }
            session->select(ids.first());
            session->requestEdit(ids.first());
            return true;
        }, group});
    nt::wiring::registerKeyAction({"clearSelectedMarkers", "Clear the selected markers", {},
        [](C g, V c) {
            const auto ids = targets(g, c);
            if (ids.isEmpty() || !edit(g, "markers.remove", {{"ids", QJsonArray::fromStringList(ids)}})) { return false; }
            if (auto* session = sessionOf(g)) { session->clearSelection(); }
            return true;
        }, group});
    nt::wiring::registerKeyAction({"exportMarkersCsv", "Export markers as CSV", {},
        [](C g, V) {
            auto* session = sessionOf(g);
            if (!session || g.timeline()->markersJson().isEmpty()) { return false; }
            session->requestExport();
            return true;
        }, group});
    nt::wiring::registerKeyAction({"markerColor.none", "Use the default marker colour", {}, [](C g, V c) { return setColor(g, c, {}); }, group});
    for (const auto& color : colors()) {
        nt::wiring::registerKeyAction({"markerColor." + color.id, "Colour markers " + color.name.toLower(), {},
            [css = color.css](C g, V c) { return setColor(g, c, css); }, group});
    }

    // The context menu of a marker flag. The context holds markerId, timeMs and color.
    const auto always = [](const QVariantMap&) { return true; };
    nt::app::registerMenuItem({"marker", "editMarker", "Edit marker…", {}, always, "edit", 10});
    nt::app::registerMenuItem({"marker", "markerColor.none", "Default colour", {}, always, "color", 20,
        [](const QVariantMap& c) { return currentColor(c, {}); }});
    int order = 21;
    for (const auto& color : colors()) {
        nt::app::registerMenuItem({"marker", "markerColor." + color.id, color.name, {}, always, "color", order++,
            [css = color.css](const QVariantMap& c) { return currentColor(c, css); }});
    }
    nt::app::registerMenuItem({"marker", "clearSelectedMarkers", "Clear selected markers", {}, always, "clear", 40});
    nt::app::registerMenuItem({"marker", "clearAllMarkers", "Clear all markers", {}, always, "clear", 41});
    // The ruler menu clears all sequence markers, as Premiere's Clear Markers does.
    const auto rulerHasMarkers = [](const QVariantMap& c) { return c.value("hasMarkers").toBool(); };
    nt::app::registerMenuItem({"ruler", "clearAllMarkers", "Clear all markers", {}, rulerHasMarkers, "clear", 41,
        {}, {}, {}, rulerHasMarkers});

    // The Markers menu of the menu bar. The marks, Add Marker and the marker navigation
    // are in app/Menus/StandardMenus.cpp, ordered around these.
    const auto entry = [](const QString& action, const QString& label, const QString& submenu, const QString& entryGroup, int entryOrder,
                          const nt::app::MenuPredicate& enabled, const QString& reason) {
        nt::app::registerShellMenuItem({"Markers", action, label, {}, submenu, entryGroup, entryOrder, enabled, {}, {}, reason});
    };
    const QString needMarker = QStringLiteral("Add a marker first.");
    const QString needTarget = QStringLiteral("Select a marker, or move the playhead to one.");
    entry("addRangeMarker", "Add Range Marker", {}, "add", 10, editorOpen, QStringLiteral("Open a timeline first."));
    entry("addMarkerInOut", "Add Marker from In to Out", {}, "add", 11, inOutSet, QStringLiteral("Set In and Out points first."));
    entry("editMarker", "Edit Marker…", {}, "edit", 20, markerTargeted, needTarget);
    entry("markerColor.none", "Default Colour", "Marker Colour", "edit", 21, markerTargeted, needTarget);
    order = 22;
    for (const auto& color : colors()) {
        entry("markerColor." + color.id, color.name, "Marker Colour", "edit", order++, markerTargeted, needTarget);
    }
    entry("clearSelectedMarkers", "Clear Selected Markers", {}, "clear", 40, markerTargeted, needTarget);
    entry("clearMarker", "Clear Marker at Playhead", {}, "clear", 41, markerAtPlayhead, QStringLiteral("Move the playhead to a marker first."));
    entry("clearAllMarkers", "Clear All Markers", {}, "clear", 42, hasMarkers, needMarker);
    entry("exportMarkersCsv", "Export Markers as CSV…", {}, "export", 50, hasMarkers, needMarker);
    return true;
}();
}  // namespace
