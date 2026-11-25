#include "midi/StepSequencerController.h"

#include "audio/automation/Automation.h"
#include "midi/PatternOps.h"
#include "model/TimelineModel.h"

#include <QCoreApplication>
#include <QDynamicPropertyChangeEvent>
#include <QJsonArray>
#include <QJsonObject>

#include <algorithm>
#include <cmath>
#include <array>
#include <utility>
#include <stdexcept>

namespace {
QVariantList loadLibrary();
}  // namespace

QVariant StepSequencerRowModel::data(const QModelIndex& index, int role) const {
    if (!index.isValid() || index.row() < 0 || index.row() >= m_rows.size()) return {};
    switch (role) {
    case RowDataRole: return m_rows.at(index.row());
    case RowIdRole: return m_ids.at(index.row());
    case PlayingStepRole: return m_playing[static_cast<std::size_t>(index.row())];
    default: return {};
    }
}

QHash<int, QByteArray> StepSequencerRowModel::roleNames() const {
    return {{RowDataRole, "rowData"}, {RowIdRole, "rowId"}, {PlayingStepRole, "playingStep"}};
}

void StepSequencerRowModel::setRows(const QVariantList& rows) {
    QStringList ids;
    ids.reserve(rows.size());
    for (const auto& row : rows) ids.append(row.toMap().value(QStringLiteral("id")).toString());
    if (ids != m_ids) {
        beginResetModel();
        m_rows = rows;
        m_ids = ids;
        m_playing.assign(static_cast<std::size_t>(rows.size()), -1);
        endResetModel();
        return;
    }
    for (qsizetype i = 0; i < rows.size(); ++i) {
        if (m_rows.at(i) == rows.at(i)) continue;
        m_rows[i] = rows.at(i);
        const auto at = index(static_cast<int>(i));
        emit dataChanged(at, at, {RowDataRole});
    }
}

void StepSequencerRowModel::setPlayingSteps(const QHash<QString, int>& playing) {
    for (qsizetype i = 0; i < m_ids.size(); ++i) {
        const int next = playing.value(m_ids.at(i), -1);
        auto& cur = m_playing[static_cast<std::size_t>(i)];
        if (cur == next) continue;
        cur = next;
        const auto at = index(static_cast<int>(i));
        emit dataChanged(at, at, {PlayingStepRole});
    }
}

StepSequencerLibraryModel::StepSequencerLibraryModel(const QVariantList& library, QObject* parent) : QAbstractListModel(parent) {
    setLibrary(library);
}

QVariant StepSequencerLibraryModel::data(const QModelIndex& index, int role) const {
    if (!index.isValid() || index.row() < 0 || index.row() >= rowCount()) return {};
    const auto& item = m_all[static_cast<std::size_t>(m_rows[static_cast<std::size_t>(index.row())])];
    switch (role) {
    case HeaderRole: return item.header;
    case EntryIdRole: return item.header.isEmpty() ? item.entry.value(QStringLiteral("id")).toString() : QString();
    case NameRole: return item.entry.value(QStringLiteral("name")).toString();
    case KindRole: return item.entry.value(QStringLiteral("kind")).toString();
    case CategoryRole: return item.entry.value(QStringLiteral("category")).toString();
    default: return {};
    }
}

QHash<int, QByteArray> StepSequencerLibraryModel::roleNames() const {
    return {{HeaderRole, "header"}, {EntryIdRole, "entryId"}, {NameRole, "name"}, {KindRole, "kind"}, {CategoryRole, "category"}};
}

