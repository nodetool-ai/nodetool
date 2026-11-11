// Behaviour ported from FilmCraft (https://github.com/storytold/filmcraft), MIT OR Apache-2.0.
#include "FrameHold.h"
#include "app/EditRegistry.h"
#include <QJsonArray>

namespace {
QStringList clipIds(const QJsonObject& payload) {
    QStringList result;
    for (const auto& id : payload.value("clipIds").toArray()) { result.append(id.toString()); }
    return result;
}
const bool add = nt::app::registerEdit("frameHold.add", [](const auto& raw, const auto& p) {
    return nt::framehold::addFrameHold(raw, clipIds(p), p.value("atMs").toDouble()).doc;
});
const bool insert = nt::app::registerEdit("frameHold.insertSegment", [](const auto& raw, const auto& p) {
    return nt::framehold::insertFrameHoldSegment(raw, p.value("clipId").toString(),
        p.value("atMs").toDouble(), p.value("durationMs").toDouble()).doc;
});
const bool options = nt::app::registerEdit("frameHold.options", [](const auto& raw, const auto& p) {
    return nt::framehold::setFrameHoldOptions(raw, {clipIds(p), p.value("enabled").toBool(true),
        p.value("holdOn").toString("in"), p.value("playheadMs").toDouble(), p.value("timeMs").toDouble()}).doc;
});
}
