#include "TempoGridQml.h"
#include "TempoJson.h"

#include <QQmlEngine>
#include <stdexcept>

namespace {
QVariantList reportError(const QObject* owner, const std::exception& error) {
    if (auto* engine = qmlEngine(owner)) {
        engine->throwError(QString::fromUtf8(error.what()));
    }
    return {};
}
} // namespace

QVariantList TempoGridQml::divisionOptions() const { return nt::tempo::json::options().toVariantList(); }
QVariantList TempoGridQml::barRulerTicks(const QVariantMap& raw, double zoom, double from, double to) const {
    try {
        return nt::tempo::json::ticks(nt::tempo::computeBarRulerTicks(
                                          nt::tempo::json::tempo(QJsonObject::fromVariantMap(raw)), zoom, from, to))
            .toVariantList();
    } catch (const std::invalid_argument& error) {
        return reportError(this, error);
    }
}
QVariantList TempoGridQml::visibleTempoGrid(const QVariantMap& spec) const {
    try {
        return nt::tempo::json::array(
                   nt::tempo::visibleTempoGrid(nt::tempo::json::grid(QJsonObject::fromVariantMap(spec))))
            .toVariantList();
    } catch (const std::invalid_argument& error) {
        return reportError(this, error);
    }
}
QVariantMap TempoGridQml::snapGridSpecFrom(const QVariantMap& document, const QVariantMap& ui) const {
    return nt::tempo::json::snapGridSpecFrom(QJsonObject::fromVariantMap(document), QJsonObject::fromVariantMap(ui))
        .toVariantMap();
}
bool TempoGridQml::gridSnapApplies(const QVariantMap& spec) const {
    return nt::tempo::gridSnapApplies(nt::tempo::json::snapGrid(QJsonObject::fromVariantMap(spec)));
}
QVariantList TempoGridQml::mergeSnapCandidates(const QVariantList& candidates, const QVariantMap& spec) const {
    try {
        const auto values = nt::tempo::json::numbers(QJsonArray::fromVariantList(candidates));
        return nt::tempo::json::array(
                   nt::tempo::mergeSnapCandidates(values, nt::tempo::json::snapGrid(QJsonObject::fromVariantMap(spec))))
            .toVariantList();
    } catch (const std::invalid_argument& error) {
        return reportError(this, error);
    }
}
