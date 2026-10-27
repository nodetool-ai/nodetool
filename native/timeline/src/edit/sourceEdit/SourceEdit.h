#pragma once
#include "edit/targeting/TrackTargeting.h"
#include <QJsonObject>
#include <optional>

namespace nt::sourceedit {
struct Range { double inMs = 0; double outMs = 0; };
struct Result { QJsonObject doc; QString id; };
Range sourceRangeFor(const QJsonObject& asset, const QJsonObject& marks);
QString sourceTargetTrackId(const QJsonObject& doc, const nt::targeting::TargetingState& state,
                            const QJsonObject& asset);
std::optional<Result> performSourceEdit(const QString& kind, const QJsonObject& doc,
    const nt::targeting::TargetingState& state, const QJsonObject& marks, double playheadMs,
    const QJsonObject& asset);
}