void StepSequencerLibraryModel::setLibrary(const QVariantList& library) {
    beginResetModel();
    m_all.clear();
    m_rows.clear();
    for (const auto& [kind, header] : {std::pair{QStringLiteral("pattern"), tr("Patterns")}, std::pair{QStringLiteral("template"), tr("Templates")}}) {
        m_all.push_back(Item{header, {{"kind", kind}}});
        for (const auto& value : library) {
            const auto entry = value.toMap();
            if (entry.value(QStringLiteral("kind")).toString() == kind) m_all.push_back(Item{{}, entry});
        }
    }
    const auto q = m_query.trimmed().toLower();
    int header = -1;
    bool headerAdded = false;
    for (int i = 0; i < static_cast<int>(m_all.size()); ++i) {
        const auto& item = m_all[static_cast<std::size_t>(i)];
        if (!item.header.isEmpty()) { header = i; headerAdded = false; continue; }
        if (!q.isEmpty() && !item.entry.value(QStringLiteral("search")).toString().contains(q)) continue;
        if (!headerAdded && header >= 0) { m_rows.push_back(header); headerAdded = true; }
        m_rows.push_back(i);
    }
    endResetModel();
}

void StepSequencerLibraryModel::setQuery(const QString& query) {
    m_query = query;
    const auto q = query.trimmed().toLower();
    // Which items show: matching entries, and a header when its section has one.
    std::vector<bool> show(m_all.size(), false);
    std::size_t header = 0;
    for (std::size_t i = 0; i < m_all.size(); ++i) {
        if (!m_all[i].header.isEmpty()) {
            header = i;
            continue;
        }
        if (q.isEmpty() || m_all[i].entry.value(QStringLiteral("search")).toString().contains(q)) {
            show[i] = true;
            show[header] = true;
        }
    }
    // Walk both lists in order: remove and insert single rows in place.
    int pos = 0;
    for (std::size_t i = 0; i < m_all.size(); ++i) {
        const bool was = pos < rowCount() && m_rows[static_cast<std::size_t>(pos)] == static_cast<int>(i);
        if (was && !show[i]) {
            beginRemoveRows({}, pos, pos);
            m_rows.erase(m_rows.begin() + pos);
            endRemoveRows();
        } else if (!was && show[i]) {
            beginInsertRows({}, pos, pos);
            m_rows.insert(m_rows.begin() + pos, static_cast<int>(i));
            endInsertRows();
            ++pos;
        } else if (was) {
            ++pos;
        }
    }
}

StepSequencerController::StepSequencerController(QObject* parent)
    // NOLINT(cppcoreguidelines-owning-memory): parented to this controller
    : QObject(parent), m_rowModel(new StepSequencerRowModel(this)),
      // NOLINT(cppcoreguidelines-owning-memory): parented to this controller
      m_libraryModel(new StepSequencerLibraryModel({}, this)) {
    reloadLibrary();
    if (auto* app = QCoreApplication::instance()) app->installEventFilter(this);
}

bool StepSequencerController::eventFilter(QObject* watched, QEvent* event) {
    if (watched == QCoreApplication::instance() && event->type() == QEvent::DynamicPropertyChange) {
        const auto name = static_cast<QDynamicPropertyChangeEvent*>(event)->propertyName();
        if (name == "ntStepPatternLibraryRevision" || name == "ntStepPatternLibraryRoot") reloadLibrary();
    }
    return QObject::eventFilter(watched, event);
}

