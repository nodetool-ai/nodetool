#include <cmath>
#include "AutomationController.h"
#include "Automation.h"
#include <QUuid>
#include <algorithm>

AutomationController::AutomationController(QObject* parent) : QObject(parent) {
    connect(this,&AutomationController::changed,this,&AutomationController::refresh);
}
void AutomationController::refresh() {
    QJsonObject channel;
    QJsonArray tracks;
    if (timeline_) {
        tracks=timeline_->timeline().raw["tracks"].toArray();
        if (master) { channel=timeline_->timeline().raw["master"].toObject(); }
        else if (const auto* track=timeline_->timeline().findTrack(trackId.toStdString())) { channel=track->raw; }
    }
    if (channel!=channelState_) { channelState_=channel; emit channelChanged(); }
    if (tracks!=tracksState_) { tracksState_=tracks; emit tracksChanged(); }
}
void AutomationController::setTimeline(TimelineModel* timeline) {
    if (timeline_ == timeline) { return; }
    if (timeline_) { disconnect(timeline_, nullptr, this, nullptr); }
    timeline_ = timeline;
    if (timeline_) { connect(timeline_, &TimelineModel::timelineChanged, this, &AutomationController::refresh); connect(timeline_, &TimelineSource::sourceChanged, this, &AutomationController::refresh); }
    emit changed();
}
QVariantMap AutomationController::channel() const {
    if (!timeline_) { return {}; }
    if (master) { return timeline_->timeline().raw["master"].toObject().toVariantMap(); }
    const auto* track = timeline_->timeline().findTrack(trackId.toStdString());
    return track ? track->raw.toVariantMap() : QVariantMap{};
}
QVariantList AutomationController::tracks() const {
    if (!timeline_) { return {}; }
    return timeline_->timeline().raw["tracks"].toArray().toVariantList();
}
QVariant AutomationController::call(const QString& name, const QJsonArray& args) const {
    return nt::automation::call(name, args).toVariant();
}
QString AutomationController::newId() const { return QUuid::createUuid().toString(QUuid::Id128); }
quint64 AutomationController::generation() const { return timeline_ ? timeline_->documentGeneration() : 0; }
void AutomationController::edit(const QString& action, QJsonObject payload) {
    if (!timeline_) { return; }
    if (!master) { payload["trackId"] = trackId; }
    timeline_->applyEdit(action, payload);
}
void AutomationController::previewMixer(const QString& param, double value) {
    if (!timeline_ || (master && param!="volumeDb")) { return; }
    if (std::isnan(value)) { timeline_->setMixerOverride(trackId,param,std::nullopt,master); return; }
    if (timeline_->readOnly() || !std::isfinite(value) || (param!="volumeDb" && param!="pan")) { return; }
    timeline_->setMixerOverride(trackId,param,std::clamp(value,param=="pan" ? -1. : -120.,param=="pan" ? 1. : 24.),master);
}
void AutomationController::commitMixer(const QString& param,double value) {
    if (!timeline_ || (master && param!="volumeDb") || timeline_->readOnly() || !std::isfinite(value) || (param!="volumeDb" && param!="pan")) {
        previewMixer(param,std::numeric_limits<double>::quiet_NaN());
        return;
    }
    value=std::clamp(value,param=="pan" ? -1. : -120.,param=="pan" ? 1. : 24.);
    // Publish before edit observers can compile a plan containing the committed value.
    timeline_->holdMixerOverride(trackId,param,value,master);
    QJsonObject payload{{param=="pan" ? "pan" : "db",value}};
    if (!master) { payload.insert("trackId",trackId); }
    const bool written=timeline_->applyEdit(master ? "setMasterVolume" : param=="pan" ? "setTrackPan" : "setTrackVolume",payload);
    if (!written) { previewMixer(param,std::numeric_limits<double>::quiet_NaN()); }
}
void AutomationController::setPoints(const QString& laneId, const QJsonArray& points, quint64 generation) {
    if (!timeline_ || generation != timeline_->documentGeneration()) { return; }
    patchLane(laneId, {{"points", points}});
}
void AutomationController::addLane(const QJsonObject& target) {
    const auto track = QJsonObject::fromVariantMap(channel());
    if (!nt::automation::trackAcceptsAutomationTarget(track, target)) { return; }
    auto lanes = track["automation"].toArray();
    for (const auto& lane : lanes) {
        if (nt::automation::automationTargetKey(lane.toObject()["target"].toObject()) == nt::automation::automationTargetKey(target)) { return; }
    }
    lanes.append(QJsonObject{{"id",newId()},{"target",target},{"points",QJsonArray{}}});
    edit("setTrackAutomation", {{"automation",lanes}});
}
void AutomationController::patchLane(const QString& laneId, const QJsonObject& patch, bool remove) {
    QJsonArray lanes;
    for (const auto& value : QJsonObject::fromVariantMap(channel())["automation"].toArray()) {
        auto lane = value.toObject();
        if (lane["id"] == laneId) {
            if (remove) { continue; }
            for (auto it = patch.begin(); it != patch.end(); ++it) { lane[it.key()] = it.value(); }
        }
        lanes.append(lane);
    }
    edit("setTrackAutomation", {{"automation",lanes}});
}

