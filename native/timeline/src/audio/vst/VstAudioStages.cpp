#include "audio/vst/VstAudioStages.h"

#include "audio/FadeCurves.h"
#include "midi/PatternExpand.h"
#include "midi/RegionParams.h"

#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QUuid>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <limits>
#include <unordered_map>

namespace nt::audio::vst {
namespace {

constexpr double kMidiPpq = 960.0;
constexpr int kLiveBlockTimeoutMs = 25;

double resolveBpm(const Timeline& timeline) {
    const QJsonObject tempo = timeline.raw.value(u"tempo").toObject();
    const double bpm = tempo.value(u"bpm").toDouble(120.0);
    return (std::isfinite(bpm) && bpm > 0.0) ? bpm : 120.0;
}

bool isSoundTrack(const Track& track) {
    return track.type == TrackType::Audio || track.type == TrackType::Midi;
}

bool hasSoloedSoundTrack(const Timeline& timeline) {
    for (const Track& t : timeline.tracks) {
        if (isSoundTrack(t) && t.solo) return true;
    }
    return false;
}

bool isValidVstPlugin(const QJsonObject& plugin) {
    return !plugin.value(u"path").toString().isEmpty() && !plugin.value(u"uid").toString().isEmpty();
}

void writeLe16(char* dst, std::uint16_t v) {
    dst[0] = static_cast<char>(v & 0xffu);
    dst[1] = static_cast<char>((v >> 8) & 0xffu);
}

void writeLe32(char* dst, std::uint32_t v) {
    dst[0] = static_cast<char>(v & 0xffu);
    dst[1] = static_cast<char>((v >> 8) & 0xffu);
    dst[2] = static_cast<char>((v >> 16) & 0xffu);
    dst[3] = static_cast<char>((v >> 24) & 0xffu);
}

constexpr double kRampStepMs = 10.0;

struct ClipEnvelope {
    double startMs = 0.0;
    double durationMs = 0.0;
    double clipGain = 1.0;
    ResolvedFades fades;
};

struct CurvePoint {
    double timeMs = 0.0;
    double value = 0.0;
};

// Calls onSample(timeMs, value) for each point of `points` with fromMs <= time <
// toMs and, when not `step`, for each 10 ms ramp sample between two points
// whose quantized value differs from the one before it. `quantize` maps a
// curve value to the value a consumer sees.
template <class Quantize, class Sample>
void sampleCurve(const std::vector<CurvePoint>& points, bool step, double fromMs, double toMs, Quantize quantize,
                 Sample onSample) {
    for (std::size_t i = 0; i < points.size(); ++i) {
        const CurvePoint& a = points[i];
        if (a.timeMs >= fromMs && a.timeMs < toMs) {
            onSample(a.timeMs, quantize(a.value));
        }
        if (step || i + 1 >= points.size()) {
            continue;
        }
        const CurvePoint& b = points[i + 1];
        const double span = b.timeMs - a.timeMs;
        if (span <= kRampStepMs) {
            continue;
        }
        const double first = std::max(a.timeMs, fromMs);
        auto k = std::max(1.0, std::ceil((first - a.timeMs) / kRampStepMs));
        auto valueAt = [&](double t) { return quantize(a.value + (b.value - a.value) * ((t - a.timeMs) / span)); };
        double last = k > 1.0 ? valueAt(a.timeMs + (k - 1.0) * kRampStepMs) : quantize(a.value);
        for (;; k += 1.0) {
            const double t = a.timeMs + k * kRampStepMs;
            if (t >= b.timeMs || t >= toMs) {
                break;
            }
            const double v = valueAt(t);
            if (v != last) {
                onSample(t, v);
                last = v;
            }
        }
    }
}

bool laneKindOf(const QString& kind, std::uint8_t& status) {
    if (kind == u"cc") status = 0xB0u;
    else if (kind == u"pitchBend") status = 0xE0u;
    else if (kind == u"channelPressure") status = 0xD0u;
    else if (kind == u"polyPressure") status = 0xA0u;
    else return false;
    return true;
}

MidiStreamEvent controllerEvent(std::uint8_t statusKind, std::uint8_t channel, std::uint8_t data1, int value,
                                double timeMs) {
    MidiStreamEvent e;
    e.timeMs = timeMs;
    e.status = static_cast<std::uint8_t>(statusKind | (channel & 0x0Fu));
    if (statusKind == 0xE0u) {
        const int raw = std::clamp(value, -8192, 8191) + 8192;
        e.data1 = static_cast<std::uint8_t>(raw & 0x7F);
        e.data2 = static_cast<std::uint8_t>((raw >> 7) & 0x7F);
    } else if (statusKind == 0xD0u) {
        e.data1 = static_cast<std::uint8_t>(std::clamp(value, 0, 127));
    } else {
        e.data1 = data1;
        e.data2 = static_cast<std::uint8_t>(std::clamp(value, 0, 127));
    }
    return e;
}

int sortClass(const MidiStreamEvent& e) {
    // At equal time: note-off, clip-end reset, controller value, note-on, note expression.
    if (e.status == vsthost::kShmStatusNoteExpression) return 4;
    switch (e.status & 0xF0u) {
        case 0x80u: return 0;
        case 0x90u: return 3;
        default: return e.clipEndReset ? 1 : 2;
    }
}

struct ExpressionKind {
    QLatin1StringView key;
    std::uint8_t type = 0;
    double (*normalize)(double) = nullptr;
};
constexpr ExpressionKind kExpressionKinds[] = {
    {QLatin1StringView("pitch"), vsthost::kShmExprTuning, [](double v) { return 0.5 + v / 240.0; }},
    {QLatin1StringView("volume"), vsthost::kShmExprVolume, [](double v) { return v / 4.0; }},
    {QLatin1StringView("pan"), vsthost::kShmExprPan, [](double v) { return (v + 1.0) / 2.0; }},
    {QLatin1StringView("brightness"), vsthost::kShmExprBrightness, [](double v) { return v; }},
};

void addNoteExpression(const QJsonObject& note, double onMs, double offMs, double msPerQuarter, std::int32_t noteId,
                       std::vector<MidiStreamEvent>& events) {
    const QJsonObject expression = note.value(u"expression").toObject();
    for (const auto& kind : kExpressionKinds) {
        const QJsonArray raw = expression.value(QString(kind.key)).toArray();
        if (raw.isEmpty()) continue;
        std::vector<CurvePoint> points;
        points.reserve(static_cast<std::size_t>(raw.size()));
        for (const auto& entry : raw) {
            const QJsonObject p = entry.toObject();
            const double tick = p.value(u"tick").toDouble(-1.0);
            const double value = p.value(u"value").toDouble(std::numeric_limits<double>::quiet_NaN());
            if (!std::isfinite(tick) || tick < 0.0 || !std::isfinite(value)) continue;
            points.push_back({onMs + (tick / kMidiPpq) * msPerQuarter, kind.normalize(value)});
        }
        // Points before the note ends only: an event at the note-off would follow it.
        const auto normalize = [](double v) { return static_cast<double>(std::clamp(static_cast<float>(v), 0.0f, 1.0f)); };
        sampleCurve(points, false, onMs, offMs, normalize, [&](double t, double v) {
            MidiStreamEvent e;
            e.timeMs = t;
            e.status = vsthost::kShmStatusNoteExpression;
            e.data1 = kind.type;
            e.noteId = noteId;
            e.value = static_cast<float>(v);
            events.push_back(e);
        });
    }
}

std::size_t chaseLaneEvents(const std::vector<MidiChaseLane>& lanes, double timeMs,
                            std::span<MidiStreamEvent> out) noexcept;

void addControllerLanes(const Clip& clip, const QJsonArray& lanes, double windowStart, double msPerQuarter,
                        MidiTrackStream& stream) {
    const double clipStart = clip.startMs;
    const double clipEnd = clip.startMs + clip.durationMs;
    for (const auto& entry : lanes) {
        const QJsonObject lane = entry.toObject();
        std::uint8_t kindStatus = 0;
        if (!laneKindOf(lane.value(u"kind").toString(), kindStatus)) continue;
        const int cc = lane.value(u"cc").toInt(0);
        const int pitch = lane.value(u"pitch").toInt(0);
        const auto channel = static_cast<std::uint8_t>(std::clamp(lane.value(u"channel").toInt(0), 0, 15));
        const std::uint8_t data1 = static_cast<std::uint8_t>(std::clamp(kindStatus == 0xB0u ? cc : pitch, 0, 127));
        const bool step = lane.value(u"interpolation").toString() == u"step";
        const int lo = kindStatus == 0xE0u ? -8192 : 0;
        const int hi = kindStatus == 0xE0u ? 8191 : 127;

        std::vector<CurvePoint> points;
        MidiChaseLane chase;
        for (const auto& pointEntry : lane.value(u"points").toArray()) {
            const QJsonObject p = pointEntry.toObject();
            const double tick = p.value(u"tick").toDouble(-1.0);
            if (!std::isfinite(tick) || tick < 0.0) continue;
            const int value = std::clamp(p.value(u"value").toInt(0), lo, hi);
            const double timeMs = clipStart + ((tick / kMidiPpq) * msPerQuarter - windowStart);
            points.push_back({timeMs, static_cast<double>(value)});
            chase.points.push_back({timeMs, value});
        }
        if (points.empty()) continue;

        bool emitted = false;
        sampleCurve(points, step, clipStart, clipEnd, [](double v) { return std::round(v); },
                    [&](double t, double v) {
                        stream.events.push_back(controllerEvent(kindStatus, channel, data1, static_cast<int>(v), t));
                        emitted = true;
                    });
        // A chase can emit on a mid-clip start, so the lane resets even with no event of its own.
        if ((emitted || points.front().timeMs < clipEnd) && (kindStatus == 0xE0u || (kindStatus == 0xB0u && cc == 64))) {
            MidiStreamEvent reset = controllerEvent(kindStatus, channel, data1, 0, clipEnd);
            reset.clipEndReset = true;
            stream.events.push_back(reset);
        }
        chase.clipStartMs = clipStart;
        chase.clipEndMs = clipEnd;
        chase.step = step;
        chase.statusKind = kindStatus;
        chase.channel = channel;
        chase.data1 = data1;
        // A trimmed window hides the lane's first points: the value holds at the clip start
        // (the chase time of a playback that starts before the clip). A point exactly there covers itself.
        if (points.front().timeMs < clipStart) {
            std::array<MidiStreamEvent, 1> atStart;
            const std::vector<MidiChaseLane> one{chase};
            if (chaseLaneEvents(one, clipStart, atStart) == 1) stream.events.push_back(atStart[0]);
        }
        stream.chase.push_back(std::move(chase));
    }
}

MidiTrackStream buildStream(const Timeline& timeline, const std::string& trackId, double bpm,
                            std::vector<ClipEnvelope>* envelopes) {
    MidiTrackStream stream;
    auto& events = stream.events;
    const double msPerQuarter = 60000.0 / bpm;
    std::int32_t nextNoteId = 1;
    for (const Clip& clip : timeline.clips) {
        if (clip.trackId != trackId || clip.mediaType != MediaType::Midi || clip.muted ||
            clip.durationMs <= 0.0 || clip.startMs + clip.durationMs <= 0.0) {
            continue;
        }
        if (envelopes) {
            ClipEnvelope env;
            env.startMs = clip.startMs;
            env.durationMs = clip.durationMs;
            env.clipGain = clip.volumeDb != 0.0 ? dbToGain(clip.volumeDb) : 1.0;
            env.fades = resolveClipFades(clip.fadeInMs, clip.fadeOutMs, parseFadeShape(clip.fadeInShape),
                                         parseFadeShape(clip.fadeOutShape), clip.durationMs);
            envelopes->push_back(env);
        }
        const bool isPatternClip = clip.raw.value(u"pattern").isObject();
        const QJsonObject expandedPattern =
            isPatternClip ? nt::midi::expandPatternClipForPlayback(clip.raw, timeline.raw) : QJsonObject{};
        const double windowStart = isPatternClip ? 0.0 : std::max(0.0, clip.inPointMs);
        const auto projected = isPatternClip ? QJsonObject{} : nt::midi::applyRegionParams(clip.raw, bpm,
            timeline.raw.value("tempo").toObject().value("offsetMs").toDouble());
        const QJsonArray notes = isPatternClip ? expandedPattern.value(u"notes").toArray()
                                               : projected.value(u"notes").toArray();
        const QJsonArray controllers = isPatternClip ? expandedPattern.value(u"controllers").toArray()
                                                     : projected.value(u"controllers").toArray();
        const double loop = isPatternClip ? 0.0 : clip.raw.value(u"loopLengthMs").toDouble();
        const double period = std::isfinite(loop) && loop > 0 && loop < clip.durationMs ? loop : clip.durationMs;
        for (int k = 0; k * period < clip.durationMs; ++k) {
            const double offset = k * period;
            const double length = std::min(period, clip.durationMs - offset);
            const double windowEnd = windowStart + length;
            const double clipEndMs = clip.startMs + offset + length;
            for (const auto& entry : notes) {
                if (!entry.isObject()) continue;
                const QJsonObject n = entry.toObject();
                if (n.value(u"muted").toBool(false)) continue;
                const double startTick = n.value(u"startTick").toDouble(-1.0);
                const double durationTick = n.value(u"durationTick").toDouble(0.0);
                if (!std::isfinite(startTick) || startTick < 0.0 || !std::isfinite(durationTick) || durationTick <= 0.0) {
                    continue;
                }
                const double noteStartMs = (startTick / kMidiPpq) * msPerQuarter;
                if (noteStartMs < windowStart || noteStartMs >= windowEnd) continue;
                const double noteEndMs = noteStartMs + (durationTick / kMidiPpq) * msPerQuarter;
                const double onMs = clip.startMs + offset + (noteStartMs - windowStart);
                const double offMs = std::max(onMs + 0.01, std::min(clipEndMs, clip.startMs + offset + (noteEndMs - windowStart)));
                const auto pitch = static_cast<std::uint8_t>(std::clamp(n.value(u"pitch").toInt(60), 0, 127));
                const auto vel = static_cast<std::uint8_t>(std::clamp(n.value(u"velocity").toInt(100), 1, 127));
                const auto channel = static_cast<std::uint8_t>(std::clamp(n.value(u"channel").toInt(0), 0, 15));
                const auto release = static_cast<std::uint8_t>(std::clamp(n.value(u"releaseVelocity").toInt(0), 0, 127));
                const std::int32_t noteId = nextNoteId++;
                events.push_back(MidiStreamEvent{onMs, static_cast<std::uint8_t>(0x90u | channel), pitch, vel, noteId, 0.0f});
                events.push_back(MidiStreamEvent{offMs, static_cast<std::uint8_t>(0x80u | channel), pitch, release, noteId, 0.0f});
                if (n.contains(u"expression")) {
                    addNoteExpression(n, onMs, offMs, msPerQuarter, noteId, events);
                }
            }
            Clip window = clip;
            window.startMs += offset;
            window.durationMs = length;
            addControllerLanes(window, controllers, windowStart, msPerQuarter, stream);
        }
    }
    // Snap to whole microseconds so a sum such as 819.2 + 1638.4 equals the next clip's 2457.6
    // exactly and the equal-time sort classes apply (far below one audio sample).
    for (auto& e : events) e.timeMs = std::llround(e.timeMs * 1000.0) / 1000.0;
    std::stable_sort(events.begin(), events.end(), [](const MidiStreamEvent& a, const MidiStreamEvent& b) {
        if (a.timeMs != b.timeMs) return a.timeMs < b.timeMs;
        return sortClass(a) < sortClass(b);
    });
    return stream;
}

constexpr std::size_t kMaxChaseEvents = 128;

std::size_t chaseLaneEvents(const std::vector<MidiChaseLane>& lanes, double timeMs,
                            std::span<MidiStreamEvent> out) noexcept {
    std::size_t count = 0;
    for (const MidiChaseLane& lane : lanes) {
        if (count >= out.size()) break;
        if (lane.points.empty() || timeMs < lane.clipStartMs || timeMs >= lane.clipEndMs ||
            !(timeMs > lane.points.front().timeMs)) {
            continue;
        }
        const auto after = std::upper_bound(lane.points.begin(), lane.points.end(), timeMs,
                                            [](double t, const MidiChaseLane::Point& p) { return t < p.timeMs; });
        const auto& prev = *(after - 1);
        if (prev.timeMs == timeMs) continue;  // a point at this time emits itself
        int value = prev.value;
        if (!lane.step && after != lane.points.end() && after->timeMs > prev.timeMs) {
            const double f = (timeMs - prev.timeMs) / (after->timeMs - prev.timeMs);
            value = static_cast<int>(std::llround(prev.value + (after->value - prev.value) * f));
        }
        out[count++] = controllerEvent(lane.statusKind, lane.channel, lane.data1, value, timeMs);
    }
    return count;
}

}  // namespace

bool LiveBlockClock::isDiscontinuous(double blockStartMs) const noexcept {
    return !std::isfinite(expectedNextMs) || std::abs(blockStartMs - expectedNextMs) > 0.5;
}

LiveBlockMidi assembleLiveBlockMidi(const MidiTrackStream& stream, std::size_t& cursor, bool discontinuous,
                                    double blockStartMs, double blockEndMs, double msPerFrame, int frames,
                                    std::span<vsthost::ShmMidiEvent> out) noexcept {
    LiveBlockMidi result;
    if (discontinuous) {
        const auto it = std::lower_bound(stream.events.begin(), stream.events.end(), blockStartMs - 1e-4,
                                         [](const MidiStreamEvent& e, double t) { return e.timeMs < t; });
        cursor = static_cast<std::size_t>(std::distance(stream.events.begin(), it));
    }
    // Resets first (note-offs and clip-end resets at the block start), then the chase, then the rest.
    std::size_t chaseAt = 0;
    bool leading = true;
    while (cursor < stream.events.size() && stream.events[cursor].timeMs < blockEndMs) {
        const auto& e = stream.events[cursor++];
        if (e.timeMs < blockStartMs - 1e-4) continue;
        const int offset = std::clamp(
            static_cast<int>(std::llround((e.timeMs - blockStartMs) / msPerFrame)), 0, frames - 1);
        if (result.count < out.size()) {
            out[result.count++] = vsthost::ShmMidiEvent{offset, e.status, e.data1, e.data2, 0, e.noteId, e.value};
            if (leading && offset == 0 && sortClass(e) <= 1) {
                chaseAt = result.count;
            } else {
                leading = false;
            }
        }
        if ((e.status & 0xF0u) == 0x90u && e.data2 > 0) {
            ++result.noteOns;
        } else if ((e.status & 0xF0u) == 0x80u) {
            ++result.noteOffs;
        }
    }
    if (discontinuous) {
        // Chase: a start inside a clip hears the controllers' current values.
        std::array<MidiStreamEvent, kMaxChaseEvents> chased;
        const std::size_t room = out.size() - result.count;
        const std::size_t count = std::min(chaseLaneEvents(stream.chase, blockStartMs, chased), room);
        std::move_backward(out.begin() + static_cast<std::ptrdiff_t>(chaseAt),
                           out.begin() + static_cast<std::ptrdiff_t>(result.count),
                           out.begin() + static_cast<std::ptrdiff_t>(result.count + count));
        for (std::size_t i = 0; i < count; ++i) {
            out[chaseAt + i] = vsthost::ShmMidiEvent{0, chased[i].status, chased[i].data1, chased[i].data2,
                                                     0, vsthost::kShmNoNoteId, 0.0f};
        }
        result.count += count;
    }
    return result;
}

namespace {

// Real-time shared-memory VST3 instrument BlockProcessor.
// Thread affinity: constructed on the plan-build worker thread; process() and
// reset() run on the audio render thread with zero locks and zero allocations.
class VstLiveInstrumentProcessor final : public BlockProcessor {
public:
    VstLiveInstrumentProcessor(std::shared_ptr<VstLiveChannel> channel,
                               MidiTrackStream stream,
                               std::vector<ClipEnvelope> envelopes,
                               double gain)
        : m_channel(std::move(channel)),
          m_stream(std::move(stream)),
          m_envelopes(std::move(envelopes)),
          m_gain(static_cast<float>(gain)) {
        id = "vst-instrument";
    }

