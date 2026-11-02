#pragma once

// Offline analysis for Match loudness and Duck music (issue #7080). It runs on
// a worker thread and touches no model: it takes an immutable Timeline snapshot,
// renders the clips it needs through the same plan and `mixBlock` as playback
// (so clip effects, speed and time remaps count), and returns plain results.
// The caller turns the results into one edit.

#include "model/TimelineTypes.h"

#include <QJsonArray>
#include <QJsonObject>
#include <QString>
#include <QStringList>

#include <functional>
#include <string>
#include <vector>

namespace nt::audioroles {

using CancelFn = std::function<bool()>;
using ProgressFn = std::function<void(double)>;  // 0..1, called on the analysis thread

struct Measurement {
    std::string clipId;
    bool ok = false;
    QString problem;            // user text when !ok
    double integratedLufs = 0;  // BS.1770-4, the clip alone: no clip gain, fades, track fader or master
    double samplePeakDb = 0;
    double truePeakDb = 0;
    bool mono = false;          // measured as one channel, as ffmpeg's ebur128 does
};

// One Measurement per id, in order. A cancelled run returns what it finished.
std::vector<Measurement> measureClips(const Timeline& timeline, const std::vector<std::string>& clipIds,
                                      const CancelFn& cancelled, const ProgressFn& progress);

// The volume each measured clip needs so its loudness (or, with `peak`, its sample peak) lands on
// `targetOf(measurement)`. A volume past the range the mixer accepts is limited and counted.
struct VolumePlan {
    QJsonObject volumes;  // clipId -> volumeDb
    QJsonArray rows;      // clipId, integratedLufs, samplePeakDb, targetDb, volumeDb, for reports
    int silent = 0;
    int clamped = 0;
    QString firstProblem;
};
VolumePlan volumesFor(const std::vector<Measurement>& measurements,
                      const std::function<double(const Measurement&)>& targetOf, bool peak);

struct DuckSettings {
    double reduceDb = 15;    // depth in dB, a magnitude
    double sensitivity = 6;  // 0..10, higher reacts to quieter triggers
    double fadeS = 0.8;
    QStringList against{QStringLiteral("dialogue")};
};

struct DuckPlan {
    std::string clipId;
    std::string trackId;
    QString problem;  // set: the clip is skipped
    double fromMs = 0;
    double toMs = 0;
    double baseDb = 0;
    std::vector<std::string> triggerIds;
    std::vector<std::pair<double, double>> regionsMs;  // document time
    std::vector<std::pair<double, double>> points;     // (document ms, dB)
};

std::vector<DuckPlan> planDucking(const Timeline& timeline, const std::vector<std::string>& clipIds,
                                  const DuckSettings& settings, const CancelFn& cancelled, const ProgressFn& progress);

// The `applyDucking` payload for the plans that have no problem.
QJsonObject duckingPayload(const std::vector<DuckPlan>& plans);

}  // namespace nt::audioroles
