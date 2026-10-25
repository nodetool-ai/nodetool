#include "app/MenuRegistry.h"
#include <algorithm>
#include <vector>

namespace {
std::vector<nt::app::MenuItem>& items() {
    static std::vector<nt::app::MenuItem> value;
    return value;
}
}
bool nt::app::registerMenuItem(MenuItem item) {
    const QStringList kinds{"clip", "track", "lane", "ruler", "asset"};
    if (!kinds.contains(item.kind) || item.action.isEmpty() || item.label.isEmpty() ||
        std::any_of(items().begin(), items().end(), [&](const auto& i) {
            return i.kind == item.kind && i.action == item.action;
        })) {
        return false;
    }
    items().push_back(std::move(item));
    return true;
}
QVariantList MenuRegistry::query(const QString& kind, const QVariantMap& context) const {
    QVariantList out;
    for (const auto& item : items()) {
        if (item.kind == kind) {
            out.append(QVariantMap{{"action", item.action}, {"label", item.label}, {"shortcut", item.shortcut},
                                   {"enabled", !item.enabled || item.enabled(context)}});
        }
    }
    return out;
}
