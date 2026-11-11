#include "SourceEdit.h"
#include "app/EditRegistry.h"

namespace {
const bool place = nt::app::registerEdit("source.place", [](QJsonObject raw, const QJsonObject& payload) {
    for (const auto& key : {"inMs", "outMs", "startMs", "snapMs"}) {
        if (!payload.value(key).isDouble()) { return raw; }
    }
    for (const auto& key : {"videoTrackId", "audioTrackId", "mode"}) {
        if (!payload.value(key).isString()) { return raw; }
    }
    for (const auto& key : {"newVideoTrack", "newAudioTrack"}) {
        if (!payload.value(key).isBool()) { return raw; }
    }
    if (!payload.value("asset").isObject()) { return raw; }
    nt::sourceedit::Placement p;
    p.asset = payload.value("asset").toObject();
    p.inMs = payload.value("inMs").toDouble(); p.outMs = payload.value("outMs").toDouble();
    p.videoTrackId = payload.value("videoTrackId").toString(); p.audioTrackId = payload.value("audioTrackId").toString();
    p.newVideoTrack = payload.value("newVideoTrack").toBool(); p.newAudioTrack = payload.value("newAudioTrack").toBool();
    p.startMs = payload.value("startMs").toDouble(); p.mode = payload.value("mode").toString(); p.snapMs = payload.value("snapMs").toDouble();
    p.videoClipId = payload.value("videoClipId").toString(); p.audioClipId = payload.value("audioClipId").toString();
    const auto result = nt::sourceedit::placeSource(raw, nt::targeting::TrackTargeting::current().state(), p);
    return result ? result->doc : raw;
});
}
