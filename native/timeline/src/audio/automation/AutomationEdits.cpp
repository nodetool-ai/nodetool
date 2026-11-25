#include "audio/automation/Automation.h"
#include <QStringList>
#include "app/EditRegistry.h"
#include <QUuid>
#include <algorithm>
#include <cmath>
namespace nt::automation {
QJsonObject trackEffectDefaults(const QString& type) {
    QJsonObject defaults;
    if (type=="gain") { defaults={{"gainDb",0}}; }
    else if (type=="eq3") { defaults={{"lowFreq",200},{"lowGainDb",0},{"midFreq",1000},{"midQ",1},{"midGainDb",0},{"highFreq",5000},{"highGainDb",0}}; }
    else if (type=="filter") { defaults={{"mode","lowpass"},{"frequency",1000},{"q",1}}; }
    else if (type=="compressor") { defaults={{"thresholdDb",-24},{"ratio",4},{"attackMs",3},{"releaseMs",250},{"kneeDb",30}}; }
    else if (type=="vst") { defaults={{"plugin",QJsonValue::Null},{"state",QJsonValue::Null},{"wet",1.0}}; }
    else if (type=="fable") { defaults={{"kind","eq"},{"params",QJsonObject{}}}; }
    else if (type=="colorCorrection") { defaults={{"brightness",0},{"contrast",1},{"saturation",1},{"hue",0},{"temperature",0},{"tint",0},{"shadows",0},{"highlights",0}}; }
    else if (type=="videoBlur") { defaults={{"radius",4}}; }
    else if (type=="sharpen") { defaults={{"amount",.5},{"threshold",0}}; }
    else if (type=="vignette") { defaults={{"intensity",.4},{"radius",.9},{"softness",.5}}; }
    else if (type=="chromaKey") { defaults={{"keyColor","#00ff00"},{"tolerance",.2},{"softness",.1},{"spill",.5}}; }
    return defaults;
}
namespace {
QJsonObject makeTrackEffect(const QString& type) {
    QJsonObject effect{{"id",QUuid::createUuid().toString(QUuid::Id128)},{"type",type},{"enabled",true}};
    const auto defaults=trackEffectDefaults(type);
    if (defaults.isEmpty()) { return {}; }
    for (auto i=defaults.begin();i!=defaults.end();++i) { effect[i.key()]=i.value(); }
    return effect;
}
double mixerDb(const QJsonValue& value) {
    const double db=value.toDouble();
    return std::isnan(db)?0:std::clamp(db,-120.,24.);
}
QJsonObject editChannel(QJsonObject channel,const QString& action,const QJsonObject& p,bool master) {
    if (action=="setTrackVolume" || action=="setMasterVolume") { channel["volumeDb"]=mixerDb(p["db"]); }
    else if (action=="setMasterLimiter") {
        if (!p.value("enabled").isBool()) { return channel; }
        if (master && !channel.contains("volumeDb")) { channel["volumeDb"]=0.0; }
        channel["limiter"]=p["enabled"].toBool();
    }
    else if (action=="setTrackPan") { const double pan=p["pan"].toDouble(); channel["pan"]=std::isfinite(pan)?std::clamp(pan,-1.,1.):0; }
    else if (action=="writeTrackAutomationPass") {
        if (channel.value("locked").toBool()) { return channel; }
        const auto param=p["param"].toString();
        if (param!="volumeDb" && param!="pan") { return channel; }
        const QJsonObject target{{"kind","mixer"},{"param",param}};
        auto lanes=channel.value("automation").toArray();
        qsizetype index=-1;
        for (qsizetype i=0;i<lanes.size();++i) { if (automationTargetKey(lanes[i].toObject()["target"].toObject())==automationTargetKey(target)) { index=i; break; } }
        auto lane=index<0 ? QJsonObject{{"id",QUuid::createUuid().toString(QUuid::Id128)},{"target",target}} : lanes[index].toObject();
        lane["points"]=writeAutomationPass(lane["points"].toArray(),p["pass"].toObject(),channel.value(param).toDouble(),200,(param=="pan" ? 2 : 66)*.005);
        lane.remove("enabled");
        if (index<0) { lanes.append(lane); } else { lanes[index]=lane; }
        channel["automation"]=lanes;
        if (p["wasWrite"].toBool() && automationModeOf(channel)=="write") { channel["automationMode"]="latch"; }
    }
    else if (action=="setTrackAutomationMode") {
        const auto mode=p["mode"].toString();
        if (!channel.value("locked").toBool() && QStringList{"off","read","touch","latch","write"}.contains(mode)) { channel["automationMode"]=mode; }
    }
    else if (action=="setTrackAutomation") {
        if (channel.value("locked").toBool()) { return channel; }
        if (p["automation"].toArray().empty()) { channel.remove("automation"); } else { channel["automation"]=p["automation"]; }
    } else {
        auto effects=channel.value("effects").toArray();
        if (action.startsWith("add")) {
            const auto value=p["effect"];
            const auto effect=value.isString()?makeTrackEffect(value.toString()):value.toObject();
            if (effect.empty()) { return channel; }
            effects.append(effect);
            if (master && !channel.contains("volumeDb")) { channel["volumeDb"]=0.0; }
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
        const auto before=doc.value("master").toObject();
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
        for (const auto* action : {"setTrackVolume", "setTrackPan", "setTrackAutomationMode", "writeTrackAutomationPass", "setMasterVolume", "setMasterLimiter", "addMasterEffect", "updateMasterEffect", "removeMasterEffect", "setTrackAutomation"}) {
            const auto name = QString::fromLatin1(action);
            nt::app::registerEdit(name, [name](QJsonObject doc, const QJsonObject& payload) { return edit(std::move(doc), name, payload); });
        }
        return true;
    }();
    (void)registered;
}
}
