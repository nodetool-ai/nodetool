#include "TrackEffectsModel.h"
#include "app/EditRegistry.h"
#include <QJsonArray>
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
            auto effect = input.isString()
                ? nt::wiring::w::effectReference().value("defaults").toObject().value(input.toString()).toObject()
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
const bool registered = [] {
    for (const auto* name : {"addTrackEffect", "updateTrackEffect", "removeTrackEffect", "moveTrackEffect"}) {
        const auto action = QString::fromLatin1(name);
        nt::app::registerEdit(action, [action](QJsonObject document, const QJsonObject& payload) {
            return editEffects(std::move(document), payload, action);
        });
    }
    return true;
}();
}