#include "MeterReadings.h"
QVariantList AutomationMeters::take(const QString& channelId) const {
    constexpr qint64 kFrameMs = 16;
    const qint64 now=clock_.elapsed();
    if (now-lastPrunedMs_>=kFrameMs) {
        for (auto i=readings_.begin();i!=readings_.end();) {
            if (!nt::automation::hasMeter(i.key().toStdString())) { i=readings_.erase(i); } else { ++i; }
        }
        lastPrunedMs_=now;
    }
    if (!nt::automation::hasMeter(channelId.toStdString())) { readings_.remove(channelId); return {0.f,0.f}; }
    Reading& last=readings_[channelId];
    if (now - last.atMs >= kFrameMs) {
        const auto peaks=nt::automation::takeMeter(channelId.toStdString());
        last.peaks = {peaks[0],peaks[1]};
        last.atMs = now;
    }
    return last.peaks;
}

bool AutomationController::clipNameAt(double timeMs, double minimumDurationMs) const {
    if (!timeline_) { return false; }
    const auto id=trackId.toStdString();
    for (const auto& clip : timeline_->timeline().clips) {
        if (clip.trackId==id && clip.startMs<=timeMs && clip.startMs+std::max(clip.durationMs,minimumDurationMs)>=timeMs) { return true; }
    }
    return false;
}
void AutomationController::createWithPoints(const QJsonObject& target, const QJsonArray& points, quint64 generation) {
    if (!timeline_ || generation!=timeline_->documentGeneration()) { return; }
    const auto t=QJsonObject::fromVariantMap(channel());
    if (!nt::automation::trackAcceptsAutomationTarget(t,target)) { return; }
    auto lanes=t["automation"].toArray();
    for (const auto& v : lanes) { if (nt::automation::automationTargetKey(v.toObject()["target"].toObject())==nt::automation::automationTargetKey(target)) { return; } }
    lanes.append(QJsonObject{{"id",newId()},{"target",target},{"points",points}});
    edit("setTrackAutomation",{{"automation",lanes}});
}

