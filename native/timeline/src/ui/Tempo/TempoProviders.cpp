#include "TempoProviders.h"
#include "TempoJson.h"

namespace nt::tempo {
std::vector<nt::wiring::RulerTick> barRulerTicks(const nt::wiring::RulerRequest& request) {
    const auto ticks = computeBarRulerTicks(json::tempo(request.document), request.msPerPx,
                                          request.fromMs, request.toMs);
    std::vector<nt::wiring::RulerTick> result;
    result.reserve(ticks.size());
    for (const auto& tick : ticks) {
        result.push_back({tick.timeMs, tick.kind == "bar", QString::fromStdString(tick.label.value_or(""))});
    }
    return result;
}
}