QVariantList StepSequencerController::addRowGroups() const {
    const auto choice = [](const QString& id, const QString& label, const QJsonObject& assignment, const QString& name = {}) {
        QVariantMap out{{"id", id}, {"label", label}, {"assignment", assignment.toVariantMap()}};
        if (!name.isEmpty()) out.insert("name", name);
        return out;
    };
    const auto group = [](const QString& id, const QString& label, const QVariantList& choices) {
        return QVariantMap{{"id", id}, {"label", label}, {"choices", choices}};
    };
    QVariantList groups;
    const auto type = m_instrument.value(u"type").toString();
    QVariantList kit;
    const auto pads = type == u"drum" ? m_instrument.value(u"pads").toArray() : type == u"sampler" ? m_instrument.value(u"zones").toArray() : QJsonArray{};
    for (qsizetype i = 0; i < pads.size() && (type == u"drum" || i < 16); ++i) {
        const auto name = pads[i].toObject().value(u"name").toString();
        kit.append(choice(QStringLiteral("pad.%1").arg(i), name.isEmpty() ? tr("Pad %1").arg(i + 1) : name,
                          QJsonObject{{"type", "kit"}, {"pad", static_cast<int>(i)}}));
    }
    if (!kit.isEmpty()) groups.append(group(QStringLiteral("kit"), tr("Kit Pieces"), kit));
    QVariantList drums;
    for (const auto& [pitch, name] : nt::midi::gmDrumLanes()) {
        drums.append(choice(QStringLiteral("drum.%1").arg(pitch), name, QJsonObject{{"type", "note"}, {"pitch", pitch}}, name));
    }
    groups.append(group(QStringLiteral("drums"), tr("Drums"), drums));
    QVariantList notes;
    for (int pitch = 127; pitch >= 0; --pitch) {
        notes.append(choice(QStringLiteral("note.%1").arg(pitch), nt::midi::stepNoteName(pitch), QJsonObject{{"type", "note"}, {"pitch", pitch}}));
    }
    groups.append(group(QStringLiteral("notes"), tr("Notes"), notes));
    groups.append(group(QStringLiteral("melodic"), tr("Melodic"),
                        {choice(QStringLiteral("melodic"), tr("Melodic"), QJsonObject{{"type", "melodic"}, {"pitch", 60}})}));
    QVariantList degrees;
    const std::array<std::pair<const char*, QString>, 7> degreeNames{{{"root", tr("Root")}, {"2nd", tr("2nd")}, {"3rd", tr("3rd")},
                                                                     {"4th", tr("4th")}, {"5th", tr("5th")}, {"6th", tr("6th")}, {"7th", tr("7th")}}};
    for (const auto& [degree, label] : degreeNames) {
        degrees.append(choice(QStringLiteral("degree.%1").arg(QLatin1String(degree)), label,
                              QJsonObject{{"type", "degree"}, {"degree", QLatin1String(degree)}, {"octave", 3}}));
    }
    groups.append(group(QStringLiteral("degrees"), tr("Chord Degrees"), degrees));
    QVariantList controllers{
        choice(QStringLiteral("pb"), tr("Pitch Bend"), QJsonObject{{"type", "automation"}, {"target", QJsonObject{{"kind", "pitchBend"}}}}),
        choice(QStringLiteral("cp"), tr("Channel Pressure"), QJsonObject{{"type", "automation"}, {"target", QJsonObject{{"kind", "channelPressure"}}}})};
    const QHash<int, QString> named{{1, tr("Modulation")}, {7, tr("Volume")}, {10, tr("Pan")}, {11, tr("Expression")}, {64, tr("Sustain")}, {74, tr("Brightness")}};
    for (int cc = 0; cc < 128; ++cc) {
        const auto label = named.contains(cc) ? tr("%1 (CC %2)").arg(named.value(cc)).arg(cc) : tr("CC %1").arg(cc);
        controllers.append(choice(QStringLiteral("cc.%1").arg(cc), label,
                                  QJsonObject{{"type", "automation"}, {"target", QJsonObject{{"kind", "cc"}, {"cc", cc}}}}));
    }
    groups.append(group(QStringLiteral("controllers"), tr("MIDI Controllers"), controllers));
    QVariantList params;
    for (const auto& value : nt::automation::instrumentAutomationSpecs(m_instrument)) {
        const auto spec = value.toObject();
        const auto target = spec.value(u"target").toObject();
        params.append(choice(QStringLiteral("device.instrument.%1").arg(target.value(u"param").toString()),
                             spec.value(u"group").toString() + QStringLiteral(" · ") + spec.value(u"label").toString(),
                             QJsonObject{{"type", "automation"}, {"target", target}}, spec.value(u"label").toString()));
    }
    if (!params.isEmpty()) groups.append(group(QStringLiteral("instrument"), tr("Instrument"), params));
    // Insert effects: one group per effect whose parameters the pattern stage drives.
    const QHash<QString, QString> effectNames{{"gain", tr("Gain")}, {"eq3", tr("EQ")}, {"filter", tr("Filter")}, {"compressor", tr("Compressor")}};
    const QHash<QString, QString> paramNames{
        {"gainDb", tr("Gain")}, {"lowFreq", tr("Low Frequency")}, {"lowGainDb", tr("Low Gain")}, {"midFreq", tr("Mid Frequency")},
        {"midQ", tr("Mid Q")}, {"midGainDb", tr("Mid Gain")}, {"highFreq", tr("High Frequency")}, {"highGainDb", tr("High Gain")},
        {"frequency", tr("Frequency")}, {"q", tr("Q")}, {"thresholdDb", tr("Threshold")}, {"ratio", tr("Ratio")},
        {"attackMs", tr("Attack")}, {"releaseMs", tr("Release")}, {"kneeDb", tr("Knee")}};
    const auto effects = m_effects;
    for (qsizetype i = 0; i < effects.size(); ++i) {
        const auto effect = effects[i].toObject();
        const auto effectType = effect.value(u"type").toString();
        const auto effectId = effect.value(u"id").toString();
        if (!effectNames.contains(effectType) || effectId.isEmpty()) continue;
        const auto effectLabel = tr("%1 (Slot %2)").arg(effectNames.value(effectType)).arg(i + 1);
        QVariantList choices;
        const auto defaults = nt::automation::trackEffectDefaults(effectType);
        for (auto it = defaults.begin(); it != defaults.end(); ++it) {
            if (!it.value().isDouble()) continue;
            const auto label = paramNames.value(it.key(), it.key());
            choices.append(choice(QStringLiteral("effect.%1.%2").arg(effectId, it.key()), label,
                                  QJsonObject{{"type", "automation"},
                                              {"target", QJsonObject{{"kind", "device"}, {"deviceId", effectId}, {"param", it.key()}}}},
                                  effectNames.value(effectType) + QStringLiteral(" ") + label));
        }
        if (!choices.isEmpty()) groups.append(group(QStringLiteral("effect.%1").arg(i), effectLabel, choices));
    }
    return groups;
}

