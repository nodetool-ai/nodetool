#include "ReframeController.h"
#include "Reframe.h"
#include "app/EditRegistry.h"
#include "preview/SceneEval.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <utility>
#include <algorithm>

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
        connect(model, &TimelineModel::beforeCommand, this, &ReframeController::cancelGesture);
        connect(model, &TimelineModel::clipsChanged, this, &ReframeController::documentChanged);
        connect(model, &TimelineModel::timelineChanged, this, &ReframeController::documentChanged);
        connect(model, &TimelineModel::documentReplaced, this, [this] { m_before = {}; });
    }
    emit modelChanged();
    emit documentChanged();
}
QVariantMap ReframeController::document() const {
    return m_model ? m_model->timeline().raw.toVariantMap() : QVariantMap{};
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
    m_cancelled = false;
    m_before = m_model->timeline().raw;
    m_lastPreview = m_model->clipsJson();
    m_payload = payload;
    m_generation = m_model->documentGeneration();
    m_action = action;
    m_gesture = true;
}
void ReframeController::preview(const QJsonObject& payload) {
    if (!m_model || !m_gesture || m_before.isEmpty() || m_generation != m_model->documentGeneration()) {
        return;
    }
    if (m_lastPreview != m_model->clipsJson()) { m_gesture = false; m_cancelled = true; return; }
    // The clip, crop edge and source time belong to the gesture's start.
    for (const auto& key : {"value", "x", "y", "zoom"}) {
        if (payload.contains(key)) {
            m_payload.insert(key, payload.value(key));
        }
    }
    const auto edit = nt::app::findEdit(m_action);
    if (edit) {
        m_lastPreview = edit(m_before, m_payload).value("clips").toArray();
        m_model->replaceClips(m_lastPreview);
    }
}
void ReframeController::commit(const QString& action, const QJsonObject& payload) {
    if (m_cancelled) { m_cancelled = false; return; }
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
void ReframeController::cancelGesture() {
    if (!m_gesture) { return; }
    m_gesture = false;
    m_cancelled = true;
    if (m_model && m_generation == m_model->documentGeneration() && m_lastPreview == m_model->clipsJson()) {
        m_model->replaceClips(m_before.value("clips").toArray());
    }
    m_before = {};
    m_lastPreview = {};
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

QVariantMap ReframeController::previewState(const QStringList& selection, double timeMs) const {
    if (!m_model || selection.size() != 1) {
        return {};
    }
    const auto& timeline = m_model->timeline();
    const auto id = selection.first().toStdString();
    const auto clip = std::ranges::find(timeline.clips, id, &nt::Clip::id);
    if (clip == timeline.clips.end() || !clip->raw.contains("reframe") ||
        (clip->mediaType != nt::MediaType::Video && clip->mediaType != nt::MediaType::Image &&
         clip->raw.value("mediaType") != "overlay")) {
        return {};
    }
    const auto plan = nt::buildFramePlan(timeline, timeMs);
    const auto found = std::ranges::find_if(plan.layers, [&](const auto& layer) { return layer.layer.clipId == id; });
    if (found == plan.layers.end()) {
        return {};
    }
    const auto doc = m_model->timeline().raw;
    QJsonObject track;
    for (const auto& value : doc.value("mediaTracks").toArray()) {
        if (value.toObject().value("id") == clip->raw.value("reframe").toObject().value("trackId")) {
            track = value.toObject();
            break;
        }
    }
    const auto reframe = nt::reframe::renderableReframe(clip->raw, track).toObject();
    const auto sampled = nt::reframe::sampleReframeAt(reframe, found->layer.sourceTimeMs, track);
    auto layer = found->layer;
    layer.sourceWidth = reframe.value("sourceWidth").toInt(layer.sourceWidth);
    layer.sourceHeight = reframe.value("sourceHeight").toInt(layer.sourceHeight);
    if (layer.sourceWidth <= 0 || layer.sourceHeight <= 0) {
        return {};
    }
    const auto resolved = nt::reframe::resolveReframeCrop(reframe, layer.sourceTimeMs,
        {{"width", layer.sourceWidth}, {"height", layer.sourceHeight}},
        {{"width", timeline.width}, {"height", timeline.height}}, track);
    const auto crop = resolved.isObject() ? resolved.toObject() : clip->raw.value("crop").toObject();
    const auto rect = nt::reframe::cropRectPx(crop, layer.sourceWidth, layer.sourceHeight);
    layer.sourceRect = {static_cast<float>(rect["x"].toDouble() / layer.sourceWidth),
                        static_cast<float>(rect["y"].toDouble() / layer.sourceHeight),
                        static_cast<float>(rect["width"].toDouble() / layer.sourceWidth),
                        static_cast<float>(rect["height"].toDouble() / layer.sourceHeight)};
    const auto [width, height] = nt::croppedSourceSize(layer.sourceRect, layer.sourceWidth, layer.sourceHeight);
    const auto matrix = nt::layerDrawMatrix(layer, width, height, timeline.width, timeline.height);
    QJsonArray values;
    for (const auto value : matrix) {
        values.append(value);
    }
    return QJsonObject{{"clipId", selection.first()}, {"sourceMs", layer.sourceTimeMs},
        {"x", sampled["x"]}, {"y", sampled["y"]}, {"zoom", sampled["zoom"]},
        {"crop", QJsonObject{{"left", rect["x"].toDouble() / layer.sourceWidth},
                             {"top", rect["y"].toDouble() / layer.sourceHeight},
                             {"right", 1 - (rect["x"].toDouble() + width) / layer.sourceWidth},
                             {"bottom", 1 - (rect["y"].toDouble() + height) / layer.sourceHeight}}},
        {"drawMatrix", values}, {"sourceWidth", layer.sourceWidth}, {"sourceHeight", layer.sourceHeight},
        {"sequenceWidth", timeline.width}, {"sequenceHeight", timeline.height}}.toVariantMap();
}
