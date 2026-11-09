#include "InspectorSectionRegistry.h"
#include <QDebug>
#include <algorithm>
#include <vector>

namespace {
struct Section { QString id; QUrl source; int order; QString title; QString panel; };
std::vector<Section>& registeredSections() {
    // native-rules #14: static mutable registry, unsynchronized
    static std::vector<Section> sections;
    return sections;
}
}
bool nt::inspector::registerInspectorSection(QString id, QUrl source, int order, QString title, QString panel) {
    auto& sections = registeredSections();
    if (std::ranges::any_of(sections, [&](const auto& section) { return section.id == id; })) {
        qWarning().noquote() << "Duplicate Inspector section:" << id;
        return false;
    }
    sections.push_back({std::move(id), std::move(source), order, std::move(title), std::move(panel)});
    std::stable_sort(sections.begin(), sections.end(), [](const auto& a, const auto& b) { return a.order < b.order; });
    return true;
}
QVariantList InspectorSectionRegistry::sections() const {
    QVariantList result;
    for (const auto& section : registeredSections()) {
        result.append(QVariantMap{{"id", section.id}, {"source", section.source},
                                  {"order", section.order}, {"title", section.title}, {"panel", section.panel}});
    }
    return result;
}
