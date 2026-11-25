#include "midi/StepSequencerController.h"

#include "audio/automation/Automation.h"
#include "midi/PatternOps.h"
#include "model/TimelineModel.h"

#include <QJsonArray>
#include <QJsonObject>

#include <algorithm>
#include <array>
#include <utility>
#include <stdexcept>

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
    for (const auto& [kind, header] : {std::pair{QStringLiteral("pattern"), tr("Patterns")}, std::pair{QStringLiteral("template"), tr("Templates")}}) {
        m_all.push_back(Item{header, {{"kind", kind}}});
        for (const auto& value : library) {
            const auto entry = value.toMap();
            if (entry.value(QStringLiteral("kind")).toString() == kind) m_all.push_back(Item{{}, entry});
        }
    }
    for (int i = 0; i < static_cast<int>(m_all.size()); ++i) m_rows.push_back(i);
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

void StepSequencerLibraryModel::setQuery(const QString& query) {
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
      m_libraryModel(new StepSequencerLibraryModel(library(), this)) {}

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
    return groups;
}

void StepSequencerController::setTimeline(TimelineModel* timeline) {
    if (m_timeline == timeline) return;
    if (m_timeline) disconnect(m_timeline, nullptr, this, nullptr);
    m_timeline = timeline;
    if (m_timeline) {
        // TimelineModel emits clipsChanged and then timelineChanged for one edit;
        // timelineChanged alone covers clip, track and tempo changes.
        connect(m_timeline, &TimelineModel::timelineChanged, this, &StepSequencerController::onTimelineChanged);
        connect(m_timeline, &TimelineModel::readOnlyChanged, this, &StepSequencerController::patternChanged);
    }
    emit timelineChanged();
    reload();
}

void StepSequencerController::setClipId(const QString& clipId) {
    if (m_clipId == clipId) return;
    m_clipId = clipId;
    emit clipIdChanged();
    reload();
}

bool StepSequencerController::editable() const { return m_valid && !m_locked && m_timeline && !m_timeline->readOnly(); }

QVariantList StepSequencerController::library() const {
    static const QVariantList entries = [] {
        QVariantList out;
        for (const auto& value : nt::midi::factoryStepPatternLibrary()) {
            const auto e = value.toObject();
            out.append(QVariantMap{{"id", e.value(u"id").toString()},
                                   {"name", e.value(u"name").toString()},
                                   {"kind", e.value(u"kind").toString(QStringLiteral("pattern"))},
                                   {"category", e.value(u"category").toString()},
                                   {"tags", e.value(u"tags").toArray().toVariantList()},
                                   {"search", QStringList{e.value(u"id").toString(), e.value(u"name").toString(),
                                                          e.value(u"category").toString(),
                                                          e.value(u"tags").toVariant().toStringList().join(u' ')}
                                                  .join(u' ')
                                                  .toLower()}});
        }
        return out;
    }();
    return entries;
}

void StepSequencerController::onTimelineChanged() {
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
    m_instrument = {};
    m_trackRaw = trackRaw();
    if (midi && !m_trackRaw.isEmpty()) {
        m_locked = m_locked || m_trackRaw.value(u"locked").toBool();
        m_trackName = m_trackRaw.value(u"name").toString();
        m_trackColor = m_trackRaw.value(u"color").toString();
        m_instrument = m_trackRaw.value(u"instrument").toObject();
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
    m_rowModel->setRows(rows);
    m_spansDirty = true;
    if (m_playheadMs >= 0) setPlayheadMs(m_playheadMs);
    emit patternChanged();
    if (m_instrument != previousInstrument) emit addRowGroupsChanged();
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
        readOnlyOps = readOnlyOps && (canonical == u"get_pattern" || canonical == u"list_step_patterns" || canonical == u"save_step_pattern");
        // An op on this clip needs a pattern or MIDI clip that is not locked. An op
        // that names another clip or a track runs its own lock checks.
        if (!canonical.isEmpty() && canonical != u"get_pattern" && canonical != u"list_step_patterns" && canonical != u"save_step_pattern" &&
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
