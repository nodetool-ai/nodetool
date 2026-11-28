#include "audio/automation/AutomationCurves.h"
#include "scene/Animation.h"
#include <algorithm>
#include <cmath>

namespace nt::automation {
double automationValueAt(const QJsonArray& points, double time, double fallback) {
    if (points.empty()) { return fallback; }
    const auto value = [](const QJsonValue& p) { return p.toObject()["value"].toDouble(); };
    if (time <= points.first().toObject()["timeMs"].toDouble()) { return value(points.first()); }
    if (time >= points.last().toObject()["timeMs"].toDouble()) { return value(points.last()); }
    const auto next=std::lower_bound(points.begin()+1,points.end(),time,[](const QJsonValue& point,double at) {
        return point.toObject()["timeMs"].toDouble()<at;
    });
    if (next==points.end()) { return value(points.last()); }
    const auto b=(*next).toObject(), a=(*(next-1)).toObject();
    const double end=b["timeMs"].toDouble(), start=a["timeMs"].toDouble();
    const double f=end>start ? scene::ease(b["easing"].toString("linear").toStdString(),(time-start)/(end-start)) : 1;
    return a["value"].toDouble() + (b["value"].toDouble()-a["value"].toDouble())*f;
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
            // The cuts sit on the whole segment's grid, so every play start
            // ramps through the same breakpoints (automation.ts).
            const int steps=static_cast<int>(std::min(512.,std::ceil(segSpan/step)));
            for (int s=1;s<steps;++s) {
                const double time=segStart+segSpan*s/steps;
                if (time<=start) { continue; }
                const double f=scene::ease(easing.toStdString(),(time-segStart)/segSpan);
                out.append(QJsonObject{{"timeMs",time},{"value",segValue+(target-segValue)*f}});
            }
        }
        out.append(QJsonObject{{"timeMs",end},{"value",target}});
    }
    return out;
}
}
