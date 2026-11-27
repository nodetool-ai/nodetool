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
        connect(model, &TimelineModel::changed, this, [this](const ChangeSet& changes) {
            if (!m_active) { return; }
            if (changes.clipChanged(m_clipId) || changes.trackChanged(m_clip.value("trackId").toString())) { refresh(); }
        });
        connect(model, &TimelineModel::documentReplaced, this, [this] {
            m_ignoreCommit = m_gesturing;
            m_gesturing = false;
            m_before = {};
            m_preview = {};
            updatePlayhead(true);
        });
        connect(model, &QObject::destroyed, this, [this] {
            m_gesturing = false;
            m_clip = {};
            m_locked = true;
            m_clipMapValid = false;
            emit changed();
            updatePlayhead(false);
        });
    }
    refresh(true);
    updatePlayhead(true);
}
void ClipInspectorController::setActive(bool active) {
    if (active == m_active) {
        return;
    }
    m_active = active;
    emit activeChanged();
    if (active) {
        refresh();
    }
}
void ClipInspectorController::refresh(bool force) {
    const auto next = selected();
    const bool lockedNow = computeLocked(next);
    if (!force && next == m_clip && lockedNow == m_locked) {
        return;
    }
    m_clip = next;
    m_locked = lockedNow;
    m_clipMapValid = false;
    emit changed();
    updatePlayhead(false);
}
void ClipInspectorController::updatePlayhead(bool forcePlayheadSignal) {
    const double next = playheadMs();
    const bool onClip = next >= 0;
    const bool changedMs = next != m_lastPlayheadMs;
    const bool changedOnClip = onClip != m_playheadOnClip;
    m_lastPlayheadMs = next;
    m_playheadOnClip = onClip;
    if (forcePlayheadSignal || changedMs) {
        emit playheadChanged();
    }
    if (changedOnClip) {
        emit playheadOnClipChanged();
    }
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
        connect(clock, &PlaybackClock::timeChanged, this, [this] { updatePlayhead(false); });
        connect(clock, &QObject::destroyed, this, [this] { updatePlayhead(true); });
    }
    updatePlayhead(true);
}
void ClipInspectorController::setClipId(const QString& id) {
    if (id == m_clipId) {
        return;
    }
    cancelGesture();
    m_clipId = id;
    refresh(true);
    updatePlayhead(true);
}
QJsonObject ClipInspectorController::selected() const {
    if (!m_timeline || m_clipId.isEmpty()) {
        return {};
    }
    const auto* clip = m_timeline->findClip(m_clipId);
    return clip ? clip->raw : QJsonObject{};
}
QVariantMap ClipInspectorController::clip() const {
    if (!m_clipMapValid) {
        auto fields = m_clip;
        fields.remove("notes");
        fields.remove("controllers");
        fields.remove("versions");
        if (m_timeline) { m_timeline->crossing("ClipInspector.clip", [&fields] { return fields; }); }
        m_clipMap = fields.toVariantMap();
        m_clipMapValid = true;
    }
    return m_clipMap;
}
bool ClipInspectorController::computeLocked(const QJsonObject& c) const {
    if (c.isEmpty() || c["locked"].toBool() || !m_timeline) {
        return true;
    }
    const auto trackId = c["trackId"].toString().toStdString();
    for (const auto& track : m_timeline->timeline().tracks) {
        if (track.id == trackId) {
            return track.raw["locked"].toBool();
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
// QML reads this property again for each entry it touches, so the list is built once.
QVariantList ClipInspectorController::rows() const {
    static const QVariantList specs = nt::keyframes::rowSpecs().toVariantList();
    return specs;
}
namespace {
// The clip-relative time a row reads: the playhead held to the clip, as the web's does.
double heldMs(const QJsonObject& clip, double relative) {
    return std::clamp(relative, 0.0, std::max(0.0, clip["durationMs"].toDouble()));
}
QVariantMap liveState(const QJsonObject& c, const QString& row, double relative) {
    const double ms = heldMs(c, relative);
    const bool inside = relative >= 0 && relative <= c["durationMs"].toDouble();
    QVariantList values;
    for (int i = 0; i < nt::keyframes::inputCount(row); ++i) {
        values.append(nt::keyframes::inputValue(c, row, i, ms));
    }
    const auto ps = QJsonArray::fromStringList(nt::keyframes::properties(row));
    const auto helper = [](const QString& name, const QJsonArray& args) { return nt::keyframes::helper(name, args); };
    return {{"values", values},
            {"here", inside && helper("rowHasKeyframeAt", {c, row, ms}).toBool()},
            {"hasPrev", !helper("adjacentKeyframeMs", {c, ps, ms, -1}).isNull()},
            {"hasNext", !helper("adjacentKeyframeMs", {c, ps, ms, 1}).isNull()}};
}
}
QVariantMap ClipInspectorController::rowState(const QString& row) const {
    const auto c = selected();
    auto state = liveState(c, row, m_clock && !c.isEmpty() ? m_clock->currentTimeMs() - c["startMs"].toDouble() : -1);
    state.insert("keyframed", nt::keyframes::helper("isRowKeyframed", {c, row}).toBool());
    state.insert("times", nt::keyframes::times(c, nt::keyframes::properties(row)).toVariantList());
    return state;
}
QJsonObject ClipInspectorController::rowClip() const {
    const auto current = selected();
    if (current != m_rowClip) {
        m_rowClip = current;
        m_playbackRows.clear();
        m_documentRows.clear();
        m_graphRows.clear();
    }
    return current;
}
QVariantMap ClipInspectorController::rowDocument(const QString& row) const {
    const auto clip = rowClip();
    auto found = m_documentRows.constFind(row);
    if (found == m_documentRows.cend()) {
        const auto c = nt::keyframes::withBypassRestored(clip);
        m_documentRows.insert(row, {{"keyframed", nt::keyframes::helper("isRowKeyframed", {c, row}).toBool()},
                                   {"blocked", nt::keyframes::rowDrivenElsewhere(c, row)},
                                   {"times", nt::keyframes::times(c, nt::keyframes::properties(row)).toVariantList()}});
    }
    return m_documentRows.value(row);
}
QVariantMap ClipInspectorController::rowLive(const QString& row) const {
    const auto clip = rowClip();
    auto& prepared = m_playbackRows[row];
    if (!prepared) {
        prepared = std::make_unique<nt::keyframes::RowPlayback>(nt::keyframes::withBypassRestored(clip), row);
        ++m_preparedRowCount;
    }
    return prepared->live(m_clock && !clip.isEmpty() ? m_clock->currentTimeMs() - clip.value("startMs").toDouble() : -1).toVariantMap();
}
QVariantMap ClipInspectorController::rowGraph(const QString& row, double fromMs, double toMs, int samples) const {
    return nt::keyframes::rowGraphSamples(nt::keyframes::withBypassRestored(selected()), row, fromMs, toMs, samples).toVariantMap();
}
QVariantMap ClipInspectorController::rowGraphKeys(const QString& row) const {
    const auto clip = rowClip();
    if (!m_graphRows.contains(row)) {
        ++m_graphBuildCount;
        m_graphRows.insert(row, nt::keyframes::rowGraphKeys(nt::keyframes::withBypassRestored(clip), row).toVariantMap());
    }
    return m_graphRows.value(row);
}
double ClipInspectorController::fieldValue(const QString& field) const {
    const auto t = nt::keyframes::transform(nt::keyframes::withBypassRestored(selected()));
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
    if (const auto row = p["row"].toString(); !row.isEmpty()) { emit rowEdited(row); }
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
QString ClipInspectorController::bezierEasing(double x1, double y1, double x2, double y2) const {
    return nt::keyframes::bezierEasing(x1, y1, x2, y2);
}
bool ClipInspectorController::groupEnabled(const QString& group) const {
    return !selected()["bypassedFixedEffects"].toObject().contains(group);
}
QVariantMap ClipInspectorController::effectParamSpec(const QString& type, const QString& key) const {
    return nt::keyframes::effectParamSpec(type, key).toVariantMap();
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
