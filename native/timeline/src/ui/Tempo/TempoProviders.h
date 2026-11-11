#pragma once

#include "wiring/RulerProviders.h"

namespace nt::tempo {
[[nodiscard]] std::vector<nt::wiring::RulerTick> barRulerTicks(const nt::wiring::RulerRequest& request);
}
