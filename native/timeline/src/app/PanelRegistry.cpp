#include "app/PanelRegistry.h"
#include <algorithm>
#include <vector>

namespace {
std::vector<nt::app::Panel>& panels() {
    static std::vector<nt::app::Panel> value;
    return value;
}
}
bool nt::app::registerPanel(Panel panel) {
    const QStringList slotNames{"left", "right", "bottom", "overlay"};
    if (!slotNames.contains(panel.slot) || panel.id.isEmpty() || !panel.source.isValid() ||
        std::any_of(panels().begin(), panels().end(), [&](const auto& p) { return p.id == panel.id; })) {
        return false;
    }
    panels().push_back(std::move(panel));
    std::stable_sort(panels().begin(), panels().end(), [](const auto& a, const auto& b) { return a.order < b.order; });
    return true;
}
QVariantList PanelRegistry::forSlot(const QString& slot) const {
    QVariantList out;
    for (const auto& panel : panels()) {
        if (panel.slot == slot) {
            out.append(QVariantMap{{"slot", panel.slot}, {"id", panel.id}, {"source", panel.source},
                                   {"order", panel.order}, {"title", panel.title}});
        }
    }
    return out;
}
