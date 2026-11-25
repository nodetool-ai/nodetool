#include "midi/PianoRollController.h"

#include "app/EditRegistry.h"
#include "midi/MidiNotes.h"
#include "model/TimelineModel.h"
#include "ui/Tempo/TempoGrid.h"
#include "ui/Tempo/TempoJson.h"

#include <QJsonArray>
#include <QUuid>

#include <cmath>

namespace {
const bool setNotesRegistered = nt::app::registerEdit("midi.setNotes", nt::midi::setClipNotes);
const bool setControllersRegistered = nt::app::registerEdit("midi.setControllers", nt::midi::setClipControllers);
const bool setEventsRegistered = nt::app::registerEdit("midi.setEvents", nt::midi::setClipEvents);
}  // namespace

void PianoRollController::setTimeline(TimelineModel* timeline) {
    if (m_timeline == timeline) {
        return;
    }
    if (m_timeline) {
        disconnect(m_timeline, nullptr, this, nullptr);
    }
    m_timeline = timeline;
    if (m_timeline) {
        connect(m_timeline, &TimelineModel::clipsChanged, this, &PianoRollController::reload);
        connect(m_timeline, &TimelineModel::timelineChanged, this, &PianoRollController::reload);
        connect(m_timeline, &TimelineModel::readOnlyChanged, this, &PianoRollController::clipChanged);
    }
    emit timelineChanged();
    reload();
}

void PianoRollController::setClipId(const QString& clipId) {
    if (m_clipId == clipId) {
        return;
    }
    m_clipId = clipId;
    emit clipIdChanged();
    reload();
}

bool PianoRollController::editable() const {
    return m_valid && !m_locked && m_timeline && !m_timeline->readOnly();
}

int PianoRollController::maxNotes() const { return nt::midi::MAX_NOTES_PER_CLIP; }

void PianoRollController::reload() {
    const nt::Clip* clip = m_timeline && !m_clipId.isEmpty() ? m_timeline->findClip(m_clipId) : nullptr;
    const auto raw = clip ? clip->raw : QJsonObject{};
    m_valid = clip && raw.value(u"mediaType").toString() == u"midi";
    m_regionParams.clear();
    for (const auto* key : {"transpose", "velocityOffset", "quantize"}) {
        if (raw.contains(QLatin1String(key))) { m_regionParams.insert(QLatin1String(key), raw.value(QLatin1String(key)).toVariant()); }
    }
    m_clipName = raw.value(u"name").toString();
    m_notes = raw.value(u"notes").toArray().toVariantList();
    m_controllers = raw.value(u"controllers").toArray().toVariantList();
    m_startMs = raw.value(u"startMs").toDouble();
    m_inPointMs = raw.value(u"inPointMs").toDouble();
    m_durationMs = raw.value(u"durationMs").toDouble();
    m_locked = raw.value(u"locked").toBool();
    m_clipColor = raw.value(u"labelColor").toString(raw.value(u"color").toString());
    m_trackColor.clear();
    m_trackName.clear();
    m_keyTonic.clear();
    if (m_valid) {
        const auto trackId = raw.value(u"trackId").toString();
        for (const auto& track : m_timeline->timeline().raw.value(u"tracks").toArray()) {
            if (track.toObject().value(u"id").toString() == trackId) {
                m_locked = m_locked || track.toObject().value(u"locked").toBool();
                m_trackName = track.toObject().value(u"name").toString();
                m_trackColor = track.toObject().value(u"color").toString();
            }
        }
        m_keyTonic = m_timeline->timeline().raw.value(u"tempo").toObject().value(u"key").toObject().value(u"tonic").toString();
    }
    const auto tempo = nt::tempo::json::tempo(
        nt::tempo::json::resolveTempo(m_timeline ? m_timeline->timeline().raw : QJsonObject{}));
    m_bpm = std::isfinite(tempo.bpm) && tempo.bpm > 0 ? tempo.bpm : 120;
    m_offsetMs = std::isfinite(tempo.offsetMs) ? tempo.offsetMs : 0;
    m_beatsPerBar = std::isfinite(tempo.beatsPerBar) && tempo.beatsPerBar > 0 ? tempo.beatsPerBar : 4;
    m_beatUnit = std::isfinite(tempo.beatUnit) && tempo.beatUnit > 0 ? tempo.beatUnit : 4;
    emit clipChanged();
}

double PianoRollController::msToTicks(double ms) const { return ms * m_bpm * nt::tempo::MIDI_PPQ / 60000.0; }

double PianoRollController::tickToTimelineMs(double tick) const {
    return m_startMs + nt::tempo::ticksToMs(tick, m_bpm) - m_inPointMs;
}

double PianoRollController::timelineMsToTick(double ms) const { return msToTicks(ms - m_startMs + m_inPointMs); }

double PianoRollController::gridStepTicks(const QString& division) const {
    const nt::tempo::Tempo tempo{m_bpm, m_offsetMs, m_beatsPerBar, m_beatUnit};
    if (division == u"bar") {
        return msToTicks(nt::tempo::barDurationMs(tempo));
    }
    if (division == u"beat") {
        return msToTicks(nt::tempo::beatDurationMs(tempo));
    }
    return nt::tempo::divisionToTicks(division.toStdString());
}

QVariantList PianoRollController::gridTicks(const QString& division, double fromTick, double toTick) const {
    nt::tempo::GridSpec spec;
    spec.tempo = {m_bpm, m_offsetMs, m_beatsPerBar, m_beatUnit};
    spec.division = division.toStdString();
    spec.fromMs = std::max(0.0, tickToTimelineMs(fromTick));
    spec.toMs = tickToTimelineMs(toTick);
    QVariantList result;
    if (!(spec.toMs > spec.fromMs)) {
        return result;
    }
    for (const double ms : nt::tempo::visibleTempoGrid(spec)) {
        result.append(timelineMsToTick(ms));
    }
    return result;
}

bool PianoRollController::setNotes(const QVariantList& notes) {
    if (!editable()) {
        return false;
    }
    return m_timeline->applyEdit(QStringLiteral("midi.setNotes"),
                                 QJsonObject{{"clipId", m_clipId}, {"notes", QJsonArray::fromVariantList(notes)}}) != 0;
}

bool PianoRollController::setControllers(const QVariantList& controllers) {
    if (!editable()) {
        return false;
    }
    return m_timeline->applyEdit(QStringLiteral("midi.setControllers"),
                                 QJsonObject{{"clipId", m_clipId},
                                             {"controllers", QJsonArray::fromVariantList(controllers)}}) != 0;
}

bool PianoRollController::setEvents(const QVariantList& notes, const QVariantList& controllers) {
    if (!editable()) {
        return false;
    }
    return m_timeline->applyEdit(QStringLiteral("midi.setEvents"),
                                 QJsonObject{{"clipId", m_clipId}, {"notes", QJsonArray::fromVariantList(notes)},
                                             {"controllers", QJsonArray::fromVariantList(controllers)}}) != 0;
}

QString PianoRollController::newNoteId() const { return QUuid::createUuid().toString(QUuid::Id128); }
