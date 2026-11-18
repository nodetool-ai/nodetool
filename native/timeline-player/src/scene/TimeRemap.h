#pragma once
#include "model/TimelineTypes.h"
#include <QJsonValue>
#include <optional>
#include <span>

namespace nt::speed {
std::optional<ClipTimeRemap> parseTimeRemap(const QJsonValue& value);
std::optional<double> evaluateTimeRemapMs(std::span<const TimeRemapKeyframe> keyframes, double t);
std::optional<double> clipRemapSourceMs(const Clip& clip, double timeMs);
void registerTimeRemapMapper();

struct TimeRemapAudioSegment {
    double timelineStartMs;
    double timelineEndMs;
    double sourceStartMs;
    double sourceEndMs;
    double rate;
    bool reverse;
};
std::vector<TimeRemapAudioSegment> timeRemapAudioSegments(const Clip& clip);
} // namespace nt::speed
