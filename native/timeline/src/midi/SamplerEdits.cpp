#include "midi/SamplerEdits.h"

#include "app/EditRegistry.h"
#include "midi/MultisampleSampler.h"

#include <QJsonArray>
#include <QJsonValue>
#include <QString>
#include <QUuid>

#include <algorithm>
#include <cmath>

namespace nt::midi {
namespace {

bool applyFloat(const QJsonObject& payload, QStringView key, float& target, double lo, double hi) {
    const QJsonValue v = payload.value(key);
    if (!v.isDouble()) return false;
    const double d = v.toDouble();
    if (!std::isfinite(d)) return false;
    const float next = static_cast<float>(std::clamp(d, lo, hi));
    if (next == target) return false;
    target = next;
    return true;
}

bool applyDouble(const QJsonObject& payload, QStringView key, double& target, double lo, double hi) {
    const QJsonValue v = payload.value(key);
    if (!v.isDouble()) return false;
    const double d = v.toDouble();
    if (!std::isfinite(d)) return false;
    const double next = std::clamp(d, lo, hi);
    if (next == target) return false;
    target = next;
    return true;
}

bool applyInt(const QJsonObject& payload, QStringView key, int& target, int lo, int hi) {
    const QJsonValue v = payload.value(key);
    if (!v.isDouble()) return false;
    const double d = v.toDouble();
    if (!std::isfinite(d)) return false;
    const int next = std::clamp(static_cast<int>(std::llround(d)), lo, hi);
    if (next == target) return false;
    target = next;
    return true;
}

bool applyBool(const QJsonObject& payload, QStringView key, bool& target) {
    const QJsonValue v = payload.value(key);
    if (!v.isBool()) return false;
    const bool next = v.toBool();
    if (next == target) return false;
    target = next;
    return true;
}

bool applyString(const QJsonObject& payload, QStringView key, std::string& target) {
    const QJsonValue v = payload.value(key);
    if (!v.isString()) return false;
    const std::string next = v.toString().toStdString();
    if (next == target) return false;
    target = next;
    return true;
}

bool patchZoneFields(const QJsonObject& payload, SamplerZoneSpec& z) {
    bool changed = false;
    changed |= applyString(payload, u"name", z.name);
    changed |= applyString(payload, u"assetId", z.assetId);
    changed |= applyString(payload, u"mediaPath", z.mediaPath);
    changed |= applyInt(payload, u"rootNote", z.rootNote, 0, 127);
    changed |= applyInt(payload, u"lowNote", z.lowNote, 0, 127);
    changed |= applyInt(payload, u"highNote", z.highNote, 0, 127);
    if (z.highNote < z.lowNote) {
        z.highNote = z.lowNote;
        changed = true;
    }
    changed |= applyInt(payload, u"lowVelocity", z.lowVelocity, 0, 127);
    changed |= applyInt(payload, u"highVelocity", z.highVelocity, 0, 127);
    if (z.highVelocity < z.lowVelocity) {
        z.highVelocity = z.lowVelocity;
        changed = true;
    }
    changed |= applyFloat(payload, u"gainDb", z.gainDb, -60.0, 12.0);
    changed |= applyFloat(payload, u"pan", z.pan, -1.0, 1.0);
    changed |= applyFloat(payload, u"tuneCents", z.tuneCents, -100.0, 100.0);
    if (payload.contains(u"loopMode")) {
        const QJsonValue lm = payload.value(u"loopMode");
        if (lm.isNull() || (lm.isString() && (lm.toString().isEmpty() || lm.toString() == u"inherit"))) {
            if (z.loopMode.has_value()) {
                z.loopMode.reset();
                changed = true;
            }
        } else if (lm.isString()) {
            const auto parsed = samplerLoopModeFromName(lm.toString().toStdString());
            if (parsed.has_value() && z.loopMode != parsed) {
                z.loopMode = parsed;
                changed = true;
            }
        }
    }
    changed |= applyDouble(payload, u"loopStart", z.loopStart, 0.0, 1.0);
    changed |= applyDouble(payload, u"loopEnd", z.loopEnd, 0.0, 1.0);
    if (z.loopEnd < z.loopStart) {
        z.loopEnd = z.loopStart;
        changed = true;
    }
    changed |= applyFloat(payload, u"loopCrossfadeMs", z.loopCrossfadeMs, 0.0, 500.0);
    changed |= applyString(payload, u"releaseAssetId", z.releaseAssetId);
    changed |= applyString(payload, u"releaseMediaPath", z.releaseMediaPath);
    changed |= applyFloat(payload, u"releaseGainDb", z.releaseGainDb, -60.0, 12.0);
    return changed;
}

template <typename Fn>
QJsonObject editSamplerTrack(QJsonObject doc, const QString& trackId, Fn&& mutate) {
    if (trackId.isEmpty()) return doc;
    auto tracks = doc.value(u"tracks").toArray();
    for (qsizetype i = 0; i < tracks.size(); ++i) {
        auto track = tracks[i].toObject();
        if (track.value(u"id").toString() != trackId) continue;
        if (track.value(u"type").toString() != u"midi" || track.value(u"locked").toBool()) {
            return doc;
        }
        const QJsonObject currentInst = track.value(u"instrument").toObject();
        SamplerInstrumentSpec spec = (currentInst.value(u"type").toString() == u"sampler")
            ? samplerSpecFromJson(currentInst)
            : SamplerInstrumentSpec{};
        if (!mutate(spec)) return doc;
        const QJsonObject nextInst = samplerSpecToJson(spec);
        if (currentInst == nextInst) return doc;
        track.insert(u"instrument", nextInst);
        tracks[i] = track;
        doc.insert(u"tracks", tracks);
        return doc;
    }
    return doc;
}

}  // namespace

QJsonObject setSamplerParamsEdit(QJsonObject doc, const QJsonObject& payload) {
    const QString trackId = payload.value(u"trackId").toString();
    return editSamplerTrack(std::move(doc), trackId, [&](SamplerInstrumentSpec& spec) {
        bool changed = false;
        changed |= applyBool(payload, u"oneShot", spec.params.oneShot);
        changed |= applyFloat(payload, u"attackMs", spec.params.attackMs, 0.0, 10000.0);
        changed |= applyFloat(payload, u"decayMs", spec.params.decayMs, 0.0, 10000.0);
        changed |= applyFloat(payload, u"sustain", spec.params.sustain, 0.0, 1.0);
        changed |= applyFloat(payload, u"releaseMs", spec.params.releaseMs, 0.0, 30000.0);
        changed |= applyFloat(payload, u"velocityCurve", spec.params.velocityCurve, -1.0, 1.0);
        changed |= applyFloat(payload, u"glideMs", spec.params.glideMs, 0.0, 2000.0);
        changed |= applyInt(payload, u"voiceLimit", spec.params.voiceLimit, 1, MultisampleSampler::kMaxVoices);
        changed |= applyFloat(payload, u"pitchBendRange", spec.params.pitchBendRange, 1.0, 24.0);
        changed |= applyFloat(payload, u"gainDb", spec.params.gainDb, -60.0, 12.0);
        return changed || spec.zones.empty();
    });
}

QJsonObject setSamplerZonesEdit(QJsonObject doc, const QJsonObject& payload) {
    const QString trackId = payload.value(u"trackId").toString();
    if (!payload.value(u"zones").isArray()) return doc;
    return editSamplerTrack(std::move(doc), trackId, [&](SamplerInstrumentSpec& spec) {
        QJsonObject temp = samplerSpecToJson(spec);
        temp.insert(u"zones", payload.value(u"zones").toArray());
        auto parsedZones = samplerSpecFromJson(temp).zones;
        for (const auto& z : parsedZones) {
            if (z.assetId.empty() && z.mediaPath.empty()) return false;
        }
        spec.zones = std::move(parsedZones);
        return true;
    });
}

QJsonObject addSamplerZoneEdit(QJsonObject doc, const QJsonObject& payload) {
    const QString trackId = payload.value(u"trackId").toString();
    return editSamplerTrack(std::move(doc), trackId, [&](SamplerInstrumentSpec& spec) {
        if (spec.zones.size() >= 64) return false;
        SamplerZoneSpec z;
        const QString idStr = payload.value(u"id").toString();
        z.id = idStr.isEmpty()
            ? QUuid::createUuid().toString(QUuid::Id128).toStdString()
            : idStr.toStdString();
        z.name = payload.value(u"name").toString(QStringLiteral("Sample")).toStdString();
        (void)patchZoneFields(payload, z);
        if (z.assetId.empty() && z.mediaPath.empty()) return false;
        spec.zones.push_back(std::move(z));
        return true;
    });
}

QJsonObject updateSamplerZoneEdit(QJsonObject doc, const QJsonObject& payload) {
    const QString trackId = payload.value(u"trackId").toString();
    const std::string zoneId = payload.value(u"zoneId").toString().toStdString();
    if (zoneId.empty()) return doc;
    return editSamplerTrack(std::move(doc), trackId, [&](SamplerInstrumentSpec& spec) {
        for (auto& z : spec.zones) {
            if (z.id == zoneId) {
                SamplerZoneSpec next = z;
                if (!patchZoneFields(payload, next)) return false;
                if (next.assetId.empty() && next.mediaPath.empty()) return false;
                z = std::move(next);
                return true;
            }
        }
        return false;
    });
}

QJsonObject removeSamplerZoneEdit(QJsonObject doc, const QJsonObject& payload) {
    const QString trackId = payload.value(u"trackId").toString();
    const std::string zoneId = payload.value(u"zoneId").toString().toStdString();
    if (zoneId.empty()) return doc;
    return editSamplerTrack(std::move(doc), trackId, [&](SamplerInstrumentSpec& spec) {
        const std::size_t before = spec.zones.size();
        std::erase_if(spec.zones, [&](const SamplerZoneSpec& z) { return z.id == zoneId; });
        return spec.zones.size() != before;
    });
}

void registerSamplerEdits() {
    static const bool registered = [] {
        nt::app::registerEdit(QStringLiteral("sampler.setParams"), setSamplerParamsEdit);
        nt::app::registerEdit(QStringLiteral("sampler.setZones"), setSamplerZonesEdit);
        nt::app::registerEdit(QStringLiteral("sampler.addZone"), addSamplerZoneEdit);
        nt::app::registerEdit(QStringLiteral("sampler.updateZone"), updateSamplerZoneEdit);
        nt::app::registerEdit(QStringLiteral("sampler.removeZone"), removeSamplerZoneEdit);
        return true;
    }();
    (void)registered;
}

}  // namespace nt::midi
