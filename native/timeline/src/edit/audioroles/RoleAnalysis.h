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

// What a measurement aims for: `target(clip)` in LUFS, or in dBFS of the sample peak when `peak` is set.
struct Goal {
    std::function<double(const Clip&)> target;
    bool peak = false;
};

struct Measurement {
    std::string clipId;
    bool ok = false;            // the clip has what the goal needs: loudness for a loudness goal, any sound for a peak goal
    QString problem;            // user text when !ok
    double integratedLufs = 0;  // BS.1770-4, the clip alone: no clip gain, fades, track fader or master
    double samplePeakDb = 0;
    double truePeakDb = 0;
    bool mono = false;          // measured as one channel, as ffmpeg's ebur128 does
    double target = 0;
    double volumeDb = 0;        // the clip volume that reaches the target, limited to the range the mixer takes
    bool clamped = false;       // the volume had to be limited
    double missedBy = 0;        // dB the closest volume found is off the target, for a clip whose effects react to the level
    int passes = 1;             // renders of the clip: more than one when its effects react to the level
};

// One Measurement per id, in order. A cancelled run returns what it finished. The clip's own effects count, and
// since they may not be linear (a compressor), a clip with effects is measured again at the volume found and
// searched for, up to seven more times, and the closest volume measured is kept.
std::vector<Measurement> measureClips(const Timeline& timeline, const std::vector<std::string>& clipIds, const Goal& goal,
                                      const CancelFn& cancelled, const ProgressFn& progress);

// The volume each measured clip needs, for the edit and for reports. Clips that could not be measured are
// counted as silent.
struct VolumePlan {
    QJsonObject volumes;  // clipId -> volumeDb
    QJsonArray rows;      // clipId, integratedLufs, samplePeakDb, targetDb, volumeDb, for reports
    int silent = 0;
    int clamped = 0;
    int missed = 0;  // clips whose effects keep them more than 0.5 dB from the target
    QString firstProblem;
};
VolumePlan volumesFor(const std::vector<Measurement>& measurements);

struct DuckSettings {
    double reduceDb = 15;    // depth in dB, a magnitude
    double sensitivity = 6;  // 0..10, higher reacts to quieter triggers
    double fadeS = 0.8;
    QStringList against{QStringLiteral("dialogue")};
};

struct DuckPlan {
    std::string clipId;  // the first clip of the range
    int clips = 1;       // clips the range covers: those that overlap on one track are planned together
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
