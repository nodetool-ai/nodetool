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
        connect(model, &TimelineModel::clipsChanged, this, &InspectorEdits::documentChanged);
        connect(model, &TimelineModel::timelineChanged, this, &InspectorEdits::documentChanged);
        connect(model, &TimelineModel::documentReplaced, this, [this] {
            m_cancelled = m_gesture;
            m_gesture = false;
            m_before = {};
        });
        connect(model, &QObject::destroyed, this, [this] { emit documentChanged(); });
    }
    emit modelChanged();
    emit documentChanged();
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
    m_action = action;
    m_payload = payload;
    m_gesture = true;
}
void InspectorEdits::preview(const QJsonObject& payload) {
    if (!m_gesture || !m_model) { return; }
    if (m_generation != m_model->documentGeneration() || m_preview != m_model->timeline().raw.value(m_collection).toArray()) {
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
        m_preview = edit(m_before, merged).value(m_collection).toArray();
        if (m_collection == "tracks") { m_model->previewTrackEffects(m_preview); }
        else { m_model->replaceClips(m_preview); }
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
    }
    m_before = {};
}
void InspectorEdits::cancelGesture() {
    if (!m_gesture) { return; }
    m_gesture = false;
    m_cancelled = true;
    if (m_model && m_generation == m_model->documentGeneration() && m_preview == m_model->timeline().raw.value(m_collection).toArray()) {
        const auto before = m_before.value(m_collection).toArray();
        if (m_collection == "tracks") { m_model->previewTrackEffects(before); }
        else { m_model->replaceClips(before); }
    }
    m_before = {};
}