    // Control thread (prepareMixPlan): prepares the plug-in at the real device or render rate.
    void prepare(double sampleRate) override {
        if (m_channel) (void)m_channel->prepareRate(sampleRate);
    }

    void reset() noexcept override {
        BlockProcessor::reset();
        m_clock.invalidate();
        m_cursor = 0;
        m_activeNotes = 0;
        m_tailFrames = 0;
    }

    bool hasPendingOutput(int) const noexcept override {
        return m_channel && m_channel->connected() && (!m_stream.events.empty() || m_activeNotes > 0 || m_tailFrames > 0);
    }

    void process(std::span<float> stereo, const BlockContext& ctx) noexcept override {
        if (!m_channel || !m_channel->connected() || stereo.empty() || ctx.msPerFrame <= 0.0) return;
        const int frames = static_cast<int>(stereo.size() / 2);
        if (frames <= 0 || frames > kMixBlockFrames) return;

        const double blockStartMs = ctx.timelineMs;
        const double blockEndMs = blockStartMs + frames * ctx.msPerFrame;
        const bool discontinuous = m_clock.isDiscontinuous(blockStartMs);
        if (discontinuous) {
            m_activeNotes = 0;
            m_tailFrames = 0;
        }

        std::array<vsthost::ShmMidiEvent, vsthost::kShmMaxMidiEvents> blockMidi{};
        const LiveBlockMidi assembled = assembleLiveBlockMidi(m_stream, m_cursor, discontinuous, blockStartMs,
                                                              blockEndMs, ctx.msPerFrame, frames, blockMidi);
        const std::size_t midiCount = assembled.count;
        m_activeNotes += assembled.noteOns;
        if (assembled.noteOffs > 0) {
            m_activeNotes = std::max(0, m_activeNotes - assembled.noteOffs);
            m_tailFrames = static_cast<int>(ctx.sampleRate * 5.0);
        }

        const std::size_t samples = static_cast<std::size_t>(frames) * 2;
        auto scratch = std::span<float>(m_scratch.data(), samples);
        std::fill(scratch.begin(), scratch.end(), 0.0f);

        if (!m_channel->processBlock(scratch, std::span<const vsthost::ShmMidiEvent>(blockMidi.data(), midiCount),
                                     ctx.sampleRate, discontinuous, kLiveBlockTimeoutMs)) {
            // A lost block lost its reset and chase: the next block must run them again.
            m_clock.invalidate();
            return;
        }
        m_clock.advance(blockEndMs);

        if (m_activeNotes == 0 && m_tailFrames > 0) {
            m_tailFrames = std::max(0, m_tailFrames - frames);
        }

        for (int f = 0; f < frames; ++f) {
            float envGain = m_gain;
            if (!m_envelopes.empty()) {
                const double t = blockStartMs + f * ctx.msPerFrame;
                for (const auto& env : m_envelopes) {
                    if (t >= env.startMs && t < env.startMs + env.durationMs) {
                        const double fade = clipFadeGain(env.fades, env.durationMs, t - env.startMs);
                        envGain *= static_cast<float>(env.clipGain * fade);
                        break;
                    }
                }
            }
            stereo[static_cast<std::size_t>(f) * 2] += scratch[static_cast<std::size_t>(f) * 2] * envGain;
            stereo[static_cast<std::size_t>(f) * 2 + 1] += scratch[static_cast<std::size_t>(f) * 2 + 1] * envGain;
        }
    }

private:
    // Shared with VstLivePool so the live plug-in and open editor persist across plan swaps.
    std::shared_ptr<VstLiveChannel> m_channel;
    MidiTrackStream m_stream;
    std::vector<ClipEnvelope> m_envelopes;
    float m_gain = 1.0f;
    LiveBlockClock m_clock;
    std::size_t m_cursor = 0;
    int m_activeNotes = 0;
    int m_tailFrames = 0;
    std::array<float, std::size_t{kMixBlockFrames} * 2> m_scratch{};
};

// Real-time shared-memory VST3 audio effect BlockProcessor.
// Thread affinity: constructed on the plan-build worker thread; process() and
// reset() run on the audio render thread with zero locks and zero allocations.
class VstLiveEffectProcessor final : public BlockProcessor {
public:
    VstLiveEffectProcessor(std::string effectId, std::shared_ptr<VstLiveChannel> channel, double wet)
        : m_channel(std::move(channel)), m_wet(static_cast<float>(std::clamp(wet, 0.0, 1.0))) {
        id = std::move(effectId);
    }

