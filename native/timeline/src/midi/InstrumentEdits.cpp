#include "midi/InstrumentEdits.h"
#include "midi/BassSynthPresets.h"
#include "midi/WavetablePresets.h"
#include "midi/modal/ModalPresets.h"
#include "app/EditRegistry.h"

#include <QJsonArray>

namespace nt::midi {

QStringList builtinInstrumentTypes() {
    return {QStringLiteral("drum"), QStringLiteral("bass"), QStringLiteral("wavetable"),
            QStringLiteral("sampler"), QStringLiteral("modal"), QStringLiteral("subtractive")};
}

QJsonObject builtinInstrument(const QString& type, const QString& preset) {
    if (type == u"subtractive") {
        return preset.isEmpty() ? QJsonObject{{"type", type}} : QJsonObject{};
    }
    if (type == u"drum") {
        const QString kit = preset.isEmpty() ? QStringLiteral("808") : preset;
        if (kit != u"808" && kit != u"uzu") return {};
        return {{"type", type}, {"kit", kit}};
    }
    if (type == u"sampler") {
        return preset.isEmpty() ? QJsonObject{{"type", type}, {"zones", QJsonArray{}}} : QJsonObject{};
    }
    if (type == u"bass") {
        const QString id = preset.isEmpty() ? bassPresetIds().value(0) : preset;
        const auto* found = findBassPreset(id.toStdString());
        return found ? bassParamsToJson(found->params, id) : QJsonObject{};
    }
    if (type == u"wavetable") {
        const QString id = preset.isEmpty() ? wavetablePresetIds().value(0) : preset;
        const auto* found = findWavetablePreset(id.toStdString());
        return found ? wavetableParamsToJson(found->params, id) : QJsonObject{};
    }
    if (type == u"modal") {
        const QString id = preset.isEmpty() ? modalPresetIds().value(0) : preset;
        const auto* found = findModalPreset(id.toStdString());
        return found ? modalParamsToJson(found->params, id) : QJsonObject{};
    }
    return {};
}

QJsonObject setBuiltinInstrumentEdit(QJsonObject doc, const QJsonObject& payload) {
    const QString trackId = payload.value(u"trackId").toString();
    const QJsonObject next = builtinInstrument(payload.value(u"type").toString(), payload.value(u"preset").toString());
    if (trackId.isEmpty() || next.isEmpty()) return doc;
    auto tracks = doc.value(u"tracks").toArray();
    for (qsizetype i = 0; i < tracks.size(); ++i) {
        auto track = tracks[i].toObject();
        if (track.value(u"id").toString() != trackId) continue;
        if (track.value(u"type").toString() != u"midi" || track.value(u"locked").toBool()) return doc;
        if (track.value(u"instrument").toObject() == next) return doc;
        track.insert(u"instrument", next);
        tracks[i] = track;
        doc.insert(u"tracks", tracks);
        return doc;
    }
    return doc;
}

void registerInstrumentEdits() {
    static const bool registered = [] {
        nt::app::registerEdit(QStringLiteral("instrument.setBuiltin"), setBuiltinInstrumentEdit);
        return true;
    }();
    (void)registered;
}

}  // namespace nt::midi
