#include "app/PanelRegistry.h"
#include <QRegularExpression>
#include <QDebug>
#include <algorithm>
#include <vector>

namespace {
std::vector<nt::app::Panel>& panels() {
    static std::vector<nt::app::Panel> value;
    return value;
}
}
bool nt::app::registerPanel(Panel panel) {
    static const QRegularExpression slotName(QRegularExpression::anchoredPattern(QStringLiteral("[a-z][A-Za-z0-9]*")));
    if (!slotName.match(panel.slot).hasMatch() || panel.id.isEmpty() || panel.source.isEmpty() || !panel.source.isValid() ||
        std::any_of(panels().begin(), panels().end(), [&](const auto& p) { return p.id == panel.id; })) {
        qWarning().noquote() << "Refused panel" << panel.id + ": invalid slot, id, source or duplicate id";
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
