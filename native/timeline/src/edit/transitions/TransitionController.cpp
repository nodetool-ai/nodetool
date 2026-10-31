#include "TransitionController.h"
#include "app/EditRegistry.h"
#include "scene/Animation.h"
#include "wiring/SourceDurations.h"
#include <QJsonDocument>

void TransitionController::setModel(TimelineModel* model) {
    if (m_model == model) { return; }
    if (m_model) { disconnect(m_model, nullptr, this, nullptr); }
    m_before = {};
    m_model = model;
    if (model) {
        connect(model, &TimelineModel::beforeCommand, this, &TransitionController::cancelGesture);
        connect(model, &TimelineModel::clipsChanged, this, &TransitionController::documentChanged);
        connect(model, &TimelineModel::timelineChanged, this, &TransitionController::documentChanged);
        connect(model, &TimelineModel::documentReplaced, this, [this] { m_before = {}; });
    }
    emit modelChanged(); emit documentChanged();
}
QVariantMap TransitionController::document() const {
    return m_model ? QJsonDocument::fromJson(m_model->documentJson()).object().toVariantMap() : QVariantMap{};
}
QJsonObject TransitionController::withSourceCaps(QJsonObject payload) const {
    QJsonObject caps;
    if (m_model) {
        for (const auto& clip : m_model->timeline().clips) {
            if (clip.mediaType != nt::MediaType::Video && clip.mediaType != nt::MediaType::Audio) { continue; }
            const auto& path = clip.mediaType == nt::MediaType::Audio && !clip.audioPath.empty() ? clip.audioPath : clip.mediaPath;
            if (path.empty()) { continue; }
            if (const auto duration = nt::wiring::knownSourceDuration(QString::fromStdString(path))) {
                caps.insert(QString::fromStdString(clip.id), *duration);
            }
        }
    }
    payload.insert("sourceCaps", caps);
    return payload;
}
bool TransitionController::apply(const QString& action, const QJsonObject& payload) {
    return m_model && m_model->applyEdit(action, withSourceCaps(payload));
}
void TransitionController::beginGesture(const QString& action, const QJsonObject& payload) {
    if (!m_model) { return; }
    m_cancelled = false;
    m_before = QJsonDocument::fromJson(m_model->documentJson()).object();
    m_lastPreview = m_model->clipsJson();
    m_generation = m_model->documentGeneration(); m_action = action; m_payload = withSourceCaps(payload); m_gesture = true;
}
void TransitionController::preview(const QJsonObject& payload) {
    if (!m_gesture || !m_model || m_before.isEmpty() || m_generation != m_model->documentGeneration()) { return; }
    if (m_lastPreview != m_model->clipsJson()) { m_gesture = false; m_cancelled = true; return; }
    auto merged = m_payload;
    // Keep the gesture attached to the clip selected on press.
    for (const auto& key : {QString("durationMs"), QString("patch")}) {
        if (payload.contains(key)) { merged.insert(key, payload.value(key)); }
    }
    const auto edit = nt::app::findEdit(m_action);
    if (edit) { m_lastPreview = edit(m_before, merged).value("clips").toArray(); m_model->replaceClips(m_lastPreview); }
}
void TransitionController::commit(const QString& action, const QJsonObject& payload) {
    if (m_cancelled) { m_cancelled = false; return; }
    if (!m_gesture) { apply(action, payload); return; }
    if (m_model && !m_before.isEmpty() && m_generation == m_model->documentGeneration()) {
        preview(payload);
        if (!m_gesture) { return; }
        m_gesture = false;
        m_model->commitEdit(m_action, m_before.value("clips").toArray(), m_model->clipsJson());
    }
    m_gesture = false; m_before = {};
}
void TransitionController::cancelGesture() {
    if (!m_gesture) { return; }
    m_gesture = false;
    m_cancelled = true;
    if (m_model && m_generation == m_model->documentGeneration() && m_lastPreview == m_model->clipsJson()) {
        m_model->replaceClips(m_before.value("clips").toArray());
    }
    m_before = {};
    m_lastPreview = {};
}
bool TransitionController::easingReadable(const QString& value) const {
    return nt::scene::isKnownEasing(value.toStdString());
}
