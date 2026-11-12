#include "InspectorEdits.h"
#include "app/EditRegistry.h"
#include <QJsonDocument>

void InspectorEdits::setModel(TimelineModel* model) {
    if (model == m_model) { return; }
    cancelGesture();
    if (m_model) { disconnect(m_model, nullptr, this, nullptr); }
    m_model = model;
    if (model) {
        connect(model, &TimelineModel::beforeCommand, this, &InspectorEdits::cancelGesture);
        // The model emits timelineChanged after every clipsChanged, so one connection hears both.
        connect(model, &TimelineModel::timelineChanged, this, &InspectorEdits::documentChanged);
        connect(model, &TimelineModel::clipsChanged, this, [this] { if (m_active) { refresh(); } });
        connect(model, &TimelineModel::documentReplaced, this, [this] {
            m_cancelled = m_gesture;
            m_gesture = false;
            m_before = {};
        });
        connect(model, &QObject::destroyed, this, [this] { emit documentChanged(); refresh(); });
    }
    emit modelChanged();
    emit documentChanged();
    refresh();
}
void InspectorEdits::setActive(bool active) {
    if (active == m_active) { return; }
    m_active = active;
    emit activeChanged();
    if (active) { refresh(); }
}
void InspectorEdits::setParentId(const QString& id) {
    if (id == m_parentId) { return; }
    m_parentId = id;
    emit parentIdChanged();
    refresh();
}
void InspectorEdits::refresh() {
    QJsonArray groups;
    int children = 0;
    if (m_model) {
        for (const auto& clip : m_model->timeline().clips) {
            const auto parent = clip.raw.value(u"parentId");
            if (!m_parentId.isEmpty() && parent.toString() == m_parentId) { ++children; }
            if (clip.raw.value(u"mediaType").toString() == u"group") {
                groups.append(QJsonObject{{"id", clip.raw.value(u"id")}, {"parentId", parent}, {"name", clip.raw.value(u"name")}});
            }
        }
    }
    if (groups != m_groupClips) { m_groupClips = groups; emit groupClipsChanged(); }
    if (children != m_childCount) { m_childCount = children; emit childCountChanged(); }
}
QVariantMap InspectorEdits::document() const {
    return m_model ? m_model->timeline().raw.toVariantMap() : QVariantMap{};
}
bool InspectorEdits::apply(const QString& action, const QJsonObject& payload) {
    return m_model && m_model->applyEdit(action, payload);
}
void InspectorEdits::beginGesture(const QString& action, const QJsonObject& payload) {
    cancelGesture();
    m_cancelled = false;
    if (!m_model) { return; }
    m_before = m_model->timeline().raw;
    m_collection = action == "updateTrackEffect" ? QStringLiteral("tracks") : QStringLiteral("clips");
    m_preview = m_before.value(m_collection).toArray();
    m_generation = m_model->documentGeneration();
    m_previewRevision = m_model->timeline().revision;
    m_action = action;
    m_payload = payload;
    m_gesture = true;
}
// The snapshot revision changes on every model change, so the array compare runs only after a change from elsewhere.
bool InspectorEdits::gestureIntact() const {
    return m_generation == m_model->documentGeneration()
        && (m_previewRevision == m_model->timeline().revision || m_preview == m_model->timeline().raw.value(m_collection).toArray());
}
// A step shows only the clips that differ from the last step, through the transient path:
// only the preview hears it, and the clip listeners hear the gesture once on settleTransient.
void InspectorEdits::showClips(const QJsonArray& clips) {
    QJsonArray changed;
    bool sameShape = clips.size() == m_preview.size();
    for (qsizetype i = 0; sameShape && i < clips.size(); ++i) {
        const auto next = clips[i].toObject();
        const auto last = m_preview[i].toObject();
        sameShape = next.value(u"id") == last.value(u"id");
        if (sameShape && next != last) { changed.append(next); }
    }
    if (!sameShape) { m_model->replaceClips(clips); }
    else if (!changed.isEmpty()) { m_model->previewClips(changed); }
}
void InspectorEdits::preview(const QJsonObject& payload) {
    if (!m_gesture || !m_model) { return; }
    if (!gestureIntact()) {
        m_cancelled = true;
        m_gesture = false;
        return;
    }
    auto merged = m_payload;
    for (auto it = payload.begin(); it != payload.end(); ++it) { merged.insert(it.key(), it.value()); }
    if (m_collection == "tracks") {
        merged.insert("trackId", m_payload.value("trackId"));
        merged.insert("effectId", m_payload.value("effectId"));
    } else { merged.insert("clipId", m_payload.value("clipId")); }
    const auto edit = nt::app::findEdit(m_action);
    if (edit) {
        const auto next = edit(m_before, merged).value(m_collection).toArray();
        if (m_collection == "tracks") { m_model->previewTrackEffects(next); }
        else { showClips(next); }
        m_preview = next;
        m_previewRevision = m_model->timeline().revision;
    }
}
void InspectorEdits::commit(const QString& action, const QJsonObject& payload) {
    if (m_cancelled) { m_cancelled = false; return; }
    if (!m_gesture) { apply(action, payload); return; }
    preview(payload);
    if (m_gesture && m_model) {
        m_gesture = false;
        if (m_collection == "tracks") {
            const auto before = m_before.value("tracks").toArray();
            m_before = {};
            m_model->previewTrackEffects(before);
            auto final = m_payload;
            final.insert("patch", payload.value("patch"));
            m_model->applyEdit(m_action, final);
            return;
        }
        m_model->commitEdit(m_action, m_before.value("clips").toArray(), m_preview);
        m_model->settleTransient();
    }
    m_before = {};
}
void InspectorEdits::cancelGesture() {
    if (!m_gesture) { return; }
    m_gesture = false;
    m_cancelled = true;
    if (m_model && gestureIntact()) {
        const auto before = m_before.value(m_collection).toArray();
        if (m_collection == "tracks") { m_model->previewTrackEffects(before); }
        else { showClips(before); m_model->settleTransient(); }
    }
    m_before = {};
}
