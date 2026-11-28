#include <QJsonDocument>
#include <utility>
#include "audio/automation/Automation.h"
#include <QStringList>
#include <algorithm>
#include <cmath>
#include <limits>
#include <vector>
namespace nt::automation {
namespace {
QJsonObject cleanPoint(const QJsonObject& point) {
    QJsonObject clean{{"timeMs", std::max(0., point["timeMs"].toDouble())}, {"value",point["value"]}};
    if (point.contains("easing") && point["easing"] != "linear") { clean["easing"] = point["easing"]; }
    return clean;
}
}
QString automationModeOf(const QJsonObject& track) { return track["automationMode"].toString("read"); }
bool automationModePlays(const QString& mode) { return mode != "off"; }
QJsonArray thinAutomationSamples(const QJsonArray& samples, double tolerance) {
    if (samples.size() < 3) { return samples; }
    std::vector<bool> keep(static_cast<std::size_t>(samples.size()), false);
    keep.front() = keep.back() = true;
    std::vector<std::pair<qsizetype, qsizetype>> stack{{0, samples.size()-1}};
    while (!stack.empty()) {
        const auto [lo, hi] = stack.back(); stack.pop_back();
        const auto a = samples[lo].toObject(), b = samples[hi].toObject();
        const double span = b["timeMs"].toDouble()-a["timeMs"].toDouble();
        qsizetype worst = -1;
        double distance = tolerance;
        for (auto i=lo+1; i<hi; ++i) {
            const auto p = samples[i].toObject();
            const double line = a["value"].toDouble() + (span == 0 ? 0 :
                (b["value"].toDouble()-a["value"].toDouble())*(p["timeMs"].toDouble()-a["timeMs"].toDouble())/span);
            const double d = std::abs(p["value"].toDouble()-line);
            if (d > distance) { worst=i; distance=d; }
        }
        if (worst >= 0) { keep[static_cast<std::size_t>(worst)]=true; stack.emplace_back(lo,worst); stack.emplace_back(worst,hi); }
    }
    QJsonArray result;
    for (qsizetype i=0; i<samples.size(); ++i) { if (keep[static_cast<std::size_t>(i)]) { result.append(samples[i]); } }
    return result;
}
QJsonArray writeAutomationPass(const QJsonArray& points, const QJsonObject& pass, double baseValue, double returnMs, double tolerance) {
    const double start = pass["startMs"].toDouble(), end = pass["endMs"].toDouble()+returnMs;
    const double after = automationValueAt(points,end,baseValue);
    std::vector<QJsonObject> next;
    for (const auto& p : points) { const auto point=p.toObject(); const double time=point["timeMs"].toDouble(); if (time<start || time>end) { next.push_back(point); } }
    for (const auto& p : thinAutomationSamples(pass["samples"].toArray(),tolerance)) {
        const auto point=p.toObject(); next.push_back({{"timeMs",point["timeMs"]},{"value",point["value"]}});
    }
    next.push_back({{"timeMs",end},{"value",after}});
    std::stable_sort(next.begin(),next.end(),[](const auto& a,const auto& b) { return a["timeMs"].toDouble()<b["timeMs"].toDouble(); });
    QJsonArray result; for (const auto& p : next) { result.append(p); } return result;
}
QString automationParamColorRole(int index, const QJsonObject& target) {
    if (target["kind"]=="mixer") { return target["param"]=="volumeDb" ? "warning" : "success"; }
    const QStringList roles{"info","secondary","primary","error"}; return roles[((index%4)+4)%4];
}
QString automationTargetKey(const QJsonObject& t) {
    const auto kind = t["kind"].toString();
    if (kind == "clip") { return kind + ':' + t["property"].toString(); }
    return kind + ':' + (kind == "device" ? t["deviceId"].toString() + ':' : QString()) + t["param"].toString();
}
QJsonObject addAutomationPoint(const QJsonArray& points, const QJsonObject& point) {
    auto clean=cleanPoint(point);
    std::vector<QJsonObject> next;
    bool replaced=false;
    for (const auto& p : points) {
        const auto old=p.toObject();
        if (!replaced && std::abs(old["timeMs"].toDouble()-clean["timeMs"].toDouble()) < .5) {
            replaced=true;
            if (old.contains("easing") && !point.contains("easing")) { clean["easing"]=old["easing"]; }
        } else { next.push_back(old); }
    }
    // Stable insertion after equal times mirrors stable Array.sort.
    const auto it=std::upper_bound(next.begin(),next.end(),clean["timeMs"].toDouble(),[](double time,const QJsonObject& p){return time<p["timeMs"].toDouble();});
    const auto index=std::distance(next.begin(),it);
    next.insert(it,clean);
    QJsonArray result; for (const auto& p : next) { result.append(p); }
    return {{"points",result},{"index",static_cast<int>(index)}};
}
QJsonArray moveAutomationPoint(QJsonArray points,int index,double time,double value) {
    if (index<0 || index>=points.size()) { return points; }
    auto p=points[index].toObject();
    const double lo=index>0?points[index-1].toObject()["timeMs"].toDouble():0;
    const double hi=index+1<points.size()?points[index+1].toObject()["timeMs"].toDouble():std::numeric_limits<double>::infinity();
    p["timeMs"]=std::min(hi,std::max(lo,time)); p["value"]=value; points[index]=p; return points;
}
QJsonArray removeAutomationPoints(const QJsonArray& points,const QJsonArray& indices) {
    QJsonArray out;
    for (qsizetype i=0;i<points.size();++i) { if (!indices.contains(static_cast<int>(i))) { out.append(points[i]); } }
    return out;
}
QJsonArray setAutomationPointEasing(QJsonArray points,int index,const QString& easing) {
    if (index>=0 && index<points.size()) { auto p=points[index].toObject(); p["easing"]=easing; points[index]=cleanPoint(p); }
    return points;
}
QJsonArray automationPointsInRange(const QJsonArray& points,double from,double to) {
    QJsonArray out;
    for (qsizetype i=0;i<points.size();++i) { const double time=points[i].toObject()["timeMs"].toDouble(); if (time>=from && time<=to) { out.append(static_cast<int>(i)); } }
    return out;
}
bool trackAcceptsAutomationTarget(const QJsonObject& track,const QJsonObject& target) {
    const auto kind=target["kind"].toString(),type=track["type"].toString();
    if (kind=="clip") { return type=="video" || type=="overlay"; }
    if (kind=="mixer") { return type=="audio" || type=="midi"; }
    if (target["deviceId"]=="instrument") { return type=="midi"; }
    for (const auto& effect : track["effects"].toArray()) { if (effect.toObject()["id"]==target["deviceId"]) { return true; } }
    return false;
}
QJsonValue call(const QString& name, const QJsonArray& a) {
    if (name == "automationModeOf") { return automationModeOf(a[0].toObject()); }
    if (name == "automationModePlays") { return automationModePlays(a[0].toString()); }
    if (name == "thinAutomationSamples") { return thinAutomationSamples(a[0].toArray(),a[1].toDouble()); }
    if (name == "writeAutomationPass") { return writeAutomationPass(a[0].toArray(),a[1].toObject(),a[2].toDouble(),a[3].toDouble(),a[4].toDouble()); }
    if (name == "automationParamColorRole") { return automationParamColorRole(a[0].toInt(),a[1].toObject()); }
    if (name == "automationTargetKey") { return automationTargetKey(a[0].toObject()); }
    if (name == "automationValueAt") { return automationValueAt(a[0].toArray(), a[1].toDouble(), a.size()>2?a[2].toDouble():0); }
    if (name == "addAutomationPoint") { return addAutomationPoint(a[0].toArray(), a[1].toObject()); }
    if (name == "moveAutomationPoint") { return moveAutomationPoint(a[0].toArray(), a[1].toInt(), a[2].toDouble(), a[3].toDouble()); }
    if (name == "removeAutomationPoints") { return removeAutomationPoints(a[0].toArray(), a[1].toArray()); }
    if (name == "setAutomationPointEasing") { return setAutomationPointEasing(a[0].toArray(), a[1].toInt(), a[2].toString()); }
    if (name == "automationPointsInRange") { return automationPointsInRange(a[0].toArray(), a[1].toDouble(), a[2].toDouble()); }
    if (name == "automationBreakpoints") { return automationBreakpoints(a[0].toArray(), a[1].toDouble(), a.size()>2?a[2].toObject():QJsonObject{}); }
    if (name == "trackAcceptsAutomationTarget") { return trackAcceptsAutomationTarget(a[0].toObject(), a[1].toObject()); }
    return QJsonValue::Undefined;
}
}

