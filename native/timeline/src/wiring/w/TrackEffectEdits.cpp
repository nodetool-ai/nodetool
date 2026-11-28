#include "TrackEffectsModel.h"
#include "app/EditRegistry.h"
#include <QJsonArray>
#include <QFile>
#include <QJSEngine>
#include <algorithm>
#include <stdexcept>
#include <QUuid>
#include <cmath>

namespace {
QJsonObject editEffects(QJsonObject document, const QJsonObject& payload, const QString& action) {
    auto tracks = document.value("tracks").toArray();
    if (action == "updateTrackEffect") {
        QJsonObject current;
        bool found = false;
        for (const auto& value : tracks) {
            const auto track = value.toObject();
            if (track.value("id") != payload.value("trackId")) { continue; }
            for (const auto& entry : track.value("effects").toArray()) {
                if (entry.toObject().value("id") == payload.value("effectId")) {
                    current = entry.toObject();
                    found = true;
                    break;
                }
            }
            break;
        }
        if (!found) { return document; }
        bool unchanged = true;
        const auto patch = payload.value("patch").toObject();
        for (auto field = patch.begin(); field != patch.end(); ++field) {
            if (current.value(field.key()) != field.value()) { unchanged = false; break; }
        }
        if (unchanged) { return document; }
    }
    for (qsizetype i = 0; i < tracks.size(); ++i) {
        auto track = tracks[i].toObject();
        if (track.value("id") != payload.value("trackId")) { continue; }
        auto effects = track.value("effects").toArray();
        if (action == "addTrackEffect") {
            const auto input = payload.value("effect");
            const auto name = input.toString();
            const auto reference = nt::wiring::w::effectReference();
            auto effect = input.isString()
                ? (name.startsWith("fable:")
                    ? reference.value("fableDefaults").toObject().value(name.mid(6)).toObject()
                    : reference.value("defaults").toObject().value(name).toObject())
                : input.toObject();
            if (input.isString()) {
                if (effect.isEmpty()) { return document; }
                effect.insert("id", QUuid::createUuid().toString(QUuid::Id128));
            }
            effects.append(effect);
        } else if (action == "updateTrackEffect") {
            const auto id = payload.value("effectId");
            const auto patch = payload.value("patch").toObject();
            for (qsizetype j = 0; j < effects.size(); ++j) {
                auto effect = effects[j].toObject();
                if (effect.value("id") != id) { continue; }
                for (auto field = patch.begin(); field != patch.end(); ++field) {
                    effect.insert(field.key(), field.value());
                }
                effects[j] = effect;
            }
        } else if (action == "removeTrackEffect") {
            QJsonArray remaining;
            for (const auto& value : effects) {
                if (value.toObject().value("id") != payload.value("effectId")) { remaining.append(value); }
            }
            effects = remaining;
        } else {
            const double from = payload.value("oldIndex").toDouble(-1);
            const double to = payload.value("newIndex").toDouble(-1);
            if (!std::isfinite(from) || !std::isfinite(to) || from < 0 || to < 0 || from >= effects.size() || to >= effects.size() || from == to) { continue; }
            const auto moved = effects.takeAt(static_cast<int>(std::trunc(from)));
            effects.insert(static_cast<int>(std::trunc(to)), moved);
        }
        track.insert("effects", effects);
        tracks[i] = track;
    }
    document.insert("tracks", tracks);
    return document;
}
// UI thread only. Read the editor's definitions so bounds cannot drift from its controls.
QJsonObject setFableParams(QJsonObject document, const QJsonObject& payload) {
    const auto fail = [](const char* message) { throw std::invalid_argument(message); };
    QJsonObject effect;
    for (const auto& entry : document.value("tracks").toArray()) {
        const auto track = entry.toObject();
        if (track.value("id") != payload.value("trackId")) { continue; }
        for (const auto& value : track.value("effects").toArray()) {
            if (value.toObject().value("id") == payload.value("effectId")) { effect = value.toObject(); break; }
        }
        break;
    }
    if (effect.value("type") != "fable") { fail("effect.setParams needs an existing Fable track effect."); }
    if (!payload.value("params").isObject() || payload.value("params").toObject().isEmpty()) {
        fail("params must be a nonempty object of fx.<unit>.<param> values.");
    }
    QFile file(":/qt/qml/NodeTool/Timeline/qml/fx/FxParams.js");
    if (!file.open(QIODevice::ReadOnly)) { fail("Fable parameter definitions are unavailable."); }
    auto source = QString::fromUtf8(file.readAll());
    source.remove(".pragma library");
    QJSEngine engine;
    if (engine.evaluate(source).isError()) { fail("Cannot load Fable parameter definitions."); }
    const auto defs = engine.globalObject().property("FABLE_FX_PARAMS").property(effect.value("kind").toString());
    if (!defs.isArray()) { fail("Unknown Fable effect kind."); }
    auto params = effect.value("params").toObject();
    const auto changes = payload.value("params").toObject();
    for (auto it = changes.begin(); it != changes.end(); ++it) {
        QJSValue def;
        for (int i = 0; i < defs.property("length").toInt(); ++i) {
            const auto candidate = defs.property(i);
            if (candidate.property("id").toString() == it.key()) { def = candidate; break; }
        }
        if (def.isUndefined()) { fail("Unknown parameter id for this Fable effect kind."); }
        if (!it.value().isDouble() || !std::isfinite(it.value().toDouble())) { fail("Fable parameters must be finite numbers."); }
        auto value = it.value().toDouble();
        const auto type = def.property("type").toString();
        if (type == "enum" || type == "bool") {
            const int count = type == "bool" ? 2 : def.property("options").property("length").toInt();
            if (value != std::floor(value) || value < 0 || value >= count) { fail("Invalid Fable enum or boolean value."); }
        } else {
            value = std::clamp(value, def.property("min").toNumber(), def.property("max").toNumber());
            if (def.property("curve").toString() == "int") { value = std::round(value); }
        }
        params.insert(it.key(), value);
    }
    // Same replacement patch as FableEffectEditor.withParams, in one editor undo entry.
    return editEffects(std::move(document), {{"trackId", payload.value("trackId")},
        {"effectId", payload.value("effectId")}, {"patch", QJsonObject{{"params", params}}}}, "updateTrackEffect");
}
const bool registered = [] {
    nt::app::registerEdit("effect.setParams", setFableParams);
    for (const auto* name : {"addTrackEffect", "updateTrackEffect", "removeTrackEffect", "moveTrackEffect"}) {
        const auto action = QString::fromLatin1(name);
        nt::app::registerEdit(action, [action](QJsonObject document, const QJsonObject& payload) {
            return editEffects(std::move(document), payload, action);
        });
    }
    return true;
}();
}
