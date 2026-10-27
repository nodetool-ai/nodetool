#include "InspectorEdits.h"
#include "app/EditRegistry.h"
#include <QJsonDocument>

void InspectorEdits::setModel(TimelineModel* model) {
    if (model == m_model) { return; }
    cancelGesture();
    if (m_model) { disconnect(m_model, nullptr, this, nullptr); }
    m_model = model;
    if (model) {
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
    return m_model ? QJsonDocument::fromJson(m_model->documentJson()).object().toVariantMap() : QVariantMap{};
}
bool InspectorEdits::apply(const QString& action, const QJsonObject& payload) {
    return m_model && m_model->applyEdit(action, payload);
}
void InspectorEdits::beginGesture(const QString& action, const QJsonObject& payload) {
    cancelGesture();
    m_cancelled = false;
    if (!m_model) { return; }
    m_before = QJsonDocument::fromJson(m_model->documentJson()).object();
    m_preview = m_model->clipsJson();
    m_generation = m_model->documentGeneration();
    m_action = action;
    m_payload = payload;
    m_gesture = true;
}
void InspectorEdits::preview(const QJsonObject& payload) {
    if (!m_gesture || !m_model) { return; }
    if (m_generation != m_model->documentGeneration() || m_preview != m_model->clipsJson()) {
        m_cancelled = true;
        m_gesture = false;
        return;
    }
    auto merged = payload;
    merged.insert("clipId", m_payload.value("clipId"));
    const auto edit = nt::app::findEdit(m_action);
    if (edit) {
        m_preview = edit(m_before, merged).value("clips").toArray();
        m_model->replaceClips(m_preview);
    }
}
void InspectorEdits::commit(const QString& action, const QJsonObject& payload) {
    if (m_cancelled) { m_cancelled = false; return; }
    if (!m_gesture) { apply(action, payload); return; }
    preview(payload);
    if (m_gesture && m_model) {
        m_gesture = false;
        m_model->commitEdit(m_action, m_before.value("clips").toArray(), m_preview);
    }
    m_before = {};
}
void InspectorEdits::cancelGesture() {
    if (!m_gesture) { return; }
    m_gesture = false;
    m_cancelled = true;
    if (m_model && m_generation == m_model->documentGeneration() && m_preview == m_model->clipsJson()) {
        m_model->replaceClips(m_before.value("clips").toArray());
    }
    m_before = {};
}
