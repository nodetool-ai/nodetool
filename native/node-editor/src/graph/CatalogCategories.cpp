#include "CatalogCategories.h"

#include <QHash>
#include <QJsonArray>
#include <QRegularExpression>
#include <QSet>
#include <QVariantMap>

namespace nodetool {
namespace {
// The output type name that the web reads for a node body: the kind of its primary output.
// Source: web/src/components/node_types/contentCardRegistry.ts, getPrimaryOutput and getContentCardVariant.
QString primaryOutputKind(const QJsonObject &metadata) {
    const auto outputs = metadata["outputs"].toArray();
    if (outputs.isEmpty()) {
        return {};
    }
    auto primary = outputs.first().toObject();
    const auto named = metadata["primary_output"].toString();
    if (!named.isEmpty()) {
        for (const auto &value : outputs) {
            if (value.toObject()["name"].toString() == named) {
                primary = value.toObject();
                break;
            }
        }
    }
    const auto type = primary["type"];
    if (type.isString()) {
        return type.toString();
    }
    const auto object = type.toObject();
    const auto kind = object["type"].toString();
    const auto args = object["type_args"].toArray();
    if (kind == QLatin1String("list") && !args.isEmpty() && args.first().toObject()["type"].toString() == QLatin1String("image")) {
        return QStringLiteral("image");
    }
    return kind;
}

// Root namespaces whose nodes need a provider key. Source: web/src/utils/nodeProvider.ts, namespaceToSecretKey.
bool needsProviderKey(const QString &ns) {
    static const QSet<QString> roots{
        "openai", "anthropic", "mistral", "google", "gemini", "vertex", "codex", "claude_code", "meshy", "rodin",
        "trellis", "tripo", "hunyuan3d", "shap_e", "point_e", "shap-e", "point-e", "huggingface", "apify",
        "replicate", "calendly", "kie", "topaz", "reve", "fal", "elevenlabs", "search", "atlascloud",
        "higgsfield", "xai", "together", "minimax"};
    return roots.contains(ns.section('.', 0, 0).toLower());
}

// Source: web/src/config/quickAccessCategories.tsx, isAiNode.
bool isAiNode(const QJsonObject &metadata, const QString &ns) {
    return metadata["auto_save_asset"].toBool() || needsProviderKey(ns);
}
} // namespace

QVariantList catalogCategories() {
    const auto row = [](const char *id, const char *label, const char *icon) {
        return QVariantMap{{"id", QString::fromLatin1(id)}, {"label", QString::fromLatin1(label)}, {"icon", QString::fromLatin1(icon)}};
    };
    return {row("all", "All", "apps"), row("io", "I/O", "input"), row("image", "Image", "image"),
            row("image-ai", "Image AI", "autoAwesome"), row("video", "Video", "movie"),
            row("video-ai", "Video AI", "autoAwesome"), row("audio", "Audio", "audiotrack"),
            row("audio-ai", "Audio AI", "autoAwesome"), row("3d-models", "3D", "viewInAr"),
            row("agents", "Agents", "smartToy"), row("control-flow", "Control", "callSplit")};
}

QStringList catalogCategoryIds(const QJsonObject &metadata) {
    const auto type = metadata["node_type"].toString(metadata["type"].toString());
    const auto ns = metadata["namespace"].toString(type.section('.', 0, -2));
    const auto kind = primaryOutputKind(metadata);
    const bool ai = isAiNode(metadata, ns);
    QStringList ids;
    if (type.startsWith("nodetool.input.") || type.startsWith("nodetool.output.")) {
        ids << "io";
    }
    if (kind == "image" || kind == "image_mask" || kind == "mask") {
        ids << (ai ? "image-ai" : "image");
    }
    if (kind == "video") {
        ids << (ai ? "video-ai" : "video");
    }
    if (kind == "audio") {
        ids << (ai ? "audio-ai" : "audio");
    }
    if (kind == "model_3d" || kind == "asset_3d") {
        ids << "3d-models";
    }
    static const QRegularExpression agents("(^|\\.)agents\\.");
    if (agents.match(type).hasMatch()) {
        ids << "agents";
    }
    if (type.startsWith("nodetool.control.")) {
        ids << "control-flow";
    }
    return ids;
}
namespace {
// The secret display name of each API-backed root namespace, without its
// "API Key" or "Token" suffix (web utils/nodeProvider.ts namespaceToSecretKey,
// secretKeyToDisplayName, providerNames).
const QHash<QString, QString> &apiProviderNames() {
    static const QHash<QString, QString> names{
        {"openai", "OpenAI"}, {"anthropic", "Anthropic"}, {"mistral", "Mistral"}, {"google", "Gemini"},
        {"gemini", "Gemini"}, {"vertex", "Vertex AI"}, {"codex", "Codex"}, {"claude_code", "Claude Code"},
        {"meshy", "Meshy"}, {"rodin", "Rodin"}, {"trellis", "Trellis"}, {"tripo", "Tripo"},
        {"hunyuan3d", "Hunyuan3D"}, {"shap_e", "Shap-E"}, {"point_e", "Point-E"}, {"shap-e", "Shap-E"},
        {"point-e", "Point-E"}, {"apify", "Apify"}, {"replicate", "Replicate"}, {"calendly", "Calendly"},
        {"kie", "Kie"}, {"topaz", "Topaz"}, {"reve", "Reve"}, {"fal", "FAL"}, {"elevenlabs", "ElevenLabs"},
        {"search", "SerpAPI"}, {"atlascloud", "AtlasCloud"}, {"higgsfield", "Higgsfield"}, {"xai", "xAI"},
        {"together", "Together"}, {"minimax", "MiniMax"}, {"messaging", "Messaging"},
    };
    return names;
}
} // namespace

QString catalogProviderId(const QString &nameSpace) {
    const auto root = nameSpace.section('.', 0, 0).toLower();
    // Hugging Face nodes run locally even though a token can download models.
    return root != "huggingface" && apiProviderNames().contains(root) ? root : QStringLiteral("local");
}

QString catalogKeyGate(const QString &nameSpace) {
    // web/src/utils/nodeProvider.ts namespaceToSecretKey, without the local
    // huggingface namespace and the sign-in gates.
    static const QHash<QString, QString> keys{
        {"openai", "OPENAI_API_KEY"}, {"anthropic", "ANTHROPIC_API_KEY"}, {"mistral", "MISTRAL_API_KEY"},
        {"google", "GEMINI_API_KEY"}, {"gemini", "GEMINI_API_KEY"}, {"meshy", "MESHY_API_KEY"},
        {"rodin", "RODIN_API_KEY"}, {"trellis", "TRELLIS_API_KEY"}, {"tripo", "TRIPO_API_KEY"},
        {"hunyuan3d", "HUNYUAN3D_API_KEY"}, {"shap_e", "SHAP_E_API_KEY"}, {"point_e", "POINT_E_API_KEY"},
        {"shap-e", "SHAP_E_API_KEY"}, {"point-e", "POINT_E_API_KEY"}, {"apify", "APIFY_API_TOKEN"},
        {"replicate", "REPLICATE_API_TOKEN"}, {"calendly", "CALENDLY_API_TOKEN"}, {"kie", "KIE_API_KEY"},
        {"topaz", "TOPAZ_API_KEY"}, {"reve", "REVE_API_KEY"}, {"fal", "FAL_API_KEY"},
        {"elevenlabs", "ELEVENLABS_API_KEY"}, {"search", "SERPAPI_API_KEY"}, {"atlascloud", "ATLASCLOUD_API_KEY"},
        {"higgsfield", "HIGGSFIELD_API_KEY_ID"}, {"xai", "XAI_API_KEY"}, {"together", "TOGETHER_API_KEY"},
        {"minimax", "MINIMAX_API_KEY"},
    };
    return keys.value(nameSpace.section('.', 0, 0).toLower());
}

QString catalogSecretDisplayName(const QString &secretKey) {
    static const QHash<QString, QString> names{
        {"OPENAI_API_KEY", "OpenAI API Key"}, {"ANTHROPIC_API_KEY", "Anthropic API Key"},
        {"MISTRAL_API_KEY", "Mistral API Key"}, {"GEMINI_API_KEY", "Gemini API Key"},
        {"MESHY_API_KEY", "Meshy API Key"}, {"RODIN_API_KEY", "Rodin API Key"}, {"TRELLIS_API_KEY", "Trellis API Key"},
        {"TRIPO_API_KEY", "Tripo API Key"}, {"HUNYUAN3D_API_KEY", "Hunyuan3D API Key"}, {"SHAP_E_API_KEY", "Shap-E API Key"},
        {"POINT_E_API_KEY", "Point-E API Key"}, {"APIFY_API_TOKEN", "Apify API Token"},
        {"REPLICATE_API_TOKEN", "Replicate API Token"}, {"CALENDLY_API_TOKEN", "Calendly API Token"},
        {"KIE_API_KEY", "Kie API Key"}, {"TOPAZ_API_KEY", "Topaz API Key"}, {"REVE_API_KEY", "Reve API Key"},
        {"FAL_API_KEY", "FAL API Key"}, {"ELEVENLABS_API_KEY", "ElevenLabs API Key"}, {"SERPAPI_API_KEY", "SerpAPI Key"},
        {"ATLASCLOUD_API_KEY", "AtlasCloud API Key"}, {"HIGGSFIELD_API_KEY_ID", "Higgsfield API Key ID"},
        {"XAI_API_KEY", "xAI API Key"}, {"TOGETHER_API_KEY", "Together API Key"}, {"MINIMAX_API_KEY", "MiniMax API Key"},
    };
    return names.value(secretKey, secretKey);
}

QString catalogProviderName(const QString &providerId) {
    if (providerId == "local") {
        return QStringLiteral("Local");
    }
    const auto name = apiProviderNames().value(providerId);
    return name.isEmpty() ? providerId.left(1).toUpper() + providerId.mid(1) : name;
}

QStringList catalogTypeNames(const QJsonArray &fields) {
    QStringList names;
    for (const auto &value : fields) {
        const QJsonValue type = value.toObject()["type"];
        const auto name = type.isString() ? type.toString() : type.toObject()["type"].toString();
        if (!name.isEmpty() && !names.contains(name)) {
            names << name;
        }
    }
    return names;
}

QVariantList catalogQuickActionSections() {
    const auto tile = [](const char *label, const char *type) {
        return QVariantMap{{"label", QString::fromLatin1(label)}, {"type", QString::fromLatin1(type)}};
    };
    const QVariantList tasks{tile("Agent", "nodetool.agents.Agent"), tile("Code", "nodetool.code.Code"),
                             tile("Text to image", "nodetool.image.TextToImage"),
                             tile("Image to image", "nodetool.image.ImageToImage"), tile("Upscale", "nodetool.image.Upscale"),
                             tile("Remove background", "nodetool.image.RemoveBackground"), tile("Relight", "nodetool.image.Relight"),
                             tile("Vectorize", "nodetool.image.Vectorize"), tile("Text to video", "nodetool.video.TextToVideo"),
                             tile("Image to video", "nodetool.video.ImageToVideo"),
                             tile("Reference to video", "nodetool.video.ReferenceToVideo"),
                             tile("Video to video", "nodetool.video.VideoToVideo"), tile("Lip sync", "nodetool.video.LipSync"),
                             tile("Text to speech", "nodetool.audio.TextToSpeech"),
                             tile("Speech to text", "nodetool.text.AutomaticSpeechRecognition")};
    const QVariantList providers{tile("FalAI", "fal.DynamicFal"), tile("KieAI", "kie.dynamic_schema.KieAI"),
                                 tile("Replicate", "replicate.DynamicReplicate")};
    // The web sorts the constants by label.
    const QVariantList constants{tile("Audio", "nodetool.constant.Audio"), tile("Bool", "nodetool.constant.Bool"),
                                 tile("Data Frame", "nodetool.constant.DataFrame"), tile("Date", "nodetool.constant.Date"),
                                 tile("Date Time", "nodetool.constant.DateTime"), tile("Dict", "nodetool.constant.Dict"),
                                 tile("Document", "nodetool.constant.Document"), tile("Float", "nodetool.constant.Float"),
                                 tile("Image", "nodetool.constant.Image"), tile("Integer", "nodetool.constant.Integer"),
                                 tile("JSON", "nodetool.constant.JSON"), tile("List", "nodetool.constant.List"),
                                 tile("3D Model", "nodetool.constant.Model3D"), tile("String", "nodetool.constant.String"),
                                 tile("Video", "nodetool.constant.Video")};
    const auto section = [](const char *title, const QVariantList &tiles) {
        return QVariantMap{{"title", QString::fromLatin1(title)}, {"tiles", tiles}};
    };
    return {section("AI nodes", tasks), section("Provider models", providers), section("Constants", constants)};
}
} // namespace nodetool
