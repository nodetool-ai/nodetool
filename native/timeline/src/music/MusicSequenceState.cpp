#include "music/MusicSequenceState.h"

#include "music/MusicDocument.h"
#include "music/MusicPlan.h"
#include "music/MusicRange.h"

#include <QJsonArray>

#include <algorithm>
#include <cmath>

MusicSequenceState::MusicSequenceState(QObject* parent) : QObject(parent) {}

void MusicSequenceState::setTimeline(TimelineModel* timeline) {
    if (m_timeline == timeline) {
        return;
    }
    if (m_timeline) {
        disconnect(m_timeline, nullptr, this, nullptr);
    }
    m_timeline = timeline;
    if (timeline) {
        connect(timeline, &TimelineModel::timelineChanged, this, &MusicSequenceState::refresh);
        connect(timeline, &TimelineModel::documentReplaced, this, [this] {
            refresh();
            ++m_openedDocuments;
            emit documentOpened();
        });
    }
    refresh();
    emit timelineChanged();
}

void MusicSequenceState::refresh() {
    const QJsonObject raw = m_timeline ? m_timeline->timeline().raw : QJsonObject{};
    bool video = false;
    for (const auto& track : raw.value(u"tracks").toArray()) {
        video = video || track.toObject().value(u"type").toString() == u"video";
    }
    QString tempoText;
    QString tempoChip;
    QString keyText;
    double bpm = 0;
    double beatsPerBar = 0;
    double beatUnit = 0;
    QString timeSignature;
    if (const auto tempo = nt::music::sequenceTempo(raw)) {
        tempoText = QStringLiteral("%1 BPM · %2/%3").arg(tempo->bpm).arg(tempo->beatsPerBar).arg(tempo->beatUnit);
        tempoChip = QStringLiteral("%1 BPM %2/%3").arg(tempo->bpm).arg(tempo->beatsPerBar).arg(tempo->beatUnit);
        bpm = tempo->bpm;
        beatsPerBar = tempo->beatsPerBar;
        beatUnit = tempo->beatUnit;
        timeSignature = QStringLiteral("%1/%2").arg(tempo->beatsPerBar).arg(tempo->beatUnit);
        if (const auto key = nt::music::tempoKey(raw)) {
            keyText = QStringLiteral("%1 %2").arg(QString::fromStdString(key->tonic), QString::fromStdString(key->mode));
            tempoText += QStringLiteral(" · ") + keyText;
        }
    }
    const bool locked = nt::music::isTempoLocked(raw);
    const bool music = nt::music::isMusicSequence(raw);
    const auto prompts = nt::music::promptHistory(raw);
    if (music == m_isMusic && video == m_hasVideoTrack && tempoText == m_tempoText && prompts == m_promptHistory &&
        tempoChip == m_tempoChip && keyText == m_keyText && locked == m_tempoLocked && bpm == m_bpm &&
        beatsPerBar == m_beatsPerBar && beatUnit == m_beatUnit && timeSignature == m_timeSignature) {
        return;
    }
    m_tempoChip = tempoChip;
    m_keyText = keyText;
    m_bpm = bpm;
    m_beatsPerBar = beatsPerBar;
    m_beatUnit = beatUnit;
    m_timeSignature = timeSignature;
    m_tempoLocked = locked;
    m_isMusic = music;
    m_hasVideoTrack = video;
    m_tempoText = tempoText;
    m_promptHistory = prompts;
    emit changed();
}

QString MusicSequenceState::barLabel(double frame) const {
    const auto tempo = m_timeline ? nt::music::sequenceTempo(m_timeline->timeline().raw) : std::nullopt;
    if (!tempo || !std::isfinite(frame)) {
        return {};
    }
    return nt::music::barPositionLabel(std::llround(frame), *tempo);
}

QString MusicSequenceState::positionLabel(double ms) const {
    const auto tempo = m_timeline ? nt::music::sequenceTempo(m_timeline->timeline().raw) : std::nullopt;
    if (!tempo || !std::isfinite(ms)) {
        return {};
    }
    return nt::music::barBeatTickLabel(nt::music::laneFrame(ms), *tempo);
}

double MusicSequenceState::adjacentBarMs(double ms, int direction) const {
    const auto tempo = m_timeline ? nt::music::sequenceTempo(m_timeline->timeline().raw) : std::nullopt;
    if (!tempo || !std::isfinite(ms) || direction == 0) {
        return ms;
    }
    const auto frame = nt::music::msToFrame(ms);
    // The bar that holds the frame, then step by whole bars from the line of that bar. Lines
    // come from their number each time (MD8), so a bar is never found by adding lengths.
    const double barFrames = static_cast<double>(nt::music::barStartFrame(2, *tempo) - nt::music::barStartFrame(1, *tempo));
    std::int64_t bar = barFrames > 0 ? static_cast<std::int64_t>(std::floor(
                                            static_cast<double>(frame - nt::music::barStartFrame(1, *tempo)) / barFrames)) + 1
                                     : 1;
    // Settle rounding at the edges: bar is the last whose line is at or before the frame.
    while (nt::music::barStartFrame(bar + 1, *tempo) <= frame) ++bar;
    while (bar > 1 && nt::music::barStartFrame(bar, *tempo) > frame) --bar;
    if (nt::music::barStartFrame(bar, *tempo) > frame) {
        // Before bar 1, which starts at the tempo offset.
        return direction < 0 ? 0.0 : nt::music::frameToMs(nt::music::barStartFrame(1, *tempo));
    }
    if (direction < 0) {
        const bool onLine = nt::music::barStartFrame(bar, *tempo) == frame;
        const std::int64_t target = onLine ? bar - 1 : bar;
        return target < 1 ? 0.0 : std::max(0.0, nt::music::frameToMs(nt::music::barStartFrame(target, *tempo)));
    }
    return nt::music::frameToMs(nt::music::barStartFrame(bar + 1, *tempo));
}

double MusicSequenceState::snapMs(double ms, const QString& rulerDivision) const {
    const auto tempo = m_timeline ? nt::music::sequenceTempo(m_timeline->timeline().raw) : std::nullopt;
    if (!tempo || !std::isfinite(ms)) {
        return ms;
    }
    const auto division = nt::music::rangeDivision(rulerDivision.toStdString());
    return nt::music::frameToMs(nt::music::snapFrameToGrid(nt::music::laneFrame(ms), *tempo, division));
}
