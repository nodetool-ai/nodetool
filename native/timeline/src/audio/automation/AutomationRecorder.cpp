#include "AutomationRecorder.h"
#include <QStringList>
#include "Automation.h"
#include <QUuid>
#include <algorithm>
#include <cmath>

namespace {
QJsonObject targetFor(const QString& param) {
    const auto separator=param.indexOf(QChar(0x1f));
    if (separator<0) { return {{"kind","mixer"},{"param",param}}; }
    return {{"kind","device"},{"deviceId",param.left(separator)},{"param",param.mid(separator+1)}};
}
double baseFor(TimelineModel* timeline,const QString& id,const QString& param) {
    if (!timeline) { return 0; }
    const auto target=targetFor(param);
    const auto snapshot=timeline->snapshot(); const auto* track=snapshot->findTrack(id.toStdString());
    if (!track) { return 0; }
    if (target["kind"]=="mixer") { return track->raw[param].toDouble(); }
    for (const auto& p:track->deviceParameters) {
        if (p.deviceId==target["deviceId"].toString().toStdString() && p.name==target["param"].toString().toStdString()) { return p.base; }
    }
    return 0;
}
void publishOverride(TimelineModel* timeline,const QString& id,const QString& param,std::optional<double> value) {
    if (!timeline) { return; }
    const auto target=targetFor(param);
    if (target["kind"]=="mixer") { timeline->setMixerOverride(id,param,value); }
    else { timeline->setDeviceOverride(id,target["deviceId"].toString(),value ? QJsonObject{{target["param"].toString(),*value}} : QJsonObject{}); }
}
double clampValue(const QString& param, double value) {
    if (param.contains(QChar(0x1f))) { return std::isfinite(value) ? value : 0.; }
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
    const double base=baseFor(timeline_,id,param);
    if (t["automationMode"]=="off") { return base; }
    for (const auto& v : t["automation"].toArray()) {
        const auto l=v.toObject(), target=l["target"].toObject();
        if (l["enabled"]!=false && target==targetFor(param)) {
            return nt::automation::automationValueAt(l["points"].toArray(),timeMs,base);
        }
    }
    return base;
}
void AutomationRecorder::start(const QString& id, const QString& param, const QString& mode, double now) {
    if (!timeline_ || !clock_ || !clock_->playing() || (param!="volumeDb" && param!="pan" && !param.contains(QChar(0x1f)))) { return; }
    const auto t=track(id);
    if (t.isEmpty() || t["locked"].toBool() || (t["type"]!="audio" && t["type"]!="midi")) { return; }
    for (const auto& p : passes_) { if (p.track==id && p.param==param) { return; } }
    const double v=clampValue(param,curveValue(id,param,now));
    passes_.append({id,param,mode,now,v,QJsonArray{QJsonObject{{"timeMs",now},{"value",v}}}});
    publishOverride(timeline_,id,param,v);
}
bool AutomationRecorder::gestureStart(const QString& id, const QString& param) {
    if (!consumes(id)) { return false; }
    const auto mode=nt::automation::automationModeOf(track(id));
    const auto existing=std::find_if(gestures_.begin(),gestures_.end(),[&](const auto& g) { return g.track==id && g.param==param; });
    if (existing==gestures_.end()) {
        const auto pass=std::find_if(passes_.begin(),passes_.end(),[&](const auto& p) { return p.track==id && p.param==param; });
        gestures_.append({id,param,pass==passes_.end() ? std::nullopt : std::optional<Pass>(*pass)});
    }
    if (mode=="touch" || mode=="latch" || mode=="write") { start(id,param,mode,clock_->currentTimeMs()); }
    return true;
}
bool AutomationRecorder::record(const QString& id, const QString& param, double v) {
    reconcile();
    if (consumes(id) && std::none_of(passes_.begin(),passes_.end(),[&](const auto& p) { return p.track==id && p.param==param; })) {
        gestureStart(id,param);
    }
    for (auto& p : passes_) {
        if (p.track!=id || p.param!=param) { continue; }
        const double now=clock_ ? clock_->currentTimeMs() : p.lastTime;
        p.lastValue=clampValue(param,v); p.lastTime=now;
        const QJsonObject sample{{"timeMs",now},{"value",p.lastValue}};
        // Keyboard/reset changes can arrive several times in one transport tick.
        if (!p.samples.empty() && p.samples.last().toObject()["timeMs"].toDouble()==now) { p.samples[p.samples.size()-1]=sample; }
        else { p.samples.append(sample); }
        publishOverride(timeline_,id,param,p.lastValue);
        return true;
    }
    return consumes(id);
}
void AutomationRecorder::gestureCancel(const QString& id, const QString& param) {
    const auto gesture=std::find_if(gestures_.begin(),gestures_.end(),[&](const auto& g) { return g.track==id && g.param==param; });
    if (gesture==gestures_.end()) { return; }
    auto before=std::move(gesture->before);
    gestures_.erase(gesture);
    for (qsizetype i=passes_.size(); i-- > 0;) {
        if (passes_[i].track!=id || passes_[i].param!=param) { continue; }
        if (before) {
            passes_[i]=std::move(*before);
            if (timeline_) { publishOverride(timeline_,id,param,passes_[i].lastValue); }
        } else { finish(static_cast<int>(i),previousTime_,false); }
        break;
    }
}
void AutomationRecorder::gestureEnd(const QString& id, const QString& param) {
    gestures_.removeIf([&](const auto& g) { return g.track==id && g.param==param; });
    for (qsizetype i=passes_.size(); i-- > 0;) {
        if (passes_[i].track==id && passes_[i].param==param && passes_[i].mode=="touch") {
            finish(static_cast<int>(i),clock_ ? clock_->currentTimeMs() : previousTime_,true);
        }
    }
}
void AutomationRecorder::finish(int index, double end, bool write) {
    auto p=passes_.takeAt(index);
    gestures_.removeIf([&](const auto& g) { return g.track==p.track && g.param==p.param; });
    const auto t=track(p.track);
    if (!write || !timeline_ || t.isEmpty() || t["locked"].toBool()) {
        if (timeline_) { publishOverride(timeline_,p.track,p.param,std::nullopt); }
        return;
    }
    double after=baseFor(timeline_,p.track,p.param);
    for (const auto& item:t["automation"].toArray()) {
        const auto lane=item.toObject(),target=lane["target"].toObject();
        if (target==targetFor(p.param)) {
            after=nt::automation::automationValueAt(lane["points"].toArray(),end+200,after);
            break;
        }
    }
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
    // Publish the bridge before observers can compile the new curve. Its generation
    // distinguishes a stale plan from one that already contains the written pass.
    if (nt::automation::automationModeOf(t)=="off" || p.param.contains(QChar(0x1f))) { publishOverride(timeline_,p.track,p.param,std::nullopt); }
    else { timeline_->releaseMixerOverride(p.track,p.param,end,p.lastValue,after); }
    const bool written=timeline_->applyEdit("writeTrackAutomationPass",{{"trackId",p.track},{"param",p.param},{"target",targetFor(p.param)},{"base",baseFor(timeline_,p.track,p.param)},
        {"pass",QJsonObject{{"startMs",samples.first().toObject()["timeMs"]},{"endMs",samples.last().toObject()["timeMs"]},{"samples",samples}}},
        {"wasWrite",p.mode=="write"}});
    if (!written) { publishOverride(timeline_,p.track,p.param,std::nullopt); }
}
void AutomationRecorder::finishAll(double end, bool write) {
    gestures_.clear();
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
        else if (nt::automation::automationModeOf(t)!=passes_[i].mode) { finish(static_cast<int>(i),clock_ ? clock_->currentTimeMs() : previousTime_,!timeline_->undoStack()->canRedo()); }
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
