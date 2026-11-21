#include "music/MusicPlan.h"

#include <QJsonArray>

#include <algorithm>
#include <cmath>
#include <unordered_map>
#include <variant>

namespace nt::music {
namespace {

struct FrameClip {
    const PlanClip* clip = nullptr;
    std::int64_t startFrame = 0;
    std::int64_t endFrame = 0;
};

struct Refused {
    std::string refusal;
    std::string message;
};

struct Windows {
    std::optional<std::int64_t> windowStartFrame;
    std::optional<std::int64_t> requestFrames;
    std::optional<std::int64_t> beatPhaseFrames;
    std::optional<std::vector<FrameRange>> segments;
    std::optional<FrameRange> region;
    std::optional<std::string> clipId;
    std::optional<Splice> splice;
    std::optional<std::string> trackRole;
};

using Built = std::variant<Windows, Refused>;

struct Placed {
    FrameRange window;
    FrameRange region;
};

bool overlaps(const FrameClip& c, std::int64_t from, std::int64_t to) { return c.startFrame < to && c.endFrame > from; }

bool anyOverlap(const std::vector<FrameClip>& clips, std::int64_t from, std::int64_t to) {
    return std::ranges::any_of(clips, [&](const FrameClip& c) { return overlaps(c, from, to); });
}

std::string tooLong(std::string_view label) {
    return std::string(label) + " needs a window of at most 600 seconds. Select a shorter range.";
}

// sourceRate() in packages/timeline/src/sourceRate.ts.
double sourceRate(const PlanClip& clip) { return clip.speedBaked ? 1 : std::max(0.0001, clip.speedMultiplier); }

// GN-5, as contextWindow() in plan.ts.
FrameRange contextWindow(const MusicTempo& tempo, const FrameRange& target, const std::vector<FrameClip>& context) {
    auto startBar = gridLineAtOrBefore(target.startFrame, tempo, GridDivision::Bar);
    for (int step = 0; step < kMaxPrerollBars; ++step) {
        const auto from = barStartFrame(startBar - 1, tempo);
        if (from < 0 || !anyOverlap(context, from, barStartFrame(startBar, tempo))) {
            break;
        }
        --startBar;
    }
    const auto startFrame = std::max<std::int64_t>(0, barStartFrame(startBar, tempo));
    auto endBar = gridLineAtOrAfter(target.endFrame, tempo, GridDivision::Bar);
    while (barStartFrame(endBar, tempo) - startFrame < kMinWindowFrames) {
        ++endBar;
    }
    return {startFrame, barStartFrame(endBar, tempo)};
}

std::variant<Placed, Refused> inWindow(const MusicTempo& tempo, const FrameRange& target,
                                       const std::vector<FrameClip>& context, std::string_view label) {
    const auto window = contextWindow(tempo, target, context);
    if (window.endFrame - window.startFrame > kMaxWindowFrames) {
        return Refused{"window_too_long", tooLong(label)};
    }
    return Placed{window, {target.startFrame - window.startFrame, target.endFrame - window.startFrame}};
}

std::string occupied(std::string_view label) {
    return std::string(label) + " needs an empty range. The range overlaps a clip on this track.";
}

Built planGenerate(const MusicTempo& tempo, const FrameRange& target, const std::vector<FrameClip>& onTrack) {
    const auto label = taskLabel(MusicTask::Text2Music);
    if (!onTrack.empty()) {
        return Refused{"occupied", occupied(label)};
    }
    const auto length = target.endFrame - target.startFrame;
    const auto k = std::max<std::int64_t>(1, (kMinWindowFrames + length - 1) / length);
    const auto requestFrames = k * length + beatLengthFrames(tempo);
    if (requestFrames > kMaxWindowFrames) {
        return Refused{"window_too_long", tooLong(label)};
    }
    const auto firstBeat = beatStartFrame(gridLineAtOrAfter(target.startFrame, tempo, GridDivision::Beat), tempo);
    std::vector<FrameRange> segments;
    segments.reserve(static_cast<std::size_t>(k));
    for (std::int64_t i = 0; i < k; ++i) {
        segments.push_back({i * length, (i + 1) * length});
    }
    Windows result;
    result.windowStartFrame = target.startFrame;
    result.requestFrames = requestFrames;
    result.beatPhaseFrames = firstBeat - target.startFrame;
    result.segments = std::move(segments);
    return result;
}

Built planRegenerate(const MusicTempo& tempo, const FrameRange& target, const std::vector<FrameClip>& onTrack,
                     const std::vector<FrameClip>& dryContext) {
    const std::string label(taskLabel(MusicTask::Repaint));
    if (onTrack.empty()) {
        return Refused{"no_clip", label + " needs a range inside one clip."};
    }
    if (onTrack.size() > 1) {
        return Refused{"several_clips", label + " needs a range inside one clip. The range spans several clips."};
    }
    const auto& only = onTrack.front();
    if (only.startFrame > target.startFrame || only.endFrame < target.endFrame) {
        return Refused{"partial_overlap", label + " needs a range inside one clip. The range reaches past the clip's edge."};
    }
    const auto& clip = *only.clip;
    if (sourceRate(clip) != 1) {
        return Refused{"speed", label + " cannot replace bars in a clip that plays at a speed other than 1."};
    }
    if (clip.timeRemap) {
        return Refused{"time_remap", label + " cannot replace bars in a clip with a time remap."};
    }
    if (clip.currentAssetId.empty()) {
        return Refused{"no_asset", label + " needs a clip with audio."};
    }
    // The context of a repaint is the target track (GN-5 rule 2).
    auto placed = inWindow(tempo, target, dryContext, label);
    if (auto* refused = std::get_if<Refused>(&placed)) {
        return *refused;
    }
    const auto& in = std::get<Placed>(placed);
    const auto spliceStart = msToFrame(clip.inPointMs) + (target.startFrame - only.startFrame);
    Windows result;
    result.windowStartFrame = in.window.startFrame;
    result.requestFrames = in.window.endFrame - in.window.startFrame;
    result.region = in.region;
    result.clipId = clip.id;
    result.splice = Splice{clip.currentAssetId, spliceStart, spliceStart + (target.endFrame - target.startFrame)};
    return result;
}

Built planAddInstrument(const MusicTempo& tempo, const FrameRange& target, const std::vector<FrameClip>& onTrack,
                        const std::vector<FrameClip>& others, const std::string& role) {
    const std::string label(taskLabel(MusicTask::Lego));
    if (!onTrack.empty()) {
        return Refused{"occupied", occupied(label)};
    }
    if (role.empty()) {
        return Refused{"missing_role", label + " needs a role on the target track."};
    }
    if (!anyOverlap(others, target.startFrame, target.endFrame)) {
        return Refused{"no_context", label + " needs audible audio on another track in the range."};
    }
    auto placed = inWindow(tempo, target, others, label);
    if (auto* refused = std::get_if<Refused>(&placed)) {
        return *refused;
    }
    const auto& in = std::get<Placed>(placed);
    Windows result;
    result.windowStartFrame = in.window.startFrame;
    result.requestFrames = in.window.endFrame - in.window.startFrame;
    result.region = in.region;
    result.trackRole = role;
    return result;
}

// The mixer's rule for a clip that sounds (hasEffectiveAsset in Mixer.cpp,
// effectiveAssetId in packages/timeline/src/clipAudio.ts): an asset in a
// playable status.
bool hasEffectiveAsset(const PlanClip& clip) {
    return !clip.currentAssetId.empty() && (clip.status == "generated" || clip.status == "stale" ||
                                            clip.status == "locked" || clip.status == "generating");
}

bool isFrame(double value) { return std::isfinite(value) && std::floor(value) == value && value >= 0; }

// JavaScript truthiness of a JSON value.
bool truthy(const QJsonValue& value) {
    switch (value.type()) {
    case QJsonValue::Bool: return value.toBool();
    case QJsonValue::Double: return value.toDouble() != 0 && !std::isnan(value.toDouble());
    case QJsonValue::String: return !value.toString().isEmpty();
    case QJsonValue::Array:
    case QJsonValue::Object: return true;
    default: return false;
    }
}

double number(const QJsonValue& value, double fallback) {
    return value.isUndefined() || value.isNull() ? fallback : value.toDouble(std::nan(""));
}

std::string text(const QJsonValue& value) { return value.isString() ? value.toString().toStdString() : std::string(); }

QJsonObject rangeJson(const FrameRange& range) {
    return {{"startFrame", static_cast<qint64>(range.startFrame)}, {"endFrame", static_cast<qint64>(range.endFrame)}};
}

} // namespace

std::string_view taskName(MusicTask task) {
    switch (task) {
    case MusicTask::Text2Music: return "text2music";
    case MusicTask::Repaint: return "repaint";
    case MusicTask::Lego: return "lego";
    }
    return {};
}

std::string_view taskLabel(MusicTask task) {
    switch (task) {
    case MusicTask::Text2Music: return "Generate";
    case MusicTask::Repaint: return "Regenerate";
    case MusicTask::Lego: return "Add instrument";
    }
    return {};
}

std::optional<MusicTask> parseTask(std::string_view name) {
    for (auto task : kMusicTasks) {
        if (taskName(task) == name) {
            return task;
        }
    }
    return std::nullopt;
}

MusicPlan planMusicOperation(const PlanInput& input) {
    const auto& tempo = input.tempo;
    const auto& selection = input.selection;
    MusicPlan plan;
    plan.target = selection;
    plan.bpm = tempo.bpm;
    plan.beatsPerBar = tempo.beatsPerBar;
    plan.beatUnit = tempo.beatUnit;
    plan.key = tempo.key;
    const auto refuse = [&plan](std::string refusal, std::string reason) {
        auto refused = plan;
        refused.refusal = std::move(refusal);
        refused.reason = std::move(reason);
        return refused;
    };

    if (!isFrame(selection.startFrame) || !isFrame(selection.endFrame) || selection.endFrame <= selection.startFrame) {
        return refuse("invalid_selection", "Select a range on one track.");
    }
    const auto trackIt =
        std::ranges::find_if(input.tracks, [&](const PlanTrack& t) { return t.id == selection.trackId; });
    if (trackIt == input.tracks.end()) {
        return refuse("no_track", "The selected track is not in this sequence.");
    }
    const auto& track = *trackIt;
    if (track.type != "audio") {
        return refuse("not_audio_track", "Music generation needs an audio track.");
    }

    const FrameRange target{static_cast<std::int64_t>(selection.startFrame),
                            static_cast<std::int64_t>(selection.endFrame)};
    // A later track with the same id replaces an earlier one, as in the Map plan.ts builds.
    std::unordered_map<std::string, const PlanTrack*> tracksById;
    for (const auto& t : input.tracks) {
        tracksById[t.id] = &t;
    }
    const bool anySolo =
        std::ranges::any_of(input.tracks, [](const PlanTrack& t) { return (t.type == "audio" || t.type == "midi") && t.solo; });
    // The mixer's rule for a clip that sounds: an audio clip with an asset in a
    // playable status, on an audible audio or midi track.
    const auto audibleTrack = [&](const std::string& id) {
        const auto it = tracksById.find(id);
        if (it == tracksById.end()) return false;
        const auto& t = *it->second;
        return (t.type == "audio" || t.type == "midi") && !t.muted && (!anySolo || t.solo);
    };
    std::vector<FrameClip> onTrackAll;
    std::vector<FrameClip> overlapping;
    std::vector<FrameClip> others;
    for (const auto& clip : input.clips) {
        if (clip.mediaType != "audio") {
            continue;
        }
        const auto startFrame = msToFrame(clip.startMs);
        const FrameClip framed{&clip, startFrame, startFrame + msToFrame(clip.durationMs)};
        if (clip.trackId == track.id) {
            onTrackAll.push_back(framed);
            if (overlaps(framed, target.startFrame, target.endFrame)) {
                overlapping.push_back(framed);
            }
        } else if (!clip.muted && hasEffectiveAsset(clip) && audibleTrack(clip.trackId)) {
            others.push_back(framed);
        }
    }
    const bool othersInRange = anyOverlap(others, target.startFrame, target.endFrame);

    if (overlapping.empty()) {
        plan.inferred = othersInRange ? MusicTask::Lego : MusicTask::Text2Music;
    } else if (overlapping.size() == 1 && overlapping.front().startFrame <= target.startFrame &&
               overlapping.front().endFrame >= target.endFrame) {
        plan.inferred = MusicTask::Repaint;
    }

    plan.operation = input.operation ? input.operation : plan.inferred;
    // MD9 before any window: the request cannot carry another tempo.
    if (const auto problem = musicTempoRefusal(tempo); !problem.empty()) {
        return refuse("tempo", problem);
    }

    // The target track as the dry bounce renders it: every clip except muted ones.
    std::vector<FrameClip> dryContext;
    std::ranges::copy_if(onTrackAll, std::back_inserter(dryContext), [](const FrameClip& c) { return !c.clip->muted; });
    const auto build = [&](MusicTask task) -> Built {
        if (task == MusicTask::Text2Music) {
            return planGenerate(tempo, target, overlapping);
        }
        if (task == MusicTask::Repaint) {
            return planRegenerate(tempo, target, overlapping, dryContext);
        }
        return planAddInstrument(tempo, target, overlapping, others, track.musicRole);
    };
    std::array<Built, kMusicTasks.size()> built;
    for (std::size_t i = 0; i < kMusicTasks.size(); ++i) {
        built[i] = build(kMusicTasks[i]);
        if (std::holds_alternative<Windows>(built[i])) {
            plan.valid.push_back(kMusicTasks[i]);
        }
    }

    if (!plan.operation) {
        return overlapping.size() > 1
                   ? refuse("several_clips",
                            "Select a range inside one clip or an empty range. The range spans several clips.")
                   : refuse("partial_overlap",
                            "Select a range inside one clip or an empty range. The range reaches past a clip's edge.");
    }
    const auto& result = built[static_cast<std::size_t>(*plan.operation)];
    if (const auto* refused = std::get_if<Refused>(&result)) {
        return refuse(refused->refusal, refused->message);
    }

    const std::string label(taskLabel(*plan.operation));
    if (plan.inferred && *plan.operation != *plan.inferred) {
        plan.reason = label + " is chosen in place of " + std::string(taskLabel(*plan.inferred)) + ".";
    } else if (*plan.operation == MusicTask::Repaint) {
        plan.reason = "The range lies inside one clip, so Regenerate replaces these bars.";
    } else if (*plan.operation == MusicTask::Lego) {
        plan.reason = "The range is empty and other tracks play here, so Add instrument follows them.";
    } else {
        plan.reason = "The range is empty and no other track plays here, so Generate creates a clip.";
    }
    const auto& windows = std::get<Windows>(result);
    plan.windowStartFrame = windows.windowStartFrame;
    plan.requestFrames = windows.requestFrames;
    plan.beatPhaseFrames = windows.beatPhaseFrames;
    plan.segments = windows.segments;
    plan.region = windows.region;
    plan.clipId = windows.clipId;
    plan.splice = windows.splice;
    plan.trackRole = windows.trackRole;
    return plan;
}

std::string musicTempoRefusal(const MusicTempo& tempo) {
    if (!std::isfinite(tempo.bpm) || std::floor(tempo.bpm) != tempo.bpm || tempo.bpm < 30 || tempo.bpm > 300) {
        return std::string(kMusicTempoBpmMessage);
    }
    static constexpr std::array<std::array<double, 2>, 4> signatures{{{2, 4}, {3, 4}, {4, 4}, {6, 8}}};
    const bool known = std::ranges::any_of(signatures, [&](const auto& s) {
        return s[0] == tempo.beatsPerBar && s[1] == tempo.beatUnit;
    });
    return known ? std::string() : std::string(kMusicTempoSignatureMessage);
}

bool isTempoLocked(const QJsonObject& rawSequence) {
    const auto clips = rawSequence.value(u"clips").toArray();
    return std::ranges::any_of(clips, [](const QJsonValue& c) { return c.toObject().value(u"mediaType").toString() == u"audio"; });
}

MusicTempo tempoFromJson(const QJsonObject& raw) {
    const auto signature = raw.value(u"timeSignature").toObject();
    return {raw.value(u"bpm").toDouble(std::nan("")), raw.value(u"offsetMs").toDouble(std::nan("")),
            signature.value(u"beatsPerBar").toDouble(std::nan("")), signature.value(u"beatUnit").toDouble(std::nan(""))};
}

QString tempoChangeRefusal(const QJsonObject& rawSequence, const QJsonObject& nextTempo) {
    const auto rawTempo = rawSequence.value(u"tempo");
    // A document without tempo reads at DEFAULT_TEMPO (midi/tempo.ts).
    const auto before = rawTempo.isObject() ? tempoFromJson(rawTempo.toObject()) : MusicTempo{};
    const auto after = tempoFromJson(nextTempo);
    // `!=` is JavaScript's `!==` on numbers, NaN included.
    const bool changed = before.bpm != after.bpm || before.offsetMs != after.offsetMs ||
                         before.beatsPerBar != after.beatsPerBar || before.beatUnit != after.beatUnit;
    if (changed && isTempoLocked(rawSequence)) {
        return QString::fromUtf8(kTempoLockedMessage.data(), static_cast<qsizetype>(kTempoLockedMessage.size()));
    }
    return truthy(rawSequence.value(u"music")) ? QString::fromStdString(musicTempoRefusal(after)) : QString();
}

PlanInput planInputFromJson(const QJsonObject& value) {
    PlanInput input;
    const auto rawTempo = value.value(u"tempo").toObject();
    static_cast<MusicTempo&>(input.tempo) = tempoFromJson(rawTempo);
    if (const auto key = rawTempo.value(u"key"); truthy(key)) {
        input.tempo.key = MusicKey{text(key.toObject().value(u"tonic")), text(key.toObject().value(u"mode"))};
    }
    const auto selection = value.value(u"selection").toObject();
    input.selection = {text(selection.value(u"trackId")), selection.value(u"startFrame").toDouble(std::nan("")),
                       selection.value(u"endFrame").toDouble(std::nan(""))};
    for (const auto& item : value.value(u"tracks").toArray()) {
        const auto t = item.toObject();
        input.tracks.push_back({text(t.value(u"id")), text(t.value(u"type")), t.value(u"muted") == QJsonValue(true),
                                t.value(u"solo") == QJsonValue(true), text(t.value(u"musicRole"))});
    }
    for (const auto& item : value.value(u"clips").toArray()) {
        const auto c = item.toObject();
        PlanClip clip;
        clip.id = text(c.value(u"id"));
        clip.trackId = text(c.value(u"trackId"));
        clip.startMs = number(c.value(u"startMs"), std::nan(""));
        clip.durationMs = number(c.value(u"durationMs"), std::nan(""));
        clip.mediaType = text(c.value(u"mediaType"));
        clip.inPointMs = number(c.value(u"inPointMs"), 0);
        clip.muted = c.value(u"muted") == QJsonValue(true);
        clip.speedMultiplier = number(c.value(u"speedMultiplier"), 1);
        clip.speedBaked = truthy(c.value(u"speedBaked"));
        clip.timeRemap = truthy(c.value(u"timeRemap"));
        clip.currentAssetId = text(c.value(u"currentAssetId"));
        clip.status = text(c.value(u"status"));
        input.clips.push_back(std::move(clip));
    }
    if (const auto operation = value.value(u"operation"); operation.isString()) {
        input.operation = parseTask(operation.toString().toStdString());
    }
    return input;
}

QJsonObject planToJson(const MusicPlan& plan) {
    const auto taskValue = [](const std::optional<MusicTask>& task) {
        return task ? QJsonValue(QString::fromUtf8(taskName(*task).data(), static_cast<qsizetype>(taskName(*task).size())))
                    : QJsonValue(QJsonValue::Null);
    };
    QJsonArray valid;
    for (auto task : plan.valid) {
        valid.append(taskValue(task));
    }
    QJsonObject out{{"inferred", taskValue(plan.inferred)},
                    {"valid", valid},
                    {"operation", taskValue(plan.operation)},
                    {"reason", QString::fromStdString(plan.reason)},
                    {"target", QJsonObject{{"trackId", QString::fromStdString(plan.target.trackId)},
                                           {"startFrame", plan.target.startFrame},
                                           {"endFrame", plan.target.endFrame}}},
                    {"bpm", plan.bpm},
                    {"beatsPerBar", plan.beatsPerBar},
                    {"beatUnit", plan.beatUnit}};
    if (!plan.refusal.empty()) {
        out.insert("refusal", QString::fromStdString(plan.refusal));
    }
    if (plan.key) {
        out.insert("key", QJsonObject{{"tonic", QString::fromStdString(plan.key->tonic)},
                                      {"mode", QString::fromStdString(plan.key->mode)}});
    }
    const auto frame = [&out](const char* name, const std::optional<std::int64_t>& value) {
        if (value) {
            out.insert(QLatin1String(name), static_cast<qint64>(*value));
        }
    };
    frame("windowStartFrame", plan.windowStartFrame);
    frame("requestFrames", plan.requestFrames);
    frame("beatPhaseFrames", plan.beatPhaseFrames);
    if (plan.segments) {
        QJsonArray segments;
        for (const auto& segment : *plan.segments) {
            segments.append(rangeJson(segment));
        }
        out.insert("segments", segments);
    }
    if (plan.region) {
        out.insert("region", rangeJson(*plan.region));
    }
    if (plan.clipId) {
        out.insert("clipId", QString::fromStdString(*plan.clipId));
    }
    if (plan.splice) {
        out.insert("splice", QJsonObject{{"parentAssetId", QString::fromStdString(plan.splice->parentAssetId)},
                                         {"startFrame", static_cast<qint64>(plan.splice->startFrame)},
                                         {"endFrame", static_cast<qint64>(plan.splice->endFrame)}});
    }
    if (plan.trackRole) {
        out.insert("trackRole", QString::fromStdString(*plan.trackRole));
    }
    return out;
}

} // namespace nt::music
