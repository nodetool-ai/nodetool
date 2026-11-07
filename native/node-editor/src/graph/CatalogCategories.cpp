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

QString catalogProviderName(const QString &providerId) {
    if (providerId == "local") {
        return QStringLiteral("Local");
    }
    const auto name = apiProviderNames().value(providerId);
    return name.isEmpty() ? providerId.left(1).toUpper() + providerId.mid(1) : name;
}
} // namespace nodetool
