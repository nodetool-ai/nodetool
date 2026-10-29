#include "ai/ClipRequests.h"
#include <QJsonArray>
#include <QRegularExpression>
#include <algorithm>
#include <cmath>
#include <limits>

namespace nt::ai {
namespace {
ClipRequestResult fail(const QString& error) { return {{}, {}, error}; }
QString str(const QJsonObject& object, const char* key) { return object.value(key).toString().trimmed(); }
bool positive(double value) { return std::isfinite(value) && value > 0; }
QString activeTake(const QJsonObject& clip, bool fallback) {
    for (const auto& value : clip.value("versions").toArray()) {
        const auto take = value.toObject();
        if (take.value("assetId") == clip.value("currentAssetId")) return take.value("id").toString();
    }
    return fallback ? clip.value("activeTakeId").toString() : QString();
}
QJsonArray uniqueStrings(const QJsonArray& input) {
    QJsonArray result;
    for (const auto& value : input) {
        if (value.isString() && !value.toString().isEmpty() && !result.contains(value)) result.append(value);
    }
    return result;
}
ClipRequestResult sourceContext(const QString& sequenceId, const QJsonObject& clip, bool extension) {
    const auto id = str(clip, "id"), asset = str(clip, "currentAssetId");
    const double start = clip.value("startMs").toDouble(std::numeric_limits<double>::quiet_NaN());
    const double duration = clip.value("durationMs").toDouble(std::numeric_limits<double>::quiet_NaN());
    if (sequenceId.isEmpty() || id.isEmpty() || asset.isEmpty() || clip.value("mediaType").toString() != u"video" ||
        (extension && str(clip, "trackId").isEmpty()) || !std::isfinite(start) || (extension && start < 0) || !positive(duration))
        return fail(QStringLiteral("A saved video clip with an active asset and positive duration is required."));
    if (!clip.value("timeRemap").toObject().value("keyframes").toArray().isEmpty())
        return fail(QStringLiteral("Bake the time remap before generating."));
    const double rate = clip.value("speedBaked").toBool() ? 1 : clip.value("speedMultiplier").toDouble(1);
    if (!positive(rate) || (!extension && rate != 1))
        return fail(QStringLiteral("This operation requires supported constant playback speed."));
    const double in = clip.value("inPointMs").toDouble(0);
    const double expected = in + duration * rate;
    const double out = clip.value("outPointMs").toDouble(expected);
    if (!std::isfinite(in) || in < 0 || !std::isfinite(out) || !std::isfinite(expected) || out <= in || std::abs(out - expected) > 0.5)
        return fail(QStringLiteral("The clip has an invalid source window."));
    QJsonObject context{{"sequenceId", sequenceId}, {"clipId", id}, {"sourceAssetId", asset},
                        {"sourceStartMs", in}, {"sourceEndMs", out}, {"timelineStartMs", start},
                        {"timelineDurationMs", duration}, {"speedMultiplier", rate}};
    const auto take = activeTake(clip, extension);
    if (!take.isEmpty()) context.insert("sourceTakeId", take);
    if (extension) context.insert("trackId", clip.value("trackId"));
    return {context, {}, {}};
}
QJsonObject wireContext(const QJsonObject& context) {
    QJsonObject result{{"sequence_id", context.value("sequenceId")}, {"clip_id", context.value("clipId")},
                       {"source_asset_id", context.value("sourceAssetId")}, {"source_start_ms", context.value("sourceStartMs")},
                       {"source_end_ms", context.value("sourceEndMs")}, {"timeline_start_ms", context.value("timelineStartMs")},
                       {"timeline_duration_ms", context.value("timelineDurationMs")}, {"speed_multiplier", context.value("speedMultiplier")}};
    if (context.contains("sourceTakeId")) result.insert("source_take_id", context.value("sourceTakeId"));
    return result;
}
void optional(QJsonObject& target, const char* output, const QJsonObject& source, const char* input) {
    if (source.contains(input) && !source.value(input).isNull()) target.insert(output, source.value(input));
}
}

ClipRequestResult mediaEditRequest(const QString& sequenceId, const QJsonObject& clip, const QJsonObject& options) {
    auto source = sourceContext(sequenceId, clip, false);
    if (!source.ok()) return source;
    const auto prompt = str(options, "instruction"), provider = str(options, "provider"), model = str(options, "model");
    if (prompt.isEmpty() || provider.isEmpty() || model.isEmpty()) return fail(QStringLiteral("Choose an instruction, provider and model."));
    QJsonObject snapshot{{"action", "video_edit"}, {"modelTask", "video_to_video"}, {"sourceContext", source.snapshot},
                         {"instruction", prompt}, {"provider", provider}, {"model", model}};
    QJsonObject data{{"mode", "video_edit"}, {"provider", provider}, {"model", model}, {"prompt", prompt},
                     {"source_asset_id", source.snapshot.value("sourceAssetId")}, {"source_context", wireContext(source.snapshot)},
                     {"duration", std::round(source.snapshot.value("timelineDurationMs").toDouble() / 1000)}, {"variations", 1}};
    for (const auto& keys : {std::pair{"strength", "strength"}, {"resolution", "resolution"}}) {
        optional(snapshot, keys.first, options, keys.second); optional(data, keys.first, options, keys.second);
    }
    for (const auto& keys : {std::pair{"referenceAssetIds", "reference_asset_ids"}, {"entityIds", "entity_ids"}}) {
        const auto values = uniqueStrings(options.value(keys.first).toArray());
        if (!values.isEmpty()) { snapshot.insert(keys.first, values); data.insert(keys.second, values); }
    }
    return {snapshot, data, {}};
}

ClipRequestResult extensionRequest(const QString& sequenceId, const QString& requestId, const QJsonObject& clip,
                                   const QJsonObject& model, const QJsonObject& options) {
    auto source = sourceContext(sequenceId, clip, true);
    if (!source.ok()) return source;
    const auto direction = str(options, "direction"), prompt = str(options, "prompt");
    const auto provider = str(model, "provider"), modelId = str(model, "id");
    const double duration = options.value("addedSourceDurationMs").toDouble();
    const auto tasks = model.value("supportedTasks").toArray();
    if (requestId.isEmpty() || provider.isEmpty() || modelId.isEmpty() || !tasks.contains("extend_video") ||
        (direction != u"start" && direction != u"end") || !positive(duration) || prompt.isEmpty())
        return fail(QStringLiteral("Choose an extension model, direction, duration and instruction."));
    if ((tasks.contains("extend_video_start") || tasks.contains("extend_video_end")) && !tasks.contains("extend_video_" + direction))
        return fail(QStringLiteral("The model does not support this extension direction."));
    const auto durations = model.value("durations").toArray();
    if (!durations.isEmpty() && !durations.contains(duration / 1000)) return fail(QStringLiteral("Choose a supported extension duration."));
    auto captured = source.snapshot; captured.remove("sequenceId");
    captured.insert("rate", captured.take("speedMultiplier"));
    QJsonObject snapshot{{"action", "video_extend"}, {"requestId", requestId}, {"sequenceId", sequenceId}, {"source", captured},
                         {"direction", direction}, {"addedSourceDurationMs", duration}, {"prompt", prompt}, {"provider", provider}, {"model", modelId}};
    QJsonObject data{{"mode", "video_extend"}, {"provider", provider}, {"model", modelId}, {"prompt", prompt},
                     {"extension_mode", direction}, {"duration", duration / 1000}, {"variations", 1},
                     {"source_asset_id", source.snapshot.value("sourceAssetId")}, {"source_context", wireContext(source.snapshot)}};
    return {snapshot, data, {}};
}

ClipRequestResult imageToVideoRequest(const QString& sequenceId, const QJsonObject& sourceClip,
                                     const QJsonObject& model, const QJsonObject& options) {
    const auto sourceId = str(sourceClip, "id"), asset = str(sourceClip, "currentAssetId"), target = str(options, "targetClipId");
    const auto provider = str(model, "provider"), modelId = str(model, "id"), prompt = str(options, "prompt");
    const double duration = sourceClip.value("durationMs").toDouble();
    if (sequenceId.isEmpty() || sourceId.isEmpty() || target.isEmpty() || asset.isEmpty() ||
        sourceClip.value("mediaType").toString() != u"image" || !positive(duration) || provider.isEmpty() || modelId.isEmpty() || prompt.isEmpty())
        return fail(QStringLiteral("Choose a generated image, model and prompt."));
    double seconds = std::max(1.0, std::ceil(duration / 1000 - 1e-6));
    double clipDuration = duration;
    QList<double> durations;
    for (const auto& value : model.value("durations").toArray()) if (value.isDouble() && positive(value.toDouble())) durations.append(value.toDouble());
    std::sort(durations.begin(), durations.end());
    if (!durations.isEmpty() && !durations.contains(seconds)) {
        const auto it = std::find_if(durations.cbegin(), durations.cend(), [duration](double d) { return d >= duration / 1000; });
        seconds = it == durations.cend() ? durations.last() : *it;
        clipDuration = seconds * 1000;
    }
    const double width = options.value("width").toDouble(), height = options.value("height").toDouble();
    QString aspect, resolution;
    if (positive(width) && positive(height)) {
        double best = std::numeric_limits<double>::infinity();
        const QRegularExpression ratio(QStringLiteral(R"(^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$)"));
        for (const auto& value : model.value("aspectRatios").toArray()) {
            const auto match = ratio.match(value.toString().trimmed());
            if (!match.hasMatch()) continue;
            const double a = match.captured(1).toDouble(), b = match.captured(2).toDouble();
            if (!positive(a) || !positive(b)) continue;
            const double distance = std::abs(std::log(a / b) - std::log(width / height));
            if (distance < best) { best = distance; aspect = value.toString(); }
        }
        QList<std::pair<int, QString>> tiers;
        const QRegularExpression lines(QStringLiteral(R"(^(\d+)p$)"));
        for (const auto& value : model.value("resolutions").toArray()) {
            const auto normalized = value.toString().trimmed().toLower();
            const auto match = lines.match(normalized);
            const int tier = normalized == u"4k" ? 2160 : normalized == u"2k" ? 1440 : match.hasMatch() ? match.captured(1).toInt() : 0;
            if (tier) tiers.append({tier, value.toString()});
        }
        std::stable_sort(tiers.begin(), tiers.end(), [](const auto& a, const auto& b) { return a.first < b.first; });
        if (!tiers.isEmpty()) {
            resolution = tiers.first().second;
            for (const auto& tier : tiers) if (tier.first <= std::min(width, height)) resolution = tier.second;
        }
    }
    QJsonObject context{{"sequence_id", sequenceId}, {"source_clip_id", sourceId}, {"target_clip_id", target}};
    QJsonObject data{{"mode", "video"}, {"provider", provider}, {"model", modelId}, {"prompt", prompt},
                     {"source_asset_id", asset}, {"timeline_context", context}, {"duration", seconds}, {"variations", 1}};
    QJsonObject snapshot{{"sourceClipId", sourceId}, {"sourceAssetId", asset}, {"targetClipId", target},
                         {"sequenceId", sequenceId}, {"provider", provider}, {"model", modelId}, {"prompt", prompt},
                         {"requestSeconds", seconds}, {"clipDurationMs", clipDuration}, {"startMs", sourceClip.value("startMs")}};
    if (!aspect.isEmpty()) { data.insert("aspect_ratio", aspect); snapshot.insert("aspectRatio", aspect); }
    if (!resolution.isEmpty()) { data.insert("resolution", resolution); snapshot.insert("resolution", resolution); }
    return {snapshot, data, {}};
}

ClipRequestResult lineDeliveryRequest(const QJsonObject& input) {
    const auto line = input.value("line").toObject(), cast = input.value("castMember").toObject();
    const auto script = str(input, "scriptId"), id = str(line, "id"), text = str(line, "text"), speaker = str(line, "speakerId");
    if (script.isEmpty() || id.isEmpty() || text.isEmpty()) return fail(QStringLiteral("A linked script, line and line text are required."));
    if (!speaker.isEmpty() && !cast.isEmpty() && str(cast, "id") != speaker) return fail(QStringLiteral("The cast member does not match the line speaker."));
    const auto voice = line.value("voiceOverride").isObject() ? line.value("voiceOverride").toObject() : cast.value("voice").toObject();
    const auto provider = str(voice, "provider"), model = str(voice, "model"), voiceId = str(voice, "voice");
    if (provider.isEmpty() || model.isEmpty() || voiceId.isEmpty()) return fail(QStringLiteral("An effective provider, model and voice are required."));
    const auto pace = str(input, "pace"), language = str(input, "language"), direction = str(line, "direction");
    auto instructions = str(input, "instructions"); if (instructions.isEmpty()) instructions = direction;
    double speed = 0;
    if (input.contains("speed") && !input.value("speed").isNull()) {
        speed = input.value("speed").toDouble(-1);
        if (!std::isfinite(speed) || speed < 0.25 || speed > 4) return fail(QStringLiteral("Speed must be between 0.25 and 4."));
    } else if (pace == u"slow") speed = 0.85;
    else if (pace == u"normal") speed = 1;
    else if (pace == u"fast") speed = 1.15;
    else if (!pace.isEmpty()) return fail(QStringLiteral("Invalid pace."));
    const auto targetDuration = line.value("targetDurationMs");
    if (!targetDuration.isUndefined() && !targetDuration.isNull() && (!targetDuration.isDouble() || !positive(targetDuration.toDouble())))
        return fail(QStringLiteral("Target duration must be positive."));
    const QJsonObject resolvedVoice{{"provider", provider}, {"model", model}, {"voice", voiceId}};
    QJsonObject source{{"scriptId", script}, {"lineId", id}, {"text", text}, {"voice", resolvedVoice}};
    QJsonObject context{{"script_id", script}, {"line_id", id}, {"text", text}, {"voice", resolvedVoice}};
    QJsonObject snapshot{{"action", "change_line_delivery"}, {"modelTask", "text_to_speech"}};
    QJsonObject data{{"mode", "audio"}, {"provider", provider}, {"model", model}, {"voice", voiceId}, {"prompt", text}};
    if (!speaker.isEmpty()) { source.insert("speakerId", speaker); context.insert("speaker_id", speaker); }
    if (!direction.isEmpty()) { source.insert("direction", direction); context.insert("direction", direction); }
    if (!language.isEmpty()) { source.insert("language", language); context.insert("language", language); data.insert("language", language); }
    if (!pace.isEmpty()) { source.insert("pace", pace); context.insert("pace", pace); }
    if (!instructions.isEmpty()) { snapshot.insert("instructions", instructions); context.insert("instructions", instructions); data.insert("instructions", instructions); }
    if (speed) { snapshot.insert("speed", speed); context.insert("speed", speed); data.insert("speed", speed); }
    if (targetDuration.isDouble()) {
        source.insert("targetDurationMs", targetDuration); context.insert("target_duration_ms", targetDuration);
        data.insert("duration", targetDuration.toDouble() / 1000);
    }
    snapshot.insert("sourceContext", source); data.insert("line_delivery_context", context);
    return {snapshot, data, {}};
}
}
