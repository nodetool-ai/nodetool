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
// Match Math.round at the QML gesture boundary, including negative half steps.
double roundGestureValue(double value) noexcept {
    const double lower = std::floor(value);
    return value - lower < 0.5 ? lower : lower + 1;
}

bool registerNotePatches() noexcept {
    for (const auto* key : {"midi.moveNotes", "midi.resizeNotes", "midi.setNoteVelocities", "midi.addNotes", "midi.removeNotes", "midi.patchNotes"}) {
        const QString name(key);
        nt::app::registerEdit(name, nt::app::RegisteredTypedEdit{
            [name](QJsonObject raw, const QJsonObject& payload) { return nt::midi::patchClipNotes(name, std::move(raw), payload); },
            [name](const nt::Timeline& before, const QJsonObject& payload) { return nt::midi::patchTypedNotes(name, before, payload); }});
    }
    return true;
}
const bool patchesRegistered = registerNotePatches();
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
    cancelNoteDrag();
    m_timeline = timeline;
    m_reloadInputs = {};
    if (m_timeline) {
        connect(m_timeline, &TimelineModel::changed, this, [this](const ChangeSet& changes) {
            const auto* clip = m_timeline->findClip(m_clipId);
            if (changes.clipChanged(m_clipId) || (clip && changes.trackChanged(QString::fromStdString(clip->trackId))) ||
                changes.documentFields.contains("tempo")) { cancelNoteDrag(); reload(); }
        });
        connect(m_timeline, &TimelineModel::readOnlyChanged, this, [this] { cancelNoteDrag(); emit clipChanged(); });
    }
    emit timelineChanged();
    reload();
}

void PianoRollController::setClipId(const QString& clipId) {
    if (m_clipId == clipId) {
        return;
    }
    cancelNoteDrag();
    m_clipId = clipId;
    m_reloadInputs = {};
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
    const auto document = m_timeline ? m_timeline->timeline().raw : QJsonObject{};
    QJsonObject trackData;
    if (clip) {
        for (const auto& entry : document.value(u"tracks").toArray()) {
            const auto track = entry.toObject();
            if (track.value(u"id") == raw.value(u"trackId")) {
                trackData = QJsonObject{{"name", track.value(u"name")}, {"color", track.value(u"color")},
                                        {"locked", track.value(u"locked")}};
                break;
            }
        }
    }
    const QJsonObject inputs{{"clip", raw}, {"track", trackData},
                             {"tempo", nt::tempo::json::resolveTempo(document)}};
    if (inputs == m_reloadInputs) {
        return;
    }
    auto previousMetadata = m_reloadInputs.value("clip").toObject();
    auto metadata = raw;
    previousMetadata.remove("notes"); previousMetadata.remove("controllers");
    metadata.remove("notes"); metadata.remove("controllers");
    const bool metadataDiffer = previousMetadata != metadata ||
        inputs.value("track") != m_reloadInputs.value("track") || inputs.value("tempo") != m_reloadInputs.value("tempo");
    m_reloadInputs = inputs;
    const auto noteData = raw.value(u"notes").toArray();
    const auto controllerData = raw.value(u"controllers").toArray();
    const bool notesDiffer = noteData != m_noteData;
    const bool controllersDiffer = controllerData != m_controllerData;
    m_valid = clip && raw.value(u"mediaType").toString() == u"midi";
    m_regionParams.clear();
    for (const auto* key : {"transpose", "velocityOffset", "quantize"}) {
        if (raw.contains(QLatin1String(key))) { m_regionParams.insert(QLatin1String(key), raw.value(QLatin1String(key)).toVariant()); }
    }
    m_clipName = raw.value(u"name").toString();
    QStringList patchedIds;
    bool incrementalNotes = notesDiffer && noteData.size() == m_noteData.size();
    if (incrementalNotes) {
        for (qsizetype i = 0; i < noteData.size(); ++i) {
            if (noteData.at(i) == m_noteData.at(i)) { continue; }
            auto old = m_noteData.at(i).toObject();
            auto next = noteData.at(i).toObject();
            const auto id = next.value("id").toString();
            if (id.isEmpty() || old.value("id") != id) { incrementalNotes = false; break; }
            for (const auto* field : {"pitch", "velocity", "startTick", "durationTick"}) { old.remove(field); next.remove(field); }
            if (old != next) { incrementalNotes = false; break; }
            patchedIds.append(id);
        }
    }
    if (notesDiffer) {
        m_noteData = noteData;
        m_notesValid = false;
        if (!incrementalNotes) {
            m_noteIndex.clear();
            for (qsizetype i = 0; i < noteData.size(); ++i) {
                m_noteIndex.insert(noteData.at(i).toObject().value("id").toString(), static_cast<std::size_t>(i));
            }
        }
    }
    if (controllersDiffer) {
        m_controllerData = controllerData;
        m_controllers = controllerData.toVariantList();
    }
    m_startMs = raw.value(u"startMs").toDouble();
    m_inPointMs = raw.value(u"inPointMs").toDouble();
    m_durationMs = raw.value(u"durationMs").toDouble();
    m_locked = raw.value(u"locked").toBool();
    m_clipColor = raw.value(u"labelColor").toString(raw.value(u"color").toString());
    m_trackColor.clear();
    m_trackName.clear();
    m_keyTonic.clear();
    if (m_valid) {
        m_locked = m_locked || trackData.value(u"locked").toBool();
        m_trackName = trackData.value(u"name").toString();
        m_trackColor = trackData.value(u"color").toString();
        m_keyTonic = m_timeline->timeline().raw.value(u"tempo").toObject().value(u"key").toObject().value(u"tonic").toString();
    }
    const auto tempo = nt::tempo::json::tempo(
        nt::tempo::json::resolveTempo(m_timeline ? m_timeline->timeline().raw : QJsonObject{}));
    m_bpm = std::isfinite(tempo.bpm) && tempo.bpm > 0 ? tempo.bpm : 120;
    m_offsetMs = std::isfinite(tempo.offsetMs) ? tempo.offsetMs : 0;
    m_beatsPerBar = std::isfinite(tempo.beatsPerBar) && tempo.beatsPerBar > 0 ? tempo.beatsPerBar : 4;
    m_beatUnit = std::isfinite(tempo.beatUnit) && tempo.beatUnit > 0 ? tempo.beatUnit : 4;
    if (notesDiffer) {
        if (m_timeline) {
            const TimelineModel::Measurement measurement(*m_timeline, "note_notifications");
            if (incrementalNotes) { emit notesPatched(patchedIds); }
            else { emit notesReset(); }
            emit notesChanged();
        } else { emit notesReset(); emit notesChanged(); }
    }
    if (controllersDiffer) {
        emit controllersChanged();
    }
    if (metadataDiffer) { emit clipChanged(); }
}