#include "scene/Animation.h"
void AutomationReadout::setTimeline(TimelineModel* next) {
    if (timeline_==next) { return; }
    if (timeline_) { disconnect(timeline_,nullptr,this,nullptr); }
    timeline_=next;
    if (timeline_) {
        connect(timeline_,&TimelineModel::timelineChanged,this,&AutomationReadout::compile);
        connect(timeline_,&TimelineSource::sourceChanged,this,&AutomationReadout::compile);
        connect(timeline_,&TimelineModel::mixerOverrideChanged,this,&AutomationReadout::overrideChanged);
    }
    compile(); emit sourceChanged();
}
void AutomationReadout::setClock(PlaybackClock* next) {
    if (clock_==next) { return; }
    if (clock_) { disconnect(clock_,nullptr,this,nullptr); }
    clock_=next;
    if (clock_) { connect(clock_,&PlaybackClock::timeChanged,this,&AutomationReadout::update); }
    update(); emit sourceChanged();
}
void AutomationReadout::setTrackId(const QString& next) { if (trackId_!=next) { trackId_=next; trackState_={}; compile(); emit sourceChanged(); } }
void AutomationReadout::setTarget(const QJsonObject& next) { if (target_!=next) { target_=next; trackState_={}; compile(); emit sourceChanged(); } }
void AutomationReadout::compile() {
    const auto* track=timeline_ ? timeline_->timeline().findTrack(trackId_.toStdString()) : nullptr;
    if (track && track->raw==trackState_) { update(); return; }
    trackState_=track ? track->raw : QJsonObject{};
    points_.clear(); base_=0;
    if (!track) { update(); return; }
    const auto kind=target_["kind"].toString(), param=target_["param"].toString();
    if (kind=="mixer") { base_=track->raw[param].toDouble(); }
    else if (kind=="device" && target_["deviceId"]=="instrument") {
        for (const auto& item:nt::automation::instrumentAutomationSpecs(track->raw["instrument"].toObject())) {
            const auto spec=item.toObject();
            if (spec["target"].toObject()["param"]==param) { base_=spec["value"].toDouble(); break; }
        }
    } else if (kind=="device") {
        for (const auto& e : track->raw["effects"].toArray()) { if (e.toObject()["id"]==target_["deviceId"]) { base_=e.toObject()[param].toDouble(nt::automation::trackEffectDefaults(e.toObject()["type"].toString())[param].toDouble()); } }
    } else {
        const auto property=target_["property"].toString();
        base_=(property=="opacity" || property=="scale" || property=="contrast" || property=="saturation") ? 1 : 0;
    }
    if (track->raw["automationMode"]!="off") {
        for (const auto& v : track->raw["automation"].toArray()) {
            const auto lane=v.toObject();
            if (lane["enabled"]==false || nt::automation::automationTargetKey(lane["target"].toObject())!=nt::automation::automationTargetKey(target_)) { continue; }
            for (const auto& p : lane["points"].toArray()) {
                const auto point=p.toObject(); points_.push_back({point["timeMs"].toDouble(),point["value"].toDouble(),point["easing"].toString("linear").toStdString()});
            }
            break;
        }
    }
    update();
}
void AutomationReadout::update() {
    double next=base_;
    const auto live=timeline_ && target_["kind"]=="mixer" ? timeline_->mixerOverrideValue(trackId_,target_["param"].toString()) : std::nullopt;
    if (live) { next=*live; }
    else if (!points_.empty()) {
        const double time=clock_ ? clock_->currentTimeMs() : 0;
        const auto b=std::lower_bound(points_.begin(),points_.end(),time,[](const Point& p,double t) { return p.time<t; });
        if (time<=points_.front().time) { next=points_.front().value; }
        else if (time>=points_.back().time || b==points_.end()) { next=points_.back().value; }
        else { const auto& a=*(b-1); next=a.value+(b->value-a.value)*nt::scene::ease(b->easing,(time-a.time)/(b->time-a.time)); }
    }
    if (next!=value_) { value_=next; emit valueChanged(); }
}
void AutomationReadout::overrideChanged(const QString& trackId, const QString& param) {
    if (trackId==trackId_ && target_["kind"]=="mixer" && target_["param"]==param) { update(); }
}

double AutomationController::laneValueAt(const QString& laneId, double timeMs, double fallback) const {
    for (const auto& value : channelState_["automation"].toArray()) {
        const auto lane=value.toObject();
        if (lane["id"]==laneId) { return nt::automation::automationValueAt(lane["points"].toArray(),timeMs,fallback); }
    }
    return fallback;
}

QJsonArray AutomationParameters::instrumentTargets(const QJsonObject& instrument) const { return nt::automation::instrumentAutomationSpecs(instrument); }
QJsonObject AutomationParameters::effectDefaults(const QString& type) const { return nt::automation::trackEffectDefaults(type); }