void StepSequencerController::setTimeline(TimelineModel* timeline) {
    if (m_timeline == timeline) return;
    if (m_timeline) disconnect(m_timeline, nullptr, this, nullptr);
    setLearnMode({});
    setStepRecording(false);
    m_timeline = timeline;
    if (m_timeline) {
        // TimelineModel emits clipsChanged and then timelineChanged for one edit;
        // timelineChanged alone covers clip, track and tempo changes.
        connect(m_timeline, &TimelineModel::timelineChanged, this, &StepSequencerController::onTimelineChanged);
        connect(m_timeline, &TimelineModel::readOnlyChanged, this, &StepSequencerController::reload);
    }
    emit timelineChanged();
    updateFirstMidiTrack();
    reload();
}

void StepSequencerController::updateFirstMidiTrack() {
    QString id;
    if (m_timeline) {
        for (const auto& value : m_timeline->timeline().raw.value(u"tracks").toArray()) {
            const auto track = value.toObject();
            if (track.value(u"type").toString() == u"midi") {
                id = track.value(u"id").toString();
                break;
            }
        }
    }
    if (id == m_firstMidiTrackId) return;
    m_firstMidiTrackId = id;
    emit firstMidiTrackIdChanged();
}

QVariantMap StepSequencerController::createPatternRegion(const QString& trackId, double atMs, double durationMs) {
    const QString target = trackId.isEmpty() ? m_firstMidiTrackId : trackId;
    if (target.isEmpty()) {
        const QString error = tr("Add a MIDI track first.");
        setLastError(error);
        return QVariantMap{{"ok", false}, {"error", error}};
    }
    double bars = 1;
    if (durationMs > 0 && m_timeline) {
        const auto tempo = m_timeline->timeline().raw.value(u"tempo").toObject();
        const auto ts = tempo.value(u"timeSignature").toObject();
        const double bpm = tempo.value(u"bpm").toDouble(120.0);
        const double beatUnit = ts.value(u"beatUnit").toDouble(4.0);
        const double barMs = ts.value(u"beatsPerBar").toDouble(4.0) * (60000.0 / (bpm > 0 ? bpm : 120.0)) * (4.0 / (beatUnit > 0 ? beatUnit : 4.0));
        if (barMs > 0) bars = durationMs / barMs;
    }
    QVariantMap args{{"trackId", target}, {"bars", bars}};
    if (std::isfinite(atMs) && atMs >= 0) args.insert(QStringLiteral("atMs"), atMs);
    const auto result = runOp(QStringLiteral("create_pattern_region"), args);
    if (result.value(QStringLiteral("ok")).toBool()) setClipId(result.value(QStringLiteral("clip")).toMap().value(QStringLiteral("id")).toString());
    return result;
}

