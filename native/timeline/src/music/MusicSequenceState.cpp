#include "music/MusicSequenceState.h"

#include "music/MusicDocument.h"
#include "music/MusicPlan.h"
#include "music/MusicRange.h"

#include <QJsonArray>

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
    if (const auto tempo = nt::music::sequenceTempo(raw)) {
        tempoText = QStringLiteral("%1 BPM · %2/%3").arg(tempo->bpm).arg(tempo->beatsPerBar).arg(tempo->beatUnit);
        tempoChip = QStringLiteral("%1 BPM %2/%3").arg(tempo->bpm).arg(tempo->beatsPerBar).arg(tempo->beatUnit);
        if (const auto key = nt::music::tempoKey(raw)) {
            keyText = QStringLiteral("%1 %2").arg(QString::fromStdString(key->tonic), QString::fromStdString(key->mode));
            tempoText += QStringLiteral(" · ") + keyText;
        }
    }
    const bool locked = nt::music::isTempoLocked(raw);
    const bool music = nt::music::isMusicSequence(raw);
    const auto prompts = nt::music::promptHistory(raw);
    if (music == m_isMusic && video == m_hasVideoTrack && tempoText == m_tempoText && prompts == m_promptHistory &&
        tempoChip == m_tempoChip && keyText == m_keyText && locked == m_tempoLocked) {
        return;
    }
    m_tempoChip = tempoChip;
    m_keyText = keyText;
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
