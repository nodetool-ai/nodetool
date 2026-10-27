#include "TempoJson.h"
#include "TempoProviders.h"
#include "app/PanelRegistry.h"
#include "wiring/RulerProviders.h"
#include "wiring/SnapProviders.h"

#include <QDebug>
#include <algorithm>
#include <exception>

namespace {
const bool toolbarRegistered = nt::app::registerPanel({
    QStringLiteral("toolbar"), QStringLiteral("tempo"),
    QUrl(QStringLiteral("qrc:/qt/qml/NodeTool/Timeline/src/ui/Tempo/TempoToolbar.qml")),
    10, QStringLiteral("Tempo")});

const bool rulerRegistered = nt::wiring::registerRulerProvider(QStringLiteral("bars"), nt::tempo::barRulerTicks);

const bool snapRegistered = nt::wiring::registerSnapProvider(QStringLiteral("tempo.beats"),
    [](const nt::wiring::SnapRequest& request) -> std::vector<double> {
        const auto tracks = request.document.value("tracks").toArray();
        const bool hasMidiTrack = std::ranges::any_of(tracks, [](const QJsonValue& track) {
            return track.toObject().value("type") == "midi";
        });
        if (!hasMidiTrack && request.rulerMode != QStringLiteral("bars")) { return {}; }
        try {
            return nt::tempo::visibleTempoGrid({nt::tempo::json::tempo(request.document),
                request.gridDivision.toStdString(), request.fromMs, request.toMs});
        } catch (const std::exception& error) {
            qWarning().noquote() << "Tempo beat snap provider failed:" << error.what();
            return {};
        }
    });
}