QVariantList PianoRollController::notes() const {
    if (!m_notesValid) {
        if (m_timeline) {
            const TimelineModel::Measurement measurement(*m_timeline, "note_codec");
            m_timeline->crossing("PianoRoll.reloadNotes", [this] { return m_noteData; });
            m_notes = m_noteData.toVariantList();
        } else { m_notes = m_noteData.toVariantList(); }
        m_notesValid = true;
    }
    return m_notes;
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
    const auto jsonNotes = QJsonArray::fromVariantList(notes);
    m_timeline->crossing("PianoRoll.setNotes", [&jsonNotes] { return jsonNotes; });
    return m_timeline->applyEdit(QStringLiteral("midi.setNotes"),
                                 QJsonObject{{"clipId", m_clipId}, {"notes", jsonNotes}}) != 0;
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


bool PianoRollController::beginNoteDrag(const QStringList& ids, const QString& kind) {
    cancelNoteDrag();
    if (!editable() || (kind != "move" && kind != "resize" && kind != "velocity" && kind != "duplicate")) { return false; }
    const QSet<QString> selected(ids.begin(), ids.end());
    const auto* clip = m_timeline->findClip(m_clipId);
    if (!clip || !clip->notes) { return false; }
    for (std::size_t i = 0; i < clip->notes->size(); ++i) {
        const auto& note = (*clip->notes)[i];
        if (selected.contains(note.id)) {
            m_dragNotes.push_back({note.id, static_cast<int>(i), note.startTick,
                note.durationTick, note.pitch, note.velocity});
        }
    }
    if (m_dragNotes.empty() || m_dragNotes.size() != static_cast<std::size_t>(selected.size())) { m_dragNotes.clear(); return false; }
    if (kind == "duplicate") {
        if (clip->notes->size() + m_dragNotes.size() > static_cast<std::size_t>(maxNotes())) { m_dragNotes.clear(); return false; }
        for (auto& note : m_dragNotes) { note.id = newNoteId(); }
    }
    for (std::size_t i = 0; i < m_dragNotes.size(); ++i) { m_dragIndex.insert(m_dragNotes[i].id, i); }
    m_dragKind = kind;
    emit noteDragChanged();
    return true;
}

void PianoRollController::updateNoteDrag(double ticks, double pitch, double minimum, const QList<int>& rows, const QList<int>& scale) {
    if (!noteDragActive() || !std::isfinite(ticks) || !std::isfinite(pitch) || !std::isfinite(minimum)) { return; }
    m_dragRows = rows;
    m_dragScale = scale;
    m_dragTicks = roundGestureValue(ticks);
    m_dragPitch = std::clamp(roundGestureValue(pitch), -127.0, 127.0);
    m_dragMinimum = std::max(1.0, roundGestureValue(minimum));
    if (m_dragKind == "velocity") {
        for (const auto& note : m_dragNotes) {
            m_dragTicks = std::clamp(m_dragTicks, 1.0 - note.velocity, 127.0 - note.velocity);
        }
    }
    if (m_dragKind == "move" || m_dragKind == "duplicate") {
        for (const auto& note : m_dragNotes) {
            m_dragTicks = std::max(m_dragTicks, -note.start);
            if (rows.isEmpty()) { m_dragPitch = std::clamp(m_dragPitch, -static_cast<double>(note.pitch), 127.0 - note.pitch); }
            else {
                const auto row = rows.indexOf(note.pitch);
                if (row >= 0) { m_dragPitch = std::clamp(m_dragPitch, -static_cast<double>(row), static_cast<double>(rows.size() - 1 - row)); }
            }
        }
    }
    emit noteDragChanged();
}

QJsonArray PianoRollController::dragPatch() const {
    QJsonArray patch;
    for (const auto& note : m_dragNotes) {
        const auto preview = previewNote(note.id);
        QJsonObject value = m_dragKind == "duplicate" ? m_noteData.at(note.row).toObject() : QJsonObject{};
        value.insert("id", note.id);
        if (m_dragKind == "move" || m_dragKind == "duplicate") {
            value.insert("startTick", note.start + m_dragTicks);
            value.insert("pitch", preview.pitch);
        } else if (m_dragKind == "resize") {
            value.insert("durationTick", std::max(m_dragMinimum, note.duration + m_dragTicks));
        } else if (m_dragKind == "velocity") {
            value.insert("velocity", std::clamp(note.velocity + m_dragTicks, 1.0, 127.0));
        }
        patch.append(value);
    }
    return patch;
}

QStringList PianoRollController::noteDragIds() const {
    QStringList ids;
    for (const auto& note : m_dragNotes) { ids.append(note.id); }
    return ids;
}

int PianoRollController::noteDragRow(const QString& id) const {
    const auto found = m_dragIndex.constFind(id);
    return found == m_dragIndex.cend() ? -1 : m_dragNotes[*found].row;
}

NoteDragValue PianoRollController::previewNote(const QString& id) const {
    const auto found = m_dragIndex.constFind(id);
    if (found == m_dragIndex.cend()) {
        const auto* clip = m_timeline ? m_timeline->findClip(m_clipId) : nullptr;
        const auto row = m_noteIndex.constFind(id);
        if (!clip || !clip->notes || row == m_noteIndex.cend() || *row >= clip->notes->size()) { return {}; }
        const auto& note = (*clip->notes)[*row];
        return {note.startTick, note.durationTick, note.pitch, note.velocity};
    }
    const auto& note = m_dragNotes[*found];
    int pitch = note.pitch;
    if (m_dragKind == "move" || m_dragKind == "duplicate") {
        if (m_dragRows.isEmpty()) { pitch += static_cast<int>(m_dragPitch); }
        else {
            const auto index = m_dragRows.indexOf(note.pitch);
            if (index >= 0) { pitch = m_dragRows.at(std::clamp(index + static_cast<qsizetype>(m_dragPitch), qsizetype{0}, m_dragRows.size() - 1)); }
        }
        if (!m_dragScale.isEmpty()) {
            int distance = 128;
            const int target = pitch;
            for (const int candidate : m_dragScale) {
                if (candidate < 0 || candidate > 127) { continue; }
                const int next = std::abs(candidate - target);
                if (next < distance || (next == distance && candidate < pitch)) { distance = next; pitch = candidate; }
            }
        }
    }
    return {note.start + ((m_dragKind == "move" || m_dragKind == "duplicate") ? m_dragTicks : 0),
        m_dragKind == "resize" ? std::max(m_dragMinimum, note.duration + m_dragTicks) : note.duration,
        pitch,
        m_dragKind == "velocity" ? static_cast<int>(std::clamp(note.velocity + m_dragTicks, 1.0, 127.0)) : note.velocity};
}

bool PianoRollController::commitNoteDrag(bool noOverlap) {
    if (!noteDragActive() || !editable()) { cancelNoteDrag(); return false; }
    auto patch = dragPatch();
    if (noOverlap && m_dragKind != "velocity") {
        const auto* clip = m_timeline->findClip(m_clipId);
        if (!clip || !clip->notes) { cancelNoteDrag(); return false; }
        QHash<QString, QJsonObject> state;
        QSet<QString> moved, removed;
        for (const auto& note : *clip->notes) { state.insert(note.id, note.raw); }
        for (const auto& value : patch) {
            const auto fields = value.toObject();
            const auto id = fields.value("id").toString();
            moved.insert(id);
            auto& note = state[id];
            for (auto it = fields.begin(); it != fields.end(); ++it) { note.insert(it.key(), it.value()); }
        }
        QHash<int, QStringList> untouched;
        for (const auto& note : *clip->notes) {
            if (!moved.contains(note.id)) { untouched[note.pitch * 16 + note.raw.value("channel").toInt()].append(note.id); }
        }
        for (const auto& dragged : m_dragNotes) {
            const auto current = state.value(dragged.id);
            const auto candidates = untouched.value(current.value("pitch").toInt() * 16 + current.value("channel").toInt());
            for (const auto& otherId : candidates) {
                if (removed.contains(otherId)) { continue; }
                auto& a = state[dragged.id];
                auto& b = state[otherId];
                if (a.value("pitch") != b.value("pitch") || a.value("channel").toInt() != b.value("channel").toInt()) { continue; }
                const double startA = a.value("startTick").toDouble(), startB = b.value("startTick").toDouble();
                if (!(startB < startA + a.value("durationTick").toDouble() && startA < startB + b.value("durationTick").toDouble())) { continue; }
                if (startB < startA) { b.insert("durationTick", startA - startB); }
                else if (startB > startA) { a.insert("durationTick", startB - startA); }
                else { removed.insert(otherId); }
            }
        }
        patch = {};
        QJsonArray deletions;
        for (const auto& note : *clip->notes) {
            if (removed.contains(note.id)) { deletions.append(note.id); }
            else if (state.value(note.id) != note.raw) { patch.append(state.value(note.id)); }
        }
        if (m_dragKind == "duplicate") {
            for (const auto& note : m_dragNotes) { patch.append(state.value(note.id)); }
        }
        cancelNoteDrag();
        return m_timeline->applyEdit("midi.patchNotes", {{"clipId", m_clipId}, {"notes", patch}, {"noteIds", deletions}}) != 0;
    }
    const auto name = m_dragKind == "duplicate" ? "midi.addNotes" : m_dragKind == "move" ? "midi.moveNotes" : m_dragKind == "resize" ? "midi.resizeNotes" : "midi.setNoteVelocities";
    cancelNoteDrag();
    return m_timeline->applyEdit(QString::fromLatin1(name), {{"clipId", m_clipId}, {"notes", patch}}) != 0;
}

void PianoRollController::cancelNoteDrag() {
    if (!noteDragActive()) { return; }
    m_dragKind.clear();
    m_dragNotes.clear();
    m_dragIndex.clear();
    m_dragTicks = m_dragPitch = 0;
    m_dragMinimum = 1;
    m_dragRows.clear();
    m_dragScale.clear();
    emit noteDragChanged();
}


bool PianoRollController::patchNotes(const QVariantList& values) {
    if (!editable()) { return false; }
    const auto next = QJsonArray::fromVariantList(values);
    QHash<QString, QJsonObject> previous;
    for (const auto& value : m_noteData) {
        const auto note = value.toObject();
        previous.insert(note.value("id").toString(), note);
    }
    QStringList requestedIds, patchOrder;
    QSet<QString> uniqueIds;
    for (const auto& value : next) {
        const auto id = value.toObject().value("id").toString();
        if (id.isEmpty() || uniqueIds.contains(id)) { return setNotes(values); }
        uniqueIds.insert(id);
        requestedIds.append(id);
    }
    for (const auto& value : m_noteData) {
        const auto id = value.toObject().value("id").toString();
        if (uniqueIds.contains(id)) { patchOrder.append(id); }
    }
    for (const auto& id : requestedIds) {
        if (!previous.contains(id)) { patchOrder.append(id); }
    }
    if (patchOrder != requestedIds) { return setNotes(values); }
    QJsonArray patches, removed;
    for (const auto& value : next) {
        const auto note = value.toObject();
        const auto id = note.value("id").toString();
        if (note != previous.take(id)) { patches.append(note); }
    }
    for (auto it = previous.cbegin(); it != previous.cend(); ++it) { removed.append(it.key()); }
    return m_timeline->applyEdit("midi.patchNotes", {{"clipId", m_clipId}, {"notes", patches}, {"noteIds", removed}}) != 0;
}
