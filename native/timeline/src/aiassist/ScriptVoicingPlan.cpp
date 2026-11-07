#include "aiassist/ScriptVoicingPlan.h"
#include <QJsonArray>
#include <cmath>
namespace nt::aiassist {
VoicePlan planScriptVoice(const QJsonObject& script, const QString& lineId) {
    VoicePlan plan;
    plan.scriptId = script.value("id").toString();
    if (plan.scriptId.isEmpty() || lineId.isEmpty()) { plan.error = "Choose a script line to voice."; return plan; }
    const auto document = script.value("document").toObject();
    for (const auto& section : document.value("sections").toArray()) {
        for (const auto& value : section.toObject().value("lines").toArray()) {
            if (value.toObject().value("id").toString() == lineId) { plan.line = value.toObject(); break; }
        }
    }
    if (plan.line.isEmpty()) { plan.error = "Script line no longer exists."; return plan; }
    const auto text = plan.line.value("text").toString().trimmed();
    if (text.isEmpty()) { plan.error = "Line has no text to voice."; return plan; }
    plan.voice = plan.line.value("voiceOverride").toObject();
    if (plan.voice.isEmpty()) {
        for (const auto& value : document.value("cast").toArray()) {
            const auto speaker = value.toObject();
            if (speaker.value("id") == plan.line.value("speakerId")) { plan.voice = speaker.value("voice").toObject(); break; }
        }
    }
    for (const auto& field : {"provider", "model", "voice"}) {
        if (plan.voice.value(field).toString().trimmed().isEmpty()) { plan.error = "Assign a speaker voice or a line voice override."; return plan; }
    }
    plan.request = {{"mode", "audio"}, {"provider", plan.voice.value("provider")}, {"model", plan.voice.value("model")},
        {"voice", plan.voice.value("voice")}, {"prompt", text}};
    const auto pace = document.value("setup").toObject().value("pace").toString();
    if (pace == "slow") { plan.request.insert("speed", 0.85); }
    else if (pace == "fast") { plan.request.insert("speed", 1.15); }
    const auto direction = plan.line.value("direction").toString().trimmed();
    if (!direction.isEmpty()) { plan.request.insert("instructions", direction); }
    return plan;
}
QJsonObject scriptVoiceTake(const VoicePlan& plan, const QString& assetId, double durationMs,
                           const QJsonObject& transcription, const QString& id, const QString& createdAt,
                           const QJsonObject& generation) {
    if (!plan.error.isEmpty() || assetId.isEmpty() || id.isEmpty()) { return {}; }
    QJsonArray words;
    for (const auto& value : transcription.value("words").toArray()) {
        const auto word = value.toObject();
        if (!word.value("word").isString() || !word.value("startMs").isDouble() || !word.value("endMs").isDouble()) { continue; }
        const auto start = word.value("startMs").toDouble();
        const auto end = word.value("endMs").toDouble();
        if (!std::isfinite(start) || !std::isfinite(end)) { continue; }
        words.append(QJsonObject{{"word", word.value("word")}, {"startMs", start}, {"endMs", end}});
    }
    QJsonObject take{{"id", id}, {"assetId", assetId}, {"durationMs", std::isfinite(durationMs) && durationMs > 0 ? durationMs : 0},
        {"words", words}, {"textSnapshot", plan.line.value("text")}, {"voiceSnapshot", plan.voice},
        {"directionSnapshot", plan.line.value("direction").toString().trimmed()}, {"createdAt", createdAt}};
    const auto provider = plan.voice.value("provider").toString();
    if (provider.toLower() != "gemini" && provider.toLower() != "google" && provider.toLower() != "huggingface" && provider.toLower() != "hf" && provider.toLower() != "nodetool") {
        take.insert("speedSnapshot", plan.request.contains("speed") ? plan.request.value("speed") : QJsonValue::Null);
    }
    if (generation.value("cost_credits").isDouble()) { take.insert("costCredits", generation.value("cost_credits")); }
    return take;
}
QJsonObject appendScriptTake(QJsonObject script, const QString& lineId, const QJsonObject& take) {
    if (take.value("id").toString().isEmpty() || take.value("assetId").toString().isEmpty()) { return script; }
    auto document = script.value("document").toObject();
    auto sections = document.value("sections").toArray();
    for (qsizetype i = 0; i < sections.size(); ++i) {
        auto section = sections.at(i).toObject();
        auto lines = section.value("lines").toArray();
        for (qsizetype j = 0; j < lines.size(); ++j) {
            auto line = lines.at(j).toObject();
            if (line.value("id").toString() != lineId) { continue; }
            auto takes = line.value("takes").toArray();
            bool exists = false;
            for (const auto& value : takes) { if (value.toObject().value("id") == take.value("id")) { exists = true; break; } }
            if (!exists) { takes.append(take); }
            line.insert("takes", takes);
            line.insert("currentTakeId", take.value("id"));
            lines[j] = line;
            section.insert("lines", lines);
            sections[i] = section;
            document.insert("sections", sections);
            script.insert("document", document);
            return script;
        }
    }
    return script;
}
}