void StepSequencerController::setClipId(const QString& clipId) {
    if (m_clipId == clipId) return;
    setLearnMode({});
    setStepRecording(false);
    setRecordStep(0);
    m_clipId = clipId;
    emit clipIdChanged();
    reload();
}

bool StepSequencerController::editable() const { return m_valid && !m_locked && m_timeline && !m_timeline->readOnly(); }

QVariantList StepSequencerController::library() const { return m_library; }

namespace {
// Factory entries (parsed once) then the user library entries.
QVariantList loadLibrary() {
    const auto entryOf = [](const QJsonObject& e, const QString& source, const QString& category) {
        return QVariantMap{{"id", e.value(u"id").toString()},
                           {"name", e.value(u"name").toString()},
                           {"kind", e.value(u"kind").toString(QStringLiteral("pattern"))},
                           {"category", category},
                           {"tags", e.value(u"tags").toArray().toVariantList()},
                           {"source", source},
                           {"folder", e.value(u"folder").toString()},
                           {"search", QStringList{e.value(u"id").toString(), e.value(u"name").toString(), category,
                                                  e.value(u"tags").toVariant().toStringList().join(u' ')}
                                          .join(u' ')
                                          .toLower()}};
    };
    static const QVariantList factory = [&entryOf] {
        QVariantList out;
        for (const auto& value : nt::midi::factoryStepPatternLibrary()) {
            const auto e = value.toObject();
            out.append(entryOf(e, QStringLiteral("factory"), e.value(u"category").toString()));
        }
        return out;
    }();
    auto out = factory;
    if (nt::midi::userStepPatternLibraryRoot().isEmpty()) return out;
    const auto listed = nt::midi::runStepPatternOp({}, QStringLiteral("list_step_patterns"), {});
    for (const auto& value : listed.result.value(u"entries").toArray()) {
        const auto e = value.toObject();
        if (e.value(u"source").toString() != u"user") continue;
        const auto folder = e.value(u"folder").toString();
        out.append(entryOf(e, QStringLiteral("user"), folder.isEmpty() ? QObject::tr("User") : QObject::tr("User · %1").arg(folder)));
    }
    return out;
}
}  // namespace

void StepSequencerController::onTimelineChanged() {
    updateFirstMidiTrack();
    // Skip edits that leave this clip and its track alone (TimelineModel tracks
    // both; a full change reports every id as touched).
    // A tempo or track property edit marks no ids, so compare those inputs too.
    if (m_timeline && !m_clipId.isEmpty() && !m_timeline->clipTouched(m_clipId) &&
        (m_trackId.isEmpty() || !m_timeline->trackTouched(m_trackId)) && m_tempoDoc == tempoDoc() && m_trackRaw == trackRaw()) {
        return;
    }
    reload();
}

QJsonObject StepSequencerController::tempoDoc() const {
    return m_timeline ? QJsonObject{{QStringLiteral("tempo"), m_timeline->timeline().raw.value(u"tempo")}} : QJsonObject{};
}

QJsonObject StepSequencerController::trackRaw() const {
    if (!m_timeline || m_trackId.isEmpty()) return {};
    for (const auto& value : m_timeline->timeline().raw.value(u"tracks").toArray()) {
        if (value.toObject().value(u"id").toString() == m_trackId) return value.toObject();
    }
    return {};
}

