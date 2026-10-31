#include "ClipInspectorController.h"
#include "Keyframes.h"
#include "scene/Animation.h"
#include <QJsonDocument>
#include <algorithm>

void ClipInspectorController::setTimeline(TimelineModel* model) {
    if (m_timeline == model) {
        return;
    }
    cancelGesture();
    if (m_timeline) {
        disconnect(m_timeline, nullptr, this, nullptr);
    }
    m_timeline = model;
    if (model) {
        connect(model, &TimelineModel::beforeCommand, this, [this] {
            if (m_gesturing) { cancelGesture(); m_ignoreCommit = true; }
        });
        connect(model, &TimelineModel::clipsChanged, this, &ClipInspectorController::changed);
        connect(model, &TimelineModel::timelineChanged, this, &ClipInspectorController::changed);
        connect(model, &TimelineModel::documentReplaced, this, [this] {
            m_ignoreCommit = m_gesturing;
            m_gesturing = false;
            m_before = {};
            m_preview = {};
            emit playheadChanged();
        });
        connect(model, &QObject::destroyed, this, [this] {
            m_gesturing = false;
            emit changed();
        });
    }
    emit changed();
    emit playheadChanged();
}
void ClipInspectorController::setClock(PlaybackClock* clock) {
    if (m_clock == clock) {
        return;
    }
    if (m_clock) {
        disconnect(m_clock, nullptr, this, nullptr);
    }
    m_clock = clock;
    if (clock) {
        connect(clock, &PlaybackClock::timeChanged, this, &ClipInspectorController::playheadChanged);
        connect(clock, &QObject::destroyed, this, &ClipInspectorController::playheadChanged);
    }
    emit playheadChanged();
}
void ClipInspectorController::setClipId(const QString& id) {
    if (id == m_clipId) {
        return;
    }
    cancelGesture();
    m_clipId = id;
    emit changed();
    emit playheadChanged();
}
QJsonObject ClipInspectorController::selected() const {
    if (m_timeline) {
        for (const auto& value : m_timeline->clipsJson()) {
            if (value.toObject()["id"] == m_clipId) {
                return value.toObject();
            }
        }
    }
    return {};
}
QVariantMap ClipInspectorController::clip() const { return selected().toVariantMap(); }
bool ClipInspectorController::locked() const {
    const auto c = selected();
    if (c.isEmpty() || c["locked"].toBool()) {
        return true;
    }
    for (const auto& value : m_timeline->timeline().raw["tracks"].toArray()) {
        const auto t = value.toObject();
        if (t["id"] == c["trackId"] && t["locked"].toBool()) {
            return true;
        }
    }
    return false;
}
double ClipInspectorController::playheadMs() const {
    const auto c = selected();
    if (!m_clock || c.isEmpty()) {
        return -1;
    }
    const double relative = m_clock->currentTimeMs() - c["startMs"].toDouble();
    return relative < 0 || relative > c["durationMs"].toDouble() ? -1 : relative;
}
QVariantList ClipInspectorController::rows() const { return nt::keyframes::rowSpecs().toVariantList(); }
QVariantMap ClipInspectorController::rowState(const QString& row) const {
    const auto c = selected();
    const double ms = playheadMs();
    const auto ts = nt::keyframes::times(c, nt::keyframes::properties(row));
    QVariantList values;
    for (const auto& value : nt::keyframes::rowSpecs()) {
        const auto spec = value.toObject();
        if (spec["id"] == row) {
            for (int i = 0; i < spec["inputs"].toArray().size(); ++i) {
                values.append(nt::keyframes::inputValue(c, row, i, std::max(0.0, ms)));
            }
        }
    }
    const auto helper = [&](const QString& name, const QJsonArray& args) { return nt::keyframes::helper(name, args); };
    return {{"keyframed", helper("isRowKeyframed", {c, row}).toBool()},
            {"times", ts.toVariantList()},
            {"values", values},
            {"here", ms >= 0 && helper("rowHasKeyframeAt", {c, row, ms}).toBool()},
            {"hasPrev", !helper("adjacentKeyframeMs",
                                {c, QJsonArray::fromStringList(nt::keyframes::properties(row)), std::max(0.0, ms), -1})
                             .isNull()},
            {"hasNext", !helper("adjacentKeyframeMs",
                                {c, QJsonArray::fromStringList(nt::keyframes::properties(row)), std::max(0.0, ms), 1})
                             .isNull()}};
}
double ClipInspectorController::fieldValue(const QString& field) const {
    const auto t = nt::keyframes::transform(selected());
    if (field == "anchorX" || field == "anchorY") {
        return t["anchor"].toObject()[field == "anchorX" ? "x" : "y"].toDouble(0.5);
    }
    return t[field].toDouble(field == "perspective" ? 1000 : 0);
}
QJsonObject ClipInspectorController::payload(const QVariantMap& value) const {
    auto result = QJsonObject::fromVariantMap(value);
    result.insert("clipId", m_clipId);
    if (!result.contains("atMs")) {
        const double ms = playheadMs();
        result.insert("atMs", ms < 0 ? QJsonValue(QJsonValue::Null) : QJsonValue(ms));
    }
    return result;
}
bool ClipInspectorController::write(const QVariantMap& value) {
    if (!m_timeline || locked()) {
        return false;
    }
    cancelGesture();
    const auto p = payload(value);
    return m_timeline->applyEdit("keyframes." + p["action"].toString(), p);
}
void ClipInspectorController::beginGesture() {
    m_ignoreCommit = false;
    cancelGesture();
    if (!m_timeline || locked()) {
        return;
    }
    m_gesturing = true;
    m_generation = m_timeline->documentGeneration();
    m_before = m_timeline->clipsJson();
    m_preview = m_before;
}
void ClipInspectorController::preview(const QVariantMap& value) {
    if (!m_gesturing || !m_timeline) {
        return;
    }
    if (m_generation != m_timeline->documentGeneration() || m_preview != m_timeline->clipsJson()) {
        m_ignoreCommit = true;
        m_gesturing = false;
        return;
    }
    if (locked()) {
        cancelGesture();
        return;
    }
    auto raw = m_timeline->timeline().raw;
    raw.insert("clips", m_before);
    m_preview = nt::keyframes::edit(raw, payload(value))["clips"].toArray();
    m_timeline->replaceClips(m_preview);
}
void ClipInspectorController::commit(const QVariantMap& value) {
    if (m_ignoreCommit) {
        m_ignoreCommit = false;
        return;
    }
    if (!m_gesturing) {
        write(value);
        return;
    }
    preview(value);
    if (!m_gesturing || !m_timeline) {
        return;
    }
    m_gesturing = false;
    m_timeline->commitEdit("Inspector", m_before, m_preview);
    m_before = {};
    m_preview = {};
}
void ClipInspectorController::cancelGesture() {
    if (!m_gesturing) {
        return;
    }
    m_gesturing = false;
    if (m_timeline && m_generation == m_timeline->documentGeneration() && m_preview == m_timeline->clipsJson()) {
        m_timeline->replaceClips(m_before);
    }
    m_before = {};
    m_preview = {};
}
void ClipInspectorController::seek(double ms) {
    const auto c = selected();
    if (m_clock && !c.isEmpty()) {
        m_clock->seek(c["startMs"].toDouble() + std::clamp(ms, 0.0, std::max(0.0, c["durationMs"].toDouble())));
    }
}
void ClipInspectorController::step(const QString& row, int direction) {
    const auto c = selected();
    if (!m_clock || c.isEmpty()) {
        return;
    }
    const auto result =
        nt::keyframes::helper("adjacentKeyframeMs", {c, QJsonArray::fromStringList(nt::keyframes::properties(row)),
                                                     m_clock->currentTimeMs() - c["startMs"].toDouble(), direction});
    if (!result.isNull()) {
        seek(result.toDouble());
    }
}
bool ClipInspectorController::validEasing(const QString& easing) const {
    return easing.isEmpty() || nt::scene::isKnownEasing(easing.toStdString());
}

QString ClipInspectorController::easingAt(const QString& row, double atMs) const {
    const auto ps = nt::keyframes::properties(row);
    if (ps.isEmpty()) {
        return {};
    }
    return nt::keyframes::helper("keyframeEasingAt", {selected(), ps.first(), atMs}).toString();
}
