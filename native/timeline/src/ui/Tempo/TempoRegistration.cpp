#include "TempoJson.h"
#include "app/PanelRegistry.h"
#include "wiring/SnapProviders.h"

#include <algorithm>

namespace {
const bool toolbarRegistered = nt::app::registerPanel({
    QStringLiteral("toolbar"), QStringLiteral("tempo"),
    QUrl(QStringLiteral("qrc:/qt/qml/NodeTool/Timeline/src/ui/Tempo/TempoToolbar.qml")),
    10, QStringLiteral("Tempo")});

// registration blocked: src/wiring/tst_wiring.cpp registers a mock "bars" provider

const bool snapRegistered = nt::wiring::registerSnapProvider(QStringLiteral("tempo.beats"),
    [](const nt::wiring::SnapRequest& request) -> std::vector<double> {
        const auto tracks = request.document.value("tracks").toArray();
        const bool hasMidiTrack = std::ranges::any_of(tracks, [](const QJsonValue& track) {
            return track.toObject().value("type") == "midi";
        });
        // SnapRequest has no rulerMode, so bars-only snapping remains blocked at this seam.
        if (!hasMidiTrack) { return {}; }
        return nt::tempo::visibleTempoGrid({nt::tempo::json::tempo(request.document),
            request.gridDivision.toStdString(), request.fromMs, request.toMs});
    });
}
