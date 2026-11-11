// The items of the clip, gap, ruler and edit point menus, and the actions only those
// menus and the matching menu bar items run. Fit and fill follow FilmCraft
// (crates/engine/src/clip_ops/video_options.rs, licenses/FilmCraft-MIT.txt). The base
// transform here is already a contain fit, so a fit is scale 1 and a fill is the
// factor that makes the short side reach the frame.
#include "app/MenuRegistry.h"
#include "app/Menus/MenuContext.h"
#include "edit/clipboard/ClipboardOps.h"
#include "edit/keyframes/Keyframes.h"
#include "markers/MarkerOps.h"
#include "playback/PlaybackClock.h"
#include "preview/SceneEval.h"
#include "preview/crop/Reframe.h"
#include "ui/TimelineViewState.h"
#include "wiring/KeyActions.h"

#include <QJsonArray>
#include <algorithm>
#include <cmath>
#include <optional>

namespace {
using namespace nt::edit;
using nt::app::menu::anyTarget;
using nt::app::menu::clipTargets;
using nt::app::menu::gestures;
using nt::app::MenuPredicate;

QStringList targetIds(const ClipGestureController& g, const QVariantMap& context) {
    return context.contains("clipIds") ? context.value("clipIds").toStringList() : g.selection();
}
bool isPicture(const QJsonObject& clip) {
    const auto type = clip.value("mediaType").toString();
    return type == "video" || type == "image" || type == "overlay";
}
// The picture's size after a crop. A clip that records no size has none here.
std::optional<std::pair<double, double>> pictureSize(const QJsonObject& clip) {
    const double width = clip.value("width").toDouble();
    const double height = clip.value("height").toDouble();
    if (width <= 0 || height <= 0) { return std::nullopt; }
    const auto crop = clip.value("crop").toObject();
    if (crop.isEmpty()) { return std::pair{width, height}; }
    const auto rect = nt::reframe::cropRectPx(crop, width, height);
    return std::pair{rect.value("width").toDouble(), rect.value("height").toDouble()};
}
// A reframe already crops to the frame's shape, so its fit and fill are the same.
bool fillKnown(const QJsonObject& clip) { return isPicture(clip) && (clip.contains("reframe") || pictureSize(clip)); }

// The keyframes a fit replaces. The clip's other keyframes stay.
QJsonObject withoutFramingKeys(QJsonObject clip) {
    QStringList framing = nt::keyframes::properties("position") + nt::keyframes::properties("scale");
    framing.append({"scaleX", "scaleY"});
    auto animations = clip.value("animations").toArray();
    for (qsizetype i = animations.size() - 1; i >= 0; --i) {
        auto animation = animations[i].toObject();
        auto custom = animation.value("custom").toObject();
        if (!custom.contains("curves")) { continue; }
        QJsonArray kept;
        for (const auto& curve : custom.value("curves").toArray()) {
            if (!framing.contains(curve.toObject().value("property").toString())) { kept.append(curve); }
        }
        if (kept.isEmpty()) {
            animations.removeAt(i);
        } else {
            custom.insert("curves", kept);
            animation.insert("custom", custom);
            animations[i] = animation;
        }
    }
    if (clip.contains("animations")) { clip.insert("animations", animations); }
    return clip;
}
bool frameClips(ClipGestureController& g, const QVariantMap& context, bool fill) {
    const auto ids = targetIds(g, context);
    if (ids.isEmpty()) { return false; }
    const auto editable = editableUserTargets(g.editDoc(), IdSet(ids.begin(), ids.end()), false, false);
    const auto before = g.timeline()->clipsJson();
    auto clips = before;
    bool any = false;
    for (qsizetype i = 0; i < clips.size(); ++i) {
        auto clip = clips[i].toObject();
        if (!editable.contains(clipId(clip)) || !isPicture(clip) || (fill && !fillKnown(clip))) { continue; }
        double factor = 1;
        if (fill && !clip.contains("reframe")) {
            const auto [width, height] = *pictureSize(clip);
            const auto base = nt::containBaseScale(width, height, g.timeline()->canvasWidth(), g.timeline()->canvasHeight());
            factor = 1 / std::min(base.x, base.y);
        }
        auto transform = clip.value("transform").toObject();
        const auto scale = transform.value("scale").toObject();
        // A flip is a negative scale, and it stays.
        transform.insert("scale", QJsonObject{{"x", std::copysign(factor, scale.value("x").toDouble(1))},
                                              {"y", std::copysign(factor, scale.value("y").toDouble(1))}});
        transform.insert("position", QJsonObject{{"x", 0}, {"y", 0}});
        transform.insert("anchor", QJsonObject{{"x", 0.5}, {"y", 0.5}});
        clip.insert("transform", transform);
        clips[i] = withoutFramingKeys(clip);
        any = true;
    }
    if (!any) { return false; }
    g.timeline()->commitEdit(fill ? QStringLiteral("Fill frame") : QStringLiteral("Fit to frame"), before, clips);
    return true;
}
bool setLabel(ClipGestureController& g, const QVariantMap& context, const QString& css) {
    const auto ids = targetIds(g, context);
    const auto editable = editableUserTargets(g.editDoc(), IdSet(ids.begin(), ids.end()), false, false);
    if (editable.empty()) { return false; }
    const auto before = g.timeline()->clipsJson();
    auto clips = before;
    for (qsizetype i = 0; i < clips.size(); ++i) {
        auto clip = clips[i].toObject();
        if (!editable.contains(clipId(clip))) { continue; }
        if (css.isEmpty()) { clip.remove("labelColor"); } else { clip.insert("labelColor", css); }
        clips[i] = clip;
    }
    g.timeline()->commitEdit(QStringLiteral("Label clips"), before, clips);
    return true;
}
bool editableTarget(const QVariantMap& context) {
    auto* g = gestures(context);
    if (!g || !g->timeline()) { return false; }
    const auto ids = clipTargets(context);
    return !editableUserTargets(g->editDoc(), IdSet(ids.begin(), ids.end()), false, false).empty();
}
MenuPredicate labelIs(const QString& css) {
    return [css](const QVariantMap& context) {
        const auto clips = nt::app::menu::targetClips(context);
        return !clips.isEmpty() && std::all_of(clips.begin(), clips.end(), [&](const QJsonObject& clip) {
            return clip.value("labelColor").toString().compare(css, Qt::CaseInsensitive) == 0;
        });
    };
}

// One way to work on a cut: the edge it selects, and the tool that trims it.
struct EditPointType {
    const char* action;
    const char* label;
    const char* side;  // "leftId" holds the outgoing clip, "rightId" the incoming one
    const char* edge;
    const char* tool;
    bool bothSides = false;
};
const EditPointType editPointTypes[] = {
    {"editPoint.rippleIn", "Ripple trim in", "rightId", "start", "ripple"},
    {"editPoint.rippleOut", "Ripple trim out", "leftId", "end", "ripple"},
    {"editPoint.roll", "Roll edit", "leftId", "end", "roll", true},
    {"editPoint.trimIn", "Trim in", "rightId", "start", "select"},
    {"editPoint.trimOut", "Trim out", "leftId", "end", "select"},
};
bool editPointHasSides(const QVariantMap& context, const EditPointType& type) {
    if (type.bothSides) { return !context.value("leftId").toString().isEmpty() && !context.value("rightId").toString().isEmpty(); }
    return !context.value(type.side).toString().isEmpty();
}

const bool registered = [] {
    using C = ClipGestureController&;
    using V = const QVariantMap&;
    const auto actionGroup = QStringLiteral("Editing");
    nt::wiring::registerKeyAction({"fitToFrame", "Fit selected clips to the frame", {}, [](C g, V c) { return frameClips(g, c, false); }, actionGroup});
    nt::wiring::registerKeyAction({"fillFrame", "Fill the frame with selected clips", {}, [](C g, V c) { return frameClips(g, c, true); }, actionGroup});
    nt::wiring::registerKeyAction({"clipLabel.none", "Remove the clip label", {}, [](C g, V c) { return setLabel(g, c, {}); }, actionGroup});
    for (const auto& color : nt::markers::colors()) {
        nt::wiring::registerKeyAction({"clipLabel." + color.id, "Label clips " + color.name.toLower(), {},
            [css = color.css](C g, V c) { return setLabel(g, c, css); }, actionGroup});
    }
    for (const auto& type : editPointTypes) {
        nt::wiring::registerKeyAction({type.action, type.label, {}, [type](C g, V c) {
            if (!editPointHasSides(c, type)) { return false; }
            g.selectEdit(c.value(type.side).toString(), type.edge);
            g.setActiveTool(type.tool);
            return true;
        }, actionGroup});
    }

    const auto always = [](V) { return true; };
    const QString unlock = QStringLiteral("Unlock the clip first.");
    const QString selectPicture = QStringLiteral("Select an unlocked video or image clip first.");
    const QString selectSized = QStringLiteral("Select an unlocked video or image clip with a known picture size.");
    const QString selectMedia = QStringLiteral("This clip has no media in the Library.");
    const MenuPredicate canFit = [](V c) { return editableTarget(c) && anyTarget(c, isPicture); };
    const MenuPredicate canFill = [](V c) { return editableTarget(c) && anyTarget(c, fillKnown); };
    const MenuPredicate hasAsset = [](V c) {
        return anyTarget(c, [](const QJsonObject& clip) { return !clip.value("currentAssetId").toString().isEmpty(); });
    };

    // Clip menu, in the order and groups of a Premiere clip menu. Enable and the others
    // above Label are in ClipContextMenu.qml, because their labels follow the clip.
    nt::app::registerMenuItem({"clip", "addMarker", "Add marker", {}, always, "marker", -10});
    nt::app::registerMenuItem({"clip", "clipLabel.none", "None", {}, editableTarget, "label", -20, labelIs({}), unlock, "Label"});
    int order = -19;
    for (const auto& color : nt::markers::colors()) {
        nt::app::registerMenuItem({"clip", "clipLabel." + color.id, color.name, {}, editableTarget, "label", order++, labelIs(color.css), unlock, "Label"});
    }
    nt::app::registerMenuItem({"clip", "fitToFrame", "Fit to frame", {}, canFit, "frame", 23, {}, selectPicture});
    nt::app::registerMenuItem({"clip", "fillFrame", "Fill frame", {}, canFill, "frame", 24, {}, selectSized});
    nt::app::registerMenuItem({"clip", "revealInProject", "Reveal in Library", {}, hasAsset, "reveal", 30, {}, selectMedia});
    // The group "edit" joins Split and Duplicate, and "state" joins Lock and Enable, at the top of
    // the menu. These run on the selection, which a right click makes the clicked clip if it was not.
    nt::app::registerMenuItem({"clip", "cut", "Cut", {}, editableTarget, "edit", 0, {}, unlock});
    nt::app::registerMenuItem({"clip", "copy", "Copy", {}, always, "edit", 1});
    nt::app::registerMenuItem({"clip", "pasteAttributes", "Paste attributes…", {}, always, "edit", 2, {}, {}, {},
        [](V) { return nt::edit::clipboard::hasClipboardClips(); }});
    nt::app::registerMenuItem({"clip", "groupClips", "Group", {}, always, "state", 0, {}, {}, {},
        [](V c) { return c.value("selectedIds").toStringList().size() >= 2; }});
    nt::app::registerMenuItem({"clip", "ungroupClips", "Ungroup", {}, always, "state", 1, {}, {}, {},
        [](V c) { return anyTarget(c, isGroupClip); }});
    nt::app::registerMenuItem({"clip", "audioGain", "Audio gain…", {}, always, "audio", 5, {}, {}, {}, [](V c) {
        const auto type = c.value("mediaType").toString();
        return type == "audio" || type == "video" || type == "midi";
    }});

    // The same frame items and labels in the menu bar.
    nt::app::registerShellMenuItem({"Clip", "fitToFrame", "Fit to Frame", {}, "Video Options", "framing", 15, canFit, {}, {}, selectPicture});
    nt::app::registerShellMenuItem({"Clip", "fillFrame", "Fill Frame", {}, "Video Options", "framing", 16, canFill, {}, {}, selectSized});
    const QString selectUnlocked = QStringLiteral("Select an unlocked clip first.");
    nt::app::registerShellMenuItem({"Edit", "clipLabel.none", "None", {}, "Label", "label", 40, editableTarget, labelIs({}), {}, selectUnlocked});
    order = 41;
    for (const auto& color : nt::markers::colors()) {
        nt::app::registerShellMenuItem({"Edit", "clipLabel." + color.id, color.name, {}, "Label", "label", order++, editableTarget, labelIs(color.css), {}, selectUnlocked});
    }

    // Gap: selecting it on the right-click makes this the same action as the key.
    nt::app::registerMenuItem({"gap", "rippleDeleteSelected", "Ripple delete", {}, always, "gap", 0});

    // Ruler: the marks and the marker, at the playhead.
    const auto view = [](V c) { auto* g = gestures(c); return g ? g->viewState() : nullptr; };
    const MenuPredicate inSet = [view](V c) { return view(c) && view(c)->rangeInMs() >= 0; };
    const MenuPredicate outSet = [view](V c) { return view(c) && view(c)->rangeOutMs() >= 0; };
    const MenuPredicate anyMark = [inSet, outSet](V c) { return inSet(c) || outSet(c); };
    const MenuPredicate selected = [](V c) { auto* g = gestures(c); return g && !g->selection().isEmpty(); };
    const QString needIn = QStringLiteral("Set an In point first.");
    const QString needOut = QStringLiteral("Set an Out point first.");
    nt::app::registerMenuItem({"ruler", "markIn", "Mark in", {}, always, "mark", -60});
    nt::app::registerMenuItem({"ruler", "markOut", "Mark out", {}, always, "mark", -59});
    nt::app::registerMenuItem({"ruler", "markClip", "Mark clip", {}, nt::app::menu::canMarkClip, "mark", -58, {}, QStringLiteral("Select a clip, or move the playhead over one.")});
    nt::app::registerMenuItem({"ruler", "markSelection", "Mark selection", {}, selected, "mark", -57, {}, QStringLiteral("Select a clip first.")});
    nt::app::registerMenuItem({"ruler", "goToIn", "Go to in", {}, inSet, "goTo", -50, {}, needIn});
    nt::app::registerMenuItem({"ruler", "goToOut", "Go to out", {}, outSet, "goTo", -49, {}, needOut});
    nt::app::registerMenuItem({"ruler", "clearIn", "Clear in", {}, inSet, "clear", -40, {}, needIn});
    nt::app::registerMenuItem({"ruler", "clearOut", "Clear out", {}, outSet, "clear", -39, {}, needOut});
    nt::app::registerMenuItem({"ruler", "clearRange", "Clear in and out", {}, anyMark, "clear", -38, {}, QStringLiteral("Set an In or Out point first.")});
    nt::app::registerMenuItem({"ruler", "addMarker", "Add marker", {}, always, "marker", -30});
    nt::app::registerMenuItem({"ruler", "addRangeMarker", "Add range marker", {}, always, "marker", -29});
    nt::app::registerMenuItem({"ruler", "addMarkerInOut", "Add marker from in to out", {}, [inSet, outSet](V c) { return inSet(c) && outSet(c); }, "marker", -28,
        {}, QStringLiteral("Set In and Out points first.")});

    // Edit point: the context holds leftId and rightId, and clipIds for the transition.
    order = 0;
    for (const auto& type : editPointTypes) {
        nt::app::registerMenuItem({"editPoint", type.action, type.label, {}, [type](V c) { return editPointHasSides(c, type); }, "trim", order++,
            [type](V c) {
                auto* g = gestures(c);
                if (!g || !editPointHasSides(c, type)) { return false; }
                const auto edit = g->selectedEdit();
                return edit.value("clipId") == c.value(type.side) && edit.value("edge").toString() == type.edge && g->activeTool() == type.tool;
            }, type.bothSides ? QStringLiteral("This edit needs a clip on both sides.") : QStringLiteral("No clip on that side of this edit.")});
    }
    nt::app::registerMenuItem({"editPoint", "applyDefaultTransition", "Apply default transition", {},
        [](V c) { return !c.value("rightId").toString().isEmpty(); }, "transition", 10, {}, QStringLiteral("No clip after this edit.")});
    return true;
}();
}  // namespace
