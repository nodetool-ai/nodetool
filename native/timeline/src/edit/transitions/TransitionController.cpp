#include "TransitionController.h"
#include "app/EditRegistry.h"
#include "scene/Animation.h"
#include <QJsonDocument>

void TransitionController::setModel(TimelineModel* model) {
    if (m_model == model) { return; }
    if (m_model) { disconnect(m_model, nullptr, this, nullptr); }
    m_before = {};
    m_model = model;
    if (model) {
        connect(model, &TimelineModel::clipsChanged, this, &TransitionController::documentChanged);
        connect(model, &TimelineModel::timelineChanged, this, &TransitionController::documentChanged);
        connect(model, &TimelineModel::documentReplaced, this, [this] { m_before = {}; });
    }
    emit modelChanged(); emit documentChanged();
}
QVariantMap TransitionController::document() const {
    return m_model ? QJsonDocument::fromJson(m_model->documentJson()).object().toVariantMap() : QVariantMap{};
}
bool TransitionController::apply(const QString& action, const QJsonObject& payload) {
    return m_model && m_model->applyEdit(action, payload);
}
void TransitionController::beginGesture(const QString& action, const QJsonObject& payload) {
    if (!m_model) { return; }
    m_before = QJsonDocument::fromJson(m_model->documentJson()).object();
    m_generation = m_model->documentGeneration(); m_action = action; m_payload = payload; m_gesture = true;
}
void TransitionController::preview(const QJsonObject& payload) {
    if (!m_gesture || !m_model || m_before.isEmpty() || m_generation != m_model->documentGeneration()) { return; }
    auto merged = m_payload;
    // Keep the gesture attached to the clip selected on press.
    for (const auto& key : {QString("durationMs"), QString("patch")}) {
        if (payload.contains(key)) { merged.insert(key, payload.value(key)); }
    }
    const auto edit = nt::app::findEdit(m_action);
    if (edit) { m_model->replaceClips(edit(m_before, merged).value("clips").toArray()); }
}
void TransitionController::commit(const QString& action, const QJsonObject& payload) {
    if (!m_gesture) { apply(action, payload); return; }
    if (m_model && !m_before.isEmpty() && m_generation == m_model->documentGeneration()) {
        preview(payload);
        m_model->commitEdit(m_action, m_before.value("clips").toArray(), m_model->clipsJson());
    }
    m_gesture = false; m_before = {};
}
bool TransitionController::easingReadable(const QString& value) const {
    return nt::scene::isKnownEasing(value.toStdString());
}
