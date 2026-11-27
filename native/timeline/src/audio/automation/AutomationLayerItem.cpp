#include "AutomationLayerItem.h"
#include "audio/automation/AutomationCurves.h"
#include <algorithm>
#include <cmath>

AutomationLayerItem::AutomationLayerItem(QQuickItem* parent) : SceneLayerItem(parent) {
    connect(this,&AutomationLayerItem::pointsChanged,this,&SceneLayerItem::requestPaint);
    connect(this,&AutomationLayerItem::msPerPxChanged,this,&SceneLayerItem::requestPaint);
    connect(this,&AutomationLayerItem::contentLeftChanged,this,&SceneLayerItem::requestPaint);
    connect(this,&AutomationLayerItem::minimumChanged,this,&SceneLayerItem::requestPaint);
    connect(this,&AutomationLayerItem::maximumChanged,this,&SceneLayerItem::requestPaint);
    connect(this,&AutomationLayerItem::defaultValueChanged,this,&SceneLayerItem::requestPaint);
    connect(this,&AutomationLayerItem::logarithmicChanged,this,&SceneLayerItem::requestPaint);
    connect(this,&AutomationLayerItem::validChanged,this,&SceneLayerItem::requestPaint);
    connect(this,&AutomationLayerItem::selectedChanged,this,&SceneLayerItem::requestPaint);
    connect(this,&AutomationLayerItem::pointRadiusChanged,this,&SceneLayerItem::requestPaint);
    connect(this,&AutomationLayerItem::selectionWidthChanged,this,&SceneLayerItem::requestPaint);
    connect(this,&AutomationLayerItem::strokeChanged,this,&SceneLayerItem::requestPaint);
    connect(this,&AutomationLayerItem::selectedColorChanged,this,&SceneLayerItem::requestPaint);
}
void AutomationLayerItem::setPoints(const QVariantList& input) {
    if (m_input==input) { return; }
    m_input=input; m_points.clear();
    int index=0;
    for (const auto& value:input) {
        const int sourceIndex=index++;
        const auto map=value.toMap();
        const double time=map.value("timeMs").toDouble(),v=map.value("value").toDouble();
        if (std::isfinite(time) && std::isfinite(v)) { m_points.push_back({time,v,QJsonObject::fromVariantMap(map),sourceIndex}); }
    }
    emit pointsChanged();
}
void AutomationLayerItem::prepare() {
    m_paintedCount=0;
    if (!std::isfinite(m_msPerPx) || m_msPerPx<=0 || !std::isfinite(m_contentLeft) || !std::isfinite(width()) || width()<=0) { emit prepared(); return; }
    const auto yOf=[&](double value) {
        if (!m_valid) { return 28.0; }
        const double v=std::clamp(value,m_min,std::max(m_min,m_max));
        const double norm=m_log && m_min>0 && m_max>m_min?std::log(v/m_min)/std::log(m_max/m_min):m_max==m_min?0:(v-m_min)/(m_max-m_min);
        return 6+(1-norm)*std::max(1.0,height()-12);
    };
    const double from=m_contentLeft*m_msPerPx,to=(m_contentLeft+width())*m_msPerPx;
    if (!std::isfinite(from) || !std::isfinite(to) || to<from) { emit prepared(); return; }
    auto first=std::lower_bound(m_points.begin(),m_points.end(),from,[](const auto& p,double t) { return p.time<t; });
    auto last=std::upper_bound(m_points.begin(),m_points.end(),to,[](double t,const auto& p) { return t<p.time; });
    if (first!=m_points.begin()) { --first; }
    if (last!=m_points.end()) { ++last; }
    QJsonArray visible;
    for (auto it=first;it!=last;++it) { visible.append(it->json); }
    m_paintedCount=int(last-first);
    const auto vertices=nt::automation::automationBreakpoints(visible,from,{{"maxStepMs",std::max(1.0,m_msPerPx*3)}});
    QPointF previous(0,yOf(m_default));
    bool started=false;
    for (const auto& value:vertices) {
        const auto p=value.toObject();
        const QPointF point(p["timeMs"].toDouble()/m_msPerPx-m_contentLeft,yOf(p["value"].toDouble()));
        if (started) { line(previous,point,m_stroke,1.5); }
        previous=point; started=true;
    }
    if (previous.x()<width()) { line(previous,{width(),previous.y()},m_stroke,1.5); }
    for (auto it=first;it!=last;++it) {
        if (it->time<from || it->time>to) { continue; }
        const QPointF at(it->time/m_msPerPx-m_contentLeft,yOf(it->value));
        const bool selected=it->sourceIndex==m_selected;
        circle(at,m_radius+(selected?m_selectionWidth/2:0),m_stroke);
        if (selected) { circle(at,std::max(0.0,m_radius-m_selectionWidth/2),m_selectedColor); }
    }
    emit prepared();
}