    void prepare(double sampleRate) override {
        if (m_channel) (void)m_channel->prepareRate(sampleRate);
    }

    void reset() noexcept override {
        BlockProcessor::reset();
        m_clock.invalidate();
        m_tailFrames = 0;
    }

    bool hasPendingOutput(int) const noexcept override {
        return m_channel && m_channel->connected() && m_tailFrames > 0;
    }

    void process(std::span<float> stereo, const BlockContext& ctx) noexcept override {
        if (!m_channel || !m_channel->connected() || stereo.empty() || ctx.msPerFrame <= 0.0) return;
        const int frames = static_cast<int>(stereo.size() / 2);
        if (frames <= 0 || frames > kMixBlockFrames) return;

        const double blockStartMs = ctx.timelineMs;
        const double blockEndMs = blockStartMs + frames * ctx.msPerFrame;
        const bool discontinuous = m_clock.isDiscontinuous(blockStartMs);

        bool hasInput = false;
        for (float s : stereo) {
            if (s != 0.0f) { hasInput = true; break; }
        }
        if (hasInput) {
            m_tailFrames = static_cast<int>(ctx.sampleRate * 2.0);
        } else if (m_tailFrames <= 0 && !discontinuous) {
            m_clock.advance(blockEndMs);
            return;
        }

        const std::size_t samples = static_cast<std::size_t>(frames) * 2;
        const bool blend = m_wet < 0.9999f;
        if (blend) {
            std::copy_n(stereo.begin(), samples, m_dry.begin());
        }

        // On disconnect/timeout, processBlock leaves `stereo` untouched (clean dry passthrough).
        if (!m_channel->processBlock(stereo, {}, ctx.sampleRate, discontinuous, kLiveBlockTimeoutMs)) {
            m_clock.invalidate();
            return;
        }
        m_clock.advance(blockEndMs);

        if (!hasInput && m_tailFrames > 0) {
            m_tailFrames = std::max(0, m_tailFrames - frames);
        }

        if (blend) {
            const float dryGain = 1.0f - m_wet;
            for (std::size_t i = 0; i < samples; ++i) {
                stereo[i] = m_dry[i] * dryGain + stereo[i] * m_wet;
            }
        }
    }

private:
    // Shared with VstLivePool so the live plug-in and open editor persist across plan swaps.
    std::shared_ptr<VstLiveChannel> m_channel;
    float m_wet = 1.0f;
    LiveBlockClock m_clock;
    int m_tailFrames = 0;
    std::array<float, std::size_t{kMixBlockFrames} * 2> m_dry{};
};

bool hasEnabledVstEffect(const QJsonArray& effects) {
    for (const auto& entry : effects) {
        const QJsonObject e = entry.toObject();
        if (e.value(u"enabled").toBool(false) && e.value(u"type").toString() == u"vst" &&
            isValidVstPlugin(e.value(u"plugin").toObject())) {
            return true;
        }
    }
    return false;
}

bool timelineUsesVstInstrument(const Timeline& timeline) {
    for (const Track& track : timeline.tracks) {
        if (track.type == TrackType::Midi &&
            track.raw.value(u"instrument").toObject().value(u"type").toString() == u"vst") {
            return true;
        }
    }
    return false;
}

bool timelineUsesVstEffect(const Timeline& timeline) {
    if (hasEnabledVstEffect(timeline.raw.value(u"master").toObject().value(u"effects").toArray())) {
        return true;
    }
    for (const Track& track : timeline.tracks) {
        if (isSoundTrack(track) && hasEnabledVstEffect(track.raw.value(u"effects").toArray())) {
            return true;
        }
    }
    return false;
}

void interleaveVstEffects(const QJsonArray& effects, const QString& instancePrefix,
                          Processors& processors, VstHostClient& client, VstLivePool& pool) {
    if (!hasEnabledVstEffect(effects)) return;

    // Separate any leading instrument generator from built-in insert processors.
    Processors leading;
    std::unordered_map<std::string, std::shared_ptr<BlockProcessor>> builtInById;
    for (auto& proc : processors) {
        if (!proc) continue;
        if (proc->id == "vst-instrument" || proc->id.empty()) {
            leading.push_back(std::move(proc));
        } else {
            builtInById.emplace(proc->id, std::move(proc));
        }
    }

    Processors ordered = std::move(leading);
    for (const auto& entry : effects) {
        const QJsonObject e = entry.toObject();
        if (!e.value(u"enabled").toBool(false)) continue;
        const QString id = e.value(u"id").toString();
        const QString type = e.value(u"type").toString();
        if (type == u"vst") {
            const QJsonObject plugin = e.value(u"plugin").toObject();
            if (!isValidVstPlugin(plugin)) continue;
            const QString instance = instancePrefix + id;
            auto channel = pool.acquire(client, instance,
                                        plugin.value(u"path").toString(),
                                        plugin.value(u"uid").toString(),
                                        e.value(u"state").toString(),
                                        kVstRenderSampleRate);
            if (!channel) continue;
            const double wet = e.value(u"wet").toDouble(1.0);
            ordered.push_back(std::make_shared<VstLiveEffectProcessor>(id.toStdString(), std::move(channel), wet));
        } else {
            auto it = builtInById.find(id.toStdString());
            if (it != builtInById.end() && it->second) {
                ordered.push_back(std::move(it->second));
                builtInById.erase(it);
            }
        }
    }
    for (auto& [_, remaining] : builtInById) {
        if (remaining) ordered.push_back(std::move(remaining));
    }
    processors = std::move(ordered);
}

}  // namespace

bool writeStereoFloatWav(const QString& path, int sampleRate, std::span<const float> interleavedStereo) {
    if (sampleRate <= 0) return false;
    const std::size_t dataBytes = interleavedStereo.size() * sizeof(float);
    if (dataBytes > std::numeric_limits<std::uint32_t>::max() - 44u) return false;

    QDir().mkpath(QFileInfo(path).absolutePath());
    const QString tmp = path + QStringLiteral(".%1.tmp").arg(QUuid::createUuid().toString(QUuid::Id128));
    QFile file(tmp);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Truncate)) return false;

    char header[44]{};
    std::memcpy(header + 0, "RIFF", 4);
    writeLe32(header + 4, static_cast<std::uint32_t>(36 + dataBytes));
    std::memcpy(header + 8, "WAVE", 4);
    std::memcpy(header + 12, "fmt ", 4);
    writeLe32(header + 16, 16u);
    writeLe16(header + 20, 3u);
    writeLe16(header + 22, 2u);
    writeLe32(header + 24, static_cast<std::uint32_t>(sampleRate));
    writeLe32(header + 28, static_cast<std::uint32_t>(sampleRate * 2 * 4));
    writeLe16(header + 32, 8u);
    writeLe16(header + 34, 32u);
    std::memcpy(header + 36, "data", 4);
    writeLe32(header + 40, static_cast<std::uint32_t>(dataBytes));

    bool ok = file.write(header, 44) == 44;
    if (ok && dataBytes > 0) {
        ok = file.write(reinterpret_cast<const char*>(interleavedStereo.data()),
                        static_cast<qint64>(dataBytes)) == static_cast<qint64>(dataBytes);
    }
    ok = ok && file.flush();
    file.close();
    if (!ok) {
        QFile::remove(tmp);
        return false;
    }
    QFile::remove(path);
    if (!QFile::rename(tmp, path)) {
        QFile::remove(tmp);
        return QFileInfo::exists(path);
    }
    return true;
}

