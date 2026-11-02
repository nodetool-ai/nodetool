// What Remix adds to the editor: the two document edits (one undo entry each), the
// key actions behind the Clip menu items and the clip context menu, and those items.
// "remixClip" opens the dialog, which does the work. "revertRemix" is immediate.
#include "app/EditRegistry.h"
#include "app/MenuRegistry.h"
#include "edit/ClipGestureController.h"
#include "model/TimelineModel.h"
#include "remix/clip/RemixController.h"
#include "remix/clip/RemixEdit.h"
#include "wiring/KeyActions.h"

#include <QQmlEngine>

namespace {
using nt::remix::activeRemix;

QJsonObject clipById(TimelineModel* model, const QString& id) {
    if (!model) { return {}; }
    for (const auto& value : model->clipsJson()) {
        if (value.toObject().value("id").toString() == id) { return value.toObject(); }
    }
    return {};
}
// The clip an action works on: the one under the pointer, else the first selected audio clip.
QString target(TimelineModel* model, const QStringList& selection, const QVariantMap& context) {
    const auto under = context.value("clipId").toString();
    if (!under.isEmpty()) { return under; }
    for (const auto& id : selection) {
        if (clipById(model, id).value("mediaType").toString() == QStringLiteral("audio")) { return id; }
    }
    return {};
}
QString targetOf(const QVariantMap& context) {
    auto* gestures = qobject_cast<ClipGestureController*>(context.value("gestures").value<QObject*>());
    auto* model = qobject_cast<TimelineModel*>(context.value("timeline").value<QObject*>());
    if (!model && gestures) { model = gestures->timeline(); }
    return target(model, gestures ? gestures->selection() : QStringList{}, context);
}
TimelineModel* modelOf(const QVariantMap& context) {
    auto* model = qobject_cast<TimelineModel*>(context.value("timeline").value<QObject*>());
    if (model) { return model; }
    auto* gestures = qobject_cast<ClipGestureController*>(context.value("gestures").value<QObject*>());
    return gestures ? gestures->timeline() : nullptr;
}
// The clip an item is about: the one the clip menu carries, else the target the menu bar's
// context (gestures and timeline) selects.
QJsonObject clipOf(const QVariantMap& context) {
    if (context.contains("clip")) {
        const auto clip = QJsonObject::fromVariantMap(context.value("clip").toMap());
        if (!clip.isEmpty()) { return clip; }
    }
    return clipById(modelOf(context), targetOf(context));
}
bool editable(const QVariantMap& context) { return !context.contains("editable") || context.value("editable").toBool(); }
bool canRemix(const QVariantMap& context) {
    return editable(context) && clipOf(context).value("mediaType").toString() == QStringLiteral("audio");
}
bool canRevert(const QVariantMap& context) {
    return editable(context) && !activeRemix(clipOf(context)).isEmpty();
}
RemixSession* sessionOf(ClipGestureController& g) {
    auto* engine = qmlEngine(&g);
    return engine ? engine->singletonInstance<RemixSession*>("NodeTool.Timeline", "RemixSession") : nullptr;
}

const bool registered = [] {
    nt::app::registerEdit("clip.remix", nt::remix::applyRemix);
    nt::app::registerEdit("clip.remix.revert", nt::remix::revertRemix);

    using C = ClipGestureController&;
    using V = const QVariantMap&;
    const QString group = QStringLiteral("Editing");
    nt::wiring::registerKeyAction({"remixClip", "Remix the selected music to a new length", {},
        [](C g, V c) {
            auto* session = sessionOf(g);
            const auto id = target(g.timeline(), g.selection(), c);
            if (!session || id.isEmpty() || c.value("autoRepeat").toBool()) { return false; }
            session->requestOpen(id);
            return true;
        }, group});
    nt::wiring::registerKeyAction({"revertRemix", "Put the remixed music back to its original", {},
        [](C g, V c) {
            auto* session = sessionOf(g);
            const auto id = target(g.timeline(), g.selection(), c);
            if (!session || id.isEmpty() || c.value("autoRepeat").toBool()) { return false; }
            session->requestRevert(id);
            return true;
        }, group});

    // The context menu of a clip. The context holds clipId and clip.
    const auto audioClip = [](const QVariantMap& context) { return clipOf(context).value("mediaType").toString() == QStringLiteral("audio"); };
    nt::app::registerMenuItem({"clip", "remixClip", "Remix…", {}, canRemix, "remix", 10, {}, QStringLiteral("Unlock the clip first."), {}, audioClip});
    nt::app::registerMenuItem({"clip", "revertRemix", "Revert remix", {}, canRevert, "remix", 11, {}, QStringLiteral("This clip has no remix to revert."), {}, audioClip});
    // The Clip menu of the menu bar.
    nt::app::registerShellMenuItem({"Clip", "remixClip", "Remix…", {}, {}, "remix", 30, canRemix, {}, {},
        QStringLiteral("Select an audio clip first.")});
    nt::app::registerShellMenuItem({"Clip", "revertRemix", "Revert Remix", {}, {}, "remix", 31, canRevert, {}, {},
        QStringLiteral("Select a remixed clip first.")});
    return true;
}();
}  // namespace
