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

// A copy of the timeline that holds only `clips`, on neutral tracks: no fader, pan, mute, solo, track
// effects or automation, and no master gain. With `ownGain` false the clip gain and fades are removed
// too, which is the clip's signal before the gain the match will set.
Timeline isolate(const Timeline& source, const std::vector<const Clip*>& clips, bool ownGain) {
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
            copy.volumeDb = 0;
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

}  // namespace

std::vector<Measurement> measureClips(const Timeline& timeline, const std::vector<std::string>& clipIds,
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
        const Timeline isolated = isolate(timeline, {clip}, false);
        Stream stream(isolated, clip->startMs, clip->durationMs, cancelled);
        stream.open();
        if (!stream.hasVoices()) {
            m.problem = stream.problems().empty() ? QStringLiteral("This clip has no sound to measure.")
                                                  : QStringLiteral("The sound file could not be read.");
            results.push_back(std::move(m));
            continue;
        }
        m.mono = stream.allMono();
        // On the heap: the meter holds two histograms, too much for the small stack of a worker thread.
        const auto meterPtr = std::make_unique<audio::LoudnessMeter>(kRate, m.mono ? 1 : 2);
        audio::LoudnessMeter& meter = *meterPtr;
        std::vector<float> folded;
        const bool finished = stream.run(
            [&](const float* stereo, int frames) {
                if (!m.mono) {
                    meter.processInterleaved(stereo, frames);
                    return;
                }
                folded.resize(static_cast<std::size_t>(frames));
                for (int i = 0; i < frames; ++i) folded[static_cast<std::size_t>(i)] = 0.5f * (stereo[2 * i] + stereo[2 * i + 1]);
                meter.processInterleaved(folded.data(), frames);
            },
            progress ? ProgressFn([&](double f) { progress((static_cast<double>(k) + f) / count); }) : ProgressFn{});
        if (!finished) break;
        m.integratedLufs = meter.integrated();
        m.samplePeakDb = meter.samplePeak() > 0 ? 20 * std::log10(meter.samplePeak()) : -std::numeric_limits<double>::infinity();
        m.truePeakDb = meter.truePeakDb();
        if (!std::isfinite(m.integratedLufs)) {
            m.problem = QStringLiteral("This clip is silent, so there is nothing to match.");
        } else {
            m.ok = true;
        }
        results.push_back(std::move(m));
    }
    return results;
}

VolumePlan volumesFor(const std::vector<Measurement>& measurements,
                      const std::function<double(const Measurement&)>& targetOf, bool peak) {
    VolumePlan plan;
    for (const auto& m : measurements) {
        if (!m.ok) {
            ++plan.silent;
            if (plan.firstProblem.isEmpty()) plan.firstProblem = m.problem;
            continue;
        }
        const double target = targetOf(m);
        const double wanted = target - (peak ? m.samplePeakDb : m.integratedLufs);
        const double volume = std::clamp(wanted, -120.0, 24.0);
        if (volume != wanted) ++plan.clamped;
        const auto id = QString::fromStdString(m.clipId);
        plan.volumes.insert(id, volume);
        plan.rows.append(QJsonObject{{"clipId", id}, {"integratedLufs", m.integratedLufs}, {"samplePeakDb", m.samplePeakDb},
                                     {"truePeakDb", m.truePeakDb}, {"targetDb", target}, {"volumeDb", volume}, {"mono", m.mono}});
    }
    return plan;
}

std::vector<DuckPlan> planDucking(const Timeline& timeline, const std::vector<std::string>& clipIds,
                                  const DuckSettings& settings, const CancelFn& cancelled, const ProgressFn& progress) {
    std::vector<DuckPlan> plans;
    const double count = static_cast<double>(std::max<std::size_t>(1, clipIds.size()));
    for (std::size_t k = 0; k < clipIds.size(); ++k) {
        if (cancelled && cancelled()) break;
        DuckPlan plan;
        plan.clipId = clipIds[k];
        const Clip* clip = timeline.findClip(clipIds[k]);
        if (!clip) {
            plan.problem = QStringLiteral("The clip is no longer on the timeline.");
            plans.push_back(std::move(plan));
            continue;
        }
        plan.trackId = clip->trackId;
        plan.fromMs = clip->startMs;
        plan.toMs = clip->endMs();
        const Track* track = trackOf(timeline, *clip);
        if (!track || (track->type != TrackType::Audio && track->type != TrackType::Midi)) {
            plan.problem = QStringLiteral("Ducking needs the clip on an audio track.");
        } else if (track->locked) {
            plan.problem = QStringLiteral("The track is locked.");
        } else if (clip->durationMs <= 0) {
            plan.problem = QStringLiteral("The clip has no length.");
        }
        if (!plan.problem.isEmpty()) {
            plans.push_back(std::move(plan));
            continue;
        }
        // The level outside the dips: the track fader, or a hand-drawn lane as it stands outside this clip.
        plan.baseDb = track->volumeDb;
        for (const auto& value : track->raw.value("automation").toArray()) {
            const auto lane = value.toObject();
            const auto target = lane.value("target").toObject();
            if (target.value("kind").toString() != u"mixer" || target.value("param").toString() != u"volumeDb") continue;
            QJsonArray outside;
            for (const auto& p : lane.value("points").toArray()) {
                const double t = p.toObject().value("timeMs").toDouble();
                if (t < plan.fromMs || t > plan.toMs) outside.append(p);
            }
            if (!outside.isEmpty()) plan.baseDb = automation::automationValueAt(outside, plan.fromMs, plan.baseDb);
            break;
        }
        std::vector<const Clip*> triggers;
        for (const Clip& other : timeline.clips) {
            if (other.id == clip->id || other.muted || other.durationMs <= 0) continue;
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
            if (stream.hasVoices()) {
                audio::ducking::EnvelopeBuilder envelope(kRate);
                const bool finished = stream.run(
                    [&](const float* stereo, int frames) { envelope.feed(stereo, frames); },
                    progress ? ProgressFn([&](double f) { progress((static_cast<double>(k) + f) / count); }) : ProgressFn{});
                if (!finished) break;
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
            }
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