void StepSequencerController::reload() {
    ++m_reloadCount;
    const nt::Clip* clip = m_timeline && !m_clipId.isEmpty() ? m_timeline->findClip(m_clipId) : nullptr;
    const auto raw = clip ? clip->raw : QJsonObject{};
    const bool midi = clip && raw.value(u"mediaType").toString() == u"midi";
    m_clipRaw = raw;
    m_valid = midi && raw.value(u"pattern").isObject();
    m_convertible = midi && !m_valid;
    m_clipName = raw.value(u"name").toString();
    m_locked = raw.value(u"locked").toBool();
    m_trackId = raw.value(u"trackId").toString();
    m_trackName.clear();
    m_trackColor.clear();
    const auto previousInstrument = m_instrument;
    const auto previousEffects = m_effects;
    m_instrument = {};
    m_effects = {};
    m_trackRaw = trackRaw();
    if (midi && !m_trackRaw.isEmpty()) {
        m_locked = m_locked || m_trackRaw.value(u"locked").toBool();
        m_trackName = m_trackRaw.value(u"name").toString();
        m_trackColor = m_trackRaw.value(u"color").toString();
        m_instrument = m_trackRaw.value(u"instrument").toObject();
        m_effects = m_trackRaw.value(u"effects").toArray();
    }
    m_tempoDoc = tempoDoc();
    const auto pattern = m_valid ? nt::midi::normalizePattern(raw.value(u"pattern").toObject()) : QJsonObject{};
    m_settings.clear();
    m_patternText.clear();
    QVariantList rows;
    if (m_valid) {
        auto settings = pattern;
        settings.remove(QStringLiteral("rows"));
        settings.insert(QStringLiteral("patternPhaseTicks"), raw.value(u"patternPhaseTicks").toDouble(0));
        m_settings = settings.toVariantMap();
        for (const auto& value : pattern.value(u"rows").toArray()) {
            const auto row = value.toObject();
            const auto assignment = row.value(u"assignment").toObject();
            QVariantList steps;
            for (const auto& step : row.value(u"steps").toArray()) {
                auto n = nt::midi::normalizeStep(step.toObject());
                n.insert(QStringLiteral("set"), step.toObject().keys().join(u','));
                steps.append(n.toVariantMap());
            }
            auto entry = row.toVariantMap();
            entry.insert("label", nt::midi::rowLabel(row, m_instrument));
            entry.insert("type", assignment.value(u"type").toString());
            entry.insert("targetKind", assignment.value(u"target").toObject().value(u"kind").toString());
            const QJsonObject pitchCtx{{QStringLiteral("instrument"), m_instrument}};
            const auto pitch = nt::midi::stepPitch(row, QJsonObject{{QStringLiteral("on"), true}}, pitchCtx);
            entry.insert("pitch", pitch ? *pitch : -1);
            entry.insert("steps", steps);
            rows.append(entry);
        }
        m_patternText = nt::midi::patternToText(pattern, m_instrument);
    }
    setRecordStep(m_recordStep);
    if (!editable()) { setLearnMode({}); setStepRecording(false); }
    m_rowModel->setRows(rows);
    m_spansDirty = true;
    if (m_playheadMs >= 0) setPlayheadMs(m_playheadMs);
    emit patternChanged();
    if (m_instrument != previousInstrument || m_effects != previousEffects) emit addRowGroupsChanged();
}

void StepSequencerController::setLastError(const QString& error) {
    if (m_lastError == error) return;
    m_lastError = error;
    emit lastErrorChanged();
}

QVariantMap StepSequencerController::runOp(const QString& op, const QVariantMap& args) {
    return runOps(QVariantList{QVariantMap{{"op", op}, {"args", args}}});
}

