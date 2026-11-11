#pragma once
#include <QHash>
#include <QRegularExpression>
#include <QSet>
#include <QString>
#include <QStringList>
#include <QVariantMap>

// Text rules shared by the model field, its card chip and the picker. Each
// function names the web source it follows.
namespace nt::modelpicker {

// isLocalProvider in web/src/utils/providerDisplay.ts.
inline bool isLocalProvider(const QString& provider) {
    static const QSet<QString> local{
        "huggingface-local", "mlx", "node_llama_cpp", "stable_diffusion_cpp", "transformers_js",
        "whisper_cpp", "whisper_cpp_server", "lmstudio", "vllm", "wangp"};
    const auto id = provider.trimmed().toLower();
    if (id.isEmpty()) {
        return false;
    }
    return local.contains(id) || id.contains("ollama") || id.contains("llama_cpp")
        || id.contains("llama-cpp") || id.contains("llamacpp");
}

namespace detail {
inline QString titleCase(const QString& value) {
    QStringList words;
    for (const auto& word : value.split(QRegularExpression(QStringLiteral("\\s+")), Qt::SkipEmptyParts)) {
        words.append(word.left(1).toUpper() + word.mid(1).toLower());
    }
    return words.join(' ');
}
inline QString spacedCapitals(const QString& value) {
    static const QRegularExpression boundary(QStringLiteral("([a-z])([A-Z])"));
    auto result = value;
    return result.replace(boundary, QStringLiteral("\\1 \\2"));
}
inline QString genericProviderName(const QString& provider) {
    static const QHash<QString, QString> names{
        {"openai", "OpenAI"}, {"chatgpt", "ChatGPT"}, {"claude_agent_sdk", "Claude"},
        {"claude-agent-sdk", "Claude"}, {"hunyuan3d", "Hunyuan3D"}, {"hunyuan3d_v2", "Hunyuan3D V2"},
        {"hunyuan3d_v3", "Hunyuan3D 3.0"}, {"hunyuan3d-v2", "Hunyuan3D V2"}, {"hunyuan3d-3.0", "Hunyuan3D 3.0"},
        {"hunyuan3d-30", "Hunyuan3D 3.0"}, {"hunyuan3d_3_0", "Hunyuan3D 3.0"}, {"trellis", "Trellis"},
        {"trellis-2", "Trellis 2"}, {"trellis_2", "Trellis 2"}, {"trellis2", "Trellis 2"},
        {"triposr", "TripoSR"}, {"tripo_sr", "TripoSR"}, {"shap_e", "Shap-E"}, {"shap-e", "Shap-E"},
        {"point_e", "Point-E"}, {"point-e", "Point-E"}, {"meshy", "Meshy AI"}, {"meshy-ai", "Meshy AI"},
        {"nodetool", "NodeTool"}, {"rodin", "Rodin AI"}, {"rodin-ai", "Rodin AI"}, {"mlx", "MLX"},
        {"wangp", "Wan2GP"}, {"whisper_cpp", "whisper.cpp"}, {"whisper_cpp_server", "whisper.cpp server"},
        {"stable_diffusion_cpp", "sd.cpp"}, {"node_llama_cpp", "llama.cpp"}, {"node-llama-cpp", "llama.cpp"},
        {"llama_cpp", "llama-server"}, {"llama-cpp", "llama-server"}, {"llamacpp", "llama-server"},
        {"google", "Gemini"}, {"fal_ai", "FAL AI"}, {"fal-ai", "FAL AI"}, {"falai", "FAL AI"},
        {"elevenlabs", "ElevenLabs"}, {"eleven_labs", "ElevenLabs"}, {"eleven-labs", "ElevenLabs"},
        {"zai-org", "Z.AI"}, {"zai_org", "Z.AI"}, {"zai", "Z.AI"}, {"moonshot", "Moonshot AI"},
        {"kimi", "Moonshot AI"}, {"minimax", "MiniMax"}, {"gmi", "GMI Cloud"}, {"meta", "Meta AI"},
        {"alibaba", "Alibaba Cloud"}, {"cohere", "Cohere"}, {"voyage", "Voyage AI"},
        {"voyage-ai", "Voyage AI"}, {"voyageai", "Voyage AI"}, {"jina", "Jina AI"},
        {"jina-ai", "Jina AI"}, {"jinaai", "Jina AI"}};
    const auto known = names.value(provider.toLower());
    if (!known.isEmpty()) {
        return known;
    }
    auto spaced = provider;
    spaced.replace('_', ' ');
    spaced.replace('-', ' ');
    return titleCase(spacedCapitals(spaced).trimmed());
}
} // namespace detail

// getProviderDisplayName in web/src/utils/providerDisplay.ts.
inline QString providerDisplayName(const QString& provider) {
    if (provider.isEmpty()) {
        return {};
    }
    if (provider.toLower() == "huggingface-local") {
        return QStringLiteral("Hugging Face");
    }
    static const QRegularExpression huggingFace(QStringLiteral("^huggingface(/|_|-|\\s|$)"), QRegularExpression::CaseInsensitiveOption);
    static const QRegularExpression pascal(QStringLiteral("^HuggingFace[A-Z]"));
    if (!huggingFace.match(provider).hasMatch() && !pascal.match(provider).hasMatch()) {
        return detail::genericProviderName(provider);
    }
    auto remainder = provider;
    remainder.remove(QRegularExpression(QStringLiteral("^huggingface[\\s/_-]?"), QRegularExpression::CaseInsensitiveOption));
    remainder.remove(QRegularExpression(QStringLiteral("^HuggingFace")));
    if (remainder.contains('/')) {
        const auto parts = remainder.split('/', Qt::SkipEmptyParts);
        if (!parts.isEmpty()) {
            remainder = parts.last();
        }
    }
    remainder.replace(QRegularExpression(QStringLiteral("[-_]+")), QStringLiteral(" "));
    remainder = detail::spacedCapitals(remainder).trimmed();
    return remainder.isEmpty() ? QStringLiteral("Hugging Face") : detail::titleCase(remainder);
}

// modelLabelFromId in web/src/utils/modelNormalization.ts: a file path reads as
// its file name.
inline QString modelLabelFromId(const QString& id) {
    static const QRegularExpression path(QStringLiteral("^(?:[/~]|[A-Za-z]:[\\\\/])"));
    if (!path.match(id).hasMatch()) {
        return id;
    }
    const auto parts = id.split(QRegularExpression(QStringLiteral("[\\\\/]")), Qt::SkipEmptyParts);
    auto file = parts.isEmpty() ? id : parts.last();
    file.remove(QRegularExpression(QStringLiteral("\\.[^.]+$")));
    file.remove(QRegularExpression(QStringLiteral("^ggml-"), QRegularExpression::CaseInsensitiveOption));
    return file;
}

struct FieldLabel {
    QString label;
    QString secondary;
    // The tooltip line under the label, such as "Select image generation model".
    QString subLabel;
    bool active = false;
};

// The model field's button text for each type that ModelProperty.tsx
// dispatches. `value` is the stored value, either a legacy id string or an
// object. `details` is the catalog's entry for it, or empty before the list loads.
// `provider` is the provider stored with the value or the locked provider.
inline FieldLabel fieldLabel(const QString& modelType, const QVariant& value, const QVariantMap& details, const QString& provider) {
    const auto object = value.toMap();
    const bool legacy = value.typeId() == QMetaType::QString;
    FieldLabel result;
    if (modelType.startsWith("hf.")) {
        // HuggingFaceModelSelect.tsx: the repository, then its file.
        const auto repo = object.value("repo_id").toString().isEmpty() ? object.value("id").toString() : object.value("repo_id").toString();
        result.active = !repo.isEmpty();
        result.subLabel = QStringLiteral("Select HuggingFace model");
        if (!details.isEmpty()) {
            const auto id = details.value("id").toString();
            const auto separator = id.indexOf(':');
            const auto repoId = separator < 0 ? id : id.left(separator);
            const auto path = separator < 0 ? details.value("path").toString() : id.mid(separator + 1);
            result.label = repoId.isEmpty() ? details.value("name").toString() : repoId;
            result.secondary = path;
        } else if (result.active) {
            result.label = repo;
            result.secondary = object.value("path").toString();
        } else {
            result.label = QStringLiteral("Select HuggingFace model");
        }
        return result;
    }
    const auto id = legacy ? value.toString() : object.value("id").toString();
    const auto name = details.value("name").toString();
    const auto detailProvider = details.value("provider").toString();
    const auto selectedProvider = detailProvider.isEmpty() ? provider : detailProvider;
    result.active = !id.isEmpty();
    if (modelType == "image_model") {
        // ImageModelSelect.tsx: a repository file or a slash path splits in two.
        result.subLabel = QStringLiteral("Select image generation model");
        const auto split = [&result](const QString& text, const QString& path) {
            if (text.contains(':')) {
                const auto separator = text.indexOf(':');
                result.label = text.left(separator);
                result.secondary = text.mid(separator + 1).isEmpty() ? path : text.mid(separator + 1);
                return true;
            }
            return false;
        };
        if (!details.isEmpty()) {
            const auto detailId = details.value("id").toString();
            const auto path = details.value("path").toString();
            if (split(detailId, path)) {
                return result;
            }
            if (!path.isEmpty()) {
                result.label = name;
                result.secondary = path;
                return result;
            }
            const auto slash = name.lastIndexOf('/');
            result.label = slash < 0 ? name : name.left(slash);
            result.secondary = slash < 0 ? QString{} : name.mid(slash + 1);
            return result;
        }
        if (id.isEmpty()) {
            result.label = QStringLiteral("Select image model");
            return result;
        }
        if (split(id, {})) {
            return result;
        }
        const auto slash = id.lastIndexOf('/');
        result.label = slash < 0 ? id : id.left(slash);
        result.secondary = slash < 0 ? QString{} : id.mid(slash + 1);
        return result;
    }
    struct Rule {
        QString placeholder;
        QString subLabel;
        bool providerLabel;
        bool providerFromDetailsOnly;
    };
    static const QHash<QString, Rule> rules{
        {"language_model", {"Select model", "Select model", true, false}},
        {"embedding_model", {"Select model", "Select embedding model", true, true}},
        {"rerank_model", {"Select model", "Select rerank model", true, true}},
        {"asr_model", {"Select model", "Select ASR model", true, false}},
        {"video_model", {"Select model", "Select video model", false, false}},
        {"tts_model", {"Select TTS model", "Select text-to-speech model", false, false}},
        {"music_model", {"Select music model", "Select text-to-music model", false, false}},
        {"audio_to_audio_model", {"Select audio-to-audio model", "Select audio-to-audio model", false, false}}};
    const auto rule = rules.value(modelType, Rule{"Select model", "Select model", true, false});
    result.subLabel = rule.subLabel;
    if (!name.isEmpty()) {
        result.label = name;
    } else if (!id.isEmpty()) {
        result.label = modelType == "asr_model" ? modelLabelFromId(id) : id;
    } else {
        result.label = rule.placeholder;
    }
    // The web would print the "empty" sentinel as "Empty" beside a placeholder.
    if (rule.providerLabel && result.active) {
        result.secondary = providerDisplayName(rule.providerFromDetailsOnly ? detailProvider : selectedProvider);
    }
    return result;
}

} // namespace nt::modelpicker
