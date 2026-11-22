#include "AutomationRecorder.h"
#include <QStringList>
#include "Automation.h"
#include <QUuid>
#include <algorithm>
#include <cmath>

namespace {
double clampValue(const QString& param, double value) {
    return std::clamp(std::isfinite(value) ? value : 0., param == "pan" ? -1. : -60., param == "pan" ? 1. : 6.);
}
}
AutomationRecorder::~AutomationRecorder() { finishAll(previousTime_,false); }
void AutomationRecorder::setTimeline(TimelineModel* next) {
    if (timeline_ == next) { return; }
    finishAll(previousTime_,false);
    if (timeline_) { disconnect(timeline_,nullptr,this,nullptr); }
    timeline_ = next;
    if (timeline_) {
        connect(timeline_,&TimelineModel::timelineChanged,this,&AutomationRecorder::reconcile,Qt::QueuedConnection);
        const QPointer<AutomationRecorder> self(this);
        connect(timeline_,&TimelineModel::documentReplaced,this,[self] { if (self) { self->finishAll(self->previousTime_,false); } });
    }
    emit changed();
}
void AutomationRecorder::setClock(PlaybackClock* next) {
    if (clock_ == next) { return; }
    finishAll(previousTime_,false);
    if (clock_) { disconnect(clock_,nullptr,this,nullptr); }
    clock_ = next;
    if (clock_) {
        previousTime_=clock_->currentTimeMs();
        connect(clock_,&PlaybackClock::playingChanged,this,&AutomationRecorder::transport);
        const QPointer<AutomationRecorder> self(this);
        connect(clock_,&PlaybackClock::aboutToSeek,this,[self](double from) { if (self) { self->finishAll(from,true); } });
        connect(clock_,&PlaybackClock::timeChanged,this,[self] {
            if (!self || !self->clock_) { return; }
            const double now=self->clock_->currentTimeMs();
            // A loop wraps without a seek signal. Reverse playback has decreasing time.
            if (self->clock_->playing() && ((self->clock_->rate() >= 0 && now < self->previousTime_) || (self->clock_->rate() < 0 && now > self->previousTime_))) {
                self->finishAll(self->previousTime_,true);
            }
            if (self) { self->previousTime_=now; }
        });
        connect(clock_,&QObject::destroyed,this,[self] { if (self) { self->finishAll(self->previousTime_,false); } });
    }
    emit changed();
}
QJsonObject AutomationRecorder::track(const QString& id) const {
    const auto* t=timeline_ ? timeline_->timeline().findTrack(id.toStdString()) : nullptr;
    return t ? t->raw : QJsonObject{};
}
bool AutomationRecorder::consumes(const QString& id) const {
    if (!clock_ || !clock_->playing()) { return false; }
    const auto t=track(id);
    const auto mode=nt::automation::automationModeOf(t);
    return t.isEmpty() || t["locked"].toBool() || mode=="touch" || mode=="latch" || mode=="write";
}
double AutomationRecorder::value(const QString& id, const QString& param) const {
    for (const auto& p : passes_) { if (p.track==id && p.param==param) { return p.lastValue; } }
    return curveValue(id,param,clock_ ? clock_->currentTimeMs() : 0);
}
double AutomationRecorder::curveValue(const QString& id, const QString& param, double timeMs) const {
    const auto t=track(id);
    const double base=t[param].toDouble();
    if (t["automationMode"]=="off") { return base; }
    for (const auto& v : t["automation"].toArray()) {
        const auto l=v.toObject(), target=l["target"].toObject();
        if (l["enabled"]!=false && target["kind"]=="mixer" && target["param"]==param) {
            return nt::automation::automationValueAt(l["points"].toArray(),timeMs,base);
        }
    }
    return base;
}
void AutomationRecorder::start(const QString& id, const QString& param, const QString& mode, double now) {
    if (!timeline_ || !clock_ || !clock_->playing() || (param!="volumeDb" && param!="pan")) { return; }
    const auto t=track(id);
    if (t.isEmpty() || t["locked"].toBool() || (t["type"]!="audio" && t["type"]!="midi")) { return; }
    for (const auto& p : passes_) { if (p.track==id && p.param==param) { return; } }
    const double v=clampValue(param,curveValue(id,param,now));
    passes_.append({id,param,mode,now,v,QJsonArray{QJsonObject{{"timeMs",now},{"value",v}}}});
    timeline_->setMixerOverride(id,param,v);
}
bool AutomationRecorder::gestureStart(const QString& id, const QString& param) {
    if (!consumes(id)) { return false; }
    const auto mode=nt::automation::automationModeOf(track(id));
    if (mode=="touch" || mode=="latch" || mode=="write") { start(id,param,mode,clock_->currentTimeMs()); }
    return true;
}
bool AutomationRecorder::record(const QString& id, const QString& param, double v) {
    reconcile();
    for (auto& p : passes_) {
        if (p.track!=id || p.param!=param) { continue; }
        const double now=clock_ ? clock_->currentTimeMs() : p.lastTime;
        p.lastValue=clampValue(param,v); p.lastTime=now;
        const QJsonObject sample{{"timeMs",now},{"value",p.lastValue}};
        // Keyboard/reset changes can arrive several times in one transport tick.
        if (!p.samples.empty() && p.samples.last().toObject()["timeMs"].toDouble()==now) { p.samples[p.samples.size()-1]=sample; }
        else { p.samples.append(sample); }
        timeline_->setMixerOverride(id,param,p.lastValue);
        return true;
    }
    return consumes(id);
}
void AutomationRecorder::gestureEnd(const QString& id, const QString& param) {
    for (qsizetype i=passes_.size(); i-- > 0;) {
        if (passes_[i].track==id && passes_[i].param==param && passes_[i].mode=="touch") {
            finish(static_cast<int>(i),clock_ ? clock_->currentTimeMs() : previousTime_,true);
        }
    }
}
void AutomationRecorder::finish(int index, double end, bool write) {
    auto p=passes_.takeAt(index);
    // Release before edits, including missing/locked track and generation cancellation.
    if (timeline_) { timeline_->setMixerOverride(p.track,p.param,std::nullopt); }
    const auto t=track(p.track);
    if (!write || !timeline_ || t.isEmpty() || t["locked"].toBool()) { return; }
    const QJsonObject last{{"timeMs",end},{"value",p.lastValue}};
    if (!p.samples.empty() && p.samples.last().toObject()["timeMs"].toDouble()==end) { p.samples[p.samples.size()-1]=last; }
    else { p.samples.append(last); }
    std::vector<QJsonObject> sorted;
    for (const auto& v : p.samples) { sorted.push_back(v.toObject()); }
    std::stable_sort(sorted.begin(),sorted.end(),[](const auto& a,const auto& b) { return a["timeMs"].toDouble()<b["timeMs"].toDouble(); });
    QJsonArray samples;
    for (const auto& v : sorted) {
        if (!samples.empty() && samples.last().toObject()["timeMs"]==v["timeMs"]) { samples[samples.size()-1]=v; }
        else { samples.append(v); }
    }
    timeline_->applyEdit("writeTrackAutomationPass",{{"trackId",p.track},{"param",p.param},
        {"pass",QJsonObject{{"startMs",samples.first().toObject()["timeMs"]},{"endMs",samples.last().toObject()["timeMs"]},{"samples",samples}}},
        {"wasWrite",p.mode=="write"}});
}
void AutomationRecorder::finishAll(double end, bool write) {
    const bool previous=finishing_; finishing_=true;
    while (!passes_.empty()) { finish(static_cast<int>(passes_.size()-1),end,write); }
    finishing_=previous;
}
void AutomationRecorder::reconcile() {
    if (finishing_) { return; }
    finishing_=true;
    for (qsizetype i=passes_.size(); i-- > 0;) {
        const auto t=track(passes_[i].track);
        if (t.isEmpty() || t["locked"].toBool()) { finish(static_cast<int>(i),previousTime_,false); }
        else if (nt::automation::automationModeOf(t)!=passes_[i].mode) { finish(static_cast<int>(i),clock_ ? clock_->currentTimeMs() : previousTime_,true); }
    }
    finishing_=false;
}
void AutomationRecorder::transport() {
    if (!clock_) { return; }
    if (!clock_->playing()) { finishAll(clock_->currentTimeMs(),true); return; }
    previousTime_=clock_->currentTimeMs();
    if (!timeline_) { return; }
    QStringList ids;
    for (const auto& t : timeline_->timeline().tracks) {
        if (nt::automation::automationModeOf(t.raw)=="write") { ids.append(QString::fromStdString(t.id)); }
    }
    for (const auto& id : ids) { start(id,"volumeDb","write",previousTime_); start(id,"pan","write",previousTime_); }
}
