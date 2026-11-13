#pragma once
#include <QHash>
#include <QJsonArray>
#include <QJsonObject>
#include <QSet>
#include <QStringList>
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
    if (mode == "rerank_model") return QStringLiteral("rerank");
    if (mode == "audio_to_audio_model") return QStringLiteral("audio_to_audio");
    if (mode == "video") return QStringLiteral("text_to_video");
    if (mode == "image") return QStringLiteral("text_to_image");
    if (mode == "audio") return QStringLiteral("text_to_speech");
    if (mode == "music") return QStringLiteral("text_to_music");
    return {};
}
// Modes whose models are repositories listed by one procedure, not per provider:
// Hugging Face (HuggingFaceModelSelect.tsx), Transformers.js
// (TransformersJsModelSelect.tsx) and Ollama (LlamaModelSelect.tsx).
inline bool isRepositoryMode(const QString& mode) {
    return mode == "huggingface_model" || mode == "transformers_js_model" || mode == "llama_model";
}
// The catalog mode of a model field type.
inline QString catalogModeForType(const QString& modelType) {
    if (modelType.startsWith("hf.")) return QStringLiteral("huggingface_model");
    if (modelType.startsWith("tjs.")) return QStringLiteral("transformers_js_model");
    return modelType;
}
inline QString catalogProcedure(const QString& mode) {
    if (mode == "huggingface_model") return QStringLiteral("models.huggingfaceByType");
    if (mode == "transformers_js_model") return QStringLiteral("models.transformersJsByType");
    if (mode == "llama_model") return QStringLiteral("models.ollama");
    if (mode == "video_to_video" || mode == "image_to_video" || mode == "extend_video" || mode == "reference_to_video") return QStringLiteral("models.videoByProvider");
    if (mode == "chat" || mode == "language_model") return QStringLiteral("models.llmByProvider");
    if (mode == "image_model") return QStringLiteral("models.imageByProvider");
    if (mode == "video_model") return QStringLiteral("models.videoByProvider");
    if (mode == "tts_model") return QStringLiteral("models.ttsByProvider");
    if (mode == "asr_model") return QStringLiteral("models.asrByProvider");
    if (mode == "music_model") return QStringLiteral("models.musicByProvider");
    if (mode == "embedding_model") return QStringLiteral("models.embeddingByProvider");
    if (mode == "rerank_model") return QStringLiteral("models.rerankByProvider");
    if (mode == "audio_to_audio_model") return QStringLiteral("models.audioToAudioByProvider");
    if (mode == "model_3d_model") return QStringLiteral("models.model3dByProvider");
    if (mode == "video") return QStringLiteral("models.videoByProvider");
    if (mode == "image") return QStringLiteral("models.imageByProvider");
    if (mode == "audio") return QStringLiteral("models.ttsByProvider");
    if (mode == "music") return QStringLiteral("models.musicByProvider");
    return {};
}
// The provider capability that runs an image picker task, as IMAGE_TASK_CAPABILITY
// in web/src/hooks/useProviders.ts.
inline QString imageTaskCapability(const QString& task) {
    static const QHash<QString, QString> capabilities{
        {"text_to_image", "text_to_image"}, {"image_to_image", "image_to_image"},
        {"image_edit", "image_to_image"}, {"inpainting", "inpainting"},
        {"outpaint", "outpaint_image"}, {"upscale", "upscale_image"},
        {"remove_background", "remove_background"}, {"relight", "relight_image"},
        {"vectorize", "vectorize_image"}, {"segment", "segment_image"},
        {"estimate_depth", "estimate_depth"}};
    return capabilities.value(task);
}
// An image provider qualifies for a task picker only when it declares the
// task's capability. Without tasks, any image capability qualifies.
inline bool catalogProviderMatches(const QString& mode, const QJsonArray& capabilities, const QStringList& tasks) {
    // Model3DModelSelect.tsx lists text-to-3D and image-to-3D models together.
    if (mode == "model_3d_model") {
        return capabilities.contains(QStringLiteral("text_to_3d")) || capabilities.contains(QStringLiteral("image_to_3d"));
    }
    if (mode == "image_model") {
        QStringList wanted;
        for (const auto& task : tasks) {
            const auto capability = imageTaskCapability(task);
            if (!capability.isEmpty()) {
                wanted.append(capability);
            }
        }
        if (wanted.isEmpty()) {
            wanted = {"text_to_image", "image_to_image", "inpainting", "outpaint_image", "upscale_image", "remove_background", "relight_image", "segment_image", "vectorize_image", "estimate_depth"};
        }
        for (const auto& capability : wanted) {
            if (capabilities.contains(capability)) {
                return true;
            }
        }
        return false;
    }
    const auto capability = catalogCapability(mode);
    return !capability.isEmpty() && capabilities.contains(capability);
}
inline bool catalogProviderMatches(const QString& mode, const QJsonArray& capabilities) {
    return catalogProviderMatches(mode, capabilities, {});
}
// STRICT_MODEL_TASKS and modelMatchesTask in web/src/hooks/modelTaskMatching.ts:
// a model without declared tasks passes unless the task is a specialized one.
inline bool modelMatchesTask(const QJsonArray& supported, const QString& task) {
    static const QSet<QString> strict{
        "image_edit", "inpainting", "outpaint", "upscale", "remove_background", "relight",
        "vectorize", "segment", "estimate_depth", "video_to_video", "extend_video",
        "upscale_video", "interpolate_video", "outpaint_video", "matte_video",
        "reference_to_video", "audio_to_video", "lip_sync"};
    if (supported.isEmpty()) {
        return !strict.contains(task);
    }
    return supported.contains(task);
}
// Image pickers accept a model for any of their tasks. Video pickers need every
// task, and a multi-task video picker needs declared tasks, as in useModelsByProvider.ts.
inline bool catalogModelMatchesTasks(const QJsonArray& supported, const QStringList& tasks, const QString& mode = {}) {
    if (tasks.isEmpty()) {
        return true;
    }
    if (mode == "video_model") {
        if (tasks.size() > 1 && supported.isEmpty()) {
            return false;
        }
        for (const auto& task : tasks) {
            if (!modelMatchesTask(supported, task)) {
                return false;
            }
        }
        return true;
    }
    for (const auto& task : tasks) {
        if (modelMatchesTask(supported, task)) {
            return true;
        }
    }
    return false;
}
inline QVariantList catalogModels(const QJsonArray& models, const QString& provider, const QString& mode) {
    QVariantList result;
    for (const auto& value : models) {
        auto raw = value.toObject();
        if (isRepositoryMode(mode) && raw.value("id").toString().isEmpty()) raw.insert("id", raw.value("repo_id"));
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
// The repositories a model must download before it runs, main one first, as
// modelDownloadTargets in web/src/utils/modelNormalization.ts. Each target has
// repo_id, path, allow_patterns, ignore_patterns, model_type and the download id.
inline QVariantList catalogDownloadTargets(const QVariantMap& model) {
    if (model.value("execution").toMap().value("state").toString() != "download_required") {
        return {};
    }
    const auto adapter = model.value("adapter").toMap();
    const auto artifact = adapter.value("artifact_ref").toMap();
    const bool hasArtifact = adapter.contains("artifact_ref") && !adapter.value("artifact_ref").isNull();
    auto repoId = artifact.value("repo_id").toString();
    if (repoId.isEmpty()) {
        repoId = model.value("repo_id").toString();
    }
    if (repoId.isEmpty()) {
        return {};
    }
    const auto target = [](const QString& repo, const QVariant& path, const QVariant& allow, const QVariant& ignore, const QVariant& type) {
        const auto file = path.toString();
        return QVariantMap{{"repo_id", repo}, {"path", file.isEmpty() ? QVariant{} : QVariant(file)},
                           {"allow_patterns", file.isEmpty() ? allow : QVariant{}},
                           {"ignore_patterns", file.isEmpty() ? ignore : QVariant{}},
                           {"model_type", type}, {"id", file.isEmpty() ? repo : repo + "/" + file}};
    };
    const auto path = hasArtifact ? artifact.value("path") : model.value("path");
    const auto allow = artifact.value("allow_patterns").isNull() ? model.value("allow_patterns") : artifact.value("allow_patterns");
    QVariantList targets{target(repoId, path, allow, model.value("ignore_patterns"), artifact.value("model_type"))};
    for (const auto& entry : adapter.value("extra_artifact_refs").toList()) {
        const auto extra = entry.toMap();
        if (!extra.value("repo_id").toString().isEmpty()) {
            targets.append(target(extra.value("repo_id").toString(), extra.value("path"), extra.value("allow_patterns"), {}, extra.value("model_type")));
        }
    }
    return targets;
}
// Recommended entries the picker can download: Hugging Face files and Ollama
// tags, as isHfModel in web/src/utils/hfCache.ts.
inline bool catalogIsDownloadable(const QVariantMap& model) {
    const auto type = model.value("type").toString();
    return type.startsWith("hf.") || type.startsWith("hf_") || type == "llama_model"
        || !model.value("path").isNull() || !model.value("allow_patterns").isNull()
        || !model.value("ignore_patterns").isNull();
}
// web/src/components/model_menu/shared/downloadMatchesProvider.ts
inline bool catalogDownloadMatchesProvider(const QVariantMap& model, const QString& provider) {
    const auto own = model.value("provider").toString();
    if (!own.isEmpty()) {
        return own == provider;
    }
    if (model.value("type").toString() == "llama_model") {
        return provider == "ollama";
    }
    return provider == "llama_cpp" || provider == "node_llama_cpp";
}
// The models.recommended* procedure a node's picker offers downloads from, as
// mapNodeTypeToTask in web/src/hooks/useRecommendedModelsForNode.ts and
// mapModelTypeToTask in HuggingFaceModelSelect.tsx.
inline QString catalogRecommendationProcedure(const QString& nodeType, const QString& modelType) {
    static const QHash<QString, QString> byNode{
        {"nodetool.image.TextToImage", "models.recommendedImageTextToImage"},
        {"nodetool.image.ImageToImage", "models.recommendedImageImageToImage"},
        {"nodetool.video.TextToVideo", "models.recommendedVideoTextToVideo"},
        {"nodetool.video.ImageToVideo", "models.recommendedVideoImageToVideo"},
        {"nodetool.text.AutomaticSpeechRecognition", "models.recommendedAsr"},
        {"nodetool.audio.TextToSpeech", "models.recommendedTts"}};
    const auto procedure = byNode.value(nodeType);
    if (!procedure.isEmpty()) {
        return procedure;
    }
    if (modelType.startsWith("hf.text_to_image")) {
        return QStringLiteral("models.recommendedImageTextToImage");
    }
    if (modelType.startsWith("hf.image_to_image")) {
        return QStringLiteral("models.recommendedImageImageToImage");
    }
    return {};
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
