#include "music/MusicPanelModel.h"

#include "music/MusicDocument.h"
#include "music/MusicRange.h"

#include <QJsonArray>

#include <algorithm>
#include <cmath>

namespace {
QString text(std::string_view value) { return QString::fromUtf8(value.data(), static_cast<qsizetype>(value.size())); }

// packages/runtime/src/providers/acestep-models.ts: the turbo DiT runs Generate and
// Regenerate, and only the base DiT runs Add instrument (BE-3).
const QString kTurboDit = QStringLiteral("acestep-v15-turbo-Q8_0.gguf");
const QString kBaseDit = QStringLiteral("acestep-v15-base-Q8_0.gguf");
QVariantMap modelOption(const QString& value, const QString& label) { return {{"value", value}, {"label", label}}; }

// "bars 9–12" inside a sentence.
QString bars(const nt::music::FrameRange& range, const nt::music::MusicTempo& tempo) {
    auto label = nt::music::barRangeLabel(range, tempo);
    if (!label.isEmpty()) label[0] = label[0].toLower();
    return label;
}

QString seconds(std::int64_t frames) {
    return QStringLiteral("%1 s").arg(static_cast<double>(frames) / static_cast<double>(nt::music::kSampleRate), 0, 'f', 1);
}

QString signedMs(double ms) {
    const auto rounded = std::lround(ms);
    return (rounded >= 0 ? QStringLiteral("+") : QString()) + QStringLiteral("%1 ms").arg(rounded);
}

nt::music::FrameRange clipFrames(const QJsonObject& clip) {
    const double start = clip.value(u"startMs").toDouble();
    return {nt::music::msToFrame(start), nt::music::msToFrame(start + clip.value(u"durationMs").toDouble())};
}

QString roleLabel(const QString& role) {
    return role.isEmpty() ? QString() : text(nt::music::musicRoleLabel(role.toStdString()));
}

// The take the clip plays: its activeTakeId, else the take that holds its asset.
QString activeTakeId(const QJsonObject& clip) {
    const auto versions = clip.value(u"versions").toArray();
    const auto active = clip.value(u"activeTakeId").toString();
    const auto asset = clip.value(u"currentAssetId").toString();
    QString byAsset;
    for (const auto& value : versions) {
        const auto take = value.toObject();
        if (!active.isEmpty() && take.value(u"id").toString() == active && take.value(u"assetId").toString() == asset) return active;
        if (byAsset.isEmpty() && !asset.isEmpty() && take.value(u"assetId").toString() == asset) byAsset = take.value(u"id").toString();
    }
    return byAsset.isEmpty() ? active : byAsset;
}
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

void MusicPanelModel::setCandidates(int candidates) {
    if (candidates == m_candidates) return;
    m_candidates = candidates;
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
    refreshSummary(plan, raw);
    refreshTakes(raw);
    emit changed();
}

void MusicPanelModel::refreshSummary(const nt::music::MusicPlan& plan, const QJsonObject& raw) {
    using namespace nt::music;
    m_targetTitle.clear();
    m_targetDetail.clear();
    m_planSummary.clear();
    m_actionLabel.clear();
    m_contextLabel.clear();
    m_contextStart = 0;
    m_contextEnd = 0;
    const auto tempo = sequenceTempo(raw);
    if (!hasTarget() || !tempo) return;
    const FrameRange target{static_cast<std::int64_t>(m_startFrame), static_cast<std::int64_t>(m_endFrame)};
    const auto trackName = m_trackName.isEmpty() ? tr("Untitled track") : m_trackName;
    m_targetTitle = trackName + QStringLiteral(" · ") + bars(target, *tempo);
    m_targetDetail = QStringLiteral("%1 · %2 · role %3")
                         .arg(m_lengthText, seconds(target.endFrame - target.startFrame),
                              m_trackRole.isEmpty() ? tr("none") : roleLabel(m_trackRole));
    if (!plan.refusal.empty() || !plan.operation || !plan.requestFrames || !plan.windowStartFrame) return;
    const int candidates = std::clamp(m_candidates, 1, 4);
    const auto takesText = [](int count, const QString& suffix = {}) {
        return (count == 1 ? QStringLiteral("1 take") : QStringLiteral("%1 takes").arg(count)) + suffix;
    };
    const FrameRange window{*plan.windowStartFrame, *plan.windowStartFrame + *plan.requestFrames};
    switch (*plan.operation) {
    case MusicTask::Text2Music: {
        const auto segments = static_cast<int>(plan.segments ? plan.segments->size() : 1);
        const auto length = target.endFrame - target.startFrame;
        QString signature = QStringLiteral("%1/%2").arg(plan.beatsPerBar).arg(plan.beatUnit);
        QString key = plan.key ? QStringLiteral("%1 %2, ").arg(QString::fromStdString(plan.key->tonic), QString::fromStdString(plan.key->mode))
                               : QString();
        m_planSummary << QStringLiteral("Request %1 (%2 × %3 + 1 beat, at least 10 s)")
                             .arg(seconds(*plan.requestFrames)).arg(segments).arg(seconds(length))
                      << QStringLiteral("%1 × %2 = %3")
                             .arg(segments == 1 ? QStringLiteral("1 segment") : QStringLiteral("%1 segments").arg(segments),
                                  candidates == 1 ? QStringLiteral("1 candidate") : QStringLiteral("%1 candidates").arg(candidates),
                                  takesText(segments * candidates))
                      << QStringLiteral("Sends %1 BPM, %2%3, [Instrumental]").arg(plan.bpm).arg(key, signature);
        m_actionLabel = QStringLiteral("Generate ") + takesText(segments * candidates);
        break;
    }
    case MusicTask::Repaint: {
        QString takeLabel = tr("the clip");
        for (const auto& value : raw.value(u"clips").toArray()) {
            const auto clip = value.toObject();
            if (plan.clipId && clip.value(u"id").toString().toStdString() == *plan.clipId) {
                const auto active = activeTakeId(clip);
                for (const auto& version : clip.value(u"versions").toArray()) {
                    if (version.toObject().value(u"id").toString() == active) takeLabel = version.toObject().value(u"label").toString(takeLabel);
                }
            }
        }
        m_planSummary << QStringLiteral("Repaint %1 of %2").arg(bars(target, *tempo), takeLabel)
                      << QStringLiteral("Model hears %1 (%2) of this track, dry").arg(bars(window, *tempo), seconds(*plan.requestFrames))
                      << QStringLiteral("Outside the range stays bit-identical · 20 ms crossfades")
                      << (candidates == 1 ? QStringLiteral("1 new take") : QStringLiteral("%1 new takes").arg(candidates)) +
                             QStringLiteral(", original kept as a take");
        m_actionLabel = QStringLiteral("Regenerate ") + bars(target, *tempo);
        break;
    }
    case MusicTask::Lego: {
        // The other audible tracks with audio in the window (section 8, "audible").
        const auto tracks = raw.value(u"tracks").toArray();
        bool anySolo = false;
        for (const auto& value : tracks) anySolo = anySolo || value.toObject().value(u"solo").toBool();
        QStringList heard;
        for (const auto& value : tracks) {
            const auto track = value.toObject();
            const auto id = track.value(u"id").toString();
            if (id == m_trackId || track.value(u"muted").toBool() || (anySolo && !track.value(u"solo").toBool())) continue;
            for (const auto& clipValue : raw.value(u"clips").toArray()) {
                const auto clip = clipValue.toObject();
                const auto frames = clipFrames(clip);
                if (clip.value(u"trackId").toString() == id && clip.value(u"mediaType").toString() == u"audio" &&
                    frames.startFrame < window.endFrame && frames.endFrame > window.startFrame) {
                    heard.append(track.value(u"name").toString());
                    break;
                }
            }
        }
        m_planSummary << QStringLiteral("Lego %1 over a mix of %2").arg(roleLabel(m_trackRole), heard.join(QStringLiteral(" + ")))
                      << QStringLiteral("Model hears %1 (%2), places %3")
                             .arg(bars(window, *tempo), seconds(*plan.requestFrames), bars(target, *tempo))
                      << takesText(candidates);
        m_actionLabel = QStringLiteral("Add ") + roleLabel(m_trackRole).toLower();
        break;
    }
    }
    if (*plan.operation != MusicTask::Text2Music) {
        m_contextLabel = QStringLiteral("Model hears ") + bars(window, *tempo);
        m_contextStart = static_cast<double>(window.startFrame);
        m_contextEnd = static_cast<double>(window.endFrame);
    }
}

void MusicPanelModel::refreshTakes(const QJsonObject& raw) {
    using namespace nt::music;
    m_takeClipId.clear();
    m_takeClipTitle.clear();
    m_takeClipPending = false;
    m_takes.clear();
    const auto tempo = sequenceTempo(raw);
    if (!hasTarget() || !tempo) return;
    QJsonObject clip;
    for (const auto& value : raw.value(u"clips").toArray()) {
        const auto candidate = value.toObject();
        const auto frames = clipFrames(candidate);
        if (candidate.value(u"trackId").toString() == m_trackId && candidate.value(u"mediaType").toString() == u"audio" &&
            frames.startFrame <= static_cast<std::int64_t>(m_startFrame) && frames.endFrame >= static_cast<std::int64_t>(m_endFrame)) {
            clip = candidate;
            break;
        }
    }
    if (clip.isEmpty()) return;
    m_takeClipId = clip.value(u"id").toString();
    m_takeClipTitle = (m_trackName.isEmpty() ? tr("Untitled track") : m_trackName) + QStringLiteral(" · ") + bars(clipFrames(clip), *tempo);
    const auto versions = clip.value(u"versions").toArray();
    m_takeClipPending = clip.value(u"status").toString() == u"queued" || versions.isEmpty();
    const auto active = activeTakeId(clip);
    QHash<QString, QString> labels;
    for (const auto& value : versions) {
        labels.insert(value.toObject().value(u"assetId").toString(), value.toObject().value(u"label").toString());
    }
    for (const auto& value : versions) {
        const auto take = value.toObject();
        const auto record = musicGeneration(take);
        const auto alignment = record.value(u"alignment").toObject();
        const auto id = take.value(u"id").toString();
        const bool isActive = id == active;
        QString meta;
        QVariantList rows;
        if (!record.isEmpty()) {
            const double offsetMs = alignment.value(u"offsetFrames").toDouble() * 1000.0 / static_cast<double>(kSampleRate);
            meta = QStringLiteral("seed %1").arg(record.value(u"seed").toInteger());
            if (!alignment.isEmpty()) meta += QStringLiteral(" · ") + signedMs(offsetMs);
            const auto row = [&rows](const QString& name, const QString& value) {
                if (!value.isEmpty()) rows.append(QVariantMap{{"name", name}, {"value", value}});
            };
            const auto steps = record.value(u"steps").toInt();
            row(QStringLiteral("task"), record.value(u"task").toString());
            row(QStringLiteral("model"), take.value(u"model").toString() + (steps > 0 ? QStringLiteral(", %1 steps").arg(steps) : QString()));
            row(QStringLiteral("prompt"), take.value(u"prompt").toString());
            QString tempoText = QStringLiteral("%1 BPM, %2/%3").arg(record.value(u"bpm").toDouble())
                                    .arg(record.value(u"beatsPerBar").toInt()).arg(record.value(u"beatUnit").toInt());
            if (record.value(u"key").isObject()) {
                const auto key = record.value(u"key").toObject();
                tempoText += QStringLiteral(", %1 %2").arg(key.value(u"tonic").toString(), key.value(u"mode").toString());
            }
            row(QStringLiteral("tempo"), tempoText);
            row(QStringLiteral("seed"), QString::number(record.value(u"seed").toInteger()));
            const FrameRange targetRange{record.value(u"targetStartFrame").toInteger(), record.value(u"targetEndFrame").toInteger()};
            if (targetRange.endFrame > targetRange.startFrame) row(QStringLiteral("target"), bars(targetRange, *tempo));
            const FrameRange context{record.value(u"contextStartFrame").toInteger(), record.value(u"contextEndFrame").toInteger()};
            if (context.endFrame > context.startFrame) row(QStringLiteral("context"), bars(context, *tempo));
            const auto splice = record.value(u"splice").toObject();
            if (!splice.isEmpty()) {
                row(QStringLiteral("splice"), labels.value(splice.value(u"parentAssetId").toString(), tr("the original")) +
                                                  QStringLiteral(", 20 ms equal-power crossfades"));
            }
            const auto candidate = record.value(u"candidateIndex").toInt();
            row(QStringLiteral("candidate"), QStringLiteral("%1, segment %2").arg(QChar(u'A' + std::clamp(candidate, 0, 25)))
                                                 .arg(record.value(u"segmentIndex").toInt() + 1));
            if (!alignment.isEmpty()) {
                row(QStringLiteral("grid offset"), QStringLiteral("%1 %2, confidence %3")
                                                       .arg(signedMs(offsetMs),
                                                            alignment.value(u"corrected").toBool() ? QStringLiteral("corrected") : QStringLiteral("not corrected"))
                                                       .arg(alignment.value(u"confidence").toDouble(), 0, 'f', 2));
                row(QStringLiteral("tempo ratio"), QStringLiteral("%1, last beat %2 ms off")
                                                       .arg(alignment.value(u"tempoRatio").toDouble(), 0, 'f', 3)
                                                       .arg(std::lround(alignment.value(u"lastBeatErrorMs").toDouble())));
            }
            row(QStringLiteral("backend"), record.value(u"backend").toString());
        } else if (take.value(u"label").toString() == u"Original") {
            meta = tr("baseline before repaint");
        }
        const bool drifting = alignment.value(u"drifting").toBool();
        m_takes.append(QVariantMap{
            {"id", id},
            {"label", take.value(u"label").toString(QStringLiteral("Take %1").arg(m_takes.size() + 1))},
            {"task", record.value(u"task").toString()},
            {"meta", meta},
            {"drifting", drifting},
            {"driftText", drifting ? QStringLiteral("Last beat lands %1 ms off the grid").arg(std::lround(alignment.value(u"lastBeatErrorMs").toDouble()))
                                   : QString()},
            {"active", isActive},
            {"canDelete", !isActive && versions.size() > 1},
            {"deleteReason", isActive ? tr("Choose another take before deleting this one.") : QString()},
            {"canRegenerate", !record.isEmpty()},
            {"record", rows}});
    }
}

bool MusicPanelModel::selectTake(const QString& takeId) {
    return m_timeline && !m_takeClipId.isEmpty() &&
           m_timeline->applyEdit(QStringLiteral("music.selectTake"), {{"clipId", m_takeClipId}, {"takeId", takeId}}) != 0;
}

bool MusicPanelModel::deleteTake(const QString& takeId) {
    return m_timeline && !m_takeClipId.isEmpty() &&
           m_timeline->applyEdit(QStringLiteral("music.deleteTake"), {{"clipId", m_takeClipId}, {"takeId", takeId}}) != 0;
}

bool MusicPanelModel::recordPrompt(const QString& prompt) {
    return m_timeline && m_timeline->applyEdit(QStringLiteral("music.recordPrompt"), {{"prompt", prompt}}) != 0;
}

bool MusicPanelModel::setTrackRole(const QString& role) {
    if (!m_timeline || m_trackId.isEmpty() || role == m_trackRole) {
        return false;
    }
    return m_timeline->applyEdit(QStringLiteral("music.setTrackRole"), {{"trackId", m_trackId}, {"role", role}}) != 0;
}
