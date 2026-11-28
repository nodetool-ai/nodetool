#include "audio/vst/VstEdits.h"
#include "app/EditRegistry.h"

#include <QJsonArray>

namespace nt::audio::vst {

QJsonObject setTrackInstrument(QJsonObject doc, const QJsonObject& payload) {
    const QString trackId = payload.value(u"trackId").toString();
    const QJsonObject instrument = payload.value(u"instrument").toObject();
    if (trackId.isEmpty() || instrument.value(u"type").toString().isEmpty()) {
        return doc;
    }
    auto tracks = doc.value(u"tracks").toArray();
    bool changed = false;
    for (qsizetype i = 0; i < tracks.size(); ++i) {
        auto track = tracks[i].toObject();
        if (track.value(u"id").toString() != trackId) continue;
        if (track.value(u"type").toString() != u"midi" || track.value(u"locked").toBool()) {
            return doc;
        }
        if (track.value(u"instrument").toObject() == instrument) {
            return doc;
        }
        track.insert(u"instrument", instrument);
        tracks[i] = track;
        changed = true;
        break;
    }
    if (changed) {
        doc.insert(u"tracks", tracks);
    }
    return doc;
}

QJsonObject setTrackInstrumentState(QJsonObject doc, const QJsonObject& payload) {
    const QString trackId = payload.value(u"trackId").toString();
    if (trackId.isEmpty()) return doc;
    const QJsonValue stateVal = payload.value(u"state");
    const QJsonValue nextState = stateVal.isString() && !stateVal.toString().isEmpty()
        ? stateVal : QJsonValue(QJsonValue::Null);
    auto tracks = doc.value(u"tracks").toArray();
    bool changed = false;
    for (qsizetype i = 0; i < tracks.size(); ++i) {
        auto track = tracks[i].toObject();
        if (track.value(u"id").toString() != trackId) continue;
        if (track.value(u"type").toString() != u"midi" || track.value(u"locked").toBool()) return doc;
        auto inst = track.value(u"instrument").toObject();
        if (inst.value(u"type").toString() != u"vst") return doc;
        if (inst.value(u"state") == nextState) return doc;
        inst.insert(u"state", nextState);
        track.insert(u"instrument", inst);
        tracks[i] = track;
        changed = true;
        break;
    }
    if (changed) doc.insert(u"tracks", tracks);
    return doc;
}

void registerVstEdits() {
    static const bool registered = [] {
        nt::app::registerEdit(QStringLiteral("setTrackInstrument"), setTrackInstrument);
        nt::app::registerEdit(QStringLiteral("setTrackInstrumentState"), setTrackInstrumentState);
        return true;
    }();
    (void)registered;
}

}  // namespace nt::audio::vst
