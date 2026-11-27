#include "audio/automation/Automation.h"
#include "audio/effects/fable/FableColorTimeEffects.h"
#include "audio/effects/fable/FableDynamicsEffects.h"
#include <QStringList>
#include <QJsonDocument>
#include <map>
#include <QSet>
#include <QRegularExpression>
#include <stdexcept>
#include "app/EditRegistry.h"
#include "scene/Animation.h"
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
    else if (type=="fable") { defaults={{"kind","eq"},{"params",nt::audio::effects::fable::fableDynamicsDefaults("eq")}}; }
    else if (type.startsWith("fable:")) {
        const auto kind = type.mid(6).toStdString();
        if (nt::audio::effects::fable::isFableDynamicsKind(kind)) {
            defaults={{"kind",type.mid(6)},{"params",nt::audio::effects::fable::fableDynamicsDefaults(kind)}};
        } else if (nt::audio::effects::fable::isFableColorTimeKind(kind)) {
            defaults={{"kind",type.mid(6)},{"params",nt::audio::effects::fable::fableColorTimeDefaults(kind)}};
        }
    }
    else if (type=="colorCorrection") { defaults={{"brightness",0},{"contrast",1},{"saturation",1},{"hue",0},{"temperature",0},{"tint",0},{"shadows",0},{"highlights",0}}; }
    else if (type=="videoBlur") { defaults={{"radius",4}}; }
    else if (type=="sharpen") { defaults={{"amount",.5},{"threshold",0}}; }
    else if (type=="vignette") { defaults={{"intensity",.4},{"radius",.9},{"softness",.5}}; }
    else if (type=="chromaKey") { defaults={{"keyColor","#00ff00"},{"tolerance",.2},{"softness",.1},{"spill",.5}}; }
    return defaults;
}
QJsonArray automationTargetRange(const QJsonObject& track, const QJsonObject& target) {
    static const auto ranges = QJsonDocument::fromJson(
#include "AutomationRanges.inc"
    ).object();
    if (!trackAcceptsAutomationTarget(track, target)) { return {}; }
    const auto kind = target["kind"].toString();
    auto type = kind;
    auto param = target[kind == "clip" ? "property" : "param"].toString();
    if (kind == "device") {
        if (target["deviceId"] == "instrument") {
            type = track["instrument"].toObject()["type"].toString();
            if (type == "drum" && param.startsWith("pad")) {
                static const QRegularExpression pattern(QStringLiteral("^pad([0-9]+)\\.(.+)$"));
                const auto match = pattern.match(param);
                if (!match.hasMatch() || match.captured(1).toDouble() >= 16) { return {}; }
                type = "drumPad";
                param = match.captured(2);
            }
        } else {
            for (const auto& value : track["effects"].toArray()) {
                const auto effect = value.toObject();
                if (effect["id"] == target["deviceId"]) { type = effect["type"].toString(); break; }
            }
        }
    }
    return ranges[type].toObject()[param].toArray();
}
namespace {
void requireKeys(const QJsonObject& object, const QStringList& allowed) {
    for (auto it = object.begin(); it != object.end(); ++it) {
        if (!allowed.contains(it.key())) { throw std::runtime_error("Unexpected automation parameter."); }
    }
}
QJsonObject editAutomation(QJsonObject channel, const QString& action, const QJsonObject& p) {
    if (channel.value("locked").toBool()) { throw std::runtime_error("Track is locked."); }
    if (!QStringList{"automation.addPoints", "automation.movePoints", "automation.deletePoints", "automation.clearLane", "automation.setLaneEnabled"}.contains(action)) { throw std::runtime_error("Unknown automation action."); }
    QStringList keys{"trackId", "target"};
    if (action == "automation.addPoints") { keys << "points"; }
    else if (action == "automation.movePoints") { keys << "fromMs" << "toMs" << "deltaMs" << "deltaValue"; }
    else if (action == "automation.deletePoints") { keys << "fromMs" << "toMs"; }
    else if (action == "automation.setLaneEnabled") { keys << "enabled"; }
    requireKeys(p, keys);
    const bool needsRange = action == "automation.addPoints" || action == "automation.movePoints";
    auto target = p["target"].toObject();
    const auto kind = target["kind"].toString();
    requireKeys(target, kind == "device" ? QStringList{"kind", "deviceId", "param"} : kind == "clip" ? QStringList{"kind", "property"} : QStringList{"kind", "param"});
    if ((kind != "device" && kind != "clip" && kind != "mixer") ||
        !target[kind == "clip" ? "property" : "param"].isString() || target[kind == "clip" ? "property" : "param"].toString().isEmpty() ||
        (kind == "device" && (!target["deviceId"].isString() || target["deviceId"].toString().isEmpty())) ||
        (kind == "mixer" && target["param"] != "volumeDb" && target["param"] != "pan")) { throw std::runtime_error("Invalid automation target."); }
    if (target["kind"] == "device" && target["deviceId"] != "instrument") {
        const auto ref = target["deviceId"].toString();
        auto effects = channel.value("effects").toArray();
        if (!needsRange) {
            QSet<QString> ids;
            for (const auto& value : effects) { ids.insert(value.toObject()["id"].toString()); }
            for (const auto& value : channel["automation"].toArray()) {
                const auto target = value.toObject()["target"].toObject();
                const auto id = target["deviceId"].toString();
                if (target["kind"] == "device" && !ids.contains(id)) { effects.append(QJsonObject{{"id", id}}); ids.insert(id); }
            }
        }
        QString exact;
        for (const auto& value : effects) {
            if (value.toObject()["id"] == ref) { exact = ref; break; }
        }
        if (exact.isEmpty()) {
            if (ref.size() != 12 || std::ranges::any_of(ref, [](QChar c) { return !(c >= '0' && c <= '9') && !(c >= 'a' && c <= 'f'); })) { throw std::runtime_error("Device id is missing or ambiguous."); }
            int matches = 0;
            for (const auto& value : effects) {
                const auto id = value.toObject()["id"].toString();
                if (id.startsWith(ref)) { exact = id; ++matches; }
            }
            if (matches != 1) { throw std::runtime_error("Device id is missing or ambiguous."); }
        }
        target["deviceId"] = exact;
    }
    const auto range = needsRange ? automationTargetRange(channel, target) : QJsonArray{};
    if (needsRange && range.size() != 2) {
        if (!trackAcceptsAutomationTarget(channel, target)) { throw std::runtime_error("Track cannot take this automation target."); }
        if (channel["instrument"].toObject()["type"] == "drum" && target["param"].toString().startsWith("pad")) { throw std::runtime_error("Invalid drum pad."); }
        throw std::runtime_error("Unknown automation parameter.");
    }
    auto lanes = channel["automation"].toArray();
    qsizetype index = -1;
    for (qsizetype i = 0; i < lanes.size(); ++i) {
        if (automationTargetKey(lanes[i].toObject()["target"].toObject()) == automationTargetKey(target)) { index = i; break; }
    }
    auto lane = index < 0 ? QJsonObject{{"target", target}, {"points", QJsonArray{}}} : lanes[index].toObject();
    if (index < 0 && action != "automation.addPoints") { throw std::runtime_error("Automation lane does not exist."); }
    auto points = lane["points"].toArray();
    if (needsRange) {
        for (const auto& value : points) {
            const auto point = value.toObject();
            if (!point["timeMs"].isDouble() || !std::isfinite(point["timeMs"].toDouble()) || point["timeMs"].toDouble() < 0 || point["timeMs"].toDouble() > MaxAutomationTimeMs || !point["value"].isDouble() || !std::isfinite(point["value"].toDouble())) { throw std::runtime_error("Invalid stored automation point."); }
        }
    }
    const auto finite = [&](const char* key) { return p[key].isDouble() && std::isfinite(p[key].toDouble()) && (QString::fromLatin1(key) == "deltaValue" || std::abs(p[key].toDouble()) <= MaxAutomationTimeMs); };
    if (action == "automation.clearLane") {
        lanes.removeAt(index);
    } else {
        if (action == "automation.setLaneEnabled") {
            if (!p["enabled"].isBool()) { throw std::runtime_error("enabled must be a boolean."); }
            if (p["enabled"].toBool()) { lane.remove("enabled"); } else { lane["enabled"] = false; }
        } else if (action == "automation.addPoints") {
            if (!p["points"].isArray() || p["points"].toArray().empty() || p["points"].toArray().size() > MaxAutomationPointsPerLane) { throw std::runtime_error("Invalid automation point count."); }
            std::map<double, QJsonObject> merged;
            const auto insert = [&](QJsonObject point) {
                const auto time = point["timeMs"].toDouble();
                const auto replaced = merged.upper_bound(time - .5);
                if (replaced != merged.end() && std::abs(replaced->first - time) < .5) {
                    if (!point.contains("easing") && replaced->second.contains("easing")) { point["easing"] = replaced->second["easing"]; }
                    merged.erase(replaced);
                }
                merged[time] = point;
            };
            for (const auto& value : points) { insert(value.toObject()); }
            for (const auto& value : p["points"].toArray()) {
                auto point = value.toObject();
                requireKeys(point, {"timeMs", "value", "easing"});
                if (point.contains("easing") && (!point["easing"].isString() || point["easing"].toString().size() > 256 || !nt::scene::isKnownEasing(point["easing"].toString().toStdString()))) { throw std::runtime_error("Invalid automation easing."); }
                if (!point["timeMs"].isDouble() || !point["value"].isDouble() ||
                    !std::isfinite(point["timeMs"].toDouble()) || std::abs(point["timeMs"].toDouble()) > MaxAutomationTimeMs || !std::isfinite(point["value"].toDouble())) { throw std::runtime_error("Invalid automation point."); }
                point["value"] = std::clamp(point["value"].toDouble(), range[0].toDouble(), range[1].toDouble());
                point["timeMs"] = std::max(0., point["timeMs"].toDouble());
                insert(point);
            }
            points = {};
            for (const auto& [time, point] : merged) { points.append(point); }
        } else {
            if (!finite("fromMs") || !finite("toMs") || p["fromMs"].toDouble() < 0 || p["toMs"].toDouble() < 0) { throw std::runtime_error("Invalid automation selection range."); }
            if (p["toMs"].toDouble() < p["fromMs"].toDouble()) { throw std::runtime_error("toMs must be at or after fromMs."); }
            if (action == "automation.movePoints" && (!finite("deltaMs") || !finite("deltaValue"))) { throw std::runtime_error("Invalid automation move offset."); }
            QJsonArray next;
            QJsonArray ordered;
            for (const bool selected : {false, true}) {
                for (const auto& value : points) {
                    const auto time = value.toObject()["timeMs"].toDouble();
                    if ((time >= p["fromMs"].toDouble() && time <= p["toMs"].toDouble()) == selected) { ordered.append(value); }
                }
            }
            for (const auto& value : ordered) {
                auto point = value.toObject();
                const auto time = point["timeMs"].toDouble();
                if (time >= p["fromMs"].toDouble() && time <= p["toMs"].toDouble()) {
                    if (action == "automation.deletePoints") { continue; }
                    const auto movedTime = time + p["deltaMs"].toDouble();
                    const auto movedValue = point["value"].toDouble() + p["deltaValue"].toDouble();
                    if (!std::isfinite(movedTime) || movedTime > MaxAutomationTimeMs || !std::isfinite(movedValue)) { throw std::runtime_error("Automation move overflow."); }
                    point["timeMs"] = std::max(0., movedTime);
                    point["value"] = std::clamp(movedValue, range[0].toDouble(), range[1].toDouble());
                }
                next.append(point);
            }
            points = next;
            if (action == "automation.movePoints") {
                std::map<double, QJsonObject> unique;
                for (const auto& point : points) { unique[point.toObject()["timeMs"].toDouble()] = point.toObject(); }
                points = {};
                for (const auto& [time, point] : unique) { points.append(point); }
            }
        }
        if (points.size() > MaxAutomationPointsPerLane || (index < 0 && lanes.size() >= MaxAutomationLanesPerTrack)) { throw std::runtime_error("Automation capacity exceeded."); }
        lane["points"] = points;
        if (index < 0) { lane["id"] = QUuid::createUuid().toString(QUuid::Id128); lanes.append(lane); } else { lanes[index] = lane; }
    }
    if (lanes.empty()) { channel.remove("automation"); } else { channel["automation"] = lanes; }
    return channel;
}
QJsonObject makeTrackEffect(const QString& type) {
    const QString storedType = type.startsWith("fable:") ? QStringLiteral("fable") : type;
    QJsonObject effect{{"id",QUuid::createUuid().toString(QUuid::Id128)},{"type",storedType},{"enabled",true}};
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
    if (action.startsWith("automation.")) { return editAutomation(std::move(channel), action, p); }
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
        const auto target=p["target"].isObject() ? p["target"].toObject() : QJsonObject{{"kind","mixer"},{"param",param}};
        if (target["kind"]!="device" && param!="volumeDb" && param!="pan") { return channel; }
        auto lanes=channel.value("automation").toArray();
        qsizetype index=-1;
        for (qsizetype i=0;i<lanes.size();++i) { if (automationTargetKey(lanes[i].toObject()["target"].toObject())==automationTargetKey(target)) { index=i; break; } }
        auto lane=index<0 ? QJsonObject{{"id",QUuid::createUuid().toString(QUuid::Id128)},{"target",target}} : lanes[index].toObject();
        lane["points"]=writeAutomationPass(lane["points"].toArray(),p["pass"].toObject(),p["base"].isDouble() ? p["base"].toDouble() : channel.value(param).toDouble(),200,target["kind"]=="device" ? 0. : (param=="pan" ? 2 : 66)*.005);
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
    if (name == "setTrackAutomationMode") {
        requireKeys(payload, {"trackId", "mode"});
        if (!QStringList{"off", "read", "touch", "latch", "write"}.contains(payload["mode"].toString())) { throw std::runtime_error("Invalid automation mode."); }
        for (const auto& value : doc["tracks"].toArray()) {
            const auto track = value.toObject();
            if (track["id"] == payload["trackId"] && track["locked"].toBool()) { throw std::runtime_error("Track is locked."); }
        }
    }
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
        for (const auto* action : {"automation.addPoints", "automation.movePoints", "automation.deletePoints", "automation.clearLane", "automation.setLaneEnabled", "setTrackVolume", "setTrackPan", "setTrackAutomationMode", "writeTrackAutomationPass", "setMasterVolume", "setMasterLimiter", "addMasterEffect", "updateMasterEffect", "removeMasterEffect", "setTrackAutomation"}) {
            const auto name = QString::fromLatin1(action);
            nt::app::registerEdit(name, [name](QJsonObject doc, const QJsonObject& payload) { return edit(std::move(doc), name, payload); });
        }
        return true;
    }();
    (void)registered;
}
}
