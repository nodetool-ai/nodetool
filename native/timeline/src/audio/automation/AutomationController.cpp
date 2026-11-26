#include <cmath>
#include "AutomationController.h"
#include "Automation.h"
#include "AutomationRecorder.h"
#include <QUuid>
#include <algorithm>

AutomationController::AutomationController(QObject* parent) : QObject(parent) {
    connect(this,&AutomationController::changed,this,&AutomationController::refresh);
}
AutomationController::~AutomationController() { cancelDevices(); }
void AutomationController::cancelDevices() {
    const auto devices=previewDevices_;
    for (const auto& device:devices) { cancelDevice(device); }
    if (timeline_) {
        for (const auto& param:previewMixerParams_) { timeline_->setMixerOverride(trackId,param,std::nullopt,master); }
    }
    previewMixerParams_.clear();
}
void AutomationController::previewDevice(const QString& deviceId,const QJsonObject& patch) {
    if (!timeline_ || timeline_->readOnly()) { return; }
    const auto* track=timeline_->timeline().findTrack(trackId.toStdString());
    if (!master && (!track || track->locked)) { return; }
    previewDevices_.insert(deviceId);
    auto* recorder=timeline_->automationRecorder();
    if (!master && recorder->consumes(trackId)) {
        const auto values=patch.contains("params") ? patch["params"].toObject() : patch;
        for (auto it=values.begin();it!=values.end();++it) {
            if (it.value().isDouble()) {
                const auto key=deviceId+QChar(0x1f)+it.key();
                recordingDeviceParams_[deviceId].insert(key);
                recorder->record(trackId,key,it.value().toDouble());
            }
        }
        return;
    }
    timeline_->setDeviceOverride(master ? QString{} : trackId,deviceId,patch);
}
void AutomationController::cancelDevice(const QString& deviceId) {
    const auto recorded=recordingDeviceParams_.take(deviceId);
    if (timeline_) {
        for (const auto& key:recorded) { timeline_->automationRecorder()->gestureCancel(trackId,key); }
    }
    if (timeline_ && previewDevices_.remove(deviceId)) { timeline_->setDeviceOverride(master ? QString{} : trackId,deviceId,{}); }
}
void AutomationController::commitDevice(const QString& deviceId,const QJsonObject& patch,const QString& action,QJsonObject payload) {
    if (!timeline_ || timeline_->readOnly()) { cancelDevice(deviceId); return; }
    auto* recorder=timeline_->automationRecorder();
    const auto values=patch.contains("params") ? patch["params"].toObject() : patch;
    if (!master && recorder->consumes(trackId)) {
        previewDevices_.remove(deviceId);
        for (auto it=values.begin();it!=values.end();++it) {
            if (!it.value().isDouble()) { continue; }
            const auto key=deviceId+QChar(0x1f)+it.key();
            recordingDeviceParams_[deviceId].insert(key);
            recorder->record(trackId,key,it.value().toDouble());
        }
        for (const auto& key:recordingDeviceParams_.take(deviceId)) { recorder->gestureEnd(trackId,key); }
        return;
    }
    const auto snapshot=timeline_->snapshot();
    const auto* track=snapshot->findTrack(trackId.toStdString());
    const auto channel=master ? snapshot->raw["master"].toObject() : track ? track->raw : QJsonObject{};
    bool changed=false, driven=false;
    const auto& parameters=master ? snapshot->masterDeviceParameters : track ? track->deviceParameters : snapshot->masterDeviceParameters;
    for (const auto& p:parameters) {
        const auto name=QString::fromStdString(p.name);
        if (p.deviceId==deviceId.toStdString() && values[name].isDouble() && values[name].toDouble()!=p.base) { changed=true; }
    }
    if (channel["automationMode"]!="off") {
        for (const auto& value:channel["automation"].toArray()) {
            const auto lane=value.toObject(),target=lane["target"].toObject();
            if (lane["enabled"]!=false && target["kind"]=="device" && target["deviceId"]==deviceId && values.contains(target["param"].toString())) { driven=true; }
        }
    }
    if (previewDevices_.remove(deviceId)) { timeline_->setDeviceOverride(master ? QString{} : trackId,deviceId,changed && !driven ? patch : QJsonObject{},changed && !driven); }
    if (!master) { payload["trackId"]=trackId; }
    if (!timeline_->applyEdit(action,payload)) { timeline_->setDeviceOverride(master ? QString{} : trackId,deviceId,{}); }
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
    if (tracks!=tracksState_) { tracksState_=tracks; m_channels.apply(tracks); emit tracksChanged(); }
}
void AutomationController::setTimeline(TimelineModel* timeline) {
    if (timeline_ == timeline) { return; }
    cancelDevices();
    if (timeline_) { disconnect(timeline_, nullptr, this, nullptr); }
    if (history_) { disconnect(history_, nullptr, this, nullptr); }
    timeline_ = timeline;
    history_ = timeline ? timeline->undoStack() : nullptr;
    ++gestureGeneration_;
    if (timeline_) {
        const QPointer<AutomationController> self(this);
        connect(timeline_, &TimelineModel::documentReplaced, this, [self] { if (self) { self->cancelDevices(); ++self->gestureGeneration_; } });
        connect(timeline_, &TimelineSource::sourceChanged, this, [self] {
            if (!self) { return; }
            if (!self->timeline_->pushingCommand()) { self->cancelDevices(); ++self->gestureGeneration_; }
            self->refresh();
        });
        connect(history_, &QUndoStack::indexChanged, this, [self] {
            if (self && self->timeline_ && !self->timeline_->pushingCommand()) { self->cancelDevices(); ++self->gestureGeneration_; }
        });
        connect(timeline_, &QObject::destroyed, this, [self] {
            if (!self) { return; }
            if (self->history_) { disconnect(self->history_, nullptr, self, nullptr); }
            self->history_ = nullptr;
            ++self->gestureGeneration_;
            emit self->changed();
        });
        connect(timeline_, &TimelineModel::timelineChanged, this, &AutomationController::refresh);
    }
    emit changed();
}
void AutomationController::setTrackId(const QString& value) {
    if (trackId == value) { return; }
    cancelDevices();
    trackId = value;
    ++gestureGeneration_;
    emit changed();
}
void AutomationController::setMaster(bool value) {
    if (master == value) { return; }
    cancelDevices();
    master = value;
    ++gestureGeneration_;
    emit changed();
}
quint64 AutomationController::gestureGeneration() {
    // C++ callers can also assign the public channel fields directly.
    if (gestureTrackId_ != trackId || gestureMaster_ != master) {
        gestureTrackId_ = trackId;
        gestureMaster_ = master;
        ++gestureGeneration_;
    }
    return gestureGeneration_;
}
void AutomationController::setGesturePoints(const QString& laneId, const QJsonArray& points, quint64 token) {
    if (!timeline_ || token != gestureGeneration()) { return; }
    setPoints(laneId, points, generation());
}
void AutomationController::createWithGesturePoints(const QJsonObject& target, const QJsonArray& points, quint64 token) {
    if (!timeline_ || token != gestureGeneration()) { return; }
    createWithPoints(target, points, generation());
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
    if (name==u"moveAutomationPoint") { ++pointMoveCalls_; }
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
    if (std::isnan(value)) { previewMixerParams_.remove(param); timeline_->setMixerOverride(trackId,param,std::nullopt,master); return; }
    if (timeline_->readOnly() || !std::isfinite(value) || (param!="volumeDb" && param!="pan")) { return; }
    previewMixerParams_.insert(param);
    timeline_->setMixerOverride(trackId,param,std::clamp(value,param=="pan" ? -1. : -120.,param=="pan" ? 1. : 24.),master);
}
void AutomationController::commitMixer(const QString& param,double value) {
    if (!timeline_ || (master && param!="volumeDb") || timeline_->readOnly() || !std::isfinite(value) || (param!="volumeDb" && param!="pan")) {
        previewMixer(param,std::numeric_limits<double>::quiet_NaN());
        return;
    }
    value=std::clamp(value,param=="pan" ? -1. : -120.,param=="pan" ? 1. : 24.);
    // Publish before edit observers can compile a plan containing the committed value.
    previewMixerParams_.remove(param);
    timeline_->holdMixerOverride(trackId,param,value,master);
    QJsonObject payload{{param=="pan" ? "pan" : "db",value}};
    if (!master) { payload.insert("trackId",trackId); }
    const bool written=timeline_->applyEdit(master ? "setMasterVolume" : param=="pan" ? "setTrackPan" : "setTrackVolume",payload);
    if (!written) { previewMixer(param,std::numeric_limits<double>::quiet_NaN()); }
}
void AutomationController::setPoints(const QString& laneId, const QJsonArray& points, quint64 generation) {
    if (!timeline_ || generation != this->generation()) { return; }
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
bool AutomationMeters::hasSignal() const { return nt::automation::metersHaveSignal(); }

const std::array<float,2>& AutomationMeters::read(const QString& channelId) const {
    constexpr qint64 kFrameMs = 16;
    const qint64 now=clock_.elapsed();
    if (now-lastPrunedMs_>=kFrameMs) {
        for (auto i=readings_.begin();i!=readings_.end();) {
            if (!nt::automation::hasMeter(i.key().toStdString())) { i=readings_.erase(i); } else { ++i; }
        }
        lastPrunedMs_=now;
    }
    if (!nt::automation::hasMeter(channelId.toStdString())) {
        readings_.remove(channelId);
        static const std::array<float,2> empty{};
        return empty;
    }
    Reading& last=readings_[channelId];
    if (now - last.atMs >= kFrameMs) {
        const auto peaks=nt::automation::takeMeter(channelId.toStdString());
        last.peaks = {peaks[0],peaks[1]};
        last.atMs = now;
    }
    return last.peaks;
}

double AutomationMeters::peak(const QString& channelId, int channel) const {
    return read(channelId)[channel==1 ? 1 : 0];
}

QVariantList AutomationMeters::take(const QString& channelId) const {
    const auto& frame=read(channelId);
    return {frame[0],frame[1]};
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
    if (!timeline_ || generation!=this->generation()) { return; }
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

void MixerChannelModel::apply(const QJsonArray& tracks) {
    QStringList next;
    for (const auto& value : tracks) {
        const auto track=value.toObject();
        if (track["type"]=="audio" || track["type"]=="midi") { next.append(track["id"].toString()); }
    }
    if (next==m_ids) { return; }
    const QSet<QString> wanted(next.begin(),next.end());
    for (int i=static_cast<int>(m_ids.size())-1; i>=0;) {
        if (wanted.contains(m_ids[i])) { --i; continue; }
        int first=i;
        while (first>0 && !wanted.contains(m_ids[first-1])) { --first; }
        beginRemoveRows({},first,i); m_ids.remove(first,i-first+1); endRemoveRows(); i=first-1;
    }
    QSet<QString> existing(m_ids.begin(),m_ids.end());
    QStringList added;
    for (const auto& id : next) { if (!existing.contains(id)) { added.append(id); } }
    if (!added.isEmpty()) {
        const int start=static_cast<int>(m_ids.size());
        beginInsertRows({},start,start+static_cast<int>(added.size())-1);
        m_ids.append(added); endInsertRows();
    }
    if (m_ids==next) { return; }
    // Qt Quick preserves the viewport and delegates for row moves.
    for (int i=0;i<next.size();++i) {
        if (m_ids[i]==next[i]) { continue; }
        const int from=static_cast<int>(m_ids.indexOf(next[i],i+1));
        int count=1;
        while (from+count<m_ids.size() && i+count<next.size() && m_ids[from+count]==next[i+count]) { ++count; }
        beginMoveRows({},from,from+count-1,{},i);
        std::rotate(m_ids.begin()+i,m_ids.begin()+from,m_ids.begin()+from+count);
        endMoveRows();
        i+=count-1;
    }
}