MidiTrackStream buildTrackMidiStream(const Timeline& timeline, const std::string& trackId, double bpm) {
    return buildStream(timeline, trackId, bpm, nullptr);
}

std::size_t chaseMidiEvents(const MidiTrackStream& stream, double timeMs, std::span<MidiStreamEvent> out) noexcept {
    return chaseLaneEvents(stream.chase, timeMs, out);
}

std::vector<VstNoteEvent> extractMidiNoteEvents(const QJsonObject& clipRaw, double bpm,
                                                double sampleRate, double inPointMs, double durationMs,
                                                const QJsonObject& document) {
    std::vector<VstNoteEvent> events;
    if (!std::isfinite(bpm) || bpm <= 0.0 || !std::isfinite(sampleRate) || sampleRate <= 0.0 || durationMs <= 0.0) {
        return events;
    }
    const double msPerQuarter = 60000.0 / bpm;
    const bool isPatternClip = clipRaw.value(u"pattern").isObject();
    double windowStart = std::max(0.0, inPointMs);
    QJsonArray notes;
    if (isPatternClip) {
        QJsonObject effectiveClip = clipRaw;
        effectiveClip.insert(QStringLiteral("inPointMs"), windowStart);
        effectiveClip.insert(QStringLiteral("durationMs"), durationMs);
        auto doc = document;
        auto tempo = doc.value(u"tempo").toObject();
        tempo.insert(QStringLiteral("bpm"), bpm);
        if (!tempo.contains(u"offsetMs")) tempo.insert(QStringLiteral("offsetMs"), 0.0);
        doc.insert(QStringLiteral("tempo"), tempo);
        notes = nt::midi::expandPatternClipForPlayback(effectiveClip, doc).value(u"notes").toArray();
        windowStart = 0.0;
    } else {
        auto effectiveClip = clipRaw;
        effectiveClip.insert("inPointMs", windowStart);
        effectiveClip.insert("durationMs", durationMs);
        notes = nt::midi::applyRegionParams(effectiveClip, bpm,
            document.value("tempo").toObject().value("offsetMs").toDouble()).value("notes").toArray();
    }
    const double loop = isPatternClip ? 0.0 : clipRaw.value(u"loopLengthMs").toDouble();
    const double period = std::isfinite(loop) && loop > 0 && loop < durationMs ? loop : durationMs;
    for (int k = 0; k * period < durationMs; ++k) {
        const double offset = k * period;
        const double length = std::min(period, durationMs - offset);
        const double windowEnd = windowStart + length;
        for (const auto& entry : notes) {
            if (!entry.isObject()) continue;
            const QJsonObject n = entry.toObject();
            if (n.value(u"muted").toBool(false)) continue;
            const double startTick = n.value(u"startTick").toDouble(-1.0);
            const double durationTick = n.value(u"durationTick").toDouble(0.0);
            if (!std::isfinite(startTick) || startTick < 0.0 || !std::isfinite(durationTick) || durationTick <= 0.0) {
                continue;
            }
            const double noteStartMs = (startTick / kMidiPpq) * msPerQuarter;
            if (noteStartMs < windowStart || noteStartMs >= windowEnd) continue;
            const double noteEndMs = noteStartMs + (durationTick / kMidiPpq) * msPerQuarter;
            const double relStartMs = offset + noteStartMs - windowStart;
            const double relEndMs = std::max(relStartMs, std::min(offset + length, offset + noteEndMs - windowStart));
            const auto startFrame = std::max<std::int64_t>(0, std::llround(relStartMs * sampleRate / 1000.0));
            const auto gateOffFrame = std::max<std::int64_t>(startFrame + 1, std::llround(relEndMs * sampleRate / 1000.0));
            const int pitch = std::clamp(n.value(u"pitch").toInt(60), 0, 127);
            const int velocity = std::clamp(n.value(u"velocity").toInt(100), 1, 127);
            events.push_back(VstNoteEvent{pitch, velocity, startFrame, gateOffFrame});
        }
    }
    std::sort(events.begin(), events.end(), [](const VstNoteEvent& a, const VstNoteEvent& b) {
        return a.startFrame != b.startFrame ? a.startFrame < b.startFrame : a.pitch < b.pitch;
    });
    return events;
}

