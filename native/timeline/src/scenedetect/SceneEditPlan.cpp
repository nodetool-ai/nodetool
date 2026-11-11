#include "scenedetect/SceneEditPlan.h"

#include "markers/MarkerOps.h"

#include <QSet>

#include <algorithm>
#include <cmath>

namespace nt::shots {
namespace {
constexpr double kPlaceToleranceMs = 0.5;

bool samePlace(const QJsonObject& clip, const CutRequest& request) {
    return std::abs(edit::clipStartMs(clip) - request.startMs) <= kPlaceToleranceMs &&
           std::abs(edit::clipDurationMs(clip) - request.durationMs) <= kPlaceToleranceMs &&
           std::abs(clip.value(u"inPointMs").toDouble(0.0) - request.inPointMs) <= kPlaceToleranceMs;
}

int indexOfClip(const edit::ClipList& clips, const QString& id) {
    for (size_t i = 0; i < clips.size(); ++i) {
        if (edit::clipId(clips[i]) == id) { return static_cast<int>(i); }
    }
    return -1;
}

// The times strictly inside the clip, earliest first, once each.
std::vector<double> usableTimes(const CutRequest& request) {
    std::vector<double> times;
    for (const double at : request.atMs) {
        if (std::isfinite(at) && at > request.startMs + kPlaceToleranceMs &&
            at < request.startMs + request.durationMs - kPlaceToleranceMs) {
            times.push_back(at);
        }
    }
    std::sort(times.begin(), times.end());
    times.erase(std::unique(times.begin(), times.end()), times.end());
    return times;
}
}  // namespace

edit::EditDoc editDocOf(const QJsonObject& raw) {
    edit::EditDoc doc;
    for (const auto& clip : raw.value("clips").toArray()) { doc.clips.push_back(clip.toObject()); }
    for (const auto& value : raw.value("tracks").toArray()) {
        const auto track = value.toObject();
        doc.tracks.push_back({track.value("id").toString(), track.value("type").toString(), track.value("locked").toBool()});
    }
    for (const auto& value : raw.value("mediaTracks").toArray()) {
        doc.clipsWithMediaTracks.insert(value.toObject().value("clipId").toString());
    }
    return doc;
}

CutPlan planCuts(const edit::EditDoc& doc, const std::vector<CutRequest>& requests) {
    CutPlan plan;
    plan.clips = doc.clips;
    plan.outcomes.assign(requests.size(), CutOutcome::Changed);
    for (size_t r = 0; r < requests.size(); ++r) {
        const auto& request = requests[r];
        const int at = indexOfClip(plan.clips, request.clipId);
        if (at < 0 || !samePlace(plan.clips[static_cast<size_t>(at)], request)) { continue; }
        if (edit::editableUserTargets(doc, {request.clipId}, true, false).empty()) {
            plan.outcomes[r] = CutOutcome::Locked;
            continue;
        }
        const auto times = usableTimes(request);
        if (times.empty()) {
            plan.outcomes[r] = CutOutcome::NoCuts;
            continue;
        }
        const QString track = edit::clipTrackId(plan.clips[static_cast<size_t>(at)]);
        QString current = request.clipId;
        int made = 0;
        for (const double time : times) {
            QSet<QString> known;
            for (const auto& clip : plan.clips) { known.insert(edit::clipId(clip)); }
            auto next = edit::splitClipsLinkAware(plan.clips, time, {current}, doc.clipsWithMediaTracks);
            if (next.size() == plan.clips.size()) { break; }
            QString right;
            for (const auto& clip : next) {
                if (!known.contains(edit::clipId(clip)) && edit::clipTrackId(clip) == track && edit::clipStartMs(clip) == time) {
                    right = edit::clipId(clip);
                    break;
                }
            }
            plan.clips = std::move(next);
            ++made;
            if (right.isEmpty()) { break; }
            current = right;
        }
        plan.outcomes[r] = made > 0 ? CutOutcome::Cut : CutOutcome::CannotSplit;
        if (made > 0) {
            plan.points += made;
            ++plan.clipsCut;
        }
    }
    return plan;
}

QJsonArray addCutMarkers(QJsonArray existing, std::span<const double> timesMs, double fps) {
    const double half = 500.0 / std::max(1.0, fps);
    std::vector<double> times(timesMs.begin(), timesMs.end());
    std::sort(times.begin(), times.end());
    const auto& palette = markers::colors();
    QJsonArray result = existing;
    for (const double time : times) {
        if (!std::isfinite(time) || time < 0) { continue; }
        const bool taken = std::any_of(result.begin(), result.end(), [&](const QJsonValue& marker) {
            return std::abs(marker.toObject().value("timeMs").toDouble(-1e9) - time) < half;
        });
        if (taken) { continue; }
        QJsonObject fields{{"timeMs", time}, {"label", "Scene cut"}};
        if (const auto green = std::find_if(palette.begin(), palette.end(), [](const auto& c) { return c.id == u"green"; });
            green != palette.end()) {
            fields.insert("color", green->css);
        }
        result = markers::add(result, fields);
    }
    return result;
}

}  // namespace nt::shots
