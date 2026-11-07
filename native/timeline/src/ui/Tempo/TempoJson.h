#pragma once
#include "TempoGrid.h"
#include <QJsonArray>
#include <QJsonObject>

namespace nt::tempo::json {
[[nodiscard]] std::vector<double> numbers(const QJsonValue& value);
[[nodiscard]] QJsonArray array(std::span<const double> values);
[[nodiscard]] QJsonObject resolveTempo(const QJsonObject& document);
[[nodiscard]] Tempo tempo(const QJsonObject& rawTempoOrDocument);
[[nodiscard]] GridSpec grid(const QJsonObject& value);
[[nodiscard]] SnapGridSpec snapGrid(const QJsonObject& value);
[[nodiscard]] QJsonObject object(const SnapGridSpec& value);
[[nodiscard]] QJsonArray ticks(std::span<const BarRulerTick> values);
[[nodiscard]] QJsonArray options();
[[nodiscard]] QJsonObject snapGridSpecFrom(const QJsonObject& document, const QJsonObject& ui);
} // namespace nt::tempo::json
