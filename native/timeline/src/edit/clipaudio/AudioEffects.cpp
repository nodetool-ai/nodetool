#include "app/EditRegistry.h"
#include <QJsonArray>
#include <QJsonObject>
#include <QUuid>
#include <utility>
#include <cmath>

namespace {
QJsonObject makeEffect(const QString& type, const QString& id) {
    QJsonObject effect{{"id", id}, {"type", type}, {"enabled", true}};
    QJsonObject defaults;
    if (type == "gain") {
        defaults = {{"gainDb", 0}};
    } else if (type == "eq3") {
        defaults = {{"lowFreq", 200}, {"lowGainDb", 0}, {"midFreq", 1000}, {"midQ", 1},
            {"midGainDb", 0}, {"highFreq", 5000}, {"highGainDb", 0}};
    } else if (type == "filter") {
        defaults = {{"mode", "lowpass"}, {"frequency", 1000}, {"q", 1}};
    } else if (type == "compressor") {
        defaults = {{"thresholdDb", -24}, {"ratio", 4}, {"attackMs", 3}, {"releaseMs", 250}, {"kneeDb", 30}};
    } else if (type == "echo") {
        defaults = {{"delayMs", 350}, {"feedback", 0.4}, {"mix", 0.35}};
    } else if (type == "reverb") {
        defaults = {{"decaySec", 2}, {"mix", 0.3}};
    } else if (type == "distortion") {
        defaults = {{"driveDb", 12}, {"outputDb", -3}};
    } else {
        return {};
    }
    for (auto it = defaults.constBegin(); it != defaults.constEnd(); ++it) {
        effect.insert(it.key(), it.value());
    }
    return effect;
}
enum class Action { Add, Patch, Move, Remove };
QJsonObject editEffects(QJsonObject raw, const QJsonObject& payload, Action action) {
    auto clips = raw.value("clips").toArray();
    for (qsizetype i = 0; i < clips.size(); ++i) {
        auto clip = clips[i].toObject();
        const auto type = clip.value("mediaType").toString();
        if (clip.value("id") != payload.value("clipId") || (type != "audio" && type != "midi")) {
            continue;
        }
        auto effects = clip.value("audioEffects").toArray();
        if (action == Action::Add) {
            const auto id = payload.value("id").toString(QUuid::createUuid().toString(QUuid::Id128));
            const auto effect = makeEffect(payload.value("type").toString(), id);
            if (effect.isEmpty() || id.isEmpty()) { return raw; }
            for (const auto& value : effects) {
                if (value.toObject().value("id").toString() == id) { return raw; }
            }
            effects.append(effect);
        } else {
            qsizetype from = -1;
            for (qsizetype j = 0; j < effects.size(); ++j) {
                if (effects[j].toObject().value("id") == payload.value("effectId")) { from = j; break; }
            }
            if (from < 0) { return raw; }
            if (action == Action::Remove) {
                effects.removeAt(from);
            } else if (action == Action::Move) {
                const auto delta = payload.value("delta").toInt();
                const auto to = from + delta;
                if ((delta != -1 && delta != 1) || to < 0 || to >= effects.size()) { return raw; }
                const QJsonValue moved = effects[from];
                effects[from] = effects[to];
                effects[to] = moved;
            } else {
                auto effect = effects[from].toObject();
                const auto defaults = makeEffect(effect.value("type").toString(), "");
                const auto patch = payload.value("patch").toObject();
                if (patch.isEmpty()) { return raw; }
                for (auto it = patch.constBegin(); it != patch.constEnd(); ++it) {
                    const auto value = it.value();
                    if (it.key() == "id" || it.key() == "type" || !defaults.contains(it.key())) { return raw; }
                    if (it.key() == "enabled") {
                        if (!value.isBool()) { return raw; }
                    } else if (it.key() == "mode") {
                        if (value != "lowpass" && value != "highpass" && value != "bandpass") { return raw; }
                    } else if (!value.isDouble() || !std::isfinite(value.toDouble())) { return raw; }
                    effect.insert(it.key(), value);
                }
                effects[from] = effect;
            }
        }
        clip.insert("audioEffects", effects);
        clips[i] = clip;
        raw.insert("clips", clips);
        return raw;
    }
    return raw;
}
const bool added = nt::app::registerEdit("addClipAudioEffect",
    [](QJsonObject raw, const QJsonObject& payload) { return editEffects(std::move(raw), payload, Action::Add); });
const bool patched = nt::app::registerEdit("patchClipAudioEffect",
    [](QJsonObject raw, const QJsonObject& payload) { return editEffects(std::move(raw), payload, Action::Patch); });
const bool moved = nt::app::registerEdit("moveClipAudioEffect",
    [](QJsonObject raw, const QJsonObject& payload) { return editEffects(std::move(raw), payload, Action::Move); });
const bool removed = nt::app::registerEdit("removeClipAudioEffect",
    [](QJsonObject raw, const QJsonObject& payload) { return editEffects(std::move(raw), payload, Action::Remove); });
}
