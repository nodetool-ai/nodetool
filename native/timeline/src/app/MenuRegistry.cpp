#include "app/MenuRegistry.h"
#include <algorithm>
#include <iterator>
#include <map>
#include <vector>

namespace {
std::vector<nt::app::MenuItem>& items() {
    static std::vector<nt::app::MenuItem> value;
    return value;
}
std::vector<nt::app::ShellMenuEntry>& entries() {
    static std::vector<nt::app::ShellMenuEntry> value;
    return value;
}
// Display order: each group by its lowest order, then order within the group.
template <typename Item>
std::vector<Item> arranged(std::vector<Item> list) {
    std::stable_sort(list.begin(), list.end(), [](const Item& a, const Item& b) { return a.order < b.order; });
    std::map<QString, size_t> rank;
    for (const auto& item : list) {
        rank.try_emplace(item.group, rank.size());
    }
    std::stable_sort(list.begin(), list.end(), [&rank](const Item& a, const Item& b) {
        return rank.at(a.group) < rank.at(b.group);
    });
    return list;
}
}
bool nt::app::registerMenuItem(MenuItem item) {
    const QStringList kinds{"clip", "track", "lane", "ruler", "asset", "marker", "gap", "editPoint"};
    if (!kinds.contains(item.kind) || item.action.isEmpty() || item.label.isEmpty() ||
        std::any_of(items().begin(), items().end(), [&](const auto& i) {
            return i.kind == item.kind && i.action == item.action;
        })) {
        return false;
    }
    items().push_back(std::move(item));
    return true;
}
const QStringList& nt::app::shellMenuNames() {
    static const QStringList names{"File", "Edit", "Clip", "Sequence", "Markers", "View", "Playback", "Window", "Help"};
    return names;
}
bool nt::app::registerShellMenuItem(ShellMenuEntry entry) {
    if (!shellMenuNames().contains(entry.menu) || entry.action.isEmpty() || entry.label.isEmpty() ||
        std::any_of(entries().begin(), entries().end(), [&](const auto& e) { return e.action == entry.action; })) {
        return false;
    }
    entries().push_back(std::move(entry));
    return true;
}
const std::vector<nt::app::ShellMenuEntry>& nt::app::shellMenuEntries() {
    return entries();
}
std::vector<nt::app::ShellMenuEntry> nt::app::shellMenuEntries(const QString& menu) {
    std::vector<ShellMenuEntry> list;
    std::copy_if(entries().begin(), entries().end(), std::back_inserter(list), [&](const auto& e) { return e.menu == menu; });
    return arranged(std::move(list));
}
QVariantList MenuRegistry::query(const QString& kind, const QVariantMap& context) const {
    std::vector<nt::app::MenuItem> list;
    std::copy_if(items().begin(), items().end(), std::back_inserter(list), [&](const auto& i) { return i.kind == kind; });
    QVariantList out;
    const QString* previous = nullptr;
    for (const auto& item : arranged(std::move(list))) {
        out.append(QVariantMap{{"action", item.action}, {"label", item.label}, {"shortcut", item.shortcut},
                               {"enabled", !item.enabled || item.enabled(context)},
                               {"group", item.group}, {"order", item.order},
                               {"separatorBefore", previous && *previous != item.group},
                               {"checkable", bool(item.checked)},
                               {"checked", item.checked && item.checked(context)}});
        previous = &item.group;
    }
    return out;
}