void runVstInstrumentsStage(const Timeline& timeline, MixPlan& plan, VstHostClient& client, VstLivePool& pool) {
    if (!client.available()) return;

    const bool soloed = hasSoloedSoundTrack(timeline);
    const double bpm = resolveBpm(timeline);

    std::unordered_map<std::string, std::size_t> trackBusIndex;
    for (std::size_t i = 0; i < plan.tracks.size(); ++i) {
        trackBusIndex.emplace(plan.tracks[i].trackId, i);
    }

    for (const Track& track : timeline.tracks) {
        if (track.type != TrackType::Midi || track.muted || (soloed && !track.solo)) continue;
        const QJsonObject inst = track.raw.value(u"instrument").toObject();
        if (inst.value(u"type").toString() != u"vst") continue;
        const QJsonObject plugin = inst.value(u"plugin").toObject();
        if (!isValidVstPlugin(plugin)) continue;

        std::vector<ClipEnvelope> envelopes;
        auto stream = buildStream(timeline, track.id, bpm, &envelopes);
        const QString instance = QStringLiteral("inst:") + QString::fromStdString(track.id);
        auto channel = pool.acquire(client, instance,
                                    plugin.value(u"path").toString(),
                                    plugin.value(u"uid").toString(),
                                    inst.value(u"state").toString(),
                                    kVstRenderSampleRate);
        if (!channel) continue;

        auto [it, inserted] = trackBusIndex.try_emplace(track.id, plan.tracks.size());
        if (inserted) {
            TrackPlan bus;
            bus.trackId = track.id;
            bus.gain = dbToGain(track.volumeDb);
            bus.pan = std::clamp(track.pan, -1.0, 1.0);
            plan.tracks.push_back(std::move(bus));
        }

        const double gain = dbToGain(inst.value(u"gainDb").toDouble(0.0));
        auto processor = std::make_shared<VstLiveInstrumentProcessor>(
            std::move(channel), std::move(stream), std::move(envelopes), gain);
        auto& procs = plan.tracks[it->second].processors;
        procs.insert(procs.begin(), std::move(processor));
    }
}

