#include "aiassist/AssistDocument.h"
#include "app/EditRegistry.h"
#include "aiassist/LinkedWorkflow.h"
#include "aiassist/StoryboardAssembly.h"
#include "aiassist/TranscriptBeats.h"
#include "edit/clipboard/RawDocument.h"
#include <QSet>
namespace {
QJsonObject beatEdit(QJsonObject raw, const QJsonObject& payload, const nt::app::Edit& edit) {
    const auto result = edit(raw, payload);
    const auto locked = nt::edit::lockedUserTargetIds(nt::edit::structure::editDocument(raw));
    QHash<QString, QJsonObject> before, after;
    QSet<QString> lockedTracks;
    for (const auto& trackValue : raw.value("tracks").toArray()) { const auto track = trackValue.toObject(); if (track.value("locked").toBool()) { lockedTracks.insert(track.value("id").toString()); } }
    for (const auto& value : raw.value("clips").toArray()) { const auto clip = value.toObject(); before.insert(clip.value("id").toString(), clip); }
    for (const auto& value : result.value("clips").toArray()) {
        const auto clip = value.toObject(); const auto id = clip.value("id").toString(); after.insert(id, clip);
        if (!before.contains(id) && lockedTracks.contains(clip.value("trackId").toString())) { return raw; }
    }
    for (const auto& id : locked) { if (before.value(id) != after.value(id)) { return raw; } }
    return result;
}
const bool beatAddRegistered = nt::app::registerEdit("assist.addBeat", [](QJsonObject raw, const QJsonObject& payload) { return beatEdit(std::move(raw), payload, nt::aiassist::addTranscriptBeat); });
const bool beatTextRegistered = nt::app::registerEdit("assist.setBeatText", [](QJsonObject raw, const QJsonObject& payload) { return beatEdit(std::move(raw), payload, nt::aiassist::setTranscriptBeatText); });
const bool beatDeleteRegistered = nt::app::registerEdit("assist.deleteBeat", [](QJsonObject raw, const QJsonObject& payload) { return beatEdit(std::move(raw), payload, nt::aiassist::deleteTranscriptParagraph); });
const bool beatReorderRegistered = nt::app::registerEdit("assist.reorderBeats", [](QJsonObject raw, const QJsonObject& payload) { return beatEdit(std::move(raw), payload, nt::aiassist::reflowTranscript); });
const bool assemblyRegistered = nt::app::registerEdit("assist.assembleStoryboard", [](QJsonObject raw, const QJsonObject& payload) {
    const auto assembled = nt::aiassist::assembleStoryboard(raw, payload.value("board").toObject(), payload.value("script").toObject());
    return assembled.error.isEmpty() ? assembled.document : raw;
});
const bool scriptRegistered = nt::app::registerEdit("assist.reconcileScript", nt::aiassist::reconcileScript);
const bool shotRegistered = nt::app::registerEdit("assist.syncStoryboardShot", nt::aiassist::syncStoryboardShot);
const bool deleteRegistered = nt::app::registerEdit("assist.deleteTranscriptRange", nt::aiassist::deleteTranscriptRange);
const bool fillerRegistered = nt::app::registerEdit("assist.removeFillers", nt::aiassist::removeFillers);
const bool registered = nt::app::registerEdit("assist.correctTranscript", nt::aiassist::correctTranscript);
}
