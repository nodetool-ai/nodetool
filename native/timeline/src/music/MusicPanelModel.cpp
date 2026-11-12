#include "music/MusicPanelModel.h"

#include "music/MusicDocument.h"
#include "music/MusicRange.h"

#include <QJsonArray>

namespace {
QString text(std::string_view value) { return QString::fromUtf8(value.data(), static_cast<qsizetype>(value.size())); }

// packages/runtime/src/providers/acestep-models.ts: the turbo DiT runs Generate and
// Regenerate, and only the base DiT runs Add instrument (BE-3).
const QString kTurboDit = QStringLiteral("acestep-v15-turbo-Q8_0.gguf");
const QString kBaseDit = QStringLiteral("acestep-v15-base-Q8_0.gguf");
QVariantMap modelOption(const QString& value, const QString& label) { return {{"value", value}, {"label", label}}; }
} // namespace

MusicPanelModel::MusicPanelModel(QObject* parent) : QObject(parent) {}

void MusicPanelModel::setTimeline(TimelineModel* timeline) {
    if (m_timeline == timeline) {
        return;
    }
    if (m_timeline) {
        disconnect(m_timeline, nullptr, this, nullptr);
    }
    m_timeline = timeline;
    if (timeline) {
        connect(timeline, &TimelineModel::timelineChanged, this, &MusicPanelModel::refresh);
    }
    emit inputsChanged();
    refresh();
}

void MusicPanelModel::setSelection(MusicSelection* selection) {
    if (m_selection == selection) {
        return;
    }
    if (m_selection) {
        disconnect(m_selection, nullptr, this, nullptr);
    }
    m_selection = selection;
    if (selection) {
        connect(selection, &MusicSelection::changed, this, [this] {
            // A new range starts from the inferred operation again.
            if (!m_choice.isEmpty()) {
                m_choice.clear();
                emit inputsChanged();
            }
            refresh();
        });
    }
    emit inputsChanged();
    refresh();
}

void MusicPanelModel::setOperationChoice(const QString& task) {
    const QString next = nt::music::parseTask(task.toStdString()) ? task : QString();
    if (next == m_choice) {
        return;
    }
    m_choice = next;
    emit inputsChanged();
    refresh();
}

nt::music::PlanInput MusicPanelModel::planInput(std::optional<nt::music::MusicTask> operation) const {
    const QJsonObject raw = m_timeline ? m_timeline->timeline().raw : QJsonObject{};
    QJsonObject selection;
    if (m_selection && m_selection->active()) {
        selection = {{"trackId", m_selection->trackId()},
                     {"startFrame", m_selection->startFrameValue()},
                     {"endFrame", m_selection->endFrameValue()}};
    }
    QJsonObject tempo = raw.value(u"tempo").toObject();
    if (tempo.isEmpty()) {
        tempo = {{"bpm", 120}, {"offsetMs", 0}, {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}}};
    }
    QJsonObject value{{"tempo", tempo},
                      {"selection", selection},
                      {"tracks", raw.value(u"tracks").toArray()},
                      {"clips", raw.value(u"clips").toArray()}};
    if (operation) {
        value.insert("operation", text(nt::music::taskName(*operation)));
    }
    return nt::music::planInputFromJson(value);
}

void MusicPanelModel::refresh() {
    const QJsonObject raw = m_timeline ? m_timeline->timeline().raw : QJsonObject{};
    const bool active = m_selection && m_selection->active();
    m_trackId = active ? m_selection->trackId() : QString();
    m_trackName.clear();
    m_trackRole.clear();
    for (const auto& value : raw.value(u"tracks").toArray()) {
        const auto track = value.toObject();
        if (!m_trackId.isEmpty() && track.value(u"id").toString() == m_trackId) {
            m_trackName = track.value(u"name").toString();
            m_trackRole = QString::fromStdString(nt::music::trackMusicRole(track).value_or(std::string()));
        }
    }
    m_startFrame = active ? m_selection->startFrameValue() : 0;
    m_endFrame = active ? m_selection->endFrameValue() : 0;
    m_rangeText.clear();
    m_lengthText.clear();
    const auto tempo = nt::music::sequenceTempo(raw);
    if (active && tempo) {
        const nt::music::FrameRange range{m_selection->startFrame(), m_selection->endFrame()};
        m_rangeText = nt::music::barRangeLabel(range, *tempo);
        m_lengthText = nt::music::rangeLengthLabel(range, *tempo);
    }

    const auto choice = nt::music::parseTask(m_choice.toStdString());
    const auto plan = nt::music::planMusicOperation(planInput(choice));
    m_inferred = plan.inferred ? text(nt::music::taskName(*plan.inferred)) : QString();
    m_operation = plan.operation ? text(nt::music::taskName(*plan.operation)) : QString();
    m_reason = active ? QString::fromStdString(plan.reason) : QString();
    m_refusal = QString::fromStdString(plan.refusal);
    m_operations.clear();
    for (const auto task : nt::music::kMusicTasks) {
        const bool valid = std::ranges::find(plan.valid, task) != plan.valid.end();
        QString why;
        if (!valid && active) {
            why = QString::fromStdString(nt::music::planMusicOperation(planInput(task)).reason);
        }
        m_operations.append(QVariantMap{{"value", text(nt::music::taskName(task))},
                                        {"label", text(nt::music::taskLabel(task))},
                                        {"enabled", valid},
                                        {"reason", why}});
    }
    m_modelOptions.clear();
    if (plan.operation == nt::music::MusicTask::Lego) {
        m_modelOptions.append(modelOption(kBaseDit, tr("ACE-Step 1.5 base")));
    } else if (plan.operation) {
        m_modelOptions.append(modelOption(kTurboDit, tr("ACE-Step 1.5 turbo")));
        m_modelOptions.append(modelOption(kBaseDit, tr("ACE-Step 1.5 base")));
    }
    emit changed();
}

bool MusicPanelModel::setTrackRole(const QString& role) {
    if (!m_timeline || m_trackId.isEmpty() || role == m_trackRole) {
        return false;
    }
    return m_timeline->applyEdit(QStringLiteral("music.setTrackRole"), {{"trackId", m_trackId}, {"role", role}}) != 0;
}