namespace nt::automation {
QJsonArray instrumentAutomationSpecs(const QJsonObject& instrument) {
    static const auto definitions=QJsonDocument::fromJson(
#include "InstrumentParameters.inc"
    ).object();
    const auto type=instrument["type"].toString();
    auto parameters=definitions[type].toArray();
    if (parameters.empty()) { return {}; }
    const auto pads=instrument["pads"].toArray();
    if (type=="drum") {
        QJsonArray all;
        for (int i=0;i<16;++i) {
            for (const auto& item:definitions["drumPad"].toArray()) {
                auto definition=item.toArray(); definition[0]="pad"+QString::number(i)+"."+definition[0].toString(); all.append(definition);
            }
        }
        for (const auto& item:parameters) { all.append(item); }
        parameters=all;
    }
    QJsonObject values;
    const auto copy=[&](const QString& param,const QJsonObject& source,const QString& field,double multiplier=1.) {
        if (source[field].isDouble()) { values[param]=source[field].toDouble()*multiplier; }
    };
    const auto envelope=[&](const QString& prefix,const QJsonObject& source,bool shortNames) {
        copy(prefix+(shortNames?".a":".att"),source,"attackMs",.001);
        copy(prefix+(shortNames?".d":".dec"),source,"decayMs",.001);
        copy(prefix+(shortNames?".s":".sus"),source,"sustain");
        copy(prefix+(shortNames?".r":".rel"),source,"releaseMs",.001);
    };
    if (type!="bass") { values=instrument["fableParams"].toObject(); }
    if (type=="bass") {
        copy("osc.pos",instrument,"position"); copy("sub.level",instrument,"subLevel");
        copy("flt.cut",instrument,"cutoffHz"); copy("flt.res",instrument,"resonance");
        copy("flt.drive",instrument,"drive"); copy("flt.env",instrument,"filterEnvAmount",.25);
        copy("flt.track",instrument,"keyTrack"); copy("fenv.att",instrument,"filterAttackMs",.001);
        copy("fenv.dec",instrument,"filterDecayMs",.001); envelope("aenv",instrument["ampEnv"].toObject(),false);
        copy("acc.amt",instrument,"accentAmount"); copy("slide.time",instrument,"slideMs",.001);
        if (instrument["gainDb"].isDouble()) { values["master.volume"]=.78*std::pow(10.,(instrument["gainDb"].toDouble()+6)/40.); }
        const auto extras=instrument["fableParams"].toObject();
        for (auto i=extras.begin();i!=extras.end();++i) { if (i.value().isDouble()) { values[i.key()]=i.value(); } }
    } else if (type=="wavetable") {
        for (const auto* name:{"oscA","oscB"}) {
            const auto osc=instrument[name].toObject(); const auto prefix=QString::fromLatin1(name);
            copy(prefix+".pos",osc,"position"); copy(prefix+".detune",osc,"detune");
            if (osc["level"].toDouble()>0) { copy(prefix+".level",osc,"level"); }
        }
        if (instrument["subLevel"].toDouble()>0) { copy("sub.level",instrument,"subLevel"); }
        if (instrument["noiseLevel"].toDouble()>0) { copy("noise.level",instrument,"noiseLevel"); }
        if (instrument["filterType"]!="none") {
            copy("filter.cutoff",instrument,"cutoffHz"); copy("filter.res",instrument,"resonance");
            copy("filter.drive",instrument,"drive"); copy("filter.env",instrument,"filterEnvAmount",.25);
            copy("filter.key",instrument,"keyTrack");
        }
        envelope("env1",instrument["ampEnv"].toObject(),true); envelope("env2",instrument["modEnv"].toObject(),true);
        if (instrument["gainDb"].isDouble()) { values["master.volume"]=.75*std::pow(10.,(instrument["gainDb"].toDouble()+8)/40.); }
    } else if (type=="drum") {
        for (qsizetype i=0;i<pads.size() && i<16;++i) {
            const auto pad=pads[i].toObject(); const auto prefix="pad"+QString::number(i)+".";
            for (const auto& mapping:std::initializer_list<std::pair<const char*,const char*>>{
                {"oscA.pos","position"},{"noise.level","noiseLevel"},{"noise.color","noiseColor"},{"ring.freq","ringHz"},
                {"ring.mix","ringMix"},{"aenv.curve","curve"},{"lvl","level"},{"v2l","velocityToLevel"}}) {
                copy(prefix+mapping.first,pad,QLatin1String(mapping.second));
            }
            copy(prefix+"penv.dec",pad,"pitchEnvDecayMs",.001);
            copy(prefix+"aenv.att",pad,"attackMs",.001); copy(prefix+"aenv.hold",pad,"holdMs",.001); copy(prefix+"aenv.dec",pad,"decayMs",.001);
            const auto filter=pad["filter"].toObject(); copy(prefix+"flt.cut",filter,"cutoffHz"); copy(prefix+"flt.res",filter,"resonance");
        }
        if (instrument["gainDb"].isDouble()) { values["master.volume"]=std::sqrt(std::pow(10.,instrument["gainDb"].toDouble()/20.)/1.6); }
    }
    const auto name=type=="wavetable" ? QStringLiteral("WT-1") : type=="bass" ? QStringLiteral("BL-1") : QStringLiteral("DR-1");
    QJsonArray result;
    for (const auto& item:parameters) {
        const auto definition=item.toArray(); const auto id=definition[0].toString();
        const auto section=id.section('.',0,0);
        QString group=name+" · "+section.toUpper();
        if (type=="drum" && section.startsWith("pad")) {
            const int index=section.mid(3).toInt();
            group=name+" · "+(index<pads.size() ? pads[index].toObject()["name"].toString("PAD "+QString::number(index+1)) : "PAD "+QString::number(index+1));
        }
        const double minimum=definition[1].toDouble(), maximum=definition[2].toDouble();
        const double value=values[id].isDouble() ? values[id].toDouble() : definition[3].toDouble();
        auto label=(section.startsWith("pad") ? id.section('.',1) : id).toUpper(); label.replace('.', ' ');
        result.append(QJsonObject{{"target",QJsonObject{{"kind","device"},{"deviceId","instrument"},{"param",id}}},
            {"key","device:instrument:"+id},{"label",label},{"group",group},
            {"min",minimum},{"max",maximum},{"value",std::clamp(value,minimum,maximum)},
            {"curve",definition[4].toBool()?"log":"lin"}});
    }
    return result;
}
}