QVariantMap StepSequencerController::runOps(const QVariantList& ops) {
    const auto failWith = [this](const QString& error) {
        setLastError(error);
        return QVariantMap{{"ok", false}, {"error", error}};
    };
    if (!m_timeline) return failWith(tr("No timeline."));
    if (ops.isEmpty()) return failWith(tr("No step sequencer edit."));
    // Ops that leave the document alone: reads and user library file edits.
    static const QSet<QString> kLibraryOps{"get_pattern", "list_step_patterns", "save_step_pattern", "create_step_pattern_folder",
                                           "rename_step_pattern_folder", "delete_step_pattern_folder", "move_step_pattern"};
    std::vector<std::pair<QString, QJsonObject>> calls;
    bool readOnlyOps = true;
    for (const auto& value : ops) {
        const auto entry = value.toMap();
        const auto op = entry.value(QStringLiteral("op")).toString();
        auto payload = QJsonObject::fromVariantMap(entry.value(QStringLiteral("args")).toMap());
        if (!payload.contains(u"clipId") && !payload.contains(u"trackId") && nt::midi::stepPatternOpTakes(op, QStringLiteral("clipId"))) {
            payload.insert(QStringLiteral("clipId"), m_clipId);
        }
        const QString canonical = nt::midi::canonicalStepPatternOp(op);
        readOnlyOps = readOnlyOps && kLibraryOps.contains(canonical);
        // An op on this clip needs a pattern or MIDI clip that is not locked. An op
        // that names another clip or a track runs its own lock checks.
        if (!canonical.isEmpty() && !kLibraryOps.contains(canonical) &&
            !m_clipId.isEmpty() && payload.value(u"clipId").toString() == m_clipId && (m_locked || (!m_valid && !m_convertible))) {
            return failWith(tr("This pattern is locked or read-only."));
        }
        calls.emplace_back(op, payload);
    }
    if (readOnlyOps) {
        nt::midi::StepPatternOpOutcome outcome;
        for (const auto& [op, payload] : calls) {
            outcome = nt::midi::runStepPatternOp(m_timeline->timeline().raw, op, payload);
            if (!outcome.ok) return failWith(outcome.error);
        }
        setLastError({});
        return outcome.result.toVariantMap();
    }
    if (m_timeline->readOnly()) return failWith(tr("This timeline is read-only."));
    nt::midi::StepPatternOpOutcome outcome;
    const auto token = m_timeline->applyEdit(tr("Edit Step Pattern"), {}, [&outcome, &calls](QJsonObject doc, const QJsonObject&) {
        for (const auto& [op, payload] : calls) {
            outcome = nt::midi::runStepPatternOp(doc, op, payload);
            if (!outcome.ok) throw std::runtime_error(outcome.error.toStdString());
            if (outcome.mutated) doc = outcome.nextDocument;
        }
        outcome.nextDocument = doc;
        return doc;
    });
    if (!outcome.ok) return failWith(outcome.error);
    if (token == 0 && outcome.nextDocument != m_timeline->timeline().raw) return failWith(tr("Could not apply the step sequencer edit."));
    setLastError({});
    return outcome.result.toVariantMap();
}

void StepSequencerController::ensureSpans() {
    if (!m_spansDirty) return;
    m_spansDirty = false;
    m_spans = m_valid ? nt::midi::patternStepSpans(m_clipRaw, m_tempoDoc) : nt::midi::PatternStepSpans{};
}

int StepSequencerController::stepAt(const QString& rowId, double ms) {
    if (!m_valid || ms < 0) return -1;
    ensureSpans();
    const double tick = (ms - m_clipRaw.value(u"startMs").toDouble()) * m_spans.ticksPerMs;
    if (!(tick >= 0) || tick >= static_cast<double>(m_spans.clipLengthTicks)) return -1;
    const auto it = m_spans.rows.constFind(rowId);
    if (it == m_spans.rows.constEnd()) return -1;
    const auto& spans = *it;
    const auto t = static_cast<std::int64_t>(tick);
    auto after = std::upper_bound(spans.begin(), spans.end(), t, [](std::int64_t v, const nt::midi::StepSpan& s) { return v < s.startTick; });
    if (after == spans.begin()) return -1;
    --after;
    return t < after->endTick ? after->stepIndex : -1;
}

