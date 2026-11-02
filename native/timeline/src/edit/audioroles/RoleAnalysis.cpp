#include "RoleAnalysis.h"

#include "AudioRoleJson.h"
#include "audio/AudioSource.h"
#include "audio/Mixer.h"
#include "audio/automation/Automation.h"
#include "audio/automation/Meters.h"
#include "audio/loudness/Ducking.h"
#include "audio/loudness/Loudness.h"

#include <QJsonArray>

#include <algorithm>
#include <cmath>
#include <limits>
#include <memory>
#include <set>

namespace nt::audioroles {
namespace {

constexpr int kRate = 48000;
constexpr std::int64_t kBlock = 4096;
constexpr double kEdgeMs = 1.0;
constexpr double kBelowGate = -200;   // the level given to a trial that is silent or under the absolute gate
constexpr double kSamePointMs = 0.5;  // the web editor's SAME_POINT_MS
constexpr int kMaxLanes = 256;         // MAX_AUTOMATION_LANES_PER_TRACK
constexpr int kMaxCheckPasses = 4;     // renders of a clip without effects when its loudness is checked
constexpr int kMaxPasses = 8;          // renders of a clip with effects: the first and up to seven corrections
constexpr int kMaxLanePoints = 10000;  // MAX_AUTOMATION_POINTS_PER_LANE in the protocol schema

// A copy of the timeline that holds only `clips`, on neutral tracks: no fader, pan, mute, solo, track
// effects or automation, and no master gain. With `ownGain` false the clip gain is `volumeDb` and the fades are
// removed, which is the clip's signal at the gain a match would set.
Timeline isolate(const Timeline& source, const std::vector<const Clip*>& clips, bool ownGain, double volumeDb = 0) {
    Timeline t;
    t.id = source.id;
    t.name = source.name;
    t.fps = source.fps;
    t.width = source.width;
    t.height = source.height;
    t.durationMs = source.durationMs;
    t.masterVolumeDb = 0;
    std::set<std::string> trackIds;
    for (const Clip* clip : clips) trackIds.insert(clip->trackId);
    for (const Track& track : source.tracks) {
        if (!trackIds.contains(track.id)) continue;
        Track neutral;
        neutral.id = track.id;
        neutral.name = track.name;
        neutral.type = track.type;
        neutral.index = track.index;
        t.tracks.push_back(std::move(neutral));
    }
    for (const Clip* clip : clips) {
        Clip copy = *clip;
        copy.muted = false;
        copy.linkId.clear();
        if (!ownGain) {
            copy.volumeDb = volumeDb;
            copy.fadeInMs = 0;
            copy.fadeOutMs = 0;
        }
        t.clips.push_back(std::move(copy));
    }
    t.indexClips();
    return t;
}

// The mix of a timeline rendered in blocks, reading each source once and in order. renderOffline keeps a
// whole clip in memory, which a long recording should not need for a measurement.
class Stream {
public:
    Stream(const Timeline& timeline, double startMs, double durationMs, CancelFn cancelled)
        : m_plan(buildPlan(timeline)), m_startMs(startMs), m_cancelled(std::move(cancelled)),
          m_total(static_cast<std::int64_t>(std::llround(durationMs * kRate / 1000.0))) {
        audio::prepareMixPlan(m_plan, kRate);
    }
    // The plan for analysis leaves the mixer's meter readings alone (they belong to the live plan).
    static audio::MixPlan buildPlan(const Timeline& timeline) {
        const automation::ScopedNoMeters quiet;
        return audio::buildMixPlan(timeline);
    }
    // Opens the sources. Unreadable ones are reported and play as silence.
    void open() {
        m_voices.resize(m_plan.voices.size());
        for (std::size_t i = 0; i < m_plan.voices.size(); ++i) {
            const auto& voice = m_plan.voices[i];
            if (voice.silent) continue;
            std::string error;
            m_voices[i].source = audio::AudioSource::open(voice.mediaPath, kRate, &error, m_cancelled);
            if (!m_voices[i].source) {
                m_problems.push_back(voice.clipId + ": " + error);
                continue;
            }
            m_channels = std::max(m_channels, m_voices[i].source->sourceChannels());
        }
    }
    // True when every opened source has one channel.
    bool allMono() const { return m_channels == 1; }
    bool hasVoices() const { return std::any_of(m_voices.begin(), m_voices.end(), [](const auto& v) { return v.source != nullptr; }); }
    const std::vector<std::string>& problems() const { return m_problems; }
    // Packets or frames the decoders rejected while running. Anything but zero means the audio is incomplete.
    std::int64_t decodeErrors() const {
        std::int64_t sum = 0;
        for (const auto& v : m_voices) sum += v.source ? v.source->decodeErrors() : 0;
        return sum;
    }
    // False when cancelled.
    bool run(const std::function<void(const float*, int)>& sink, const ProgressFn& progress, double progressFrom = 0,
             double progressSpan = 1) {
        std::vector<float> out(static_cast<std::size_t>(kBlock) * 2);
        std::vector<audio::VoicePcm> pcm(m_plan.voices.size());
        audio::MixStats stats;
        for (std::int64_t at = 0; at < m_total; at += kBlock) {
            if (m_cancelled && m_cancelled()) return false;
            const int n = static_cast<int>(std::min(kBlock, m_total - at));
            const double blockStart = m_startMs + static_cast<double>(at) * 1000.0 / kRate;
            const double blockEnd = blockStart + static_cast<double>(n) * 1000.0 / kRate;
            for (std::size_t i = 0; i < m_plan.voices.size(); ++i) {
                pcm[i] = fill(i, blockStart, blockEnd);
            }
            audio::mixBlock(m_plan, pcm.data(), kRate, blockStart, 1000.0 / kRate, n, out.data(), stats);
            sink(out.data(), n);
            if (progress) progress(progressFrom + progressSpan * static_cast<double>(at + n) / static_cast<double>(m_total));
        }
        return true;
    }

private:
    struct Voice {
        std::unique_ptr<audio::AudioSource> source;
        std::vector<float> window;       // interleaved stereo
        std::int64_t first = 0;          // source frame of window[0]
        std::int64_t count = 0;          // frames held
    };
    audio::VoicePcm fill(std::size_t index, double blockStart, double blockEnd) {
        audio::VoicePcm pcm;
        const audio::VoicePlan& v = m_plan.voices[index];
        Voice& voice = m_voices[index];
        const double from = std::max(v.startMs, blockStart);
        const double to = std::min(v.startMs + v.durationMs, blockEnd);
        if (!voice.source || v.silent || to <= from) return pcm;
        const auto first = std::max<std::int64_t>(0, static_cast<std::int64_t>(std::floor(v.sourceFrameAt(from, kRate))) - 1);
        const auto last = static_cast<std::int64_t>(std::ceil(v.sourceFrameAt(to, kRate))) + 2;
        if (first < voice.first || first > voice.first + voice.count || voice.count == 0) {
            voice.first = first;
            voice.count = 0;
            voice.window.clear();
            voice.source->seek(first);
        } else if (first > voice.first) {
            const auto drop = first - voice.first;
            voice.window.erase(voice.window.begin(), voice.window.begin() + drop * 2);
            voice.first = first;
            voice.count -= drop;
        }
        if (voice.first + voice.count < last) {
            const auto want = last - (voice.first + voice.count);
            const auto old = voice.window.size();
            voice.window.resize(old + static_cast<std::size_t>(want) * 2);
            if (voice.source->position() != voice.first + voice.count) voice.source->seek(voice.first + voice.count);
            const auto got = voice.source->read(voice.window.data() + old, want);
            voice.window.resize(old + static_cast<std::size_t>(got) * 2);
            voice.count += got;
        }
        pcm.linear = voice.window.data();
        pcm.linearFirst = voice.first;
        pcm.linearCount = voice.count;
        return pcm;
    }

