#pragma once
#include <QJsonArray>
#include <QVariantList>
#include <QVariantMap>
#include <cmath>

namespace nt::modelpicker::detail {
inline QString catalogCapability(const QString& mode) {
    if (mode == "video_to_video" || mode == "image_to_video" || mode == "extend_video" || mode == "reference_to_video") return mode;
    if (mode == "chat" || mode == "language_model") return QStringLiteral("generate_message");
    if (mode == "image_model") return QStringLiteral("text_to_image");
    if (mode == "video_model") return QStringLiteral("text_to_video");
    if (mode == "tts_model") return QStringLiteral("text_to_speech");
    if (mode == "asr_model") return QStringLiteral("automatic_speech_recognition");
    if (mode == "music_model") return QStringLiteral("text_to_music");
    if (mode == "embedding_model") return QStringLiteral("generate_embedding");
    if (mode == "video") return QStringLiteral("text_to_video");
    if (mode == "image") return QStringLiteral("text_to_image");
    if (mode == "audio") return QStringLiteral("text_to_speech");
    if (mode == "music") return QStringLiteral("text_to_music");
    return {};
}
inline QString catalogProcedure(const QString& mode) {
    if (mode == "huggingface_model") return QStringLiteral("models.huggingfaceByType");
    if (mode == "video_to_video" || mode == "image_to_video" || mode == "extend_video" || mode == "reference_to_video") return QStringLiteral("models.videoByProvider");
    if (mode == "chat" || mode == "language_model") return QStringLiteral("models.llmByProvider");
    if (mode == "image_model") return QStringLiteral("models.imageByProvider");
    if (mode == "video_model") return QStringLiteral("models.videoByProvider");
    if (mode == "tts_model") return QStringLiteral("models.ttsByProvider");
    if (mode == "asr_model") return QStringLiteral("models.asrByProvider");
    if (mode == "music_model") return QStringLiteral("models.musicByProvider");
    if (mode == "embedding_model") return QStringLiteral("models.embeddingByProvider");
    if (mode == "video") return QStringLiteral("models.videoByProvider");
    if (mode == "image") return QStringLiteral("models.imageByProvider");
    if (mode == "audio") return QStringLiteral("models.ttsByProvider");
    if (mode == "music") return QStringLiteral("models.musicByProvider");
    return {};
}
inline bool catalogProviderMatches(const QString& mode, const QJsonArray& capabilities) {
    if (mode == "image_model") {
        for (const auto* capability : {"text_to_image", "image_to_image", "inpainting", "outpaint_image", "upscale_image", "remove_background", "relight_image", "segment_image", "vectorize_image", "estimate_depth"}) {
            if (capabilities.contains(QLatin1String(capability))) return true;
        }
        return false;
    }
    const auto capability = catalogCapability(mode);
    return !capability.isEmpty() && capabilities.contains(capability);
}
inline QVariantList catalogModels(const QJsonArray& models, const QString& provider, const QString& mode) {
    QVariantList result;
    for (const auto& value : models) {
        auto raw = value.toObject();
        if (mode == "huggingface_model" && raw.value("id").toString().isEmpty()) raw.insert("id", raw.value("repo_id"));
        if (raw.value("id").toString().isEmpty()) continue;
        // The web basic-generation picker accepts undeclared tasks, but an
        // explicit task list must include the selected generation task.
        const auto tasks = raw.value("supported_tasks").toArray();
        if ((mode == "video" || mode == "image") && !tasks.isEmpty()
            && !tasks.contains(catalogCapability(mode))) continue;
        if (mode == "chat" && raw.value("supports_tools").isBool() && !raw.value("supports_tools").toBool()) continue;
        const bool videoTask = mode == "video_to_video" || mode == "image_to_video" || mode == "extend_video" || mode == "reference_to_video";
        if (videoTask && ((!tasks.isEmpty() && !tasks.contains(mode))
            || (tasks.isEmpty() && mode != "image_to_video"))) continue;
        auto model = raw.toVariantMap();
        model.insert("provider", provider);
        model.insert("name", raw.value("name").toString(raw.value("id").toString()));
        model.insert("modelType", mode.endsWith("_model") ? mode : mode == "chat" ? "language_model" : mode == "audio" ? "tts_model" : videoTask ? "video_model" : mode + "_model");
        result.append(model);
    }
    return result;
}
inline QVariantMap catalogConstraints(const QVariantMap& model) {
    QVariantMap result;
    QVariantList durations;
    for (const auto& item : model.value("durations").toList()) {
        bool valid = false;
        const auto value = item.toDouble(&valid);
        if (valid && std::isfinite(value) && value > 0) durations.append(value);
    }
    if (!durations.isEmpty()) result.insert("durations", durations);
    for (const auto& key : {QStringLiteral("resolutions"), QStringLiteral("voices")}) {
        const auto values = model.value(key).toList();
        if (!values.isEmpty()) result.insert(key, values);
    }
    const auto aspects = model.value("aspect_ratios").toList();
    if (!aspects.isEmpty()) result.insert("aspectRatios", aspects);
    return result;
}
}
