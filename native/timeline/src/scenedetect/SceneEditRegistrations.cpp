// What Scene Edit Detection adds to the editor: the two document edits (one
// undo entry each), the key action behind the Clip menu item, and the item.
#include "app/EditRegistry.h"
#include "app/MenuRegistry.h"
#include "edit/ClipGestureController.h"
#include "scenedetect/SceneEditPlan.h"
#include "scenedetect/SceneEditSession.h"
#include "wiring/KeyActions.h"

#include <QQmlEngine>

namespace {
// The selected clips the dialog can analyse: video clips with a media file.
QStringList analysable(const ClipGestureController& g) {
    QStringList ids;
    if (!g.timeline()) { return ids; }
    for (const QString& id : g.selection()) {
        const nt::Clip* clip = g.timeline()->findClip(id);
        if (clip && clip->mediaType == nt::MediaType::Video && !clip->mediaPath.empty()) { ids.append(id); }
    }
    return ids;
}

bool hasVideoSelection(const QVariantMap& context) {
    auto* gestures = qobject_cast<ClipGestureController*>(context.value("gestures").value<QObject*>());
    return gestures && !analysable(*gestures).isEmpty();
}

std::vector<nt::shots::CutRequest> requestsOf(const QJsonObject& payload) {
    std::vector<nt::shots::CutRequest> requests;
    for (const auto& value : payload.value("clips").toArray()) {
        const auto clip = value.toObject();
        nt::shots::CutRequest request{clip.value("id").toString(), clip.value("startMs").toDouble(),
                                      clip.value("durationMs").toDouble(), clip.value("inPointMs").toDouble(), {}};
        for (const auto& at : clip.value("atMs").toArray()) { request.atMs.push_back(at.toDouble()); }
        requests.push_back(std::move(request));
    }
    return requests;
}

const bool registered = [] {
    // Splits each clip at its detected cuts, with the linked audio, as one edit.
    // A clip that is locked, retimed or changed since the analysis stays as it is.
    nt::app::registerEdit("sceneEdit.cut", [](QJsonObject raw, const QJsonObject& payload) {
        const auto plan = nt::shots::planCuts(nt::shots::editDocOf(raw), requestsOf(payload));
        if (plan.points == 0) { return raw; }
        QJsonArray clips;
        for (const auto& clip : plan.clips) { clips.append(clip); }
        raw.insert("clips", clips);
        return raw;
    });
    // Adds a marker at each cut time that has none.
    nt::app::registerEdit("sceneEdit.markers", [](QJsonObject raw, const QJsonObject& payload) {
        std::vector<double> times;
        for (const auto& at : payload.value("timesMs").toArray()) { times.push_back(at.toDouble()); }
        raw.insert("markers", nt::shots::addCutMarkers(raw.value("markers").toArray(), times, raw.value("fps").toDouble(30)));
        return raw;
    });

    nt::wiring::registerKeyAction({"sceneEditDetection", "Scene edit detection", {},
        [](ClipGestureController& g, const QVariantMap&) {
            const auto ids = analysable(g);
            auto* engine = qmlEngine(&g);
            auto* session = engine ? engine->singletonInstance<SceneEditSession*>("NodeTool.Timeline", "SceneEditSession") : nullptr;
            if (ids.isEmpty() || !session) { return false; }
            session->requestOpen(ids);
            return true;
        }, QStringLiteral("Editing")});
    nt::app::registerShellMenuItem({"Clip", "sceneEditDetection", "Scene Edit Detection…", {}, {}, "options", 14, hasVideoSelection, {}, {},
        QStringLiteral("Select a video clip first.")});
    nt::app::registerMenuItem({"clip", "sceneEditDetection", "Scene edit detection…", {}, hasVideoSelection, {}, 1, {},
        QStringLiteral("This clip has no media file to analyse."), {},
        [](const QVariantMap& context) { return context.value("mediaType").toString() == u"video"; }});
    return true;
}();
}  // namespace
