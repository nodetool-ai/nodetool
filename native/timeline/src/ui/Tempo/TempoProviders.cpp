#include "TempoProviders.h"
#include "TempoJson.h"

#include <QDebug>
#include <exception>

namespace nt::tempo {
std::vector<nt::wiring::RulerTick> barRulerTicks(const nt::wiring::RulerRequest& request) {
    try {
        const auto ticks = computeBarRulerTicks(json::tempo(request.document), request.msPerPx,
                                              request.fromMs, request.toMs);
        std::vector<nt::wiring::RulerTick> result;
        result.reserve(ticks.size());
        for (const auto& tick : ticks) {
            result.push_back({tick.timeMs, tick.kind == "bar", QString::fromStdString(tick.label.value_or(""))});
        }
        return result;
    } catch (const std::exception& error) {
        qWarning().noquote() << "Bars ruler provider failed:" << error.what();
        return {};
    }
}
}