    audio::MixPlan m_plan;
    double m_startMs;
    CancelFn m_cancelled;
    std::int64_t m_total;
    std::vector<Voice> m_voices;
    std::vector<std::string> m_problems;
    int m_channels = 0;
};

const Track* trackOf(const Timeline& timeline, const Clip& clip) { return timeline.findTrack(clip.trackId); }

QString roleOf(const Clip& clip) { return effectiveRole(clip.raw); }

// A lane is a line between its points, so a dip must not reach into the clips next to it. The points of a clip
// stay inside [start, end - 1 ms], and a flat point at the base level holds the clip's start and end. A clip that
// ends where the next begins then owns the points up to its end and the next owns the ones from its start.
void bounded(DuckPlan& plan) {
    auto& points = plan.points;
    if (points.empty()) return;
    const double first = plan.fromMs, last = std::max(plan.fromMs, plan.toMs - kEdgeMs);
    if (points.front().first > first + kSamePointMs) points.insert(points.begin(), {first, plan.baseDb});
    for (auto& p : points) p.first = std::min(p.first, last);
    // Two points squeezed onto the same time: the later wins.
    std::vector<std::pair<double, double>> distinct;
    for (const auto& p : points) {
        if (!distinct.empty() && p.first - distinct.back().first < kSamePointMs) distinct.back() = {distinct.back().first, p.second};
        else distinct.push_back(p);
    }
    if (distinct.back().first < last - kSamePointMs) distinct.push_back({last, distinct.back().second});
    points = std::move(distinct);
}

}  // namespace

namespace {

// Reverb gives each side its own impulse response, so the two channels of a mono clip differ after it.
bool makesStereo(const Clip& clip) {
    for (const auto& value : clip.raw.value("audioEffects").toArray()) {
        const auto effect = value.toObject();
        if (effect.value("enabled").toBool() && effect.value("type").toString() == u"reverb") return true;
    }
    return false;
}

bool hasEffects(const Clip& clip) {
    for (const auto& value : clip.raw.value("audioEffects").toArray()) {
        // As the mix reads it: an effect plays only when it says enabled.
        if (value.toObject().value("enabled").toBool()) return true;
    }
    return false;
}


struct Reading {
    bool finished = true;
    bool hasVoices = false;
    bool damaged = false;
    QString problem;
    bool mono = false;
    double lufs = -std::numeric_limits<double>::infinity();
    double samplePeakDb = -std::numeric_limits<double>::infinity();
    double truePeakDb = -std::numeric_limits<double>::infinity();
};

// One render of the clip alone at clip volume `volumeDb`, measured.
Reading measureOnce(const Timeline& timeline, const Clip& clip, double volumeDb, const CancelFn& cancelled,
                    const ProgressFn& progress) {
    Reading r;
    const Timeline isolated = isolate(timeline, {&clip}, false, volumeDb);
    Stream stream(isolated, clip.startMs, clip.durationMs, cancelled);
    stream.open();
    if (!stream.hasVoices()) {
        r.problem = stream.problems().empty() ? QStringLiteral("This clip has no sound to measure.")
                                              : QStringLiteral("The sound file could not be read.");
        return r;
    }
    r.hasVoices = true;
    // One channel in the file is measured as one channel, as ebur128 does, unless an effect spreads it over two.
    r.mono = stream.allMono() && !makesStereo(clip);
    // On the heap: the meter holds two histograms, too much for the small stack of a worker thread.
    const auto meterPtr = std::make_unique<audio::LoudnessMeter>(kRate, r.mono ? 1 : 2);
    audio::LoudnessMeter& meter = *meterPtr;
    std::vector<float> folded;
    r.finished = stream.run(
        [&](const float* stereo, int frames) {
            if (!r.mono) {
                meter.processInterleaved(stereo, frames);
                return;
            }
            folded.resize(static_cast<std::size_t>(frames));
            for (int i = 0; i < frames; ++i) folded[static_cast<std::size_t>(i)] = 0.5f * (stereo[2 * i] + stereo[2 * i + 1]);
            meter.processInterleaved(folded.data(), frames);
        },
        progress);
    r.damaged = stream.decodeErrors() > 0;
    r.lufs = meter.integrated();
    r.samplePeakDb = meter.samplePeak() > 0 ? 20 * std::log10(meter.samplePeak()) : -std::numeric_limits<double>::infinity();
    r.truePeakDb = meter.truePeakDb();
    return r;
}

}  // namespace

std::vector<Measurement> measureClips(const Timeline& timeline, const std::vector<std::string>& clipIds, const Goal& goal,
                                      const CancelFn& cancelled, const ProgressFn& progress) {
    std::vector<Measurement> results;
    const double count = static_cast<double>(std::max<std::size_t>(1, clipIds.size()));
    for (std::size_t k = 0; k < clipIds.size(); ++k) {
        if (cancelled && cancelled()) break;
        Measurement m;
        m.clipId = clipIds[k];
        const Clip* clip = timeline.findClip(clipIds[k]);
        if (!clip) {
            m.problem = QStringLiteral("The clip is no longer on the timeline.");
            results.push_back(std::move(m));
            continue;
        }
        // Each render gets its share of the clip's time.
        // Effects can bend the level, and the absolute gate of the loudness measure moves with the gain (a quiet
        // passage can rise past it), so a loudness match is checked at the volume it found. A peak without effects
        // is exact.
        const bool search = hasEffects(*clip) || !goal.peak;
        const int budget = hasEffects(*clip) ? kMaxPasses : search ? kMaxCheckPasses : 1;
        int pass = 0;
        const auto step = [&](double volumeDb) {
            const double from = static_cast<double>(k) + static_cast<double>(pass++) / budget;
            return measureOnce(timeline, *clip, volumeDb, cancelled,
                               progress ? ProgressFn([&, from, budget](double f) { progress((from + f / budget) / count); }) : ProgressFn{});
        };
        const auto first = step(0);
        if (!first.finished) break;
        if (!first.hasVoices) {
            m.problem = first.problem;
            results.push_back(std::move(m));
            continue;
        }
        if (first.damaged) {
            m.problem = QStringLiteral("The sound file could not be read to the end.");
            results.push_back(std::move(m));
            continue;
        }
        m.mono = first.mono;
        m.integratedLufs = first.lufs;
        m.samplePeakDb = first.samplePeakDb;
        m.truePeakDb = first.truePeakDb;
        const auto level = [&](const Reading& r) { return goal.peak ? r.samplePeakDb : r.lufs; };
        if (!std::isfinite(level(first))) {
            m.problem = goal.peak ? QStringLiteral("This clip is silent, so there is nothing to normalize.")
                       : std::isfinite(first.samplePeakDb)
                           ? QStringLiteral("This clip is too short or too quiet to measure its loudness.")
                           : QStringLiteral("This clip is silent, so there is nothing to match.");
            results.push_back(std::move(m));
            continue;
        }
        m.ok = true;
        m.target = goal.target ? goal.target(*clip) : 0.0;
        double volume = std::clamp(m.target - level(first), -120.0, 24.0);
        m.volumeDb = volume;
        if (search) {
            // The volume feeds the clip's effects, so with a compressor in the chain the level moves less than the
            // volume does, and by a different amount either side of its threshold. The level never falls as the
            // volume rises, so search for the volume that reaches the target: keep a bracket around it, step by
            // interpolating inside it (and by halving it every third step), extrapolate while there is none, and
            // keep the closest volume that was measured.
            struct Point { double volume, level; };
            std::vector<Point> measured{{0.0, level(first)}};
            double bestError = m.target - level(first);
            m.volumeDb = 0;
            if (std::abs(bestError) >= 0.05) {
                for (int i = 1; i < budget; ++i) {
                    double next = volume;
                    if (i > 1) {
                        const Point* below = nullptr;
                        const Point* above = nullptr;
                        for (const auto& p : measured) {
                            if (p.level <= m.target && (!below || p.level > below->level)) below = &p;
                            if (p.level > m.target && (!above || p.level < above->level)) above = &p;
                        }
                        if (below && above) {
                            // A trial below the gate (no level at all) tells only that the volume is too low.
                            next = i % 3 == 0 || below->level <= kBelowGate + 1 ? 0.5 * (below->volume + above->volume)
                                              : below->volume + (m.target - below->level) * (above->volume - below->volume) / (above->level - below->level);
                        } else {
                            const auto& a = measured[measured.size() - 2];
                            const auto& b = measured.back();
                            const double slope = std::abs(b.volume - a.volume) > 1e-6
                                ? std::clamp((b.level - a.level) / (b.volume - a.volume), 0.05, 2.0) : 1.0;
                            next = b.volume + (m.target - b.level) / slope;
                        }
                        next = std::clamp(next, -120.0, 24.0);
                        const bool seen = std::any_of(measured.begin(), measured.end(), [next](const Point& p) { return std::abs(p.volume - next) < 1e-6; });
                        if (seen) break;  // pinned at the end of the range, or nothing new to try
                    }
                    const auto again = step(next);
                    if (!again.finished) { m.ok = false; break; }
                    ++m.passes;
                    if (again.damaged) {
                        m.ok = false;
                        m.problem = QStringLiteral("The sound file could not be read to the end.");
                        break;
                    }
                    const double reached = std::isfinite(level(again)) ? level(again) : kBelowGate;
                    measured.push_back({next, reached});
                    volume = next;
                    const double missing = m.target - reached;
                    if (std::abs(missing) < std::abs(bestError)) { bestError = missing; m.volumeDb = next; }
                    if (std::abs(missing) < 0.05) break;
                }
                if (!m.ok && m.problem.isEmpty()) break;  // cancelled
            }
            m.missedBy = bestError;
        }
        m.clamped = m.volumeDb <= -120.0 || m.volumeDb >= 24.0;
        results.push_back(std::move(m));
    }
    return results;
}

VolumePlan volumesFor(const std::vector<Measurement>& measurements) {
    VolumePlan plan;
    for (const auto& m : measurements) {
        if (!m.ok) {
            ++plan.silent;
            if (plan.firstProblem.isEmpty()) plan.firstProblem = m.problem;
            continue;
        }
        if (m.clamped) ++plan.clamped;
        if (std::abs(m.missedBy) > 0.5) ++plan.missed;
        const auto id = QString::fromStdString(m.clipId);
        plan.volumes.insert(id, m.volumeDb);
        plan.rows.append(QJsonObject{{"clipId", id}, {"integratedLufs", m.integratedLufs}, {"samplePeakDb", m.samplePeakDb},
                                     {"truePeakDb", m.truePeakDb}, {"targetDb", m.target}, {"volumeDb", m.volumeDb},
                                     {"mono", m.mono}, {"passes", m.passes}});
    }
    return plan;
}

std::vector<DuckPlan> planDucking(const Timeline& timeline, const std::vector<std::string>& clipIds,
                                  const DuckSettings& settings, const CancelFn& cancelled, const ProgressFn& progress) {
    std::vector<DuckPlan> plans;
    // Clips that overlap on one track (a cross-fade) share one lane and hear the same dialogue, so they are planned
    // as one range. Clips that only meet stay separate, each owning the points up to its end.
    struct Group {
        std::vector<std::string> ids;
        const Clip* first = nullptr;
        double from = 0, to = 0;
    };
    std::vector<const Clip*> found;
    for (const auto& id : clipIds) {
        if (const Clip* clip = timeline.findClip(id)) {
            found.push_back(clip);
            continue;
        }
        DuckPlan missing;
        missing.clipId = id;
        missing.problem = QStringLiteral("The clip is no longer on the timeline.");
        plans.push_back(std::move(missing));
    }
    std::stable_sort(found.begin(), found.end(), [](const Clip* a, const Clip* b) {
        return a->trackId != b->trackId ? a->trackId < b->trackId : a->startMs < b->startMs;
    });
    std::vector<Group> groups;
    for (const Clip* clip : found) {
        if (!groups.empty() && groups.back().first->trackId == clip->trackId && clip->startMs < groups.back().to) {
            groups.back().ids.push_back(clip->id);
            groups.back().to = std::max(groups.back().to, clip->endMs());
        } else {
            groups.push_back({{clip->id}, clip, clip->startMs, clip->endMs()});
        }
    }
    const double count = static_cast<double>(std::max<std::size_t>(1, groups.size()));
    for (std::size_t k = 0; k < groups.size(); ++k) {
        if (cancelled && cancelled()) break;
        const Group& group = groups[k];
        const Clip* clip = group.first;
        DuckPlan plan;
        plan.clipId = clip->id;
        plan.clips = static_cast<int>(group.ids.size());
        plan.trackId = clip->trackId;
        plan.fromMs = group.from;
        plan.toMs = group.to;
        const Track* track = trackOf(timeline, *clip);
        if (!track || (track->type != TrackType::Audio && track->type != TrackType::Midi)) {
            plan.problem = QStringLiteral("Ducking needs the clip on an audio track.");
        } else if (track->locked) {
            plan.problem = QStringLiteral("The track is locked.");
        } else if (group.to - group.from <= 0) {
            plan.problem = QStringLiteral("The clip has no length.");
        }
        if (!plan.problem.isEmpty()) {
            plans.push_back(std::move(plan));
            continue;
        }
        // The dips go down from the track fader, and the lane replaces the fader while it has points. Anything the
        // lane held inside the clip is replaced. A lane that is switched off would hide the dips, so it is left alone.
        plan.baseDb = track->volumeDb;
        int outside = 0;
        if (track->raw.value("automation").toArray().size() >= kMaxLanes) {
            bool hasVolumeLane = false;
            for (const auto& value : track->raw.value("automation").toArray()) {
                const auto target = value.toObject().value("target").toObject();
                hasVolumeLane |= target.value("kind").toString() == u"mixer" && target.value("param").toString() == u"volumeDb";
            }
            if (!hasVolumeLane) plan.problem = QStringLiteral("This track already has as many automation lanes as it can hold.");
        }
        for (const auto& value : track->raw.value("automation").toArray()) {
            const auto lane = value.toObject();
            const auto target = lane.value("target").toObject();
            if (target.value("kind").toString() != u"mixer" || target.value("param").toString() != u"volumeDb") continue;
            if (lane.value("enabled").toBool(true) == false) {
                plan.problem = QStringLiteral("The volume automation of this track is switched off, so ducking would not be heard.");
            }
            for (const auto& p : lane.value("points").toArray()) {
                const double t = p.toObject().value("timeMs").toDouble();
                if (t < plan.fromMs || t >= plan.toMs) ++outside;
            }
            break;
        }
        if (!plan.problem.isEmpty()) {
            plans.push_back(std::move(plan));
            continue;
        }
        std::vector<const Clip*> triggers;
        for (const Clip& other : timeline.clips) {
            if (std::find(group.ids.begin(), group.ids.end(), other.id) != group.ids.end() || other.muted || other.durationMs <= 0) continue;
            if (!settings.against.contains(roleOf(other), Qt::CaseSensitive) || roleOf(other).isEmpty()) continue;
            if (other.startMs >= plan.toMs || other.endMs() <= plan.fromMs) continue;
            const Track* otherTrack = trackOf(timeline, other);
            if (!otherTrack || otherTrack->muted) continue;
            triggers.push_back(&other);
            plan.triggerIds.push_back(other.id);
        }
        if (!triggers.empty()) {
            const Timeline isolated = isolate(timeline, triggers, true);
            Stream stream(isolated, plan.fromMs, plan.toMs - plan.fromMs, cancelled);
            stream.open();
            if (!stream.problems().empty() || !stream.hasVoices()) {
                // Leave the ducking as it is: an empty plan would clear it.
                plan.problem = QStringLiteral("A sound file under this clip could not be read, so its ducking was left as it was.");
            } else {
                audio::ducking::EnvelopeBuilder envelope(kRate);
                const bool finished = stream.run(
                    [&](const float* stereo, int frames) { envelope.feed(stereo, frames); },
                    progress ? ProgressFn([&](double f) { progress((static_cast<double>(k) + f) / count); }) : ProgressFn{});
                if (!finished) break;
                if (stream.decodeErrors() > 0) plan.problem = QStringLiteral("A sound file under this clip could not be read to the end, so its ducking was left as it was.");
                const auto env = envelope.finish();
                const auto regions = audio::ducking::activity(env, envelope.hopS(),
                    audio::ducking::sensitivityThresholdDb(settings.sensitivity), audio::ducking::kMinOnS,
                    audio::ducking::kBridgeS);
                std::vector<audio::ducking::Region> absolute;
                for (const auto& r : regions) {
                    absolute.push_back({plan.fromMs / 1000.0 + r.startS, plan.fromMs / 1000.0 + r.endS});
                    plan.regionsMs.emplace_back(plan.fromMs + r.startS * 1000.0, plan.fromMs + r.endS * 1000.0);
                }
                for (const auto& key : audio::ducking::duckKeyframes(absolute, plan.fromMs / 1000.0, plan.toMs / 1000.0,
                                                                     plan.baseDb, settings.reduceDb, settings.fadeS)) {
                    plan.points.emplace_back(std::round(key.timeS * 1e6) / 1e3, key.valueDb);
                }
                bounded(plan);
            }
        }
        if (!plan.problem.isEmpty()) plan.points.clear();
        if (plan.problem.isEmpty() && outside + static_cast<int>(plan.points.size()) > kMaxLanePoints) {
            plan.problem = QStringLiteral("This would need more automation points than one volume lane can hold.");
        }
        plans.push_back(std::move(plan));
        if (progress) progress(static_cast<double>(k + 1) / count);
    }
    return plans;
}

QJsonObject duckingPayload(const std::vector<DuckPlan>& plans) {
    QList<DuckEntry> entries;
    for (const auto& plan : plans) {
        if (!plan.problem.isEmpty()) continue;
        DuckEntry entry;
        entry.trackId = QString::fromStdString(plan.trackId);
        entry.fromMs = plan.fromMs;
        entry.toMs = plan.toMs;
        entry.baseDb = plan.baseDb;
        for (const auto& [t, v] : plan.points) entry.points.append(QJsonObject{{"timeMs", t}, {"value", v}});
        entries.append(entry);
    }
    return duckPayload(entries);
}

}  // namespace nt::audioroles