void StepSequencerController::setPlayheadMs(double ms) {
    const double next = std::isfinite(ms) ? ms : -1;
    QHash<QString, int> playing;
    if (next >= 0 && m_valid) {
        for (const auto& row : m_rowModel->rows()) {
            const auto id = row.toMap().value(QStringLiteral("id")).toString();
            playing.insert(id, stepAt(id, next));
        }
    }
    m_rowModel->setPlayingSteps(playing);
    if (m_playheadMs == next) return;
    m_playheadMs = next;
    emit playheadMsChanged();
}

int StepSequencerController::playingStep(const QString& rowId, double ms) { return stepAt(rowId, ms); }

QString StepSequencerController::noteName(int pitch) const { return nt::midi::stepNoteName(pitch); }

void StepSequencerController::reloadLibrary() {
    const auto next = loadLibrary();
    if (next == m_library) return;
    m_library = next;
    m_libraryModel->setLibrary(m_library);
    emit libraryChanged();
}

void StepSequencerController::setLearnMode(const QString& mode) {
    const QString next = editable() && (mode == u"add" || mode == u"assign") ? mode : QString();
    if (!next.isEmpty()) setStepRecording(false);
    if (m_learnMode == next) return;
    m_learnMode = next;
    emit learnModeChanged();
}

QVariantMap StepSequencerController::learnNote(int pitch, const QString& rowId) {
    if (m_learnMode.isEmpty()) return {{"ok", false}, {"error", tr("Learn is off.")}};
    QVariantMap args{{"mode", m_learnMode}, {"pitch", pitch}};
    if (m_learnMode == u"assign") args.insert("row", rowId);
    return runOp(QStringLiteral("learn_pattern_row"), args);
}

QVariantMap StepSequencerController::learnController(const QVariantMap& target, const QString& rowId) {
    if (m_learnMode.isEmpty()) return {{"ok", false}, {"error", tr("Learn is off.")}};
    QVariantMap args{{"mode", m_learnMode}, {"controller", target}};
    if (m_learnMode == u"assign") args.insert("row", rowId);
    return runOp(QStringLiteral("learn_pattern_row"), args);
}

void StepSequencerController::setStepRecording(bool on) {
    on = on && editable();
    if (on) setLearnMode({});
    if (m_stepRecording == on) return;
    m_stepRecording = on;
    m_heldNotes.clear();
    m_chordNotes.clear();
    emit stepRecordingChanged();
}

void StepSequencerController::setRecordStep(int step) {
    const int length = std::max(1, m_settings.value(QStringLiteral("lengthSteps")).toInt());
    const int next = std::clamp(step, 0, length - 1);
    if (m_recordStep == next) return;
    m_recordStep = next;
    emit recordStepChanged();
}

void StepSequencerController::stepRecordNoteOn(int pitch, int velocity) {
    if (!m_stepRecording || !editable() || pitch < 0 || pitch > 127) return;
    m_heldNotes.insert(pitch);
    m_chordNotes.insert(pitch, std::clamp(velocity, 1, 127));
}

void StepSequencerController::stepRecordNoteOff(int pitch) {
    if (!m_stepRecording || !m_heldNotes.remove(pitch) || !m_heldNotes.isEmpty() || m_chordNotes.isEmpty()) return;
    QVariantList ops;
    for (auto it = m_chordNotes.cbegin(); it != m_chordNotes.cend(); ++it) {
        ops.append(QVariantMap{{"op", "step_record"}, {"args", QVariantMap{{"step", m_recordStep + 1},
                     {"pitches", QVariantList{it.key()}}, {"velocity", it.value()}}}});
    }
    m_chordNotes.clear();
    const auto result = runOps(ops);
    if (!result.value(QStringLiteral("ok")).toBool()) return;
    const int length = std::max(1, m_settings.value(QStringLiteral("lengthSteps")).toInt());
    setRecordStep((m_recordStep + 1) % length);
}

QVariantMap StepSequencerController::savePattern(const QString& name, const QString& kind, const QString& folder) {
    QVariantMap args{{"name", name}, {"kind", kind}};
    if (!folder.isEmpty()) args.insert("folder", folder);
    return runOp(QStringLiteral("save_step_pattern"), args);
}
