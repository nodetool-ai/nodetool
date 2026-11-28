#pragma once

// Document edits for the native multisample sampler instrument (`type: "sampler"`).

#include <QJsonObject>

namespace nt::midi {

// Document edit `sampler.setParams`: patches any subset of sampler instrument
// parameters (`{ trackId, oneShot?, attackMs?, decayMs?, sustain?, releaseMs?,
// velocityCurve?, glideMs?, voiceLimit?, pitchBendRange?, gainDb? }`).
QJsonObject setSamplerParamsEdit(QJsonObject doc, const QJsonObject& payload);

// Document edit `sampler.setZones`: replaces the zones array on a MIDI track's
// sampler instrument (`{ trackId, zones }`).
QJsonObject setSamplerZonesEdit(QJsonObject doc, const QJsonObject& payload);

// Document edit `sampler.addZone`: appends one zone to a MIDI track's sampler
// instrument (`{ trackId, id?, name?, assetId?, mediaPath?, rootNote?, lowNote?,
// highNote?, lowVelocity?, highVelocity?, gainDb?, pan?, tuneCents?, loopMode?,
// loopStart?, loopEnd?, loopCrossfadeMs?, releaseAssetId?, releaseMediaPath?,
// releaseGainDb? }`).
QJsonObject addSamplerZoneEdit(QJsonObject doc, const QJsonObject& payload);

// Document edit `sampler.updateZone`: patches fields of an existing zone by
// `zoneId` (`{ trackId, zoneId, ... }`).
QJsonObject updateSamplerZoneEdit(QJsonObject doc, const QJsonObject& payload);

// Document edit `sampler.removeZone`: removes a zone by `zoneId`
// (`{ trackId, zoneId }`).
QJsonObject removeSamplerZoneEdit(QJsonObject doc, const QJsonObject& payload);

// Registers all `sampler.*` edits in `nt::app::registerEdit`.
void registerSamplerEdits();

}  // namespace nt::midi
