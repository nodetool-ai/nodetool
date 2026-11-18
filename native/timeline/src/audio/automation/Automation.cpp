#include "audio/automation/Automation.h"
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
