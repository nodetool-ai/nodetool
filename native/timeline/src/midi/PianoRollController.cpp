#include "midi/PianoRollController.h"

#include "app/EditRegistry.h"
#include "midi/MidiNotes.h"
#include "model/TimelineModel.h"
#include "ui/Tempo/TempoGrid.h"
#include "ui/Tempo/TempoJson.h"

#include <QJsonArray>
#include <QUuid>

#include <cmath>
#include <limits>
#include <map>
#include <set>

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
    cancelNoteDrag(); cancelTool();
    m_timeline = timeline;
    m_reloadInputs = {};
    if (m_timeline) {
        connect(m_timeline, &TimelineModel::changed, this, [this](const ChangeSet& changes) {
            const auto* clip = m_timeline->findClip(m_clipId);
            if (changes.clipChanged(m_clipId) || (clip && changes.trackChanged(QString::fromStdString(clip->trackId))) ||
                changes.documentFields.contains("tempo")) { cancelNoteDrag(); cancelTool(); reload(); }
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
    cancelNoteDrag(); cancelTool();
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
        ++m_noteRevision;
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
    if (notesDiffer || metadataDiffer) { m_noteSummary = computeNoteSummary(); }
    if (notesDiffer) {
        m_noteOnsets.clear();
        for (const auto& note : typedNotes()) { m_noteOnsets.insert({note.pitch, note.startTick}); }
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
            QJsonArray additions;
            for (const auto& note : m_dragNotes) { additions.append(state.value(note.id)); }
            cancelNoteDrag();
            return applyPatch("midi.patchNotes", {{"notes", patch}, {"noteIds", deletions}, {"addedNotes", additions}});
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
    m_timeline->crossing("PianoRoll.patchNotes", [&next] { return next; });
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
        if (!previous.contains(id)) { return setNotes(values); }
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

const std::vector<nt::MidiNote>& PianoRollController::typedNotes() const {
    const auto* clip = m_timeline ? m_timeline->findClip(m_clipId) : nullptr;
    // The empty value is immutable and has no thread-affine resources.
    static const std::vector<nt::MidiNote> empty;
    return clip && clip->notes ? *clip->notes : empty;
}

TimelineModel* PianoRollController::timeline() const { return m_timeline; }

std::shared_ptr<const std::vector<nt::MidiNote>> PianoRollController::noteStorage() const {
    const auto* clip = m_timeline ? m_timeline->findClip(m_clipId) : nullptr;
    return clip ? clip->notes : nullptr;
}

QVariantMap PianoRollController::noteAtRow(int row) const {
    const auto& notes = typedNotes();
    if (row < 0 || static_cast<std::size_t>(row) >= notes.size()) { return {}; }
    return noteById(notes[static_cast<std::size_t>(row)].id);
}
QVariantMap PianoRollController::noteById(const QString& id) const {
    for (const auto& note : m_toolNotes) { if (note.id == id) { return note.raw.toVariantMap(); } }
    if (m_toolRemoved.contains(id)) { return {}; }
    const auto row = m_noteIndex.constFind(id);
    const auto& notes = typedNotes();
    if (row == m_noteIndex.cend() || *row >= notes.size()) { return {}; }
    return notes[*row].raw.toVariantMap();
}
QVariantList PianoRollController::selectedNotes(const QStringList& ids) const {
    QVariantList result;
    std::vector<std::pair<int, QString>> rows;
    for (const auto& id : ids) {
        const auto row = m_noteIndex.constFind(id);
        rows.emplace_back(row == m_noteIndex.cend() ? maxNotes() : static_cast<int>(*row), id);
    }
    std::stable_sort(rows.begin(), rows.end());
    for (const auto& [row, id] : rows) {
        const auto note = noteById(id);
        if (!note.isEmpty()) { result.append(note); }
    }
    return result;
}
QVariantMap PianoRollController::computeNoteSummary() const {
    const auto& notes = typedNotes();
    int low = notes.empty() ? 48 : 127, high = notes.empty() ? 72 : 0;
    double from = notes.empty() ? windowFromTick() : std::numeric_limits<double>::infinity();
    double to = notes.empty() ? windowToTick() : 0;
    QSet<int> pitches;
    for (const auto& note : notes) {
        low = std::min(low, note.pitch); high = std::max(high, note.pitch);
        from = std::min(from, note.startTick); to = std::max(to, note.startTick + note.durationTick);
        pitches.insert(note.pitch);
    }
    QList<int> rows(pitches.begin(), pitches.end());
    std::sort(rows.begin(), rows.end(), std::greater<int>());
    return {{"low", low}, {"high", high}, {"from", from}, {"to", to}, {"pitches", QVariant::fromValue(rows)}};
}
QStringList PianoRollController::selectNotes(const QString& action, const QStringList& ids, double tick) const {
    const QSet<QString> chosen(ids.begin(), ids.end());
    if (action == "keep") {
        QStringList result;
        for (const auto& id : ids) { if (m_noteIndex.contains(id)) { result.append(id); } }
        return result;
    }
    QSet<int> pitches;
    bool any = false;
    for (const auto& note : typedNotes()) {
        if (!chosen.contains(note.id)) { continue; }
        tick = any ? std::min(tick, note.startTick) : note.startTick;
        any = true; pitches.insert(note.pitch);
    }
    QStringList result;
    for (const auto& note : typedNotes()) {
        if (action == "all" || (action == "following" && note.startTick >= tick) ||
            (action == "samePitch" && pitches.contains(note.pitch)) ||
            (action == "pitch" && note.pitch == static_cast<int>(tick)) ||
            (action == "muted" && note.raw.value("muted").toBool()) ||
            (action == "invert" && !chosen.contains(note.id)) || (action == "keep" && chosen.contains(note.id))) { result.append(note.id); }
    }
    return result;
}
bool PianoRollController::applyPatch(const QString& name, QJsonObject payload) {
    if (!editable()) { return false; }
    payload.insert("clipId", m_clipId);
    m_timeline->crossing("PianoRoll.notePatch", [&payload] { return payload; });
    return m_timeline->applyEdit(name, payload) != 0;
}
bool PianoRollController::removeNotes(const QStringList& ids) {
    return applyPatch("midi.removeNotes", {{"noteIds", QJsonArray::fromStringList(ids)}});
}
bool PianoRollController::patchSelection(const QVariantList& values, const QStringList& replacedIds) {
    QSet<QString> remaining(replacedIds.begin(), replacedIds.end());
    QJsonArray updates, additions;
    for (const auto& value : values) {
        const auto note = QJsonObject::fromVariantMap(value.toMap());
        const auto id = note.value("id").toString();
        remaining.remove(id);
        const auto row = m_noteIndex.constFind(id);
        if (row == m_noteIndex.cend()) { additions.append(note); }
        else if (note != m_noteData.at(static_cast<qsizetype>(*row))) { updates.append(note); }
    }
    if (updates.isEmpty() && remaining.isEmpty()) { return applyPatch("midi.addNotes", {{"notes", additions}}); }
    return applyPatch("midi.patchNotes", {{"notes", updates}, {"addedNotes", additions},
        {"noteIds", QJsonArray::fromStringList(QStringList(remaining.begin(), remaining.end()))}});
}
bool PianoRollController::beginTool(const QString& kind) {
    cancelNoteDrag(); cancelTool();
    if (!editable() || (kind != "pencil" && kind != "brush" && kind != "erase" && kind != "expression")) { return false; }
    m_toolKind = kind;
    emit toolChanged();
    return true;
}
QString PianoRollController::previewAdd(int pitch, double tick, double duration, bool unique) {
    if (!toolActive() || pitch < 0 || pitch > 127 || !std::isfinite(tick) || !std::isfinite(duration)) { return {}; }
    tick = std::max(0.0, roundGestureValue(tick)); duration = std::max(1.0, roundGestureValue(duration));
    if (unique && (m_noteOnsets.contains({pitch, tick}) || m_toolOnsets.contains({pitch, tick}))) { return {}; }
    if (typedNotes().size() + m_toolNotes.size() >= static_cast<std::size_t>(maxNotes())) { return {}; }
    const auto id = newNoteId();
    m_toolOnsets.insert({pitch, tick});
    m_toolNotes.push_back({id, pitch, 100, tick, duration,
        {{"id", id}, {"pitch", pitch}, {"velocity", 100}, {"startTick", tick}, {"durationTick", duration}}});
    emit toolChanged();
    return id;
}
void PianoRollController::previewLength(const QString& id, double duration) {
    if (!std::isfinite(duration)) { return; }
    for (auto& note : m_toolNotes) {
        if (note.id != id) { continue; }
        note.durationTick = std::max(1.0, roundGestureValue(duration));
        note.raw.insert("durationTick", note.durationTick);
        emit toolChanged(); return;
    }
}
void PianoRollController::previewErase(const QString& id) {
    if (!toolActive() || !m_noteIndex.contains(id) || m_toolRemoved.contains(id)) { return; }
    m_toolRemoved.insert(id); emit toolChanged();
}
void PianoRollController::previewExpression(const QString& id, const QString& key, const QVariantList& points) {
    if (!toolActive() && !beginTool("expression")) { return; }
    auto raw = QJsonObject::fromVariantMap(noteById(id));
    if (raw.isEmpty()) { return; }
    auto expression = raw.value("expression").toObject();
    QJsonArray curve;
    for (const auto& value : points) {
        const auto point = value.toMap();
        curve.append(QJsonObject{{"tick", point.value("tick").toDouble()}, {"value", point.value("value").toDouble()}});
    }
    if (curve.isEmpty()) { expression.remove(key); } else { expression.insert(key, curve); }
    if (expression.isEmpty()) { raw.remove("expression"); } else { raw.insert("expression", expression); }
    m_toolNotes = {{id, raw.value("pitch").toInt(), raw.value("velocity").toInt(),
        raw.value("startTick").toDouble(), raw.value("durationTick").toDouble(), raw}};
    emit toolChanged();
}
QStringList PianoRollController::toolHiddenIds() const {
    QStringList ids(m_toolRemoved.begin(), m_toolRemoved.end());
    for (const auto& note : m_toolNotes) { if (m_noteIndex.contains(note.id)) { ids.append(note.id); } }
    return ids;
}
bool PianoRollController::commitTool() {
    if (!toolActive()) { return false; }
    const auto kind = m_toolKind;
    QJsonArray notes;
    for (const auto& note : m_toolNotes) { notes.append(note.raw); }
    const auto removed = QJsonArray::fromStringList(QStringList(m_toolRemoved.begin(), m_toolRemoved.end()));
    cancelTool();
    if (kind == "erase") { return applyPatch("midi.removeNotes", {{"noteIds", removed}}); }
    return applyPatch(kind == "expression" ? "midi.patchNotes" : "midi.addNotes", {{"notes", notes}});
}
void PianoRollController::cancelTool() {
    if (!toolActive()) { return; }
    m_toolKind.clear(); m_toolNotes.clear(); m_toolRemoved.clear(); m_toolOnsets.clear(); emit toolChanged();
}

QStringList PianoRollController::splitNotes(const QStringList& ids, double tick) {
    if (!std::isfinite(tick)) { return ids; }
    tick = roundGestureValue(tick);
    QJsonArray updates, additions;
    QStringList result;
    for (const auto& value : selectedNotes(ids)) {
        const auto note = QJsonObject::fromVariantMap(value.toMap());
        const auto id = note.value("id").toString();
        result.append(id);
        const double start = note.value("startTick").toDouble(), duration = note.value("durationTick").toDouble();
        if (tick <= start || tick >= start + duration) { continue; }
        auto left = note, right = note;
        const auto addedId = newNoteId();
        left.insert("durationTick", tick - start);
        right.insert("id", addedId); right.insert("startTick", tick); right.insert("durationTick", start + duration - tick);
        if (note.contains("expression")) {
            QJsonObject leftCurves, rightCurves;
            const auto curves = note.value("expression").toObject();
            for (auto it = curves.begin(); it != curves.end(); ++it) {
                const auto points = it.value().toArray();
                if (points.isEmpty()) { continue; }
                const double cut = tick - start;
                QJsonArray before, after;
                for (const auto& entry : points) {
                    auto point = entry.toObject();
                    const double at = point.value("tick").toDouble();
                    if (at < cut) { before.append(point); }
                    else { point.insert("tick", at - cut); after.append(point); }
                }
                if (!before.isEmpty()) { leftCurves.insert(it.key(), before); }
                if (!after.isEmpty()) { rightCurves.insert(it.key(), after); }
            }
            if (leftCurves.isEmpty()) { left.remove("expression"); } else { left.insert("expression", leftCurves); }
            if (rightCurves.isEmpty()) { right.remove("expression"); } else { right.insert("expression", rightCurves); }
        }
        updates.append(left); additions.append(right); result.append(addedId);
    }
    if (updates.isEmpty() || !applyPatch("midi.patchNotes", {{"notes", updates}, {"addedNotes", additions}})) { return ids; }
    return result;
}
bool PianoRollController::glueNotes(const QStringList& ids) {
    QHash<int, QJsonArray> groups;
    for (const auto& value : selectedNotes(ids)) {
        const auto note = QJsonObject::fromVariantMap(value.toMap());
        groups[note.value("pitch").toInt() * 16 + note.value("channel").toInt()].append(note);
    }
    QJsonArray updates, removed;
    for (const auto& group : groups) {
        if (group.size() < 2) { continue; }
        auto first = group.first().toObject();
        double end = 0;
        for (const auto& value : group) {
            const auto note = value.toObject();
            if (note.value("startTick").toDouble() < first.value("startTick").toDouble()) { first = note; }
            end = std::max(end, note.value("startTick").toDouble() + note.value("durationTick").toDouble());
        }
        first.insert("durationTick", end - first.value("startTick").toDouble());
        updates.append(first);
        for (const auto& value : group) {
            const auto id = value.toObject().value("id").toString();
            if (id != first.value("id").toString()) { removed.append(id); }
        }
    }
    return applyPatch("midi.patchNotes", {{"notes", updates}, {"noteIds", removed}});
}
bool PianoRollController::finishNotes(const QString& action, const QStringList& ids) {
    if (action != "forceLegato" && action != "removeOverlaps" && action != "deleteDuplicates") { return false; }
    const QSet<QString> chosen(ids.begin(), ids.end());
    QJsonArray updates, removed;
    QSet<QString> seen;
    std::map<int, std::set<double>> starts;
    if (action != "deleteDuplicates") {
        for (const auto& note : typedNotes()) {
            const int key = action == "forceLegato" ? 0 : note.pitch * 16 + note.raw.value("channel").toInt();
            starts[key].insert(note.startTick);
        }
    }
    for (const auto& note : typedNotes()) {
        if (action == "deleteDuplicates") {
            const auto key = QString::number(note.pitch * 16 + note.raw.value("channel").toInt()) + ":" + QString::number(note.startTick, 'g', 17);
            if (chosen.contains(note.id) && seen.contains(key)) { removed.append(note.id); }
            seen.insert(key); continue;
        }
        if (!chosen.contains(note.id)) { continue; }
        const int key = action == "forceLegato" ? 0 : note.pitch * 16 + note.raw.value("channel").toInt();
        const auto& group = starts.at(key);
        const auto next = group.upper_bound(note.startTick);
        if (next == group.end()) { continue; }
        const double duration = *next - note.startTick;
        if (action == "removeOverlaps" && duration >= note.durationTick) { continue; }
        auto raw = note.raw; raw.insert("durationTick", duration); updates.append(raw);
    }
    return applyPatch("midi.patchNotes", {{"notes", updates}, {"noteIds", removed}});
}
