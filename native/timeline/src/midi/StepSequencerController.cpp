#include "midi/StepSequencerController.h"

#include "app/EditRegistry.h"
#include "midi/PatternExpand.h"
#include "midi/PatternOps.h"
#include "model/TimelineModel.h"
#include "ui/Tempo/TempoGrid.h"
#include "ui/Tempo/TempoJson.h"

#include <QJsonArray>
#include <QJsonObject>

#include <cmath>
#include <stdexcept>

namespace {
// One step sequencer edit, replayed from its operation and arguments.
const bool stepSequencerEditRegistered =
    nt::app::registerEdit(QStringLiteral("stepSequencer.op"), [](QJsonObject before, const QJsonObject& payload) {
        const auto outcome = nt::midi::runStepPatternOp(before, payload.value(u"operation").toString(), payload.value(u"args").toObject());
        if (!outcome.ok) throw std::runtime_error(outcome.error.toStdString());
        return outcome.nextDocument;
    });
}  // namespace

void StepSequencerController::setTimeline(TimelineModel* timeline) {
    if (m_timeline == timeline) return;
    if (m_timeline) disconnect(m_timeline, nullptr, this, nullptr);
    m_timeline = timeline;
    if (m_timeline) {
        connect(m_timeline, &TimelineModel::clipsChanged, this, &StepSequencerController::reload);
        connect(m_timeline, &TimelineModel::timelineChanged, this, &StepSequencerController::reload);
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
    QVariantList out;
    for (const auto& value : nt::midi::factoryStepPatternLibrary()) {
        const auto e = value.toObject();
        out.append(QVariantMap{{"id", e.value(u"id").toString()},
                               {"name", e.value(u"name").toString()},
                               {"kind", e.value(u"kind").toString(QStringLiteral("pattern"))},
                               {"category", e.value(u"category").toString()},
                               {"tags", e.value(u"tags").toArray().toVariantList()}});
    }
    return out;
}

void StepSequencerController::reload() {
    (void)stepSequencerEditRegistered;
    const nt::Clip* clip = m_timeline && !m_clipId.isEmpty() ? m_timeline->findClip(m_clipId) : nullptr;
    const auto raw = clip ? clip->raw : QJsonObject{};
    const bool midi = clip && raw.value(u"mediaType").toString() == u"midi";
    m_valid = midi && raw.value(u"pattern").isObject();
    m_convertible = midi && !m_valid;
    m_clipName = raw.value(u"name").toString();
    m_locked = raw.value(u"locked").toBool();
    m_startMs = raw.value(u"startMs").toDouble();
    m_inPointMs = raw.value(u"inPointMs").toDouble();
    m_trackName.clear();
    m_trackColor.clear();
    QJsonObject instrument;
    if (midi) {
        const auto trackId = raw.value(u"trackId").toString();
        for (const auto& value : m_timeline->timeline().raw.value(u"tracks").toArray()) {
            const auto track = value.toObject();
            if (track.value(u"id").toString() != trackId) continue;
            m_locked = m_locked || track.value(u"locked").toBool();
            m_trackName = track.value(u"name").toString();
            m_trackColor = track.value(u"color").toString();
            instrument = track.value(u"instrument").toObject();
        }
    }
    const auto tempo = nt::tempo::json::tempo(nt::tempo::json::resolveTempo(m_timeline ? m_timeline->timeline().raw : QJsonObject{}));
    m_bpm = std::isfinite(tempo.bpm) && tempo.bpm > 0 ? tempo.bpm : 120;
    m_pattern = m_valid ? nt::midi::normalizePattern(raw.value(u"pattern").toObject()) : QJsonObject{};
    m_settings.clear();
    m_rows.clear();
    m_patternText.clear();
    if (m_valid) {
        auto settings = m_pattern;
        settings.remove(QStringLiteral("rows"));
        settings.insert(QStringLiteral("patternPhaseTicks"), raw.value(u"patternPhaseTicks").toDouble(0));
        m_settings = settings.toVariantMap();
        for (const auto& value : m_pattern.value(u"rows").toArray()) {
            const auto row = value.toObject();
            const auto assignment = row.value(u"assignment").toObject();
            QVariantList steps;
            for (const auto& step : row.value(u"steps").toArray()) {
                auto n = nt::midi::normalizeStep(step.toObject());
                n.insert(QStringLiteral("set"), step.toObject().toVariantMap().keys().join(u','));
                steps.append(n.toVariantMap());
            }
            auto entry = row.toVariantMap();
            entry.insert("label", nt::midi::rowLabel(row, instrument));
            entry.insert("type", assignment.value(u"type").toString());
            entry.insert("targetKind", assignment.value(u"target").toObject().value(u"kind").toString());
            QJsonObject pitchCtx{{QStringLiteral("instrument"), instrument}};
            const auto pitch = nt::midi::stepPitch(row, QJsonObject{{QStringLiteral("on"), true}}, pitchCtx);
            entry.insert("pitch", pitch ? *pitch : -1);
            entry.insert("steps", steps);
            m_rows.append(entry);
        }
        m_patternText = nt::midi::patternToText(m_pattern, instrument);
    }
    emit patternChanged();
}

void StepSequencerController::setLastError(const QString& error) {
    if (m_lastError == error) return;
    m_lastError = error;
    emit lastErrorChanged();
}

QVariantMap StepSequencerController::runOp(const QString& op, const QVariantMap& args) {
    auto payload = QJsonObject::fromVariantMap(args);
    if (!payload.contains(u"clipId") && !payload.contains(u"clipIds") && !payload.contains(u"trackId")) {
        payload.insert(QStringLiteral("clipId"), m_clipId);
    }
    if (!m_timeline) {
        setLastError(tr("No timeline."));
        return {{"ok", false}, {"error", m_lastError}};
    }
    auto outcome = nt::midi::runStepPatternOp(m_timeline->timeline().raw, op, payload);
    if (!outcome.ok) {
        setLastError(outcome.error);
        return {{"ok", false}, {"error", outcome.error}};
    }
    if (outcome.mutated && outcome.nextDocument != m_timeline->timeline().raw) {
        if (!editable() && !m_convertible) {
            setLastError(tr("This pattern is locked or read-only."));
            return {{"ok", false}, {"error", m_lastError}};
        }
        if (m_timeline->applyEdit(QStringLiteral("stepSequencer.op"),
                                  QJsonObject{{QStringLiteral("operation"), op}, {QStringLiteral("args"), payload}}) == 0) {
            setLastError(tr("Could not apply the step sequencer edit."));
            return {{"ok", false}, {"error", m_lastError}};
        }
    }
    setLastError({});
    return outcome.result.toVariantMap();
}

int StepSequencerController::playingStep(const QString& rowId, double ms) const {
    if (!m_valid) return -1;
    const double phase = m_settings.value("patternPhaseTicks").toDouble();
    const double tick = (ms - m_startMs + m_inPointMs) * m_bpm * 960.0 / 60000.0 + phase;
    if (tick < 0) return -1;
    const auto seed = static_cast<std::uint32_t>(static_cast<std::int64_t>(m_pattern.value(u"seed").toDouble(1)));
    for (const auto& value : m_pattern.value(u"rows").toArray()) {
        const auto row = value.toObject();
        if (row.value(u"id").toString() != rowId) continue;
        const auto first = nt::midi::rowSchedule(row, seed, 0);
        std::int64_t cycleLen = 0;
        for (const auto& e : first) cycleLen += e.lengthTicks;
        if (cycleLen <= 0) return -1;
        const auto t = static_cast<std::int64_t>(tick);
        const auto cycle = static_cast<std::uint32_t>(t / cycleLen);
        const auto local = t % cycleLen;
        const auto entries = cycle == 0 ? first : nt::midi::rowSchedule(row, seed, cycle);
        const auto base = entries.empty() ? 0 : entries.front().startTick;
        for (const auto& e : entries) {
            if (local >= e.startTick - base && local < e.startTick - base + e.lengthTicks) return e.stepIndex;
        }
        return -1;
    }
    return -1;
}

QString StepSequencerController::noteName(int pitch) const { return nt::midi::stepNoteName(pitch); }
