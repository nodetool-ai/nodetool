#include "ReframeController.h"
#include "Reframe.h"
#include "app/EditRegistry.h"
#include "preview/SceneEval.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <utility>

void ReframeController::setModel(TimelineModel* model) {
    if (m_model == model) {
        return;
    }
    finishGesture();
    if (m_model) {
        disconnect(m_model, nullptr, this, nullptr);
    }
    m_model = model;
    if (model) {
        connect(model, &TimelineModel::clipsChanged, this, &ReframeController::documentChanged);
        connect(model, &TimelineModel::timelineChanged, this, &ReframeController::documentChanged);
        connect(model, &TimelineModel::documentReplaced, this, [this] { m_before = {}; });
    }
    emit modelChanged();
    emit documentChanged();
}
QVariantMap ReframeController::document() const {
    return m_model ? QJsonDocument::fromJson(m_model->documentJson()).object().toVariantMap() : QVariantMap{};
}
bool ReframeController::apply(const QString& action, const QJsonObject& payload) {
    finishGesture();
    return m_model && m_model->applyEdit(action, payload);
}
void ReframeController::beginGesture(const QString& action, const QJsonObject& payload) {
    finishGesture();
    if (!m_model) {
        return;
    }
    m_before = QJsonDocument::fromJson(m_model->documentJson()).object();
    m_payload = payload;
    m_generation = m_model->documentGeneration();
    m_action = action;
    m_gesture = true;
}
void ReframeController::preview(const QJsonObject& payload) {
    if (!m_model || !m_gesture || m_before.isEmpty() || m_generation != m_model->documentGeneration()) {
        return;
    }
    // The clip, crop edge and source time belong to the gesture's start.
    for (const auto& key : {"value", "x", "y", "zoom"}) {
        if (payload.contains(key)) {
            m_payload.insert(key, payload.value(key));
        }
    }
    const auto edit = nt::app::findEdit(m_action);
    if (edit) {
        m_model->replaceClips(edit(m_before, m_payload).value("clips").toArray());
    }
}
void ReframeController::commit(const QString& action, const QJsonObject& payload) {
    if (!m_gesture) {
        apply(action, payload);
        return;
    }
    preview(payload);
    finishGesture();
}
void ReframeController::finishGesture() {
    if (!m_gesture) {
        return;
    }
    m_gesture = false;
    const auto before = std::exchange(m_before, {});
    if (m_model && !before.isEmpty() && m_generation == m_model->documentGeneration()) {
        m_model->commitEdit(m_action, before.value("clips").toArray(), m_model->clipsJson());
    }
}
double ReframeController::sourceMsAt(const QString& clipId, double timeMs) const {
    if (m_model) {
        for (const auto& clip : m_model->timeline().clips) {
            if (QString::fromStdString(clip.id) == clipId) {
                return nt::clipSourceMsAt(clip, timeMs);
            }
        }
    }
    return 0;
}
QJsonValue ReframeController::evaluate(const QJsonObject& request) const { return nt::reframe::evaluate(request); }
