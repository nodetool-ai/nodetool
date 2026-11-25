#include "midi/StepSequencerController.h"

#include "midi/PatternOps.h"
#include "model/TimelineModel.h"

#include <QJsonArray>
#include <QJsonObject>

#include <algorithm>
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

StepSequencerController::StepSequencerController(QObject* parent)
    // NOLINT(cppcoreguidelines-owning-memory): parented to this controller
    : QObject(parent), m_rowModel(new StepSequencerRowModel(this)) {}

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
    if (m_timeline && !m_clipId.isEmpty() && !m_timeline->clipTouched(m_clipId) &&
        (m_trackId.isEmpty() || !m_timeline->trackTouched(m_trackId))) {
        return;
    }
    reload();
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
    m_instrument = {};
    if (midi) {
        for (const auto& value : m_timeline->timeline().raw.value(u"tracks").toArray()) {
            const auto track = value.toObject();
            if (track.value(u"id").toString() != m_trackId) continue;
            m_locked = m_locked || track.value(u"locked").toBool();
            m_trackName = track.value(u"name").toString();
            m_trackColor = track.value(u"color").toString();
            m_instrument = track.value(u"instrument").toObject();
        }
    }
    m_tempoDoc = m_timeline ? QJsonObject{{QStringLiteral("tempo"), m_timeline->timeline().raw.value(u"tempo")}} : QJsonObject{};
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