void runVstEffectsStage(const Timeline& timeline, MixPlan& plan, VstHostClient& client, VstLivePool& pool) {
    if (!client.available()) return;

    for (auto& bus : plan.tracks) {
        const Track* track = timeline.findTrack(bus.trackId);
        if (!track || !isSoundTrack(*track)) continue;
        const QString prefix = QStringLiteral("fx:") + QString::fromStdString(track->id) + QChar(':');
        interleaveVstEffects(track->raw.value(u"effects").toArray(), prefix, bus.processors, client, pool);
    }

    const QJsonArray masterEffects = timeline.raw.value(u"master").toObject().value(u"effects").toArray();
    interleaveVstEffects(masterEffects, QStringLiteral("master-fx:"), plan.processors, client, pool);
}

void registerVstAudioStages(std::shared_ptr<VstHostClient> client) {
    static std::mutex mutex;
    static bool registered = false;
    std::lock_guard<std::mutex> lock(mutex);
    if (registered) return;
    registered = true;
    // Resolve sharedVstHostClient() lazily only when a document actually uses a
    // VST instrument or effect, so non-VST timelines never start a worker thread.
    registerMixPlanStage(
        "vstInstruments",
        [client](const Timeline& tl, MixPlan& plan) {
            if (!timelineUsesVstInstrument(tl)) return;
            auto active = client ? client : sharedVstHostClient();
            runVstInstrumentsStage(tl, plan, *active, sharedVstLivePool());
        },
        -10);
    registerMixPlanStage(
        "vstEffects",
        [client](const Timeline& tl, MixPlan& plan) {
            if (!timelineUsesVstEffect(tl)) return;
            auto active = client ? client : sharedVstHostClient();
            runVstEffectsStage(tl, plan, *active, sharedVstLivePool());
        },
        50);
}

}  // namespace nt::audio::vst
