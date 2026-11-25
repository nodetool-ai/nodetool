#pragma once
#include <QJsonObject>
namespace nt::midi {
// Value transform, callable on UI and plan workers. Caller owns the result.
QJsonObject bakeRegionQuantize(QJsonObject clip, double bpm, double gridOffsetMs = 0);
QJsonObject applyRegionParams(QJsonObject clip, double bpm, double gridOffsetMs = 0);
}
