#include "ComposerRules.h"
#include <QHash>
#include <QJsonArray>
#include <QLocale>
#include <QRegularExpression>
#include <algorithm>
#include <cmath>

namespace nt::chat::composer {
namespace {
QVariantMap option(const QVariant &value, const QString &label, const QString &description = {}) {
    QVariantMap entry{{"value", value}, {"label", label}};
    if (!description.isEmpty()) {
        entry["description"] = description;
    }
    return entry;
}

// web/src/stores/MediaGenerationStore.ts option lists.
const QStringList imageResolutions{"1K", "2K", "4K"};
const QStringList videoResolutions{"720p", "1080p", "1440p", "4K"};
const QStringList imageAspectRatios{"21:9", "16:9", "3:2", "7:5", "4:3", "5:4", "1:1",
                                    "9:16", "2:3",  "5:7",  "3:4", "4:5"};
const QStringList videoAspectRatios{"21:9", "16:9", "4:3", "1:1", "9:16", "3:4"};
const QList<int> videoDurations{2, 3, 4, 5, 6, 8, 10, 12, 15};
const QList<int> musicDurations{15, 30, 60, 120};
const QList<int> extendDurations{2, 3, 5, 8};
const QList<int> imageVariations{1, 2, 4, 6, 8};
const QStringList ttsVoices{"alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"};
const QList<double> audioSpeeds{0.5, 0.75, 1.0, 1.25, 1.5, 2.0};
const QStringList audioFormats{"mp3", "wav", "opus", "pcm"};
const QList<double> editStrengths{0.25, 0.5, 0.65, 0.75, 0.85, 1.0};
const QList<int> inferenceSteps{10, 20, 30, 40, 50};

bool isImageMode(const QString &mode) {
    return mode == "image" || mode == "image_edit";
}

QStringList constrainedImageResolutions(const QVariantMap &constraints) {
    // imageModelOptions.tsx keeps only the 1K/2K/4K vocabulary.
    QStringList allowed;
    for (const auto &value : constraints.value("resolutions").toList()) {
        if (imageResolutions.contains(value.toString())) {
            allowed.append(value.toString());
        }
    }
    return allowed;
}

QStringList allowedStrings(const QString &mode, const QString &key, const QVariantMap &constraints) {
    if (key == "resolution") {
        if (isImageMode(mode)) {
            return constrainedImageResolutions(constraints);
        }
        return constraints.value("resolutions").toStringList();
    }
    if (key == "aspectRatio") {
        return constraints.value("aspectRatios").toStringList();
    }
    if (key == "voice") {
        return constraints.value("voices").toStringList();
    }
    return {};
}

// mediaGenerationRequest.ts via MediaGenerationStore.ts resolveImageSize.
QPair<int, int> resolveImageSize(const QString &resolution, const QString &aspectRatio) {
    const int base = resolution == "4K" ? 4096 : resolution == "2K" ? 2048 : 1024;
    static const QRegularExpression ratio("^(\\d+(?:\\.\\d+)?):(\\d+(?:\\.\\d+)?)$");
    const auto match = ratio.match(aspectRatio);
    const double width = match.hasMatch() ? match.captured(1).toDouble() : 0;
    const double height = match.hasMatch() ? match.captured(2).toDouble() : 0;
    if (width <= 0 || height <= 0) {
        return {base, base};
    }
    if (width >= height) {
        return {static_cast<int>(std::round(base * width / height)), base};
    }
    return {base, static_cast<int>(std::round(base * height / width))};
}

QJsonValue nullable(const QString &value) {
    return value.isEmpty() ? QJsonValue(QJsonValue::Null) : QJsonValue(value);
}

QJsonValue number(const QVariant &value) {
    return QJsonValue::fromVariant(value);
}
} // namespace

// web/src/components/chat/composer/mediaModes.tsx MEDIA_MODES, with labels
// from web/src/i18n/locales/en.json.
QVariantList mediaModes() {
    const auto mode = [](const QString &id, const QString &label, const QString &chip, const QString &icon,
                         const QString &description, bool enabled) {
        return QVariantMap{{"id", id},         {"label", label},     {"chipLabel", chip},
                           {"iconName", icon}, {"description", description}, {"enabled", enabled}};
    };
    return {mode("chat", "Chat", "Chat", "forumOutlined", {}, true),
            mode("image", "Generate images", "Image", "image", {}, true),
            mode("image_edit", "Edit images", "Image edit", "autoFixHigh", {}, true),
            mode("video", "Generate videos", "Video", "videocam", {}, true),
            mode("image_to_video", "Animate image", "Image→Video", "movie", {}, true),
            mode("reference_to_video", "Reference to video", "Refs→Video", "collectionsOutlined",
                 "several references, one shot", true),
            mode("retake", "Retake", "Retake", "repeat", "change an attached video", true),
            mode("extend", "Extend", "Extend", "timeline", "add footage to an attached video", true),
            mode("audio", "Read aloud", "Speech", "volumeUp", {}, true),
            mode("music", "Generate music", "Music", "audiotrack", {}, true),
            mode("audio_to_video", "Audio to video", "Audio→Video", "graphicEq", "Soon", false),
            mode("motion_control", "Motion control", "Motion", "tune", "Soon", false)};
}

bool isMediaMode(const QString &mode) {
    static const QStringList modes{"image", "image_edit", "video", "image_to_video", "reference_to_video",
                                   "retake", "extend", "audio", "music"};
    return modes.contains(mode);
}

// MediaGenerationStore.ts DEFAULT_*_PARAMS.
QVariantMap defaultSettings(const QString &mode) {
    if (mode == "image") {
        return {{"resolution", "1K"}, {"aspectRatio", "16:9"}, {"variations", 4}};
    }
    if (mode == "image_edit") {
        return {{"resolution", "1K"}, {"aspectRatio", "1:1"}, {"strength", 0.65},
                {"numInferenceSteps", 30}, {"variations", 1}};
    }
    if (mode == "video") {
        return {{"resolution", "1080p"}, {"aspectRatio", "16:9"}, {"duration", 8}};
    }
    if (mode == "image_to_video") {
        return {{"resolution", "1080p"}, {"aspectRatio", "16:9"}, {"duration", 4}, {"numInferenceSteps", 30}};
    }
    if (mode == "reference_to_video") {
        return {{"resolution", "1080p"}, {"aspectRatio", "16:9"}, {"duration", 5},
                {"useReferenceVideoAudio", false}};
    }
    if (mode == "extend") {
        return {{"direction", "end"}, {"duration", 3}};
    }
    if (mode == "audio") {
        return {{"voice", "alloy"}, {"speed", 1.0}, {"format", "mp3"}};
    }
    if (mode == "music") {
        return {{"duration", 30}};
    }
    return {};
}

// The picker kind and task each mode opens in ModeChips.tsx, as catalog modes
// of native/model-picker.
QString catalogMode(const QString &mode) {
    if (mode == "image") {
        return "image";
    }
    if (mode == "image_edit") {
        return "image_model";
    }
    if (mode == "video") {
        return "video";
    }
    if (mode == "image_to_video" || mode == "reference_to_video") {
        return mode;
    }
    if (mode == "retake") {
        return "video_to_video";
    }
    if (mode == "extend") {
        return "extend_video";
    }
    if (mode == "audio" || mode == "music") {
        return mode;
    }
    return {};
}

QStringList catalogTasks(const QString &mode) {
    return mode == "image_edit" ? QStringList{"image_to_image"} : QStringList{};
}

// ModeChips.tsx option lists, narrowed as imageModelOptions.tsx and
// videoModelOptions.tsx narrow them.
QVariantList settingOptions(const QString &mode, const QString &key, const QVariantMap &constraints) {
    QVariantList options;
    const auto allowed = allowedStrings(mode, key, constraints);
    if (key == "resolution") {
        for (const auto &value : allowed.isEmpty() ? (isImageMode(mode) ? imageResolutions : videoResolutions)
                                                   : allowed) {
            options.append(option(value, value));
        }
    } else if (key == "aspectRatio") {
        static const QRegularExpression ratio("^\\d+:\\d+$");
        const auto fallback = isImageMode(mode) ? imageAspectRatios : videoAspectRatios;
        for (const auto &value : allowed) {
            if (fallback.contains(value) || ratio.match(value).hasMatch()) {
                options.append(option(value, value));
            }
        }
        if (options.isEmpty()) {
            for (const auto &value : fallback) {
                options.append(option(value, value));
            }
        }
    } else if (key == "duration") {
        QList<double> values;
        for (const auto &value : constraints.value("durations").toList()) {
            values.append(value.toDouble());
        }
        const auto &fallback = mode == "music" ? musicDurations : mode == "extend" ? extendDurations : videoDurations;
        if (values.isEmpty() || mode == "music") {
            values.clear();
            for (const auto value : fallback) {
                values.append(value);
            }
        }
        for (const auto value : values) {
            const auto seconds = QString::number(value);
            options.append(option(value, mode == "extend" ? "+" + seconds + " Sec" : seconds + " Sec"));
        }
    } else if (key == "variations") {
        for (const auto value : imageVariations) {
            options.append(option(value, QString::number(value), value == 1 ? "variation" : "variations"));
        }
    } else if (key == "strength") {
        for (const auto value : editStrengths) {
            const auto description = value <= 0.35 ? "subtle" : value >= 0.85 ? "strong" : "balanced";
            options.append(option(value, QString::number(value, 'f', 2), description));
        }
    } else if (key == "numInferenceSteps") {
        for (const auto value : inferenceSteps) {
            options.append(option(value, QString::number(value) + " steps"));
        }
    } else if (key == "direction") {
        options.append(option("end", "After", "Continue past the last frame"));
        options.append(option("start", "Before", "Lead in before the first frame"));
    } else if (key == "useReferenceVideoAudio") {
        options.append(option(false, "Model audio", "Let the model score the clip"));
        options.append(option(true, "Reference audio", "Keep the reference video's track"));
    } else if (key == "voice") {
        for (const auto &value : allowed.isEmpty() ? ttsVoices : allowed) {
            options.append(option(value, value));
        }
    } else if (key == "speed") {
        for (const auto value : audioSpeeds) {
            options.append(option(value, QString::number(value) + "x"));
        }
    } else if (key == "format") {
        for (const auto &value : audioFormats) {
            options.append(option(value, value.toUpper()));
        }
    }
    return options;
}

// ModeChips.tsx cluster order, headers from en.json.
QVariantList settingChips(const QString &mode, const QVariantMap &settings, const QVariantMap &constraints) {
    const bool video = mode == "video" || mode == "image_to_video" || mode == "reference_to_video";
    QStringList keys;
    if (mode == "image") {
        keys = {"resolution", "aspectRatio", "variations"};
    } else if (mode == "image_edit") {
        keys = {"resolution", "aspectRatio", "strength", "numInferenceSteps", "variations"};
    } else if (mode == "video") {
        keys = {"duration", "resolution", "aspectRatio"};
    } else if (mode == "image_to_video") {
        keys = {"duration", "resolution", "aspectRatio", "numInferenceSteps"};
    } else if (mode == "reference_to_video") {
        keys = {"duration", "resolution", "aspectRatio", "useReferenceVideoAudio"};
    } else if (mode == "extend") {
        keys = {"direction", "duration"};
    } else if (mode == "audio") {
        keys = {"voice", "speed", "format"};
    } else if (mode == "music") {
        keys = {"duration"};
    }
    const QHash<QString, QPair<QString, QString>> chrome{
        {"resolution", {isImageMode(mode) ? "Image resolution" : "Video resolution", "fitScreen"}},
        {"aspectRatio", {"Aspect ratio", "aspectRatio"}},
        {"variations", {"Number of variations", "apps"}},
        {"strength", {"Edit strength", "tune"}},
        {"numInferenceSteps", {"Inference steps", "layers"}},
        {"duration", {video ? "Clip duration" : mode == "extend" ? "Seconds to add" : "Target duration", "schedule"}},
        {"direction", {"Add footage", "timeline"}},
        {"useReferenceVideoAudio", {"Audio source", "graphicEq"}},
        {"voice", {"Voice", "personOutline"}},
        {"speed", {"Speech rate", "timer"}},
        {"format", {"Audio format", "audiotrack"}}};
    QVariantList chips;
    for (const auto &key : keys) {
        const auto options = settingOptions(mode, key, constraints);
        QString label;
        for (const auto &entry : options) {
            if (entry.toMap()["value"] == settings.value(key)) {
                label = entry.toMap()["label"].toString();
            }
        }
        if (label.isEmpty()) {
            label = settings.value(key).toString();
        }
        if (key == "strength") {
            label = "Strength " + label;
        }
        chips.append(QVariantMap{{"key", key},
                                 {"label", label},
                                 {"header", chrome[key].first},
                                 {"iconName", chrome[key].second},
                                 {"value", settings.value(key)},
                                 {"options", options}});
    }
    return chips;
}

QString modelPlaceholder(const QString &mode) {
    static const QHash<QString, QString> labels{{"image_edit", "Select edit model"},
                                               {"video", "Select video model"},
                                               {"image_to_video", "Select I2V model"},
                                               {"reference_to_video", "Select reference model"},
                                               {"retake", "Select retake model"},
                                               {"extend", "Select extend model"},
                                               {"audio", "Select TTS model"},
                                               {"music", "Select music model"}};
    return labels.value(mode, "Select model");
}

// videoModelOptions.tsx clampToAllowed as the onPick handlers in ModeChips.tsx apply it.
QVariantMap clampSettings(const QString &mode, QVariantMap settings, const QVariantMap &constraints) {
    for (const auto &key : {QStringLiteral("resolution"), QStringLiteral("aspectRatio")}) {
        const auto allowed = allowedStrings(mode, key, constraints);
        if (settings.contains(key) && !allowed.isEmpty() && !allowed.contains(settings[key].toString())) {
            settings[key] = allowed.first();
        }
    }
    const auto durations = constraints.value("durations").toList();
    if (settings.contains("duration") && mode != "music" && !durations.isEmpty()) {
        bool found = false;
        for (const auto &value : durations) {
            found = found || value.toDouble() == settings["duration"].toDouble();
        }
        if (!found) {
            settings["duration"] = durations.first();
        }
    }
    return settings;
}

// web/src/components/chat/composer/mediaGenerationRequest.ts buildMediaGenerationRequest.
// Presets are not offered natively, so preset_ids stays undefined as on web without a preset.
QJsonObject mediaRequest(const QString &mode, const QVariantMap &settings, const QString &provider,
                         const QString &model) {
    if (!isMediaMode(mode)) {
        return {{"mode", "chat"}};
    }
    QJsonObject request{{"mode", mode}, {"provider", nullable(provider)}, {"model", nullable(model)}};
    if (isImageMode(mode)) {
        const auto size = resolveImageSize(settings["resolution"].toString(), settings["aspectRatio"].toString());
        request["width"] = size.first;
        request["height"] = size.second;
        request["aspect_ratio"] = settings["aspectRatio"].toString();
        request["resolution"] = settings["resolution"].toString();
        request["variations"] = number(settings["variations"]);
        if (mode == "image_edit") {
            request["strength"] = number(settings["strength"]);
            request["num_inference_steps"] = number(settings["numInferenceSteps"]);
        }
    } else if (mode == "video" || mode == "image_to_video" || mode == "reference_to_video") {
        request["aspect_ratio"] = settings["aspectRatio"].toString();
        request["resolution"] = settings["resolution"].toString();
        request["duration"] = number(settings["duration"]);
        if (mode == "image_to_video") {
            request["num_inference_steps"] = number(settings["numInferenceSteps"]);
        }
        if (mode == "reference_to_video") {
            // Only sent when on, as on web: a model that cannot take it rejects the request.
            request["use_reference_video_audio"] = settings["useReferenceVideoAudio"].toBool()
                                                       ? QJsonValue(true)
                                                       : QJsonValue(QJsonValue::Null);
        }
    } else if (mode == "extend") {
        request["extend_direction"] = settings["direction"].toString();
        request["duration"] = number(settings["duration"]);
    } else if (mode == "music") {
        request["duration"] = number(settings["duration"]);
    } else if (mode == "audio") {
        request["voice"] = settings["voice"].toString();
        request["speed"] = number(settings["speed"]);
        request["audio_format"] = settings["format"].toString();
    }
    return request;
}

// MediaChatComposer.tsx modelGate labels in the en.json pickModel sentence.
QString pickModelMessage(const QString &mode) {
    static const QHash<QString, QString> kinds{{"image", "image"},
                                              {"image_edit", "image edit"},
                                              {"video", "video"},
                                              {"image_to_video", "image to video"},
                                              {"reference_to_video", "reference to video"},
                                              {"retake", "retake"},
                                              {"extend", "video extension"},
                                              {"audio", "speech"},
                                              {"music", "music"}};
    return "Pick the " + kinds.value(mode, "language") + " model to " + (isMediaMode(mode) ? "generate" : "send") +
           " with.";
}

// web/src/components/chat/composer/ReasoningSelector.tsx LEVEL_IDS.
QVariantList reasoningLevels() {
    return {option("", "Default", "The model's own setting."), option("low", "Low", "Answers fast with little reasoning."),
            option("medium", "Medium", "Balances speed and depth."),
            option("high", "High", "Reasons longest. Slower and costs more.")};
}

// PermissionSelector.tsx MODES with the en.json labels and descriptions.
QVariantList permissionModes() {
    return {option("plan", "Plan", "Investigate and propose a plan. Nothing runs."),
            option("default", "Default", "Reads run. Actions ask first."),
            option("auto", "Auto", "Routine work runs unattended. A step that deletes, publishes, or spends asks once.")};
}

bool isPermissionMode(const QString &mode) {
    return mode == "plan" || mode == "default" || mode == "auto";
}

// packages/protocol/src/reasoning-effort.ts supportsReasoningEffort.
bool supportsReasoningEffort(const QString &provider, const QString &model) {
    if (provider.isEmpty() || model.isEmpty()) {
        return false;
    }
    const auto bare = model.section('/', -1).toLower();
    if (provider == "anthropic") {
        static const QRegularExpression pattern("claude-(opus|sonnet|haiku|fable|mythos)-(\\d+)(?:-(\\d{1,2})(?!\\d))?");
        const auto match = pattern.match(model.toLower());
        if (!match.hasMatch()) {
            return false;
        }
        const auto family = match.captured(1);
        const int major = match.captured(2).toInt();
        const int minor = match.captured(3).isEmpty() ? 0 : match.captured(3).toInt();
        if (major >= 5) {
            return true;
        }
        if (major < 4) {
            return false;
        }
        if (minor >= 7) {
            return true;
        }
        if (family == "opus") {
            return minor >= 5;
        }
        return family == "sonnet" && minor >= 6;
    }
    if (provider == "claude_agent_sdk" || provider == "antigravity") {
        return true;
    }
    if (provider == "openai") {
        static const QRegularExpression excluded("chat|audio|realtime|transcribe|image|tts");
        static const QRegularExpression family("^gpt-5(?:[.-]|$)");
        return !excluded.match(bare).hasMatch() && family.match(bare).hasMatch();
    }
    if (provider == "gemini" || provider == "gemini_vertex") {
        static const QRegularExpression excluded("image|tts|audio|live|transcribe|embedding");
        static const QRegularExpression family("^gemini-(?:2\\.5|3)(?:[.-]|$)");
        return !excluded.match(bare).hasMatch() && family.match(bare).hasMatch();
    }
    return false;
}

// web/src/components/node_types/editing/promptComposer/promptTokens.ts assetToUri.
QString assetUri(const QString &id, const QString &name, const QString &contentType) {
    static const QHash<QString, QString> extensions{
        {"image/png", "png"},   {"image/jpeg", "jpg"}, {"image/gif", "gif"},   {"image/webp", "webp"},
        {"image/bmp", "bmp"},   {"image/svg+xml", "svg"}, {"audio/mpeg", "mp3"}, {"audio/mp3", "mp3"},
        {"audio/wav", "wav"},   {"audio/x-wav", "wav"}, {"audio/ogg", "ogg"},   {"audio/mp4", "m4a"},
        {"audio/flac", "flac"}, {"video/mp4", "mp4"},  {"video/webm", "webm"}};
    QString extension;
    const auto dot = name.lastIndexOf('.');
    if (dot > 0 && dot < name.size() - 1) {
        extension = name.mid(dot + 1).toLower();
    } else {
        const auto type = contentType.toLower();
        extension = extensions.value(type);
        const auto slash = type.indexOf('/');
        if (extension.isEmpty() && slash >= 0) {
            extension = type.mid(slash + 1).section('+', 0, 0);
        }
    }
    return extension.isEmpty() ? "asset://" + id : "asset://" + id + "." + extension;
}

// useDragAndDrop.ts assetToDroppedFile followed by useFileHandling.ts makeMessageContent.
QJsonObject assetContent(const QString &id, const QString &name, const QString &contentType) {
    const auto type = contentType.isEmpty() ? QString("application/octet-stream") : contentType;
    const auto uri = assetUri(id, name, contentType);
    static const QRegularExpression documents(
        "application\\/pdf|application\\/msword|application\\/vnd\\.openxmlformats-officedocument\\.*|"
        "application\\/vnd\\.ms-.*|application\\/vnd\\.apple\\.*|application\\/x-iwork.*");
    for (const auto &kind : {QStringLiteral("image"), QStringLiteral("audio"), QStringLiteral("video")}) {
        if (type.startsWith(kind + "/")) {
            return {{"type", kind == "image" ? "image_url" : kind}, {kind, QJsonObject{{"type", kind}, {"uri", uri}}}};
        }
    }
    if (documents.match(type).hasMatch()) {
        return {{"type", "document"}, {"document", QJsonObject{{"type", "document"}, {"uri", uri}}}};
    }
    return {{"type", "text"}, {"text", name}};
}

// useTextareaAssetMention.tsx findMentionTrigger.
QVariantMap mentionTrigger(const QString &text, int caret) {
    caret = std::clamp(caret, 0, static_cast<int>(text.size()));
    for (int i = caret - 1; i >= 0; --i) {
        const auto character = text[i];
        if (character == '@') {
            if (i > 0 && !text[i - 1].isSpace()) {
                return {};
            }
            const auto query = text.mid(i + 1, caret - i - 1);
            if (query.size() > 64) {
                return {};
            }
            return {{"start", i}, {"end", caret}, {"query", query}};
        }
        if (character.isSpace()) {
            return {};
        }
    }
    return {};
}

// useTextareaAssetMention.tsx removeMentionToken.
QVariantMap removeMention(const QString &text, int start, int end) {
    auto head = text.left(start);
    auto tail = text.mid(end);
    const auto blank = [](QChar character) {
        return character == ' ' || character == '\t';
    };
    if (!head.isEmpty() && blank(head.back()) && (tail.isEmpty() || blank(tail.front()))) {
        head.chop(1);
    } else if (head.isEmpty() && !tail.isEmpty() && blank(tail.front())) {
        tail.remove(0, 1);
    }
    return {{"text", head + tail}, {"caret", head.size()}};
}

// web/src/utils/groupByDate.ts groupByDate with formatDateAndTime.ts relativeTime.
QString dateGroup(const QDateTime &updated, const QDateTime &now) {
    const auto days = updated.toUTC().date().daysTo(now.toUTC().date());
    if (days == 0) {
        return "Today";
    }
    if (days == 1) {
        return "Yesterday";
    }
    if (days < 7) {
        return QString::number(days) + " days ago";
    }
    const auto ago = [](qint64 count, const QString &singular, const QString &plural) {
        return count == 1 ? "1 " + singular + " ago" : QString::number(count) + " " + plural + " ago";
    };
    const auto past = updated.toLocalTime();
    const auto present = now.toLocalTime();
    // date-fns calendar differences: a unit counts once the same point of the next unit has passed.
    int months = (present.date().year() - past.date().year()) * 12 + present.date().month() - past.date().month();
    const auto moved = past.addMonths(months);
    if (moved > present) {
        --months;
    }
    if (months >= 12) {
        return ago(months / 12, "year", "years");
    }
    if (months >= 1) {
        return ago(months, "month", "months");
    }
    auto wholeDays = past.date().daysTo(present.date());
    if (present.time() < past.time()) {
        --wholeDays;
    }
    if (wholeDays >= 7) {
        return ago(wholeDays / 7, "week", "weeks");
    }
    return ago(std::max<qint64>(wholeDays, 0), "day", "days");
}

// ThreadList.tsx formatGroupDate: formatDayMonth upper-cased, in the en-US form "NOV 06".
QString groupDate(const QDateTime &updated) {
    return QLocale(QLocale::English, QLocale::UnitedStates).toString(updated.toLocalTime().date(), "MMM dd").toUpper();
}
} // namespace nt::chat::composer
