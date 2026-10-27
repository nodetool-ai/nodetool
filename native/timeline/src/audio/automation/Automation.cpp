#include "audio/automation/Automation.h"
#include "scene/Animation.h"
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
QString automationTargetKey(const QJsonObject& t) {
    const auto kind = t["kind"].toString();
    if (kind == "clip") { return kind + ':' + t["property"].toString(); }
    return kind + ':' + (kind == "device" ? t["deviceId"].toString() + ':' : QString()) + t["param"].toString();
}
double automationValueAt(const QJsonArray& points, double time, double fallback) {
    if (points.empty()) { return fallback; }
    const auto value = [](const QJsonValue& p) { return p.toObject()["value"].toDouble(); };
    if (time <= points.first().toObject()["timeMs"].toDouble()) { return value(points.first()); }
    if (time >= points.last().toObject()["timeMs"].toDouble()) { return value(points.last()); }
    for (qsizetype i=1; i<points.size(); ++i) {
        const auto b = points[i].toObject(), a = points[i-1].toObject();
        const double end=b["timeMs"].toDouble(), start=a["timeMs"].toDouble();
        if (time > end) { continue; }
        const double f=end>start ? scene::ease(b["easing"].toString("linear").toStdString(),(time-start)/(end-start)) : 1;
        return a["value"].toDouble() + (b["value"].toDouble()-a["value"].toDouble())*f;
    }
    return value(points.last());
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
QJsonArray automationBreakpoints(const QJsonArray& points,double from,const QJsonObject& options) {
    if (points.empty()) { return {}; }
    const double step=std::max(1.,options["maxStepMs"].toDouble(10));
    QJsonArray out{QJsonObject{{"timeMs",from},{"value",automationValueAt(points,from)}}};
    for (qsizetype i=0;i<points.size();++i) {
        const auto b=points[i].toObject(); const double end=b["timeMs"].toDouble();
        if (end<=from) { continue; }
        const auto a=out.last().toObject(); const double start=a["timeMs"].toDouble(), value=a["value"].toDouble(), target=b["value"].toDouble(), span=end-start;
        const auto easing=b["easing"].toString("linear");
        if (easing=="hold") { out.append(QJsonObject{{"timeMs",end},{"value",value}}); out.append(QJsonObject{{"timeMs",end},{"value",target}}); continue; }
        if ((easing!="linear" || options["subdivideLinear"].toBool()) && span>step) {
            const auto previous=i>0?points[i-1].toObject():QJsonObject{};
            const double segStart=i>0?std::min(previous["timeMs"].toDouble(),start):start;
            const double segValue=i>0&&previous["timeMs"].toDouble()<=from?previous["value"].toDouble():value;
            const double segSpan=end-segStart;
            const int steps=static_cast<int>(std::min(512.,std::ceil(span/step)));
            for (int s=1;s<steps;++s) {
                const double time=start+span*s/steps;
                const double f=segSpan>0?scene::ease(easing.toStdString(),(time-segStart)/segSpan):1;
                out.append(QJsonObject{{"timeMs",time},{"value",segValue+(target-segValue)*f}});
            }
        }
        out.append(QJsonObject{{"timeMs",end},{"value",target}});
    }
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
    if (name == "automationTargetKey") return automationTargetKey(a[0].toObject());
    if (name == "automationValueAt") return automationValueAt(a[0].toArray(), a[1].toDouble(), a.size()>2?a[2].toDouble():0);
    if (name == "addAutomationPoint") return addAutomationPoint(a[0].toArray(), a[1].toObject());
    if (name == "moveAutomationPoint") return moveAutomationPoint(a[0].toArray(), a[1].toInt(), a[2].toDouble(), a[3].toDouble());
    if (name == "removeAutomationPoints") return removeAutomationPoints(a[0].toArray(), a[1].toArray());
    if (name == "setAutomationPointEasing") return setAutomationPointEasing(a[0].toArray(), a[1].toInt(), a[2].toString());
    if (name == "automationPointsInRange") return automationPointsInRange(a[0].toArray(), a[1].toDouble(), a[2].toDouble());
    if (name == "automationBreakpoints") return automationBreakpoints(a[0].toArray(), a[1].toDouble(), a.size()>2?a[2].toObject():QJsonObject{});
    if (name == "trackAcceptsAutomationTarget") return trackAcceptsAutomationTarget(a[0].toObject(), a[1].toObject());
    return QJsonValue::Undefined;
}
}
