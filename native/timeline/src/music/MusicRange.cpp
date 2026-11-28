#include "music/MusicRange.h"

#include <algorithm>
#include <cmath>
#include <exception>

namespace nt::music {
namespace {
bool readable(const MusicTempo& tempo) {
    try {
        assertMusicTempo(tempo);
        return true;
    } catch (const std::exception&) {
        return false;
    }
}

std::int64_t beatsInBar(const MusicTempo& tempo) { return static_cast<std::int64_t>(tempo.beatsPerBar); }

// The beat counted from 1 at offsetMs that holds the frame.
std::int64_t beatAtFrame(std::int64_t frame, const MusicTempo& tempo) {
    const double beatSeconds = (4 / tempo.beatUnit) * 60 / tempo.bpm;
    auto beat = static_cast<std::int64_t>(
        std::floor((static_cast<double>(frame) / static_cast<double>(kSampleRate) - tempo.offsetMs / 1000) / beatSeconds)) + 1;
    while (beatStartFrame(beat + 1, tempo) <= frame) {
        ++beat;
    }
    while (beatStartFrame(beat, tempo) > frame) {
        --beat;
    }
    return beat;
}

std::int64_t lineFrame(std::int64_t line, const MusicTempo& tempo, GridDivision division) {
    return division == GridDivision::Bar ? barStartFrame(line, tempo) : beatStartFrame(line, tempo);
}

bool onBarLine(std::int64_t frame, const MusicTempo& tempo) { return barStartFrame(barAtFrame(frame, tempo), tempo) == frame; }
bool onBeatLine(std::int64_t frame, const MusicTempo& tempo) { return beatStartFrame(beatAtFrame(frame, tempo), tempo) == frame; }
} // namespace

GridDivision rangeDivision(std::string_view rulerDivision) {
    return rulerDivision == "bar" ? GridDivision::Bar : GridDivision::Beat;
}

std::optional<MusicTempo> sequenceTempo(const QJsonObject& rawSequence) {
    const auto raw = rawSequence.value(u"tempo");
    const MusicTempo tempo = raw.isObject() ? tempoFromJson(raw.toObject()) : MusicTempo{};
    return readable(tempo) ? std::optional<MusicTempo>(tempo) : std::nullopt;
}

std::int64_t laneFrame(double ms) {
    return std::isfinite(ms) ? std::max<std::int64_t>(0, msToFrame(ms)) : 0;
}

std::int64_t rangeEdge(std::int64_t frame, const MusicTempo& tempo, GridDivision division, bool free) {
    const auto at = std::max<std::int64_t>(0, frame);
    return free ? at : snapFrameToGrid(at, tempo, division);
}

FrameRange rangeBetween(std::int64_t anchor, std::int64_t pointerFrame, const MusicTempo& tempo, GridDivision division,
                        bool freePointer) {
    std::int64_t edge = rangeEdge(pointerFrame, tempo, division, freePointer);
    if (!freePointer && edge == anchor && pointerFrame != anchor) {
        // gridLineAtOrAfter and gridLineAtOrBefore count lines; lineFrame turns one into its frame.
        if (pointerFrame > anchor) {
            edge = lineFrame(gridLineAtOrAfter(anchor + 1, tempo, division), tempo, division);
        } else if (anchor > 0) {
            edge = std::max<std::int64_t>(0, lineFrame(gridLineAtOrBefore(anchor - 1, tempo, division), tempo, division));
        }
    }
    return {std::min(anchor, edge), std::max(anchor, edge)};
}

std::int64_t barAtFrame(std::int64_t frame, const MusicTempo& tempo) {
    const double barSeconds = tempo.beatsPerBar * (4 / tempo.beatUnit) * 60 / tempo.bpm;
    auto bar = static_cast<std::int64_t>(
        std::floor((static_cast<double>(frame) / static_cast<double>(kSampleRate) - tempo.offsetMs / 1000) / barSeconds)) + 1;
    while (barStartFrame(bar + 1, tempo) <= frame) {
        ++bar;
    }
    while (barStartFrame(bar, tempo) > frame) {
        --bar;
    }
    return bar;
}

QString barPositionLabel(std::int64_t frame, const MusicTempo& tempo) {
    const auto bar = barAtFrame(frame, tempo);
    if (barStartFrame(bar, tempo) == frame) {
        return QString::number(bar);
    }
    const auto beat = beatAtFrame(frame, tempo) - (bar - 1) * beatsInBar(tempo);
    return QStringLiteral("%1.%2").arg(bar).arg(std::clamp<std::int64_t>(beat, 1, beatsInBar(tempo)));
}

QString barBeatTickLabel(std::int64_t frame, const MusicTempo& tempo) {
    const auto first = barStartFrame(1, tempo);
    if (frame <= first) {
        return QStringLiteral("1.1.1");
    }
    const auto bar = barAtFrame(frame, tempo);
    const auto beat = beatAtFrame(frame, tempo);
    const auto beatStart = beatStartFrame(beat, tempo);
    const auto beatLength = std::max<std::int64_t>(1, beatStartFrame(beat + 1, tempo) - beatStart);
    const auto tick = std::clamp<std::int64_t>((frame - beatStart) * 4 / beatLength, 0, 3) + 1;
    const auto beatInBar = std::clamp<std::int64_t>(beat - (bar - 1) * beatsInBar(tempo), 1, beatsInBar(tempo));
    return QStringLiteral("%1.%2.%3").arg(bar).arg(beatInBar).arg(tick);
}

QString barRangeLabel(const FrameRange& range, const MusicTempo& tempo) {
    const auto first = barAtFrame(range.startFrame, tempo);
    const auto last = barAtFrame(std::max(range.startFrame, range.endFrame - 1), tempo);
    return first == last ? QStringLiteral("Bar %1").arg(first) : QStringLiteral("Bars %1–%2").arg(first).arg(last);
}

QString rangeLengthLabel(const FrameRange& range, const MusicTempo& tempo) {
    if (onBarLine(range.startFrame, tempo) && onBarLine(range.endFrame, tempo)) {
        const auto bars = barAtFrame(range.endFrame, tempo) - barAtFrame(range.startFrame, tempo);
        return bars == 1 ? QStringLiteral("1 bar") : QStringLiteral("%1 bars").arg(bars);
    }
    if (onBeatLine(range.startFrame, tempo) && onBeatLine(range.endFrame, tempo)) {
        const auto beats = beatAtFrame(range.endFrame, tempo) - beatAtFrame(range.startFrame, tempo);
        return beats == 1 ? QStringLiteral("1 beat") : QStringLiteral("%1 beats").arg(beats);
    }
    const double seconds = static_cast<double>(range.endFrame - range.startFrame) / static_cast<double>(kSampleRate);
    return QStringLiteral("%1 s").arg(seconds, 0, 'f', 2);
}

} // namespace nt::music
