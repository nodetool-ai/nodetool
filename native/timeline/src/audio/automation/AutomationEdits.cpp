#include "audio/automation/Automation.h"
#include "app/EditRegistry.h"
#include <QUuid>
#include <algorithm>
#include <cmath>
namespace nt::automation {
namespace {
QJsonObject makeTrackEffect(const QString& type) {
    QJsonObject effect{{"id",QUuid::createUuid().toString(QUuid::Id128)},{"type",type},{"enabled",true}};
    QJsonObject defaults;
    if (type=="gain") { defaults={{"gainDb",0}}; }
    else if (type=="eq3") { defaults={{"lowFreq",200},{"lowGainDb",0},{"midFreq",1000},{"midQ",1},{"midGainDb",0},{"highFreq",5000},{"highGainDb",0}}; }
    else if (type=="filter") { defaults={{"mode","lowpass"},{"frequency",1000},{"q",1}}; }
    else if (type=="compressor") { defaults={{"thresholdDb",-24},{"ratio",4},{"attackMs",3},{"releaseMs",250},{"kneeDb",30}}; }
    else if (type=="fable") { defaults={{"kind","eq"},{"params",QJsonObject{}}}; }
    else if (type=="colorCorrection") { defaults={{"brightness",0},{"contrast",1},{"saturation",1},{"hue",0},{"temperature",0},{"tint",0},{"shadows",0},{"highlights",0}}; }
    else if (type=="videoBlur") { defaults={{"radius",4}}; }
    else if (type=="sharpen") { defaults={{"amount",.5},{"threshold",0}}; }
    else if (type=="vignette") { defaults={{"intensity",.4},{"radius",.9},{"softness",.5}}; }
    else if (type=="chromaKey") { defaults={{"keyColor","#00ff00"},{"tolerance",.2},{"softness",.1},{"spill",.5}}; }
    else { return {}; }
    for (auto i=defaults.begin();i!=defaults.end();++i) { effect[i.key()]=i.value(); }
    return effect;
}
double mixerDb(const QJsonValue& value) {
    const double db=value.toDouble();
    return std::isnan(db)?0:std::clamp(db,-120.,24.);
}
QJsonObject editChannel(QJsonObject channel,const QString& action,const QJsonObject& p,bool master) {
    if (action=="setTrackVolume" || action=="setMasterVolume") { channel["volumeDb"]=mixerDb(p["db"]); }
    else if (action=="setTrackPan") { const double pan=p["pan"].toDouble(); channel["pan"]=std::isfinite(pan)?std::clamp(pan,-1.,1.):0; }
    else if (action=="setTrackAutomation") {
        if (channel["locked"].toBool()) { return channel; }
        if (p["automation"].toArray().empty()) { channel.remove("automation"); } else { channel["automation"]=p["automation"]; }
    } else {
        auto effects=channel["effects"].toArray();
        if (action.startsWith("add")) {
            const auto value=p["effect"];
            const auto effect=value.isString()?makeTrackEffect(value.toString()):value.toObject();
            if (effect.empty()) { return channel; }
            effects.append(effect);
            if (master) { channel=QJsonObject{{"volumeDb",channel["volumeDb"].toDouble()}}; }
        } else {
            bool found=false; QJsonArray next;
            for (const auto& value : effects) {
                auto effect=value.toObject();
                if (effect["id"]==p["effectId"]) {
                    found=true;
                    if (action.startsWith("remove")) { continue; }
                    const auto patch=p["patch"].toObject();
                    for (auto i=patch.begin();i!=patch.end();++i) { effect[i.key()]=i.value(); }
                }
                next.append(effect);
            }
            if (!found && (master || action.startsWith("update"))) { return channel; }
            effects=next;
        }
        channel["effects"]=effects;
    }
    return channel;
}
}
QJsonObject edit(QJsonObject doc,const QString& name,const QJsonObject& payload) {
    if (name.contains("Master")) {
        const auto before=doc["master"].toObject();
        const auto after=editChannel(before,name,payload,true);
        if (before!=after) { doc["master"]=after; }
    } else {
        auto tracks=doc["tracks"].toArray();
        for (qsizetype i=0;i<tracks.size();++i) {
            auto track=tracks[i].toObject();
            if (track["id"]==payload["trackId"]) { tracks[i]=editChannel(track,name,payload,false); break; }
        }
        if (tracks!=doc["tracks"].toArray()) { doc["tracks"]=tracks; }
    }
    return doc;
}
void registerEdits() {
    static const bool registered = [] {
        for (const auto* action : {"setTrackVolume", "setTrackPan", "setMasterVolume", "addMasterEffect", "updateMasterEffect", "removeMasterEffect", "setTrackAutomation"}) {
            const auto name = QString::fromLatin1(action);
            nt::app::registerEdit(name, [name](QJsonObject doc, const QJsonObject& payload) { return edit(std::move(doc), name, payload); });
        }
        return true;
    }();
    (void)registered;
}
}
